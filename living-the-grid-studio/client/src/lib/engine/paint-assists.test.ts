import { describe, expect, it } from "vitest";

import {
  addHorizontalMirrorCells,
  buildPaintCells,
  expandBrushCells,
} from "./paint-assists";

describe("paint assists", () => {
  it("expands a square brush once per bounded cell", () => {
    expect(
      expandBrushCells([{ x: 0, y: 0 }], 3, { width: 4, height: 4 }),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);

    expect(
      expandBrushCells(
        [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
        1,
        { width: 4, height: 4 },
      ),
    ).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it("reflects cells left-to-right and de-duplicates an odd-width center", () => {
    expect(
      addHorizontalMirrorCells(
        [
          { x: 1, y: 2 },
          { x: 3, y: 2 },
        ],
        { width: 7, height: 5 },
      ),
    ).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 2 },
      { x: 5, y: 2 },
    ]);
  });

  it("mirrors the expanded footprint so even brushes stay symmetric", () => {
    const cells = buildPaintCells(
      [{ x: 3, y: 2 }],
      2,
      { width: 8, height: 6 },
      true,
    );

    expect(new Set(cells.map(({ x, y }) => `${x},${y}`))).toEqual(
      new Set(["2,1", "3,1", "4,1", "5,1", "2,2", "3,2", "4,2", "5,2"]),
    );
  });

  it("leaves the brush footprint unchanged when mirroring is off", () => {
    expect(
      buildPaintCells([{ x: 1, y: 1 }], 1, { width: 8, height: 8 }, false),
    ).toEqual([{ x: 1, y: 1 }]);
  });
});
