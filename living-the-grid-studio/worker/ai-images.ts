import {
  AI_IMAGE_LIMITS,
  AI_IMAGE_MODEL_PRESETS,
  type AiImageGenerationRequest,
  validateAiImageGenerationRequest,
} from "../shared/ai-images";
import {
  generateOpenRouterImage,
  isOpenRouterImageGenerationConfigured,
  type OpenRouterImageResult,
} from "../server/openrouter-images";
import { clientKey, enforceRateLimit, requireOnboardedSession } from "./auth";
import { sha256 } from "./crypto";
import {
  failure,
  HttpError,
  readJson,
  success,
  type WorkerRequestContext,
} from "./http";
import type { Router } from "./router";

const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const AI_IMAGE_RESERVATION_MICRO_USD = Math.round(
  AI_IMAGE_LIMITS.maxPerImageCostUsd * 1_000_000,
);

interface AiImageRouteRequest extends AiImageGenerationRequest {
  idempotencyKey: string;
}

interface AiImageUsageRow {
  request_count: number;
  reserved_or_spent_microusd: number;
}

type ImageGenerator = typeof generateOpenRouterImage;

export function registerAiImageRoutes(
  router: Router,
  generateImage: ImageGenerator = generateOpenRouterImage,
): void {
  router
    .add("GET", "/api/ai/images/status", getAiImageStatus)
    .add("POST", "/api/ai/images", (context) =>
      generateAiImage(context, generateImage),
    );
}

async function getAiImageStatus(
  context: WorkerRequestContext,
): Promise<Response> {
  const policy = readAiImagePolicy(context.env);
  return success(context.requestId, {
    configured: isOpenRouterImageGenerationConfigured(context.env),
    enabled:
      context.env.AI_IMAGE_GENERATION_ENABLED === "true" &&
      policy.dailyBudgetMicroUsd >= AI_IMAGE_RESERVATION_MICRO_USD &&
      policy.userDailyLimit > 0,
    maxPerImageCostUsd: AI_IMAGE_LIMITS.maxPerImageCostUsd,
    models: AI_IMAGE_MODEL_PRESETS,
    userDailyLimit: policy.userDailyLimit,
  });
}

async function generateAiImage(
  context: WorkerRequestContext,
  generateImage: ImageGenerator,
): Promise<Response> {
  const session = await requireOnboardedSession(context);
  const policy = assertAiImageGenerationEnabled(context.env);
  await enforceRateLimit(
    context.env.AI_RATE_LIMITER,
    await clientKey(context.env, context.request),
  );
  await enforceRateLimit(
    context.env.AI_RATE_LIMITER,
    `image-user:${session.user.id}`,
  );

  const request = parseAiImageRouteRequest(
    await readJson(context.request, AI_IMAGE_LIMITS.maxRequestBytes),
  );
  const requestId = crypto.randomUUID();
  const now = Date.now();
  const dayStart = startOfUtcDay(now);
  await reserveAiImageBudget(context.env, {
    dayStart,
    idempotencyKey: request.idempotencyKey,
    model: request.model,
    now,
    promptSha256: await sha256(request.prompt),
    requestId,
    userDailyLimit: policy.userDailyLimit,
    userId: session.user.id,
    dailyBudgetMicroUsd: policy.dailyBudgetMicroUsd,
  });

  let result: OpenRouterImageResult;
  try {
    result = await generateImage(
      { model: request.model, prompt: request.prompt },
      context.env,
      context.request.signal,
    );
  } catch {
    await failAiImageRequest(context.env, requestId, "adapter_exception", true);
    throw new HttpError(
      503,
      "ai_image_unavailable",
      "Image generation is temporarily unavailable.",
    );
  }

  if (!result.ok) {
    await failAiImageRequest(
      context.env,
      requestId,
      normalizedLedgerError(result.error.code),
      mightHaveIncurredCost(result.error.code),
    );
    return failure(
      context.requestId,
      publicAdapterStatus(result.status),
      result.error.code.toLowerCase(),
      result.error.message,
      undefined,
      undefined,
      result.error.retryable ? { "Retry-After": "60" } : undefined,
    );
  }

  const actualCostMicroUsd = Math.ceil(result.image.usageCostUsd * 1_000_000);
  if (
    actualCostMicroUsd < 0 ||
    actualCostMicroUsd > AI_IMAGE_RESERVATION_MICRO_USD
  ) {
    await failAiImageRequest(
      context.env,
      requestId,
      "provider_cost_exceeded",
      true,
    );
    throw new HttpError(
      503,
      "ai_image_cost_exceeded",
      "Image generation exceeded its configured cost ceiling.",
    );
  }

  const recorded = await context.env.DB.prepare(
    `UPDATE ai_image_requests
     SET status = 'complete', actual_cost_microusd = ?, completed_at = ?
     WHERE id = ? AND user_id = ? AND status = 'pending'`,
  )
    .bind(actualCostMicroUsd, Date.now(), requestId, session.user.id)
    .run();
  if ((recorded.meta.changes ?? 0) !== 1) {
    throw new HttpError(
      503,
      "ai_image_ledger_conflict",
      "The generated image could not be safely recorded.",
    );
  }

  return new Response(result.image.bytes, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Length": String(result.image.bytes.byteLength),
      "Content-Type": result.image.mimeType,
      "X-AI-Image-Cost-Micro-USD": String(actualCostMicroUsd),
      "X-AI-Image-Model": result.image.model,
      "X-AI-Image-Request-Id": requestId,
    },
    status: 200,
  });
}

