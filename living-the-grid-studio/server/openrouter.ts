import type { AiChatRequest, AiChatResponse, AiGridSketch } from "../shared/ai";
import { OPENROUTER_MODEL_PRESETS } from "../shared/ai";
// Resident Designer prompt retired alongside the Island tab in Pass 19.
// Keep the shared/residents.ts file for ExportPanel.validateMiiResidentSpec.

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string | OpenRouterContentPart[];
}

type OpenRouterContentPart =
  | {
      text: string;
      type: "text";
    }
  | {
      image_url: {
        detail?: "auto" | "high" | "low";
        url: string;
      };
      type: "image_url";
    };

interface OpenRouterResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
  error?: {
    message?: string;
  };
  model?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
}

export interface ApiResult {
  body: unknown;
  status: number;
}

/**
 * Minimal env shape consumed by this module. Both Node (`process.env`) and
 * Cloudflare Workers (`context.env`) can satisfy it. Pass an `env` argument
 * explicitly from edge runtimes; Node callers can omit it and we'll fall back
 * to `process.env`.
 */
export interface OpenRouterEnv {
  OPENROUTER_API_KEY?: string;
  PUBLIC_SITE_URL?: string;
}

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export function getOpenRouterStatus(env?: OpenRouterEnv): ApiResult {
  return {
    status: 200,
    body: {
      configured: Boolean(getOpenRouterApiKey(env)),
      envVar: "OPENROUTER_API_KEY",
      presets: OPENROUTER_MODEL_PRESETS,
    },
  };
}

export async function getOpenRouterModels(env?: OpenRouterEnv): Promise<ApiResult> {
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: getOpenRouterHeaders(false, undefined, env),
    });
    if (!response.ok) {
      return {
        status: 200,
        body: {
          presets: OPENROUTER_MODEL_PRESETS,
          warning: `OpenRouter models request returned ${response.status}.`,
        },
      };
    }

    const payload = (await response.json()) as {
      data?: { id?: string; name?: string }[];
    };
    const availableIds = new Set(
      (payload.data ?? []).map((model) => model.id).filter(Boolean),
    );
    return {
      status: 200,
      body: {
        presets: OPENROUTER_MODEL_PRESETS.map((preset) => ({
          ...preset,
          available: availableIds.has(preset.id),
        })),
      },
    };
  } catch (error) {
    return {
      status: 200,
      body: {
        presets: OPENROUTER_MODEL_PRESETS,
        warning:
          error instanceof Error
            ? error.message
            : "Could not reach OpenRouter models endpoint.",
      },
    };
  }
}

export async function sendOpenRouterChat(
  request: AiChatRequest,
  env?: OpenRouterEnv,
): Promise<ApiResult> {
  const apiKey = getOpenRouterApiKey(env);
  if (!apiKey) {
    return {
      status: 501,
      body: {
        configured: false,
        reply:
          "OpenRouter is not configured. Set OPENROUTER_API_KEY in the shell that starts the dev server, then restart pnpm dev.",
      } satisfies AiChatResponse,
    };
  }

  const normalized = normalizeAiRequest(request);
  if (!normalized.ok) {
    return { status: 400, body: { configured: true, reply: normalized.error } };
  }

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: buildAiSystemPrompt(Boolean(request.requestSketch)),
    },
    ...buildContextMessages(request),
    ...normalized.messages,
  ];

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: getOpenRouterHeaders(true, apiKey, env),
    body: JSON.stringify({
      // Sketch budget math: 16x16=256 cells, 24x24=576, 32x32=1024. Each cell
      // is ~6-8 tokens ("R10C7", comma+space). 1024 cells × 8 tokens ≈ 8192
      // tokens for rows alone, plus a few hundred tokens of wrapping JSON +
      // commentary. 3000 was the old budget and it was truncating mid-row,
      // which is why DeepSeek + Claude both spat out partial/invalid grids.
      // 16000 fits even 32x32 with room to breathe.
      max_tokens: request.requestSketch ? 16000 : 1200,
      messages,
      model: normalized.model,
      response_format: request.requestSketch
        ? { type: "json_object" }
        : undefined,
      session_id: normalizeSessionId(request.sessionId),
      // Lower temperature for sketches — we want deterministic structure, not
      // creative reinterpretation of the schema. 0.2 keeps it on-grid.
      temperature: request.requestSketch ? 0.2 : 0.7,
    }),
  });

  const payload = (await response
    .json()
    .catch(() => null)) as OpenRouterResponse | null;

  if (!response.ok) {
    return {
      status: response.status,
      body: {
        configured: true,
        model: normalized.model,
        reply:
          payload?.error?.message ??
          `OpenRouter request failed with status ${response.status}.`,
      } satisfies AiChatResponse,
    };
  }

  const content = payload?.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = request.requestSketch ? parseSketchContent(content) : null;
  const reply =
    parsed?.reply ??
    content ??
    "The model returned an empty response. Try a different model.";

  return {
    status: 200,
    body: {
      configured: true,
      model: payload?.model ?? normalized.model,
      reply,
      sketch: parsed?.sketch ?? null,
      usage: payload?.usage
        ? {
            completionTokens: payload.usage.completion_tokens,
            promptTokens: payload.usage.prompt_tokens,
            totalTokens: payload.usage.total_tokens,
          }
        : undefined,
      warning: parsed?.warning,
    } satisfies AiChatResponse,
  };
}

