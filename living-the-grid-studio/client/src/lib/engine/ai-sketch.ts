import type { AiGridSketch } from "@shared/ai";
import {
  createGridDocument,
  recomputeUsedColors,
  type GridDocument,
} from "./grid";
import { getPaletteColor } from "./palette";

export function createGridDocumentFromAiSketch(
  sketch: AiGridSketch,
): GridDocument {
  const width = normalizeDimension(sketch.width, "width");
  const height = normalizeDimension(sketch.height, "height");
  if (!Array.isArray(sketch.rows) || sketch.rows.length !== height) {
    throw new Error(`AI sketch must contain exactly ${height} rows.`);
  }

  const cells: (string | null)[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = sketch.rows[y];
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error(`AI sketch row ${y + 1} must contain ${width} cells.`);
    }
    for (const value of row) {
      if (value === null) {
        cells.push(null);
        continue;
      }
      if (typeof value !== "string" || !getPaletteColor(value)) {
        throw new Error(`AI sketch used an unknown palette color: ${value}`);
      }
      cells.push(value);
    }
  }

  const doc = createGridDocument(
    width,
    height,
    sketch.name?.trim() || "AI Pixel Sketch",
  );
  return recomputeUsedColors({
    ...doc,
    cells,
    meta: {
      ...doc.meta,
      notes: sketch.notes,
      sourceFormat: "ai-openrouter-sketch",
      sourceMetadata: {
        generatedBy: "OpenRouter",
      },
    },
  });
}

function normalizeDimension(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 8 || value > 64) {
    throw new Error(`AI sketch ${label} must be an integer from 8 to 64.`);
  }
  return value;
}
