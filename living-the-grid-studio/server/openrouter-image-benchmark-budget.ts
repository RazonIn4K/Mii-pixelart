import { AI_IMAGE_LIMITS } from "../shared/ai-images";

export interface ImageBenchmarkBudget {
  maxCalls: number;
  maxPerCallUsd: number;
  maxTotalUsd: number;
}

export interface ImageBenchmarkBudgetEvaluation {
  ok: boolean;
  reason?: string;
  theoreticalCeilingUsd: number;
}

/**
 * Local benchmark-only budget. The adapter independently enforces the
 * provider-side per-image ceiling; this separate total prevents a benchmark
 * plan from multiplying that price into an unexpectedly large run.
 */
export const DEFAULT_IMAGE_BENCHMARK_BUDGET = {
  maxCalls: 4,
  maxPerCallUsd: AI_IMAGE_LIMITS.maxPerImageCostUsd,
  maxTotalUsd: 2,
} as const satisfies ImageBenchmarkBudget;

export function evaluateImageBenchmarkPlan(
  plannedCalls: number,
  budget: ImageBenchmarkBudget = DEFAULT_IMAGE_BENCHMARK_BUDGET,
): ImageBenchmarkBudgetEvaluation {
  validateBudget(budget);
  if (!Number.isSafeInteger(plannedCalls) || plannedCalls < 0) {
    throw new Error("Benchmark call count must be a non-negative integer.");
  }

  const maxPerCallMicrousd = usdToMicrousd(budget.maxPerCallUsd);
  const maxTotalMicrousd = usdToMicrousd(budget.maxTotalUsd);
  const theoreticalMicrousd = plannedCalls * maxPerCallMicrousd;
  if (!Number.isSafeInteger(theoreticalMicrousd)) {
    throw new Error("Benchmark theoretical cost is outside the safe range.");
  }

  const theoreticalCeilingUsd = theoreticalMicrousd / 1_000_000;
  if (plannedCalls > budget.maxCalls) {
    return {
      ok: false,
      reason: `The benchmark is limited to ${budget.maxCalls} provider calls.`,
      theoreticalCeilingUsd,
    };
  }
  if (theoreticalMicrousd > maxTotalMicrousd) {
    return {
      ok: false,
      reason: `The benchmark's worst-case cost exceeds $${budget.maxTotalUsd.toFixed(2)}.`,
      theoreticalCeilingUsd,
    };
  }
  return { ok: true, theoreticalCeilingUsd };
}

function validateBudget(budget: ImageBenchmarkBudget): void {
  if (!Number.isSafeInteger(budget.maxCalls) || budget.maxCalls < 1) {
    throw new Error("Benchmark maxCalls must be a positive integer.");
  }
  if (
    !Number.isFinite(budget.maxPerCallUsd) ||
    budget.maxPerCallUsd <= 0 ||
    !Number.isFinite(budget.maxTotalUsd) ||
    budget.maxTotalUsd <= 0
  ) {
    throw new Error("Benchmark USD limits must be positive finite numbers.");
  }
  usdToMicrousd(budget.maxPerCallUsd);
  usdToMicrousd(budget.maxTotalUsd);
}

function usdToMicrousd(value: number): number {
  const microusd = Math.round(value * 1_000_000);
  if (!Number.isSafeInteger(microusd) || microusd <= 0) {
    throw new Error("Benchmark USD limit cannot be represented safely.");
  }
  return microusd;
}
