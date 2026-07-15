export interface AiChatHttpResponse {
  reply: string;
  sketch?: unknown;
  warning?: string;
}

/**
 * Decode both the legacy AI `{ reply }` response and the Worker's standard
 * `{ error: { message } }` envelope without ever surfacing HTML/proxy bodies.
 */
export async function readAiChatResponse(
  response: Response,
): Promise<AiChatHttpResponse> {
  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      if (!response.ok) {
        throw new Error(
          `The AI service returned ${response.status}. Your work was not changed; try again in a moment.`,
        );
      }
      throw new Error(
        "The AI service returned an unreadable response. Your work was not changed; try again.",
      );
    }
  }

  const record =
    typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const legacyReply =
    typeof record?.reply === "string" ? record.reply.trim() : "";
  const errorRecord =
    typeof record?.error === "object" &&
    record.error !== null &&
    !Array.isArray(record.error)
      ? (record.error as Record<string, unknown>)
      : null;
  const envelopeMessage =
    typeof errorRecord?.message === "string" ? errorRecord.message.trim() : "";

  if (!response.ok) {
    throw new Error(
      legacyReply ||
        envelopeMessage ||
        `The AI service returned ${response.status}. Your work was not changed; try again in a moment.`,
    );
  }
  if (!record || !legacyReply) {
    throw new Error(
      "The AI service returned an incomplete response. Your work was not changed; try again.",
    );
  }
  const warning =
    typeof record.warning === "string" && record.warning.trim()
      ? record.warning.trim()
      : undefined;
  return {
    reply: legacyReply,
    ...(Object.hasOwn(record, "sketch") ? { sketch: record.sketch } : {}),
    ...(warning ? { warning } : {}),
  };
}
