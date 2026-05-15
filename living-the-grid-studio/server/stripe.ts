/**
 * Edge-safe Stripe wrapper.
 *
 * Stripe's official Node SDK pulls Node-only crypto APIs that don't run on
 * Cloudflare Workers. The endpoints we need (Checkout Session create + Session
 * retrieve) are simple form-encoded REST calls, so we hit them with `fetch`
 * directly. That keeps this file usable from both Express (Node) and Pages
 * Functions (Workers).
 */

import {
  findProduct,
  formatPrice,
  PAID_PRODUCTS,
  type PaidProduct,
} from "../shared/products";

export interface StripeEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  PUBLIC_SITE_URL?: string;
}

export interface ApiResult {
  body: unknown;
  status: number;
}

const STRIPE_API_BASE = "https://api.stripe.com/v1";

function getStripeKey(env?: StripeEnv): string {
  if (env?.STRIPE_SECRET_KEY) {
    const trimmed = env.STRIPE_SECRET_KEY.trim();
    if (trimmed) return trimmed;
  }
  if (typeof process !== "undefined" && process.env?.STRIPE_SECRET_KEY) {
    return process.env.STRIPE_SECRET_KEY.trim();
  }
  return "";
}

function getSiteUrl(env?: StripeEnv): string {
  const fromEnv = env?.PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (typeof process !== "undefined" && process.env?.PUBLIC_SITE_URL) {
    return process.env.PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  return "http://localhost:3000";
}

/**
 * Turns a nested object into Stripe's flat form encoding,
 * e.g. { line_items: [{ price_data: { ... } }] } becomes
 * `line_items[0][price_data][currency]=...`.
 */
function flatten(
  obj: unknown,
  prefix = "",
  out: Record<string, string> = {},
): Record<string, string> {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) {
    obj.forEach((value, index) => {
      flatten(value, `${prefix}[${index}]`, out);
    });
    return out;
  }
  if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const next = prefix ? `${prefix}[${key}]` : key;
      flatten(value, next, out);
    }
    return out;
  }
  out[prefix] = String(obj);
  return out;
}

async function stripeRequest(
  path: string,
  env: StripeEnv | undefined,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<{ status: number; payload: unknown }> {
  const key = getStripeKey(env);
  if (!key) {
    return {
      status: 501,
      payload: {
        configured: false,
        error:
          "Stripe is not configured. Set STRIPE_SECRET_KEY in the environment.",
      },
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  };
  let body: string | undefined;
  if (init.method === "POST" && init.body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    const flat = flatten(init.body);
    body = new URLSearchParams(flat).toString();
  }

  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: init.method,
    headers,
    body,
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  return { status: response.status, payload };
}

interface CheckoutRequest {
  productId?: unknown;
  customerEmail?: unknown;
}

export async function createCheckoutSession(
  request: CheckoutRequest,
  env?: StripeEnv,
): Promise<ApiResult> {
  const productId = typeof request.productId === "string" ? request.productId : "";
  const product = findProduct(productId);
  if (!product) {
    return {
      status: 400,
      body: {
        configured: true,
        error: `Unknown product id: ${productId || "(missing)"}.`,
      },
    };
  }

  const site = getSiteUrl(env);
  const successUrl = `${site}${product.successPath}${
    product.successPath.includes("?") ? "&" : "?"
  }session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${site}/unlock?canceled=1`;

  const params = {
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: product.currency,
          unit_amount: product.amount,
          product_data: {
            name: product.name,
            description: product.description,
          },
        },
      },
    ],
    automatic_tax: { enabled: true },
    allow_promotion_codes: true,
    metadata: {
      productId: product.id,
    },
    ...(typeof request.customerEmail === "string" && request.customerEmail
      ? { customer_email: request.customerEmail }
      : {}),
  };

  const { status, payload } = await stripeRequest("/checkout/sessions", env, {
    method: "POST",
    body: params,
  });
  if (status >= 400) {
    return {
      status,
      body: {
        configured: true,
        error:
          (payload as { error?: { message?: string } })?.error?.message ??
          `Stripe Checkout creation failed with status ${status}.`,
      },
    };
  }

  const session = payload as { id?: string; url?: string };
  return {
    status: 200,
    body: {
      configured: true,
      sessionId: session.id ?? null,
      url: session.url ?? null,
      product: {
        id: product.id,
        name: product.name,
        priceLabel: formatPrice(product.amount, product.currency),
      } satisfies PublicProductSummary,
    },
  };
}

export interface PublicProductSummary {
  id: PaidProduct["id"];
  name: PaidProduct["name"];
  priceLabel: string;
}

export async function verifyCheckoutSession(
  sessionId: string,
  env?: StripeEnv,
): Promise<ApiResult> {
  if (!sessionId || sessionId.length > 256) {
    return {
      status: 400,
      body: { configured: true, error: "Invalid session id." },
    };
  }

  const { status, payload } = await stripeRequest(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    env,
    { method: "GET" },
  );
  if (status >= 400) {
    return {
      status,
      body: {
        configured: true,
        error:
          (payload as { error?: { message?: string } })?.error?.message ??
          `Stripe session lookup failed with status ${status}.`,
      },
    };
  }

  const session = payload as {
    id?: string;
    payment_status?: string;
    metadata?: Record<string, string | undefined>;
    customer_details?: { email?: string };
  };
  const productId = session.metadata?.productId ?? "";
  const product = productId ? findProduct(productId) : undefined;

  return {
    status: 200,
    body: {
      configured: true,
      sessionId: session.id ?? null,
      paid: session.payment_status === "paid",
      paymentStatus: session.payment_status ?? "unknown",
      email: session.customer_details?.email ?? null,
      product: product
        ? {
            id: product.id,
            name: product.name,
            priceLabel: formatPrice(product.amount, product.currency),
          }
        : null,
    },
  };
}

export function listPublicProducts(): PaidProduct[] {
  return [...PAID_PRODUCTS];
}