function parseAiImageRouteRequest(value: unknown): AiImageRouteRequest {
  if (!isRecord(value)) {
    throw new HttpError(
      400,
      "invalid_ai_image_request",
      "Image request is invalid.",
    );
  }
  const allowedKeys = new Set(["idempotencyKey", "model", "prompt"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new HttpError(
      400,
      "invalid_ai_image_request",
      "Image request contains unsupported fields.",
    );
  }
  if (
    typeof value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey)
  ) {
    throw new HttpError(
      400,
      "invalid_ai_image_idempotency_key",
      "Image request identifier must be a UUIDv4.",
    );
  }
  const validated = validateAiImageGenerationRequest(value);
  if (!validated.ok) {
    throw new HttpError(
      400,
      validated.error.code.toLowerCase(),
      validated.error.message,
    );
  }
  return { ...validated.value, idempotencyKey: value.idempotencyKey };
}

interface ReserveAiImageBudgetInput {
  dailyBudgetMicroUsd: number;
  dayStart: number;
  idempotencyKey: string;
  model: string;
  now: number;
  promptSha256: string;
  requestId: string;
  userDailyLimit: number;
  userId: string;
}

export async function reserveAiImageBudget(
  env: Env,
  input: ReserveAiImageBudgetInput,
): Promise<void> {
  let reserved: D1Result;
  try {
    reserved = await env.DB.prepare(
      `INSERT INTO ai_image_requests
       (id, user_id, idempotency_key, prompt_sha256, model, status,
        reserved_cost_microusd, created_at)
       SELECT ?, ?, ?, ?, ?, 'pending', ?, ?
       WHERE (
         SELECT COUNT(*) FROM ai_image_requests
         WHERE user_id = ? AND created_at >= ?
       ) < ?
       AND COALESCE((
         SELECT SUM(
           CASE
             WHEN status = 'pending' THEN reserved_cost_microusd
             ELSE COALESCE(actual_cost_microusd, reserved_cost_microusd)
           END
         )
         FROM ai_image_requests
         WHERE created_at >= ?
       ), 0) + ? <= ?`,
    )
      .bind(
        input.requestId,
        input.userId,
        input.idempotencyKey,
        input.promptSha256,
        input.model,
        AI_IMAGE_RESERVATION_MICRO_USD,
        input.now,
        input.userId,
        input.dayStart,
        input.userDailyLimit,
        input.dayStart,
        AI_IMAGE_RESERVATION_MICRO_USD,
        input.dailyBudgetMicroUsd,
      )
      .run();
  } catch (error) {
    if (
      error instanceof Error &&
      /unique constraint failed: ai_image_requests\.user_id, ai_image_requests\.idempotency_key/iu.test(
        error.message,
      )
    ) {
      throw new HttpError(
        409,
        "ai_image_request_replayed",
        "That image request was already accepted. Start a new generation to try again.",
      );
    }
    throw error;
  }
  if ((reserved.meta.changes ?? 0) === 1) return;

  const usage = await getAiImageUsage(env, input.userId, input.dayStart);
  if (usage.request_count >= input.userDailyLimit) {
    throw new HttpError(
      429,
      "ai_image_daily_limit",
      "Your daily image-generation limit has been reached.",
      undefined,
      undefined,
      { "Retry-After": secondsUntilNextUtcDay(input.now).toString() },
    );
  }
  throw new HttpError(
    503,
    "ai_image_daily_budget_exhausted",
    "The shared daily image-generation budget has been reached.",
    undefined,
    undefined,
    { "Retry-After": secondsUntilNextUtcDay(input.now).toString() },
  );
}

