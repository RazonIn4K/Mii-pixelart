import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { CONSULT_SALES_DISABLED_BODY } from "../server/stripe";

describe("Worker Stripe consult-sales containment", () => {
  it("hides consult while preserving recovery and support products", async () => {
    const response = await SELF.fetch("http://localhost/api/stripe/products");
    const payload = (await response.json()) as {
      products: Array<{ category: string; id: string }>;
    };

    expect(response.status).toBe(200);
    expect(
      payload.products.some((product) => product.id === "consult-30"),
    ).toBe(false);
    expect(
      payload.products.some((product) => product.category === "recovery"),
    ).toBe(true);
    expect(
      payload.products.some((product) => product.category === "support"),
    ).toBe(true);
  });

  it("rejects direct consult checkout with the stable fail-closed response", async () => {
    const response = await SELF.fetch("http://localhost/api/stripe/checkout", {
      body: JSON.stringify({ productId: "consult-30" }),
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      method: "POST",
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(CONSULT_SALES_DISABLED_BODY);
  });
});
