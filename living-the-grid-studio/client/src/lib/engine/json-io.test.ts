import { describe, expect, it } from "vitest";

import { importGridJson, importLtgNative } from "./json-io";

const ltgFile = (width: number, height: number, overrides: object = {}) =>
  JSON.stringify({
    width,
    height,
    palette: ["#FF0000", "#00FF00"],
    grid: Array.from({ length: height }, () => new Array(width).fill(0)),
    ...overrides,
  });

describe("importLtgNative dimension bounds", () => {
  it("imports a small indexed-palette LTG file", () => {
    const doc = importLtgNative(ltgFile(4, 4));
    expect(doc.width).toBe(4);
    expect(doc.height).toBe(4);
    expect(doc.cells).toHaveLength(16);
    expect(
      doc.cells.every((cell) => cell === null || /^(R|S)/.test(cell)),
    ).toBe(true);
  });

  it("rejects dimensions above the 256 grid ceiling before allocating", () => {
    // Deliberately do NOT build a matching giant grid — the bound must trip
    // on the declared dimensions alone.
    const hostile = JSON.stringify({
      width: 100_000,
      height: 100_000,
      palette: ["#FF0000"],
      grid: [],
    });
    expect(() => importLtgNative(hostile)).toThrow(/must not exceed 256x256/);
  });

  it("rejects one oversized axis even when the other is small", () => {
    const hostile = JSON.stringify({
      width: 257,
      height: 8,
      palette: ["#FF0000"],
      grid: [],
    });
    expect(() => importLtgNative(hostile)).toThrow(/must not exceed 256x256/);
  });

  it("still accepts the native GridDocument path through the shared schema", () => {
    const doc = importGridJson(
      JSON.stringify({
        version: 1,
        meta: {
          name: "Native",
          createdAt: "2026-01-01T00:00:00.000Z",
          modifiedAt: "2026-01-01T00:00:00.000Z",
        },
        width: 8,
        height: 8,
        cells: new Array(64).fill("R1C1"),
        usedColors: ["R1C1"],
        lockedColors: [],
      }),
    );
    expect(doc.width).toBe(8);
    expect(doc.usedColors).toEqual(["R1C1"]);
  });

  it("rejects native documents with non-palette cells", () => {
    expect(() =>
      importGridJson(
        JSON.stringify({
          version: 1,
          meta: {
            name: "Bad",
            createdAt: "2026-01-01T00:00:00.000Z",
            modifiedAt: "2026-01-01T00:00:00.000Z",
          },
          width: 8,
          height: 8,
          cells: [...new Array(63).fill("R1C1"), "#FF0000"],
          usedColors: ["R1C1"],
          lockedColors: [],
        }),
      ),
    ).toThrow();
  });
});
