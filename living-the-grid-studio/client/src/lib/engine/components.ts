/**
 * components.ts — Connected-component detection
 *
 * Finds contiguous regions of the same color in a grid document.
 * Used by the repaint optimizer to identify "islands" (small isolated
 * groups of pixels) that can be merged into surrounding colors.
 */

import type { GridDocument } from "./grid";
import { getCell } from "./grid";

/** A connected component: a group of cells sharing the same color */
export interface Component {
  /** The color ID shared by all cells in this component */
  colorId: string;
  /** List of (x, y) coordinates belonging to this component */
  cells: [number, number][];
  /** Number of cells */
  size: number;
  /** Bounding box: [minX, minY, maxX, maxY] */
  bounds: [number, number, number, number];
}

/**
 * Find all connected components in the grid using flood fill (4-connected).
 * Empty cells (null) are skipped.
 */
export function findComponents(doc: GridDocument): Component[] {
  const visited = new Uint8Array(doc.width * doc.height);
  const components: Component[] = [];

  for (let y = 0; y < doc.height; y++) {
    for (let x = 0; x < doc.width; x++) {
      const idx = y * doc.width + x;
      if (visited[idx]) continue;

      const colorId = getCell(doc, x, y);
      if (colorId === null) {
        visited[idx] = 1;
        continue;
      }

      // BFS flood fill
      const cells: [number, number][] = [];
      const queue: [number, number][] = [[x, y]];
      visited[idx] = 1;

      let minX = x,
        minY = y,
        maxX = x,
        maxY = y;

      while (queue.length > 0) {
        const [cx, cy] = queue.pop()!;
        cells.push([cx, cy]);
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);

        // 4-connected neighbors
        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ] as [number, number][]) {
          if (nx < 0 || nx >= doc.width || ny < 0 || ny >= doc.height) continue;
          const ni = ny * doc.width + nx;
          if (visited[ni]) continue;
          if (getCell(doc, nx, ny) === colorId) {
            visited[ni] = 1;
            queue.push([nx, ny]);
          }
        }
      }

      components.push({
        colorId,
        cells,
        size: cells.length,
        bounds: [minX, minY, maxX, maxY],
      });
    }
  }

  return components;
}

/**
 * Find "island" components — small isolated regions below a size threshold.
 * These are candidates for merging into the surrounding dominant color.
 */
export function findIslands(
  doc: GridDocument,
  maxSize: number = 3
): Component[] {
  return findComponents(doc).filter((c) => c.size <= maxSize);
}

/**
 * For a given component, find the most common neighboring color.
 * This is the color the island would be merged into.
 */
export function findDominantNeighborColor(
  doc: GridDocument,
  component: Component
): string | null {
  const neighborCounts = new Map<string, number>();

  for (const [cx, cy] of component.cells) {
    for (const [nx, ny] of [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ] as [number, number][]) {
      if (nx < 0 || nx >= doc.width || ny < 0 || ny >= doc.height) continue;
      const nColor = getCell(doc, nx, ny);
      if (nColor !== null && nColor !== component.colorId) {
        neighborCounts.set(nColor, (neighborCounts.get(nColor) ?? 0) + 1);
      }
    }
  }

  let bestColor: string | null = null;
  let bestCount = 0;
  neighborCounts.forEach((count, color) => {
    if (count > bestCount) {
      bestCount = count;
      bestColor = color;
    }
  });

  return bestColor;
}

/**
 * Count the total number of distinct connected components.
 * A lower count generally means the design is easier to repaint by hand.
 */
export function countComponents(doc: GridDocument): number {
  return findComponents(doc).length;
}
