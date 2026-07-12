export type AiChatRole = "user" | "assistant";

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface AiDocumentSummary {
  name: string;
  width: number;
  height: number;
  usedColors: string[];
}

export interface AiGridImage {
  dataUrl: string;
  height: number;
  width: number;
}

export interface AiGridSketch {
  name: string;
  width: number;
  height: number;
  rows: (string | null)[][];
  notes?: string;
}

/**
 * Shared bounds for AI-generated sketches. The server rejects anything the
 * client would refuse to apply, so invalid model output never crosses the
 * API boundary; the client re-checks on apply as defense in depth.
 */
export const AI_SKETCH_LIMITS = {
  minDimension: 8,
  maxDimension: 64,
  maxNameLength: 120,
  maxNotesLength: 2000,
} as const;

/**
 * The 84 valid Tomodachi palette IDs: R1..R11 x C1..C7 plus S1..S7.
 * Keep in sync with client/src/lib/engine/palette.ts.
 */
export const PALETTE_COLOR_ID_PATTERN = /^(?:R(?:[1-9]|1[01])C[1-7]|S[1-7])$/;

export type AiGridSketchValidation =
  | { ok: true; sketch: AiGridSketch }
  | { ok: false; error: string };

/**
 * Validate untrusted model output claiming to be an AiGridSketch.
 *
 * Treats the value as a hostile build artifact: dimensions must be integers
 * within AI_SKETCH_LIMITS, the rows matrix must match the declared dimensions
 * exactly, and every cell must be null or a syntactically valid palette ID.
 * Returns a sanitized copy (trimmed/bounded name and notes) — never the
 * original object — so unexpected extra properties are dropped.
 */
export function validateAiGridSketch(value: unknown): AiGridSketchValidation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "Sketch must be a JSON object." };
  }
  const sketch = value as Record<string, unknown>;

  const width = sketch.width;
  const height = sketch.height;
  const { minDimension, maxDimension } = AI_SKETCH_LIMITS;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < minDimension ||
    width > maxDimension ||
    height < minDimension ||
    height > maxDimension
  ) {
    return {
      ok: false,
      error: `Sketch width and height must be integers from ${minDimension} to ${maxDimension}.`,
    };
  }

  const rows = sketch.rows;
  if (!Array.isArray(rows) || rows.length !== height) {
    return { ok: false, error: `Sketch must contain exactly ${height} rows.` };
  }

  const safeRows: (string | null)[][] = [];
  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    if (!Array.isArray(row) || row.length !== width) {
      return {
        ok: false,
        error: `Sketch row ${y + 1} must contain exactly ${width} cells.`,
      };
    }
    const safeRow: (string | null)[] = [];
    for (const cell of row) {
      if (cell === null) {
        safeRow.push(null);
        continue;
      }
      if (typeof cell !== "string" || !PALETTE_COLOR_ID_PATTERN.test(cell)) {
        return {
          ok: false,
          error: "Sketch used an unknown palette color ID.",
        };
      }
      safeRow.push(cell);
    }
    safeRows.push(safeRow);
  }

  const name =
    typeof sketch.name === "string" && sketch.name.trim().length > 0
      ? sketch.name.trim().slice(0, AI_SKETCH_LIMITS.maxNameLength)
      : "AI Pixel Sketch";
  const notes =
    typeof sketch.notes === "string" && sketch.notes.trim().length > 0
      ? sketch.notes.trim().slice(0, AI_SKETCH_LIMITS.maxNotesLength)
      : undefined;

  return {
    ok: true,
    sketch: {
      name,
      width,
      height,
      rows: safeRows,
      ...(notes ? { notes } : {}),
    },
  };
}

export interface AiChatRequest {
  currentDocument?: AiDocumentSummary | null;
  currentGridImage?: AiGridImage | null;
  messages: AiChatMessage[];
  model: string;
  requestSketch?: boolean;
  sessionId?: string;
}

export interface AiChatResponse {
  configured: boolean;
  model?: string;
  reply: string;
  sketch?: AiGridSketch | null;
  usage?: {
    completionTokens?: number;
    promptTokens?: number;
    totalTokens?: number;
  };
  warning?: string;
}

export interface AiModelPreset {
  context: string;
  id: string;
  label: string;
  note: string;
  pricingCompletion: string;
  pricingPrompt: string;
  rank: number;
  releaseDate: string;
  // Populated server-side by /api/ai/models when the OpenRouter catalog is
  // queryable. Clients should treat undefined as "unknown — try it".
  available?: boolean;
}

export const OPENROUTER_MODEL_PRESETS: AiModelPreset[] = [
  // FREE-ONLY curated list, verified against OpenRouter on 2026-05-16.
  // The free tier rate-limits these (≈20 req/min per IP, 200/day per account)
  // but the user pays nothing. This list is also the server-side allowlist;
  // requests cannot select arbitrary or paid models with the shared site key.
  //
  // We intentionally keep this short because OpenRouter's free-tier roster
  // rotates — every entry here was smoke-tested live before commit.
  {
    context: "1,000,000 tokens",
    id: "deepseek/deepseek-v4-flash:free",
    label: "DeepSeek V4 Flash (free)",
    note: "Fast, 1M context, strong structured output. Default pick.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 1,
    releaseDate: "2026-04-12",
  },
  {
    context: "131,072 tokens",
    id: "openai/gpt-oss-120b:free",
    label: "GPT OSS 120B (free)",
    note: "OpenAI-style 120B open model. Good at JSON / sketch grids.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 2,
    releaseDate: "2025-12-15",
  },
  {
    context: "131,072 tokens",
    id: "z-ai/glm-4.5-air:free",
    label: "GLM 4.5 Air (free)",
    note: "Alternative architecture, useful for second-opinion drafts.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 3,
    releaseDate: "2025-09-20",
  },
  {
    context: "1,000,000 tokens",
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super 120B (free)",
    note: "Large NVIDIA model. Slower but more thorough on art critique.",
    pricingCompletion: "$0.00/1M",
    pricingPrompt: "$0.00/1M",
    rank: 4,
    releaseDate: "2025-11-08",
  },
];
