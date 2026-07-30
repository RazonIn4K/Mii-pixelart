import { AI_CHAT_BODY_MAX_BYTES, type AiChatRequest } from "../shared/ai";
import {
  getOpenRouterModels,
  getOpenRouterStatus,
  sendOpenRouterChat,
  type ApiResult as AiApiResult,
} from "../server/openrouter";
import { clientKey, enforceRateLimit, requireOnboardedSession } from "./auth";
import { HttpError, readJson, type WorkerRequestContext } from "./http";
import type { Router } from "./router";

const MODELS_CACHE_KEY = "openrouter:models:v2";
const MODELS_CACHE_SECONDS = 3_600;

export function registerLegacyRoutes(router: Router): void {
  router
    .add("*", "/api/ai/*path", handleAi)
    .add("*", "/api/stripe/*path", decommissionedLegacyRoute)
    .add("*", "/api/webhooks/stripe", decommissionedLegacyRoute);
}

async function handleAi(context: WorkerRequestContext): Promise<Response> {
  const method =
    context.request.method === "HEAD" ? "GET" : context.request.method;
  const path = context.params.path.replace(/^\/+|\/+$/gu, "");
  if (method === "GET" && path === "status") {
    return legacyJson(getOpenRouterStatus(context.env));
  }
  if (method === "GET" && path === "models") {
    const cached = await context.env.EDGE_CACHE.get(MODELS_CACHE_KEY);
    if (cached) return new Response(cached, { headers: legacyHeaders("HIT") });
    const result = await getOpenRouterModels(context.env);
    const body = JSON.stringify(result.body);
    if (result.status === 200) {
      context.executionCtx.waitUntil(
        context.env.EDGE_CACHE.put(MODELS_CACHE_KEY, body, {
          expirationTtl: MODELS_CACHE_SECONDS,
        }),
      );
    }
    return new Response(body, {
      status: result.status,
      headers: legacyHeaders("MISS"),
    });
  }
  if (method === "POST" && path === "chat") {
    const session = await requireOnboardedSession(context);
    await enforceRateLimit(
      context.env.AI_RATE_LIMITER,
      await clientKey(context.env, context.request),
    );
    await enforceRateLimit(
      context.env.AI_RATE_LIMITER,
      `user:${session.user.id}`,
    );
    const body = await readJson(context.request, AI_CHAT_BODY_MAX_BYTES);
    if (!isAiChatRequest(body)) {
      throw new HttpError(400, "invalid_ai_request", "AI request is invalid.");
    }
    return legacyJson(
      await sendOpenRouterChat(body, context.env, context.request.signal),
    );
  }
  throw new HttpError(404, "ai_route_not_found", "AI route was not found.");
}

async function decommissionedLegacyRoute(): Promise<Response> {
  return Response.json(
    {
      error: {
        code: "route_decommissioned",
        message: "This legacy route is no longer available.",
      },
    },
    {
      headers: { "Cache-Control": "no-store" },
      status: 410,
    },
  );
}

function legacyJson(result: AiApiResult): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: legacyHeaders(),
  });
}

function legacyHeaders(cache?: string): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...(cache ? { "X-Cache": cache } : {}),
  });
}

function isAiChatRequest(value: unknown): value is AiChatRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.model !== "string" || !Array.isArray(record.messages))
    return false;
  return record.messages.every((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message))
      return false;
    const entry = message as Record<string, unknown>;
    return (
      (entry.role === "user" || entry.role === "assistant") &&
      typeof entry.content === "string"
    );
  });
}
