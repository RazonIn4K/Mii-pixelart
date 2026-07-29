import type {
  AiChatMessage,
  AiChatPurpose,
  AiChatResponse,
  AiDocumentSummary,
  AiGridImage,
  AiGridSketch,
} from "../shared/ai";
import {
  AI_CHAT_BODY_MAX_BYTES,
  AI_SKETCH_LIMITS,
  OPENROUTER_FREE_ROUTER_ID,
  OPENROUTER_MODEL_PRESETS,
  PALETTE_COLOR_ID_PATTERN,
  maxAiRefineDimension,
  validateAiGridSketch,
} from "../shared/ai";
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

interface OpenRouterCompletionAttempt {
  payload: OpenRouterResponse | null;
  response: Response;
}

interface ParsedOpenRouterCompletion {
  hasContent: boolean;
  reply: string;
  sketch: AiGridSketch | null;
  warning?: string;
}

export interface ApiResult {
  body: unknown;
  status: number;
}

interface NormalizedAiRequest {
  currentDocument: AiDocumentSummary | null;
  currentGridImage: AiGridImage | null;
  messages: OpenRouterMessage[];
  model: string;
  preserveDimensions: boolean;
  purpose: AiChatPurpose;
  requestSketch: boolean;
  sessionId?: string;
}

/**
 * Minimal env shape consumed by this module. Both Node (`process.env`) and
 * Cloudflare Workers (`context.env`) can satisfy it. Pass an `env` argument
 * explicitly from edge runtimes; Node callers can omit it and we'll fall back
 * to `process.env`.
 */
export interface OpenRouterEnv {
  OPENROUTER_API_KEY?: string;
  /**
   * OpenRouter provider routing policy for prompt/image retention.
   * "deny" (default) restricts routing to providers that do not retain or
   * train on inputs. Set to "allow" only if the free-model roster becomes
   * unavailable under the strict policy and the tradeoff is accepted.
   */
  OPENROUTER_DATA_COLLECTION?: string;
  PUBLIC_SITE_URL?: string;
}

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
// Sketch generation on free models can legitimately take a while (16k-token
// budgets); chat gets a generous ceiling while the models catalog stays snappy.
const OPENROUTER_CHAT_TIMEOUT_MS = 90_000;
const OPENROUTER_MODELS_TIMEOUT_MS = 15_000;
// A correction is useful only when there is enough of the original request
// deadline left for the provider to finish. Both attempts share the same
// 90-second ceiling so a malformed first response cannot double request time.
const OPENROUTER_REPAIR_MIN_REMAINING_MS = 10_000;
const OPENROUTER_REPAIR_SUCCESS_WARNING =
  "The first grid failed validation; one corrected grid passed review.";
const ALLOWED_MODEL_IDS = new Set(
  OPENROUTER_MODEL_PRESETS.map((preset) => preset.id),
);

// Keep the prompt example structurally valid. Free models often imitate the
// example more literally than the surrounding prose, so an abbreviated rows
// array can teach them to return an empty or malformed sketch even when the
// requested dimensions are correct.
const AI_SKETCH_PROMPT_COLORS = {
  ".": null,
  B: "R10C1",
  R: "R1C2",
  S: "R9C5",
  W: "R10C7",
} as const;
const AI_SKETCH_PROMPT_ROWS = [
  ".....BBBBBB.....",
  "...BBRRRRRRBB...",
  "..BRRWWRRWWRRB..",
  ".BRRRRRRRRRRRRB.",
  ".BRWWRRRRRRWWRB.",
  ".BRRRRRRRRRRRRB.",
  "..BBRRRRRRRRBB..",
  "...BBBSSSSBBB...",
  ".....BSSSSB.....",
  ".....BSSSSB.....",
  ".....BSBBSB.....",
  ".....BSSSSB.....",
  ".....BSSSSB.....",
  "......BSSB......",
  "......BBBB......",
  "................",
] as const;
const AI_SKETCH_PROMPT_EXAMPLE = {
  reply:
    "A compact mushroom badge with a dark outline, red cap, white spots, and beige stem.",
  sketch: {
    height: 16,
    name: "Mushroom Badge",
    rows: AI_SKETCH_PROMPT_ROWS.map((row) =>
      Array.from(
        row,
        (glyph) =>
          AI_SKETCH_PROMPT_COLORS[
            glyph as keyof typeof AI_SKETCH_PROMPT_COLORS
          ] ?? null,
      ),
    ),
    width: 16,
  },
} satisfies { reply: string; sketch: AiGridSketch };

