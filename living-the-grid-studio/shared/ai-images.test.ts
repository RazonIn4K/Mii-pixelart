import { describe, expect, it } from "vitest";

import {
  AI_IMAGE_DEFAULT_MODEL,
  AI_IMAGE_FALLBACK_MODEL,
  AI_IMAGE_LIMITS,
  isAiImageModelId,
  validateAiImageGenerationRequest,
} from "./ai-images";

describe("AI image request policy", () => {
  it("uses the reviewed low-cost model when the model is omitted", () => {
    expect(
      validateAiImageGenerationRequest({
        prompt: "  A friendly island robot  ",
      }),
    ).toEqual({
      ok: true,
      value: {
        model: AI_IMAGE_DEFAULT_MODEL,
        prompt: "A friendly island robot",
      },
    });
  });

  it("allows only the exact default and fallback IDs", () => {
    expect(isAiImageModelId(AI_IMAGE_DEFAULT_MODEL)).toBe(true);
    expect(isAiImageModelId(AI_IMAGE_FALLBACK_MODEL)).toBe(true);
    expect(isAiImageModelId("openrouter/free")).toBe(false);
    for (const model of ["", "openai/gpt-image-2"]) {
      expect(
        validateAiImageGenerationRequest({
          model,
          prompt: "A badge",
        }),
      ).toMatchObject({
        error: { code: "AI_IMAGE_UNSUPPORTED_MODEL" },
        ok: false,
      });
    }
  });

  it("normalizes newlines and compatibility characters", () => {
    expect(
      validateAiImageGenerationRequest({
        model: AI_IMAGE_FALLBACK_MODEL,
        prompt: "  Ｉｓｌａｎｄ\r\nbadge  ",
      }),
    ).toEqual({
      ok: true,
      value: {
        model: AI_IMAGE_FALLBACK_MODEL,
        prompt: "Island\nbadge",
      },
    });
  });

  it("rejects empty, overlong, and control-character prompts", () => {
    for (const prompt of [
      " ",
      "x".repeat(AI_IMAGE_LIMITS.maxPromptLength + 1),
      "island\u0000badge",
    ]) {
      expect(validateAiImageGenerationRequest({ prompt })).toMatchObject({
        error: { code: "AI_IMAGE_INVALID_REQUEST" },
        ok: false,
      });
    }
  });

  it("enforces the UTF-8 byte ceiling independently of string length", () => {
    const prompt = "😀".repeat(AI_IMAGE_LIMITS.maxPromptLength);
    expect(prompt.length).toBeLessThanOrEqual(
      AI_IMAGE_LIMITS.maxPromptLength * 2,
    );
    expect(validateAiImageGenerationRequest({ prompt })).toMatchObject({
      error: { code: "AI_IMAGE_INVALID_REQUEST" },
      ok: false,
    });
  });
});
