import { describe, expect, it } from "vitest";

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
});
