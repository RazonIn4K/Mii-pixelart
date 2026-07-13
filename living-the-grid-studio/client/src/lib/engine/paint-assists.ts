import type { GridDocument } from "./grid";

export type BrushSize = 1 | 2 | 3 | 5;

export interface PaintCell {
  x: number;
  y: number;
}

type GridBounds = Pick<GridDocument, "height" | "width">;

/**
 * Expand sampled stroke cells into a bounded square brush footprint.
 *
 * Even-sized brushes intentionally keep the historical top-left bias used by
 * the Studio. Mirroring happens after this expansion so a 2x2 brush remains
 * geometrically symmetric around the document's vertical center axis.
 */
export function expandBrushCells(
  cells: ReadonlyArray<PaintCell>,
  size: BrushSize,
  bounds: GridBounds,
): PaintCell[] {
  if (cells.length === 0) return [];

  const start = -Math.floor(size / 2);
  const end = start + size - 1;
  const seen = new Set<number>();
  const expanded: PaintCell[] = [];

  for (const cell of cells) {
    for (let offsetY = start; offsetY <= end; offsetY += 1) {
      for (let offsetX = start; offsetX <= end; offsetX += 1) {
        const x = cell.x + offsetX;
        const y = cell.y + offsetY;
        if (x < 0 || x >= bounds.width || y < 0 || y >= bounds.height) {
          continue;
        }
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
  size: BrushSize,
  bounds: GridBounds,
  horizontalMirror: boolean,
): PaintCell[] {
  const brushCells = expandBrushCells(sampledCells, size, bounds);
  return horizontalMirror
    ? addHorizontalMirrorCells(brushCells, bounds)
    : brushCells;
}