async function getAiImageUsage(
  env: Env,
  userId: string,
  dayStart: number,
): Promise<AiImageUsageRow> {
  const row = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS request_count,
       COALESCE(SUM(
         CASE
           WHEN status = 'pending' THEN reserved_cost_microusd
           ELSE COALESCE(actual_cost_microusd, reserved_cost_microusd)
         END
       ), 0) AS reserved_or_spent_microusd
     FROM ai_image_requests
     WHERE created_at >= ?`,
  )
    .bind(userId, dayStart)
    .first<AiImageUsageRow>();
  return {
    request_count: Number(row?.request_count ?? 0),
    reserved_or_spent_microusd: Number(row?.reserved_or_spent_microusd ?? 0),
  };
}

async function failAiImageRequest(
  env: Env,
  requestId: string,
  errorCode: string,
  reserveCost: boolean,
): Promise<void> {
  const result = await env.DB.prepare(
    `UPDATE ai_image_requests
     SET status = 'failed', actual_cost_microusd = ?,
       error_code = ?, completed_at = ?
     WHERE id = ? AND status = 'pending'`,
  )
    .bind(
      reserveCost ? AI_IMAGE_RESERVATION_MICRO_USD : 0,
      errorCode.slice(0, 64),
      Date.now(),
      requestId,
    )
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    console.error(
      JSON.stringify({
        message: "ai_image_ledger_failure_update_missed",
        requestId,
      }),
    );
  }
}

function assertAiImageGenerationEnabled(env: Env): {
  dailyBudgetMicroUsd: number;
  userDailyLimit: number;
} {
  const policy = readAiImagePolicy(env);
  if (
    env.AI_IMAGE_GENERATION_ENABLED !== "true" ||
    policy.dailyBudgetMicroUsd < AI_IMAGE_RESERVATION_MICRO_USD ||
    policy.userDailyLimit < 1 ||
    !isOpenRouterImageGenerationConfigured(env)
  ) {
    throw new HttpError(
      503,
      "ai_image_generation_disabled",
      "Image generation is not enabled for this deployment.",
    );
  }
  return policy;
}

function readAiImagePolicy(env: Env): {
  dailyBudgetMicroUsd: number;
  userDailyLimit: number;
} {
  return {
    dailyBudgetMicroUsd: parseBoundedInteger(
      env.AI_IMAGE_DAILY_BUDGET_MICRO_USD,
      0,
      100_000_000,
    ),
    userDailyLimit: parseBoundedInteger(env.AI_IMAGE_USER_DAILY_LIMIT, 0, 100),
  };
}

function parseBoundedInteger(
  value: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : 0;
}

function publicAdapterStatus(status: number): number {
  if (status === 400 || status === 429) return status;
  if (status === 499) return 408;
  return 503;
}

function mightHaveIncurredCost(code: string): boolean {
  return [
    "AI_IMAGE_REQUEST_ABORTED",
    "AI_IMAGE_UPSTREAM_INVALID_RESPONSE",
    "AI_IMAGE_UPSTREAM_RESPONSE_TOO_LARGE",
    "AI_IMAGE_UPSTREAM_TIMEOUT",
  ].includes(code);
}

function normalizedLedgerError(code: string): string {
  return code
    .toLowerCase()
    .replace(/^ai_image_/u, "")
    .slice(0, 64);
}

function startOfUtcDay(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function secondsUntilNextUtcDay(now: number): number {
  return Math.max(
    1,
    Math.ceil((startOfUtcDay(now) + 24 * 60 * 60 * 1_000 - now) / 1_000),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
