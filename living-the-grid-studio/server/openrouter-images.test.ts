import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AI_IMAGE_DEFAULT_MODEL,
  AI_IMAGE_FALLBACK_MODEL,
  AI_IMAGE_LIMITS,
} from "../shared/ai-images";
import {
  generateOpenRouterImage,
  isOpenRouterImageGenerationConfigured,
} from "./openrouter-images";

const TEST_ENV = {
  OPENROUTER_API_KEY: "test-only-openrouter-key",
  PUBLIC_SITE_URL: "https://staging.tomodachi.pw/some/path",
} as const;

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wlq6XcAAAAASUVORK5CYII=";

function providerResponse(
  overrides: Record<string, unknown> = {},
  init: ResponseInit = {},
): Response {
  return new Response(
    JSON.stringify({
      data: [{ b64_json: ONE_PIXEL_PNG, media_type: "image/png" }],
      usage: { cost: 0.031 },
      ...overrides,
    }),
    {
      headers: { "Content-Type": "application/json" },
      status: 200,
      ...init,
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenRouter image generation adapter", () => {
  it("posts one square image to the dedicated endpoint with the default model", async () => {
    const fetchMock = vi.fn(async () => providerResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOpenRouterImage(
      { prompt: "Original friendly island robot icon" },
      TEST_ENV,
    );

    expect(result).toMatchObject({
      image: {
        mimeType: "image/png",
        model: AI_IMAGE_DEFAULT_MODEL,
        usageCostUsd: 0.031,
      },
      ok: true,
      status: 200,
    });
    if (result.ok) {
      expect(Array.from(result.image.bytes.slice(0, 8))).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://openrouter.ai/api/v1/images");
    expect(init).toMatchObject({ method: "POST" });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      aspect_ratio: "1:1",
      model: AI_IMAGE_DEFAULT_MODEL,
      n: 1,
      prompt: "Original friendly island robot icon",
      provider: {
        allow_fallbacks: false,
        data_collection: "deny",
        max_price: { image: AI_IMAGE_LIMITS.maxPerImageCostUsd },
        require_parameters: true,
        sort: "price",
      },
      resolution: "1K",
    });
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(
      `Bearer ${TEST_ENV.OPENROUTER_API_KEY}`,
    );
    expect(headers.get("http-referer")).toBe("https://staging.tomodachi.pw");
  });

  it("uses reviewed square 1K options for the explicit higher-detail fallback", async () => {
    const fetchMock = vi.fn(async () => providerResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateOpenRouterImage(
      { model: AI_IMAGE_FALLBACK_MODEL, prompt: "Original robot badge" },
      TEST_ENV,
    );

    expect(result).toMatchObject({
      image: { model: AI_IMAGE_FALLBACK_MODEL },
      ok: true,
    });
    const body = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(body).toEqual({
      aspect_ratio: "1:1",
      model: AI_IMAGE_FALLBACK_MODEL,
      n: 1,
      prompt: "Original robot badge",
      provider: {
        allow_fallbacks: false,
        data_collection: "deny",
        max_price: { image: AI_IMAGE_LIMITS.maxPerImageCostUsd },
        require_parameters: true,
        sort: "price",
      },
      resolution: "1K",
    });
  });

  it("rejects unsupported models and missing configuration before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateOpenRouterImage(
        { model: "openrouter/free", prompt: "A badge" },
        TEST_ENV,
      ),
    ).resolves.toMatchObject({
      error: { code: "AI_IMAGE_UNSUPPORTED_MODEL" },
      ok: false,
      status: 400,
    });
    await expect(
      generateOpenRouterImage(
        { prompt: "A badge" },
        {
          OPENROUTER_API_KEY: " ",
        },
      ),
    ).resolves.toMatchObject({
      error: { code: "AI_IMAGE_NOT_CONFIGURED" },
      ok: false,
      status: 501,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isOpenRouterImageGenerationConfigured(TEST_ENV)).toBe(true);
    expect(
      isOpenRouterImageGenerationConfigured({ OPENROUTER_API_KEY: " " }),
    ).toBe(false);
  });

  it.each([
    {
      name: "URL output",
      overrides: {
        data: [{ b64_json: ONE_PIXEL_PNG, url: "https://example.test/a.png" }],
      },
    },
    {
      name: "data URL output",
      overrides: {
        data: [{ b64_json: `data:image/png;base64,${ONE_PIXEL_PNG}` }],
      },
    },
    {
      name: "multiple images",
      overrides: {
        data: [{ b64_json: ONE_PIXEL_PNG }, { b64_json: ONE_PIXEL_PNG }],
      },
    },
    {
      name: "missing cost",
      overrides: { usage: {} },
    },
    {
      name: "reported cost above the per-image ceiling",
      overrides: {
        usage: { cost: AI_IMAGE_LIMITS.maxPerImageCostUsd + 0.001 },
      },
    },
    {
      name: "mismatched media type",
      overrides: {
        data: [{ b64_json: ONE_PIXEL_PNG, media_type: "image/jpeg" }],
      },
    },
    {
      name: "unsupported SVG",
      overrides: {
        data: [
          {
            b64_json: btoa("<svg xmlns='http://www.w3.org/2000/svg'/>"),
            media_type: "image/svg+xml",
          },
        ],
      },
    },
  ])("fails closed for $name", async ({ overrides }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => providerResponse(overrides)),
    );

    await expect(
      generateOpenRouterImage({ prompt: "An original badge" }, TEST_ENV),
    ).resolves.toMatchObject({
      error: { code: "AI_IMAGE_UPSTREAM_INVALID_RESPONSE" },
      ok: false,
      status: 502,
    });
  });

  it("accepts inferred JPEG and WebP magic bytes without trusting a filename", async () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x07, 0x08, 0x00, 0x01, 0x00, 0x01, 0xff,
      0xd9,
    ]);
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x0d, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
      0x38, 0x4c, 0, 0, 0, 0, 0x2f, 0, 0, 0, 0,
    ]);
    const responses = [
      providerResponse({
        data: [{ b64_json: Buffer.from(jpeg).toString("base64") }],
      }),
      providerResponse({
        data: [{ b64_json: Buffer.from(webp).toString("base64") }],
      }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => responses.shift()!),
    );

    const jpegResult = await generateOpenRouterImage(
      { prompt: "A JPEG badge" },
      TEST_ENV,
    );
    const webpResult = await generateOpenRouterImage(
      { prompt: "A WebP badge" },
      TEST_ENV,
    );

    expect(jpegResult).toMatchObject({
      image: { height: 1, mimeType: "image/jpeg", width: 1 },
      ok: true,
    });
    expect(webpResult).toMatchObject({
      image: { height: 1, mimeType: "image/webp", width: 1 },
      ok: true,
    });
  });

  it("rejects an extreme declared pixel surface before browser decode", async () => {
    const oversizedPngHeader = new Uint8Array(24);
    oversizedPngHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    oversizedPngHeader.set([0x49, 0x48, 0x44, 0x52], 12);
    oversizedPngHeader.set([0, 0, 0x20, 0, 0, 0, 0x20, 0], 16);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        providerResponse({
          data: [
            {
              b64_json: Buffer.from(oversizedPngHeader).toString("base64"),
              media_type: "image/png",
            },
          ],
        }),
      ),
    );

    await expect(
      generateOpenRouterImage({ prompt: "An original badge" }, TEST_ENV),
    ).resolves.toMatchObject({
      error: { code: "AI_IMAGE_UPSTREAM_INVALID_RESPONSE" },
      ok: false,
      status: 502,
    });
  });

  it("rejects responses over the declared byte ceiling before reading them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{}", {
            headers: {
              "Content-Length": String(
                AI_IMAGE_LIMITS.maxProviderResponseBytes + 1,
              ),
              "Content-Type": "application/json",
            },
          }),
      ),
    );

    await expect(
      generateOpenRouterImage({ prompt: "A badge" }, TEST_ENV),
    ).resolves.toMatchObject({
      error: { code: "AI_IMAGE_UPSTREAM_RESPONSE_TOO_LARGE" },
      ok: false,
      status: 502,
    });
  });

  it("stops an oversized response stream when Content-Length is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new Uint8Array(AI_IMAGE_LIMITS.maxProviderResponseBytes + 1),
            { headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(
      generateOpenRouterImage({ prompt: "A badge" }, TEST_ENV),
    ).resolves.toMatchObject({
      error: { code: "AI_IMAGE_UPSTREAM_RESPONSE_TOO_LARGE" },
      ok: false,
      status: 502,
    });
  });

  it.each([
    {
      expectedCode: "AI_IMAGE_UPSTREAM_RATE_LIMITED",
      expectedStatus: 429,
      providerStatus: 429,
    },
    {
      expectedCode: "AI_IMAGE_UPSTREAM_ACCESS_REQUIRED",
      expectedStatus: 503,
      providerStatus: 402,
    },
    {
      expectedCode: "AI_IMAGE_UPSTREAM_REJECTED",
      expectedStatus: 502,
      providerStatus: 500,
    },
  ])(
    "maps provider status $providerStatus to $expectedCode without reflecting its body",
    async ({ expectedCode, expectedStatus, providerStatus }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                error: {
                  message: "sensitive provider detail must not be reflected",
                },
              }),
              {
                headers: { "Content-Type": "application/json" },
                status: providerStatus,
              },
            ),
        ),
      );

      const result = await generateOpenRouterImage(
        { prompt: "A badge" },
        TEST_ENV,
      );
      expect(result).toMatchObject({
        error: { code: expectedCode },
        ok: false,
        status: expectedStatus,
      });
      if (!result.ok) {
        expect(result.error.message).not.toContain("sensitive provider");
      }
    },
  );

  it.each([
    {
      error: Object.assign(new Error("provider took too long"), {
        name: "TimeoutError",
      }),
      expectedCode: "AI_IMAGE_UPSTREAM_TIMEOUT",
      expectedStatus: 504,
    },
    {
      error: new Error("provider network failure"),
      expectedCode: "AI_IMAGE_UPSTREAM_UNAVAILABLE",
      expectedStatus: 502,
    },
  ])(
    "maps fetch failures to $expectedCode without exposing the thrown message",
    async ({ error, expectedCode, expectedStatus }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw error;
        }),
      );

      const result = await generateOpenRouterImage(
        { prompt: "A badge" },
        TEST_ENV,
      );
      expect(result).toMatchObject({
        error: { code: expectedCode },
        ok: false,
        status: expectedStatus,
      });
      if (!result.ok) {
        expect(result.error.message).not.toContain(error.message);
      }
    },
  );

  it("propagates caller cancellation and does not convert it to a provider timeout", async () => {
    const controller = new AbortController();
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        startedResolve?.();
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        });
      }),
    );

    const resultPromise = generateOpenRouterImage(
      { prompt: "A badge" },
      TEST_ENV,
      controller.signal,
    );
    await started;
    controller.abort();

    await expect(resultPromise).resolves.toMatchObject({
      error: { code: "AI_IMAGE_REQUEST_ABORTED" },
      ok: false,
      status: 499,
    });
  });
});
