/**
 * Cloudflare Pages Function: catch-all for `/api/ai/*`.
 *
 * Mirrors the Express routes in `server/index.ts` and the Vite dev middleware
 * in `vite.config.ts`. Reuses the shared OpenRouter helpers from
 * `server/openrouter.ts`, threading `context.env` through so Workers' env
 * bindings replace `process.env` at the edge.
 *
 * Required env bindings (Pages → Settings → Environment variables):
 *   - OPENROUTER_API_KEY (secret)       — your OpenRouter key
 *   - PUBLIC_SITE_URL   (plaintext)     — e.g. https://tomodachi.pw
 *
 * Optional KV binding (Pages → Settings → Functions → KV namespace bindings):
 *   - EDGE_CACHE  →  tomodachi-edge-cache (5129b5ce8d2d435cb704b398a437f355)
 *     Used to cache the OpenRouter models list for 1 hour so every page load
 *     doesn't hit the OpenRouter API. Falls back gracefully when absent.
 *
 * Route shape:
 *   GET  /api/ai/status
 *   GET  /api/ai/models
 *   POST /api/ai/chat
 */

import type { AiChatRequest } from "../../../shared/ai";
import {
  getOpenRouterModels,
  getOpenRouterStatus,
  sendOpenRouterChat,
  type ApiResult,
  type OpenRouterEnv,
} from "../../../server/openrouter";

// KV namespace binding shape — present when EDGE_CACHE is wired up.
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface EdgeEnv extends OpenRouterEnv {
  EDGE_CACHE?: KVNamespace;
}

interface PagesContext {
  env: EdgeEnv;
  params: { path?: string | string[] };
  request: Request;
}

const KV_MODELS_KEY = "openrouter:models";
const KV_MODELS_TTL_SECONDS = 3600; // 1 hour

function jsonResponse(result: ApiResult): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Never let intermediaries cache AI responses or status checks.
      "Cache-Control": "no-store",
    },
  });
}

function resolveSubpath(params: PagesContext["params"]): string {
  const raw = params?.path;
  if (!raw) return "";
  if (Array.isArray(raw)) return raw.join("/");
  return String(raw);
}

async function readJsonBody(request: Request): Promise<unknown> {
  if (request.method !== "POST") return {};
  const text = await request.text();
  if (!text) return {};
  if (text.length > 1_000_000) {
    throw new Error("Request body is too large.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON request body.");
  }
}

/**
 * Serve GET /api/ai/models with a 1-hour KV cache.
 *
 * Cache hit:  return the stored JSON body directly — zero upstream calls.
 * Cache miss: call getOpenRouterModels(), store the result in KV, return it.
 * No KV:      fall through to getOpenRouterModels() without caching.
 */
async function handleModels(env: EdgeEnv): Promise<Response> {
  const kv = env.EDGE_CACHE;

  if (kv) {
    try {
      const cached = await kv.get(KV_MODELS_KEY);
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Cache": "HIT",
          },
        });
      }
    } catch {
      // KV read failure is non-fatal — fall through to live fetch.
    }
  }

  const result = await getOpenRouterModels(env);
  const body = JSON.stringify(result.body);

  if (kv && result.status === 200) {
    try {
      await kv.put(KV_MODELS_KEY, body, { expirationTtl: KV_MODELS_TTL_SECONDS });
    } catch {
      // KV write failure is non-fatal — the response is still valid.
    }
  }

  return new Response(body, {
    status: result.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Cache": "MISS",
    },
  });
}

export const onRequest = async (
  context: PagesContext,
): Promise<Response> => {
  const subpath = resolveSubpath(context.params).replace(/^\/+|\/+$/g, "");
  const method = context.request.method.toUpperCase();
  const env = context.env;

  try {
    if (method === "GET" && subpath === "status") {
      return jsonResponse(getOpenRouterStatus(env));
    }
    if (method === "GET" && subpath === "models") {
      return handleModels(env);
    }
    if (method === "POST" && subpath === "chat") {
      const body = (await readJsonBody(context.request)) as AiChatRequest;
      return jsonResponse(await sendOpenRouterChat(body, env));
    }

    return new Response(
      JSON.stringify({
        configured: true,
        reply: `Unknown AI route: ${method} /api/ai/${subpath}`,
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        configured: true,
        reply:
          error instanceof Error
            ? error.message
            : "AI request failed at the edge.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
};
