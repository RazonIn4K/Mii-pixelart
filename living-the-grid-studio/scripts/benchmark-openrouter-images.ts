import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_IMAGE_BENCHMARK_BUDGET,
  evaluateImageBenchmarkPlan,
} from "../server/openrouter-image-benchmark-budget";
import { generateOpenRouterImage } from "../server/openrouter-images";
import {
  AI_IMAGE_DEFAULT_MODEL,
  AI_IMAGE_FALLBACK_MODEL,
  isAiImageModelId,
  type AiImageModelId,
} from "../shared/ai-images";

interface BenchmarkCase {
  model: AiImageModelId;
  prompt: string;
  promptId: string;
}

interface BenchmarkSuccess {
  bytes: number;
  durationMs: number;
  height: number;
  imageFile: string;
  mimeType: string;
  model: AiImageModelId;
  promptId: string;
  reportedCostUsd: number;
  sha256: string;
  status: "ok";
  width: number;
}

interface BenchmarkFailure {
  durationMs: number;
  failure: {
    code: string;
    message: string;
    retryable: boolean;
    status: number;
  };
  model: AiImageModelId;
  promptId: string;
  status: "error";
}

type BenchmarkResult = BenchmarkFailure | BenchmarkSuccess;

const ORIGINAL_PROMPTS = [
  {
    prompt:
      "Create an original friendly island robot mascot badge, centered, front-facing, clean silhouette, expressive eyes, fewer than eight bold colors, no text, square composition, transparent or simple background.",
    promptId: "island-robot-badge",
  },
  {
    prompt:
      "Create an original cozy lighthouse workshop icon with a smiling lantern window, chunky readable shapes, fewer than eight bold colors, no text, square composition, transparent or simple background.",
    promptId: "lighthouse-workshop-icon",
  },
] as const;

const BENCHMARK_CASES: readonly BenchmarkCase[] = ORIGINAL_PROMPTS.flatMap(
  ({ prompt, promptId }) => [
    { model: AI_IMAGE_DEFAULT_MODEL, prompt, promptId },
    { model: AI_IMAGE_FALLBACK_MODEL, prompt, promptId },
  ],
);

async function main(): Promise<void> {
  // pnpm may preserve its own `--` delimiter when forwarding script
  // arguments. Ignore only that delimiter; every other extra argument still
  // makes the paid-run confirmation fail closed.
  const args = new Set(process.argv.slice(2).filter((arg) => arg !== "--"));
  if (args.has("--help")) {
    console.log(
      "Usage: pnpm benchmark:ai-images -- --run-paid [--model=<allowlisted-id>]\nRuns a bounded paid image matrix and writes ignored artifacts under reports/.",
    );
    return;
  }
  const modelArgument = [...args].find((arg) => arg.startsWith("--model="));
  const requestedModel = modelArgument?.slice("--model=".length);
  const allowedArguments = new Set([
    "--run-paid",
    ...(modelArgument ? [modelArgument] : []),
  ]);
  if (
    !args.has("--run-paid") ||
    [...args].some((arg) => !allowedArguments.has(arg)) ||
    (requestedModel !== undefined && !isAiImageModelId(requestedModel))
  ) {
    throw new Error(
      "Refusing paid benchmark without the exact confirmation and allowlisted arguments.",
    );
  }

  const benchmarkCases = requestedModel
    ? BENCHMARK_CASES.filter(
        (benchmarkCase) => benchmarkCase.model === requestedModel,
      )
    : BENCHMARK_CASES;
  const plan = evaluateImageBenchmarkPlan(benchmarkCases.length);
  if (!plan.ok) {
    throw new Error(plan.reason ?? "The benchmark plan exceeds its budget.");
  }
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Supply it through the protected environment before running the benchmark.",
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir = path.resolve(
    "reports",
    `openrouter-image-benchmark-${timestamp}`,
  );
  await mkdir(reportDir, { recursive: true });

  const results: BenchmarkResult[] = [];
  let callsStarted = 0;
  let reportedCostUsd = 0;
  for (const benchmarkCase of benchmarkCases) {
    const nextCall = evaluateImageBenchmarkPlan(callsStarted + 1);
    if (!nextCall.ok) {
      throw new Error(
        nextCall.reason ??
          "The next provider call exceeds the benchmark budget.",
      );
    }
    callsStarted += 1;

    const startedAt = performance.now();
    const result = await generateOpenRouterImage(
      {
        model: benchmarkCase.model,
        prompt: benchmarkCase.prompt,
      },
      {
        OPENROUTER_API_KEY: apiKey,
        PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
      },
    );
    const durationMs = Math.round(performance.now() - startedAt);

    if (!result.ok) {
      const failure: BenchmarkFailure = {
        durationMs,
        failure: {
          code: result.error.code,
          message: result.error.message,
          retryable: result.error.retryable,
          status: result.status,
        },
        model: benchmarkCase.model,
        promptId: benchmarkCase.promptId,
        status: "error",
      };
      results.push(failure);
      console.log(
        `${benchmarkCase.model} / ${benchmarkCase.promptId}: ${result.error.code} (${durationMs} ms)`,
      );
      continue;
    }

    const sha256 = createHash("sha256")
      .update(result.image.bytes)
      .digest("hex");
    const extension = extensionForMime(result.image.mimeType);
    const imageFile = `${slugModel(result.image.model)}-${benchmarkCase.promptId}.${extension}`;
    await writeFile(path.join(reportDir, imageFile), result.image.bytes);
    reportedCostUsd += result.image.usageCostUsd;
    const success: BenchmarkSuccess = {
      bytes: result.image.bytes.byteLength,
      durationMs,
      height: result.image.height,
      imageFile,
      mimeType: result.image.mimeType,
      model: result.image.model,
      promptId: benchmarkCase.promptId,
      reportedCostUsd: result.image.usageCostUsd,
      sha256,
      status: "ok",
      width: result.image.width,
    };
    results.push(success);
    console.log(
      `${success.model} / ${success.promptId}: ${success.mimeType}, ${success.bytes} bytes, ${durationMs} ms, $${success.reportedCostUsd.toFixed(6)}`,
    );
  }

  const report = {
    budget: {
      maxCalls: DEFAULT_IMAGE_BENCHMARK_BUDGET.maxCalls,
      maxPerCallUsd: DEFAULT_IMAGE_BENCHMARK_BUDGET.maxPerCallUsd,
      maxTotalUsd: DEFAULT_IMAGE_BENCHMARK_BUDGET.maxTotalUsd,
      theoreticalCeilingUsd: plan.theoreticalCeilingUsd,
    },
    callsStarted,
    createdAt: new Date().toISOString(),
    reportedCostUsd: Number(reportedCostUsd.toFixed(6)),
    results,
  };
  const reportPath = path.join(reportDir, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Saved ignored benchmark artifacts: ${reportDir}`);
}

function extensionForMime(mimeType: string): "jpg" | "png" | "webp" {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  throw new Error("The adapter returned an unsupported image MIME type.");
}

function slugModel(model: AiImageModelId): string {
  return model.replaceAll("/", "-").replaceAll(".", "-");
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Image benchmark failed.",
  );
  process.exitCode = 1;
});
