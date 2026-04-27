/**
 * json-io.ts — JSON import/export
 *
 * Handles serialization and deserialization of GridDocument to/from JSON.
 * Also includes a placeholder adapter for the Living The Grid native format
 * (to be finalized once the real JSON fixture is inspected).
 */

import type { GridDocument } from "./grid";
import { createGridDocument, recomputeUsedColors } from "./grid";

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

// ─── Living The Grid Native Format (Placeholder) ──────────────

/**
 * Placeholder adapter for the Living The Grid native JSON format.
 *
 * IMPORTANT: The real format has not been inspected yet.
 * This adapter assumes a structure like:
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
  grid?: number[][];
  palette?: string[];
  name?: string;
  [key: string]: unknown;
}

/**
 * Attempt to import a Living The Grid native JSON file.
 * Returns a GridDocument if the format is recognized, or throws.
 */
export function importLtgNative(json: string): GridDocument {
  const data: LtgNativeFormat = JSON.parse(json);

  // Try to detect the format
  if (data.grid && data.palette && data.width && data.height) {
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
  const grid = data.grid!;
  const palette = data.palette!;

  const doc = createGridDocument(width, height, data.name ?? "LTG Import");
  doc.meta.sourceJson = "living-the-grid-native";

  // Map palette indices to palette color IDs
  // For now, store the hex as the color ID (prefixed with #)
  // A proper implementation would map to TOMODACHI_PALETTE IDs
  const cells: (string | null)[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = grid[y]?.[x];
      if (idx !== undefined && idx >= 0 && idx < palette.length) {
        cells.push(palette[idx]);
      } else {
        cells.push(null);
      }
    }
  }

  doc.cells = cells;
  return recomputeUsedColors(doc);
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
