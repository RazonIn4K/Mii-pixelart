import { z } from "zod";
import type { GridDocument } from "./grid";
import {
  bresenhamLine,
  recomputeUsedColors,
  resampleGridNearest,
} from "./grid";
import { TOMODACHI_PALETTE } from "./palette";

const PALETTE_IDS = new Set(TOMODACHI_PALETTE.map((color) => color.id));
const coordinate = z.number().int().min(0).max(255);
const colorId = z
  .string()
  .max(12)
  .refine((value) => PALETTE_IDS.has(value), "Unknown palette color");
const nullableColorId = colorId.nullable();

const paintCellsCommand = z
  .object({
    type: z.literal("paint_cells"),
    cells: z
      .array(z.object({ x: coordinate, y: coordinate }).strict())
      .min(1)
      .max(4_096),
    colorId: nullableColorId,
  })
  .strict();

const lineCommand = z
  .object({
    type: z.literal("line"),
    from: z.object({ x: coordinate, y: coordinate }).strict(),
    to: z.object({ x: coordinate, y: coordinate }).strict(),
    colorId: nullableColorId,
  })
  .strict();

const rectangleCommand = z
  .object({
    type: z.literal("rectangle"),
    x: coordinate,
    y: coordinate,
    width: z.number().int().min(1).max(256),
    height: z.number().int().min(1).max(256),
    filled: z.boolean().default(false),
    colorId: nullableColorId,
  })
  .strict();

const floodFillCommand = z
  .object({
    type: z.literal("flood_fill"),
    x: coordinate,
    y: coordinate,
    colorId: nullableColorId,
  })
  .strict();

const clearRegionCommand = z
  .object({
    type: z.literal("clear_region"),
    x: coordinate,
    y: coordinate,
    width: z.number().int().min(1).max(256),
    height: z.number().int().min(1).max(256),
  })
  .strict();

const replaceColorCommand = z
  .object({
    type: z.literal("replace_color"),
    fromColorId: colorId,
    toColorId: nullableColorId,
  })
  .strict();

const resizeCommand = z
  .object({
    type: z.literal("resize"),
    width: z.number().int().min(8).max(256),
    height: z.number().int().min(8).max(256),
  })
  .strict();

export const studioCommandSchema = z.discriminatedUnion("type", [
  paintCellsCommand,
  lineCommand,
  rectangleCommand,
  floodFillCommand,
  clearRegionCommand,
  replaceColorCommand,
  resizeCommand,
]);

export const studioTransactionSchema = z
  .array(studioCommandSchema)
  .min(1)
  .max(64);
export type StudioCommand = z.infer<typeof studioCommandSchema>;

export interface StudioTransactionResult {
  appliedCommands: number;
  changedCells: number;
  doc: GridDocument;
}

export class StudioCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioCommandError";
  }
}

/**
 * Apply a bounded, validated list of document operations atomically.
 *
 * Manual tools and AI-assisted edits can share this surface without exposing
 * the DOM, cookies, network, or mutable React state. Every coordinate and
 * palette reference is checked, derived fields are recomputed once, and the
 * caller receives one document suitable for a single undo/cloud revision.
 */
