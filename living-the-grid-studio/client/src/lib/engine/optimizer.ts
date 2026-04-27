/**
 * optimizer.ts — Repaint optimizer
 *
 * Deterministic optimization passes that make a pixel grid
 * "actually repaintable by hand." Passes include:
 *   1. Color merging (merge similar colors below a Delta E threshold)
 *   2. Island removal (merge small isolated regions into neighbors)
 *   3. Single-cell cleanup (remove lone pixels)
 *   4. Palette limiting (reduce to N colors max)
 */

import type { GridDocument } from "./grid";
import { getCell, replaceColor, recomputeUsedColors, getColorUsageCounts } from "./grid";
import { findIslands, findDominantNeighborColor } from "./components";
import { deltaERgb, type RGB } from "./color";
import { TOMODACHI_PALETTE } from "./palette";

/** Configuration for the optimizer */
export interface OptimizerConfig {
  /** Delta E threshold for merging similar colors (default: 10) */
  mergeThreshold: number;
  /** Max island size for removal (default: 3 cells) */
  maxIslandSize: number;
  /** Remove single isolated cells (default: true) */
  cleanupSingleCells: boolean;
  /** Maximum number of colors in the final output (0 = no limit) */
  maxColors: number;
  /** Color IDs that should not be modified */
  lockedColors: string[];
}

export const DEFAULT_CONFIG: OptimizerConfig = {
  mergeThreshold: 10,
  maxIslandSize: 3,
  cleanupSingleCells: true,
  maxColors: 0,
  lockedColors: [],
};

/** Result of an optimization pass */
export interface OptimizationResult {
  /** The optimized document */
  doc: GridDocument;
  /** Description of what changed */
  description: string;
  /** Number of cells modified */
  cellsChanged: number;
  /** Number of colors before */
  colorsBefore: number;
  /** Number of colors after */
  colorsAfter: number;
}

/** Build an RGB lookup from palette color ID */
function colorIdToRgb(id: string): RGB | null {
  const c = TOMODACHI_PALETTE.find((p) => p.id === id);
  if (!c) return null;
  return { r: c.rgb[0], g: c.rgb[1], b: c.rgb[2] };
}

// ─── Pass 1: Color Merging ────────────────────────────────────

/**
 * Merge colors that are perceptually similar (Delta E below threshold).
 * The less-used color is replaced by the more-used one.
 */
export function passMergeColors(
  doc: GridDocument,
  config: OptimizerConfig
): OptimizationResult {
  const counts = getColorUsageCounts(doc);
  const colorIds = Array.from(counts.keys()).filter(
    (id) => !config.lockedColors.includes(id)
  );
  const colorsBefore = doc.usedColors.length;
  let result = doc;
  let cellsChanged = 0;
  const merged = new Set<string>();

  // Sort by usage (ascending) so we merge rare colors into common ones
  colorIds.sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));

  for (let i = 0; i < colorIds.length; i++) {
    if (merged.has(colorIds[i])) continue;
    const rgbA = colorIdToRgb(colorIds[i]);
    if (!rgbA) continue;

    for (let j = i + 1; j < colorIds.length; j++) {
      if (merged.has(colorIds[j])) continue;
      const rgbB = colorIdToRgb(colorIds[j]);
      if (!rgbB) continue;

      const dist = deltaERgb(rgbA, rgbB);
      if (dist < config.mergeThreshold) {
        // Merge the less-used color (i) into the more-used (j)
        const countA = counts.get(colorIds[i]) ?? 0;
        cellsChanged += countA;
        result = replaceColor(result, colorIds[i], colorIds[j]);
        merged.add(colorIds[i]);
        break;
      }
    }
  }

  result = recomputeUsedColors(result);
  return {
    doc: result,
    description: `Merged ${merged.size} similar colors (ΔE < ${config.mergeThreshold})`,
    cellsChanged,
    colorsBefore,
    colorsAfter: result.usedColors.length,
  };
}

// ─── Pass 2: Island Removal ───────────────────────────────────

/**
 * Find small isolated regions and merge them into the dominant
 * neighboring color.
 */
export function passRemoveIslands(
  doc: GridDocument,
  config: OptimizerConfig
): OptimizationResult {
  const colorsBefore = doc.usedColors.length;
  let result = doc;
  let cellsChanged = 0;
  const islands = findIslands(result, config.maxIslandSize);

  for (const island of islands) {
    if (config.lockedColors.includes(island.colorId)) continue;

    const neighborColor = findDominantNeighborColor(result, island);
    if (neighborColor && neighborColor !== island.colorId) {
      // Replace island cells with the neighbor color
      const cells = [...result.cells];
      for (const [x, y] of island.cells) {
        cells[y * result.width + x] = neighborColor;
        cellsChanged++;
      }
      result = {
        ...result,
        cells,
        meta: { ...result.meta, modifiedAt: new Date().toISOString() },
      };
    }
  }

  result = recomputeUsedColors(result);
  return {
    doc: result,
    description: `Removed ${islands.length} islands (≤${config.maxIslandSize} cells)`,
    cellsChanged,
    colorsBefore,
    colorsAfter: result.usedColors.length,
  };
}

// ─── Pass 3: Single-Cell Cleanup ──────────────────────────────

