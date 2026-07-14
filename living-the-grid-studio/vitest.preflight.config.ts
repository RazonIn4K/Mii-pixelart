import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "scripts/worker-release.test.ts",
      "scripts/release-output-hygiene.test.ts",
      "scripts/verify-hosted-read-only.test.ts",
    ],
    testTimeout: 10_000,
  },
});
