import { describe, expect, it } from "vitest";

import { OPENROUTER_MODEL_PRESETS } from "../../../shared/ai";
import {
  AI_SESSION_LIMITS,
  DEFAULT_OPENROUTER_MODEL_ID,
  boundAiMessages,
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

  it("bounds stored sessions, messages, and text before hydrating UI state", () => {
    const sessions = Array.from(
      { length: AI_SESSION_LIMITS.sessions + 3 },
      (_, sessionIndex) => ({
        createdAt: "2026-07-12T00:00:00.000Z",
        id: `session-${sessionIndex}`,
        includeGridImage: false,
        includeGridSummary: true,
        messages: Array.from(
          { length: AI_SESSION_LIMITS.messagesPerSession + 5 },
          (_, messageIndex) => ({
            content: `${messageIndex}:${"x".repeat(AI_SESSION_LIMITS.messageCharacters + 100)}`,
            role: messageIndex % 2 === 0 ? "user" : "assistant",
          }),
        ),
        modelChoice: DEFAULT_OPENROUTER_MODEL_ID,
        requestSketch: true,
        title: "t".repeat(AI_SESSION_LIMITS.titleCharacters + 20),
        updatedAt: "2026-07-12T00:00:00.000Z",
      }),
    );
    const parsed = parseSavedAiSessions(JSON.stringify(sessions));
    expect(parsed).toHaveLength(AI_SESSION_LIMITS.sessions);
    expect(parsed[0]?.messages).toHaveLength(
      AI_SESSION_LIMITS.messagesPerSession,
    );
    expect(parsed[0]?.messages[0]?.content.length).toBeLessThanOrEqual(
      AI_SESSION_LIMITS.messageCharacters,
    );
    expect(parsed[0]?.title).toHaveLength(AI_SESSION_LIMITS.titleCharacters);
  });

  it("bounds live message history before requests or persistence", () => {
    const bounded = boundAiMessages(
      Array.from(
        { length: AI_SESSION_LIMITS.messagesPerSession + 4 },
        (_, index) => ({
          content: `${index}:${"x".repeat(AI_SESSION_LIMITS.messageCharacters + 50)}`,
          role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        }),
      ),
    );
    expect(bounded).toHaveLength(AI_SESSION_LIMITS.messagesPerSession);
    expect(bounded[0]?.content.startsWith("4:")).toBe(true);
    expect(bounded.every((message) => message.content.length <= 5000)).toBe(
      true,
    );
  });
});