/**
 * Remove single isolated cells by replacing them with the most
 * common adjacent color.
 */
export function passCleanupSingleCells(
  doc: GridDocument,
  config: OptimizerConfig
): OptimizationResult {
  const colorsBefore = doc.usedColors.length;
  const cells = [...doc.cells];
  let cellsChanged = 0;

  for (let y = 0; y < doc.height; y++) {
    for (let x = 0; x < doc.width; x++) {
      const color = getCell(doc, x, y);
      if (color === null) continue;
      if (config.lockedColors.includes(color)) continue;

      // Check if all 4 neighbors are different
      const neighbors = [
        getCell(doc, x - 1, y),
        getCell(doc, x + 1, y),
        getCell(doc, x, y - 1),
        getCell(doc, x, y + 1),
      ].filter((c) => c !== null && c !== color);

      if (neighbors.length >= 3) {
        // This cell is isolated — replace with most common neighbor
        const neighborCounts = new Map<string, number>();
        for (const n of neighbors) {
          if (n) neighborCounts.set(n, (neighborCounts.get(n) ?? 0) + 1);
        }
        let bestColor = color;
        let bestCount = 0;
        neighborCounts.forEach((count, c) => {
          if (count > bestCount) {
            bestCount = count;
            bestColor = c;
          }
        });
        if (bestColor !== color) {
          cells[y * doc.width + x] = bestColor;
          cellsChanged++;
        }
      }
    }
  }

  let result: GridDocument = {
    ...doc,
    cells,
    meta: { ...doc.meta, modifiedAt: new Date().toISOString() },
  };
  result = recomputeUsedColors(result);

  return {
    doc: result,
    description: `Cleaned up ${cellsChanged} isolated single cells`,
    cellsChanged,
    colorsBefore,
    colorsAfter: result.usedColors.length,
  };
}

// ─── Pass 4: Palette Limiting ─────────────────────────────────

/**
 * Reduce the number of colors to maxColors by iteratively merging
 * the two most similar colors.
 */
export function passLimitPalette(
  doc: GridDocument,
  config: OptimizerConfig
): OptimizationResult {
  if (config.maxColors <= 0) {
    return {
      doc,
      description: "No palette limit set",
      cellsChanged: 0,
      colorsBefore: doc.usedColors.length,
      colorsAfter: doc.usedColors.length,
    };
  }

  const colorsBefore = doc.usedColors.length;
  let result = doc;
  let totalChanged = 0;

  while (result.usedColors.length > config.maxColors) {
    const counts = getColorUsageCounts(result);
    const unlocked = result.usedColors.filter(
      (id) => !config.lockedColors.includes(id)
    );

    if (unlocked.length <= 1) break;

    // Find the two most similar unlocked colors
    let bestDist = Infinity;
    let mergeFrom = "";
    let mergeInto = "";

    for (let i = 0; i < unlocked.length; i++) {
      const rgbA = colorIdToRgb(unlocked[i]);
      if (!rgbA) continue;
      for (let j = i + 1; j < unlocked.length; j++) {
        const rgbB = colorIdToRgb(unlocked[j]);
        if (!rgbB) continue;
        const dist = deltaERgb(rgbA, rgbB);
        if (dist < bestDist) {
          bestDist = dist;
          // Merge the less-used into the more-used
          const countA = counts.get(unlocked[i]) ?? 0;
          const countB = counts.get(unlocked[j]) ?? 0;
          if (countA <= countB) {
            mergeFrom = unlocked[i];
            mergeInto = unlocked[j];
          } else {
            mergeFrom = unlocked[j];
            mergeInto = unlocked[i];
          }
        }
      }
    }

    if (!mergeFrom || !mergeInto) break;

    const fromCount = counts.get(mergeFrom) ?? 0;
    totalChanged += fromCount;
    result = replaceColor(result, mergeFrom, mergeInto);
  }

  return {
    doc: result,
    description: `Limited palette from ${colorsBefore} to ${result.usedColors.length} colors`,
    cellsChanged: totalChanged,
    colorsBefore,
    colorsAfter: result.usedColors.length,
  };
}

// ─── Run All Passes ───────────────────────────────────────────

/**
 * Run all optimization passes in sequence.
 * Returns the final document and a log of each pass.
 */
export function optimizeGrid(
  doc: GridDocument,
  config: Partial<OptimizerConfig> = {}
): { doc: GridDocument; log: OptimizationResult[] } {
  const cfg: OptimizerConfig = { ...DEFAULT_CONFIG, ...config };
  const log: OptimizationResult[] = [];

  let current = doc;

  // Pass 1: Merge similar colors
  const merge = passMergeColors(current, cfg);
  log.push(merge);
  current = merge.doc;

  // Pass 2: Remove islands
  const islands = passRemoveIslands(current, cfg);
  log.push(islands);
  current = islands.doc;

  // Pass 3: Single-cell cleanup
  if (cfg.cleanupSingleCells) {
    const cleanup = passCleanupSingleCells(current, cfg);
    log.push(cleanup);
    current = cleanup.doc;
  }

  // Pass 4: Palette limiting
  if (cfg.maxColors > 0) {
    const limit = passLimitPalette(current, cfg);
    log.push(limit);
    current = limit.doc;
  }

  return { doc: current, log };
}