function getOpenRouterApiKey(env?: OpenRouterEnv): string {
  if (env?.OPENROUTER_API_KEY) {
    const value = env.OPENROUTER_API_KEY.trim();
    if (value) return value;
  }
  if (typeof process !== "undefined" && process.env?.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY.trim();
  }
  return "";
}

function getOpenRouterReferer(env?: OpenRouterEnv): string {
  const fromEnv = env?.PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv;
  if (typeof process !== "undefined" && process.env?.PUBLIC_SITE_URL) {
    return process.env.PUBLIC_SITE_URL.trim();
  }
  return "http://localhost:3000";
}

function getOpenRouterHeaders(
  authenticated: boolean,
  apiKey?: string,
  env?: OpenRouterEnv,
): HeadersInit {
  const key = apiKey ?? getOpenRouterApiKey(env);
  return {
    ...(authenticated ? { Authorization: `Bearer ${key}` } : {}),
    "Content-Type": "application/json",
    "HTTP-Referer": getOpenRouterReferer(env),
    "X-OpenRouter-Title": "Living The Grid Studio",
  };
}

function normalizeAiRequest(
  request: AiChatRequest,
):
  | { messages: OpenRouterMessage[]; model: string; ok: true }
  | { error: string; ok: false } {
  const model = String(request.model ?? "").trim();
  if (!model || model.length > 160) {
    return { ok: false, error: "Choose a valid OpenRouter model." };
  }

  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    return { ok: false, error: "Enter a message first." };
  }

  const messages: OpenRouterMessage[] = request.messages
    .slice(-12)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content ?? "").slice(0, 5000),
    }));

  if (
    !messages.some(
      (message) =>
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
  ) {
    return { ok: false, error: "Enter a message first." };
  }

  return { ok: true, messages, model };
}