export function isSupportedOpenRouterModel(modelId: string): boolean {
  return ALLOWED_MODEL_IDS.has(modelId);
}

function normalizeMaxOutputTokens(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1_200 &&
    value <= 65_536
    ? Math.floor(value)
    : undefined;
}

function getSketchOutputTokenLimit(modelId: string): number {
  const preset = OPENROUTER_MODEL_PRESETS.find((entry) => entry.id === modelId);
  return Math.max(8_000, Math.min(preset?.maxOutputTokens ?? 16_000, 32_768));
}

export function getOpenRouterStatus(env?: OpenRouterEnv): ApiResult {
  return {
    status: 200,
    body: {
      configured: Boolean(getOpenRouterApiKey(env)),
      dataCollection: getOpenRouterDataCollection(env),
      envVar: "OPENROUTER_API_KEY",
      presets: OPENROUTER_MODEL_PRESETS,
    },
  };
}

export async function getOpenRouterModels(
  env?: OpenRouterEnv,
): Promise<ApiResult> {
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: getOpenRouterHeaders(false, undefined, env),
      signal: AbortSignal.timeout(OPENROUTER_MODELS_TIMEOUT_MS),
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
      data?: Array<{
        architecture?: { input_modalities?: string[] };
        id?: string;
        name?: string;
        top_provider?: { max_completion_tokens?: number | null };
      }>;
    };
    const modelsById = new Map(
      (payload.data ?? [])
        .filter((model): model is typeof model & { id: string } =>
          Boolean(model.id),
        )
        .map((model) => [model.id, model]),
    );
    return {
      status: 200,
      body: {
        presets: OPENROUTER_MODEL_PRESETS.map((preset) => {
          const model = modelsById.get(preset.id);
          const providerMaxOutputTokens = normalizeMaxOutputTokens(
            model?.top_provider?.max_completion_tokens,
          );
          // The checked-in preset is the reviewed product capability ceiling.
          // Live catalog metadata may reduce that ceiling or mark a model
          // unavailable, but it must never silently unlock a larger refinement
          // size (or image input) that normalizeAiRequest would reject.
          const maxOutputTokens =
            preset.maxOutputTokens === undefined
              ? providerMaxOutputTokens
              : providerMaxOutputTokens === undefined
                ? preset.maxOutputTokens
                : Math.min(preset.maxOutputTokens, providerMaxOutputTokens);
          return {
            ...preset,
            available: Boolean(model),
            maxOutputTokens,
            supportsImages:
              preset.supportsImages === true &&
              (model?.architecture?.input_modalities?.includes("image") ??
                false),
          };
        }),
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
  request: unknown,
  env?: OpenRouterEnv,
  requestSignal?: AbortSignal,
): Promise<ApiResult> {
  const normalized = normalizeAiRequest(request);
  if (!normalized.ok) {
    return {
      status: 400,
      body: {
        configured: Boolean(getOpenRouterApiKey(env)),
        reply: normalized.error,
      },
    };
  }

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

  // Advice and create modes share a local transcript, but stale advice prose
  // makes structured-grid models less reliable. Keep the complete history for
  // advice while giving a sketch request only its latest user instruction.
  // Canvas summaries and images remain separate, reviewed context below.
  const conversationMessages = normalized.requestSketch
    ? normalized.messages
        .filter(
          (message) =>
            message.role === "user" &&
            typeof message.content === "string" &&
            message.content.trim().length > 0,
        )
        .slice(-1)
    : normalized.messages;
  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content: buildAiSystemPrompt(
        normalized.requestSketch,
        normalized.purpose,
      ),
    },
    ...buildContextMessages(
      normalized.currentDocument,
      normalized.currentGridImage,
    ),
    ...conversationMessages,
  ];

  const deadlineAt = Date.now() + OPENROUTER_CHAT_TIMEOUT_MS;

  let firstAttempt: OpenRouterCompletionAttempt;
  try {
    firstAttempt = await requestOpenRouterCompletion(
      normalized,
      messages,
      apiKey,
      env,
      deadlineAt,
      requestSignal,
    );
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      status: 504,
      body: {
        configured: true,
        model: normalized.model,
        reply: timedOut
          ? "The AI request timed out. Try again, ask for a smaller sketch, or pick a faster model."
          : "The AI service could not be reached. Try again in a moment.",
      } satisfies AiChatResponse,
    };
  }

  if (!firstAttempt.response.ok) {
    return {
      status: firstAttempt.response.status,
      body: {
        configured: true,
        model: normalized.model,
        reply:
          firstAttempt.payload?.error?.message ??
          `OpenRouter request failed with status ${firstAttempt.response.status}.`,
      } satisfies AiChatResponse,
    };
  }

  const firstParsed = parseOpenRouterCompletion(
    firstAttempt.payload,
    normalized,
  );
  if (!normalized.requestSketch && !firstParsed.hasContent) {
    return {
      status: 502,
      body: {
        configured: true,
        model: firstAttempt.payload?.model ?? normalized.model,
        reply:
          "The selected AI model returned no usable text. Your prompt was not saved; try again or choose another model.",
      } satisfies AiChatResponse,
    };
  }
  let selectedAttempt = firstAttempt;
  let selectedParsed = firstParsed;
  let repairAttempted = false;
  let repairSucceeded = false;

  // Only text-only create requests get an automatic correction. Refinements
  // may contain a canvas image or summary, so silently retransmitting them
  // would exceed the user's consent and could spend the full provider budget
  // twice. Advice, provider errors, and first-attempt timeouts never retry.
  const canRepair =
    normalized.requestSketch &&
    !firstParsed.sketch &&
    !normalized.currentDocument &&
    !normalized.currentGridImage &&
    deadlineAt - Date.now() >= OPENROUTER_REPAIR_MIN_REMAINING_MS;
  if (canRepair) {
    repairAttempted = true;
    const repairMessages: OpenRouterMessage[] = [
      ...messages,
      {
        role: "user",
        content: buildSketchRepairMessage(firstParsed.warning),
      },
    ];
    try {
      const repairAttempt = await requestOpenRouterCompletion(
        normalized,
        repairMessages,
        apiKey,
        env,
        deadlineAt,
        requestSignal,
      );
      if (repairAttempt.response.ok) {
        const repaired = parseOpenRouterCompletion(
          repairAttempt.payload,
          normalized,
        );
        if (repaired.sketch) {
          selectedAttempt = repairAttempt;
          selectedParsed = {
            ...repaired,
            warning: repaired.warning
              ? `${OPENROUTER_REPAIR_SUCCESS_WARNING} ${repaired.warning}`
              : OPENROUTER_REPAIR_SUCCESS_WARNING,
          };
          repairSucceeded = true;
        }
      }
    } catch {
      // Keep the first safe, non-applyable result. A correction is best-effort
      // and must never turn a successful first provider response into a 5xx.
    }
  }

  return {
    status: 200,
    body: {
      configured: true,
      model: selectedAttempt.payload?.model ?? normalized.model,
      reply: selectedParsed.reply,
      sketch: selectedParsed.sketch,
      // A retried request has two usage records. Omit the field instead of
      // reporting only one attempt and understating provider consumption.
      usage:
        !repairAttempted && selectedAttempt.payload?.usage
          ? {
              completionTokens: selectedAttempt.payload.usage.completion_tokens,
              promptTokens: selectedAttempt.payload.usage.prompt_tokens,
              totalTokens: selectedAttempt.payload.usage.total_tokens,
            }
          : undefined,
      warning: repairSucceeded ? selectedParsed.warning : firstParsed.warning,
    } satisfies AiChatResponse,
  };
}

