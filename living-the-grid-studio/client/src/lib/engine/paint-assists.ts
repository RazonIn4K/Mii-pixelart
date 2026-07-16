import type { GridDocument } from "./grid";
import {
  PIXEL_PERFECT_GAME_BRUSHES,
  type PixelPerfectGameBrush,
} from "./game-match";

/** Centered freehand footprints observed in the game's smooth draw mode. */
export const SMOOTH_BRUSH_SIZES = [1, 3, 7, 13, 19, 27] as const;

export type SmoothBrushSize = (typeof SMOOTH_BRUSH_SIZES)[number];

/** Sizes from pre-game-match Studio drafts; accepted while callers migrate. */
export type LegacySmoothBrushSize = 2 | 5;

export type BrushSize =
  SmoothBrushSize | PixelPerfectGameBrush | LegacySmoothBrushSize;

export type BrushMode = "pixel-perfect" | "smooth";

export type BrushSpec =
  | {
      mode: "pixel-perfect";
      size: PixelPerfectGameBrush;
    }
  | {
      mode: "smooth";
      size: SmoothBrushSize | LegacySmoothBrushSize;
    };

/** Numeric inputs remain supported for existing Studio drafts and call sites. */
export type BrushInput = BrushSize | BrushSpec;

export interface PaintCell {
  x: number;
  y: number;
}

type GridBounds = Pick<GridDocument, "height" | "width">;

export interface BrushFootprintRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

function isPixelPerfectBrushSize(
  size: BrushSize,
): size is PixelPerfectGameBrush {
  return PIXEL_PERFECT_GAME_BRUSHES.includes(size as PixelPerfectGameBrush);
}

/** Normalize the compatibility numeric form into an explicit brush mode. */
export function resolveBrushSpec(input: BrushInput): BrushSpec {
  if (typeof input !== "number") return input;
  return isPixelPerfectBrushSize(input)
    ? { mode: "pixel-perfect", size: input }
    : { mode: "smooth", size: input };
}

/** Pixel-perfect stamps expose their snapped cadence as a separate guide. */
export function getBrushGridStep(input: BrushInput): number | null {
  const spec = resolveBrushSpec(input);
  return spec.mode === "pixel-perfect" ? spec.size : null;
}

function getBrushStampRect(
  cell: PaintCell,
  input: BrushInput,
  bounds: GridBounds,
): BrushFootprintRect | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;

  const x = Math.floor(cell.x);
  const y = Math.floor(cell.y);
  if (x < 0 || x >= bounds.width || y < 0 || y >= bounds.height) return null;

  const spec = resolveBrushSpec(input);
  const size = spec.size;
  const originX =
    spec.mode === "pixel-perfect"
      ? Math.floor(x / size) * size
      : x - Math.floor(size / 2);
  const originY =
    spec.mode === "pixel-perfect"
      ? Math.floor(y / size) * size
      : y - Math.floor(size / 2);
  const left = Math.max(0, originX);
  const top = Math.max(0, originY);
  const right = Math.min(bounds.width, originX + size);
  const bottom = Math.min(bounds.height, originY + size);
  if (right <= left || bottom <= top) return null;

  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  };
}

/**
 * Compact rectangles used by the cursor overlay.
 *
 * The rectangles describe the exact mutation footprint; callers may add a
 * larger visibility ring around a sub-4-CSS-pixel footprint, but must not use
 * that ring for hit testing.
 */
export function getBrushPreviewRects(
  anchor: PaintCell,
  input: BrushInput,
  bounds: GridBounds,
  horizontalMirror: boolean,
): BrushFootprintRect[] {
  const rect = getBrushStampRect(anchor, input, bounds);
  if (!rect) return [];

  const rectangles = [rect];
  if (horizontalMirror) {
    rectangles.push({
      ...rect,
      x: bounds.width - rect.x - rect.width,
    });
  }

  const seen = new Set<string>();
  const unique = rectangles
    .filter((candidate) => {
      const key = `${candidate.x}:${candidate.y}:${candidate.width}:${candidate.height}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((first, second) => first.y - second.y || first.x - second.x);

  // Mirrored centered brushes can touch or overlap across the axis. Merge
  // those rectangles so the cursor outline and diagnostic cell count describe
  // the exact union rather than painting the shared cells twice.
  return unique.reduce<BrushFootprintRect[]>((merged, candidate) => {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.y === candidate.y &&
      previous.height === candidate.height &&
      candidate.x <= previous.x + previous.width
    ) {
      previous.width =
        Math.max(previous.x + previous.width, candidate.x + candidate.width) -
        previous.x;
      return merged;
    }
    merged.push({ ...candidate });
    return merged;
  }, []);
}

/**
 * Expand sampled stroke cells into a bounded square brush footprint.
 *
 * Even-sized brushes intentionally keep the historical top-left bias used by
 * the Studio. Mirroring happens after this expansion so a 2x2 brush remains
 * geometrically symmetric around the document's vertical center axis.
 */
export function expandBrushCells(
  cells: ReadonlyArray<PaintCell>,
  input: BrushInput,
  bounds: GridBounds,
): PaintCell[] {
  if (cells.length === 0) return [];

  const seen = new Set<number>();
  const expanded: PaintCell[] = [];

  for (const cell of cells) {
    const rect = getBrushStampRect(cell, input, bounds);
    if (!rect) continue;
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        const index = y * bounds.width + x;
        if (seen.has(index)) continue;
        seen.add(index);
        expanded.push({ x, y });
      }
    }
  }

  return expanded;
}

/**
 * Return every input cell plus its left-to-right reflection.
 *
 * Cells on the center column of odd-width documents are emitted once. Invalid
 * coordinates are discarded so the helper is safe for pointer interpolation
 * at canvas edges as well as keyboard painting.
 */
export function addHorizontalMirrorCells(
  cells: ReadonlyArray<PaintCell>,
  bounds: GridBounds,
): PaintCell[] {
  const seen = new Set<number>();
  const mirrored: PaintCell[] = [];

  const add = (x: number, y: number) => {
    if (x < 0 || x >= bounds.width || y < 0 || y >= bounds.height) return;
    const index = y * bounds.width + x;
    if (seen.has(index)) return;
    seen.add(index);
    mirrored.push({ x, y });
  };

  for (const cell of cells) add(cell.x, cell.y);
  for (const cell of cells) add(bounds.width - 1 - cell.x, cell.y);

  return mirrored;
}

/** Build the exact cells for one pencil/eraser update. */
export function buildPaintCells(
  sampledCells: ReadonlyArray<PaintCell>,
  input: BrushInput,
  bounds: GridBounds,
  horizontalMirror: boolean,
): PaintCell[] {
  const brushCells = expandBrushCells(sampledCells, input, bounds);
  return horizontalMirror
    ? addHorizontalMirrorCells(brushCells, bounds)
    : brushCells;
}
