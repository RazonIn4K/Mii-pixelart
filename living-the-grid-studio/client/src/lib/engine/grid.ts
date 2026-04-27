/**
 * grid.ts — Grid document model
 *
 * The GridDocument is the central data structure: a 2D grid of cells,
 * each referencing a palette color. This module handles creation,
 * manipulation, and serialization of grid documents.
 */

import type { PaletteColor } from "./palette";

/** A single cell in the grid */
export interface GridCell {
  /** Column index (0-based) */
  x: number;
  /** Row index (0-based) */
  y: number;
  /** Palette color ID (e.g. "R1C3") or null for empty */
  colorId: string | null;
  /** Paint-by-number label (assigned during rendering) */
  label?: number;
}

/** Metadata about the grid document */
export interface GridMeta {
  /** Human-readable project name */
  name: string;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Last modified timestamp */
  modifiedAt: string;
  /** Source image filename, if imported from image */
  sourceImage?: string;
  /** Source JSON filename, if imported from JSON */
  sourceJson?: string;
  /** Machine-readable source format, if imported from another tool */
  sourceFormat?: string;
  /** Non-pixel metadata preserved from the imported source JSON */
  sourceMetadata?: Record<string, unknown>;
  /** Source palette entries mapped to internal palette IDs during import */
  sourcePaletteMappings?: SourcePaletteMapping[];
  /** Non-fatal import issues the user should review */
  importWarnings?: string[];
  /** Notes */
  notes?: string;
}

/** Mapping from an imported palette entry to a game palette color */
export interface SourcePaletteMapping {
  sourceIndex: number;
  sourceHex: string;
  sourceRgb?: [number, number, number];
  sourcePress?: {
    h: number;
    s: number;
    b: number;
  };
  colorId: string;
  exact: boolean;
  deltaE: number;
}

/** The complete grid document */
export interface GridDocument {
  /** Schema version for forward compatibility */
  version: 1;
  /** Document metadata */
  meta: GridMeta;
  /** Grid width in cells */
  width: number;
  /** Grid height in cells */
  height: number;
  /** Flat array of color IDs, row-major order. null = empty cell. */
  cells: (string | null)[];
  /** Palette subset used in this document (color IDs) */
  usedColors: string[];
  /** Color lock states: locked colors won't be changed by optimizer */
  lockedColors: string[];
}

// ─── Factory ──────────────────────────────────────────────────

/** Create a new empty grid document */
export function createGridDocument(
  width: number,
  height: number,
  name = "Untitled"
): GridDocument {
  const now = new Date().toISOString();
  return {
    version: 1,
    meta: {
      name,
      createdAt: now,
      modifiedAt: now,
    },
    width,
    height,
    cells: new Array(width * height).fill(null),
    usedColors: [],
    lockedColors: [],
  };
}

// ─── Cell Access ──────────────────────────────────────────────

/** Get the color ID at (x, y) */
export function getCell(doc: GridDocument, x: number, y: number): string | null {
  if (x < 0 || x >= doc.width || y < 0 || y >= doc.height) return null;
  return doc.cells[y * doc.width + x];
}

/** Set the color ID at (x, y). Returns a new document (immutable). */
export function setCell(
  doc: GridDocument,
  x: number,
  y: number,
  colorId: string | null
): GridDocument {
  if (x < 0 || x >= doc.width || y < 0 || y >= doc.height) return doc;
  const cells = [...doc.cells];
  cells[y * doc.width + x] = colorId;
  return {
    ...doc,
    cells,
    meta: { ...doc.meta, modifiedAt: new Date().toISOString() },
  };
}

// ─── Analysis ─────────────────────────────────────────────────

/** Count how many cells use each color ID */
export function getColorUsageCounts(
  doc: GridDocument
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of doc.cells) {
    if (id !== null) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/** Recompute the usedColors array from the cells */
export function recomputeUsedColors(doc: GridDocument): GridDocument {
  const usedSet = new Set<string>();
  for (const id of doc.cells) {
    if (id !== null) usedSet.add(id);
  }
  return {
    ...doc,
    usedColors: Array.from(usedSet),
    meta: { ...doc.meta, modifiedAt: new Date().toISOString() },
  };
}

/** Replace all occurrences of one color with another */
export function replaceColor(
  doc: GridDocument,
  fromId: string,
  toId: string
): GridDocument {
  const cells = doc.cells.map((id) => (id === fromId ? toId : id));
  const result = { ...doc, cells, meta: { ...doc.meta, modifiedAt: new Date().toISOString() } };
  return recomputeUsedColors(result);
}

/** Get the grid as a 2D array of color IDs */
export function toGrid2D(doc: GridDocument): (string | null)[][] {
  const grid: (string | null)[][] = [];
  for (let y = 0; y < doc.height; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < doc.width; x++) {
      row.push(doc.cells[y * doc.width + x]);
    }
    grid.push(row);
  }
  return grid;
}

/** Create a GridDocument from a 2D array of color IDs */
export function fromGrid2D(
  grid: (string | null)[][],
  name = "Imported"
): GridDocument {
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;
  const cells: (string | null)[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells.push(grid[y]?.[x] ?? null);
    }
  }
  const doc = createGridDocument(width, height, name);
  doc.cells = cells;
  return recomputeUsedColors(doc);
}

// ─── Resize / Crop ────────────────────────────────────────────

/** Resize the grid, filling new cells with null */
export function resizeGrid(
  doc: GridDocument,
  newWidth: number,
  newHeight: number
): GridDocument {
  const cells: (string | null)[] = new Array(newWidth * newHeight).fill(null);
  const copyW = Math.min(doc.width, newWidth);
  const copyH = Math.min(doc.height, newHeight);
  for (let y = 0; y < copyH; y++) {
    for (let x = 0; x < copyW; x++) {
      cells[y * newWidth + x] = doc.cells[y * doc.width + x];
    }
  }
  return recomputeUsedColors({
    ...doc,
    width: newWidth,
    height: newHeight,
    cells,
    meta: { ...doc.meta, modifiedAt: new Date().toISOString() },
  });
}
