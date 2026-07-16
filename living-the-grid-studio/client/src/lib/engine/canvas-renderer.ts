/**
 * canvas-renderer.ts — Canvas guide rendering
 *
 * Renders a GridDocument onto an HTML Canvas element as a
 * paint-by-numbers pixel guide. Supports:
 *   - Color fill rendering
 *   - Grid line overlay
 *   - Paint-by-numbers labels
 *   - Color highlighting (hover to highlight all cells of a color)
 *   - Zoom and pan
 */

import type { GridDocument } from "./grid";
import { getCell, getColorUsageCounts, takeGridMutationHint } from "./grid";
import { TOMODACHI_PALETTE, type PaletteColor } from "./palette";
import { formatCountLabel } from "../format-count";

const CANVAS_SANS_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif';
const CANVAS_MONO_FONT =
  'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace';

/** Rendering options */
export interface RenderOptions {
  /** Size of each cell in pixels */
  cellSize: number;
  /** Show grid lines */
  showGrid: boolean;
  /** Draw a boundary every N cells. One renders every cell boundary. */
  gridStep: number;
  /** Show paint-by-numbers labels */
  showLabels: boolean;
  /** Color ID to highlight (all cells of this color get a border) */
  highlightColorId: string | null;
  /** Zoom level (1.0 = 100%) */
  zoom: number;
  /** Pan offset in pixels */
  panX: number;
  panY: number;
  /** Grid line color */
  gridColor: string;
  /** Grid line width */
  gridWidth: number;
  /** Stronger section boundary interval. Set to zero to disable. */
  majorGridStep: number;
  /** Stronger section boundary color. */
  majorGridColor: string;
  /** Stronger section boundary width. */
  majorGridWidth: number;
  /** Device pixel ratio used to snap grid strips to physical pixels. */
  devicePixelRatio: number;
  /** Optional paper color behind the editable grid only. */
  gridBackground: string | null;
  /** Optional checkerboard behind transparent project cells. */
  checkerboard: "none" | "warm" | "light" | "dark";
  /** Optional browser-local image aligned with the authoritative grid. */
  referenceImage: CanvasImageSource | null;
  /** Paint order for the browser-local image; split clips it to the left half. */
  referenceMode: "under" | "over" | "split";
  referenceOpacity: number;
  referenceFlipped: boolean;
  referenceFit: "contain" | "cover";
  /** Label font size (auto-scaled if 0) */
  labelFontSize: number;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  cellSize: 16,
  showGrid: true,
  gridStep: 1,
  showLabels: false,
  highlightColorId: null,
  zoom: 1.0,
  panX: 0,
  panY: 0,
  gridColor: "rgba(197, 213, 228, 0.5)", // pale blue grid lines
  gridWidth: 0.5,
  majorGridStep: 8,
  majorGridColor: "rgba(32, 56, 73, 0.76)",
  majorGridWidth: 1.5,
  devicePixelRatio: 1,
  gridBackground: null,
  checkerboard: "none",
  referenceImage: null,
  referenceMode: "under",
  referenceOpacity: 0.45,
  referenceFlipped: false,
  referenceFit: "contain",
  labelFontSize: 0,
};

export const MIN_VISIBLE_GRID_CELL_SIZE = 6;

export type CanvasBackground = "paper" | "light" | "dark";

/** Local-only guide density. Changing this never mutates the grid document. */
export type GridDensity = "off" | "coarse" | "medium" | "cell";

const GRID_DENSITY_STEPS: Readonly<
  Record<Exclude<GridDensity, "off">, number>
> = {
  coarse: 8,
  medium: 4,
  cell: 1,
};

/** Resolve a user-facing density preset to its cell interval. */
export function gridStepForDensity(density: GridDensity): number | null {
  return density === "off" ? null : GRID_DENSITY_STEPS[density];
}

export function shouldRenderGridLines(
  showGrid: boolean,
  cellSize: number,
  zoom: number,
  gridStep = 1,
): boolean {
  return (
    showGrid &&
    cellSize * zoom * Math.max(1, Math.floor(gridStep)) >=
      MIN_VISIBLE_GRID_CELL_SIZE
  );
}

