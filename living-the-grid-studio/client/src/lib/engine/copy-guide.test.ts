import { describe, expect, it } from "vitest";

import { createGridDocument, type GridDocument } from "./grid";
import {
  buildCopyGuideRuns,
  CopyGuideError,
  countCompletedCopyGuideRuns,
  getNextActiveCopyGuideIndex,
  normalizeCompletedCopyGuideIds,
} from "./copy-guide";

function documentWithCells(
  width: number,
  height: number,
  cells: Array<string | null>,
  name = "Copy fixture",
): GridDocument {
  return { ...createGridDocument(width, height, name), cells };
}

describe("buildCopyGuideRuns", () => {
  it("emits one-based contiguous non-empty runs in row-major order", () => {
    const cells = new Array<string | null>(8 * 8).fill(null);
    cells.splice(
      0,
      8,
      "R1C3",
      "R1C3",
      null,
      "R1C3",
      "R2C2",
      "R2C2",
      null,
      null,
    );
    cells[8 + 1] = "R4C2";

    expect(buildCopyGuideRuns(documentWithCells(8, 8, cells))).toEqual([
      {
        id: "r1-c1-2-r1c3",
        row: 1,
        startColumn: 1,
        endColumn: 2,
        colorId: "R1C3",
        cellCount: 2,
        instruction: "Row 1, columns 1\u20132: R1C3.",
      },
      {
        id: "r1-c4-4-r1c3",
        row: 1,
        startColumn: 4,
        endColumn: 4,
        colorId: "R1C3",
        cellCount: 1,
        instruction: "Row 1, column 4: R1C3.",
      },
      {
        id: "r1-c5-6-r2c2",
        row: 1,
        startColumn: 5,
        endColumn: 6,
        colorId: "R2C2",
        cellCount: 2,
        instruction: "Row 1, columns 5\u20136: R2C2.",
      },
      {
        id: "r2-c2-2-r4c2",
        row: 2,
        startColumn: 2,
        endColumn: 2,
        colorId: "R4C2",
        cellCount: 1,
        instruction: "Row 2, column 2: R4C2.",
      },
    ]);
  });

  it("returns no instructions for an empty valid document", () => {
    expect(buildCopyGuideRuns(createGridDocument(8, 8))).toEqual([]);
  });

  it("uses stable IDs without including project metadata", () => {
    const cells = new Array<string | null>(8 * 8).fill(null);
    cells[9] = "S7";
    const first = buildCopyGuideRuns(
      documentWithCells(8, 8, cells, "private project title"),
    );
    const second = buildCopyGuideRuns(
      documentWithCells(8, 8, [...cells], "different private title"),
    );

    expect(first.map((run) => run.id)).toEqual(second.map((run) => run.id));
    expect(first[0]?.id).toBe("r2-c2-2-s7");
    expect(first[0]?.id).not.toContain("private");
  });

  it("supports the maximum 256 by 256 document", () => {
    const cells = new Array<string | null>(256 * 256).fill(null);
    for (let row = 0; row < 256; row += 1) {
      cells[row * 256] = "R10C1";
      cells[row * 256 + 255] = "R10C7";
    }

    const runs = buildCopyGuideRuns(documentWithCells(256, 256, cells));
    expect(runs).toHaveLength(512);
    expect(runs[0]).toMatchObject({
      row: 1,
      startColumn: 1,
      endColumn: 1,
      colorId: "R10C1",
    });
    expect(runs.at(-1)).toMatchObject({
      row: 256,
      startColumn: 256,
      endColumn: 256,
      colorId: "R10C7",
    });
  });

  it.each([
    ["undersized width", { width: 7 }],
    ["fractional height", { height: 8.5 }],
    ["oversized height", { height: 257 }],
    ["unsupported version", { version: 2 }],
  ])("rejects %s", (_label, override) => {
    const doc = { ...createGridDocument(8, 8), ...override } as GridDocument;
    expect(() => buildCopyGuideRuns(doc)).toThrow(CopyGuideError);
  });

  it("rejects a mismatched cell count and unknown palette IDs", () => {
    const short = {
      ...createGridDocument(8, 8),
      cells: new Array<string | null>(63).fill(null),
    };
    expect(() => buildCopyGuideRuns(short)).toThrow(
      "expected exactly 64 cells",
    );

    const unknown = createGridDocument(8, 8);
    unknown.cells[63] = "PRIVATE_COLOR";
    expect(() => buildCopyGuideRuns(unknown)).toThrow(
      "cell 64 uses an unknown palette color",
    );
  });
});

describe("Copy Guide progress helpers", () => {
  const cells = new Array<string | null>(8 * 8).fill(null);
  cells[0] = "R1C1";
  cells[2] = "R2C2";
  cells[3] = "R2C2";
  cells[8] = "S1";
  const runs = buildCopyGuideRuns(documentWithCells(8, 8, cells));

  it("normalizes valid unique IDs into guide order", () => {
    const completed = [
      runs[2]!.id,
      "unknown-run",
      runs[0]!.id,
      runs[2]!.id,
      42,
    ];

    expect(normalizeCompletedCopyGuideIds(runs, completed)).toEqual([
      runs[0]!.id,
      runs[2]!.id,
    ]);
    expect(countCompletedCopyGuideRuns(runs, completed)).toBe(2);
    expect(normalizeCompletedCopyGuideIds(runs, new Set(completed))).toEqual([
      runs[0]!.id,
      runs[2]!.id,
    ]);
  });

  it("treats malformed persisted completion input as empty", () => {
    expect(normalizeCompletedCopyGuideIds(runs, "not-an-id-list")).toEqual([]);
    expect(
      normalizeCompletedCopyGuideIds(runs, { ids: [runs[0]!.id] }),
    ).toEqual([]);
    expect(countCompletedCopyGuideRuns(runs, null)).toBe(0);
  });

  it("finds the next incomplete run and wraps once", () => {
    expect(getNextActiveCopyGuideIndex(runs, [])).toBe(0);
    expect(getNextActiveCopyGuideIndex(runs, [runs[0]!.id])).toBe(1);
    expect(
      getNextActiveCopyGuideIndex(runs, [runs[0]!.id, runs[1]!.id], 1),
    ).toBe(2);
    expect(getNextActiveCopyGuideIndex(runs, [runs[1]!.id], 2)).toBe(0);
  });

  it("returns -1 for empty or fully completed guides", () => {
    expect(getNextActiveCopyGuideIndex([], [])).toBe(-1);
    expect(
      getNextActiveCopyGuideIndex(
        runs,
        runs.map((run) => run.id),
      ),
    ).toBe(-1);
  });
});
