import { describe, expect, it } from "vitest";
import { getGameGridBoundaries, getGameMatchRecipe } from "./game-match";

describe("game-match", () => {
  it.each([
    [64, 4],
    [32, 8],
    [16, 16],
    [8, 32],
  ])("maps a %i square grid to the %ipx pixel-perfect brush", (size, brush) => {
    expect(getGameMatchRecipe(size, size)).toEqual({
      brushPixels: brush,
      exact: true,
      gridHeight: size,
      gridWidth: size,
    });
  });

  it.each([
    [96, 96],
    [128, 128],
    [256, 256],
    [64, 32],
  ])("does not overstate a custom %i by %i grid as exact", (width, height) => {
    expect(getGameMatchRecipe(width, height)).toMatchObject({
      brushPixels: null,
      exact: false,
    });
  });

  it("builds the exact 8 by 8 guide boundaries for a 64-cell grid", () => {
    expect(getGameGridBoundaries(64, 8)).toEqual([8, 16, 24, 32, 40, 48, 56]);
  });

  it("returns no boundaries when the game overlay is off", () => {
    expect(getGameGridBoundaries(64, 0)).toEqual([]);
  });

  it("deduplicates rounded boundaries for very small custom grids", () => {
    expect(getGameGridBoundaries(3, 8)).toEqual([1, 2]);
  });
});
