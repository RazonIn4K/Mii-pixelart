import { describe, expect, it } from "vitest";

import { OPENROUTER_MODEL_PRESETS } from "../../../shared/ai";
import {
  DEFAULT_OPENROUTER_MODEL_ID,
  normalizeOpenRouterModelChoice,
} from "./ai-models";

describe("AI model selection", () => {
  it("preserves every curated free preset", () => {
    for (const preset of OPENROUTER_MODEL_PRESETS) {
      expect(normalizeOpenRouterModelChoice(preset.id)).toBe(preset.id);
    }
  });

  it("migrates legacy custom or paid selections to the free default", () => {
    expect(normalizeOpenRouterModelChoice("__custom__")).toBe(
      DEFAULT_OPENROUTER_MODEL_ID,
    );
    expect(normalizeOpenRouterModelChoice("anthropic/claude-opus-4.1")).toBe(
      DEFAULT_OPENROUTER_MODEL_ID,
    );
    expect(normalizeOpenRouterModelChoice(undefined)).toBe(
      DEFAULT_OPENROUTER_MODEL_ID,
    );
  });
});
