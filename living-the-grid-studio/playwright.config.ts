import { defineConfig, devices } from "@playwright/test";

// Keep automated browser runs isolated from developer/CI credentials while
// satisfying Wrangler's required-secret declaration for the local Worker.
Object.assign(process.env, {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  OIDC_COOKIE_KEY: Buffer.from("test-only-oidc-cookie-key-000001").toString("base64url"),
  SESSION_PEPPER: "test-only-session-pepper",
  PSEUDONYM_KEY: "test-only-pseudonym-hmac-key",
  OPENROUTER_API_KEY: "test-disabled-openrouter-key",
  STRIPE_SECRET_KEY: "test-disabled-stripe-key",
  STRIPE_WEBHOOK_SECRET: "test-disabled-stripe-webhook-key",
});

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const webServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? "pnpm dev";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 900 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "large-phone", use: { ...devices["Desktop Chrome"], viewport: { width: 430, height: 932 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "small-phone", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } } },
    { name: "minimum-phone", use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 760 } } },
  ],
});
