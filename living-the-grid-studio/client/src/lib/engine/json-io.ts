/**
 * json-io.ts — JSON import/export
 *
 * Handles serialization and deserialization of GridDocument to/from JSON.
 * Also includes an adapter for Living The Grid indexed-palette exports.
 */

import type { GridDocument } from "./grid";
import { createGridDocument, recomputeUsedColors } from "./grid";
import { deltaERgb, findClosestPaletteColor, hexToRgb } from "./color";
import { TOMODACHI_PALETTE } from "./palette";

// ─── Native Format (GridDocument JSON) ────────────────────────

/** Export a GridDocument to JSON string */
export function exportGridJson(doc: GridDocument): string {
  return JSON.stringify(doc, null, 2);
}

/** Import a GridDocument from JSON string */
export function importGridJson(json: string): GridDocument {
  const parsed = JSON.parse(json);

  // Validate basic structure
  if (!parsed.version || !parsed.width || !parsed.height || !parsed.cells) {
    throw new Error("Invalid GridDocument JSON: missing required fields");
  }

  if (parsed.version !== 1) {
    throw new Error(`Unsupported GridDocument version: ${parsed.version}`);
  }

  if (parsed.cells.length !== parsed.width * parsed.height) {
    throw new Error(
      `Cell count mismatch: expected ${parsed.width * parsed.height}, got ${parsed.cells.length}`
    );
  }

  return recomputeUsedColors(parsed as GridDocument);
}

// ─── Living The Grid Native Format ────────────────────────────

/**
 * Adapter for indexed-palette Living The Grid JSON exports.
 *
 * The confirmed production v2 format uses a structure like:
 * {
 *   "width": number,
 *   "height": number,
 *   "grid": number[][] (2D array of color indices),
 *   "palette": string[] (hex colors),
 *   ...metadata
 * }
 *
 * Once the real `living-the-grid-*.json` fixture is available,
 * update this adapter to match the actual schema.
 */
export interface LtgNativeFormat {
  width?: number;
  height?: number;
  grid?: unknown;
  pixels?: unknown;
  palette?: unknown;
  name?: string;
  [key: string]: unknown;
}

interface NormalizedLtgPaletteEntry {
  hex: string;
  rgb?: [number, number, number];
  press?: {
    h: number;
    s: number;
    b: number;
  };
}

/**
 * Attempt to import a Living The Grid native JSON file.
 * Returns a GridDocument if the format is recognized, or throws.
 */
export function importLtgNative(json: string): GridDocument {
  const data: LtgNativeFormat = JSON.parse(json);

  // Try to detect the format
  if (
    hasPositiveInteger(data.width) &&
    hasPositiveInteger(data.height) &&
    data.palette !== undefined &&
    (data.grid !== undefined || data.pixels !== undefined)
  ) {
    return convertLtgToGrid(data);
  }

  // If it looks like our native format, use that
  if ((data as unknown as GridDocument).version === 1) {
    return importGridJson(json);
  }

  throw new Error(
    "Unrecognized JSON format. Expected either a GridDocument or Living The Grid native format. " +
      "Please check docs/json-format-notes.md for supported formats."
  );
}

function convertLtgToGrid(data: LtgNativeFormat): GridDocument {
  const width = data.width!;
  const height = data.height!;
  const warnings: string[] = [];
  const grid = normalizeIndexedGrid(data.grid ?? data.pixels, width, height);
  const palette = normalizeLtgPalette(data.palette);
  const paletteMappings = palette.map((hex, sourceIndex) =>
    mapHexToPaletteId(hex, sourceIndex, warnings)
  );

  const doc = createGridDocument(width, height, getLtgName(data));
  doc.meta.sourceJson = "living-the-grid-native";
  doc.meta.sourceFormat = "living-the-grid:indexed-palette";
  doc.meta.sourceMetadata = extractLtgMetadata(data);
  doc.meta.sourcePaletteMappings = paletteMappings.map(
    ({
      sourceIndex,
      sourceHex,
      sourceRgb,
      sourcePress,
      colorId,
      exact,
      deltaE,
    }) => ({
      sourceIndex,
      sourceHex,
      ...(sourceRgb ? { sourceRgb } : {}),
      ...(sourcePress ? { sourcePress } : {}),
      colorId,
      exact,
      deltaE,
    })
  );

  // Map palette indices to palette color IDs
  const cells: (string | null)[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = grid[y][x];
      if (idx === null) {
        cells.push(null);
      } else if (idx >= 0 && idx < paletteMappings.length) {
        cells.push(paletteMappings[idx].colorId);
      } else {
        warnings.push(`Cell (${x}, ${y}) references missing palette index ${idx}.`);
        cells.push(null);
      }
    }
  }

  doc.cells = cells;
  doc.meta.importWarnings = summarizeWarnings(warnings);
  return recomputeUsedColors(doc);
}

function hasPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function getLtgName(data: LtgNativeFormat): string {
  return typeof data.name === "string" && data.name.trim().length > 0
    ? data.name
    : "LTG Import";
}

