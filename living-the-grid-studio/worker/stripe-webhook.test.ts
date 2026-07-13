import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";

import {
  assertSafeOrigin,
  errorResponse,
  failure,
  type WorkerRequestContext,
} from "./http";
import { registerLegacyRoutes } from "./legacy";
import { Router } from "./router";

const ORIGIN = "https://tomodachi.test";
const WEBHOOK_SECRET = "test-only-stripe-webhook-secret";
const WEBHOOK_PATH = "/api/webhooks/stripe";

class MemoryKv {
  readonly values = new Map<string, string>();
  readonly writes: Array<{
    key: string;
    options?: { expirationTtl?: number };
    value: string;
  }> = [];

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void> {
    this.values.set(key, value);
    this.writes.push({ key, options, value });
  }
}

describe("unified Worker Stripe webhook", () => {
  it("accepts a current valid signature without provider-specific logs", async () => {
    const eventId = "evt_sensitive_valid_123";
    const eventType = "checkout.session.completed";
    const privateEmail = "buyer-private@example.test";
    const body = JSON.stringify({
      data: { object: { customer_details: { email: privateEmail } } },
      id: eventId,
      type: eventType,
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const response = await dispatchWebhook({
        body,
        cache: new MemoryKv(),
        signature: await signatureFor(body),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true });
      expect(log).not.toHaveBeenCalled();
      const serializedLogs = JSON.stringify(log.mock.calls);
      expect(serializedLogs).not.toContain(eventId);
      expect(serializedLogs).not.toContain(eventType);
      expect(serializedLogs).not.toContain(privateEmail);
    } finally {
      log.mockRestore();
    }
  });

  it("rejects a tampered payload signed for different bytes", async () => {
    const signedBody = JSON.stringify({
      id: "evt_tampered_123",
      type: "checkout.session.completed",
    });
    const tamperedBody = JSON.stringify({
      id: "evt_tampered_123",
      type: "payment_intent.succeeded",
    });
    const response = await dispatchWebhook({
      body: tamperedBody,
      cache: new MemoryKv(),
      signature: await signatureFor(signedBody),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST", message: "Stripe signature is invalid." },
    });
  });

  it("rejects a correctly signed event outside the replay window", async () => {
    const body = JSON.stringify({
      id: "evt_stale_123",
      type: "checkout.session.completed",
    });
    const staleTimestamp = Math.floor(Date.now() / 1_000) - 10 * 60;
    const response = await dispatchWebhook({
      body,
      cache: new MemoryKv(),
      signature: await signatureFor(body, staleTimestamp),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST", message: "Stripe signature is invalid." },
    });
  });

  it("fails closed when the endpoint signing secret is absent", async () => {
    const body = JSON.stringify({ id: "evt_unconfigured_123" });
    const response = await dispatchWebhook({
      body,
      cache: new MemoryKv(),
      secret: "",
      signature: await signatureFor(body),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Stripe webhook is not configured.",
      },
    });
  });

  it("rejects a streamed body larger than one megabyte before verification", async () => {
    const body = "x".repeat(1_000_001);
    const response = await dispatchWebhook({
      body,
      cache: new MemoryKv(),
      signature: "t=0,v1=invalid",
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST", message: "Request body is too large." },
    });
  });

  it("marks the first delivery and deduplicates a repeated event ID", async () => {
    const eventId = "evt_duplicate_123";
    const body = JSON.stringify({
      id: eventId,
      type: "checkout.session.completed",
    });
    const cache = new MemoryKv();
    const signature = await signatureFor(body);

    const first = await dispatchWebhook({ body, cache, signature });
    const duplicate = await dispatchWebhook({ body, cache, signature });

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ received: true });
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toEqual({
      deduped: true,
      received: true,
    });
    expect(cache.writes).toEqual([
      {
        key: `stripe:event:${eventId}`,
        options: { expirationTtl: 24 * 60 * 60 },
        value: "1",
      },
    ]);
  });
});

async function dispatchWebhook({
  body,
  cache,
  secret = WEBHOOK_SECRET,
  signature,
}: {
  body: string;
  cache: MemoryKv;
  secret?: string;
  signature: string;
}): Promise<Response> {
  const request = new Request(`${ORIGIN}${WEBHOOK_PATH}`, {
    body,
    headers: { "Stripe-Signature": signature },
    method: "POST",
  });
  const executionCtx = createExecutionContext();
  const context: WorkerRequestContext = {
    env: testEnv(secret, cache),
    executionCtx,
    params: {},
    request,
    requestId: crypto.randomUUID(),
    url: new URL(request.url),
  };
  const router = new Router();
  registerLegacyRoutes(router);

  let response: Response;
  try {
    assertSafeOrigin(context);
    response =
      (await router.dispatch(context)) ??
      failure(
        context.requestId,
        404,
        "route_not_found",
        "API route was not found.",
      );
  } catch (error) {
    response = errorResponse(error, context.requestId);
  }
  await waitOnExecutionContext(executionCtx);
  return response;
}

function testEnv(secret: string, cache: MemoryKv): Env {
  return new Proxy(env as Env, {
    get(target, property, receiver) {
      if (property === "STRIPE_WEBHOOK_SECRET") return secret;
      if (property === "EDGE_CACHE") return cache as unknown as KVNamespace;
      if (property === "PUBLIC_SITE_URL") return ORIGIN;
      return Reflect.get(target, property, receiver);
    },
  });
}

async function signatureFor(
  body: string,
  timestamp = Math.floor(Date.now() / 1_000),
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(WEBHOOK_SECRET),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`),
  );
  const signature = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `t=${timestamp},v1=${signature}`;
}
