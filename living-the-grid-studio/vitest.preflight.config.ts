import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "scripts/cli-termination.test.ts",
      "scripts/playwright-hosted-mode.test.ts",
      "scripts/worker-release.test.ts",
      "scripts/release-output-hygiene.test.ts",
      "scripts/staging-r2-prefix-audit-worker.test.ts",
      "scripts/verify-hosted-read-only.test.ts",
      "scripts/hosted-release-identity.test.ts",
      "scripts/verify-hosted-staging-writable-cli.test.ts",
      "scripts/verify-hosted-staging-writable.test.ts",
      "scripts/verify-hosted-staging-p4-phase-a.test.ts",
      "scripts/verify-staging-live-auth.test.ts",
      "scripts/verify-licenses.test.ts",
    ],
    testTimeout: 10_000,
  },
});
