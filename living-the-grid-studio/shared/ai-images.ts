export const AI_IMAGE_MODEL_IDS = [
  "google/gemini-3.1-flash-lite-image",
  "google/gemini-3.1-flash-image",
] as const;

export type AiImageModelId = (typeof AI_IMAGE_MODEL_IDS)[number];

export const AI_IMAGE_DEFAULT_MODEL =
  "google/gemini-3.1-flash-lite-image" satisfies AiImageModelId;
export const AI_IMAGE_FALLBACK_MODEL =
  "google/gemini-3.1-flash-image" satisfies AiImageModelId;

export const AI_IMAGE_MODEL_PRESETS = [
  {
    id: AI_IMAGE_DEFAULT_MODEL,
    label: "Gemini Flash Lite Image",
    note: "Fast, cost-conscious square artwork generation.",
  },
  {
    id: AI_IMAGE_FALLBACK_MODEL,
    label: "Gemini Flash Image",
    note: "Explicit higher-detail fallback; never selected automatically.",
  },
] as const satisfies ReadonlyArray<{
  id: AiImageModelId;
  label: string;
  note: string;
}>;

/**
 * Hard boundaries shared by the request validator and OpenRouter adapter.
 * Provider responses contain base64, so the response ceiling includes the
 * roughly 4/3 encoding overhead plus bounded JSON metadata.
 */
export const AI_IMAGE_LIMITS = {
  maxDecodedImageBytes: 6_000_000,
  maxImageDimension: 4_096,
  maxImagePixels: 16_777_216,
  maxPromptBytes: 8_000,
  maxPromptLength: 2_000,
  maxProviderResponseBytes: 8_100_000,
  maxRequestBytes: 12_000,
  // OpenRouter's provider.max_price.image filter uses this same ceiling.
  // Keep it separate from any multi-request benchmark or daily budget.
  maxPerImageCostUsd: 0.15,
  timeoutMs: 90_000,
} as const;

export interface AiImageGenerationRequest {
  model: AiImageModelId;
  prompt: string;
}

export type AiImageRequestErrorCode =
  "AI_IMAGE_INVALID_REQUEST" | "AI_IMAGE_UNSUPPORTED_MODEL";

export type AiImageRequestValidation =
  | { ok: true; value: AiImageGenerationRequest }
  | {
      error: {
        code: AiImageRequestErrorCode;
        message: string;
      };
      ok: false;
    };

const AI_IMAGE_MODEL_ID_SET: ReadonlySet<string> = new Set(AI_IMAGE_MODEL_IDS);
const DISALLOWED_PROMPT_CONTROLS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function isAiImageModelId(value: unknown): value is AiImageModelId {
  return typeof value === "string" && AI_IMAGE_MODEL_ID_SET.has(value);
}

/**
 * Validate and normalize an untrusted image-generation request.
 *
 * An omitted model uses the reviewed low-cost default. An explicitly supplied
 * model must match the exact allowlist; aliases and arbitrary provider IDs are
 * rejected rather than guessed.
 */
export function validateAiImageGenerationRequest(
  value: unknown,
): AiImageRequestValidation {
  if (!isRecord(value) || typeof value.prompt !== "string") {
    return invalidRequest("Enter a description for the artwork.");
  }

  const modelValue = value.model;
  const model =
    modelValue === undefined || modelValue === null
      ? AI_IMAGE_DEFAULT_MODEL
      : modelValue;
  if (!isAiImageModelId(model)) {
    return {
      error: {
        code: "AI_IMAGE_UNSUPPORTED_MODEL",
        message: "Choose one of the supported image models.",
      },
      ok: false,
    };
  }

  const prompt = value.prompt.normalize("NFKC").replace(/\r\n?/g, "\n").trim();
  if (!prompt) {
    return invalidRequest("Enter a description for the artwork.");
  }
  if (
    prompt.length > AI_IMAGE_LIMITS.maxPromptLength ||
    new TextEncoder().encode(prompt).byteLength > AI_IMAGE_LIMITS.maxPromptBytes
  ) {
    return invalidRequest(
      `Keep the artwork description under ${AI_IMAGE_LIMITS.maxPromptLength.toLocaleString()} characters.`,
    );
  }
  if (DISALLOWED_PROMPT_CONTROLS.test(prompt)) {
    return invalidRequest(
      "The artwork description contains unsupported control characters.",
    );
  }

  return { ok: true, value: { model, prompt } };
}

function invalidRequest(message: string): AiImageRequestValidation {
  return {
    error: { code: "AI_IMAGE_INVALID_REQUEST", message },
    ok: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