/** Resolve a color ID to its hex value */
function colorIdToHex(colorId: string): string {
  const c = TOMODACHI_PALETTE.find((p) => p.id === colorId);
  return c ? c.hex : colorId; // fallback to raw value if not found
}

const cellRasterCache = new WeakMap<GridDocument, HTMLCanvasElement>();
const checkerTileCache = new WeakMap<object, Map<string, HTMLCanvasElement>>();

function parseRasterColor(
  value: string,
): [red: number, green: number, blue: number, alpha: number] | null {
  const clean = value.trim().replace(/^#/, "");
  if (!/^[0-9a-f]+$/i.test(clean)) return null;
  if (clean.length === 3 || clean.length === 4) {
    return [
      Number.parseInt(clean[0] + clean[0], 16),
      Number.parseInt(clean[1] + clean[1], 16),
      Number.parseInt(clean[2] + clean[2], 16),
      clean.length === 4 ? Number.parseInt(clean[3] + clean[3], 16) : 255,
    ];
  }
  if (clean.length === 6 || clean.length === 8) {
    return [
      Number.parseInt(clean.slice(0, 2), 16),
      Number.parseInt(clean.slice(2, 4), 16),
      Number.parseInt(clean.slice(4, 6), 16),
      clean.length === 8 ? Number.parseInt(clean.slice(6, 8), 16) : 255,
    ];
  }
  return null;
}

/**
 * Build one native-resolution transparent bitmap for an immutable document.
 *
 * A canonical starter can contain tens of thousands of painted cells. Calling
 * `fillRect` once per cell made a single 4px stroke repaint 30k+ rectangles.
 * The bitmap path still validates every palette value, but turns the visible
 * artwork into one nearest-neighbour `drawImage`. The WeakMap follows document
 * history without retaining discarded in-stroke documents.
 */
function getCellRaster(
  ctx: CanvasRenderingContext2D,
  doc: GridDocument,
): HTMLCanvasElement | null {
  const cached = cellRasterCache.get(doc);
  if (cached) {
    // A cached bitmap no longer needs its base-document delta. Consume it so a
    // rendered history entry cannot retain discarded in-stroke documents.
    takeGridMutationHint(doc);
    return cached;
  }

  // A real HTMLCanvasElement always exposes its own document. Avoid falling
  // back to a global document for test doubles or OffscreenCanvas-like
  // contexts: that can accidentally reuse the destination canvas as its own
  // raster source.
  const ownerDocument = (ctx.canvas as HTMLCanvasElement).ownerDocument;
  if (!ownerDocument?.createElement) return null;

  const mutation = takeGridMutationHint(doc);
  if (mutation) {
    const baseRaster = getCellRaster(ctx, mutation.base);
    if (baseRaster) {
      // Metadata-only canonicalization can share the immutable source bitmap.
      if (mutation.updates.length === 0) {
        cellRasterCache.set(doc, baseRaster);
        return baseRaster;
      }

      const incrementalCanvas = ownerDocument.createElement("canvas");
      incrementalCanvas.width = doc.width;
      incrementalCanvas.height = doc.height;
      const incrementalContext = incrementalCanvas.getContext("2d");
      if (
        incrementalContext &&
        typeof incrementalContext.drawImage === "function" &&
        typeof incrementalContext.clearRect === "function" &&
        typeof incrementalContext.fillRect === "function"
      ) {
        incrementalContext.imageSmoothingEnabled = false;
        incrementalContext.drawImage(baseRaster, 0, 0);
        let valid = true;
        for (const update of mutation.updates) {
          const x = update.index % doc.width;
          const y = Math.floor(update.index / doc.width);
          incrementalContext.clearRect(x, y, 1, 1);
          if (!update.colorId) continue;
          const value = colorIdToHex(update.colorId);
          if (!parseRasterColor(value)) {
            valid = false;
            break;
          }
          incrementalContext.fillStyle = value;
          incrementalContext.fillRect(x, y, 1, 1);
        }
        if (valid) {
          cellRasterCache.set(doc, incrementalCanvas);
          return incrementalCanvas;
        }
      }
    }
  }

  const canvas = ownerDocument.createElement("canvas");
  canvas.width = doc.width;
  canvas.height = doc.height;
  const rasterContext = canvas.getContext("2d");
  if (
    !rasterContext ||
    typeof rasterContext.createImageData !== "function" ||
    typeof rasterContext.putImageData !== "function"
  ) {
    return null;
  }

  const image = rasterContext.createImageData(doc.width, doc.height);
  const colors = new Map<string, ReturnType<typeof parseRasterColor>>();
  for (let index = 0; index < doc.cells.length; index += 1) {
    const colorId = doc.cells[index];
    if (!colorId) continue;
    let color = colors.get(colorId);
    if (color === undefined) {
      color = parseRasterColor(colorIdToHex(colorId));
      colors.set(colorId, color);
    }
    // Unknown raw colors retain the compatibility fillRect renderer instead
    // of silently changing their appearance.
    if (!color) return null;
    const offset = index * 4;
    image.data[offset] = color[0];
    image.data[offset + 1] = color[1];
    image.data[offset + 2] = color[2];
    image.data[offset + 3] = color[3];
  }
  rasterContext.putImageData(image, 0, 0);
  cellRasterCache.set(doc, canvas);
  return canvas;
}

/** Determine if a color is "light" (needs dark label text) */
function isLightColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  // Relative luminance
  return 0.299 * r + 0.587 * g + 0.114 * b > 128;
}

