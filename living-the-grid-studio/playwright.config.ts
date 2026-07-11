import { defineConfig, devices } from "@playwright/test";

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