function normalizeIndexedGrid(
  sourceGrid: unknown,
  width: number,
  height: number
): (number | null)[][] {
  if (!Array.isArray(sourceGrid)) {
    throw new Error("Invalid Living The Grid JSON: grid must be an array");
  }

  if (sourceGrid.length === height && sourceGrid.every(Array.isArray)) {
    return sourceGrid.map((row, y) => {
      if (!Array.isArray(row) || row.length !== width) {
        throw new Error(
          `Invalid Living The Grid JSON: row ${y} must contain ${width} cells`
        );
      }
      return row.map((value, x) => normalizePaletteIndex(value, x, y));
    });
  }

  if (sourceGrid.length === width * height) {
    const rows: (number | null)[][] = [];
    for (let y = 0; y < height; y++) {
      const row: (number | null)[] = [];
      for (let x = 0; x < width; x++) {
        row.push(normalizePaletteIndex(sourceGrid[y * width + x], x, y));
      }
      rows.push(row);
    }
    return rows;
  }

  throw new Error(
    `Invalid Living The Grid JSON: expected ${height} rows or ${width * height} flat cells`
  );
}

function normalizePaletteIndex(
  value: unknown,
  x: number,
  y: number
): number | null {
  if (value === null || value === undefined || value === -1) return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  throw new Error(
    `Invalid Living The Grid JSON: cell (${x}, ${y}) must be a palette index or null`
  );
}

function normalizeLtgPalette(sourcePalette: unknown): NormalizedLtgPaletteEntry[] {
  if (!Array.isArray(sourcePalette) || sourcePalette.length === 0) {
    throw new Error("Invalid Living The Grid JSON: palette must be a non-empty array");
  }

  return sourcePalette.map((entry, index) => {
    const hex =
      typeof entry === "string"
        ? entry
        : isRecord(entry) && typeof entry.hex === "string"
          ? entry.hex
          : isRecord(entry) && typeof entry.color === "string"
            ? entry.color
            : null;

    if (!hex || !isHexColor(hex)) {
      throw new Error(
        `Invalid Living The Grid JSON: palette entry ${index} must contain a #RRGGBB color`
      );
    }

    return {
      hex: normalizeHex(hex),
      rgb: isRecord(entry) ? normalizeRgbTuple(entry.rgb) : undefined,
      press: isRecord(entry) ? normalizePressCounts(entry.press) : undefined,
    };
  });
}

function mapHexToPaletteId(
  entry: NormalizedLtgPaletteEntry,
  sourceIndex: number,
  warnings: string[]
): {
  sourceIndex: number;
  sourceHex: string;
  sourceRgb?: [number, number, number];
  sourcePress?: {
    h: number;
    s: number;
    b: number;
  };
  colorId: string;
  exact: boolean;
  deltaE: number;
} {
  const hex = entry.hex;
  const sourceRgb = hexToRgb(hex);
  const exactMatches = TOMODACHI_PALETTE.filter(
    (color) => normalizeHex(color.hex) === hex
  );

  if (exactMatches.length > 0) {
    const preferred =
      exactMatches.find((color) => !color.isSaturated) ?? exactMatches[0];
    if (exactMatches.length > 1) {
      warnings.push(
        `Palette index ${sourceIndex} (${hex}) matches multiple game swatches; mapped to ${preferred.id}.`
      );
    }
    return {
      sourceIndex,
      sourceHex: hex,
      sourceRgb: entry.rgb,
      sourcePress: entry.press,
      colorId: preferred.id,
      exact: true,
      deltaE: 0,
    };
  }

  const match = findClosestPaletteColor(sourceRgb);
  const distance = deltaERgb(sourceRgb, {
    r: match.color.rgb[0],
    g: match.color.rgb[1],
    b: match.color.rgb[2],
  });
  warnings.push(
    `Palette index ${sourceIndex} (${hex}) has no exact game swatch; mapped to ${match.color.id} at Delta E ${distance.toFixed(2)}.`
  );

  return {
    sourceIndex,
    sourceHex: hex,
    sourceRgb: entry.rgb,
    sourcePress: entry.press,
    colorId: match.color.id,
    exact: false,
    deltaE: Number(distance.toFixed(4)),
  };
}

function normalizeRgbTuple(value: unknown): [number, number, number] | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
  ) {
    return undefined;
  }
  return [value[0], value[1], value[2]];
}

function normalizePressCounts(
  value: unknown
): { h: number; s: number; b: number } | undefined {
  if (!isRecord(value)) return undefined;
  const { h, s, b } = value;
  if (
    typeof h !== "number" ||
    typeof s !== "number" ||
    typeof b !== "number" ||
    !Number.isFinite(h) ||
    !Number.isFinite(s) ||
    !Number.isFinite(b)
  ) {
    return undefined;
  }
  return { h, s, b };
}

function extractLtgMetadata(data: LtgNativeFormat): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  const omitted = new Set(["grid", "pixels", "palette"]);
  for (const [key, value] of Object.entries(data)) {
    if (!omitted.has(key)) metadata[key] = value;
  }
  return metadata;
}

function summarizeWarnings(warnings: string[]): string[] {
  if (warnings.length <= 12) return warnings;
  return [
    ...warnings.slice(0, 12),
    `${warnings.length - 12} additional import warnings omitted.`,
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHexColor(value: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(value);
}

function normalizeHex(value: string): string {
  const clean = value.trim().replace("#", "");
  return `#${clean.toUpperCase()}`;
}

// ─── File Download Helper ─────────────────────────────────────

/** Trigger a browser download of a JSON string */
export function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Trigger a browser download of a GridDocument */
export function downloadGridDocument(doc: GridDocument): void {
  const json = exportGridJson(doc);
  const safeName = doc.meta.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  downloadJson(json, `${safeName}-${Date.now()}.json`);
}
