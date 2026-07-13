import { describe, expect, it } from "vitest";
import { bresenhamLine, createGridDocument } from "./grid";
import { buildPaintCells } from "./paint-assists";
import {
  applyStudioTransaction,
  buildPaintCellsTransaction,
  MAX_PAINT_CELLS_PER_COMMAND,
  StudioCommandError,
} from "./studio-commands";

describe("applyStudioTransaction", () => {
  it("applies multiple bounded paint commands as one derived document", () => {
    const source = createGridDocument(8, 8, "Commands");
    const result = applyStudioTransaction(
      source,
      [
        {
          type: "line",
          from: { x: 0, y: 0 },
          to: { x: 3, y: 0 },
          colorId: "R10C1",
        },
        {
          type: "rectangle",
          x: 2,
          y: 2,
          width: 3,
          height: 3,
          filled: false,
          colorId: "R1C3",
        },
      ],
      { now: () => "2026-07-12T21:00:00.000Z" },
    );

    expect(result.appliedCommands).toBe(2);
    expect(result.changedCells).toBe(12);
    expect(result.doc.cells.slice(0, 4)).toEqual([
      "R10C1",
      "R10C1",
      "R10C1",
      "R10C1",
    ]);
    expect(result.doc.cells[2 * 8 + 2]).toBe("R1C3");
    expect(result.doc.cells[3 * 8 + 3]).toBeNull();
    expect(result.doc.usedColors).toEqual(["R10C1", "R1C3"]);
    expect(result.doc.meta.modifiedAt).toBe("2026-07-12T21:00:00.000Z");
    expect(source.cells.every((cell) => cell === null)).toBe(true);
  });

  it("supports flood fill, clear, replace, and resize operations", () => {
    const source = createGridDocument(8, 8, "Commands", "R10C7");
    const painted = applyStudioTransaction(source, [
      {
        type: "paint_cells",
        cells: [{ x: 0, y: 0 }],
        colorId: "R10C1",
      },
      { type: "flood_fill", x: 1, y: 1, colorId: "R6C3" },
      {
        type: "clear_region",
        x: 6,
        y: 6,
        width: 2,
        height: 2,
      },
      {
        type: "replace_color",
        fromColorId: "R10C1",
        toColorId: "R1C3",
      },
      { type: "resize", width: 16, height: 16 },
    ]);

    expect(painted.doc.width).toBe(16);
    expect(painted.doc.height).toBe(16);
    expect(painted.doc.usedColors).toContain("R1C3");
    expect(painted.doc.usedColors).toContain("R6C3");
    expect(painted.doc.cells.some((cell) => cell === null)).toBe(true);
  });

  it("keeps a maximum-size mirrored manual stroke in one transaction", () => {
    const source = createGridDocument(256, 256, "Mirrored stroke");
    const cells = buildPaintCells(
      bresenhamLine(0, 0, 255, 255),
      5,
      source,
      true,
    );
    const commands = buildPaintCellsTransaction(cells, "R10C1");

    expect(cells.length).toBeGreaterThan(MAX_PAINT_CELLS_PER_COMMAND);
    expect(commands).toHaveLength(2);
    expect(
      commands.every(
        (command) =>
          command.type === "paint_cells" &&
          command.cells.length <= MAX_PAINT_CELLS_PER_COMMAND,
      ),
    ).toBe(true);

    const result = applyStudioTransaction(source, commands);
    expect(result.appliedCommands).toBe(2);
    expect(result.changedCells).toBe(cells.length);
  });

  it("rejects unknown colors, out-of-bounds cells, and oversized diffs atomically", () => {
    const source = createGridDocument(8, 8, "Commands");

    expect(() =>
      applyStudioTransaction(source, [
        {
          type: "paint_cells",
          cells: [{ x: 0, y: 0 }],
          colorId: "NOT_A_COLOR",
        },
      ]),
    ).toThrow(StudioCommandError);
    expect(() =>
      applyStudioTransaction(source, [
        {
          type: "paint_cells",
          cells: [{ x: 8, y: 0 }],
          colorId: "R10C1",
        },
      ]),
    ).toThrow("outside the 8 by 8 canvas");
    expect(() =>
      applyStudioTransaction(
        source,
        [{ type: "flood_fill", x: 0, y: 0, colorId: "R10C1" }],
        { maxChangedCells: 8 },
      ),
    ).toThrow("the limit is 8");
    expect(source.cells.every((cell) => cell === null)).toBe(true);
  });
});
