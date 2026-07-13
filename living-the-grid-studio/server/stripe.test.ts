import { describe, expect, it, vi } from "vitest";

import {
  CONSULT_SALES_DISABLED_BODY,
  createCheckoutSession,
  isConsultSalesEnabled,
  listPublicProducts,
  verifyCheckoutSession,
} from "./stripe";

describe("Stripe checkout input policy", () => {
  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["TRUE", false],
    [" true ", false],
    ["1", false],
    ["true", true],
  ] as const)(
    "treats only the exact string %s as an enabled consult-sales flag",
    (value, enabled) => {
      expect(isConsultSalesEnabled({ CONSULT_SALES_ENABLED: value })).toBe(
        enabled,
      );
    },
  );

  it("hides consult sales by default while preserving recovery and support products", () => {
    const products = listPublicProducts({
      CONSULT_SALES_ENABLED: "false",
    });

    expect(products.some((product) => product.id === "consult-30")).toBe(false);
    expect(
      products.some((product) => product.id === "breach-recovery-checklist"),
    ).toBe(true);
    expect(products.some((product) => product.category === "support")).toBe(
      true,
    );
    expect(
      listPublicProducts({ CONSULT_SALES_ENABLED: "true" }).some(
        (product) => product.id === "consult-30",
      ),
    ).toBe(true);
  });

  it("rejects a direct consult checkout with the stable fail-closed response", async () => {
    await expect(
      createCheckoutSession(
        { productId: "consult-30" },
        {
          CONSULT_SALES_ENABLED: "false",
          STRIPE_SECRET_KEY: "test-key",
        },
      ),
    ).resolves.toEqual({
      body: CONSULT_SALES_DISABLED_BODY,
      status: 503,
    });
  });

  it("creates a direct consult checkout when the exact enablement flag is present", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "cs_test_1234567890123456",
          url: "https://checkout.stripe.com/c/pay/test-session",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    try {
      await expect(
        createCheckoutSession(
          { productId: "consult-30" },
          {
            CONSULT_SALES_ENABLED: "true",
            PUBLIC_SITE_URL: "https://staging.tomodachi.pw",
            STRIPE_SECRET_KEY: "test-key",
          },
        ),
      ).resolves.toEqual({
        body: {
          configured: true,
          product: {
            category: "consult",
            id: "consult-30",
            name: "30-min Recovery Consult",
            priceLabel: "$49.00",
          },
          sessionId: "cs_test_1234567890123456",
          url: "https://checkout.stripe.com/c/pay/test-session",
        },
        status: 200,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl, requestInit] = fetchMock.mock.calls[0]!;
      expect(String(requestUrl)).toBe(
        "https://api.stripe.com/v1/checkout/sessions",
      );
      expect(requestInit).toEqual(
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        }),
      );
      const form = new URLSearchParams(String(requestInit?.body));
      expect(form.get("metadata[productId]")).toBe("consult-30");
      expect(form.get("line_items[0][price_data][unit_amount]")).toBe("4900");
    } finally {
      fetchMock.mockRestore();
    }
  });

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
