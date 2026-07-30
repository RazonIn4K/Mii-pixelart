import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { sha256 } from "./crypto";

const ORIGIN = "http://localhost:3000";
const SESSION_PEPPER = "test-only-session-pepper";

type Role = "admin" | "moderator" | "user";

describe("cross-account authorization matrix", () => {
  beforeEach(async () => {
    await clearR2();
    await env.DB.exec(`
      DELETE FROM quota_reservations;
      DELETE FROM profile_image_report_evidence;
      DELETE FROM profile_image_objects;
      DELETE FROM profile_images;
      DELETE FROM profile_image_upload_attempts;
      DELETE FROM moderation_actions;
      DELETE FROM reports;
      DELETE FROM follows;
      DELETE FROM comments;
      DELETE FROM likes;
      DELETE FROM creation_search;
      DELETE FROM creation_tags;
      DELETE FROM creation_showcase_objects;
      DELETE FROM creation_showcase_images;
      DELETE FROM creation_objects;
      DELETE FROM creation_revisions;
      DELETE FROM creation_stats;
      DELETE FROM creations;
      DELETE FROM sessions;
      DELETE FROM external_identities;
      DELETE FROM users;
    `);
  });

  it.each([
    { label: "ordinary signed-in user", role: "user" as const },
    { label: "moderator", role: "moderator" as const },
    { label: "admin", role: "admin" as const },
  ])(
    "denies $label access to another account's owner and author mutations",
    async ({ label, role }) => {
      const owner = await seedUser(`matrix-owner-${role}`, "user");
      const actor = await seedUser(`matrix-actor-${role}`, role);
      const ownerToken = await seedSession(
        owner.id,
        `matrix-owner-token-${role}`,
      );
      const actorToken = await seedSession(
        actor.id,
        `matrix-actor-token-${role}`,
      );
      const ownerHeaders = sessionHeaders(ownerToken);
      const actorHeaders = sessionHeaders(actorToken);

      const created = await SELF.fetch(`${ORIGIN}/api/creations`, {
        body: JSON.stringify({
          project: project("Owner matrix project"),
          title: "Owner matrix project",
        }),
        headers: ownerHeaders,
        method: "POST",
      });
      expect(created.status).toBe(201);
      const revisionEtag = created.headers.get("etag");
      expect(revisionEtag).toBe('"rev-1"');
      const creation = ((await created.json()) as { data: { id: string } })
        .data;
      const image = await seedReadyShowcaseImage(creation.id, owner.id);

      const privateState = await snapshotCreationState(creation.id);
      const privateR2 = await snapshotR2();
      const privateDenials = await Promise.all([
        SELF.fetch(`${ORIGIN}/api/creations/${creation.id}`, {
          body: JSON.stringify({ title: `Changed by ${label}` }),
          headers: actorHeaders,
          method: "PATCH",
        }),
        SELF.fetch(`${ORIGIN}/api/creations/${creation.id}`, {
          headers: actorHeaders,
          method: "DELETE",
        }),
        SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/project`, {
          body: JSON.stringify({
            project: project(`Project changed by ${label}`),
          }),
          headers: {
            ...actorHeaders,
            "If-Match": revisionEtag!,
          },
          method: "PUT",
        }),
        SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/publish`, {
          body: JSON.stringify(publishInput(`Published by ${label}`)),
          headers: actorHeaders,
          method: "POST",
        }),
        SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/images/uploads`, {
          body: JSON.stringify({
            altText: `Upload attempted by ${label}.`,
            byteSize: 1,
            contentType: "image/png",
          }),
          headers: actorHeaders,
          method: "POST",
        }),
        SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/images`, {
          body: JSON.stringify({
            coverImageId: image.id,
            orderedImageIds: [image.id],
          }),
          headers: actorHeaders,
          method: "PATCH",
        }),
        SELF.fetch(
          `${ORIGIN}/api/creations/${creation.id}/images/${image.id}`,
          {
            headers: actorHeaders,
            method: "DELETE",
          },
        ),
      ]);

      expect(privateDenials.map((response) => response.status)).toEqual(
        Array.from({ length: privateDenials.length }, () => 403),
      );
      expect(await snapshotCreationState(creation.id)).toEqual(privateState);
      expect(await snapshotR2()).toEqual(privateR2);

      const published = await SELF.fetch(
        `${ORIGIN}/api/creations/${creation.id}/publish`,
        {
          body: JSON.stringify(publishInput("Owner published project")),
          headers: ownerHeaders,
          method: "POST",
        },
      );
      expect(published.status).toBe(200);

      const commentResponse = await SELF.fetch(
        `${ORIGIN}/api/creations/${creation.id}/comments`,
        {
          body: JSON.stringify({ body: "The owner's original comment." }),
          headers: ownerHeaders,
          method: "POST",
        },
      );
      expect(commentResponse.status).toBe(201);
      const comment = (
        (await commentResponse.json()) as { data: { id: string } }
      ).data;
      const publicState = await snapshotCreationState(creation.id);
      const publicR2 = await snapshotR2();

      const publicDenials = await Promise.all([
        SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/unpublish`, {
          body: JSON.stringify({}),
          headers: actorHeaders,
          method: "POST",
        }),
        SELF.fetch(`${ORIGIN}/api/comments/${comment.id}`, {
          body: JSON.stringify({ body: `Comment changed by ${label}.` }),
          headers: actorHeaders,
          method: "PATCH",
        }),
        SELF.fetch(`${ORIGIN}/api/comments/${comment.id}`, {
          headers: actorHeaders,
          method: "DELETE",
        }),
      ]);

      expect(publicDenials.map((response) => response.status)).toEqual([
        403, 403, 403,
      ]);
      expect(await snapshotCreationState(creation.id)).toEqual(publicState);
      expect(await snapshotR2()).toEqual(publicR2);

      const foreignKeyCheck = await env.DB.prepare(
        "PRAGMA foreign_key_check",
      ).all();
      expect(foreignKeyCheck.results).toEqual([]);
    },
  );
});

async function seedUser(username: string, role: Role): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users
       (id, username, display_name, bio, role, status, avatar_seed,
        terms_version, terms_accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, 'active', ?, '2026-07-16', ?, ?, ?)`,
    ).bind(id, username, username, role, id, now, now, now),
    env.DB.prepare(
      `INSERT INTO external_identities
       (id, user_id, provider, provider_subject, email, email_verified, created_at, updated_at)
       VALUES (?, ?, 'google', ?, ?, 1, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      id,
      `subject-${id}`,
      `${username}@example.test`,
      now,
      now,
    ),
  ]);
  return { id };
}

async function seedSession(userId: string, token: string): Promise<string> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO sessions
     (id, token_hash, user_id, ua_label, created_at, last_seen_at,
      last_authenticated_at, expires_at)
     VALUES (?, ?, ?, 'Authorization matrix', ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      await sha256(`${SESSION_PEPPER}:${token}`),
      userId,
      now,
      now,
      now,
      now + 60 * 60 * 1_000,
    )
    .run();
  return token;
}

async function seedReadyShowcaseImage(
  creationId: string,
  ownerUserId: string,
): Promise<{ id: string; key: string }> {
  const id = crypto.randomUUID();
  const key = `private/creations/${creationId}/showcase/${id}/display.webp`;
  const now = Date.now();
  const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
  await env.PROJECTS.put(key, bytes, {
    httpMetadata: { contentType: "image/webp" },
  });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO creation_showcase_images
       (id, creation_id, owner_user_id, upload_token_hash, expected_content_type,
        expected_byte_size, detected_content_type, source_byte_size, source_width,
        source_height, alt_text, sort_order, is_cover, status, expires_at,
        created_at, updated_at, ready_at)
       VALUES (?, ?, ?, NULL, 'image/png', 1, 'image/png', 1, 1, 1,
        'Owner showcase image.', 0, 1, 'ready', ?, ?, ?, ?)`,
    ).bind(id, creationId, ownerUserId, now + 60_000, now, now, now),
    env.DB.prepare(
      `INSERT INTO creation_showcase_objects
       (id, image_id, creation_id, kind, object_key, content_type,
        byte_size, sha256, status, created_at, updated_at)
       VALUES (?, ?, ?, 'display', ?, 'image/webp', ?, ?, 'ready', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      id,
      creationId,
      key,
      bytes.byteLength,
      await sha256(bytes),
      now,
      now,
    ),
  ]);
  return { id, key };
}

async function snapshotCreationState(creationId: string): Promise<unknown> {
  const [
    creation,
    revisions,
    objects,
    images,
    showcaseObjects,
    comments,
    stats,
    search,
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT id, owner_user_id, title, description, state, visibility,
         comments_enabled, project_download_enabled, current_revision_id,
         bytes_total, published_at, deleted_at, updated_at
         FROM creations WHERE id = ?`,
    )
      .bind(creationId)
      .first(),
    env.DB.prepare(
      `SELECT id, revision_number, status, project_bytes, project_sha256,
         ready_at, obsolete_at FROM creation_revisions
         WHERE creation_id = ? ORDER BY revision_number, id`,
    )
      .bind(creationId)
      .all(),
    env.DB.prepare(
      `SELECT id, revision_id, kind, object_key, content_type, byte_size,
         sha256, status FROM creation_objects
         WHERE creation_id = ? ORDER BY revision_id, kind, id`,
    )
      .bind(creationId)
      .all(),
    env.DB.prepare(
      `SELECT id, owner_user_id, alt_text, sort_order, is_cover, status,
         deleted_at, updated_at FROM creation_showcase_images
         WHERE creation_id = ? ORDER BY id`,
    )
      .bind(creationId)
      .all(),
    env.DB.prepare(
      `SELECT id, image_id, kind, object_key, byte_size, sha256, status
         FROM creation_showcase_objects WHERE creation_id = ?
         ORDER BY image_id, kind, id`,
    )
      .bind(creationId)
      .all(),
    env.DB.prepare(
      `SELECT id, author_user_id, body, status, deleted_at, updated_at
         FROM comments WHERE creation_id = ? ORDER BY id`,
    )
      .bind(creationId)
      .all(),
    env.DB.prepare(
      `SELECT like_count, comment_count, popularity_score, updated_at
         FROM creation_stats WHERE creation_id = ?`,
    )
      .bind(creationId)
      .first(),
    env.DB.prepare(
      `SELECT creation_id, title, description, username, tags
         FROM creation_search WHERE creation_id = ?`,
    )
      .bind(creationId)
      .all(),
  ]);
  const counts = await env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM quota_reservations) AS quota_reservations,
      (SELECT COUNT(*) FROM creation_showcase_upload_attempts) AS showcase_attempts`,
  ).first();
  return {
    comments: comments.results,
    counts,
    creation,
    images: images.results,
    objects: objects.results,
    revisions: revisions.results,
    search: search.results,
    showcaseObjects: showcaseObjects.results,
    stats,
  };
}

async function snapshotR2(): Promise<Array<{ key: string; size: number }>> {
  const objects: Array<{ key: string; size: number }> = [];
  let cursor: string | undefined;
  do {
    const page = await env.PROJECTS.list({ cursor, limit: 1_000 });
    objects.push(
      ...page.objects.map((object) => ({ key: object.key, size: object.size })),
    );
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects.sort((left, right) => left.key.localeCompare(right.key));
}

async function clearR2(): Promise<void> {
  const objects = await snapshotR2();
  if (objects.length) {
    await env.PROJECTS.delete(objects.map((object) => object.key));
  }
}

function sessionHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Cookie: `tomodachi.sid=${token}`,
    Origin: ORIGIN,
  };
}

function publishInput(title: string) {
  return {
    commentsEnabled: true,
    description: "Authorization matrix fixture.",
    projectDownloadEnabled: false,
    tags: [],
    title,
    visibility: "public",
  };
}

function project(name: string) {
  const timestamp = "2026-07-10T12:00:00.000Z";
  return {
    cells: ["R1C1", ...Array.from({ length: 63 }, () => null)],
    height: 8,
    lockedColors: [],
    meta: { createdAt: timestamp, modifiedAt: timestamp, name },
    usedColors: ["R1C1"],
    version: 1,
    width: 8,
  };
}
