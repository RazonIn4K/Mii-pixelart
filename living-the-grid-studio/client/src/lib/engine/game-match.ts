/**
 * Game-copy guidance for the 256px square face-paint canvas.
 *
 * Pixel-perfect mode exposes four brush sizes in the observed game UI. Each
 * brush becomes one project cell in Studio, so the project resolution tells a
 * player which brush to choose when copying the design back into the game.
 * This module intentionally covers geometry only; it does not claim that the
 * Studio working palette is an official or exact game palette.
 */

export const GAME_CANVAS_PIXELS = 256;

export const PIXEL_PERFECT_GAME_BRUSHES = [4, 8, 16, 32] as const;

export type PixelPerfectGameBrush = (typeof PIXEL_PERFECT_GAME_BRUSHES)[number];

export type GameGridSections = 0 | 2 | 4 | 8;

export interface GameMatchRecipe {
  brushPixels: PixelPerfectGameBrush | null;
  exact: boolean;
  gridHeight: number;
  gridWidth: number;
}

/**
 * Return an exact pixel-perfect brush match for square Studio grids.
 *
 * 64 cells × 4px, 32 × 8px, 16 × 16px, and 8 × 32px all cover the
 * complete 256px game canvas one-for-one. Other resolutions remain valid
 * Studio projects, but need Copy Guide/custom placement rather than an exact
 * one-brush-per-cell claim.
 */
export function getGameMatchRecipe(
  gridWidth: number,
  gridHeight: number,
): GameMatchRecipe {
  if (gridWidth !== gridHeight || gridWidth <= 0) {
    return {
      brushPixels: null,
      exact: false,
      gridHeight,
      gridWidth,
    };
  }

  const brushPixels = GAME_CANVAS_PIXELS / gridWidth;
  const exact = PIXEL_PERFECT_GAME_BRUSHES.includes(
    brushPixels as PixelPerfectGameBrush,
  );

  return {
    brushPixels: exact ? (brushPixels as PixelPerfectGameBrush) : null,
    exact,
    gridHeight,
    gridWidth,
  };
}

/** Cell boundaries for an in-game 2×2, 4×4, or 8×8 guide overlay. */
export function getGameGridBoundaries(
  cellCount: number,
  sections: GameGridSections,
): number[] {
  if (sections === 0 || cellCount <= 1) return [];

  return Array.from({ length: sections - 1 }, (_, index) =>
    Math.round(((index + 1) * cellCount) / sections),
  ).filter(
    (boundary, index, boundaries) =>
      boundary > 0 &&
      boundary < cellCount &&
      boundaries.indexOf(boundary) === index,
  );
}
