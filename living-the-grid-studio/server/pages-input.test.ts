import { describe, expect, it, vi } from "vitest";

import { onRequest as handleAi } from "../functions/api/ai/[[path]]";
import { onRequest as handleStripe } from "../functions/api/stripe/[[path]]";
import { onRequestPost as handleStripeWebhook } from "../functions/api/webhooks/stripe";

const jsonRequest = (url: string, body: string, contentLength?: number) =>
  new Request(url, {
    body,
    headers: {
      "Content-Type": "application/json",
      ...(contentLength === undefined
        ? {}
        : { "Content-Length": String(contentLength) }),
    },
    method: "POST",
  });

describe("legacy Pages input handling", () => {
  it("advertises AI as unavailable when authenticated Worker bindings are absent", async () => {
    const response = await handleAi({
      env: { OPENROUTER_API_KEY: "test-key" },
      params: { path: "status" },
      request: new Request("https://example.test/api/ai/status"),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      configured: false,
      unavailableReason: expect.stringContaining(
        "authenticated community Worker",
      ),
    });
  });

  it("fails the legacy Pages AI chat route closed", async () => {
    const response = await handleAi({
      env: { OPENROUTER_API_KEY: "test-key" },
      params: { path: "chat" },
      request: jsonRequest("https://example.test/api/ai/chat", "null"),
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      configured: false,
      reply:
        "AI Draw requires the authenticated community Worker and is unavailable on this legacy Pages deployment.",
    });
  });

  it("returns a controlled Stripe error for a JSON null body", async () => {
    const response = await handleStripe({
      env: { STRIPE_SECRET_KEY: "test-key" },
      params: { path: "checkout" },
      request: jsonRequest("https://example.test/api/stripe/checkout", "null"),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      configured: true,
      error: "Unknown product id: (missing).",
    });
  });

  it("returns controlled 400 responses for malformed JSON", async () => {
    const aiResponse = await handleAi({
      env: { OPENROUTER_API_KEY: "test-key" },
      params: { path: "chat" },
      request: jsonRequest("https://example.test/api/ai/chat", "{"),
    });
    const stripeResponse = await handleStripe({
      env: { STRIPE_SECRET_KEY: "test-key" },
      params: { path: "checkout" },
      request: jsonRequest("https://example.test/api/stripe/checkout", "{"),
    });
    expect(aiResponse.status).toBe(503);
    expect(stripeResponse.status).toBe(400);
    await expect(aiResponse.json()).resolves.toMatchObject({
      reply: expect.stringContaining("authenticated community Worker"),
    });
    await expect(stripeResponse.json()).resolves.toMatchObject({
      error: "Invalid JSON request body.",
    });
  });

  it("rejects declared oversized AI and Stripe bodies with 413", async () => {
    const aiResponse = await handleAi({
      env: { OPENROUTER_API_KEY: "test-key" },
      params: { path: "chat" },
      request: jsonRequest("https://example.test/api/ai/chat", "{}", 1_000_001),
    });
    const stripeResponse = await handleStripe({
      env: { STRIPE_SECRET_KEY: "test-key" },
      params: { path: "checkout" },
      request: jsonRequest(
        "https://example.test/api/stripe/checkout",
        "{}",
        100_001,
      ),
    });
    expect(aiResponse.status).toBe(503);
    expect(stripeResponse.status).toBe(413);
  });

  it("bounds Stripe webhook bodies before signature verification", async () => {
    const response = await handleStripeWebhook({
      env: { STRIPE_WEBHOOK_SECRET: "test-secret" },
      request: new Request("https://example.test/api/webhooks/stripe", {
        body: "{}",
        headers: {
          "Content-Length": "1000001",
          "Stripe-Signature": "t=0,v1=invalid",
        },
        method: "POST",
      }),
    });
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Request body is too large.",
    });
  });

  it("keeps the retained Pages webhook free of provider-specific logs", async () => {
    const secret = "test-only-pages-webhook-secret";
    const eventId = "evt_pages_sensitive_123";
    const eventType = "checkout.session.completed";
    const body = JSON.stringify({ id: eventId, type: eventType });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const response = await handleStripeWebhook({
        env: { STRIPE_WEBHOOK_SECRET: secret },
        request: new Request("https://example.test/api/webhooks/stripe", {
          body,
          headers: {
            "Stripe-Signature": await stripeSignature(body, secret),
          },
          method: "POST",
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true });
      expect(log).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
      const serializedLogs = JSON.stringify([
        ...log.mock.calls,
        ...errorLog.mock.calls,
      ]);
      expect(serializedLogs).not.toContain(eventId);
      expect(serializedLogs).not.toContain(eventType);
    } finally {
      log.mockRestore();
      errorLog.mockRestore();
    }
  });
});

async function stripeSignature(body: string, secret: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1_000);
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
    encoder.encode(`${timestamp}.${body}`),
  );
  const signature = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `t=${timestamp},v1=${signature}`;
}