function imageDimensions(image: CanvasImageSource): {
  height: number;
  width: number;
} {
  const candidate = image as {
    height?: number;
    naturalHeight?: number;
    naturalWidth?: number;
    videoHeight?: number;
    videoWidth?: number;
    width?: number;
  };
  return {
    height:
      candidate.naturalHeight ?? candidate.videoHeight ?? candidate.height ?? 1,
    width:
      candidate.naturalWidth ?? candidate.videoWidth ?? candidate.width ?? 1,
  };
}

function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scaledSize: number,
  mode: Exclude<RenderOptions["checkerboard"], "none">,
  visibleX: number,
  visibleY: number,
  visibleWidth: number,
  visibleHeight: number,
): void {
  const colors =
    mode === "dark"
      ? (["#33424b", "#465963"] as const)
      : mode === "warm"
        ? (["#fffaf0", "#eee5d6"] as const)
        : (["#f8fafc", "#dce5e8"] as const);
  const tileSize = Math.max(8, Math.min(24, Math.round(scaledSize * 2)));
  const left = Math.max(0, Math.min(width, visibleX));
  const top = Math.max(0, Math.min(height, visibleY));
  const right = Math.max(
    left,
    Math.min(width, visibleX + Math.max(0, visibleWidth)),
  );
  const bottom = Math.max(
    top,
    Math.min(height, visibleY + Math.max(0, visibleHeight)),
  );
  if (right <= left || bottom <= top) return;

  const ownerDocument = (ctx.canvas as HTMLCanvasElement).ownerDocument;
  if (ownerDocument?.createElement && typeof ctx.createPattern === "function") {
    let tiles = checkerTileCache.get(ownerDocument);
    if (!tiles) {
      tiles = new Map();
      checkerTileCache.set(ownerDocument, tiles);
    }
    const key = `${mode}:${tileSize}`;
    let tile = tiles.get(key);
    if (!tile) {
      const candidate = ownerDocument.createElement("canvas");
      candidate.width = tileSize * 2;
      candidate.height = tileSize * 2;
      const tileContext = candidate.getContext("2d");
      if (tileContext) {
        tileContext.fillStyle = colors[0];
        tileContext.fillRect(0, 0, candidate.width, candidate.height);
        tileContext.fillStyle = colors[1];
        tileContext.fillRect(tileSize, 0, tileSize, tileSize);
        tileContext.fillRect(0, tileSize, tileSize, tileSize);
        tile = candidate;
        tiles.set(key, tile);
      }
    }
    if (tile) {
      const pattern = ctx.createPattern(tile, "repeat");
      if (pattern) {
        ctx.save();
        ctx.fillStyle = pattern;
        ctx.fillRect(left, top, right - left, bottom - top);
        ctx.restore();
        return;
      }
    }
  }

  ctx.fillStyle = colors[0];
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.fillStyle = colors[1];
  const firstColumn = Math.floor(left / tileSize);
  const finalColumn = Math.ceil(right / tileSize);
  const firstRow = Math.floor(top / tileSize);
  const finalRow = Math.ceil(bottom / tileSize);
  for (let row = firstRow; row < finalRow; row++) {
    for (let column = firstColumn; column < finalColumn; column++) {
      if ((column + row) % 2 === 1) {
        const tileLeft = Math.max(left, column * tileSize);
        const tileTop = Math.max(top, row * tileSize);
        const tileRight = Math.min(right, (column + 1) * tileSize);
        const tileBottom = Math.min(bottom, (row + 1) * tileSize);
        ctx.fillRect(
          tileLeft,
          tileTop,
          tileRight - tileLeft,
          tileBottom - tileTop,
        );
      }
    }
  }
}

