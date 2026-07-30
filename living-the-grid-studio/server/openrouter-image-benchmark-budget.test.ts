import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMAGE_BENCHMARK_BUDGET,
  evaluateImageBenchmarkPlan,
} from "./openrouter-image-benchmark-budget";

describe("OpenRouter image benchmark budget", () => {
  it("caps the reviewed four-call plan at a $0.60 theoretical ceiling", () => {
    expect(evaluateImageBenchmarkPlan(4)).toEqual({
      ok: true,
      theoreticalCeilingUsd: 0.6,
    });
    expect(DEFAULT_IMAGE_BENCHMARK_BUDGET.maxTotalUsd).toBe(2);
  });

  it("refuses a fifth call even though its theoretical price is below $2", () => {
    expect(evaluateImageBenchmarkPlan(5)).toEqual({
      ok: false,
      reason: "The benchmark is limited to 4 provider calls.",
      theoreticalCeilingUsd: 0.75,
    });
  });

  it("refuses a call when a tighter total would be exceeded", () => {
    expect(
      evaluateImageBenchmarkPlan(3, {
        maxCalls: 4,
        maxPerCallUsd: 0.15,
        maxTotalUsd: 0.4,
      }),
    ).toEqual({
      ok: false,
      reason: "The benchmark's worst-case cost exceeds $0.40.",
      theoreticalCeilingUsd: 0.45,
    });
  });

  it.each([-1, 1.5, Number.NaN])(
    "rejects an invalid planned call count (%s)",
    (plannedCalls) => {
      expect(() => evaluateImageBenchmarkPlan(plannedCalls)).toThrow(
        "Benchmark call count must be a non-negative integer.",
      );
    },
  );
});
