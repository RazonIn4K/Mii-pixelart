import {
  AI_IMAGE_DEFAULT_MODEL,
  AI_IMAGE_FALLBACK_MODEL,
  AI_IMAGE_LIMITS,
  type AiImageGenerationRequest,
  type AiImageModelId,
  type AiImageRequestErrorCode,
  validateAiImageGenerationRequest,
} from "../shared/ai-images";
import { readGeneratedImageDimensions } from "./generated-image-dimensions";

const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";
const DEFAULT_REFERER = "http://localhost:3000";
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type SupportedGeneratedImageMime =
  "image/jpeg" | "image/png" | "image/webp";

export type OpenRouterImageErrorCode =
  | AiImageRequestErrorCode
  | "AI_IMAGE_NOT_CONFIGURED"
  | "AI_IMAGE_REQUEST_ABORTED"
  | "AI_IMAGE_UPSTREAM_INVALID_RESPONSE"
  | "AI_IMAGE_UPSTREAM_ACCESS_REQUIRED"
  | "AI_IMAGE_UPSTREAM_RATE_LIMITED"
  | "AI_IMAGE_UPSTREAM_REJECTED"
  | "AI_IMAGE_UPSTREAM_RESPONSE_TOO_LARGE"
  | "AI_IMAGE_UPSTREAM_TIMEOUT"
  | "AI_IMAGE_UPSTREAM_UNAVAILABLE";

export interface OpenRouterImageError {
  code: OpenRouterImageErrorCode;
  message: string;
  retryable: boolean;
}

export type OpenRouterImageResult =
  | {
      image: {
        bytes: Uint8Array;
        height: number;
        mimeType: SupportedGeneratedImageMime;
        model: AiImageModelId;
        usageCostUsd: number;
        width: number;
      };
      ok: true;
      status: 200;
    }
  | {
      error: OpenRouterImageError;
      ok: false;
      status: number;
    };

export interface OpenRouterImageEnv {
  OPENROUTER_API_KEY?: string;
  PUBLIC_SITE_URL?: string;
}

interface ProviderImageRequest {
  aspect_ratio?: "1:1";
  background?: "transparent";
  model: AiImageModelId;
  n: 1;
  prompt: string;
  provider: {
    allow_fallbacks: false;
    data_collection: "deny";
    max_price: {
      image: typeof AI_IMAGE_LIMITS.maxPerImageCostUsd;
    };
    require_parameters: true;
    sort: "price";
  };
  quality?: "low";
  resolution?: "1K";
}

class ResponseLimitError extends Error {
  constructor() {
    super("OpenRouter image response exceeded its byte limit.");
    this.name = "ResponseLimitError";
  }
}

/**
 * Generate one bounded raster image through OpenRouter's dedicated Image API.
 *
 * The caller supplies untrusted request data; this function validates it
 * before any provider contact. It deliberately does not retry or switch to the
 * fallback model automatically because each accepted generation consumes
 * bounded provider capacity.
 */
