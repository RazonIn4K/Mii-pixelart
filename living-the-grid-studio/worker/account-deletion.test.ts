import {
  createExecutionContext,
  createScheduledController,
  env,
  SELF,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { sha256 } from "./crypto";
import worker from "./index";

const ORIGIN = "http://localhost:3000";
const SESSION_PEPPER = "test-only-session-pepper";
const DAY = 24 * 60 * 60 * 1_000;

describe("account deletion lifecycle", () => {
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
      DELETE FROM creation_showcase_upload_attempts;
      DELETE FROM creation_objects;
      DELETE FROM creation_revisions;
      DELETE FROM creation_stats;
      DELETE FROM creations;
      DELETE FROM sessions;
      DELETE FROM external_identities;
      DELETE FROM users;
    `);
  });

  it("hides immediately, erases the due account, and preserves the peer plus pseudonymized retention records", async () => {
    const now = Date.now();
    const retentionDeadline = now + 3 * 365 * DAY;
    const owner = await seedUser("delete-owner", "moderator", now);
    const peer = await seedUser("delete-peer", "user", now);
    const ownerPrimaryToken = "deletion-owner-primary-token";
    const ownerSecondaryToken = "deletion-owner-secondary-token";
    const peerToken = "deletion-peer-token";

    await seedSession(owner.id, ownerPrimaryToken, now, now + 30 * DAY);
    await seedSession(owner.id, ownerSecondaryToken, now, now + 30 * DAY);
    await seedSession(peer.id, peerToken, now, now + 30 * DAY);

    const ownerCreation = await seedPublishedCreation(
      owner.id,
      owner.username,
      now,
    );
    const peerCreation = await seedPublishedCreation(
      peer.id,
      peer.username,
      now,
    );
    const ownerShowcase = await seedShowcaseImage(
      owner.id,
      ownerCreation.id,
      now,
    );
    const peerShowcase = await seedShowcaseImage(peer.id, peerCreation.id, now);
    const ownerProfile = await seedProfileImage(owner.id, now);
    const peerProfile = await seedProfileImage(peer.id, now);

    const ownerCommentOnPeer = crypto.randomUUID();
    const peerCommentOnOwner = crypto.randomUUID();
    const peerCommentOnPeer = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO comments
         (id, creation_id, author_user_id, body, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Owner comment removed with the account.', 'active', ?, ?)`,
      ).bind(ownerCommentOnPeer, peerCreation.id, owner.id, now, now),
      env.DB.prepare(
        `INSERT INTO comments
         (id, creation_id, author_user_id, body, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Peer comment removed with the owner creation.', 'active', ?, ?)`,
      ).bind(peerCommentOnOwner, ownerCreation.id, peer.id, now, now),
      env.DB.prepare(
        `INSERT INTO comments
         (id, creation_id, author_user_id, body, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Independent peer comment remains.', 'active', ?, ?)`,
      ).bind(peerCommentOnPeer, peerCreation.id, peer.id, now, now),
      env.DB.prepare(
        "INSERT INTO likes (user_id, creation_id, created_at) VALUES (?, ?, ?)",
      ).bind(owner.id, peerCreation.id, now),
      env.DB.prepare(
        "INSERT INTO likes (user_id, creation_id, created_at) VALUES (?, ?, ?)",
      ).bind(peer.id, ownerCreation.id, now),
      env.DB.prepare(
        "INSERT INTO likes (user_id, creation_id, created_at) VALUES (?, ?, ?)",
      ).bind(peer.id, peerCreation.id, now),
      env.DB.prepare(
        `INSERT INTO follows
         (follower_user_id, followed_user_id, created_at) VALUES (?, ?, ?)`,
      ).bind(owner.id, peer.id, now),
      env.DB.prepare(
        `INSERT INTO follows
         (follower_user_id, followed_user_id, created_at) VALUES (?, ?, ?)`,
      ).bind(peer.id, owner.id, now),
    ]);

    const peerReportId = crypto.randomUUID();
    const ownerReportId = crypto.randomUUID();
    const moderationActionId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO reports
         (id, reporter_user_id, reporter_pseudonym, target_type, target_id,
          reason, details, status, assigned_moderator_user_id, created_at,
          updated_at, retain_until)
         VALUES (?, ?, 'peer-retained-pseudonym', 'user', ?, 'other', '',
          'open', ?, ?, ?, ?)`,
      ).bind(
        peerReportId,
        peer.id,
        owner.id,
        owner.id,
        now,
        now,
        retentionDeadline,
      ),
      env.DB.prepare(
        `INSERT INTO reports
         (id, reporter_user_id, reporter_pseudonym, target_type, target_id,
          reason, details, status, assigned_moderator_user_id, created_at,
          updated_at, resolved_at, retain_until)
         VALUES (?, ?, 'owner-retained-pseudonym', 'user', ?, 'spam', '',
          'resolved', ?, ?, ?, ?, ?)`,
      ).bind(
        ownerReportId,
        owner.id,
        peer.id,
        owner.id,
        now,
        now,
        now,
        retentionDeadline,
      ),
      env.DB.prepare(
        `INSERT INTO profile_image_report_evidence
         (report_id, image_id, user_id, object_key, content_type, byte_size,
          sha256, created_at)
         VALUES (?, ?, ?, ?, 'image/webp', ?, ?, ?)`,
      ).bind(
        peerReportId,
        ownerProfile.imageId,
        owner.id,
        ownerProfile.objectKey,
        ownerProfile.byteSize,
        ownerProfile.sha256,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO moderation_actions
         (id, report_id, moderator_user_id, actor_pseudonym, target_type,
          target_id, action, reason, created_at, retain_until)
         VALUES (?, ?, ?, 'owner-moderator-pseudonym', 'user', ?,
          'remove_profile_image', 'Retained safety decision', ?, ?)`,
      ).bind(
        moderationActionId,
        peerReportId,
        owner.id,
        owner.id,
        now,
        retentionDeadline,
      ),
    ]);

    expect(
      await SELF.fetch(`${ORIGIN}/api/public/creations/${ownerCreation.slug}`),
    ).toMatchObject({ status: 200 });
    expect(
      await SELF.fetch(
        `${ORIGIN}/api/users/${owner.id}/avatar/${ownerProfile.imageId}`,
      ),
    ).toMatchObject({ status: 200 });

    const deletion = await SELF.fetch(`${ORIGIN}/api/me`, {
      body: "{}",
      headers: sessionHeaders(ownerPrimaryToken),
      method: "DELETE",
    });
    expect(deletion.status).toBe(202);
    expect(deletion.headers.get("set-cookie")).toContain("Max-Age=0");
    const deletionBody = (await deletion.json()) as {
      data: { deletionDueAt: number };
    };

    await expect(
      env.DB.prepare("SELECT status, deletion_due_at FROM users WHERE id = ?")
        .bind(owner.id)
        .first(),
    ).resolves.toEqual({
      deletion_due_at: deletionBody.data.deletionDueAt,
      status: "deletion_pending",
    });
    await expect(
      env.DB.prepare(
        `SELECT state, visibility, published_at
         FROM creations WHERE id = ?`,
      )
        .bind(ownerCreation.id)
        .first(),
    ).resolves.toEqual({
      published_at: null,
      state: "draft",
      visibility: "private",
    });
    expect(
      await env.DB.prepare(
        "SELECT creation_id FROM creation_search WHERE creation_id = ?",
      )
        .bind(ownerCreation.id)
        .first(),
    ).toBeNull();
    await expect(
      env.DB.prepare(
        "SELECT creation_id FROM creation_search WHERE creation_id = ?",
      )
        .bind(peerCreation.id)
        .first(),
    ).resolves.toEqual({ creation_id: peerCreation.id });
    await expect(
      rowCount(
        "SELECT COUNT(*) AS count FROM sessions WHERE user_id = ? AND revoked_at IS NOT NULL",
        owner.id,
      ),
    ).resolves.toBe(2);
    await expect(
      rowCount(
        "SELECT COUNT(*) AS count FROM sessions WHERE user_id = ? AND revoked_at IS NULL",
        peer.id,
      ),
    ).resolves.toBe(1);

    const revokedSession = await SELF.fetch(`${ORIGIN}/api/auth/session`, {
      headers: sessionHeaders(ownerSecondaryToken, false),
    });
    await expect(revokedSession.json()).resolves.toMatchObject({
      data: { session: null, user: null },
    });
    expect(
      await SELF.fetch(`${ORIGIN}/api/public/creations/${ownerCreation.slug}`),
    ).toMatchObject({ status: 404 });
    expect(
      await SELF.fetch(
        `${ORIGIN}/api/users/${owner.id}/avatar/${ownerProfile.imageId}`,
      ),
    ).toMatchObject({ status: 404 });
    expect(
      await SELF.fetch(`${ORIGIN}/api/public/creations/${peerCreation.slug}`),
    ).toMatchObject({ status: 200 });
    expect(
      await SELF.fetch(
        `${ORIGIN}/api/users/${peer.id}/avatar/${peerProfile.imageId}`,
      ),
    ).toMatchObject({ status: 200 });

    for (const key of ownerObjectKeys(
      ownerCreation,
      ownerShowcase,
      ownerProfile,
    )) {
      expect(await env.PROJECTS.get(key)).not.toBeNull();
    }

    const scheduledTime = deletionBody.data.deletionDueAt + 1;
    await runScheduledCleanup(scheduledTime);

    expect(
      await env.DB.prepare("SELECT id FROM users WHERE id = ?")
        .bind(owner.id)
        .first(),
    ).toBeNull();
    for (const query of [
      "SELECT COUNT(*) AS count FROM external_identities WHERE user_id = ?",
      "SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?",
      "SELECT COUNT(*) AS count FROM creations WHERE owner_user_id = ?",
      "SELECT COUNT(*) AS count FROM profile_images WHERE user_id = ?",
      "SELECT COUNT(*) AS count FROM profile_image_objects WHERE user_id = ?",
      "SELECT COUNT(*) AS count FROM comments WHERE author_user_id = ?",
      "SELECT COUNT(*) AS count FROM likes WHERE user_id = ?",
      `SELECT COUNT(*) AS count FROM follows
       WHERE follower_user_id = ? OR followed_user_id = ?`,
    ]) {
      const bindings = query.includes(" OR followed_user_id")
        ? [owner.id, owner.id]
        : [owner.id];
      await expect(rowCount(query, ...bindings)).resolves.toBe(0);
    }
    await expect(
      rowCount(
        "SELECT COUNT(*) AS count FROM creation_revisions WHERE creation_id = ?",
        ownerCreation.id,
      ),
    ).resolves.toBe(0);
    await expect(
      rowCount(
        "SELECT COUNT(*) AS count FROM creation_objects WHERE creation_id = ?",
        ownerCreation.id,
      ),
    ).resolves.toBe(0);
    await expect(
      rowCount(
        "SELECT COUNT(*) AS count FROM creation_showcase_images WHERE creation_id = ?",
        ownerCreation.id,
      ),
    ).resolves.toBe(0);
    await expect(
      rowCount(
        "SELECT COUNT(*) AS count FROM creation_showcase_objects WHERE creation_id = ?",
        ownerCreation.id,
      ),
    ).resolves.toBe(0);
    await expect(
      rowCount(
        "SELECT COUNT(*) AS count FROM profile_image_report_evidence WHERE user_id = ?",
        owner.id,
      ),
    ).resolves.toBe(0);
    await expect(
      rowCount(
        "SELECT COUNT(*) AS count FROM comments WHERE id IN (?, ?)",
        ownerCommentOnPeer,
        peerCommentOnOwner,
      ),
    ).resolves.toBe(0);
    await expect(
      rowCount(
        "SELECT COUNT(*) AS count FROM likes WHERE creation_id = ?",
        ownerCreation.id,
      ),
    ).resolves.toBe(0);

    for (const key of ownerObjectKeys(
      ownerCreation,
      ownerShowcase,
      ownerProfile,
    )) {
      expect(await env.PROJECTS.get(key)).toBeNull();
    }
    expect(
      (
        await env.PROJECTS.list({
          prefix: `private/creations/${ownerCreation.id}/`,
        })
      ).objects,
    ).toHaveLength(0);
    expect(
      (
        await env.PROJECTS.list({
          prefix: `private/users/${owner.id}/avatar/`,
        })
      ).objects,
    ).toHaveLength(0);

    await expect(
      env.DB.prepare("SELECT status, avatar_image_id FROM users WHERE id = ?")
        .bind(peer.id)
        .first(),
    ).resolves.toEqual({
      avatar_image_id: peerProfile.imageId,
      status: "active",
    });
    await expect(
      rowCount(
        "SELECT COUNT(*) AS count FROM external_identities WHERE user_id = ?",
        peer.id,
      ),
    ).resolves.toBe(1);
    await expect(
      rowCount(
        "SELECT COUNT(*) AS count FROM sessions WHERE user_id = ? AND revoked_at IS NULL",
        peer.id,
      ),
    ).resolves.toBe(1);
    await expect(
      env.DB.prepare(
        `SELECT state, visibility, current_revision_id
         FROM creations WHERE id = ?`,
      )
        .bind(peerCreation.id)
        .first(),
    ).resolves.toEqual({
      current_revision_id: peerCreation.revisionId,
      state: "published",
      visibility: "public",
    });
    await expect(
      env.DB.prepare("SELECT id, status FROM creation_revisions WHERE id = ?")
        .bind(peerCreation.revisionId)
        .first(),
    ).resolves.toEqual({ id: peerCreation.revisionId, status: "ready" });
    await expect(
      env.DB.prepare(
        "SELECT object_key, status FROM creation_objects WHERE creation_id = ?",
      )
        .bind(peerCreation.id)
        .first(),
    ).resolves.toEqual({ object_key: peerCreation.objectKey, status: "ready" });
    await expect(
      env.DB.prepare(
        "SELECT id, status FROM creation_showcase_images WHERE id = ?",
      )
        .bind(peerShowcase.imageId)
        .first(),
    ).resolves.toEqual({ id: peerShowcase.imageId, status: "ready" });
    await expect(
      env.DB.prepare(
        "SELECT object_key, status FROM creation_showcase_objects WHERE image_id = ?",
      )
        .bind(peerShowcase.imageId)
        .first(),
    ).resolves.toEqual({ object_key: peerShowcase.objectKey, status: "ready" });
    await expect(
      env.DB.prepare("SELECT id, status FROM profile_images WHERE id = ?")
        .bind(peerProfile.imageId)
        .first(),
    ).resolves.toEqual({ id: peerProfile.imageId, status: "ready" });
    await expect(
      env.DB.prepare(
        "SELECT object_key, status FROM profile_image_objects WHERE image_id = ?",
      )
        .bind(peerProfile.imageId)
        .first(),
    ).resolves.toEqual({ object_key: peerProfile.objectKey, status: "ready" });
    await expect(
      env.DB.prepare(
        "SELECT like_count, comment_count FROM creation_stats WHERE creation_id = ?",
      )
        .bind(peerCreation.id)
        .first(),
    ).resolves.toEqual({ comment_count: 1, like_count: 1 });
    await expect(
      env.DB.prepare("SELECT id FROM comments WHERE id = ?")
        .bind(peerCommentOnPeer)
        .first(),
    ).resolves.toEqual({ id: peerCommentOnPeer });
    await expect(
      rowCount(
        "SELECT COUNT(*) AS count FROM likes WHERE user_id = ? AND creation_id = ?",
        peer.id,
        peerCreation.id,
      ),
    ).resolves.toBe(1);
    await expect(
      env.DB.prepare(
        "SELECT creation_id FROM creation_search WHERE creation_id = ?",
      )
        .bind(peerCreation.id)
        .first(),
    ).resolves.toEqual({ creation_id: peerCreation.id });
    for (const key of ownerObjectKeys(
      peerCreation,
      peerShowcase,
      peerProfile,
    )) {
      expect(await env.PROJECTS.get(key)).not.toBeNull();
    }

    await expect(
      env.DB.prepare(
        `SELECT reporter_user_id, reporter_pseudonym,
                assigned_moderator_user_id, status, target_id
         FROM reports WHERE id = ?`,
      )
        .bind(peerReportId)
        .first(),
    ).resolves.toEqual({
      assigned_moderator_user_id: null,
      reporter_pseudonym: "peer-retained-pseudonym",
      reporter_user_id: peer.id,
      status: "open",
      target_id: owner.id,
    });
    await expect(
      env.DB.prepare(
        `SELECT reporter_user_id, reporter_pseudonym,
                assigned_moderator_user_id, status, target_id
         FROM reports WHERE id = ?`,
      )
        .bind(ownerReportId)
        .first(),
    ).resolves.toEqual({
      assigned_moderator_user_id: null,
      reporter_pseudonym: "owner-retained-pseudonym",
      reporter_user_id: null,
      status: "resolved",
      target_id: peer.id,
    });
    await expect(
      env.DB.prepare(
        `SELECT report_id, moderator_user_id, actor_pseudonym, target_id, action
         FROM moderation_actions WHERE id = ?`,
      )
        .bind(moderationActionId)
        .first(),
    ).resolves.toEqual({
      action: "remove_profile_image",
      actor_pseudonym: "owner-moderator-pseudonym",
      moderator_user_id: null,
      report_id: peerReportId,
      target_id: owner.id,
    });

    await expectForeignKeysClean();
    const beforeRetry = await retainedSnapshot(
      peer.id,
      peerCreation.id,
      peerReportId,
      ownerReportId,
      moderationActionId,
    );

    await runScheduledCleanup(scheduledTime);

    expect(
      await env.DB.prepare("SELECT id FROM users WHERE id = ?")
        .bind(owner.id)
        .first(),
    ).toBeNull();
    expect(
      await retainedSnapshot(
        peer.id,
        peerCreation.id,
        peerReportId,
        ownerReportId,
        moderationActionId,
      ),
    ).toEqual(beforeRetry);
    for (const key of ownerObjectKeys(
      peerCreation,
      peerShowcase,
      peerProfile,
    )) {
      expect(await env.PROJECTS.get(key)).not.toBeNull();
    }
    await expectForeignKeysClean();
  });
});

