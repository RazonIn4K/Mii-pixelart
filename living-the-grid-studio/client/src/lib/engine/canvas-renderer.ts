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
import { getCell, getColorUsageCounts } from "./grid";
import { TOMODACHI_PALETTE, type PaletteColor } from "./palette";

/** Rendering options */
export interface RenderOptions {
  /** Size of each cell in pixels */
  cellSize: number;
  /** Show grid lines */
  showGrid: boolean;
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
  /** Label font size (auto-scaled if 0) */
  labelFontSize: number;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  cellSize: 16,
  showGrid: true,
  showLabels: false,
  highlightColorId: null,
  zoom: 1.0,
  panX: 0,
  panY: 0,
  gridColor: "rgba(197, 213, 228, 0.5)", // pale blue grid lines
  gridWidth: 0.5,
  labelFontSize: 0,
};

/** Resolve a color ID to its hex value */
function colorIdToHex(colorId: string): string {
  const c = TOMODACHI_PALETTE.find((p) => p.id === colorId);
  return c ? c.hex : colorId; // fallback to raw value if not found
}

/** Determine if a color is "light" (needs dark label text) */
function isLightColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  // Relative luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) > 128;
}

/**
 * Render a GridDocument onto a canvas context.
 */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  doc: GridDocument,
  options: Partial<RenderOptions> = {}
): void {
  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
  const { cellSize, zoom, panX, panY } = opts;
  const scaledSize = cellSize * zoom;

  // Build label map: assign a number to each used color
  const labelMap = new Map<string, number>();
  const counts = getColorUsageCounts(doc);
  const sortedColors = Array.from(counts.keys()).sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
  );
  sortedColors.forEach((id, i) => labelMap.set(id, i + 1));

  // Clear canvas
  const canvasW = doc.width * scaledSize;
  const canvasH = doc.height * scaledSize;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.save();
  ctx.translate(panX, panY);

  // Draw cells
  for (let y = 0; y < doc.height; y++) {
    for (let x = 0; x < doc.width; x++) {
      const colorId = getCell(doc, x, y);
      const px = x * scaledSize;
      const py = y * scaledSize;

      if (colorId) {
        ctx.fillStyle = colorIdToHex(colorId);
        ctx.fillRect(px, py, scaledSize, scaledSize);
      }
    }
  }

  // Draw grid lines
  if (opts.showGrid) {
    ctx.strokeStyle = opts.gridColor;
    ctx.lineWidth = opts.gridWidth;
    ctx.beginPath();
    for (let x = 0; x <= doc.width; x++) {
      const px = x * scaledSize;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, canvasH);
    }
    for (let y = 0; y <= doc.height; y++) {
      const py = y * scaledSize;
      ctx.moveTo(0, py);
      ctx.lineTo(canvasW, py);
    }
    ctx.stroke();
  }

  // Draw highlight
  if (opts.highlightColorId) {
    ctx.strokeStyle = "#D94F4F";
    ctx.lineWidth = 2;
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        if (getCell(doc, x, y) === opts.highlightColorId) {
          ctx.strokeRect(
            x * scaledSize + 1,
            y * scaledSize + 1,
            scaledSize - 2,
            scaledSize - 2
          );
        }
      }
    }
  }

  // Draw labels
  if (opts.showLabels && scaledSize >= 12) {
    const fontSize = opts.labelFontSize || Math.max(8, scaledSize * 0.45);
    ctx.font = `${fontSize}px "Noto Sans Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        const colorId = getCell(doc, x, y);
        if (!colorId) continue;
        const label = labelMap.get(colorId);
        if (label === undefined) continue;

        const hex = colorIdToHex(colorId);
        ctx.fillStyle = isLightColor(hex) ? "#333333" : "#FFFFFF";
        ctx.fillText(
          String(label),
          x * scaledSize + scaledSize / 2,
          y * scaledSize + scaledSize / 2
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
  options: Partial<RenderOptions> = {}
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
  options: Partial<RenderOptions> = {}
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
  filename?: string
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
  const height = Math.max(180, headerHeight + sortedColors.length * rowHeight + 28);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#FAFAF5";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#4A4A4A";
  ctx.font = '600 22px "Noto Sans JP", sans-serif';
  ctx.fillText(`${doc.meta.name} Palette Sheet`, 24, 34);
  ctx.font = '12px "Noto Sans Mono", monospace';
  ctx.fillStyle = "#77736D";
  ctx.fillText(
    `${doc.width}x${doc.height} grid · ${sortedColors.length} colors · fan-made repaint reference`,
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
    ctx.font = '700 13px "Noto Sans Mono", monospace';
    ctx.fillText(entry.id, 80, y + 21);

    ctx.font = '12px "Noto Sans JP", sans-serif';
    ctx.fillStyle = "#4A4A4A";
    ctx.fillText(color?.name ?? "Unknown palette color", 146, y + 21);

    ctx.font = '11px "Noto Sans Mono", monospace';
    ctx.fillStyle = "#77736D";
    ctx.fillText(color?.hex ?? entry.id, 146, y + 36);

    ctx.fillStyle = "#4A4A4A";
    ctx.textAlign = "right";
    ctx.fillText(`${entry.count} cells`, width - 40, y + 28);
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
