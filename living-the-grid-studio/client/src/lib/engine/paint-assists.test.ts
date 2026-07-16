import { describe, expect, it } from "vitest";

import {
  addHorizontalMirrorCells,
  buildPaintCells,
  expandBrushCells,
  getBrushGridStep,
  getBrushPreviewRects,
  resolveBrushSpec,
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

  it("keeps a smooth 1px brush to exactly one canonical cell", () => {
    expect(
      buildPaintCells(
        [{ x: 127, y: 128 }],
        { mode: "smooth", size: 1 },
        { width: 256, height: 256 },
        false,
      ),
    ).toEqual([{ x: 127, y: 128 }]);
  });

  it("centers the documented smooth brush footprints", () => {
    const cells = buildPaintCells(
      [{ x: 20, y: 30 }],
      { mode: "smooth", size: 7 },
      { width: 256, height: 256 },
      false,
    );

    expect(cells).toHaveLength(49);
    expect(cells).toContainEqual({ x: 17, y: 27 });
    expect(cells).toContainEqual({ x: 23, y: 33 });
  });

  it("snaps a 4px pixel-perfect brush to an exact 4 by 4 block", () => {
    const cells = buildPaintCells(
      [{ x: 6, y: 7 }],
      { mode: "pixel-perfect", size: 4 },
      { width: 256, height: 256 },
      false,
    );

    expect(cells).toHaveLength(16);
    expect(cells).toContainEqual({ x: 4, y: 4 });
    expect(cells).toContainEqual({ x: 7, y: 7 });
    expect(cells).not.toContainEqual({ x: 8, y: 7 });
  });

  it("de-duplicates samples that land inside the same snapped stamp", () => {
    const cells = buildPaintCells(
      [
        { x: 9, y: 11 },
        { x: 14, y: 15 },
      ],
      { mode: "pixel-perfect", size: 8 },
      { width: 256, height: 256 },
      false,
    );

    expect(cells).toHaveLength(64);
    expect(cells[0]).toEqual({ x: 8, y: 8 });
    expect(cells.at(-1)).toEqual({ x: 15, y: 15 });
  });

  it("returns compact exact cursor rectangles including symmetry", () => {
    expect(
      getBrushPreviewRects(
        { x: 9, y: 12 },
        { mode: "pixel-perfect", size: 4 },
        { width: 256, height: 256 },
        true,
      ),
    ).toEqual([
      { x: 8, y: 12, width: 4, height: 4 },
      { x: 244, y: 12, width: 4, height: 4 },
    ]);
  });

  it("merges an overlapping mirrored cursor into the exact visible union", () => {
    expect(
      getBrushPreviewRects(
        { x: 127, y: 40 },
        { mode: "smooth", size: 3 },
        { width: 256, height: 256 },
        true,
      ),
    ).toEqual([{ x: 126, y: 39, width: 4, height: 3 }]);
  });

  it("exposes separate freehand and stamp modes for compatibility callers", () => {
    expect(resolveBrushSpec(3)).toEqual({ mode: "smooth", size: 3 });
    expect(resolveBrushSpec(4)).toEqual({
      mode: "pixel-perfect",
      size: 4,
    });
    expect(getBrushGridStep({ mode: "smooth", size: 27 })).toBeNull();
    expect(getBrushGridStep({ mode: "pixel-perfect", size: 32 })).toBe(32);
  });
});
