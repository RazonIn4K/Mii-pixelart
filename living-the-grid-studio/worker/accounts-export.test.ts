import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { sha256 } from "./crypto";

const ORIGIN = "http://localhost:3000";
const SESSION_PEPPER = "test-only-session-pepper";

describe("account export streaming", () => {
  beforeEach(async () => {
    await env.DB.exec(`
      DELETE FROM comments;
      DELETE FROM creations;
      DELETE FROM sessions;
      DELETE FROM external_identities;
      DELETE FROM users;
    `);
  });

  it("pages large collections without dropping equal-timestamp rows", async () => {
    const now = Date.now();
    const userId = crypto.randomUUID();
    const creationId = crypto.randomUUID();
    const token = "export-session-token";

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users
         (id, username, display_name, bio, role, status, avatar_seed,
          terms_version, terms_accepted_at, created_at, updated_at)
         VALUES (?, 'exporter', 'Exporter', '', 'user', 'active', ?,
          '2026-07-10', ?, ?, ?)`,
      ).bind(userId, userId, now, now, now),
      env.DB.prepare(
        `INSERT INTO external_identities
         (id, user_id, provider, provider_subject, email, email_verified, created_at, updated_at)
         VALUES (?, ?, 'google', ?, 'exporter@example.test', 1, ?, ?)`,
      ).bind(crypto.randomUUID(), userId, `subject-${userId}`, now, now),
      env.DB.prepare(
        `INSERT INTO sessions
         (id, token_hash, user_id, ua_label, created_at, last_seen_at,
          last_authenticated_at, expires_at)
         VALUES (?, ?, ?, 'Export test', ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        await sha256(`${SESSION_PEPPER}:${token}`),
        userId,
        now,
        now,
        now,
        now + 60_000,
      ),
      env.DB.prepare(
        `INSERT INTO creations
         (id, owner_user_id, slug, title, description, state, visibility,
          comments_enabled, project_download_enabled, bytes_total, created_at, updated_at)
         VALUES (?, ?, 'export-test-slug01', 'Export target', '', 'draft', 'private',
          0, 0, 0, ?, ?)`,
      ).bind(creationId, userId, now, now),
    ]);

    const comments = Array.from({ length: 125 }, (_, index) =>
      env.DB.prepare(
        `INSERT INTO comments
       (id, creation_id, author_user_id, body, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      ).bind(
        `comment-${index.toString().padStart(3, "0")}`,
        creationId,
        userId,
        `Comment ${index}`,
        now,
        now,
      ),
    );
    await env.DB.batch(comments.slice(0, 75));
    await env.DB.batch(comments.slice(75));

    const response = await SELF.fetch(`${ORIGIN}/api/me/export`, {
      headers: { Cookie: `tomodachi.sid=${token}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );

    const body = new TextDecoder().decode(await response.arrayBuffer());
    const records = body
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            data: Record<string, unknown>;
            type: string;
          },
      );
    expect(records.filter((record) => record.type === "account")).toHaveLength(
      1,
    );
    expect(records.filter((record) => record.type === "creation")).toHaveLength(
      1,
    );
    const exportedComments = records.filter(
      (record) => record.type === "comment",
    );
    expect(exportedComments).toHaveLength(125);
    expect(exportedComments.map((record) => record.data.id)).toEqual(
      Array.from(
        { length: 125 },
        (_, index) => `comment-${index.toString().padStart(3, "0")}`,
      ),
    );
    expect(
      exportedComments.every((record) => !("export_id" in record.data)),
    ).toBe(true);
  });
});
