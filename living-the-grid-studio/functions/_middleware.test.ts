import { describe, expect, it } from "vitest";

import { onRequest } from "./_middleware";

const ORIGIN = "https://tomodachi.pw";

async function crawler(
  path: string,
  userAgent = "Googlebot/2.1",
): Promise<Response> {
  return onRequest({
    next: async () => new Response("spa", { status: 299 }),
    request: new Request(`${ORIGIN}${path}`, {
      headers: { "User-Agent": userAgent },
    }),
  });
}

describe("crawler payment retirement", () => {
  it.each([
    "/",
    "/studio",
    "/faq",
    "/about",
    "/help",
    "/ai-plan",
    "/unlock",
    "/support",
    "/donate",
  ])("serves payment-free crawler truth for %s", async (path) => {
    const response = await crawler(path);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-crawler-render")).toBe("search");
    expect(body).not.toMatch(/Stripe|checkout\.stripe|buy\.stripe|\$9|\$49/iu);
    expect(body).not.toContain('"@type":"Product"');
    expect(body).not.toContain('"@type":"Offer"');
  });

  it("canonicalizes the retired unlock route to the AI plan", async () => {
    const body = await (await crawler("/unlock")).text();
    expect(body).toContain(
      '<link rel="canonical" href="https://tomodachi.pw/ai-plan"',
    );
    expect(body).toContain("Possible one-time $5 creator plan");
    expect(body).toContain("not for sale");
  });

  it.each([
    ["/unlock", "/ai-plan"],
    ["/donate", "/support"],
  ])(
    "serves payment-free social metadata for %s with the %s canonical",
    async (path, canonicalPath) => {
      const response = await crawler(path, "Twitterbot/1.0");
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("x-crawler-render")).toBe("social");
      expect(body).toContain(
        `<link rel="canonical" href="${ORIGIN}${canonicalPath}"`,
      );
      expect(body).not.toMatch(/Stripe|checkout\.stripe|buy\.stripe|\$9|\$49/iu);
      expect(body).not.toContain('"@type":"Product"');
      expect(body).not.toContain('"@type":"Offer"');
    },
  );

  it("falls through for ordinary browser requests", async () => {
    const response = await onRequest({
      next: async () => new Response("spa", { status: 299 }),
      request: new Request(`${ORIGIN}/ai-plan`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      }),
    });
    expect(response.status).toBe(299);
    await expect(response.text()).resolves.toBe("spa");
  });
});
