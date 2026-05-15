import type { AiChatRequest, AiChatResponse, AiGridSketch } from "../shared/ai";
import { OPENROUTER_MODEL_PRESETS } from "../shared/ai";
import { buildResidentDesignerPrompt } from "../shared/residents";

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
      max_tokens: request.requestSketch ? 3000 : 1200,
      messages,
      model: normalized.model,
      response_format: request.requestSketch
        ? { type: "json_object" }
        : undefined,
      session_id: normalizeSessionId(request.sessionId),
      temperature: request.requestSketch ? 0.35 : 0.7,
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
      "You are the expert pixel-art director inside Living The Grid Studio, a browser repaint tool for Tomodachi Life: Living the Dream.",
      "You specialize in low-resolution pixel art that real players can repaint square by square in the Palette House.",
      "Think like a professional sprite artist: clear silhouette first, then facial landmarks, high-contrast readable details, limited palette, and low painting friction.",
      "Help the user design repaintable Mii masks, character-inspired fan builds, horror starters, icons, logos, memes, and object art.",
      "When giving advice, be specific about grid size, palette IDs, outlines, highlights, shadows, symmetry, brush-change reduction, and which details to paint last.",
      "When asked for a Layers of Abstraction resident, use the Resident Designer rules and return strict MiiResidentSpec JSON if the user requests JSON.",
      "Keep answers concise and practical.",
      "Do not claim you directly changed the canvas unless you returned a sketch object.",
      paletteGuide,
      buildResidentDesignerPrompt(),
    ].join(" ");
  }

  return [
    "You are the expert pixel-art drawer inside Living The Grid Studio.",
    "You create repaintable Tomodachi Life: Living the Dream pixel guides, not generic image prompts.",
    "Prioritize iconic silhouette, readable face/prop details, clean outlines, limited color counts, and shapes a human can recreate in-game without guessing.",
    "If a current-grid image is attached, inspect it visually and improve the actual composition instead of ignoring it.",
    "Return only valid JSON, no markdown.",
    "Create a small repaintable pixel-art sketch from the user's request.",
    "Use palette color IDs only. Use null for transparent/empty cells. Keep the sketch readable, symmetrical when useful, and easy to repaint.",
    "Use width and height of 16, 24, or 32. Prefer 16 for icons and 32 for characters.",
    "Avoid noisy dithering and one-cell artifacts unless they are essential facial details such as pupils, teeth, buttons, or highlights.",
    "Use R10C1 or R11C1 for strong outlines when needed. Use color blocks and large regions before tiny accents.",
    paletteGuide,
    'JSON shape: {"reply":"short summary","sketch":{"name":"Project Name","width":16,"height":16,"rows":[["R10C7",null]]},"notes":"optional"}',
    "The rows array must have exactly height rows, and each row must have exactly width cells.",
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
  try {
    const data = JSON.parse(extractJsonObject(content)) as {
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
    return {
      reply: content || "The model did not return readable JSON.",
      sketch: null,
      warning: "The model response was not valid sketch JSON.",
    };
  }
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
