# Repaint Optimizer Plan

**Version:** 1.0  
**Last Updated:** 2026-04-26

---

## Goal

The repaint optimizer transforms a raw pixel grid into one that is **practical to recreate by hand** in Tomodachi Life's Palette House. The key insight is that a pixel-perfect conversion of a photograph might use 40+ colors and contain hundreds of tiny isolated regions — far too complex for manual painting. The optimizer reduces this complexity while preserving the visual intent.

## Design Principles

1. **Deterministic.** Given the same input and configuration, the optimizer always produces the same output. No randomness, no AI guessing.
2. **Reversible.** Every optimization is recorded in the undo history. Users can step back at any point.
3. **Respectful of locks.** Colors marked as "locked" by the user are never modified by any pass.
4. **Transparent.** Each pass reports what it changed: how many cells were modified, how many colors were removed, and what the before/after counts are.

## Pass Architecture

The optimizer runs four passes in a fixed sequence. Each pass is implemented as a pure function that takes a `GridDocument` and an `OptimizerConfig` and returns an `OptimizationResult`.

### Pass 1: Color Merging

**Purpose:** Reduce the number of distinct colors by merging perceptually similar pairs.

**Algorithm:**
1. Compute the usage count for each unlocked color.
2. Sort colors by usage count (ascending), so rare colors are merged first.
3. For each color, find the most similar other color using CIE76 Delta E.
4. If the Delta E is below the configured threshold, merge the less-used color into the more-used one.
5. Recompute the used colors list.

**Configuration:** `mergeThreshold` (default: 10). A Delta E of 10 is roughly the threshold where most people can distinguish two colors side by side. Lower values are stricter (fewer merges); higher values are more aggressive.

### Pass 2: Island Removal

**Purpose:** Eliminate small isolated regions that would be tedious to paint individually.

**Algorithm:**
1. Run connected-component detection (4-connected flood fill) on the grid.
2. Identify components with size ≤ `maxIslandSize`.
3. For each island, find the most common color among its 4-connected neighbors.
4. Replace all cells in the island with that neighbor color.

**Configuration:** `maxIslandSize` (default: 3 cells). Islands of 1-3 cells are almost always noise from the quantization process.

### Pass 3: Single-Cell Cleanup

**Purpose:** Remove lone pixels that survived island removal (edge cases where a cell is surrounded by 3+ different colors).

**Algorithm:**
1. For each cell, check its four cardinal neighbors.
2. If at least 3 of the 4 neighbors have a different color, the cell is "isolated."
3. Replace the cell with the most common neighbor color.

**Configuration:** `cleanupSingleCells` (default: true). Can be disabled if the user wants to preserve fine detail.

### Pass 4: Palette Limiting

**Purpose:** Reduce the total color count to a user-specified maximum.

**Algorithm:**
1. While the number of used colors exceeds `maxColors`:
   a. Find the two most similar unlocked colors (by Delta E).
   b. Merge the less-used one into the more-used one.
2. Recompute used colors.

**Configuration:** `maxColors` (default: 0, meaning no limit). Setting this to 12-16 produces grids that are comfortable to paint in a single session.

## Configuration Summary

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `mergeThreshold` | number | 10 | 1-30 | Delta E threshold for color merging |
| `maxIslandSize` | number | 3 | 1-10 | Maximum island size for removal |
| `cleanupSingleCells` | boolean | true | — | Whether to clean up lone pixels |
| `maxColors` | number | 0 | 0-84 | Maximum palette size (0 = no limit) |
| `lockedColors` | string[] | [] | — | Color IDs protected from all passes |

## Quality Metrics

After optimization, the following metrics indicate repaintability:

- **Color count:** Fewer colors = easier to paint. Target: 8-20 for most designs.
- **Component count:** Fewer distinct regions = fewer brush strokes. Target: reduce by 50%+ from raw import.
- **Largest island removed:** Shows the aggressiveness of cleanup.
- **Total cells changed:** Shows how much the image was modified.

## Future Enhancements

- **Edge-aware merging:** Consider component boundaries when merging, not just global Delta E.
- **Region-based optimization:** Allow the user to select a sub-region and optimize only that area.
- **Preset profiles:** "Quick paint" (aggressive), "Detailed" (conservative), "Custom."
- **Visual diff:** Show a before/after overlay highlighting changed cells.
