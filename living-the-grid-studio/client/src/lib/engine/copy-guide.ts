import type { GridDocument } from "./grid";
import { TOMODACHI_PALETTE } from "./palette";

export const COPY_GUIDE_MIN_DIMENSION = 8;
export const COPY_GUIDE_MAX_DIMENSION = 256;

const PALETTE_IDS = new Set(TOMODACHI_PALETTE.map((color) => color.id));

export interface CopyGuideRun {
  /** Stable, project-data-free identifier derived from public grid coordinates. */
  id: string;
  /** One-based row number. */
  row: number;
  /** One-based first column in the contiguous run. */
  startColumn: number;
  /** One-based last column in the contiguous run. */
  endColumn: number;
  colorId: string;
  cellCount: number;
  instruction: string;
}

export class CopyGuideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopyGuideError";
  }
}

/**
 * Convert a validated GridDocument into non-empty, contiguous row runs.
 *
 * Runs are emitted in row-major order. Coordinates are one-based at this
 * boundary so the returned values and instruction text can be presented
 * directly to a person manually recreating the grid.
 */
export function buildCopyGuideRuns(doc: GridDocument): CopyGuideRun[] {
  assertCopyGuideDocument(doc);

  const runs: CopyGuideRun[] = [];
  for (let rowIndex = 0; rowIndex < doc.height; rowIndex += 1) {
    let columnIndex = 0;
    while (columnIndex < doc.width) {
      const colorId = doc.cells[rowIndex * doc.width + columnIndex];
      if (colorId === null) {
        columnIndex += 1;
        continue;
      }

      const startIndex = columnIndex;
      columnIndex += 1;
      while (
        columnIndex < doc.width &&
        doc.cells[rowIndex * doc.width + columnIndex] === colorId
      ) {
        columnIndex += 1;
      }

      const row = rowIndex + 1;
      const startColumn = startIndex + 1;
      const endColumn = columnIndex;
      runs.push({
        id: copyGuideRunId(row, startColumn, endColumn, colorId),
        row,
        startColumn,
        endColumn,
        colorId,
        cellCount: endColumn - startColumn + 1,
        instruction: copyGuideInstruction(row, startColumn, endColumn, colorId),
      });
    }
  }

  return runs;
}

/**
 * Keep only known run IDs, remove duplicates, and return them in guide order.
 * Persisted browser state is treated as untrusted, so malformed input becomes
 * an empty completion set rather than changing guide behavior.
 */
export function normalizeCompletedCopyGuideIds(
  runs: readonly CopyGuideRun[],
  completedIds: unknown,
): string[] {
  const candidates = readCompletedIdCandidates(completedIds);
  if (candidates.size === 0) return [];
  return runs.filter((run) => candidates.has(run.id)).map((run) => run.id);
}

/** Count valid, unique completed runs. */
export function countCompletedCopyGuideRuns(
  runs: readonly CopyGuideRun[],
  completedIds: unknown,
): number {
  return normalizeCompletedCopyGuideIds(runs, completedIds).length;
}

/**
 * Find the next incomplete run after `afterIndex`, wrapping once.
 *
 * Pass -1 (the default) to select the first incomplete run. Returns -1 when
 * the guide is empty or every run is complete.
 */
export function getNextActiveCopyGuideIndex(
  runs: readonly CopyGuideRun[],
  completedIds: unknown,
  afterIndex = -1,
): number {
  if (runs.length === 0) return -1;

  const completed = new Set(normalizeCompletedCopyGuideIds(runs, completedIds));
  if (completed.size === runs.length) return -1;

  const safeAfterIndex = Number.isInteger(afterIndex) ? afterIndex : -1;
  const startIndex = modulo(safeAfterIndex + 1, runs.length);
  for (let offset = 0; offset < runs.length; offset += 1) {
    const index = (startIndex + offset) % runs.length;
    const run = runs[index];
    if (run && !completed.has(run.id)) return index;
  }

  return -1;
}

function assertCopyGuideDocument(doc: GridDocument): void {
  if (!doc || typeof doc !== "object") {
    throw new CopyGuideError("Copy Guide requires a grid document.");
  }
  if (doc.version !== 1) {
    throw new CopyGuideError("Copy Guide supports GridDocument version 1.");
  }
  assertDimension(doc.width, "width");
  assertDimension(doc.height, "height");

  const expectedCellCount = doc.width * doc.height;
  if (!Array.isArray(doc.cells) || doc.cells.length !== expectedCellCount) {
    throw new CopyGuideError(
      `Copy Guide expected exactly ${expectedCellCount} cells.`,
    );
  }

  for (let index = 0; index < doc.cells.length; index += 1) {
    const colorId = doc.cells[index];
    if (colorId !== null && !PALETTE_IDS.has(colorId)) {
      throw new CopyGuideError(
        `Copy Guide cell ${index + 1} uses an unknown palette color.`,
      );
    }
  }
}

function assertDimension(value: number, label: "width" | "height"): void {
  if (
    !Number.isInteger(value) ||
    value < COPY_GUIDE_MIN_DIMENSION ||
    value > COPY_GUIDE_MAX_DIMENSION
  ) {
    throw new CopyGuideError(
      `Copy Guide ${label} must be an integer from ${COPY_GUIDE_MIN_DIMENSION} to ${COPY_GUIDE_MAX_DIMENSION}.`,
    );
  }
}

function copyGuideRunId(
  row: number,
  startColumn: number,
  endColumn: number,
  colorId: string,
): string {
  return `r${row}-c${startColumn}-${endColumn}-${colorId.toLowerCase()}`;
}

function copyGuideInstruction(
  row: number,
  startColumn: number,
  endColumn: number,
  colorId: string,
): string {
  const columns =
    startColumn === endColumn
      ? `column ${startColumn}`
      : `columns ${startColumn}\u2013${endColumn}`;
  return `Row ${row}, ${columns}: ${colorId}.`;
}

function readCompletedIdCandidates(input: unknown): Set<string> {
  if (
    input === null ||
    input === undefined ||
    typeof input === "string" ||
    (typeof input !== "object" && typeof input !== "function")
  ) {
    return new Set();
  }

  const iterator = (input as { [Symbol.iterator]?: unknown })[Symbol.iterator];
  if (typeof iterator !== "function") return new Set();

  const candidates = new Set<string>();
  try {
    for (const value of Array.from(input as Iterable<unknown>)) {
      if (typeof value === "string") candidates.add(value);
    }
  } catch {
    return new Set();
  }
  return candidates;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
