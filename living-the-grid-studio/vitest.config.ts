import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const ephemeralCredential = () => randomBytes(32).toString("base64url");

const testSecretEnvironment = {
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: ephemeralCredential(),
  OIDC_COOKIE_KEY: Buffer.from("test-only-oidc-cookie-key-000001").toString("base64url"),
  SESSION_PEPPER: "test-only-session-pepper",
  PSEUDONYM_KEY: "test-only-pseudonym-hmac-key",
  OPENROUTER_API_KEY: ephemeralCredential(),
  STRIPE_SECRET_KEY: ephemeralCredential(),
  STRIPE_WEBHOOK_SECRET: ephemeralCredential(),
} as const;

// Wrangler validates required secret names before Miniflare applies its test
// bindings. Populate only this Vitest process with isolated test values so
// local/CI runs never inherit a developer's real secrets. Session-related
// fixtures stay deterministic because integration tests precompute their
// hashes; unused provider credentials are generated per run.
Object.assign(process.env, testSecretEnvironment);

export default defineConfig({
  // Mirror the app's vite.config.ts aliases so client/shared modules that use
  // "@/..." or "@shared/..." imports stay testable in this pool.
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@": fileURLToPath(new URL("./client/src", import.meta.url)),
    },
  },
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          ...testSecretEnvironment,
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
      "client/src/lib/**/*.test.ts",
      "client/src/components/**/*.test.ts",
      "server/**/*.test.ts",
    ],
    setupFiles: ["./worker/test-setup.ts"],
    testTimeout: 15_000,
  },
});