export function applyStudioTransaction(
  source: GridDocument,
  input: unknown,
  options: {
    maxChangedCells?: number;
    now?: () => string;
  } = {},
): StudioTransactionResult {
  const parsed = studioTransactionSchema.safeParse(input);
  if (!parsed.success) {
    throw new StudioCommandError(
      parsed.error.issues[0]?.message ?? "Invalid Studio command transaction",
    );
  }

  const maxChangedCells = Math.max(
    1,
    Math.min(65_536, options.maxChangedCells ?? 65_536),
  );
  let working: GridDocument = {
    ...source,
    cells: [...source.cells],
    lockedColors: [...source.lockedColors],
    usedColors: [...source.usedColors],
    meta: { ...source.meta },
  };

  for (const command of parsed.data) {
    if (command.type === "resize") {
      working = resampleGridNearest(working, command.width, command.height);
      continue;
    }

    const cells = [...working.cells];
    const setCell = (x: number, y: number, nextColorId: string | null) => {
      assertCell(working, x, y);
      cells[y * working.width + x] = nextColorId;
    };

    switch (command.type) {
      case "paint_cells":
        for (const cell of command.cells) {
          setCell(cell.x, cell.y, command.colorId);
        }
        break;
      case "line":
        for (const cell of bresenhamLine(
          command.from.x,
          command.from.y,
          command.to.x,
          command.to.y,
        )) {
          setCell(cell.x, cell.y, command.colorId);
        }
        break;
      case "rectangle": {
        const maxX = command.x + command.width - 1;
        const maxY = command.y + command.height - 1;
        assertCell(working, command.x, command.y);
        assertCell(working, maxX, maxY);
        for (let y = command.y; y <= maxY; y += 1) {
          for (let x = command.x; x <= maxX; x += 1) {
            if (
              command.filled ||
              x === command.x ||
              x === maxX ||
              y === command.y ||
              y === maxY
            ) {
              setCell(x, y, command.colorId);
            }
          }
        }
        break;
      }
      case "flood_fill":
        floodFill(
          cells,
          working.width,
          working.height,
          command.x,
          command.y,
          command.colorId,
        );
        break;
      case "clear_region": {
        const maxX = command.x + command.width - 1;
        const maxY = command.y + command.height - 1;
        assertCell(working, command.x, command.y);
        assertCell(working, maxX, maxY);
        for (let y = command.y; y <= maxY; y += 1) {
          for (let x = command.x; x <= maxX; x += 1) {
            setCell(x, y, null);
          }
        }
        break;
      }
      case "replace_color":
        for (let index = 0; index < cells.length; index += 1) {
          if (cells[index] === command.fromColorId) {
            cells[index] = command.toColorId;
          }
        }
        break;
    }

    working = { ...working, cells };
  }

  const changedCells = countChangedCells(source, working);
  if (changedCells > maxChangedCells) {
    throw new StudioCommandError(
      `Studio transaction would change ${changedCells} cells; the limit is ${maxChangedCells}.`,
    );
  }
  if (
    changedCells === 0 &&
    source.width === working.width &&
    source.height === working.height
  ) {
    return {
      appliedCommands: parsed.data.length,
      changedCells: 0,
      doc: source,
    };
  }

  const recomputed = recomputeUsedColors(working);
  const doc = {
    ...recomputed,
    meta: {
      ...recomputed.meta,
      modifiedAt: options.now?.() ?? new Date().toISOString(),
    },
  };
  return {
    appliedCommands: parsed.data.length,
    changedCells,
    doc,
  };
}

function assertCell(doc: GridDocument, x: number, y: number): void {
  if (x < 0 || x >= doc.width || y < 0 || y >= doc.height) {
    throw new StudioCommandError(
      `Cell (${x}, ${y}) is outside the ${doc.width} by ${doc.height} canvas.`,
    );
  }
}

function floodFill(
  cells: (string | null)[],
  width: number,
  height: number,
  startX: number,
  startY: number,
  colorId: string | null,
): void {
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    throw new StudioCommandError(
      `Cell (${startX}, ${startY}) is outside the ${width} by ${height} canvas.`,
    );
  }
  const targetColorId = cells[startY * width + startX];
  if (targetColorId === colorId) return;

  const visited = new Uint8Array(width * height);
  const queue: Array<[number, number]> = [[startX, startY]];
  let head = 0;
  while (head < queue.length) {
    const [x, y] = queue[head++];
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const index = y * width + x;
    if (visited[index]) continue;
    visited[index] = 1;
    if (cells[index] !== targetColorId) continue;
    cells[index] = colorId;
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

function countChangedCells(source: GridDocument, next: GridDocument): number {
  const length = Math.max(source.cells.length, next.cells.length);
  let changed = 0;
  for (let index = 0; index < length; index += 1) {
    if (source.cells[index] !== next.cells[index]) changed += 1;
  }
  return changed;
}
