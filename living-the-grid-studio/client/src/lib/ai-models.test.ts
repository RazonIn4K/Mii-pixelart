import { describe, expect, it } from "vitest";

import { OPENROUTER_MODEL_PRESETS } from "../../../shared/ai";
import {
  DEFAULT_OPENROUTER_MODEL_ID,
  normalizeOpenRouterModelChoice,
  parseSavedAiSessions,
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

  it("trims a stored curated model ID before validating it", () => {
    const model = OPENROUTER_MODEL_PRESETS[1].id;
    expect(normalizeOpenRouterModelChoice(`  ${model}  `)).toBe(model);
  });

  it("ignores corrupt session entries without crashing", () => {
    const session = {
      createdAt: "2026-07-12T00:00:00.000Z",
      id: "session-1",
      includeGridSummary: true,
      messages: [{ content: "Hello", role: "user" }],
      modelChoice: ` ${OPENROUTER_MODEL_PRESETS[2].id} `,
      requestSketch: true,
      title: "Saved chat",
      updatedAt: "2026-07-12T00:00:00.000Z",
    };
    expect(
      parseSavedAiSessions(JSON.stringify([null, "broken", {}, session])),
    ).toEqual([
      {
        ...session,
        includeGridImage: false,
        modelChoice: OPENROUTER_MODEL_PRESETS[2].id,
      },
    ]);
    expect(parseSavedAiSessions("not-json")).toEqual([]);
  });

  it("migrates the historical custom-model session shape", () => {
    const legacySession = {
      createdAt: "2026-07-12T00:00:00.000Z",
      customModel: "anthropic/claude-opus-4.1",
      id: "legacy-custom-session",
      includeGridImage: false,
      includeGridSummary: true,
      messages: [{ content: "Legacy chat", role: "user" }],
      modelChoice: "__custom__",
      requestSketch: false,
      title: "Legacy chat",
      updatedAt: "2026-07-12T00:00:00.000Z",
    };
    expect(parseSavedAiSessions(JSON.stringify([legacySession]))).toEqual([
      {
        ...legacySession,
        modelChoice: DEFAULT_OPENROUTER_MODEL_ID,
      },
    ]);
  });
});
