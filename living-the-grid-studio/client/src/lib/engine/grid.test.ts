import { describe, expect, it } from "vitest";

import { containGridNearest, createGridDocument, setCells } from "./grid";

describe("containGridNearest", () => {
  it("centers a tall source with square whole-number blocks", () => {
    const source = setCells(
      createGridDocument(8, 16, "Tall source"),
      [
        { x: 0, y: 0 },
        { x: 7, y: 15 },
      ],
      "R1C1",
    );

    const contained = containGridNearest(source, 256, 256);

    expect(contained.width).toBe(256);
    expect(contained.height).toBe(256);
    // 8×16 fits at 16×, leaving 64 transparent columns on either side.
    expect(contained.cells[0]).toBeNull();
    for (let y = 0; y < 16; y += 1) {
      for (let x = 64; x < 80; x += 1) {
        expect(contained.cells[y * 256 + x]).toBe("R1C1");
      }
    }
    expect(contained.cells[15 * 256 + 80]).toBeNull();
    expect(contained.cells[240 * 256 + 176]).toBe("R1C1");
    expect(contained.cells[255 * 256 + 191]).toBe("R1C1");
    expect(contained.cells[255 * 256 + 192]).toBeNull();
  });

  it("keeps one rectangular-source cell square on the 256 surface", () => {
    const source = setCells(
      createGridDocument(32, 64, "Portrait source"),
      [{ x: 10, y: 20 }],
      "R2C2",
    );

    const contained = containGridNearest(source, 256, 256);
    const left = 64 + 10 * 4;
    const top = 20 * 4;

    for (let y = top; y < top + 4; y += 1) {
      for (let x = left; x < left + 4; x += 1) {
        expect(contained.cells[y * 256 + x]).toBe("R2C2");
      }
    }
    expect(contained.cells[top * 256 + left - 1]).toBeNull();
    expect(contained.cells[(top + 4) * 256 + left]).toBeNull();
  });
});
