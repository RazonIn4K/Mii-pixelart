/**
 * Cloudflare Pages Function: catch-all for `/api/ai/*`.
 *
 * Mirrors the Express routes in `server/index.ts` and the Vite dev middleware
 * in `vite.config.ts`. Reuses the shared OpenRouter helpers from
 * `server/openrouter.ts`, threading `context.env` through so Workers' env
 * bindings replace `process.env` at the edge.
 *
 * Required bindings (Cloudflare Pages → Settings → Environment variables):
 *   - OPENROUTER_API_KEY (secret) — your OpenRouter key
 *   - PUBLIC_SITE_URL (plaintext, optional) — e.g. https://tomodachi.pw
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

interface PagesContext<EnvT = OpenRouterEnv> {
  env: EnvT;
  params: { path?: string | string[] };
  request: Request;
}

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
      return jsonResponse(await getOpenRouterModels(env));
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
