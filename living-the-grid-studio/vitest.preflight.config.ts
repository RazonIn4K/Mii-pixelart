import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/worker-release.test.ts"],
    testTimeout: 10_000,
  },
});
