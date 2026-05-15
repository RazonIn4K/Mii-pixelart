/**
 * Cloudflare Pages Function: Stripe webhook receiver.
 *
 * Endpoint: POST /api/webhooks/stripe
 *
 * Subscribed events (configured in Stripe Dashboard → Webhooks):
 *   - checkout.session.completed   — a Checkout Session finished (paid or async)
 *   - payment_intent.succeeded     — payment cleared
 *
 * Security:
 *   Stripe signs every webhook with HMAC-SHA256(timestamp + "." + rawBody) using
 *   the endpoint's signing secret (STRIPE_WEBHOOK_SECRET in Doppler/Pages env).
 *   We verify the signature on the raw request body with Web Crypto — no Node
 *   SDK needed, which keeps the bundle small and Workers-compatible.
 *
 *   Replay protection: we reject events older than 5 minutes.
 *
 * Required env bindings:
 *   - STRIPE_WEBHOOK_SECRET (secret)  — `whsec_...` from the webhook endpoint page
 *
 * Optional env binding:
 *   - EDGE_CACHE (KV)                 — used for idempotency (dedupe duplicate
 *                                       deliveries Stripe may retry on 5xx).
 *
 * This handler verifies, dedupes, dispatches, and always returns 200 unless
 * verification fails. Stripe interprets any non-2xx as a delivery failure and
 * retries with backoff, so a 500 from our side guarantees retries. Return 400
 * only when the signature genuinely cannot be verified — Stripe stops retrying
 * 4xx responses.
 */

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface StripeWebhookEnv {
  STRIPE_WEBHOOK_SECRET?: string;
  EDGE_CACHE?: KVNamespace;
}

interface PagesContext {
  env: StripeWebhookEnv;
  request: Request;
}

/** Maximum age of a Stripe webhook event we'll accept, in seconds. */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/** TTL on KV idempotency markers — 24h covers Stripe's full retry window. */
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

function getSecret(env: StripeWebhookEnv): string {
  const value = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!value) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }
  return value;
}

/**
 * Parse Stripe's `Stripe-Signature` header.
 *
 * Format: `t=1492774577,v1=5257a869...,v1=...,v0=...`
 * Multiple `v1` values can appear when secrets are being rotated; treat any
 * match as valid.
 */
function parseSignatureHeader(
  header: string,
): { timestamp: number; v1Signatures: string[] } | null {
  const parts = header.split(",").map((p) => p.trim());
  let timestamp = NaN;
  const v1Signatures: string[] = [];
  for (const part of parts) {
    const [scheme, value] = part.split("=");
    if (!scheme || !value) continue;
    if (scheme === "t") timestamp = Number(value);
    if (scheme === "v1") v1Signatures.push(value);
  }
  if (!Number.isFinite(timestamp) || v1Signatures.length === 0) return null;
  return { timestamp, v1Signatures };
}

/** Constant-time hex string comparison. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function computeHmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const bytes = new Uint8Array(signature);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function verifyStripeSignature(
  rawBody: string,
  header: string,
  secret: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const parsed = parseSignatureHeader(header);
  if (!parsed) {
    return { ok: false, reason: "Malformed Stripe-Signature header." };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "Webhook timestamp outside tolerance window." };
  }

  const expected = await computeHmacHex(secret, `${parsed.timestamp}.${rawBody}`);
  const match = parsed.v1Signatures.some((sig) =>
    timingSafeEqualHex(sig, expected),
  );
  if (!match) {
    return { ok: false, reason: "Signature verification failed." };
  }
  return { ok: true };
}

interface StripeEvent {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string;
      amount_total?: number;
      currency?: string;
      customer_details?: { email?: string | null };
      metadata?: Record<string, string | undefined>;
      payment_status?: string;
    };
  };
}

/**
 * Idempotency check. If we have already processed an event id (recorded in KV),
 * acknowledge with 200 immediately without re-dispatching. Stripe retries on
 * 5xx and sometimes delivers the same event twice; this prevents double
 * fulfillment.
 */
async function alreadyProcessed(
  env: StripeWebhookEnv,
  eventId: string,
): Promise<boolean> {
  if (!env.EDGE_CACHE || !eventId) return false;
  try {
    const seen = await env.EDGE_CACHE.get(`stripe:event:${eventId}`);
    return Boolean(seen);
  } catch {
    // KV failure is non-fatal; process the event rather than risk loss.
    return false;
  }
}

async function markProcessed(
  env: StripeWebhookEnv,
  eventId: string,
): Promise<void> {
  if (!env.EDGE_CACHE || !eventId) return;
  try {
    await env.EDGE_CACHE.put(`stripe:event:${eventId}`, "1", {
      expirationTtl: IDEMPOTENCY_TTL_SECONDS,
    });
  } catch {
    /* swallow KV write errors */
  }
}

async function dispatchEvent(event: StripeEvent): Promise<void> {
  const type = event.type ?? "(unknown)";
  const obj = event.data?.object;
  const productId = obj?.metadata?.productId ?? "(none)";
  const amount = obj?.amount_total ?? 0;
  const email = obj?.customer_details?.email ?? "(no email)";

  // Skeleton: log the event. Wire actual fulfillment here in a later pass
  // (e.g. R2 signed URL email for the breach recovery PDF, Google Meet link
  // for the 30-min consult, internal Slack/Discord ping, etc.).
  switch (type) {
    case "checkout.session.completed":
      console.log(
        `[stripe-webhook] checkout completed — product=${productId} amount=${amount} email=${email}`,
      );
      break;
    case "payment_intent.succeeded":
      console.log(
        `[stripe-webhook] payment_intent succeeded — id=${obj?.id ?? "?"} amount=${amount}`,
      );
      break;
    default:
      console.log(`[stripe-webhook] unhandled event type ${type}`);
  }
}

/**
 * Pages Functions routes POST requests here automatically because we export
 * `onRequestPost` (the method-specific handler). GET / PUT / DELETE on this
 * path will return 405 from Cloudflare's router without entering the
 * Function. We deliberately do NOT also export a generic `onRequest`: when
 * both are exported, some Pages versions silently fail to load the module,
 * which would drop the Function back to the SPA fallback.
 */
export const onRequestPost = async (
  context: PagesContext,
): Promise<Response> => {
  let secret: string;
  try {
    secret = getSecret(context.env);
  } catch (error) {
    // 500 so Stripe retries once the env var is configured.
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Server misconfigured.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const signatureHeader = context.request.headers.get("stripe-signature");
  if (!signatureHeader) {
    // 400 is correct: Stripe should not retry an unsigned request.
    return new Response(
      JSON.stringify({ error: "Missing Stripe-Signature header." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const rawBody = await context.request.text();
  const verification = await verifyStripeSignature(
    rawBody,
    signatureHeader,
    secret,
  );
  if (!verification.ok) {
    return new Response(
      JSON.stringify({ error: verification.reason }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const eventId = event.id ?? "";

  if (await alreadyProcessed(context.env, eventId)) {
    return new Response(
      JSON.stringify({ received: true, deduped: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    await dispatchEvent(event);
    await markProcessed(context.env, eventId);
  } catch (error) {
    // 5xx → Stripe will retry. Don't mark as processed on failure.
    console.error("[stripe-webhook] dispatch failed:", error);
    return new Response(
      JSON.stringify({ error: "Dispatch failed; will retry." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ received: true }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