function normalizedDevicePixelRatio(devicePixelRatio: number): number {
  return Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
}

function drawReference(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number,
  flipped: boolean,
  fit: RenderOptions["referenceFit"],
  mode: RenderOptions["referenceMode"],
): void {
  const source = imageDimensions(image);
  const scale =
    fit === "cover"
      ? Math.max(canvasWidth / source.width, canvasHeight / source.height)
      : Math.min(canvasWidth / source.width, canvasHeight / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const x = (canvasWidth - width) / 2;
  const y = (canvasHeight - height) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(
    0,
    0,
    mode === "split" ? canvasWidth / 2 : canvasWidth,
    canvasHeight,
  );
  ctx.clip();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  if (flipped) {
    ctx.translate(canvasWidth, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();

  if (mode === "split") {
    const dividerX = canvasWidth / 2;
    ctx.save();
    ctx.fillStyle = "#fffaf0";
    ctx.fillRect(dividerX - 2, 0, 4, canvasHeight);
    ctx.fillStyle = "#17384a";
    ctx.fillRect(dividerX - 1, 0, 2, canvasHeight);
    ctx.restore();
  }
}

/** Snap a grid strip edge to a physical pixel boundary. */
export function snapGridStrip(
  coordinate: number,
  devicePixelRatio: number,
): number {
  const dpr = normalizedDevicePixelRatio(devicePixelRatio);
  return Math.round(coordinate * dpr) / dpr;
}

function drawGridStrips(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scaledSize: number,
  step: number,
  color: string,
  lineWidth: number,
  devicePixelRatio: number,
  skipEvery = 0,
): void {
  if (lineWidth <= 0 || color === "transparent") return;
  const safeStep = Math.max(1, Math.floor(step));
  const dpr = normalizedDevicePixelRatio(devicePixelRatio);
  const safeWidth = Math.max(1 / dpr, Math.round(lineWidth * dpr) / dpr);
  ctx.fillStyle = color;

  for (let cell = safeStep; cell * scaledSize < width; cell += safeStep) {
    if (skipEvery > 0 && cell % skipEvery === 0) continue;
    const x = snapGridStrip(
      cell * scaledSize - safeWidth / 2,
      devicePixelRatio,
    );
    ctx.fillRect(x, 0, safeWidth, height);
  }
  for (let cell = safeStep; cell * scaledSize < height; cell += safeStep) {
    if (skipEvery > 0 && cell % skipEvery === 0) continue;
    const y = snapGridStrip(
      cell * scaledSize - safeWidth / 2,
      devicePixelRatio,
    );
    ctx.fillRect(0, y, width, safeWidth);
  }
}

function drawGridBoundary(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  lineWidth: number,
  devicePixelRatio: number,
): void {
  if (lineWidth <= 0 || color === "transparent") return;
  const dpr = normalizedDevicePixelRatio(devicePixelRatio);
  const safeWidth = Math.max(1 / dpr, Math.round(lineWidth * dpr) / dpr);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, safeWidth);
  ctx.fillRect(0, height - safeWidth, width, safeWidth);
  ctx.fillRect(0, 0, safeWidth, height);
  ctx.fillRect(width - safeWidth, 0, safeWidth, height);
}

/**
 * Render a GridDocument onto a canvas context.
 */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  doc: GridDocument,
  options: Partial<RenderOptions> = {},
): void {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const { cellSize, zoom, panX, panY } = opts;
  const scaledSize = cellSize * zoom;

  // Build the frequency label map only when labels will actually be painted.
  // Counting and sorting a 256×256 document on every freehand sample was a
  // measurable source of brush lag even with labels disabled.
  const labelMap = new Map<string, number>();
  if (opts.showLabels) {
    const counts = getColorUsageCounts(doc);
    const sortedColors = Array.from(counts.keys()).sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
    );
    sortedColors.forEach((id, i) => labelMap.set(id, i + 1));
  }

  // Clear canvas
  const canvasW = doc.width * scaledSize;
  const canvasH = doc.height * scaledSize;
  const dpr = normalizedDevicePixelRatio(opts.devicePixelRatio);
  const viewportWidth = ctx.canvas.width > 0 ? ctx.canvas.width / dpr : canvasW;
  const viewportHeight =
    ctx.canvas.height > 0 ? ctx.canvas.height / dpr : canvasH;
  const visibleArtboardX = Math.max(0, Math.min(canvasW, -panX));
  const visibleArtboardY = Math.max(0, Math.min(canvasH, -panY));
  const visibleArtboardRight = Math.max(
    visibleArtboardX,
    Math.min(canvasW, viewportWidth - panX),
  );
  const visibleArtboardBottom = Math.max(
    visibleArtboardY,
    Math.min(canvasH, viewportHeight - panY),
  );
  const visibleStartX = Math.max(
    0,
    Math.min(doc.width, Math.floor(-panX / scaledSize)),
  );
  const visibleEndX = Math.max(
    visibleStartX,
    Math.min(doc.width, Math.ceil((viewportWidth - panX) / scaledSize)),
  );
  const visibleStartY = Math.max(
    0,
    Math.min(doc.height, Math.floor(-panY / scaledSize)),
  );
  const visibleEndY = Math.max(
    visibleStartY,
    Math.min(doc.height, Math.ceil((viewportHeight - panY) / scaledSize)),
  );
  // CanvasViewer installs a DPR transform before rendering. clearRect therefore
  // takes logical CSS pixels, including for fractional DPR values below one.
  ctx.clearRect(0, 0, viewportWidth, viewportHeight);

  ctx.save();
  ctx.translate(panX, panY);

  if (opts.gridBackground) {
    ctx.fillStyle = opts.gridBackground;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  if (opts.checkerboard !== "none") {
    drawCheckerboard(
      ctx,
      canvasW,
      canvasH,
      scaledSize,
      opts.checkerboard,
      visibleArtboardX,
      visibleArtboardY,
      visibleArtboardRight - visibleArtboardX,
      visibleArtboardBottom - visibleArtboardY,
    );
  }

  // A browser-local tracing sheet belongs below the project paint. Keeping
  // this ordering explicit makes fresh strokes remain fully opaque and avoids
  // tinting completed artwork while the source is visible.
  if (opts.referenceImage && opts.referenceMode === "under") {
    drawReference(
      ctx,
      opts.referenceImage,
      canvasW,
      canvasH,
      opts.referenceOpacity,
      opts.referenceFlipped,
      opts.referenceFit,
      opts.referenceMode,
    );
  }

  // Draw the immutable artwork as one native bitmap whenever the browser
  // exposes a real canvas context. Test doubles and unusual raw-color imports
  // retain the bounded visible-cell compatibility path.
  const cellRaster = getCellRaster(ctx, doc);
  if (cellRaster) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cellRaster, 0, 0, canvasW, canvasH);
  } else {
    for (let y = visibleStartY; y < visibleEndY; y++) {
      for (let x = visibleStartX; x < visibleEndX; x++) {
        const colorId = getCell(doc, x, y);
        const px = x * scaledSize;
        const py = y * scaledSize;

        if (colorId) {
          ctx.fillStyle = colorIdToHex(colorId);
          ctx.fillRect(px, py, scaledSize, scaledSize);
        }
      }
    }
  }

  // Comparison layers belong above project paint but below every editing aid.
  // Keeping this inside renderGrid ensures fine-cell lines, highlights, and
  // paint-by-number labels remain readable even at high reference opacity.
  if (
    opts.referenceImage &&
    (opts.referenceMode === "over" || opts.referenceMode === "split")
  ) {
    drawReference(
      ctx,
      opts.referenceImage,
      canvasW,
      canvasH,
      opts.referenceOpacity,
      opts.referenceFlipped,
      opts.referenceFit,
      opts.referenceMode,
    );
  }

  // Draw grid lines
  if (opts.showGrid) {
    const gridStep = Math.max(1, Math.floor(opts.gridStep));
    const majorStep = Math.max(0, Math.floor(opts.majorGridStep));

    // When both cadences are the same (Sections / 8 cells), draw exactly one
    // layer. Double-painting that boundary recreates the fuzzy duplicate-grid
    // defect this renderer is designed to prevent.
    if (majorStep !== gridStep) {
      drawGridStrips(
        ctx,
        canvasW,
        canvasH,
        scaledSize,
        gridStep,
        opts.gridColor,
        opts.gridWidth,
        opts.devicePixelRatio,
        majorStep > gridStep ? majorStep : 0,
      );
    }

    if (majorStep > 0) {
      drawGridStrips(
        ctx,
        canvasW,
        canvasH,
        scaledSize,
        majorStep,
        opts.majorGridColor,
        opts.majorGridWidth,
        opts.devicePixelRatio,
      );
    }

    drawGridBoundary(
      ctx,
      canvasW,
      canvasH,
      majorStep > 0 ? opts.majorGridColor : opts.gridColor,
      majorStep > 0 ? opts.majorGridWidth : opts.gridWidth,
      opts.devicePixelRatio,
    );
  }

  // Draw highlight
  if (opts.highlightColorId) {
    ctx.strokeStyle = "#D94F4F";
    ctx.lineWidth = 2;
    for (let y = visibleStartY; y < visibleEndY; y++) {
      for (let x = visibleStartX; x < visibleEndX; x++) {
        if (getCell(doc, x, y) === opts.highlightColorId) {
          if (scaledSize >= 4) {
            ctx.strokeRect(
              x * scaledSize + 1,
              y * scaledSize + 1,
              scaledSize - 2,
              scaledSize - 2,
            );
          } else {
            // A 1–2px cell cannot contain an inset stroke; a translucent tint
            // stays valid and avoids zero/negative stroke rectangles.
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = "#D94F4F";
            ctx.fillRect(
              x * scaledSize,
              y * scaledSize,
              scaledSize,
              scaledSize,
            );
            ctx.restore();
          }
        }
      }
    }
  }

  // Draw labels
  if (opts.showLabels && scaledSize >= 12) {
    const fontSize = opts.labelFontSize || Math.max(8, scaledSize * 0.45);
    ctx.font = `${fontSize}px ${CANVAS_MONO_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let y = visibleStartY; y < visibleEndY; y++) {
      for (let x = visibleStartX; x < visibleEndX; x++) {
        const colorId = getCell(doc, x, y);
        if (!colorId) continue;
        const label = labelMap.get(colorId);
        if (label === undefined) continue;

        const hex = colorIdToHex(colorId);
        ctx.fillStyle = isLightColor(hex) ? "#333333" : "#FFFFFF";
        ctx.fillText(
          String(label),
          x * scaledSize + scaledSize / 2,
          y * scaledSize + scaledSize / 2,
        );
      }
    }
  }

  ctx.restore();
}

/**
 * Get the cell coordinates at a given canvas pixel position.
 */
export function canvasToCell(
  canvasX: number,
  canvasY: number,
  options: Partial<RenderOptions> = {},
): { x: number; y: number } | null {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const scaledSize = opts.cellSize * opts.zoom;
  const x = Math.floor((canvasX - opts.panX) / scaledSize);
  const y = Math.floor((canvasY - opts.panY) / scaledSize);
  if (x < 0 || y < 0) return null;
  return { x, y };
}

/**
 * Export the rendered grid as a PNG data URL.
 */
export function exportGridAsPng(
  doc: GridDocument,
  options: Partial<RenderOptions> = {},
): string {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options, panX: 0, panY: 0 };
  const scaledSize = opts.cellSize * opts.zoom;
  const canvas = document.createElement("canvas");
  canvas.width = doc.width * scaledSize;
  canvas.height = doc.height * scaledSize;
  const ctx = canvas.getContext("2d")!;
  renderGrid(ctx, doc, opts);
  return canvas.toDataURL("image/png");
}

/**
 * Download the rendered grid as a PNG file.
 */
export function downloadGridAsPng(
  doc: GridDocument,
  options: Partial<RenderOptions> = {},
  filename?: string,
): void {
  const dataUrl = exportGridAsPng(doc, options);
  const a = document.createElement("a");
  a.href = dataUrl;
  const safeName = doc.meta.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  a.download = filename ?? `${safeName}-guide.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Export a labeled palette sheet for the colors used in a document.
 */
export function exportPaletteSheetAsPng(doc: GridDocument): string {
  const counts = getColorUsageCounts(doc);
  const sortedColors = doc.usedColors
    .map((id) => ({
      color: TOMODACHI_PALETTE.find((entry) => entry.id === id),
      count: counts.get(id) ?? 0,
      id,
    }))
    .sort((a, b) => b.count - a.count);

  const width = 760;
  const headerHeight = 74;
  const rowHeight = 48;
  const height = Math.max(
    180,
    headerHeight + sortedColors.length * rowHeight + 28,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#FAFAF5";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#4A4A4A";
  ctx.font = `600 22px ${CANVAS_SANS_FONT}`;
  ctx.fillText(`${doc.meta.name} Palette Sheet`, 24, 34);
  ctx.font = `12px ${CANVAS_MONO_FONT}`;
  ctx.fillStyle = "#77736D";
  ctx.fillText(
    `${doc.width}x${doc.height} grid · ${formatCountLabel(sortedColors.length, "color")} · fan-made repaint reference`,
    24,
    56,
  );

  ctx.strokeStyle = "#E1DDD4";
  ctx.beginPath();
  ctx.moveTo(24, headerHeight - 8);
  ctx.lineTo(width - 24, headerHeight - 8);
  ctx.stroke();

  sortedColors.forEach((entry, index) => {
    const y = headerHeight + index * rowHeight;
    const color = entry.color;
    const swatchHex = color?.hex ?? "#FFFFFF";

    ctx.fillStyle = index % 2 === 0 ? "#FFFDF7" : "#F5F1E8";
    ctx.fillRect(24, y, width - 48, rowHeight - 6);

    ctx.fillStyle = swatchHex;
    ctx.fillRect(36, y + 8, 30, 30);
    ctx.strokeStyle = "#BFB8AA";
    ctx.strokeRect(36.5, y + 8.5, 29, 29);

    ctx.fillStyle = "#2F2B26";
    ctx.font = `700 13px ${CANVAS_MONO_FONT}`;
    ctx.fillText(entry.id, 80, y + 21);

    ctx.font = `12px ${CANVAS_SANS_FONT}`;
    ctx.fillStyle = "#4A4A4A";
    ctx.fillText(color?.name ?? "Unknown palette color", 146, y + 21);

    ctx.font = `11px ${CANVAS_MONO_FONT}`;
    ctx.fillStyle = "#77736D";
    ctx.fillText(color?.hex ?? entry.id, 146, y + 36);

    ctx.fillStyle = "#4A4A4A";
    ctx.textAlign = "right";
    ctx.fillText(formatCountLabel(entry.count, "cell"), width - 40, y + 28);
    ctx.textAlign = "left";
  });

  return canvas.toDataURL("image/png");
}

export function downloadPaletteSheetAsPng(
  doc: GridDocument,
  filename?: string,
): void {
  const dataUrl = exportPaletteSheetAsPng(doc);
  const a = document.createElement("a");
  a.href = dataUrl;
  const safeName = doc.meta.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  a.download = filename ?? `${safeName}-palette-sheet.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