interface SeededUser {
  id: string;
  username: string;
}

interface SeededCreation {
  id: string;
  objectKey: string;
  revisionId: string;
  slug: string;
}

interface SeededImage {
  byteSize: number;
  imageId: string;
  objectKey: string;
  sha256: string;
}

async function seedUser(
  username: string,
  role: "admin" | "moderator" | "user",
  now: number,
): Promise<SeededUser> {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users
       (id, username, display_name, bio, role, status, avatar_seed,
        terms_version, terms_accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, 'active', ?, '2026-07-16', ?, ?, ?)`,
    ).bind(id, username, username, role, crypto.randomUUID(), now, now, now),
    env.DB.prepare(
      `INSERT INTO external_identities
       (id, user_id, provider, provider_subject, email, email_verified,
        created_at, updated_at)
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
  return { id, username };
}

async function seedSession(
  userId: string,
  token: string,
  now: number,
  expiresAt: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO sessions
     (id, token_hash, user_id, ua_label, created_at, last_seen_at,
      last_authenticated_at, expires_at)
     VALUES (?, ?, ?, 'Deletion lifecycle test', ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      await sha256(`${SESSION_PEPPER}:${token}`),
      userId,
      now,
      now,
      now,
      expiresAt,
    )
    .run();
}

async function seedPublishedCreation(
  ownerId: string,
  username: string,
  now: number,
): Promise<SeededCreation> {
  const id = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const objectKey = `private/creations/${id}/${revisionId}/project.json`;
  const slug = username
    .replace(/[^a-z0-9]/gu, "")
    .padEnd(18, "0")
    .slice(0, 18);
  const digest = hexDigest(id);
  const projectBytes = new TextEncoder().encode(`{"owner":"${username}"}`);
  await env.PROJECTS.put(objectKey, projectBytes, {
    httpMetadata: { contentType: "application/json" },
  });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO creations
       (id, owner_user_id, slug, title, description, state, visibility,
        comments_enabled, project_download_enabled, bytes_total, published_at,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Lifecycle coverage', 'published', 'public',
        1, 0, ?, ?, ?, ?)`,
    ).bind(
      id,
      ownerId,
      slug,
      `${username} artwork`,
      projectBytes.byteLength,
      now,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO creation_revisions
       (id, creation_id, revision_number, status, project_bytes,
        project_sha256, created_at, ready_at)
       VALUES (?, ?, 1, 'ready', ?, ?, ?, ?)`,
    ).bind(revisionId, id, projectBytes.byteLength, digest, now, now),
    env.DB.prepare(
      `INSERT INTO creation_objects
       (id, creation_id, revision_id, kind, object_key, content_type,
        byte_size, sha256, status, created_at, updated_at)
       VALUES (?, ?, ?, 'project_json', ?, 'application/json', ?, ?,
        'ready', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      id,
      revisionId,
      objectKey,
      projectBytes.byteLength,
      digest,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO creation_stats
       (creation_id, like_count, comment_count, popularity_score, updated_at)
       VALUES (?, 0, 0, 0, ?)`,
    ).bind(id, now),
    env.DB.prepare(
      `INSERT INTO creation_tags (creation_id, tag_id, created_at)
       VALUES (?, 'tag-portraits', ?)`,
    ).bind(id, now),
    env.DB.prepare(
      "UPDATE creations SET current_revision_id = ? WHERE id = ?",
    ).bind(revisionId, id),
    env.DB.prepare(
      `INSERT INTO creation_search
       (creation_id, title, description, username, tags)
       VALUES (?, ?, 'Lifecycle coverage', ?, 'portraits')`,
    ).bind(id, `${username} artwork`, username),
  ]);
  return { id, objectKey, revisionId, slug };
}