export async function generateOpenRouterImage(
  request: unknown,
  env?: OpenRouterImageEnv,
  requestSignal?: AbortSignal,
): Promise<OpenRouterImageResult> {
  const validated = validateAiImageGenerationRequest(request);
  if (!validated.ok) {
    return failure(validated.error.code, validated.error.message, 400, false);
  }

  const apiKey = getOpenRouterApiKey(env);
  if (!apiKey) {
    return failure(
      "AI_IMAGE_NOT_CONFIGURED",
      "Image generation is not configured.",
      501,
      false,
    );
  }

  const providerRequest = buildProviderRequest(validated.value);
  const requestBody = JSON.stringify(providerRequest);
  if (
    new TextEncoder().encode(requestBody).byteLength >
    AI_IMAGE_LIMITS.maxRequestBytes
  ) {
    return failure(
      "AI_IMAGE_INVALID_REQUEST",
      "The image request is too large.",
      400,
      false,
    );
  }

  const timeoutSignal = AbortSignal.timeout(AI_IMAGE_LIMITS.timeoutMs);
  const signal = requestSignal
    ? AbortSignal.any([requestSignal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(OPENROUTER_IMAGES_URL, {
      body: requestBody,
      headers: getOpenRouterImageHeaders(apiKey, env),
      method: "POST",
      signal,
    });
  } catch (error) {
    if (requestSignal?.aborted) {
      return failure(
        "AI_IMAGE_REQUEST_ABORTED",
        "The image request was cancelled.",
        499,
        false,
      );
    }
    if (
      signal.aborted ||
      (error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError"))
    ) {
      return failure(
        "AI_IMAGE_UPSTREAM_TIMEOUT",
        "Image generation timed out. Try again in a moment.",
        504,
        true,
      );
    }
    return failure(
      "AI_IMAGE_UPSTREAM_UNAVAILABLE",
      "The image service could not be reached.",
      502,
      true,
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      return failure(
        "AI_IMAGE_UPSTREAM_RATE_LIMITED",
        "Image generation is busy. Try again later.",
        429,
        true,
      );
    }
    if (response.status === 402) {
      return failure(
        "AI_IMAGE_UPSTREAM_ACCESS_REQUIRED",
        "Image generation is temporarily unavailable.",
        503,
        false,
      );
    }
    return failure(
      "AI_IMAGE_UPSTREAM_REJECTED",
      "The image service rejected the request.",
      502,
      response.status >= 500,
    );
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return invalidProviderResponse();
  }

  let responseBytes: Uint8Array;
  try {
    responseBytes = await readBoundedResponse(
      response,
      AI_IMAGE_LIMITS.maxProviderResponseBytes,
    );
  } catch (error) {
    if (error instanceof ResponseLimitError) {
      return failure(
        "AI_IMAGE_UPSTREAM_RESPONSE_TOO_LARGE",
        "The generated image exceeded the safe size limit.",
        502,
        false,
      );
    }
    if (requestSignal?.aborted) {
      return failure(
        "AI_IMAGE_REQUEST_ABORTED",
        "The image request was cancelled.",
        499,
        false,
      );
    }
    if (
      signal.aborted ||
      (error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError"))
    ) {
      return failure(
        "AI_IMAGE_UPSTREAM_TIMEOUT",
        "Image generation timed out. Try again in a moment.",
        504,
        true,
      );
    }
    return invalidProviderResponse();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(responseBytes),
    );
  } catch {
    return invalidProviderResponse();
  }

  const parsed = parseProviderImage(payload, validated.value.model);
  return parsed ?? invalidProviderResponse();
}

export function isOpenRouterImageGenerationConfigured(
  env?: OpenRouterImageEnv,
): boolean {
  return Boolean(getOpenRouterApiKey(env));
}

function buildProviderRequest(
  request: AiImageGenerationRequest,
): ProviderImageRequest {
  const common = {
    model: request.model,
    n: 1,
    prompt: request.prompt,
    provider: {
      allow_fallbacks: false,
      data_collection: "deny",
      max_price: { image: AI_IMAGE_LIMITS.maxPerImageCostUsd },
      require_parameters: true,
      sort: "price",
    },
  } as const;

  if (request.model === AI_IMAGE_DEFAULT_MODEL) {
    return {
      ...common,
      aspect_ratio: "1:1",
      resolution: "1K",
    };
  }

  // The sole higher-detail fallback is explicit and never invoked
  // automatically. It shares the reviewed square 1K capability shape with the
  // default model while costing more per generated image.
  if (request.model === AI_IMAGE_FALLBACK_MODEL) {
    return {
      ...common,
      aspect_ratio: "1:1",
      resolution: "1K",
    };
  }

  // The shared validator makes this branch unreachable. Keeping the function
  // exhaustive ensures a future model addition must define reviewed options.
  return assertNever(request.model);
}

function parseProviderImage(
  value: unknown,
  requestedModel: AiImageModelId,
): OpenRouterImageResult | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.data) ||
    value.data.length !== 1
  ) {
    return null;
  }
  const item = value.data[0];
  if (
    !isRecord(item) ||
    "url" in item ||
    "image_url" in item ||
    typeof item.b64_json !== "string"
  ) {
    return null;
  }

  const usage = value.usage;
  if (
    !isRecord(usage) ||
    typeof usage.cost !== "number" ||
    !Number.isFinite(usage.cost) ||
    usage.cost < 0 ||
    usage.cost > AI_IMAGE_LIMITS.maxPerImageCostUsd
  ) {
    return null;
  }

  const base64 = item.b64_json;
  if (
    !base64 ||
    base64.startsWith("http://") ||
    base64.startsWith("https://") ||
    base64.startsWith("data:") ||
    !BASE64_PATTERN.test(base64)
  ) {
    return null;
  }

  const decodedLength = getDecodedBase64Length(base64);
  if (
    decodedLength <= 0 ||
    decodedLength > AI_IMAGE_LIMITS.maxDecodedImageBytes
  ) {
    return null;
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(base64, decodedLength);
  } catch {
    return null;
  }

  const detectedMime = detectImageMime(bytes);
  if (!detectedMime) return null;
  if (item.media_type !== undefined && item.media_type !== detectedMime) {
    return null;
  }
  const dimensions = readGeneratedImageDimensions(bytes, detectedMime);
  if (
    !dimensions ||
    dimensions.width > AI_IMAGE_LIMITS.maxImageDimension ||
    dimensions.height > AI_IMAGE_LIMITS.maxImageDimension ||
    dimensions.width * dimensions.height > AI_IMAGE_LIMITS.maxImagePixels
  ) {
    return null;
  }

  return {
    image: {
      bytes,
      height: dimensions.height,
      mimeType: detectedMime,
      model: requestedModel,
      usageCostUsd: usage.cost,
      width: dimensions.width,
    },
    ok: true,
    status: 200,
  };
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > maxBytes
    ) {
      throw new ResponseLimitError();
    }
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the authoritative size-limit error even if the upstream
          // stream also fails while it is being cancelled.
        }
        throw new ResponseLimitError();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function getDecodedBase64Length(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function decodeBase64(value: string, decodedLength: number): Uint8Array {
  const bytes = new Uint8Array(decodedLength);
  // Decode bounded chunks to avoid retaining one additional multi-megabyte
  // binary string. Chunk size is divisible by four, preserving base64 groups.
  const chunkLength = 32_768;
  let outputOffset = 0;
  for (let offset = 0; offset < value.length; offset += chunkLength) {
    const decoded = atob(value.slice(offset, offset + chunkLength));
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[outputOffset] = decoded.charCodeAt(index);
      outputOffset += 1;
    }
  }
  if (outputOffset !== decodedLength) {
    throw new Error("Decoded image length mismatch.");
  }
  return bytes;
}

