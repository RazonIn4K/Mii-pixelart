import {
  createExecutionContext,
  createScheduledController,
  env,
  SELF,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { COMMUNITY_LIMITS } from "../shared/community";
import { sha256 } from "./crypto";
import { guardExactReadyImageSet } from "./creation-images";
import worker from "./index";
import { cleanupExpiredShowcaseUpload } from "./scheduled";

const ORIGIN = "http://localhost:3000";
const SESSION_PEPPER = "test-only-session-pepper";
let PNG_BYTES: Uint8Array;

beforeAll(async () => {
  PNG_BYTES = await pngFixture(16, 16);
});

describe("creation showcase image pipeline", () => {
  beforeEach(async () => {
    await clearR2();
    await env.DB.exec(`
      DELETE FROM quota_reservations;
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

  it("uses a cookie-free one-time bearer upload and serves only sanitized derivatives", async () => {
    const owner = await seedUser("showcase-owner");
    const token = await seedSession(owner.id, "showcase-owner-token");
    const creation = await createProject(token, "Showcase project");
    const ticket = await createTicket(token, creation.id, {
      altText: "A tiny red pixel creation.",
      byteSize: PNG_BYTES.byteLength,
      contentType: "image/png",
    });

    const withCookie = await uploadImage(ticket, PNG_BYTES, {
      Cookie: `tomodachi.sid=${token}`,
    });
    expect(withCookie.status).toBe(403);
    const wrongOrigin = await uploadImage(ticket, PNG_BYTES, {
      Origin: "https://evil.example",
    });
    expect(wrongOrigin.status).toBe(403);
    const unsupportedType = await uploadImage(ticket, PNG_BYTES, {
      "Content-Type": "image/svg+xml",
    });
    expect(unsupportedType.status).toBe(415);

    const uploaded = await uploadImage(ticket, PNG_BYTES);
    expect(uploaded.status).toBe(201);
    const uploadedBody = await uploaded.json() as {
      data: { image: { id: string; isCover: boolean }; images: unknown[] };
    };
    expect(uploadedBody.data.image).toMatchObject({ id: ticket.uploadId, isCover: true });
    expect(uploadedBody.data.images).toHaveLength(1);

    const replay = await uploadImage(ticket, PNG_BYTES);
    expect(replay.status).toBe(401);

    const objects = await env.DB.prepare(
      `SELECT kind, content_type, object_key FROM creation_showcase_objects
       WHERE image_id = ? ORDER BY kind`,
    ).bind(ticket.uploadId).all<{
      content_type: string;
      kind: string;
      object_key: string;
    }>();
    expect(objects.results).toEqual([
      expect.objectContaining({ kind: "display", content_type: "image/webp" }),
      expect.objectContaining({ kind: "social", content_type: "image/jpeg" }),
      expect.objectContaining({ kind: "thumb", content_type: "image/webp" }),
    ]);
    expect(objects.results.every((object) => object.object_key.includes("/showcase/"))).toBe(true);
    const showcaseR2 = (await env.PROJECTS.list({
      prefix: `private/creations/${creation.id}/showcase/${ticket.uploadId}/`,
    })).objects;
    expect(showcaseR2.map((object) => object.key).sort()).toEqual([
      `private/creations/${creation.id}/showcase/${ticket.uploadId}/display.webp`,
      `private/creations/${creation.id}/showcase/${ticket.uploadId}/social.jpg`,
      `private/creations/${creation.id}/showcase/${ticket.uploadId}/thumb.webp`,
    ]);
    expect(showcaseR2.some((object) => /source|original/iu.test(object.key))).toBe(false);

    const privateAnonymous = await SELF.fetch(
      `${ORIGIN}/api/creations/${creation.id}/images`,
    );
    expect(privateAnonymous.status).toBe(404);
    const privateOwner = await SELF.fetch(
      `${ORIGIN}/api/creations/${creation.id}`,
      { headers: sessionHeaders(token, false) },
    );
    await expect(privateOwner.json()).resolves.toMatchObject({
      data: {
        creation: {
          images: [{ id: ticket.uploadId }],
          mediaSource: "showcase",
          primaryImageUrl: `/api/creations/${creation.id}/images/${ticket.uploadId}/display`,
        },
      },
    });

    await publishProject(token, creation.id);
    const publicImages = await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/images`);
    expect(publicImages.status).toBe(200);
    await expect(publicImages.json()).resolves.toMatchObject({
      data: [{ id: ticket.uploadId, altText: "A tiny red pixel creation." }],
    });
    const preferredPreview = await SELF.fetch(
      `${ORIGIN}/api/creations/${creation.id}/media/preview`,
    );
    expect(preferredPreview.status).toBe(200);
    expect(preferredPreview.headers.get("content-type")).toBe("image/webp");
  });

  it("consumes malformed-image tickets and releases their quota reservation", async () => {
    const owner = await seedUser("invalid-image-owner");
    const token = await seedSession(owner.id, "invalid-image-token");
    const creation = await createProject(token, "Invalid image project");
    const invalid = new TextEncoder().encode("not an image");
    const ticket = await createTicket(token, creation.id, {
      altText: "Invalid image fixture.",
      byteSize: invalid.byteLength,
      contentType: "image/png",
    });

    const response = await uploadImage(ticket, invalid);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
    expect((await uploadImage(ticket, invalid)).status).toBe(401);
    await expect(env.DB.prepare(
      "SELECT status, upload_token_hash FROM creation_showcase_images WHERE id = ?",
    ).bind(ticket.uploadId).first()).resolves.toMatchObject({
      status: "failed",
      upload_token_hash: null,
    });
    expect(await env.DB.prepare(
      "SELECT 1 AS found FROM quota_reservations WHERE id = ?",
    ).bind(ticket.uploadId).first()).toBeNull();
  });

  it("rejects decoded raster dimensions above the gallery bound", async () => {
    const owner = await seedUser("dimension-owner");
    const token = await seedSession(owner.id, "dimension-token");
    const creation = await createProject(token, "Dimension limit project");
    const oversized = await pngFixture(
      COMMUNITY_LIMITS.creationImageDimensionMaximum + 1,
      1,
    );
    const ticket = await createTicket(token, creation.id, {
      altText: "An image wider than the accepted gallery boundary.",
      byteSize: oversized.byteLength,
      contentType: "image/png",
    });

    const response = await uploadImage(ticket, oversized);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
    expect((await uploadImage(ticket, oversized)).status).toBe(401);
  });

  it("replaces a cover atomically at the four-ready-image boundary", async () => {
    const owner = await seedUser("replacement-owner");
    const token = await seedSession(owner.id, "replacement-token");
    const creation = await createProject(token, "Replacement project");
    const readyIds: string[] = [];
    for (let sortOrder = 0; sortOrder < 4; sortOrder += 1) {
      readyIds.push(await seedReadyImage(creation.id, owner.id, sortOrder, sortOrder === 0));
    }
    const ticket = await createTicket(token, creation.id, {
      altText: "Replacement cover image.",
      byteSize: PNG_BYTES.byteLength,
      contentType: "image/png",
      replaceImageId: readyIds[0],
    });

    expect((await uploadImage(ticket, PNG_BYTES)).status).toBe(201);
    const ready = await env.DB.prepare(
      `SELECT id, is_cover FROM creation_showcase_images
       WHERE creation_id = ? AND status = 'ready' ORDER BY sort_order`,
    ).bind(creation.id).all<{ id: string; is_cover: number }>();
    expect(ready.results).toHaveLength(4);
    expect(ready.results[0]).toEqual({ id: ticket.uploadId, is_cover: 1 });
    expect(ready.results.some((image) => image.id === readyIds[0])).toBe(false);
  });

  it("rejects a replacement when its target changes after ticket creation", async () => {
    const owner = await seedUser("replacement-race-owner");
    const token = await seedSession(owner.id, "replacement-race-token");
    const creation = await createProject(token, "Replacement race project");
    const targetId = await seedReadyImage(creation.id, owner.id, 0, true);
    const ticket = await createTicket(token, creation.id, {
      altText: "Replacement that should not become an append.",
      byteSize: PNG_BYTES.byteLength,
      contentType: "image/png",
      replaceImageId: targetId,
    });
    const now = Date.now();
    await env.DB.prepare(
      `UPDATE creation_showcase_images SET status = 'deleting', is_cover = 0,
       sort_order = NULL, deleted_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(now, now, targetId).run();

    const response = await uploadImage(ticket, PNG_BYTES);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CONFLICT" },
    });
    await expect(env.DB.prepare(
      "SELECT status FROM creation_showcase_images WHERE id = ?",
    ).bind(ticket.uploadId).first()).resolves.toMatchObject({ status: "failed" });
    expect((await env.PROJECTS.list({
      prefix: `private/creations/${creation.id}/showcase/${ticket.uploadId}/`,
    })).objects).toHaveLength(0);
  });

  it("rolls back a replacement batch unless that exact target was claimed", async () => {
    const owner = await seedUser("replace-commit-owner");
    const token = await seedSession(owner.id, "replacement-commit-race-token");
    const creation = await createProject(token, "Replacement commit race project");
    const targetId = await seedReadyImage(creation.id, owner.id, 0, true);
    const ticket = await createTicket(token, creation.id, {
      altText: "A guarded replacement image.",
      byteSize: PNG_BYTES.byteLength,
      contentType: "image/png",
      replaceImageId: targetId,
    });
    const now = Date.now();
    await env.DB.prepare(
      `UPDATE creation_showcase_images SET status = 'processing',
       upload_token_hash = NULL, updated_at = ? WHERE id = ?`,
    ).bind(now, ticket.uploadId).run();
    const key = `private/creations/${creation.id}/showcase/${ticket.uploadId}/display.webp`;
    const replacementBatch = env.DB.batch([
      env.DB.prepare("DELETE FROM quota_reservations WHERE id = ?").bind(ticket.uploadId),
      env.DB.prepare(
        `INSERT INTO creation_showcase_objects
         (id, image_id, creation_id, kind, object_key, content_type,
          byte_size, sha256, status, created_at, updated_at)
         VALUES (?, ?, ?, 'display', ?, 'image/webp', 1, ?, 'ready', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        ticket.uploadId,
        creation.id,
        key,
        "0".repeat(64),
        now,
        now,
      ),
      env.DB.prepare(
        `UPDATE creation_showcase_images SET status = 'ready',
         detected_content_type = 'image/png', source_byte_size = ?,
         source_width = 16, source_height = 16, sort_order = 0, is_cover = 1,
         ready_at = ?, updated_at = ? WHERE id = ? AND status = 'processing'`,
      ).bind(PNG_BYTES.byteLength, now, now, ticket.uploadId),
    ]);

    await expect(replacementBatch).rejects.toThrow(/creation_image_set_changed/iu);
    expect(await env.DB.prepare(
      "SELECT 1 AS found FROM creation_showcase_objects WHERE image_id = ?",
    ).bind(ticket.uploadId).first()).toBeNull();
    expect(await env.DB.prepare(
      "SELECT 1 AS found FROM quota_reservations WHERE id = ?",
    ).bind(ticket.uploadId).first()).not.toBeNull();
    await expect(env.DB.prepare(
      "SELECT status FROM creation_showcase_images WHERE id = ?",
    ).bind(targetId).first()).resolves.toMatchObject({ status: "ready" });
  });

  it("reorders the complete set and promotes a remaining image after cover deletion", async () => {
    const owner = await seedUser("reorder-owner");
    const token = await seedSession(owner.id, "reorder-token");
    const creation = await createProject(token, "Reorder project");
    const firstId = await seedReadyImage(creation.id, owner.id, 0, true);
    const secondId = await seedReadyImage(creation.id, owner.id, 1, false);

    const reordered = await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/images`, {
      body: JSON.stringify({
        coverImageId: secondId,
        orderedImageIds: [secondId, firstId],
      }),
      headers: sessionHeaders(token),
      method: "PATCH",
    });
    expect(reordered.status).toBe(200);
    await expect(reordered.json()).resolves.toMatchObject({
      data: {
        images: [
          { id: secondId, isCover: true, sortOrder: 0 },
          { id: firstId, isCover: false, sortOrder: 1 },
        ],
      },
    });

    const deleted = await SELF.fetch(
      `${ORIGIN}/api/creations/${creation.id}/images/${secondId}`,
      { headers: sessionHeaders(token), method: "DELETE" },
    );
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toMatchObject({
      data: {
        deletedImageId: secondId,
        images: [{ id: firstId, isCover: true, sortOrder: 0 }],
      },
    });

    await publishProject(token, creation.id);
    const publishedDelete = await SELF.fetch(
      `${ORIGIN}/api/creations/${creation.id}/images/${firstId}`,
      { headers: sessionHeaders(token), method: "DELETE" },
    );
    expect(publishedDelete.status).toBe(409);
    await expect(publishedDelete.json()).resolves.toMatchObject({
      error: { code: "CONFLICT" },
    });
    const publishedReorder = await SELF.fetch(
      `${ORIGIN}/api/creations/${creation.id}/images`,
      {
        body: JSON.stringify({ coverImageId: firstId, orderedImageIds: [firstId] }),
        headers: sessionHeaders(token),
        method: "PATCH",
      },
    );
    expect(publishedReorder.status).toBe(409);
    await expect(publishedReorder.json()).resolves.toMatchObject({
      error: { code: "CONFLICT" },
    });
  });

  it("rolls back a gallery mutation when its ready-image snapshot is stale", async () => {
    const owner = await seedUser("gallery-set-race-owner");
    const token = await seedSession(owner.id, "gallery-set-race-token");
    const creation = await createProject(token, "Gallery set race project");
    const firstId = await seedReadyImage(creation.id, owner.id, 0, true);
    const secondId = await seedReadyImage(creation.id, owner.id, 1, false);
    const staleSnapshot = [firstId, secondId];
    const thirdId = await seedReadyImage(creation.id, owner.id, 2, false);
    const now = Date.now();

    const staleDelete = env.DB.batch([
      guardExactReadyImageSet(env, {
        creationId: creation.id,
        expectedImageIds: staleSnapshot,
        now,
        ownerUserId: owner.id,
        requiredRowId: firstId,
        requiredStatus: "ready",
      }),
      env.DB.prepare(
        `UPDATE creation_showcase_images SET status = 'deleting', is_cover = 0,
         sort_order = NULL, deleted_at = ?, updated_at = ?
         WHERE id = ? AND creation_id = ? AND status = 'ready'`,
      ).bind(now, now, firstId, creation.id),
    ]);

    await expect(staleDelete).rejects.toThrow(/creation_image_set_changed/iu);
    const ready = await env.DB.prepare(
      `SELECT id, sort_order, is_cover FROM creation_showcase_images
       WHERE creation_id = ? AND status = 'ready' ORDER BY sort_order`,
    ).bind(creation.id).all<{ id: string; is_cover: number; sort_order: number }>();
    expect(ready.results).toEqual([
      { id: firstId, is_cover: 1, sort_order: 0 },
      { id: secondId, is_cover: 0, sort_order: 1 },
      { id: thirdId, is_cover: 0, sort_order: 2 },
    ]);
  });

  it("DB-authoritatively blocks promotion after the parent becomes public", async () => {
    const owner = await seedUser("promotion-race-owner");
    const token = await seedSession(owner.id, "promotion-race-token");
    const creation = await createProject(token, "Promotion race project");
    const ticket = await createTicket(token, creation.id, {
      altText: "A late image that publication must not expose.",
      byteSize: PNG_BYTES.byteLength,
      contentType: "image/png",
    });
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE creation_showcase_images SET status = 'processing',
         upload_token_hash = NULL, updated_at = ? WHERE id = ?`,
      ).bind(now, ticket.uploadId),
      env.DB.prepare(
        `UPDATE creations SET state = 'published', visibility = 'public',
         published_at = ?, updated_at = ? WHERE id = ?`,
      ).bind(now, now, creation.id),
    ]);
    const objectKey = `private/creations/${creation.id}/showcase/${ticket.uploadId}/display.webp`;
    const promotion = env.DB.batch([
      env.DB.prepare("DELETE FROM quota_reservations WHERE id = ?").bind(ticket.uploadId),
      env.DB.prepare(
        `INSERT INTO creation_showcase_objects
         (id, image_id, creation_id, kind, object_key, content_type,
          byte_size, sha256, status, created_at, updated_at)
         VALUES (?, ?, ?, 'display', ?, 'image/webp', 1, ?, 'ready', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        ticket.uploadId,
        creation.id,
        objectKey,
        "0".repeat(64),
        now,
        now,
      ),
      env.DB.prepare(
        `UPDATE creation_showcase_images SET status = 'ready',
         detected_content_type = 'image/png', source_byte_size = ?,
         source_width = 16, source_height = 16, sort_order = 0, is_cover = 1,
         ready_at = ?, updated_at = ? WHERE id = ? AND status = 'processing'`,
      ).bind(PNG_BYTES.byteLength, now, now, ticket.uploadId),
    ]);

    await expect(promotion).rejects.toThrow(/creation_image_private_draft_required/iu);
    expect(await env.DB.prepare(
      "SELECT 1 AS found FROM creation_showcase_objects WHERE image_id = ?",
    ).bind(ticket.uploadId).first()).toBeNull();
    await expect(env.DB.prepare(
      "SELECT status FROM creation_showcase_images WHERE id = ?",
    ).bind(ticket.uploadId).first()).resolves.toMatchObject({ status: "processing" });
    expect(await env.DB.prepare(
      "SELECT 1 AS found FROM quota_reservations WHERE id = ?",
    ).bind(ticket.uploadId).first()).not.toBeNull();
  });

  it("does not delete a ready image selected from a stale cleanup snapshot", async () => {
    const owner = await seedUser("cleanup-race-owner");
    const token = await seedSession(owner.id, "cleanup-race-token");
    const creation = await createProject(token, "Cleanup race project");
    const imageId = await seedReadyImage(creation.id, owner.id, 0, true);
    const key = `private/creations/${creation.id}/showcase/${imageId}/display.webp`;
    const now = Date.now();
    await env.PROJECTS.put(key, new Uint8Array([1]), {
      httpMetadata: { contentType: "image/webp" },
    });
    await env.DB.prepare(
      `INSERT INTO creation_showcase_objects
       (id, image_id, creation_id, kind, object_key, content_type,
        byte_size, sha256, status, created_at, updated_at)
       VALUES (?, ?, ?, 'display', ?, 'image/webp', 1, ?, 'ready', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      imageId,
      creation.id,
      key,
      "0".repeat(64),
      now,
      now,
    ).run();

    await expect(cleanupExpiredShowcaseUpload(
      env,
      { creation_id: creation.id, id: imageId },
      now + 120_000,
    )).resolves.toBe(false);
    expect(await env.PROJECTS.get(key)).not.toBeNull();
    await expect(env.DB.prepare(
      "SELECT status FROM creation_showcase_images WHERE id = ?",
    ).bind(imageId).first()).resolves.toMatchObject({ status: "ready" });
  });

  it("enforces database-authoritative ready-image and rolling attempt limits", async () => {
    const owner = await seedUser("limit-owner");
    const token = await seedSession(owner.id, "limit-token");
    const creation = await createProject(token, "Limit project");
    for (let sortOrder = 0; sortOrder < 4; sortOrder += 1) {
      await seedReadyImage(creation.id, owner.id, sortOrder, sortOrder === 0);
    }
    const fifthId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO creation_showcase_images
       (id, creation_id, owner_user_id, upload_token_hash, expected_content_type,
        expected_byte_size, alt_text, status, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'image/png', 1, 'Fifth image', 'processing', ?, ?, ?)`,
    ).bind(fifthId, creation.id, owner.id, now + 60_000, now, now).run();
    await expect(env.DB.prepare(
      `UPDATE creation_showcase_images SET status = 'ready',
       detected_content_type = 'image/png', source_byte_size = 1,
       source_width = 1, source_height = 1, sort_order = 3,
       ready_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(now, now, fifthId).run()).rejects.toThrow(/creation_image_limit_exceeded/iu);

    await env.DB.exec(`
      DELETE FROM quota_reservations;
      DELETE FROM creation_showcase_images;
    `);
    const cleanedTicket = await createTicket(token, creation.id, {
      altText: "An attempt that remains counted after cleanup.",
      byteSize: PNG_BYTES.byteLength,
      contentType: "image/png",
    });
    await env.DB.batch([
      env.DB.prepare("DELETE FROM quota_reservations WHERE id = ?").bind(cleanedTicket.uploadId),
      env.DB.prepare("DELETE FROM creation_showcase_images WHERE id = ?").bind(cleanedTicket.uploadId),
    ]);
    const attempts = Array.from(
      { length: COMMUNITY_LIMITS.creationImageUploadsPerDay - 1 },
      () =>
        env.DB.prepare(
          `INSERT INTO creation_showcase_upload_attempts (id, user_id, created_at)
           VALUES (?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          owner.id,
          now,
        ),
    );
    await env.DB.batch(attempts);
    await expect(env.DB.prepare(
      "SELECT COUNT(*) AS count FROM creation_showcase_upload_attempts WHERE user_id = ?",
    ).bind(owner.id).first<{ count: number }>()).resolves.toMatchObject({
      count: COMMUNITY_LIMITS.creationImageUploadsPerDay,
    });
    await expect(env.DB.prepare(
      `INSERT INTO creation_showcase_upload_attempts (id, user_id, created_at)
       VALUES (?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      owner.id,
      now,
    ).run()).rejects.toThrow(/creation_image_daily_quota_exceeded/iu);
  });

  it("removes stale reserved/processing, old failed, and deleting image objects", async () => {
    const owner = await seedUser("cleanup-owner");
    const token = await seedSession(owner.id, "cleanup-token");
    const creation = await createProject(token, "Cleanup project");
    const now = Date.now();
    const rows = [
      { status: "reserved", expiresAt: now - 1, updatedAt: now, token: "1".repeat(64), deletedAt: null },
      { status: "processing", expiresAt: now - 1, updatedAt: now, token: null, deletedAt: null },
      { status: "failed", expiresAt: now - 1, updatedAt: now - 25 * 60 * 60 * 1_000, token: null, deletedAt: null },
      { status: "deleting", expiresAt: now + 60_000, updatedAt: now, token: null, deletedAt: now },
    ] as const;
    const ids: string[] = [];
    for (const row of rows) {
      const id = crypto.randomUUID();
      ids.push(id);
      await env.DB.prepare(
        `INSERT INTO creation_showcase_images
         (id, creation_id, owner_user_id, upload_token_hash, expected_content_type,
          expected_byte_size, alt_text, status, failure_code, expires_at,
          created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, 'image/png', 1, 'Cleanup fixture', ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        creation.id,
        owner.id,
        row.token,
        row.status,
        row.status === "failed" ? "fixture" : null,
        row.expiresAt,
        now - 26 * 60 * 60 * 1_000,
        row.updatedAt,
        row.deletedAt,
      ).run();
      const key = `private/creations/${creation.id}/showcase/${id}/display.webp`;
      await env.PROJECTS.put(key, new Uint8Array([1]), {
        httpMetadata: { contentType: "image/webp" },
      });
      await env.DB.prepare(
        `INSERT INTO creation_showcase_objects
         (id, image_id, creation_id, kind, object_key, content_type,
          byte_size, sha256, status, created_at, updated_at)
         VALUES (?, ?, ?, 'display', ?, 'image/webp', 1, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        id,
        creation.id,
        key,
        "0".repeat(64),
        row.status === "deleting" ? "deleting" : "ready",
        now,
        now,
      ).run();
    }

    const controller = createScheduledController({
      cron: "0 * * * *",
      scheduledTime: now,
    });
    const execution = createExecutionContext();
    worker.scheduled(controller, env, execution);
    await waitOnExecutionContext(execution);

    const remaining = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM creation_showcase_images
       WHERE id IN (${ids.map(() => "?").join(",")})`,
    ).bind(...ids).first<{ count: number }>();
    expect(remaining?.count).toBe(0);
    for (const id of ids) {
      expect(await env.PROJECTS.get(
        `private/creations/${creation.id}/showcase/${id}/display.webp`,
      )).toBeNull();
    }
  });
});

async function createProject(
  token: string,
  name: string,
): Promise<{ id: string; slug: string }> {
  const response = await SELF.fetch(`${ORIGIN}/api/creations`, {
    body: JSON.stringify({ project: project(name), title: name }),
    headers: sessionHeaders(token),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return (await response.json() as { data: { id: string; slug: string } }).data;
}

async function publishProject(token: string, creationId: string): Promise<void> {
  const response = await SELF.fetch(`${ORIGIN}/api/creations/${creationId}/publish`, {
    body: JSON.stringify({
      commentsEnabled: true,
      description: "Published showcase fixture.",
      projectDownloadEnabled: false,
      tags: [],
      title: "Showcase fixture",
      visibility: "public",
    }),
    headers: sessionHeaders(token),
    method: "POST",
  });
  expect(response.status).toBe(200);
}

async function createTicket(
  token: string,
  creationId: string,
  input: {
    altText: string;
    byteSize: number;
    contentType: string;
    replaceImageId?: string;
  },
): Promise<{ uploadId: string; uploadToken: string; uploadUrl: string }> {
  const response = await SELF.fetch(`${ORIGIN}/api/creations/${creationId}/images/uploads`, {
    body: JSON.stringify(input),
    headers: sessionHeaders(token),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return (await response.json() as {
    data: { uploadId: string; uploadToken: string; uploadUrl: string };
  }).data;
}

function uploadImage(
  ticket: { uploadToken: string; uploadUrl: string },
  bytes: Uint8Array,
  headers: Record<string, string> = {},
): Promise<Response> {
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return SELF.fetch(`${ORIGIN}${ticket.uploadUrl}`, {
    body: body.buffer,
    headers: {
      Authorization: `Bearer ${ticket.uploadToken}`,
      "Content-Type": "image/png",
      Origin: ORIGIN,
      ...headers,
    },
    method: "PUT",
  });
}

async function seedUser(username: string): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users
       (id, username, display_name, bio, role, status, avatar_seed,
        terms_version, terms_accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, '', 'user', 'active', ?, '2026-07-12', ?, ?, ?)`,
    ).bind(id, username, username, id, now, now, now),
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
     VALUES (?, ?, ?, 'Showcase test', ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    await sha256(`${SESSION_PEPPER}:${token}`),
    userId,
    now,
    now,
    now,
    now + 60 * 60 * 1_000,
  ).run();
  return token;
}

async function seedReadyImage(
  creationId: string,
  ownerId: string,
  sortOrder: number,
  isCover: boolean,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO creation_showcase_images
     (id, creation_id, owner_user_id, upload_token_hash, expected_content_type,
      expected_byte_size, detected_content_type, source_byte_size, source_width,
      source_height, alt_text, sort_order, is_cover, status, expires_at,
      created_at, updated_at, ready_at)
     VALUES (?, ?, ?, NULL, 'image/png', 1, 'image/png', 1, 1, 1,
      ?, ?, ?, 'ready', ?, ?, ?, ?)`,
  ).bind(
    id,
    creationId,
    ownerId,
    `Showcase image ${sortOrder + 1}`,
    sortOrder,
    Number(isCover),
    now + 60_000,
    now,
    now,
    now,
  ).run();
  return id;
}

function sessionHeaders(token: string, body = true): Record<string, string> {
  return {
    ...(body ? { "Content-Type": "application/json" } : {}),
    Cookie: `tomodachi.sid=${token}`,
    Origin: ORIGIN,
  };
}

function project(name: string) {
  const timestamp = "2026-07-10T12:00:00.000Z";
  return {
    version: 1,
    meta: { name, createdAt: timestamp, modifiedAt: timestamp },
    width: 8,
    height: 8,
    cells: ["R1C1", ...Array.from({ length: 63 }, () => null)],
    usedColors: ["R1C1"],
    lockedColors: [],
  };
}

async function clearR2(): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await env.PROJECTS.list({ cursor, limit: 1_000 });
    if (page.objects.length) {
      await env.PROJECTS.delete(page.objects.map((object) => object.key));
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

async function pngFixture(width: number, height: number): Promise<Uint8Array> {
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      raw[offset] = 220;
      raw[offset + 1] = 72;
      raw[offset + 2] = 72;
      raw[offset + 3] = 255;
    }
  }
  const compressed = new Uint8Array(await new Response(
    new Blob([raw.buffer]).stream().pipeThrough(new CompressionStream("deflate")),
  ).arrayBuffer());
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return concatenateBytes(
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array()),
  );
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const output = new Uint8Array(12 + data.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.byteLength);
  output.set(typeBytes, 4);
  output.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(concatenateBytes(typeBytes, data)));
  return output;
}

function concatenateBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
