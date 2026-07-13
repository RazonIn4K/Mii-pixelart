import { describe, expect, it } from "vitest";

import { createCheckoutSession, verifyCheckoutSession } from "./stripe";

describe("Stripe checkout input policy", () => {
  it.each([null, undefined, [], "invalid"])(
    "rejects a non-object checkout body without throwing (%s)",
    async (body) => {
      await expect(
        createCheckoutSession(body, { STRIPE_SECRET_KEY: "test-key" }),
      ).resolves.toEqual({
        body: {
          configured: true,
          error: "Unknown product id: (missing).",
        },
        status: 400,
      });
    },
  );

  it.each([
    "",
    "cs_test_short",
    "cs_prod_1234567890123456",
    "https://example.com/cs_test_1234567890123456",
    "cs_live_1234567890123456/../accounts",
  ])(
    "rejects a malformed session id before any Stripe request (%s)",
    async (sessionId) => {
      await expect(
        verifyCheckoutSession(sessionId, { STRIPE_SECRET_KEY: "test-key" }),
      ).resolves.toEqual({
        body: { configured: true, error: "Invalid session id." },
        status: 400,
      });
    },
  );
});
