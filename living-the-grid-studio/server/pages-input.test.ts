import { describe, expect, it } from "vitest";

import { onRequest as handleAi } from "../functions/api/ai/[[path]]";
import { onRequest as handleRetiredPayment } from "../functions/api/stripe/[[path]]";
import { onRequestPost as handleRetiredWebhook } from "../functions/api/webhooks/stripe";

const jsonRequest = (url: string, body: string) =>
  new Request(url, {
    body,
    headers: { "Content-Type": "application/json" },
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

  it("returns controlled AI responses for malformed input without parsing payment data", async () => {
    const response = await handleAi({
      env: { OPENROUTER_API_KEY: "test-key" },
      params: { path: "chat" },
      request: jsonRequest("https://example.test/api/ai/chat", "{"),
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      reply: expect.stringContaining("authenticated community Worker"),
    });
  });

  it.each([
    [
      "catalog",
      handleRetiredPayment,
      "https://example.test/api/stripe/products",
    ],
    [
      "checkout",
      handleRetiredPayment,
      "https://example.test/api/stripe/checkout",
    ],
    [
      "webhook",
      handleRetiredWebhook,
      "https://example.test/api/webhooks/stripe",
    ],
  ])(
    "retires the legacy Pages %s endpoint with no provider call",
    async (_label, handler, url) => {
      const response = await handler({
        request: new Request(url, {
          body: JSON.stringify({ card: "must-not-be-read" }),
          method: "POST",
        }),
      });

      expect(response.status).toBe(410);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "payments_retired" },
      });
    },
  );
});
