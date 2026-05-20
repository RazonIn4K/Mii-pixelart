/**
 * image-import.ts — Image upload, crop, resize, and palette quantization
 *
 * Converts an uploaded image into a GridDocument by:
 *   1. Loading the image onto a canvas
 *   2. Resizing to the target grid dimensions
 *   3. Sampling each pixel and finding the closest palette color
 */

import { findClosestPaletteColor, hexToRgb, type RGB } from "./color";
import {
  createGridDocument,
  recomputeUsedColors,
  type GridDocument,
} from "./grid";
import { DEFAULT_CONFIG, passLimitPalette } from "./optimizer";

export type ImageFrameMode = "cover" | "contain" | "stretch";
export type BackgroundMode = "keep" | "flatten";
export type ImageSamplingMode = "smooth" | "crisp";

export interface ImagePlacement {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  destX: number;
  destY: number;
  destWidth: number;
  destHeight: number;
}

export interface ImageFocus {
  x: number;
  y: number;
}

export interface ImageCrop {
  /** Left crop edge as a percentage of the source image */
  x: number;
  /** Top crop edge as a percentage of the source image */
  y: number;
  /** Crop width as a percentage of the source image */
  width: number;
  /** Crop height as a percentage of the source image */
  height: number;
}

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
  /** How the source image should be framed into the target grid */
  frameMode: ImageFrameMode;
  /** Horizontal focus from 0 left to 100 right */
  focusX: number;
  /** Vertical focus from 0 top to 100 bottom */
  focusY: number;
  /** Left crop edge from 0 to 100 */
  cropX: number;
  /** Top crop edge from 0 to 100 */
  cropY: number;
  /** Crop width from 1 to 100 */
  cropWidth: number;
  /** Crop height from 1 to 100 */
  cropHeight: number;
  /** Brightness multiplier as a percentage */
  brightness: number;
  /** Contrast multiplier as a percentage */
  contrast: number;
  /** Saturation multiplier as a percentage */
  saturation: number;
  /** Whether edge-connected background pixels should be flattened before quantization */
  backgroundMode: BackgroundMode;
  /** RGB distance tolerance for background cleanup */
  backgroundTolerance: number;
  /** Background color for contain mode */
  backgroundColor: string;
  /** Sampling mode used when resizing the source into the grid */
  samplingMode: ImageSamplingMode;
}

export const DEFAULT_IMPORT_OPTIONS: ImageImportOptions = {
  gridWidth: 32,
  gridHeight: 32,
  maxColors: 24,
  useGamePalette: true,
  frameMode: "cover",
  focusX: 50,
  focusY: 50,
  cropX: 0,
  cropY: 0,
  cropWidth: 100,
  cropHeight: 100,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  backgroundMode: "keep",
  backgroundTolerance: 34,
  backgroundColor: "#FFFFFF",
  samplingMode: "smooth",
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
  gridHeight: number,
  options: Partial<ImageImportOptions> = {},
): RGB[][] {
  const opts = { ...DEFAULT_IMPORT_OPTIONS, ...options };
  const canvas = document.createElement("canvas");
  canvas.width = gridWidth;
  canvas.height = gridHeight;
  const ctx = canvas.getContext("2d")!;
  const placement = computeImagePlacement(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    gridWidth,
    gridHeight,
    opts.frameMode,
    { x: opts.focusX, y: opts.focusY },
    {
      x: opts.cropX,
      y: opts.cropY,
      width: opts.cropWidth,
      height: opts.cropHeight,
    },
  );

  ctx.fillStyle = opts.backgroundColor;
  ctx.fillRect(0, 0, gridWidth, gridHeight);
  ctx.imageSmoothingEnabled = opts.samplingMode === "smooth";
  ctx.imageSmoothingQuality = "high";
  ctx.filter = buildImageFilter(opts);
  ctx.drawImage(
    img,
    placement.sourceX,
    placement.sourceY,
    placement.sourceWidth,
    placement.sourceHeight,
    placement.destX,
    placement.destY,
    placement.destWidth,
    placement.destHeight,
  );
  ctx.filter = "none";

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

  if (opts.backgroundMode === "flatten") {
    return flattenBackgroundPixels(
      pixels,
      hexToRgb(opts.backgroundColor),
      opts.backgroundTolerance,
    );
  }

  return pixels;
}

