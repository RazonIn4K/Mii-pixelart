import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { sha256 } from "./crypto";

const ORIGIN = "http://localhost:3000";
const SESSION_PEPPER = "test-only-session-pepper";

describe("account export streaming", () => {
  beforeEach(async () => {
    await env.DB.exec(`
      DELETE FROM profile_image_report_evidence;
      DELETE FROM profile_image_objects;
      DELETE FROM profile_images;
      DELETE FROM profile_image_upload_attempts;
      DELETE FROM creation_showcase_objects;
      DELETE FROM creation_showcase_images;
      DELETE FROM comments;
      DELETE FROM creations;
      DELETE FROM sessions;
      DELETE FROM external_identities;
      DELETE FROM users;
    `);
    const objects = await env.PROJECTS.list({ limit: 1_000 });
    if (objects.objects.length) {
      await env.PROJECTS.delete(objects.objects.map((object) => object.key));
    }
  });

  it("pages large collections without dropping equal-timestamp rows", async () => {
    const now = Date.now();
    const userId = crypto.randomUUID();
    const creationId = crypto.randomUUID();
    const imageId = crypto.randomUUID();
    const profileImageId = crypto.randomUUID();
    const token = "export-session-token";

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users
         (id, username, display_name, bio, role, status, avatar_seed,
          terms_version, terms_accepted_at, created_at, updated_at)
         VALUES (?, 'exporter', 'Exporter', '', 'user', 'active', ?,
          '2026-07-16', ?, ?, ?)`,
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

    const imageKey = `private/creations/${creationId}/showcase/${imageId}/display.webp`;
    const imageBytes = new Uint8Array([1, 2, 3, 4]);
    const profileImageKey = `private/users/${userId}/avatar/${profileImageId}/avatar.webp`;
    const profileImageBytes = new Uint8Array([5, 6, 7, 8]);
    await env.PROJECTS.put(imageKey, imageBytes, {
      httpMetadata: { contentType: "image/webp" },
    });
    await env.PROJECTS.put(profileImageKey, profileImageBytes, {
      httpMetadata: { contentType: "image/webp" },
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO creation_showcase_images
         (id, creation_id, owner_user_id, upload_token_hash,
          expected_content_type, expected_byte_size, detected_content_type,
          source_byte_size, source_width, source_height, alt_text, sort_order,
          is_cover, status, expires_at, created_at, updated_at, ready_at)
         VALUES (?, ?, ?, NULL, 'image/png', 4, 'image/png', 4, 16, 16,
          'Exported showcase image', 0, 1, 'ready', ?, ?, ?, ?)`,
      ).bind(imageId, creationId, userId, now + 60_000, now, now, now),
      env.DB.prepare(
        `INSERT INTO creation_showcase_objects
         (id, image_id, creation_id, kind, object_key, content_type,
          byte_size, sha256, status, created_at, updated_at)
         VALUES (?, ?, ?, 'display', ?, 'image/webp', 4, ?, 'ready', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        imageId,
        creationId,
        imageKey,
        "0".repeat(64),
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO profile_images
         (id, user_id, upload_token_hash, expected_content_type,
          expected_byte_size, focus_x, focus_y, detected_content_type,
          source_byte_size, source_width, source_height, status, expires_at,
          created_at, updated_at, ready_at)
         VALUES (?, ?, NULL, 'image/png', 4, 35, 65, 'image/png', 4, 16, 16,
          'ready', ?, ?, ?, ?)`,
      ).bind(profileImageId, userId, now + 60_000, now, now, now),
      env.DB.prepare(
        `INSERT INTO profile_image_objects
         (id, image_id, user_id, object_key, content_type, byte_size, sha256,
          status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'image/webp', 4, ?, 'ready', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        profileImageId,
        userId,
        profileImageKey,
        "2".repeat(64),
        now,
        now,
      ),
      env.DB.prepare(
        "UPDATE users SET avatar_image_id = ? WHERE id = ?",
      ).bind(profileImageId, userId),
    ]);

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
    expect(records.filter((record) => record.type === "creation_image")).toEqual([
      expect.objectContaining({
        creationId,
        data: expect.objectContaining({
          altText: "Exported showcase image",
          id: imageId,
          isCover: true,
          sortOrder: 0,
        }),
      }),
    ]);
    expect(records.filter((record) => record.type === "creation_image_object")).toEqual([
      expect.objectContaining({
        creationId,
        imageId,
        data: expect.objectContaining({
          byteSize: 4,
          contentType: "image/webp",
          kind: "display",
        }),
      }),
    ]);
    expect(records.filter((record) => record.type === "creation_image_object_chunk")).toEqual([
      expect.objectContaining({
        creationId,
        dataBase64: "AQIDBA==",
        imageId,
        kind: "display",
        sequence: 0,
      }),
    ]);
    expect(records.filter((record) => record.type === "profile_image")).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          byteSize: 4,
          contentType: "image/webp",
          focusX: 35,
          focusY: 65,
          id: profileImageId,
        }),
      }),
    ]);
    expect(
      records.filter((record) => record.type === "profile_image_object_chunk"),
    ).toEqual([
      expect.objectContaining({
        dataBase64: "BQYHCA==",
        imageId: profileImageId,
        sequence: 0,
      }),
    ]);
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
