import { describe, expect, it } from "vitest";
import {
  GAME_CANVAS_PIXELS,
  getGameGridBoundaries,
  getGameMatchRecipe,
  getStepGridBoundaries,
  isCanonicalGameSurface,
} from "./game-match";

describe("game-match", () => {
  it("treats the true 256 by 256 surface as the only exact game match", () => {
    expect(getGameMatchRecipe(256, 256)).toEqual({
      brushPixels: 4,
      canonicalSurface: true,
      exact: true,
      gridHeight: 256,
      gridWidth: 256,
      legacyCellBrushPixels: null,
      surfacePixels: GAME_CANVAS_PIXELS,
    });
    expect(isCanonicalGameSurface(256, 256)).toBe(true);
    expect(isCanonicalGameSurface(256, 128)).toBe(false);
  });

  it.each([
    [64, 4],
    [32, 8],
    [16, 16],
    [8, 32],
  ])(
    "keeps legacy %i grids valid without claiming they are exact",
    (size, brush) => {
      expect(getGameMatchRecipe(size, size)).toMatchObject({
        brushPixels: null,
        canonicalSurface: false,
        exact: false,
        legacyCellBrushPixels: brush,
      });
    },
  );

  it.each([
    [96, 96],
    [128, 128],
    [64, 32],
  ])("does not overstate a custom %i by %i grid as exact", (width, height) => {
    expect(getGameMatchRecipe(width, height)).toMatchObject({
      brushPixels: null,
      canonicalSurface: false,
      exact: false,
      legacyCellBrushPixels: null,
    });
  });

  it("builds the exact 8 by 8 boundaries on the 256px surface", () => {
    expect(getGameGridBoundaries(256, 8)).toEqual([
      32, 64, 96, 128, 160, 192, 224,
    ]);
  });

  it("returns no boundaries when the game overlay is off", () => {
    expect(getGameGridBoundaries(64, 0)).toEqual([]);
  });

  it("deduplicates rounded boundaries for very small custom grids", () => {
    expect(getGameGridBoundaries(3, 8)).toEqual([1, 2]);
  });

  it("builds an exact snapped brush cadence independently of game sections", () => {
    expect(getStepGridBoundaries(256, 32)).toEqual([
      32, 64, 96, 128, 160, 192, 224,
    ]);
    expect(getStepGridBoundaries(256, 4)).toHaveLength(63);
    expect(getStepGridBoundaries(64, 0)).toEqual([]);
  });
});