/** Compute source crop and destination rectangle for fitting an image into a grid. */
export function computeImagePlacement(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  frameMode: ImageFrameMode,
  focus: ImageFocus = { x: 50, y: 50 },
  crop: ImageCrop = DEFAULT_IMAGE_CROP,
): ImagePlacement {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    throw new Error("Image placement dimensions must be positive");
  }

  const normalizedCrop = normalizeImageCrop(crop);
  const cropSourceX = (sourceWidth * normalizedCrop.x) / 100;
  const cropSourceY = (sourceHeight * normalizedCrop.y) / 100;
  const cropSourceWidth = (sourceWidth * normalizedCrop.width) / 100;
  const cropSourceHeight = (sourceHeight * normalizedCrop.height) / 100;

  if (frameMode === "stretch") {
    return {
      sourceX: cropSourceX,
      sourceY: cropSourceY,
      sourceWidth: cropSourceWidth,
      sourceHeight: cropSourceHeight,
      destX: 0,
      destY: 0,
      destWidth: targetWidth,
      destHeight: targetHeight,
    };
  }

  const sourceAspect = cropSourceWidth / cropSourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (frameMode === "cover") {
    if (sourceAspect > targetAspect) {
      const coverCropWidth = cropSourceHeight * targetAspect;
      const maxSourceX = cropSourceWidth - coverCropWidth;
      return {
        sourceX: cropSourceX + maxSourceX * normalizedFocus(focus.x),
        sourceY: cropSourceY,
        sourceWidth: coverCropWidth,
        sourceHeight: cropSourceHeight,
        destX: 0,
        destY: 0,
        destWidth: targetWidth,
        destHeight: targetHeight,
      };
    }

    const coverCropHeight = cropSourceWidth / targetAspect;
    const maxSourceY = cropSourceHeight - coverCropHeight;
    return {
      sourceX: cropSourceX,
      sourceY: cropSourceY + maxSourceY * normalizedFocus(focus.y),
      sourceWidth: cropSourceWidth,
      sourceHeight: coverCropHeight,
      destX: 0,
      destY: 0,
      destWidth: targetWidth,
      destHeight: targetHeight,
    };
  }

  const scale =
    sourceAspect > targetAspect
      ? targetWidth / cropSourceWidth
      : targetHeight / cropSourceHeight;
  const destWidth = cropSourceWidth * scale;
  const destHeight = cropSourceHeight * scale;
  const maxDestX = targetWidth - destWidth;
  const maxDestY = targetHeight - destHeight;
  return {
    sourceX: cropSourceX,
    sourceY: cropSourceY,
    sourceWidth: cropSourceWidth,
    sourceHeight: cropSourceHeight,
    destX: maxDestX * normalizedFocus(focus.x),
    destY: maxDestY * normalizedFocus(focus.y),
    destWidth,
    destHeight,
  };
}

const DEFAULT_IMAGE_CROP: ImageCrop = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
};

export function normalizeImageCrop(crop: Partial<ImageCrop> = {}): ImageCrop {
  const x = clampPercent(crop.x, 0);
  const y = clampPercent(crop.y, 0);
  const width = clampCropSize(crop.width, 100, x);
  const height = clampCropSize(crop.height, 100, y);
  return { x, y, width, height };
}

function clampCropSize(
  value: number | undefined,
  fallback: number,
  offset: number,
): number {
  const finite = Number.isFinite(value) ? Number(value) : fallback;
  return Math.min(100 - offset, Math.max(1, finite));
}

function clampPercent(value: number | undefined, fallback: number): number {
  const finite = Number.isFinite(value) ? Number(value) : fallback;
  return Math.min(99, Math.max(0, finite));
}

function normalizedFocus(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value / 100));
}

function buildImageFilter(options: ImageImportOptions): string {
  return [
    `brightness(${Math.max(0, options.brightness)}%)`,
    `contrast(${Math.max(0, options.contrast)}%)`,
    `saturate(${Math.max(0, options.saturation)}%)`,
  ].join(" ");
}

/** Estimate the dominant background color from the outer edge of sampled pixels. */
export function estimateEdgeBackgroundColor(pixels: RGB[][]): RGB {
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;
  if (width === 0 || height === 0) {
    throw new Error("Cannot estimate background color from an empty image");
  }

  const buckets = new Map<
    string,
    { count: number; totalR: number; totalG: number; totalB: number }
  >();
  const bucketSize = 16;
  const addPixel = (pixel: RGB) => {
    const key = [
      Math.floor(pixel.r / bucketSize),
      Math.floor(pixel.g / bucketSize),
      Math.floor(pixel.b / bucketSize),
    ].join(":");
    const bucket = buckets.get(key) ?? {
      count: 0,
      totalR: 0,
      totalG: 0,
      totalB: 0,
    };
    bucket.count += 1;
    bucket.totalR += pixel.r;
    bucket.totalG += pixel.g;
    bucket.totalB += pixel.b;
    buckets.set(key, bucket);
  };

  for (let x = 0; x < width; x++) {
    addPixel(pixels[0][x]);
    if (height > 1) addPixel(pixels[height - 1][x]);
  }
  for (let y = 1; y < height - 1; y++) {
    addPixel(pixels[y][0]);
    if (width > 1) addPixel(pixels[y][width - 1]);
  }

  const bucketValues = Array.from(buckets.values());
  if (bucketValues.length === 0) {
    throw new Error("Cannot estimate background color from an empty image");
  }
  const best = bucketValues.reduce((winner, bucket) =>
    bucket.count > winner.count ? bucket : winner,
  );

  return {
    r: Math.round(best.totalR / best.count),
    g: Math.round(best.totalG / best.count),
    b: Math.round(best.totalB / best.count),
  };
}

