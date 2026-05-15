/**
 * Cloudflare Pages Function: catch-all for `/api/stripe/*`.
 *
 *   GET  /api/stripe/products             — list paid products + price labels.
 *   POST /api/stripe/checkout             — create a Stripe Checkout Session.
 *   GET  /api/stripe/session?session_id=… — verify a session after redirect.
 *
 * Required env bindings (Pages → Settings → Environment variables):
 *   - STRIPE_SECRET_KEY (secret)        — your Stripe restricted/secret key.
 *   - PUBLIC_SITE_URL  (plaintext)      — production origin, e.g. https://tomodachi.pw.
 */

import {
  createCheckoutSession,
  listPublicProducts,
  verifyCheckoutSession,
  type ApiResult,
  type StripeEnv,
} from "../../../server/stripe";
import { formatPrice } from "../../../shared/products";

interface PagesContext<EnvT = StripeEnv> {
  env: EnvT;
  params: { path?: string | string[] };
  request: Request;
}

function jsonResponse(result: ApiResult): Response {
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
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

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  if (request.method !== "POST") return {};
  const text = await request.text();
  if (!text) return {};
  if (text.length > 100_000) {
    throw new Error("Request body is too large.");
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
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
    if (method === "GET" && subpath === "products") {
      const products = listPublicProducts().map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        priceLabel: formatPrice(product.amount, product.currency),
        perks: product.perks ?? [],
        caveat: product.caveat ?? null,
      }));
      return jsonResponse({ status: 200, body: { products } });
    }

    if (method === "POST" && subpath === "checkout") {
      const body = await readJsonBody(context.request);
      return jsonResponse(await createCheckoutSession(body, env));
    }

    if (method === "GET" && subpath === "session") {
      const url = new URL(context.request.url);
      const sessionId = url.searchParams.get("session_id") ?? "";
      return jsonResponse(await verifyCheckoutSession(sessionId, env));
    }

    return new Response(
      JSON.stringify({
        configured: true,
        error: `Unknown Stripe route: ${method} /api/stripe/${subpath}`,
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
        error:
          error instanceof Error
            ? error.message
            : "Stripe request failed at the edge.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
};
