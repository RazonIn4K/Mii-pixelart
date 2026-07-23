import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "scripts/worker-release.test.ts",
      "scripts/release-output-hygiene.test.ts",
      "scripts/staging-r2-prefix-audit-worker.test.ts",
      "scripts/verify-hosted-read-only.test.ts",
      "scripts/verify-hosted-staging-writable-cli.test.ts",
      "scripts/verify-hosted-staging-writable.test.ts",
      "scripts/verify-staging-live-auth.test.ts",
      "scripts/verify-licenses.test.ts",
      "scripts/verify-security-audit.test.ts",
    ],
    testTimeout: 10_000,
  },
});