/** Replace edge-connected background pixels with a single clean color. */
export function flattenBackgroundPixels(
  pixels: RGB[][],
  replacement: RGB,
  tolerance: number,
): RGB[][] {
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;
  if (width === 0 || height === 0) return pixels;

  const background = estimateEdgeBackgroundColor(pixels);
  const limit = Math.max(0, tolerance);
  const out = pixels.map((row) => row.map((pixel) => ({ ...pixel })));
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const indexOf = (x: number, y: number) => y * width + x;
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = indexOf(x, y);
    if (visited[index]) return;
    visited[index] = 1;
    if (rgbDistance(pixels[y][x], background) <= limit) {
      queue.push(index);
    }
  };

  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    out[y][x] = { ...replacement };
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return out;
}

function rgbDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/**
 * Convert an image file to a GridDocument.
 */
export async function imageToGridDocument(
  file: File,
  options: Partial<ImageImportOptions> = {},
): Promise<GridDocument> {
  const opts = { ...DEFAULT_IMPORT_OPTIONS, ...options };
  const img = await loadImage(file);

  // Sample the image at grid resolution
  const pixels = sampleImage(img, opts.gridWidth, opts.gridHeight, opts);

  // Create the grid document
  const doc = createGridDocument(
    opts.gridWidth,
    opts.gridHeight,
    file.name.replace(/\.[^.]+$/, ""),
  );
  doc.meta.sourceImage = file.name;
  doc.meta.sourceFormat = "image";
  doc.meta.sourceMetadata = {
    imageImport: {
      gridWidth: opts.gridWidth,
      gridHeight: opts.gridHeight,
      maxColors: opts.maxColors,
      useGamePalette: opts.useGamePalette,
      frameMode: opts.frameMode,
      focusX: opts.focusX,
      focusY: opts.focusY,
      cropX: opts.cropX,
      cropY: opts.cropY,
      cropWidth: opts.cropWidth,
      cropHeight: opts.cropHeight,
      brightness: opts.brightness,
      contrast: opts.contrast,
      saturation: opts.saturation,
      backgroundMode: opts.backgroundMode,
      backgroundTolerance: opts.backgroundTolerance,
      backgroundColor: opts.backgroundColor,
      samplingMode: opts.samplingMode,
    },
  };

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
        const hex =
          `#${rgb.r.toString(16).padStart(2, "0")}${rgb.g.toString(16).padStart(2, "0")}${rgb.b.toString(16).padStart(2, "0")}`.toUpperCase();
        cells.push(hex);
      }
    }
  }

  doc.cells = cells;

  // Clean up
  URL.revokeObjectURL(img.src);

  const imported = recomputeUsedColors(doc);
  if (
    opts.useGamePalette &&
    opts.maxColors > 0 &&
    imported.usedColors.length > opts.maxColors
  ) {
    return passLimitPalette(imported, {
      ...DEFAULT_CONFIG,
      maxColors: opts.maxColors,
    }).doc;
  }

  return imported;
}

/**
 * Get a preview of the image at grid resolution as a data URL.
 */
export async function getImagePreview(
  file: File,
  gridWidth: number,
  gridHeight: number,
  scale: number = 8,
  options: Partial<ImageImportOptions> = {},
): Promise<string> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = gridWidth * scale;
  canvas.height = gridHeight * scale;
  const ctx = canvas.getContext("2d")!;
  const pixels = sampleImage(img, gridWidth, gridHeight, options);
  const preview = document.createElement("canvas");
  preview.width = gridWidth;
  preview.height = gridHeight;
  const previewCtx = preview.getContext("2d")!;
  const imageData = previewCtx.createImageData(gridWidth, gridHeight);

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const i = (y * gridWidth + x) * 4;
      const rgb = pixels[y][x];
      imageData.data[i] = rgb.r;
      imageData.data[i + 1] = rgb.g;
      imageData.data[i + 2] = rgb.b;
      imageData.data[i + 3] = 255;
    }
  }

  ctx.imageSmoothingEnabled = false;
  previewCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(preview, 0, 0, gridWidth * scale, gridHeight * scale);

  URL.revokeObjectURL(img.src);
  return canvas.toDataURL("image/png");
}