function buildContextMessages(request: AiChatRequest): OpenRouterMessage[] {
  if (!request.currentDocument) return [];
  const doc = request.currentDocument;
  const summaryText = `Current grid summary: ${JSON.stringify({
    name: doc.name,
    size: `${doc.width}x${doc.height}`,
    usedColors: doc.usedColors.slice(0, 24),
  })}`;
  if (isValidGridImage(request.currentGridImage)) {
    return [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${summaryText}. A clean PNG snapshot of the current grid is attached. Inspect the image for silhouette, facial readability, noisy regions, and repaint friction before responding.`,
          },
          {
            type: "image_url",
            image_url: {
              detail: "low",
              url: request.currentGridImage.dataUrl,
            },
          },
        ],
      },
    ];
  }
  return [
    {
      role: "user",
      content: summaryText,
    },
  ];
}

export function buildAiSystemPrompt(requestSketch: boolean): string {
  const paletteGuide = [
    "R1 reds, R2 oranges, R3 yellows, R4 greens, R5 cyans, R6 blues, R7 purples, R8 pinks, R9 browns/skin, R10 grays, R11 warm grays, S1-S7 saturated extras.",
    "Common IDs: R10C1 black, R10C7 white, R1C2 red, R2C3 orange, R3C3 bright yellow, R4C2 green, R6C3 bright blue, R7C2 purple, R9C5 beige, R11C1 charcoal.",
  ].join(" ");

  if (!requestSketch) {
    return [
      "You are the expert pixel-art director inside Tomodachi Studio, a browser repaint tool for Tomodachi Life: Living the Dream.",
      "You specialize in low-resolution pixel art that real players can repaint square by square in the Palette House.",
      "Think like a professional sprite artist: clear silhouette first, then facial landmarks, high-contrast readable details, limited palette, and low painting friction.",
      "Help the user design repaintable Mii masks, character-inspired fan builds, horror starters, icons, logos, memes, and object art.",
      "When giving advice, be specific about grid size, palette IDs, outlines, highlights, shadows, symmetry, brush-change reduction, and which details to paint last.",
      "Keep answers concise and practical.",
      "Do not claim you directly changed the canvas unless you returned a sketch object.",
      paletteGuide,
    ].join(" ");
  }

  // CRITICAL: the model has historically dumped solid-color blobs (the entire
  // grid filled with one palette ID like R10C7) when the JSON budget ran out
  // mid-row. The system prompt now (a) STRONGLY discourages solid fills, (b)
  // gives a real multi-color example with varied cells, (c) caps the default
  // size at 16x16 so even small-context free models can complete a valid grid.
  return [
    "You are the expert pixel-art drawer inside Tomodachi Studio.",
    "You create repaintable Tomodachi Life pixel guides, not generic image prompts.",
    "Prioritize iconic silhouette, readable face/prop details, clean outlines, limited color counts, and shapes a human can recreate in-game without guessing.",
    "If a current-grid image is attached, inspect it visually and improve the actual composition instead of ignoring it.",
    "Return ONLY valid JSON. No markdown fences, no commentary outside the JSON.",
    "DEFAULT to width=16 and height=16 for any request unless the user explicitly asks for a larger size. Only use 24 or 32 if the user asks for it.",
    "Use palette color IDs only. Use null for transparent/empty cells.",
    "CRITICAL: produce real pixel art. Do NOT fill the entire grid with a single color ID. The grid must contain multiple distinct colors, with clear shapes (eyes, mouth, outline, fill, accents) where appropriate.",
    "Use R10C1 (black) or R11C1 (charcoal) for outlines, a different color for the main fill, and at least one accent color for facial features or highlights.",
    "Avoid noisy dithering. Avoid one-cell artifacts unless they are essential facial details such as pupils, teeth, buttons, or highlights.",
    paletteGuide,
    "Required JSON shape (replace example rows with your actual art):",
    '{"reply":"Short summary of the design choices.","sketch":{"name":"Project Name","width":16,"height":16,"rows":[ [null,null,null,null,"R10C1","R10C1","R10C1","R10C1","R10C1","R10C1",null,null,null,null,null,null], [null,null,"R10C1","R10C1","R9C5","R9C5","R9C5","R9C5","R9C5","R9C5","R10C1","R10C1",null,null,null,null], [null,"R10C1","R9C5","R9C5","R9C5","R9C5","R9C5","R9C5","R9C5","R9C5","R9C5","R9C5","R10C1",null,null,null], [null,"R10C1","R9C5","R10C1","R9C5","R9C5","R9C5","R9C5","R9C5","R9C5","R10C1","R9C5","R10C1",null,null,null], [null,"R10C1","R9C5","R9C5","R9C5","R9C5","R9C5","R9C5","R9C5","R9C5","R9C5","R9C5","R10C1",null,null,null] ]}}',
    "The rows array must have EXACTLY height rows, and each row must have EXACTLY width cells. Count them before you finish.",
    "If you must shorten the grid to fit, return a smaller width and height instead of producing an invalid number of cells.",
  ].join(" ");
}

function isValidGridImage(
  value: AiChatRequest["currentGridImage"],
): value is NonNullable<AiChatRequest["currentGridImage"]> {
  if (!value) return false;
  if (!Number.isFinite(value.width) || !Number.isFinite(value.height)) {
    return false;
  }
  if (
    value.width < 1 ||
    value.height < 1 ||
    value.width > 256 ||
    value.height > 256
  ) {
    return false;
  }
  return (
    typeof value.dataUrl === "string" &&
    value.dataUrl.startsWith("data:image/png;base64,") &&
    value.dataUrl.length <= 2_000_000
  );
}

function normalizeSessionId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, 256);
  return normalized || undefined;
}

function parseSketchContent(
  content: string,
): { reply: string; sketch: AiGridSketch | null; warning?: string } | null {
  // First attempt: clean JSON parse on the extracted object.
  const candidate = extractJsonObject(content);
  try {
    const data = JSON.parse(candidate) as {
      reply?: unknown;
      sketch?: unknown;
      notes?: unknown;
    };
    return {
      reply:
        typeof data.reply === "string"
          ? data.reply
          : "The model returned a sketch.",
      sketch: data.sketch ? (data.sketch as AiGridSketch) : null,
    };
  } catch {
    /* fall through to salvage */
  }

  // Salvage attempt: the model likely ran out of tokens mid-row and produced
  // truncated JSON. Try to recover whatever rows were complete before the
  // truncation. Common patterns are missing closing brackets and a final row
  // that was cut mid-array. This is best-effort — if it works, the user gets
  // a partial sketch they can build on; if it doesn't, we still show the raw
  // text in the reply so they can debug.
  const salvaged = trySalvagePartialSketch(candidate);
  if (salvaged) {
    return {
      reply:
        salvaged.reply ||
        "Recovered a partial sketch from a truncated response. Some rows may be incomplete.",
      sketch: salvaged.sketch,
      warning:
        "The model response was truncated; the sketch may be missing rows or have incomplete rows filled with nulls.",
    };
  }

  return {
    reply: content || "The model did not return readable JSON.",
    sketch: null,
    warning: "The model response was not valid sketch JSON.",
  };
}

/**
 * Best-effort recovery from a truncated sketch response.
 *
 * Pattern: the model emits `{"reply":"...","sketch":{"name":"...","width":16,
 * "height":16,"rows":[ [ "R10C1", "R9C5", ... ], [ "R10C1", "R9C5",` then
 * cuts off. We try to extract width/height/name, then walk the partial rows
 * array, keeping any rows that parse as complete arrays of the right length.
 * Incomplete final rows are dropped, then padded with null-only rows to reach
 * the declared height.
 */
function trySalvagePartialSketch(candidate: string): {
  reply: string;
  sketch: AiGridSketch;
} | null {
  // Pull width/height/name from before the rows truncation
  const widthMatch = candidate.match(/"width"\s*:\s*(\d+)/);
  const heightMatch = candidate.match(/"height"\s*:\s*(\d+)/);
  const nameMatch = candidate.match(/"name"\s*:\s*"([^"]{1,80})"/);
  const replyMatch = candidate.match(/"reply"\s*:\s*"([^"]{0,400})"/);

  if (!widthMatch || !heightMatch) return null;
  const width = Number(widthMatch[1]);
  const height = Number(heightMatch[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 4 || height < 4 || width > 64 || height > 64) return null;

  // Find the start of the rows array and walk row-by-row
  const rowsStart = candidate.indexOf('"rows"');
  if (rowsStart < 0) return null;
  const arrayStart = candidate.indexOf("[", rowsStart);
  if (arrayStart < 0) return null;

  const remaining = candidate.slice(arrayStart + 1);
  const rows: (string | null)[][] = [];
  // Walk char-by-char, depth-tracking to find each row's full extent
  let depth = 0;
  let rowStart = -1;
  for (let i = 0; i < remaining.length && rows.length < height; i += 1) {
    const ch = remaining[i];
    if (ch === "[" && depth === 0) {
      depth = 1;
      rowStart = i;
    } else if (ch === "[") {
      depth += 1;
    } else if (ch === "]" && depth > 0) {
      depth -= 1;
      if (depth === 0 && rowStart >= 0) {
        const rowText = remaining.slice(rowStart, i + 1);
        try {
          const parsed = JSON.parse(rowText) as unknown;
          if (Array.isArray(parsed) && parsed.length === width) {
            rows.push(
              parsed.map((cell) =>
                typeof cell === "string" ? cell : null,
              ) as (string | null)[],
            );
          }
        } catch {
          /* skip unparseable row */
        }
        rowStart = -1;
      }
    }
  }

  if (rows.length === 0) return null;

  // Pad with null rows to declared height so createGridDocumentFromAiSketch
  // validation passes. User sees partial art with empty rows below.
  while (rows.length < height) {
    rows.push(new Array(width).fill(null));
  }

  return {
    reply:
      replyMatch?.[1] ||
      `Recovered ${rows.length}-row sketch from truncated response.`,
    sketch: {
      name: nameMatch?.[1] || "Recovered Sketch",
      width,
      height,
      rows,
    },
  };
}

function extractJsonObject(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return content.slice(firstBrace, lastBrace + 1).trim();
  }

  return content;
}
