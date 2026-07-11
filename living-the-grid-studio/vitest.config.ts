import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          GOOGLE_CLIENT_ID: "test-google-client-id",
          GOOGLE_CLIENT_SECRET: "test-google-client-secret",
          OIDC_COOKIE_KEY: Buffer.from("test-only-oidc-cookie-key-000001").toString("base64url"),
          SESSION_PEPPER: "test-only-session-pepper",
          PSEUDONYM_KEY: "test-only-pseudonym-hmac-key",
          OPENROUTER_API_KEY: "",
          STRIPE_SECRET_KEY: "",
          STRIPE_WEBHOOK_SECRET: "",
        },
      },
    })),
  ],
  test: {
    include: [
      "worker/**/*.test.ts",
      "shared/**/*.test.ts",
      "client/src/lib/community/**/*.test.ts",
    ],
    setupFiles: ["./worker/test-setup.ts"],
    testTimeout: 15_000,
  },
});
