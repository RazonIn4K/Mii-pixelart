import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createGridDocumentFromAiSketch } from "../client/src/lib/engine/ai-sketch";
import { buildAiSystemPrompt } from "../server/openrouter";
import { OPENROUTER_MODEL_PRESETS, type AiGridSketch } from "../shared/ai";

interface OpenRouterCompareResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
  error?: {
    message?: string;
  };
  model?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
}

interface CompareResult {
  completionTokens?: number;
  content: string;
  error?: string;
  hasSketch?: boolean;
  model: string;
  promptTokens?: number;
  routedModel?: string;
  sketchSize?: string;
  status: "ok" | "error";
  totalTokens?: number;
  validSketch?: boolean;
  validationError?: string;
}

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_PROMPT =
  "Draw a 32x32 original horror mascot face for a Tomodachi repaint guide. Use clean outlines, readable eyes and teeth, and fewer than 10 colors.";

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Export it in the shell, then rerun pnpm compare:models.",
    );
  }

  const prompt = process.env.LTG_COMPARE_PROMPT?.trim() || DEFAULT_PROMPT;
  const requestedModels = parseRequestedModels();
  const models = requestedModels.length
    ? requestedModels
    : OPENROUTER_MODEL_PRESETS.slice(0, 5).map((preset) => preset.id);

  const results: CompareResult[] = [];
  for (const model of models) {
    results.push(await compareModel(apiKey, model, prompt));
  }

  const report = {
    createdAt: new Date().toISOString(),
    prompt,
    results,
  };
  const reportDir = path.resolve("reports");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(
    reportDir,
    `openrouter-model-compare-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  for (const result of results) {
    const summary =
      result.status === "ok"
        ? `${result.model} -> ${result.routedModel ?? result.model} (${result.totalTokens ?? "?"} tokens)`
        : `${result.model} failed: ${result.error}`;
    console.log(summary);
  }
  console.log(`Saved model comparison report: ${reportPath}`);
}

function parseRequestedModels(): string[] {
  const raw = process.env.LTG_COMPARE_MODELS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

async function compareModel(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<CompareResult> {
  try {
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-OpenRouter-Title": "Living The Grid Studio Model Compare",
      },
      body: JSON.stringify({
        max_tokens: 2200,
        messages: [
          {
            role: "system",
            content: buildAiSystemPrompt(true),
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        model,
        response_format: { type: "json_object" },
        session_id: `ltg-compare-${Date.now()}`,
        temperature: 0.35,
      }),
    });
    const payload = (await response
      .json()
      .catch(() => null)) as OpenRouterCompareResponse | null;

    if (!response.ok) {
      return {
        content: "",
        error:
          payload?.error?.message ??
          `OpenRouter request failed with status ${response.status}.`,
        model,
        routedModel: payload?.model,
        status: "error",
      };
    }

    const content = payload?.choices?.[0]?.message?.content?.trim() ?? "";
    return {
      completionTokens: payload?.usage?.completion_tokens,
      content,
      model,
      promptTokens: payload?.usage?.prompt_tokens,
      routedModel: payload?.model,
      status: "ok",
      totalTokens: payload?.usage?.total_tokens,
      ...validateSketchContent(content),
    };
  } catch (error) {
    return {
      content: "",
      error: error instanceof Error ? error.message : "Unknown request error.",
      model,
      status: "error",
    };
  }
}

function validateSketchContent(
  content: string,
): Pick<
  CompareResult,
  "hasSketch" | "sketchSize" | "validSketch" | "validationError"
> {
  try {
    const parsed = JSON.parse(extractJsonObject(content)) as {
      sketch?: AiGridSketch;
    };
    if (!parsed.sketch) {
      return {
        hasSketch: false,
        validSketch: false,
        validationError: "Response JSON did not contain a sketch object.",
      };
    }
    createGridDocumentFromAiSketch(parsed.sketch);
    return {
      hasSketch: true,
      sketchSize: `${parsed.sketch.width}x${parsed.sketch.height}`,
      validSketch: true,
    };
  } catch (error) {
    return {
      hasSketch: false,
      validSketch: false,
      validationError:
        error instanceof Error ? error.message : "Could not validate sketch.",
    };
  }
}

function extractJsonObject(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return content.slice(firstBrace, lastBrace + 1).trim();
  }

  return content;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