async function requestOpenRouterCompletion(
  normalized: NormalizedAiRequest,
  messages: OpenRouterMessage[],
  apiKey: string,
  env: OpenRouterEnv | undefined,
  deadlineAt: number,
  requestSignal: AbortSignal | undefined,
): Promise<OpenRouterCompletionAttempt> {
  // Both the first request and optional correction consume one shared deadline.
  // A minimum of 1 ms keeps AbortSignal.timeout within its valid range if the
  // clock crosses the deadline immediately before fetch begins.
  const remainingMs = Math.max(1, Math.ceil(deadlineAt - Date.now()));
  const timeoutSignal = AbortSignal.timeout(remainingMs);
  const signal = requestSignal
    ? AbortSignal.any([requestSignal, timeoutSignal])
    : timeoutSignal;
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: getOpenRouterHeaders(true, apiKey, env),
    signal,
    body: JSON.stringify({
      // Sketch budget math: 16x16=256 cells, 24x24=576, 32x32=1024. Each cell
      // is ~6-8 tokens ("R10C7", comma+space). 1024 cells × 8 tokens ≈ 8192
      // tokens for rows alone, plus wrapping JSON and commentary.
      max_tokens: normalized.requestSketch
        ? getSketchOutputTokenLimit(normalized.model)
        : 1200,
      messages,
      model: normalized.model,
      response_format: normalized.requestSketch
        ? { type: "json_object" }
        : undefined,
      session_id: normalized.sessionId,
      temperature: normalized.requestSketch ? 0.2 : 0.7,
      // Privacy: constrain every attempt to the same provider collection
      // policy. The default routes only to providers marked as non-collecting.
      provider: { data_collection: getOpenRouterDataCollection(env) },
    }),
  });
  const payload = (await response
    .json()
    .catch(() => null)) as OpenRouterResponse | null;
  return { payload, response };
}