async function seedShowcaseImage(
  ownerId: string,
  creationId: string,
  now: number,
): Promise<SeededImage> {
  const imageId = crypto.randomUUID();
  const objectKey = `private/creations/${creationId}/showcase/${imageId}/display.webp`;
  const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
  const digest = hexDigest(imageId);
  await env.PROJECTS.put(objectKey, bytes, {
    httpMetadata: { contentType: "image/webp" },
  });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO creation_showcase_images
       (id, creation_id, owner_user_id, upload_token_hash,
        expected_content_type, expected_byte_size, detected_content_type,
        source_byte_size, source_width, source_height, alt_text, sort_order,
        is_cover, status, expires_at, created_at, updated_at, ready_at)
       VALUES (?, ?, ?, NULL, 'image/png', ?, 'image/png', ?, 1, 1,
        'Lifecycle showcase', 0, 1, 'ready', ?, ?, ?, ?)`,
    ).bind(
      imageId,
      creationId,
      ownerId,
      bytes.byteLength,
      bytes.byteLength,
      now + DAY,
      now,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO creation_showcase_objects
       (id, image_id, creation_id, kind, object_key, content_type, byte_size,
        sha256, status, created_at, updated_at)
       VALUES (?, ?, ?, 'display', ?, 'image/webp', ?, ?, 'ready', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      imageId,
      creationId,
      objectKey,
      bytes.byteLength,
      digest,
      now,
      now,
    ),
  ]);
  return {
    byteSize: bytes.byteLength,
    imageId,
    objectKey,
    sha256: digest,
  };
}

async function seedProfileImage(
  userId: string,
  now: number,
): Promise<SeededImage> {
  const imageId = crypto.randomUUID();
  const objectKey = `private/users/${userId}/avatar/${imageId}/avatar.webp`;
  const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
  const digest = hexDigest(imageId);
  await env.PROJECTS.put(objectKey, bytes, {
    httpMetadata: { contentType: "image/webp" },
  });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO profile_images
       (id, user_id, upload_token_hash, expected_content_type,
        expected_byte_size, focus_x, focus_y, detected_content_type,
        source_byte_size, source_width, source_height, status, expires_at,
        created_at, updated_at, ready_at)
       VALUES (?, ?, NULL, 'image/png', ?, 50, 50, 'image/png', ?, 1, 1,
        'ready', ?, ?, ?, ?)`,
    ).bind(
      imageId,
      userId,
      bytes.byteLength,
      bytes.byteLength,
      now + DAY,
      now,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO profile_image_objects
       (id, image_id, user_id, object_key, content_type, byte_size, sha256,
        status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'image/webp', ?, ?, 'ready', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      imageId,
      userId,
      objectKey,
      bytes.byteLength,
      digest,
      now,
      now,
    ),
    env.DB.prepare("UPDATE users SET avatar_image_id = ? WHERE id = ?").bind(
      imageId,
      userId,
    ),
  ]);
  return {
    byteSize: bytes.byteLength,
    imageId,
    objectKey,
    sha256: digest,
  };
}

