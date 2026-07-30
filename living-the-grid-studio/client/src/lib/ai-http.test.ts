import { describe, expect, it } from "vitest";

import { readAiChatResponse } from "./ai-http";

describe("AI HTTP response reader", () => {
  it("accepts a legacy successful reply", async () => {
    await expect(
      readAiChatResponse(Response.json({ configured: true, reply: "Ready." })),
    ).resolves.toMatchObject({ reply: "Ready." });
  });

  it("uses the standard Worker error envelope", async () => {
    await expect(
      readAiChatResponse(
        Response.json(
          { error: { code: "rate_limited", message: "Try again later." } },
          { status: 429 },
        ),
      ),
    ).rejects.toThrow("Try again later.");
  });

  it("does not expose non-JSON proxy bodies", async () => {
    await expect(
      readAiChatResponse(
        new Response("<html>gateway failure</html>", { status: 502 }),
      ),
    ).rejects.toThrow(
      "The AI service returned 502. Your work was not changed; try again in a moment.",
    );
  });
});
