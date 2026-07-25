import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { resolvePlaywrightHostedMode } from "./scripts/playwright-hosted-mode";

// Keep automated browser runs isolated from developer/CI credentials while
// satisfying Wrangler's required-secret declaration for the local Worker.
const ephemeralCredential = () => randomBytes(32).toString("base64url");
const hostedMode = resolvePlaywrightHostedMode(process.env);

Object.assign(process.env, {
  GOOGLE_CLIENT_ID: ephemeralCredential(),
  GOOGLE_CLIENT_SECRET: ephemeralCredential(),
  OIDC_COOKIE_KEY: ephemeralCredential(),
  SESSION_PEPPER: ephemeralCredential(),
  PSEUDONYM_KEY: ephemeralCredential(),
  OPENROUTER_API_KEY: ephemeralCredential(),
  PLAYWRIGHT_ANALYTICS_MODE: hostedMode.analyticsMode,
  // Local configured-provider runs use a same-origin target intercepted by
  // Playwright. Empty values make local no-provider runs hermetic even if a
  // developer has analytics values in an untracked environment file. These
  // runner variables cannot and must not alter an already-built hosted bundle.
  VITE_ANALYTICS_ENDPOINT:
    hostedMode.analyticsMode === "configured-provider"
      ? "/__test/analytics"
      : "",
  VITE_ANALYTICS_WEBSITE_ID:
    hostedMode.analyticsMode === "configured-provider"
      ? "playwright-consent-site"
      : "",
});

const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ??
  "pnpm dev --host 127.0.0.1 --port 4173 --strictPort";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: hostedMode.baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  ...(hostedMode.hosted
    ? {}
    : {
        webServer: {
          command: webServerCommand,
          url: hostedMode.baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "laptop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 900 },
      },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "large-phone",
      use: {
        ...devices["Desktop Chrome"],
        hasTouch: true,
        viewport: { width: 430, height: 932 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        hasTouch: true,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "small-phone",
      use: {
        ...devices["Desktop Chrome"],
        hasTouch: true,
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: "minimum-phone",
      use: {
        ...devices["Desktop Chrome"],
        hasTouch: true,
        viewport: { width: 320, height: 760 },
      },
    },
    {
      name: "mobile-webkit",
      testMatch: /community\.spec\.ts/,
      grep: /mobile navigation exposes community and Studio destinations/,
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
