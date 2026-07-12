import { describe, expect, it } from "vitest";

import {
  AI_SKETCH_LIMITS,
  PALETTE_COLOR_ID_PATTERN,
  validateAiGridSketch,
} from "./ai";

const validRows = (width: number, height: number) =>
  Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x === y ? "R10C1" : null)),
  );

const validSketch = () => ({
  name: "Test Sketch",
  width: 8,
  height: 8,
  rows: validRows(8, 8),
});

describe("PALETTE_COLOR_ID_PATTERN", () => {
  it("accepts the full R1..R11 x C1..C7 and S1..S7 space", () => {
    for (let row = 1; row <= 11; row += 1) {
      for (let col = 1; col <= 7; col += 1) {
        expect(PALETTE_COLOR_ID_PATTERN.test(`R${row}C${col}`)).toBe(true);
      }
    }
    for (let col = 1; col <= 7; col += 1) {
      expect(PALETTE_COLOR_ID_PATTERN.test(`S${col}`)).toBe(true);
    }
  });

  it.each(["R0C1", "R12C1", "R1C0", "R1C8", "S0", "S8", "#FF0000", "r1c1", ""])(
    "rejects out-of-range or malformed IDs (%s)",
    (id) => {
      expect(PALETTE_COLOR_ID_PATTERN.test(id)).toBe(false);
    },
  );
});

describe("validateAiGridSketch", () => {
  it("accepts a valid sketch and returns a sanitized copy", () => {
    const input = { ...validSketch(), extra: "dropped", notes: "  hi  " };
    const result = validateAiGridSketch(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sketch).not.toBe(input);
    expect(result.sketch.name).toBe("Test Sketch");
    expect(result.sketch.notes).toBe("hi");
    expect("extra" in result.sketch).toBe(false);
    expect(result.sketch.rows).toHaveLength(8);
  });

  it("defaults a missing name and caps its length", () => {
    const unnamed = validateAiGridSketch({ ...validSketch(), name: "  " });
    expect(unnamed.ok && unnamed.sketch.name).toBe("AI Pixel Sketch");

    const long = validateAiGridSketch({
      ...validSketch(),
      name: "x".repeat(500),
    });
    expect(long.ok && long.sketch.name.length).toBe(
      AI_SKETCH_LIMITS.maxNameLength,
    );
  });

  it.each([null, undefined, [], "sketch", 42])(
    "rejects non-object values (%s)",
    (value) => {
      expect(validateAiGridSketch(value).ok).toBe(false);
    },
  );

  it.each([
    { width: 7, height: 8 },
    { width: 8, height: 65 },
    { width: 8.5, height: 8 },
    { width: "8", height: 8 },
    { width: -8, height: 8 },
  ])("rejects out-of-bounds dimensions (%j)", (dims) => {
    const result = validateAiGridSketch({ ...validSketch(), ...dims });
    expect(result.ok).toBe(false);
  });

  it("rejects a row-count mismatch", () => {
    const result = validateAiGridSketch({
      ...validSketch(),
      rows: validRows(8, 7),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("8 rows");
  });

  it("rejects a row-width mismatch", () => {
    const rows = validRows(8, 8);
    rows[3] = rows[3].slice(0, 7);
    const result = validateAiGridSketch({ ...validSketch(), rows });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("row 4");
  });

  it.each(["NOTACOLOR", "#FF0000", "R12C1", 7, {}, []])(
    "rejects invalid cell values (%s)",
    (cell) => {
      const rows = validRows(8, 8) as unknown[][];
      rows[0][0] = cell;
      const result = validateAiGridSketch({ ...validSketch(), rows });
      expect(result.ok).toBe(false);
    },
  );
});
