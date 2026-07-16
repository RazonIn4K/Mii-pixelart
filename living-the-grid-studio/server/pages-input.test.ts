import { describe, expect, it } from "vitest";

import { onRequest as handleAi } from "../functions/api/ai/[[path]]";
import { onRequest as handleRetiredPayment } from "../functions/api/stripe/[[path]]";
import { onRequest as handleRetiredWebhook } from "../functions/api/webhooks/stripe";

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
  it("returns a controlled AI error for a JSON null body", async () => {
    const response = await handleAi({
      env: { OPENROUTER_API_KEY: "test-key" },
      params: { path: "chat" },
      request: jsonRequest("https://example.test/api/ai/chat", "null"),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      configured: true,
      reply: "Choose one of the supported free OpenRouter models.",
    });
  });

  it.each([
    [
      "products",
      "GET",
      "https://example.test/api/stripe/products",
      handleRetiredPayment,
    ],
    [
      "checkout",
      "POST",
      "https://example.test/api/stripe/checkout",
      handleRetiredPayment,
    ],
    [
      "session",
      "GET",
      "https://example.test/api/stripe/session?session_id=legacy",
      handleRetiredPayment,
    ],
    [
      "webhook",
      "POST",
      "https://example.test/api/webhooks/stripe",
      handleRetiredWebhook,
    ],
  ])(
    "returns a provider-free 410 tombstone for retired %s requests",
    async (_label, method, url, handler) => {
      const response = await handler({
        request: new Request(url, {
          body: method === "GET" ? undefined : "{}",
          headers:
            method === "GET"
              ? undefined
              : { "Content-Type": "application/json" },
          method,
        }),
      });
      expect(response.status).toBe(410);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "payments_retired" },
      });
    },
  );

  it("returns a controlled 400 response for malformed AI JSON", async () => {
    const response = await handleAi({
      env: { OPENROUTER_API_KEY: "test-key" },
      params: { path: "chat" },
      request: jsonRequest("https://example.test/api/ai/chat", "{"),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      reply: "Invalid JSON request body.",
    });
  });

  it("rejects declared oversized AI bodies with 413", async () => {
    const response = await handleAi({
      env: { OPENROUTER_API_KEY: "test-key" },
      params: { path: "chat" },
      request: jsonRequest("https://example.test/api/ai/chat", "{}", 1_000_001),
    });
    expect(response.status).toBe(413);
  });
});