function detectImageMime(
  bytes: Uint8Array,
): SupportedGeneratedImageMime | null {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a &&
    asciiAt(bytes, 12, "IHDR")
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 16 &&
    asciiAt(bytes, 0, "RIFF") &&
    asciiAt(bytes, 8, "WEBP") &&
    (asciiAt(bytes, 12, "VP8 ") ||
      asciiAt(bytes, 12, "VP8L") ||
      asciiAt(bytes, 12, "VP8X"))
  ) {
    return "image/webp";
  }
  return null;
}

function asciiAt(bytes: Uint8Array, offset: number, expected: string): boolean {
  if (offset + expected.length > bytes.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false;
  }
  return true;
}

function getOpenRouterApiKey(env?: OpenRouterImageEnv): string {
  if (env && "OPENROUTER_API_KEY" in env) {
    return env.OPENROUTER_API_KEY?.trim() ?? "";
  }
  if (typeof process !== "undefined") {
    return process.env?.OPENROUTER_API_KEY?.trim() ?? "";
  }
  return "";
}

function getOpenRouterImageHeaders(
  apiKey: string,
  env?: OpenRouterImageEnv,
): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": getSafeReferer(env),
    "X-OpenRouter-Title": "Living The Grid Studio",
  };
}

function getSafeReferer(env?: OpenRouterImageEnv): string {
  const value =
    env && "PUBLIC_SITE_URL" in env
      ? env.PUBLIC_SITE_URL?.trim()
      : typeof process !== "undefined"
        ? process.env?.PUBLIC_SITE_URL?.trim()
        : undefined;
  if (!value) return DEFAULT_REFERER;
  try {
    const url = new URL(value);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    ) {
      return url.origin;
    }
  } catch {
    // Fall through to a non-sensitive local attribution URL.
  }
  return DEFAULT_REFERER;
}

function invalidProviderResponse(): OpenRouterImageResult {
  return failure(
    "AI_IMAGE_UPSTREAM_INVALID_RESPONSE",
    "The image service returned an invalid image.",
    502,
    true,
  );
}

function failure(
  code: OpenRouterImageErrorCode,
  message: string,
  status: number,
  retryable: boolean,
): OpenRouterImageResult {
  return {
    error: { code, message, retryable },
    ok: false,
    status,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported image model: ${String(value)}`);
}
