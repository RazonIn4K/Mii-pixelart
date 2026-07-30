/**
 * Game-copy guidance for the 256px square face-paint canvas.
 *
 * Pixel-perfect mode exposes four stamp sizes in the observed game UI. Studio
 * keeps the same 256×256 coordinate surface instead of shrinking the document
 * until one project cell happens to equal one game stamp. That distinction is
 * important: a 4px stamp changes a snapped 4×4 block on the canonical surface,
 * while the 1px smooth brush still changes exactly one of its 65,536 cells.
 *
 * Documents from 8×8 through 256×256 remain valid Studio documents. Smaller
 * legacy grids can still be edited and exported, but they are not described as
 * one-for-one game surfaces. This module intentionally covers geometry only;
 * it does not claim that the Studio palette is an official game palette.
 */

export const GAME_CANVAS_PIXELS = 256;

export const PIXEL_PERFECT_GAME_BRUSHES = [4, 8, 16, 32] as const;

export const DEFAULT_PIXEL_PERFECT_GAME_BRUSH = 4;

export type PixelPerfectGameBrush = (typeof PIXEL_PERFECT_GAME_BRUSHES)[number];

export type GameGridSections = 0 | 2 | 4 | 8;

export interface GameMatchRecipe {
  brushPixels: PixelPerfectGameBrush | null;
  /** True only when every game pixel has its own document cell. */
  canonicalSurface: boolean;
  exact: boolean;
  gridHeight: number;
  gridWidth: number;
  /** Historical one-cell-to-one-stamp mapping, retained for conversion UI. */
  legacyCellBrushPixels: PixelPerfectGameBrush | null;
  surfacePixels: typeof GAME_CANVAS_PIXELS;
}

/**
 * Describe how a Studio document relates to the fixed game surface.
 *
 * Only 256×256 is canonical. Older 64/32/16/8 square documents expose their
 * historical cell-to-stamp scale so a caller can offer an explicit conversion,
 * but `exact` remains false because those documents cannot represent a single
 * game pixel or the separate smooth-brush footprints.
 */
export function getGameMatchRecipe(
  gridWidth: number,
  gridHeight: number,
): GameMatchRecipe {
  const square = gridWidth === gridHeight && gridWidth > 0;
  const canonicalSurface =
    square &&
    gridWidth === GAME_CANVAS_PIXELS &&
    gridHeight === GAME_CANVAS_PIXELS;
  const legacyScale = square ? GAME_CANVAS_PIXELS / gridWidth : 0;
  const legacyCellBrushPixels = PIXEL_PERFECT_GAME_BRUSHES.includes(
    legacyScale as PixelPerfectGameBrush,
  )
    ? (legacyScale as PixelPerfectGameBrush)
    : null;

  return {
    // The 4px stamp is the finest pixel-perfect option and therefore the safest
    // default for a canonical document. It is not a document-resolution scale.
    brushPixels: canonicalSurface ? DEFAULT_PIXEL_PERFECT_GAME_BRUSH : null,
    canonicalSurface,
    exact: canonicalSurface,
    gridHeight,
    gridWidth,
    legacyCellBrushPixels,
    surfacePixels: GAME_CANVAS_PIXELS,
  };
}

/** Whether a document uses the one-cell-per-game-pixel coordinate surface. */
export function isCanonicalGameSurface(
  gridWidth: number,
  gridHeight: number,
): boolean {
  return gridWidth === GAME_CANVAS_PIXELS && gridHeight === GAME_CANVAS_PIXELS;
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

/** Exact document-cell boundaries for a snapped brush cadence. */
export function getStepGridBoundaries(
  cellCount: number,
  step: number,
): number[] {
  if (cellCount <= 1 || !Number.isFinite(step) || step <= 0) return [];
  const safeStep = Math.max(1, Math.floor(step));
  const boundaries: number[] = [];
  for (let boundary = safeStep; boundary < cellCount; boundary += safeStep) {
    boundaries.push(boundary);
  }
  return boundaries;
}
