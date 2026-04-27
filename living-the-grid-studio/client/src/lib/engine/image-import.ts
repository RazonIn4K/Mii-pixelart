/**
 * image-import.ts — Image upload, crop, resize, and palette quantization
 *
 * Converts an uploaded image into a GridDocument by:
 *   1. Loading the image onto a canvas
 *   2. Resizing to the target grid dimensions
 *   3. Sampling each pixel and finding the closest palette color
 */

import { findClosestPaletteColor, type RGB } from "./color";
import { createGridDocument, recomputeUsedColors, type GridDocument } from "./grid";

/** Options for image import */
export interface ImageImportOptions {
  /** Target grid width in cells (default: 32) */
  gridWidth: number;
  /** Target grid height in cells (default: 32) */
  gridHeight: number;
  /** Maximum number of colors to use (0 = no limit) */
  maxColors: number;
  /** Whether to use only the game palette */
  useGamePalette: boolean;
}

export const DEFAULT_IMPORT_OPTIONS: ImageImportOptions = {
  gridWidth: 32,
  gridHeight: 32,
  maxColors: 0,
  useGamePalette: true,
};

/**
 * Load an image file and return an HTMLImageElement.
 */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Sample pixel data from an image at the given grid resolution.
 * Returns a 2D array of RGB values.
 */
export function sampleImage(
  img: HTMLImageElement,
  gridWidth: number,
  gridHeight: number
): RGB[][] {
  const canvas = document.createElement("canvas");
  canvas.width = gridWidth;
  canvas.height = gridHeight;
  const ctx = canvas.getContext("2d")!;

  // Draw the image scaled down to grid size
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, gridWidth, gridHeight);

  const imageData = ctx.getImageData(0, 0, gridWidth, gridHeight);
  const pixels: RGB[][] = [];

  for (let y = 0; y < gridHeight; y++) {
    const row: RGB[] = [];
    for (let x = 0; x < gridWidth; x++) {
      const i = (y * gridWidth + x) * 4;
      row.push({
        r: imageData.data[i],
        g: imageData.data[i + 1],
        b: imageData.data[i + 2],
      });
    }
    pixels.push(row);
  }

  return pixels;
}

/**
 * Convert an image file to a GridDocument.
 */
export async function imageToGridDocument(
  file: File,
  options: Partial<ImageImportOptions> = {}
): Promise<GridDocument> {
  const opts = { ...DEFAULT_IMPORT_OPTIONS, ...options };
  const img = await loadImage(file);

  // Sample the image at grid resolution
  const pixels = sampleImage(img, opts.gridWidth, opts.gridHeight);

  // Create the grid document
  const doc = createGridDocument(
    opts.gridWidth,
    opts.gridHeight,
    file.name.replace(/\.[^.]+$/, "")
  );
  doc.meta.sourceImage = file.name;

  // Map each pixel to the closest palette color
  const cells: (string | null)[] = [];
  for (let y = 0; y < opts.gridHeight; y++) {
    for (let x = 0; x < opts.gridWidth; x++) {
      const rgb = pixels[y][x];
      if (opts.useGamePalette) {
        const match = findClosestPaletteColor(rgb);
        cells.push(match.color.id);
      } else {
        // Store raw hex for non-palette mode
        const hex = `#${rgb.r.toString(16).padStart(2, "0")}${rgb.g.toString(16).padStart(2, "0")}${rgb.b.toString(16).padStart(2, "0")}`.toUpperCase();
        cells.push(hex);
      }
    }
  }

  doc.cells = cells;

  // Clean up
  URL.revokeObjectURL(img.src);

  return recomputeUsedColors(doc);
}

/**
 * Get a preview of the image at grid resolution as a data URL.
 */
export async function getImagePreview(
  file: File,
  gridWidth: number,
  gridHeight: number,
  scale: number = 8
): Promise<string> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = gridWidth * scale;
  canvas.height = gridHeight * scale;
  const ctx = canvas.getContext("2d")!;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, gridWidth, gridHeight);
  ctx.drawImage(canvas, 0, 0, gridWidth, gridHeight, 0, 0, gridWidth * scale, gridHeight * scale);

  URL.revokeObjectURL(img.src);
  return canvas.toDataURL("image/png");
}