function ownerObjectKeys(
  creation: SeededCreation,
  showcase: SeededImage,
  profile: SeededImage,
): string[] {
  return [creation.objectKey, showcase.objectKey, profile.objectKey];
}

function hexDigest(id: string): string {
  return id.replaceAll("-", "").repeat(2).slice(0, 64);
}

function sessionHeaders(
  token: string,
  includeContentType = true,
): Record<string, string> {
  return {
    ...(includeContentType ? { "Content-Type": "application/json" } : {}),
    Cookie: `tomodachi.sid=${token}`,
    Origin: ORIGIN,
  };
}

async function rowCount(
  query: string,
  ...bindings: unknown[]
): Promise<number> {
  const row = await env.DB.prepare(query)
    .bind(...bindings)
    .first<{ count: number }>();
  return row?.count ?? -1;
}

async function runScheduledCleanup(scheduledTime: number): Promise<void> {
  const controller = createScheduledController({
    cron: "0 * * * *",
    scheduledTime,
  });
  const execution = createExecutionContext();
  worker.scheduled(controller, env, execution);
  await waitOnExecutionContext(execution);
}

async function retainedSnapshot(
  peerId: string,
  peerCreationId: string,
  peerReportId: string,
  ownerReportId: string,
  moderationActionId: string,
): Promise<Record<string, number>> {
  return {
    actions: await rowCount(
      "SELECT COUNT(*) AS count FROM moderation_actions WHERE id = ?",
      moderationActionId,
    ),
    comments: await rowCount(
      "SELECT COUNT(*) AS count FROM comments WHERE creation_id = ? AND author_user_id = ?",
      peerCreationId,
      peerId,
    ),
    creations: await rowCount(
      "SELECT COUNT(*) AS count FROM creations WHERE id = ? AND owner_user_id = ?",
      peerCreationId,
      peerId,
    ),
    identities: await rowCount(
      "SELECT COUNT(*) AS count FROM external_identities WHERE user_id = ?",
      peerId,
    ),
    likes: await rowCount(
      "SELECT COUNT(*) AS count FROM likes WHERE creation_id = ? AND user_id = ?",
      peerCreationId,
      peerId,
    ),
    reports: await rowCount(
      "SELECT COUNT(*) AS count FROM reports WHERE id IN (?, ?)",
      peerReportId,
      ownerReportId,
    ),
    sessions: await rowCount(
      "SELECT COUNT(*) AS count FROM sessions WHERE user_id = ? AND revoked_at IS NULL",
      peerId,
    ),
    users: await rowCount(
      "SELECT COUNT(*) AS count FROM users WHERE id = ? AND status = 'active'",
      peerId,
    ),
  };
}

async function expectForeignKeysClean(): Promise<void> {
  const check = await env.DB.prepare("PRAGMA foreign_key_check").all();
  expect(check.results).toEqual([]);
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
