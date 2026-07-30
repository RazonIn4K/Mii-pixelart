import { describe, expect, it } from "vitest";
import {
  LOCAL_PLAYWRIGHT_BASE_URL,
  STAGING_PLAYWRIGHT_ORIGIN,
  resolvePlaywrightHostedMode,
} from "./playwright-hosted-mode";

describe("resolvePlaywrightHostedMode", () => {
  it("defaults ordinary local runs to the configured synthetic provider", () => {
    expect(resolvePlaywrightHostedMode({})).toEqual({
      analyticsMode: "configured-provider",
      baseURL: LOCAL_PLAYWRIGHT_BASE_URL,
      hosted: false,
    });
  });

  it("supports an explicit local no-provider run", () => {
    expect(
      resolvePlaywrightHostedMode({
        PLAYWRIGHT_ANALYTICS_MODE: "no-provider",
      }),
    ).toEqual({
      analyticsMode: "no-provider",
      baseURL: LOCAL_PLAYWRIGHT_BASE_URL,
      hosted: false,
    });
  });

  it("accepts the exact staging origin in explicit no-provider mode", () => {
    expect(
      resolvePlaywrightHostedMode({
        PLAYWRIGHT_ANALYTICS_MODE: "no-provider",
        PLAYWRIGHT_BASE_URL: `${STAGING_PLAYWRIGHT_ORIGIN}/`,
      }),
    ).toEqual({
      analyticsMode: "no-provider",
      baseURL: STAGING_PLAYWRIGHT_ORIGIN,
      hosted: true,
    });
  });

  it("fails closed when hosted analytics state is omitted", () => {
    expect(() =>
      resolvePlaywrightHostedMode({
        PLAYWRIGHT_BASE_URL: STAGING_PLAYWRIGHT_ORIGIN,
      }),
    ).toThrow(/PLAYWRIGHT_ANALYTICS_MODE is required/);
  });

  it.each(["", "   "])(
    "fails closed when the hosted base URL is explicitly blank",
    (baseURL) => {
      expect(() =>
        resolvePlaywrightHostedMode({
          PLAYWRIGHT_ANALYTICS_MODE: "no-provider",
          PLAYWRIGHT_BASE_URL: baseURL,
        }),
      ).toThrow(/PLAYWRIGHT_BASE_URL cannot be blank when set/);
    },
  );

  it("rejects configured-provider mode for a hosted bundle", () => {
    expect(() =>
      resolvePlaywrightHostedMode({
        PLAYWRIGHT_ANALYTICS_MODE: "configured-provider",
        PLAYWRIGHT_BASE_URL: STAGING_PLAYWRIGHT_ORIGIN,
      }),
    ).toThrow(/Hosted Playwright runs only support.*no-provider/);
  });

  it("rejects an invalid analytics state", () => {
    expect(() =>
      resolvePlaywrightHostedMode({
        PLAYWRIGHT_ANALYTICS_MODE: "maybe",
      }),
    ).toThrow(/Invalid PLAYWRIGHT_ANALYTICS_MODE/);
  });

  it.each([
    "https://tomodachi.pw",
    "https://preview.example.com",
    "http://staging.tomodachi.pw",
    "https://staging.tomodachi.pw:443",
    "https://staging.tomodachi.pw:8443",
    "https://user:password@staging.tomodachi.pw",
    "https://staging.tomodachi.pw/studio",
    "https://staging.tomodachi.pw/?mode=test",
    "https://staging.tomodachi.pw/#test",
  ])("rejects unauthorized hosted target %s", (baseURL) => {
    expect(() =>
      resolvePlaywrightHostedMode({
        PLAYWRIGHT_ANALYTICS_MODE: "no-provider",
        PLAYWRIGHT_BASE_URL: baseURL,
      }),
    ).toThrow(/Hosted Playwright runs are restricted/);
  });
});
