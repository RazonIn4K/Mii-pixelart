import type { AiChatRequest } from "../shared/ai";
import { formatPrice } from "../shared/products";
import {
  getOpenRouterModels,
  getOpenRouterStatus,
  sendOpenRouterChat,
  type ApiResult as AiApiResult,
} from "../server/openrouter";
import {
  createCheckoutSession,
  listPublicProducts,
  verifyCheckoutSession,
  type ApiResult as StripeApiResult,
} from "../server/stripe";
import { HttpError, readJson, readText, type WorkerRequestContext } from "./http";
import type { Router } from "./router";

const MODELS_CACHE_KEY = "openrouter:models";
const MODELS_CACHE_SECONDS = 3_600;
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const STRIPE_EVENT_TTL_SECONDS = 24 * 60 * 60;

export function registerLegacyRoutes(router: Router): void {
  router
    .add("*", "/api/ai/*path", handleAi)
    .add("*", "/api/stripe/*path", handleStripe)
    .add("POST", "/api/webhooks/stripe", handleStripeWebhook);
}

async function handleAi(context: WorkerRequestContext): Promise<Response> {
  const method = context.request.method === "HEAD" ? "GET" : context.request.method;
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
    return new Response(body, { status: result.status, headers: legacyHeaders("MISS") });
  }
  if (method === "POST" && path === "chat") {
    const body = await readJson(context.request, 1_000_000);
    if (!isAiChatRequest(body)) {
      throw new HttpError(400, "invalid_ai_request", "AI request is invalid.");
    }
    return legacyJson(await sendOpenRouterChat(body, context.env));
  }
  throw new HttpError(404, "ai_route_not_found", "AI route was not found.");
}

async function handleStripe(context: WorkerRequestContext): Promise<Response> {
  const method = context.request.method === "HEAD" ? "GET" : context.request.method;
  const path = context.params.path.replace(/^\/+|\/+$/gu, "");
  if (method === "GET" && path === "products") {
    const category = context.url.searchParams.get("category");
    const products = listPublicProducts()
      .filter((product) => !category || product.category === category)
      .map((product) => ({
        category: product.category,
        caveat: product.caveat ?? null,
        description: product.description,
        id: product.id,
        name: product.name,
        perks: product.perks ?? [],
        priceLabel: formatPrice(product.amount, product.currency),
      }));
    return legacyJson({ body: { products }, status: 200 });
  }
  if (method === "POST" && path === "checkout") {
    const body = await readJson(context.request, 100_000);
    return legacyJson(await createCheckoutSession(toRecord(body), context.env));
  }
  if (method === "GET" && path === "session") {
    return legacyJson(
      await verifyCheckoutSession(context.url.searchParams.get("session_id") ?? "", context.env),
    );
  }
  throw new HttpError(404, "stripe_route_not_found", "Stripe route was not found.");
}

async function handleStripeWebhook(context: WorkerRequestContext): Promise<Response> {
  if (!context.env.STRIPE_WEBHOOK_SECRET) {
    throw new HttpError(503, "stripe_not_configured", "Stripe webhook is not configured.");
  }
  const signature = context.request.headers.get("stripe-signature");
  if (!signature) throw new HttpError(400, "missing_signature", "Stripe signature is missing.");
  const declaredLength = Number(context.request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 1_000_000) {
    throw new HttpError(413, "payload_too_large", "Webhook body is too large.");
  }
  const rawBody = await readText(context.request, 1_000_000);
  if (!(await verifyStripeSignature(rawBody, signature, context.env.STRIPE_WEBHOOK_SECRET))) {
    throw new HttpError(400, "invalid_signature", "Stripe signature is invalid.");
  }
  const event = parseStripeEvent(rawBody);
  const eventId = event.id ?? "";
  if (eventId && await context.env.EDGE_CACHE.get(`stripe:event:${eventId}`)) {
    return Response.json({ deduped: true, received: true });
  }

  console.log(JSON.stringify({
    eventId,
    eventType: event.type ?? "unknown",
    message: "stripe_event_received",
    requestId: context.requestId,
  }));
  if (eventId) {
    await context.env.EDGE_CACHE.put(`stripe:event:${eventId}`, "1", {
      expirationTtl: STRIPE_EVENT_TTL_SECONDS,
    });
  }
  return Response.json({ received: true });
}

function legacyJson(result: AiApiResult | StripeApiResult): Response {
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

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_json", "Expected a JSON object.");
  }
  return value as Record<string, unknown>;
}

function isAiChatRequest(value: unknown): value is AiChatRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.model !== "string" || !Array.isArray(record.messages)) return false;
  return record.messages.every((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) return false;
    const entry = message as Record<string, unknown>;
    return (entry.role === "user" || entry.role === "assistant")
      && typeof entry.content === "string";
  });
}

function parseStripeEvent(rawBody: string): { id?: string; type?: string } {
  try {
    const value: unknown = JSON.parse(rawBody);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not object");
    }
    const record = value as Record<string, unknown>;
    return {
      id: typeof record.id === "string" ? record.id : undefined,
      type: typeof record.type === "string" ? record.type : undefined,
    };
  } catch {
    throw new HttpError(400, "invalid_json", "Webhook body is not valid JSON.");
  }
}

async function verifyStripeSignature(
  rawBody: string,
  header: string,
  secret: string,
): Promise<boolean> {
  const parts = header.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(Math.floor(Date.now() / 1_000) - timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return signatures.some((signature) => constantTimeEqual(signature, expected));
}

function constantTimeEqual(left: string, right: string): boolean {
  const size = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < size; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