function parseOpenRouterCompletion(
  payload: OpenRouterResponse | null,
  normalized: NormalizedAiRequest,
): ParsedOpenRouterCompletion {
  const content = payload?.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = normalized.requestSketch
    ? parseSketchContent(content, !normalized.preserveDimensions)
    : null;
  const reply =
    parsed?.reply ??
    (content || "The model returned an empty response. Try a different model.");
  const expectedDimensions =
    normalized.currentDocument ?? normalized.currentGridImage;
  const dimensionsChanged = Boolean(
    normalized.preserveDimensions &&
    expectedDimensions &&
    parsed?.sketch &&
    (parsed.sketch.width !== expectedDimensions.width ||
      parsed.sketch.height !== expectedDimensions.height),
  );
  return {
    hasContent: content.length > 0,
    reply,
    sketch: dimensionsChanged ? null : (parsed?.sketch ?? null),
    warning: dimensionsChanged
      ? `The model returned ${parsed?.sketch?.width}x${parsed?.sketch?.height}, but this refinement must remain ${expectedDimensions?.width}x${expectedDimensions?.height}. Nothing was applied.`
      : parsed?.warning,
  };
}

function buildSketchRepairMessage(warning?: string): string {
  // The provider's raw response is deliberately excluded. The retry receives
  // only a bounded server-generated validation reason and the original prompt
  // context, preventing untrusted model text from becoming a new instruction.
  const validationReason =
    warning?.replace(/\s+/g, " ").trim().slice(0, 300) ||
    "The response did not include a validated sketch.";
  return [
    "Your first grid did not pass server validation.",
    `Validation result: ${validationReason}`,
    "Return only one corrected JSON object using the required shape.",
    "Do not omit, abbreviate, or partially fill the rows array.",
    "Use 16x16 unless the user's original request explicitly names another supported size.",
    "Every row must contain exactly width cells, the rows array must contain exactly height rows, and at least one cell must be painted.",
    "Use multiple allowlisted palette colors and keep null for transparent cells.",
  ].join(" ");
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

function getOpenRouterDataCollection(env?: OpenRouterEnv): "deny" | "allow" {
  const raw =
    env?.OPENROUTER_DATA_COLLECTION ??
    (typeof process !== "undefined"
      ? process.env?.OPENROUTER_DATA_COLLECTION
      : undefined) ??
    "";
  return raw.trim().toLowerCase() === "allow" ? "allow" : "deny";
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
  request: unknown,
): (NormalizedAiRequest & { ok: true }) | { error: string; ok: false } {
  if (!isRecord(request)) {
    return {
      ok: false,
      error: "Choose one of the supported free OpenRouter models.",
    };
  }

  const model = String(request.model ?? "").trim();
  if (!model || model.length > 160 || !isSupportedOpenRouterModel(model)) {
    return {
      ok: false,
      error: "Choose one of the supported free OpenRouter models.",
    };
  }

  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    return { ok: false, error: "Enter a message first." };
  }

  const rawMessages = request.messages.slice(-12);
  if (!rawMessages.every(isAiChatMessage)) {
    return { ok: false, error: "Enter a message first." };
  }
  const messages: OpenRouterMessage[] = rawMessages.map((message) => ({
    role: message.role,
    content: message.content.slice(0, 5000),
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

  const currentDocument = normalizeDocumentSummary(request.currentDocument);
  const currentGridImage = isValidGridImage(request.currentGridImage)
    ? request.currentGridImage
    : null;
  const preset = OPENROUTER_MODEL_PRESETS.find((entry) => entry.id === model);
  if (currentGridImage && preset?.supportsImages !== true) {
    return {
      ok: false,
      error: "Choose a vision-capable model before attaching the canvas.",
    };
  }
  const preserveDimensions = request.preserveDimensions === true;
  const requestSketch = request.requestSketch === true;
  if (
    requestSketch &&
    (preset?.adviceOnly === true || model === OPENROUTER_FREE_ROUTER_ID)
  ) {
    return {
      ok: false,
      error: "Choose a sketch-capable model before requesting a grid.",
    };
  }
  if (
    requestSketch &&
    !messages.some(
      (message) =>
        message.role === "user" &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
  ) {
    return { ok: false, error: "Enter a message first." };
  }
  const purpose: AiChatPurpose =
    request.purpose === "recovery" ? "recovery" : "studio";
  if (
    purpose === "recovery" &&
    (request.requestSketch === true || currentDocument || currentGridImage)
  ) {
    return {
      ok: false,
      error: "Recovery requests cannot attach or generate a Studio canvas.",
    };
  }
  const expectedDimensions = currentDocument ?? currentGridImage;
  if (
    preserveDimensions &&
    expectedDimensions &&
    (expectedDimensions.width > AI_SKETCH_LIMITS.maxDimension ||
      expectedDimensions.height > AI_SKETCH_LIMITS.maxDimension)
  ) {
    return {
      ok: false,
      error: `AI refinement supports canvases up to ${AI_SKETCH_LIMITS.maxDimension}x${AI_SKETCH_LIMITS.maxDimension}.`,
    };
  }
  const modelRefineDimension = preset ? maxAiRefineDimension(preset) : 0;
  if (
    preserveDimensions &&
    expectedDimensions &&
    (expectedDimensions.width > modelRefineDimension ||
      expectedDimensions.height > modelRefineDimension)
  ) {
    return {
      ok: false,
      error:
        modelRefineDimension > 0
          ? `The selected model supports full-grid refinement up to ${modelRefineDimension}x${modelRefineDimension}.`
          : "Choose a vision-capable model with enough output capacity for refinement.",
    };
  }

  return {
    currentDocument,
    currentGridImage,
    messages,
    model,
    ok: true,
    preserveDimensions,
    purpose,
    requestSketch,
    sessionId:
      purpose === "recovery"
        ? undefined
        : normalizeSessionId(request.sessionId),
  };
}

function buildContextMessages(
  currentDocument: AiDocumentSummary | null,
  currentGridImage: AiGridImage | null,
): OpenRouterMessage[] {
  if (!currentDocument && !currentGridImage) return [];
  const summaryText = currentDocument
    ? `Current grid summary: ${JSON.stringify({
        name: currentDocument.name,
        size: `${currentDocument.width}x${currentDocument.height}`,
        usedColors: currentDocument.usedColors.slice(0, 24),
      })}`
    : `Current grid dimensions: ${currentGridImage?.width}x${currentGridImage?.height}`;
  if (currentGridImage) {
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
              url: currentGridImage.dataUrl,
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

export function buildAiSystemPrompt(
  requestSketch: boolean,
  purpose: AiChatPurpose = "studio",
): string {
  if (purpose === "recovery") {
    return [
      "You are a plain-language account-security recovery assistant.",
      "Give calm, concise, practical steps for the next 24 hours, account cleanup, password-reset order, and safe communication.",
      "Never ask for or repeat passwords, recovery codes, session tokens, financial account or card numbers, government identifiers, or other secrets.",
      "Do not claim to contact providers, reverse transactions, investigate systems, or guarantee account recovery.",
      "Prioritize preserving evidence, using official provider recovery pages, enabling MFA, revoking sessions, and contacting financial institutions or emergency services when appropriate.",
      "Clearly distinguish general information from legal, financial, or incident-response advice.",
    ].join(" ");
  }
  const paletteGuide = [
    "R1 reds, R2 oranges, R3 yellows, R4 greens, R5 cyans, R6 blues, R7 purples, R8 pinks, R9 browns/skin, R10 grays, R11 warm grays, S1-S7 saturated extras.",
    "Common IDs: R10C1 black, R10C7 white, R1C2 red, R2C3 orange, R3C3 bright yellow, R4C2 green, R6C3 bright blue, R7C2 purple, R9C5 beige, R11C1 charcoal.",
  ].join(" ");

  if (!requestSketch) {
    return [
      "You are the expert pixel-art director inside Tomodachi Studio, a browser repaint tool for Tomodachi Life: Living the Dream.",
      "You specialize in low-resolution pixel art that real players can repaint square by square in the Palette House.",
      "Think like a professional sprite artist: clear silhouette first, then facial landmarks, high-contrast readable details, limited palette, and low painting friction.",
      "Help the user design manual Face Paint references, Palette House creations, character-inspired fan builds, horror starters, icons, logos, memes, and object art.",
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
    "When the user asks to edit or improve an attached current grid, preserve its subject and dimensions unless the user explicitly requests a new size. Return the complete revised grid, not only the changed cells.",
    "Return ONLY valid JSON. No markdown fences, no commentary outside the JSON.",
    "DEFAULT to width=16 and height=16 for any request unless the user explicitly asks for a larger size. Only use 24 or 32 if the user asks for it.",
    "Use palette color IDs only. Use null for transparent/empty cells.",
    "CRITICAL: produce real pixel art. Do NOT fill the entire grid with a single color ID. The grid must contain multiple distinct colors, with clear shapes (eyes, mouth, outline, fill, accents) where appropriate.",
    "Use R10C1 (black) or R11C1 (charcoal) for outlines, a different color for the main fill, and at least one accent color for facial features or highlights.",
    "Avoid noisy dithering. Avoid one-cell artifacts unless they are essential facial details such as pupils, teeth, buttons, or highlights.",
    paletteGuide,
    "Required JSON shape (the example is complete and validator-accepted):",
    JSON.stringify(AI_SKETCH_PROMPT_EXAMPLE),
    "The rows array must have EXACTLY height rows, and each row must have EXACTLY width cells. Count them before you finish.",
    "The rows must contain at least one non-null painted cell. If your painted-cell count is zero, fix the sketch before returning it.",
    "If you must shorten the grid to fit, return a smaller width and height instead of producing an invalid number of cells.",
  ].join(" ");
}

function isValidGridImage(value: unknown): value is AiGridImage {
  if (!isRecord(value)) return false;
  if (
    typeof value.width !== "number" ||
    typeof value.height !== "number" ||
    !Number.isFinite(value.width) ||
    !Number.isFinite(value.height)
  ) {
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
    value.dataUrl.length <= AI_CHAT_BODY_MAX_BYTES
  );
}

function normalizeDocumentSummary(value: unknown): AiDocumentSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.name !== "string" ||
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    typeof value.width !== "number" ||
    typeof value.height !== "number" ||
    value.width < 1 ||
    value.width > 256 ||
    value.height < 1 ||
    value.height > 256 ||
    !Array.isArray(value.usedColors)
  ) {
    return null;
  }
  return {
    height: value.height,
    name: value.name.slice(0, 200),
    usedColors: value.usedColors
      .filter(
        (color): color is string =>
          typeof color === "string" && PALETTE_COLOR_ID_PATTERN.test(color),
      )
      .slice(0, 24),
    width: value.width,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAiChatMessage(value: unknown): value is AiChatMessage {
  return (
    isRecord(value) &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string"
  );
}

function normalizeSessionId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, 256);
  return normalized || undefined;
}

function parseSketchContent(
  content: string,
  allowSalvage = true,
): { reply: string; sketch: AiGridSketch | null; warning?: string } | null {
  // First attempt: clean JSON parse on the extracted object.
  const candidate = extractJsonObject(content);
  const parsedCandidate = parseStructuredSketchCandidate(candidate);
  if (parsedCandidate) return parsedCandidate;

  // Some otherwise capable free models emit palette IDs as bare JSON tokens
  // (`R1C3` instead of `"R1C3"`). Quote only exact allowlisted cell tokens,
  // then run the same hostile-output validator as ordinary model JSON.
  const quotedPaletteIds = candidate.replace(
    /(\[|,)(\s*)((?:R(?:[1-9]|1[01])C[1-7])|(?:S[1-7]))(?=\s*(?:,|\]))/g,
    '$1$2"$3"',
  );
  if (quotedPaletteIds !== candidate) {
    const normalizedCandidate =
      parseStructuredSketchCandidate(quotedPaletteIds);
    if (normalizedCandidate) {
      return {
        ...normalizedCandidate,
        warning:
          normalizedCandidate.warning ??
          "The model omitted JSON quotes around palette IDs; the validated sketch was normalized before review.",
      };
    }
  }

  // Salvage attempt: the model likely ran out of tokens mid-row and produced
  // truncated JSON. Try to recover whatever rows were complete before the
  // truncation. Common patterns are missing closing brackets and a final row
  // that was cut mid-array. This is best-effort — if it works, the user gets
  // a partial sketch they can build on; if it doesn't, we still show the raw
  // text in the reply so they can debug.
  const salvaged = allowSalvage
    ? trySalvagePartialSketch(quotedPaletteIds)
    : null;
  if (salvaged) {
    // The salvage path builds rows from regex-scraped fragments, so it goes
    // through the exact same untrusted-output gate as a clean parse.
    const validated = validateAiGridSketch(salvaged.sketch);
    if (validated.ok) {
      return {
        reply:
          salvaged.reply ||
          "Recovered a partial sketch from a truncated response. Some rows may be incomplete.",
        sketch: validated.sketch,
        warning:
          "The model response was truncated; the sketch may be missing rows or have incomplete rows filled with nulls.",
      };
    }
  }

  return {
    reply: content || "The model did not return readable JSON.",
    sketch: null,
    warning: "The model response was not valid sketch JSON.",
  };
}

function parseStructuredSketchCandidate(
  candidate: string,
): { reply: string; sketch: AiGridSketch | null; warning?: string } | null {
  try {
    const data = JSON.parse(candidate) as {
      reply?: unknown;
      sketch?: unknown;
      notes?: unknown;
    };
    const reply =
      typeof data.reply === "string"
        ? data.reply
        : "The model returned a sketch.";
    if (!data.sketch) {
      return { reply, sketch: null };
    }
    // Model output is untrusted: never forward a sketch to clients without
    // validating dimensions, row shape, and palette IDs. The client re-checks
    // on apply, but the API must not be the channel that ships garbage.
    const validated = validateAiGridSketch(data.sketch);
    if (validated.ok) {
      return { reply, sketch: validated.sketch };
    }
    return {
      reply,
      sketch: null,
      warning: `The model returned an invalid sketch (${validated.error}). Ask it to try again.`,
    };
  } catch {
    return null;
  }
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
  if (
    width < AI_SKETCH_LIMITS.minDimension ||
    height < AI_SKETCH_LIMITS.minDimension ||
    width > AI_SKETCH_LIMITS.maxDimension ||
    height > AI_SKETCH_LIMITS.maxDimension
  ) {
    return null;
  }

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
                typeof cell === "string" && PALETTE_COLOR_ID_PATTERN.test(cell)
                  ? cell
                  : null,
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
