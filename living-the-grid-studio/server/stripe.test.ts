import { describe, expect, it } from "vitest";

import { createCheckoutSession } from "./stripe";

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
});
