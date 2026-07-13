import {
  OPENROUTER_MODEL_PRESETS,
  type AiChatMessage,
} from "../../../shared/ai";

export const DEFAULT_OPENROUTER_MODEL_ID = OPENROUTER_MODEL_PRESETS[0].id;
export const AI_SESSION_LIMITS = {
  sessions: 12,
  messagesPerSession: 24,
  messageCharacters: 5000,
  titleCharacters: 80,
} as const;

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

export function boundAiMessages(
  messages: readonly AiChatMessage[],
): AiChatMessage[] {
  return messages
    .slice(-AI_SESSION_LIMITS.messagesPerSession)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, AI_SESSION_LIMITS.messageCharacters),
    }));
}

type StoredAiSession = Omit<SavedAiSession, "includeGridImage"> & {
  includeGridImage?: boolean;
};

export function parseSavedAiSessions(raw: string | null): SavedAiSession[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isStoredAiSession)
      .map((session) => ({
        ...session,
        id: session.id.slice(0, 256),
        includeGridImage: Boolean(session.includeGridImage),
        messages: boundAiMessages(session.messages),
        modelChoice: normalizeOpenRouterModelChoice(session.modelChoice),
        title: session.title.slice(0, AI_SESSION_LIMITS.titleCharacters),
      }))
      .slice(0, AI_SESSION_LIMITS.sessions);
  } catch {
    return [];
  }
}

function isStoredAiSession(value: unknown): value is StoredAiSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Partial<StoredAiSession>;
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
