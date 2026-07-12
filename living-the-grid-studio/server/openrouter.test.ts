import { describe, expect, it } from "vitest";

import { OPENROUTER_MODEL_PRESETS, type AiChatRequest } from "../shared/ai";
import { isSupportedOpenRouterModel, sendOpenRouterChat } from "./openrouter";

const request = (model: string): AiChatRequest => ({
  messages: [{ content: "Reply with pong.", role: "user" }],
  model,
});

describe("OpenRouter model policy", () => {
  it("allows every curated free preset", () => {
    for (const preset of OPENROUTER_MODEL_PRESETS) {
      expect(isSupportedOpenRouterModel(preset.id)).toBe(true);
    }
  });

  it("preserves the configured-state response for a curated preset", async () => {
    await expect(
      sendOpenRouterChat(request(OPENROUTER_MODEL_PRESETS[0].id), {
        OPENROUTER_API_KEY: "",
      }),
    ).resolves.toMatchObject({
      body: { configured: false },
      status: 501,
    });
  });

  it("rejects arbitrary models before contacting OpenRouter", async () => {
    const paidModel = "anthropic/claude-opus-4.1";
    expect(isSupportedOpenRouterModel(paidModel)).toBe(false);

    await expect(
      sendOpenRouterChat(request(paidModel), {
        OPENROUTER_API_KEY: "test-shared-key",
      }),
    ).resolves.toEqual({
      body: {
        configured: true,
        reply: "Choose one of the supported free OpenRouter models.",
      },
      status: 400,
    });
  });
});
