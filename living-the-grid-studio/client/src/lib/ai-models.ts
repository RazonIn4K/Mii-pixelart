import {
  OPENROUTER_MODEL_PRESETS,
  type AiChatMessage,
} from "../../../shared/ai";

export const DEFAULT_OPENROUTER_MODEL_ID = OPENROUTER_MODEL_PRESETS[0].id;

export function normalizeOpenRouterModelChoice(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return OPENROUTER_MODEL_PRESETS.some((preset) => preset.id === normalized)
    ? normalized
    : DEFAULT_OPENROUTER_MODEL_ID;
}

export interface SavedAiSession {
  createdAt: string;
  id: string;
  includeGridImage: boolean;
  includeGridSummary: boolean;
  messages: AiChatMessage[];
  modelChoice: string;
  requestSketch: boolean;
  title: string;
  updatedAt: string;
}

export function parseSavedAiSessions(raw: string | null): SavedAiSession[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isSavedAiSession)
      .map((session) => ({
        ...session,
        includeGridImage: Boolean(session.includeGridImage),
        modelChoice: normalizeOpenRouterModelChoice(session.modelChoice),
      }))
      .slice(0, 20);
  } catch {
    return [];
  }
}

function isSavedAiSession(value: unknown): value is SavedAiSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Partial<SavedAiSession>;
  return (
    typeof session.createdAt === "string" &&
    typeof session.id === "string" &&
    session.id.length > 0 &&
    (typeof session.includeGridImage === "boolean" ||
      session.includeGridImage === undefined) &&
    typeof session.includeGridSummary === "boolean" &&
    Array.isArray(session.messages) &&
    session.messages.every(isAiChatMessage) &&
    typeof session.modelChoice === "string" &&
    typeof session.requestSketch === "boolean" &&
    typeof session.title === "string" &&
    typeof session.updatedAt === "string"
  );
}

function isAiChatMessage(value: unknown): value is AiChatMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Partial<AiChatMessage>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string"
  );
}
