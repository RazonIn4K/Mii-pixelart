import {
  createExecutionContext,
  createScheduledController,
  env,
  SELF,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { sha256 } from "./crypto";
import worker from "./index";
import { cleanupDueAccount, runScheduledMaintenance } from "./scheduled";

const ORIGIN = "http://localhost:3000";
const SESSION_PEPPER = "test-only-session-pepper";
let FIRST_PNG: Uint8Array;
let SECOND_PNG: Uint8Array;

beforeAll(async () => {
  FIRST_PNG = await pngFixture(16, 12, [220, 72, 72, 255]);
  SECOND_PNG = await pngFixture(12, 16, [40, 120, 220, 255]);
});

describe("profile image pipeline", () => {
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

  it("uses an authenticated ticket and cookie-free one-use upload, then serves only the normalized derivative", async () => {
    const owner = await seedUser("profile-image-owner");
    const token = await seedSession(owner.id, "profile-image-owner-token");

    const anonymousTicket = await SELF.fetch(
      `${ORIGIN}/api/me/avatar/uploads`,
      {
        body: JSON.stringify(profileTicketInput(FIRST_PNG)),
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        method: "POST",
      },
    );
    expect(anonymousTicket.status).toBe(401);

    const ticket = await createTicket(token, FIRST_PNG, 32, 68);
    expect(ticket.uploadUrl).toBe(
      `/api/avatar-uploads/${ticket.uploadId}/content`,
    );

    const withCookie = await uploadImage(ticket, FIRST_PNG, {
      Cookie: `tomodachi.sid=${token}`,
    });
    expect(withCookie.status).toBe(403);
    const withoutBearer = await uploadImage(ticket, FIRST_PNG, {
      Authorization: "",
    });
    expect(withoutBearer.status).toBe(401);
    const wrongOrigin = await uploadImage(ticket, FIRST_PNG, {
      Origin: "https://evil.example",
    });
    expect(wrongOrigin.status).toBe(403);

    const uploaded = await uploadImage(ticket, FIRST_PNG);
    expect(uploaded.status).toBe(201);
    const uploadedBody = (await uploaded.json()) as {
      data: { avatarSeed: string; avatarUrl: string; id: string };
    };
    expect(uploadedBody.data).toMatchObject({
      avatarSeed: owner.avatarSeed,
      avatarUrl: `/api/users/${owner.id}/avatar/${ticket.uploadId}`,
      id: owner.id,
    });
    expect((await uploadImage(ticket, FIRST_PNG)).status).toBe(401);

    const databaseObject = await env.DB.prepare(
      `SELECT object_key, content_type, byte_size, status
       FROM profile_image_objects WHERE image_id = ?`,
    )
      .bind(ticket.uploadId)
      .first<{
        byte_size: number;
        content_type: string;
        object_key: string;
        status: string;
      }>();
    expect(databaseObject).toMatchObject({
      content_type: "image/webp",
      object_key: `private/users/${owner.id}/avatar/${ticket.uploadId}/avatar.webp`,
      status: "ready",
    });
    expect(databaseObject?.byte_size).toBeGreaterThan(0);

    const prefix = `private/users/${owner.id}/avatar/${ticket.uploadId}/`;
    const storedObjects = (await env.PROJECTS.list({ prefix })).objects;
    expect(storedObjects.map((object) => object.key)).toEqual([
      `${prefix}avatar.webp`,
    ]);
    expect(
      storedObjects.some((object) => /original|source/iu.test(object.key)),
    ).toBe(false);
    const stored = await env.PROJECTS.get(`${prefix}avatar.webp`);
    expect(stored).not.toBeNull();
    const storedBytes = new Uint8Array(await stored!.arrayBuffer());
    expect(new TextDecoder().decode(storedBytes.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(storedBytes.subarray(8, 12))).toBe("WEBP");

    const me = await SELF.fetch(`${ORIGIN}/api/me`, {
      headers: sessionHeaders(token, false),
    });
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({
      data: {
        avatarSeed: owner.avatarSeed,
        avatarUrl: uploadedBody.data.avatarUrl,
        id: owner.id,
      },
    });

    const publicImage = await SELF.fetch(
      `${ORIGIN}${uploadedBody.data.avatarUrl}`,
    );
    expect(publicImage.status).toBe(200);
    expect(publicImage.headers.get("content-type")).toBe("image/webp");
    expect(publicImage.headers.get("cache-control")).toBe("no-store");
    const publicBytes = new Uint8Array(await publicImage.arrayBuffer());
    expect(new TextDecoder().decode(publicBytes.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(publicBytes.subarray(8, 12))).toBe("WEBP");
  });

  it("consumes invalid-image tickets, releases quota, and rejects replay", async () => {
    const owner = await seedUser("invalid-profile-owner");
    const token = await seedSession(owner.id, "invalid-profile-image-token");
    const invalid = new TextEncoder().encode("not an image");
    const ticket = await createTicket(token, invalid, 50, 50);

    const response = await uploadImage(ticket, invalid);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
    expect((await uploadImage(ticket, invalid)).status).toBe(401);
    await expect(
      env.DB.prepare(
        "SELECT status, upload_token_hash FROM profile_images WHERE id = ?",
      )
        .bind(ticket.uploadId)
        .first(),
    ).resolves.toMatchObject({
      status: "failed",
      upload_token_hash: null,
    });
    expect(
      await env.DB.prepare(
        "SELECT 1 AS found FROM quota_reservations WHERE id = ?",
      )
        .bind(ticket.uploadId)
        .first(),
    ).toBeNull();
    expect(
      (
        await env.PROJECTS.list({
          prefix: `private/users/${owner.id}/avatar/${ticket.uploadId}/`,
        })
      ).objects,
    ).toHaveLength(0);
  });

  it("rejects type, byte-length, dimension, and expiry boundary violations", async () => {
    const owner = await seedUser("profile-boundary-owner");
    const token = await seedSession(owner.id, "profile-boundary-token");

    const wrongTypeTicket = await createTicket(token, FIRST_PNG, 50, 50);
    const wrongType = await uploadImage(wrongTypeTicket, FIRST_PNG, {
      "Content-Type": "image/jpeg",
    });
    expect(wrongType.status).toBe(415);
    await expectFailedUploadReleased(wrongTypeTicket.uploadId);

    const wrongLengthTicket = await createTicket(token, FIRST_PNG, 50, 50);
    const truncated = FIRST_PNG.subarray(0, FIRST_PNG.byteLength - 1);
    const wrongLength = await uploadImage(wrongLengthTicket, truncated);
    expect(wrongLength.status).toBe(400);
    await expectFailedUploadReleased(wrongLengthTicket.uploadId);

    const oversizedDimensions = await pngFixture(8_193, 1, [1, 2, 3, 255]);
    const dimensionTicket = await createTicket(
      token,
      oversizedDimensions,
      50,
      50,
    );
    const dimensionResponse = await uploadImage(
      dimensionTicket,
      oversizedDimensions,
    );
    expect(dimensionResponse.status).toBe(400);
    await expectFailedUploadReleased(dimensionTicket.uploadId);

    const expiredTicket = await createTicket(token, FIRST_PNG, 50, 50);
    const now = Date.now();
    await env.DB.prepare(
      "UPDATE profile_images SET created_at = ?, expires_at = ? WHERE id = ?",
    )
      .bind(now - 2, now - 1, expiredTicket.uploadId)
      .run();
    expect((await uploadImage(expiredTicket, FIRST_PNG)).status).toBe(401);
    await runScheduledMaintenance(
      env,
      createScheduledController({
        cron: "0 * * * *",
        scheduledTime: now,
      }),
    );
    expect(
      await env.DB.prepare("SELECT 1 AS found FROM profile_images WHERE id = ?")
        .bind(expiredTicket.uploadId)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT 1 AS found FROM quota_reservations WHERE id = ?",
      )
        .bind(expiredTicket.uploadId)
        .first(),
    ).toBeNull();
  });

  it("enforces the database-authoritative daily ticket quota", async () => {
    const owner = await seedUser("profile-daily-owner");
    const token = await seedSession(owner.id, "profile-daily-token");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await createTicket(token, FIRST_PNG, 50, 50);
    }

    const rejected = await SELF.fetch(`${ORIGIN}/api/me/avatar/uploads`, {
      body: JSON.stringify(profileTicketInput(FIRST_PNG)),
      headers: sessionHeaders(token),
      method: "POST",
    });
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("retry-after")).toBe("86400");
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: "QUOTA_EXCEEDED" },
    });
    await expect(
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM profile_image_upload_attempts WHERE user_id = ?",
      )
        .bind(owner.id)
        .first(),
    ).resolves.toEqual({ count: 10 });
  });

  it("fails closed and releases state when Images or R2 processing fails", async () => {
    const owner = await seedUser("profile-binding-failures");
    const token = await seedSession(owner.id, "profile-binding-failure-token");
    const runtimeEnvironments = [
      envWithImagesInputFailure(),
      envWithR2PutFailure(),
    ];

    for (const runtimeEnv of runtimeEnvironments) {
      const ticket = await createTicket(token, FIRST_PNG, 50, 50);
      const response = await fetchAndDrain(
        new Request(
          `${ORIGIN}${ticket.uploadUrl}`,
          rawUploadInit(ticket, FIRST_PNG),
        ),
        runtimeEnv,
      );
      expect(response.status).toBe(503);
      await expectFailedUploadReleased(ticket.uploadId);
      expect(
        (
          await env.PROJECTS.list({
            prefix: `private/users/${owner.id}/avatar/${ticket.uploadId}/`,
          })
        ).objects,
      ).toHaveLength(0);
    }
  });

  it("removes the normalized object and releases quota after a D1 commit failure", async () => {
    const owner = await seedUser("profile-d1-failure");
    const token = await seedSession(owner.id, "profile-d1-failure-token");
    const ticket = await createTicket(token, FIRST_PNG, 50, 50);

    const response = await fetchAndDrain(
      new Request(
        `${ORIGIN}${ticket.uploadUrl}`,
        rawUploadInit(ticket, FIRST_PNG),
      ),
      envWithOneD1BatchFailure(),
    );

    expect(response.status).toBe(500);
    await expectFailedUploadReleased(ticket.uploadId);
    expect(
      await env.PROJECTS.get(
        `private/users/${owner.id}/avatar/${ticket.uploadId}/avatar.webp`,
      ),
    ).toBeNull();
    await expect(
      env.DB.prepare("SELECT avatar_image_id FROM users WHERE id = ?")
        .bind(owner.id)
        .first(),
    ).resolves.toEqual({ avatar_image_id: null });
  });

  it("replaces the current image, invalidates its old URL, and restores the generated-avatar fallback on delete", async () => {
    const owner = await seedUser("replace-profile-owner");
    const token = await seedSession(owner.id, "replace-profile-image-token");

    const firstTicket = await createTicket(token, FIRST_PNG, 25, 75);
    expect((await uploadImage(firstTicket, FIRST_PNG)).status).toBe(201);
    const firstUrl = `/api/users/${owner.id}/avatar/${firstTicket.uploadId}`;
    expect((await SELF.fetch(`${ORIGIN}${firstUrl}`)).status).toBe(200);

    const secondTicket = await createTicket(token, SECOND_PNG, 75, 25);
    const replacement = await uploadImageAndDrain(secondTicket, SECOND_PNG);
    expect(replacement.status).toBe(201);
    const replacementBody = (await replacement.json()) as {
      data: { avatarSeed: string; avatarUrl: string | null };
    };
    const secondUrl = `/api/users/${owner.id}/avatar/${secondTicket.uploadId}`;
    expect(replacementBody.data).toMatchObject({
      avatarSeed: owner.avatarSeed,
      avatarUrl: secondUrl,
    });

    const ready = await env.DB.prepare(
      "SELECT id FROM profile_images WHERE user_id = ? AND status = 'ready'",
    )
      .bind(owner.id)
      .all<{ id: string }>();
    expect(ready.results).toEqual([{ id: secondTicket.uploadId }]);
    await expect(
      env.DB.prepare("SELECT avatar_image_id FROM users WHERE id = ?")
        .bind(owner.id)
        .first(),
    ).resolves.toEqual({
      avatar_image_id: secondTicket.uploadId,
    });
    expect((await SELF.fetch(`${ORIGIN}${firstUrl}`)).status).toBe(404);
    expect(
      await env.PROJECTS.get(
        `private/users/${owner.id}/avatar/${firstTicket.uploadId}/avatar.webp`,
      ),
    ).toBeNull();
    expect((await SELF.fetch(`${ORIGIN}${secondUrl}`)).status).toBe(200);

    const removed = await fetchAndDrain(
      new Request(`${ORIGIN}/api/me/avatar`, {
        body: JSON.stringify({}),
        headers: sessionHeaders(token),
        method: "DELETE",
      }),
    );
    expect(removed.status).toBe(200);
    await expect(removed.json()).resolves.toMatchObject({
      data: { avatarSeed: owner.avatarSeed, avatarUrl: null, id: owner.id },
    });
    expect((await SELF.fetch(`${ORIGIN}${secondUrl}`)).status).toBe(404);
    expect(
      await env.PROJECTS.get(
        `private/users/${owner.id}/avatar/${secondTicket.uploadId}/avatar.webp`,
      ),
    ).toBeNull();
    await expect(
      env.DB.prepare(
        "SELECT avatar_image_id, avatar_seed FROM users WHERE id = ?",
      )
        .bind(owner.id)
        .first(),
    ).resolves.toEqual({
      avatar_image_id: null,
      avatar_seed: owner.avatarSeed,
    });

    const me = await SELF.fetch(`${ORIGIN}/api/me`, {
      headers: sessionHeaders(token, false),
    });
    await expect(me.json()).resolves.toMatchObject({
      data: { avatarSeed: owner.avatarSeed, avatarUrl: null },
    });
  });

  it("allows exactly one of two concurrent replacements and removes the losing object", async () => {
    const owner = await seedUser("profile-replacement-race");
    const token = await seedSession(owner.id, "profile-race-token");
    const initial = await createTicket(token, FIRST_PNG, 50, 50);
    expect((await uploadImage(initial, FIRST_PNG)).status).toBe(201);

    const first = await createTicket(token, SECOND_PNG, 25, 75);
    const second = await createTicket(token, SECOND_PNG, 75, 25);
    const responses = await Promise.all([
      uploadImageAndDrain(first, SECOND_PNG),
      uploadImageAndDrain(second, SECOND_PNG),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);

    const winner = responses[0]?.status === 201 ? first : second;
    const loser = winner === first ? second : first;
    await expect(
      env.DB.prepare("SELECT avatar_image_id FROM users WHERE id = ?")
        .bind(owner.id)
        .first(),
    ).resolves.toEqual({ avatar_image_id: winner.uploadId });
    await expect(
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM profile_images WHERE user_id = ? AND status = 'ready'",
      )
        .bind(owner.id)
        .first(),
    ).resolves.toEqual({ count: 1 });
    expect(
      await env.PROJECTS.get(
        `private/users/${owner.id}/avatar/${loser.uploadId}/avatar.webp`,
      ),
    ).toBeNull();
  });

  it("hides the image during account deletion and removes its rows and object at final deletion", async () => {
    const owner = await seedUser("delete-profile-owner");
    const reporter = await seedUser("delete-profile-reporter");
    const token = await seedSession(owner.id, "delete-profile-image-token");
    const reporterToken = await seedSession(
      reporter.id,
      "delete-profile-reporter-token",
    );
    const ticket = await createTicket(token, FIRST_PNG, 50, 50);
    expect((await uploadImage(ticket, FIRST_PNG)).status).toBe(201);

    const report = await SELF.fetch(`${ORIGIN}/api/reports`, {
      body: JSON.stringify({
        details: "Account erasure must explicitly release this evidence hold.",
        reason: "other",
        targetId: owner.id,
        targetType: "user",
      }),
      headers: sessionHeaders(reporterToken),
      method: "POST",
    });
    expect(report.status).toBe(201);
    const reportId = ((await report.json()) as { data: { id: string } }).data
      .id;

    const imageUrl = `/api/users/${owner.id}/avatar/${ticket.uploadId}`;
    const objectKey = `private/users/${owner.id}/avatar/${ticket.uploadId}/avatar.webp`;
    expect((await SELF.fetch(`${ORIGIN}${imageUrl}`)).status).toBe(200);
    expect(await env.PROJECTS.get(objectKey)).not.toBeNull();

    const deletion = await fetchAndDrain(
      new Request(`${ORIGIN}/api/me`, {
        body: JSON.stringify({}),
        headers: sessionHeaders(token),
        method: "DELETE",
      }),
    );
    expect(deletion.status).toBe(202);
    expect((await SELF.fetch(`${ORIGIN}${imageUrl}`)).status).toBe(404);
    await expect(
      env.DB.prepare("SELECT status FROM users WHERE id = ?")
        .bind(owner.id)
        .first(),
    ).resolves.toMatchObject({ status: "deletion_pending" });

    const now = Date.now();
    await env.DB.prepare("UPDATE users SET deletion_due_at = ? WHERE id = ?")
      .bind(now - 1, owner.id)
      .run();
    const controller = createScheduledController({
      cron: "0 * * * *",
      scheduledTime: now,
    });
    const execution = createExecutionContext();
    worker.scheduled(controller, env, execution);
    await waitOnExecutionContext(execution);

    expect(await env.PROJECTS.get(objectKey)).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 AS found FROM users WHERE id = ?")
        .bind(owner.id)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 AS found FROM profile_images WHERE id = ?")
        .bind(ticket.uploadId)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT 1 AS found FROM profile_image_objects WHERE image_id = ?",
      )
        .bind(ticket.uploadId)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT 1 AS found FROM profile_image_report_evidence WHERE report_id = ?",
      )
        .bind(reportId)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT status FROM reports WHERE id = ?")
        .bind(reportId)
        .first(),
    ).toEqual({ status: "open" });
  });

  it("does not touch R2 when account-deletion cancellation wins after candidate selection", async () => {
    const owner = await seedUser("cancel-race-owner");
    const token = await seedSession(owner.id, "cancel-race-profile-token");
    const ticket = await createTicket(token, FIRST_PNG, 50, 50);
    expect((await uploadImage(ticket, FIRST_PNG)).status).toBe(201);
    const objectKey = `private/users/${owner.id}/avatar/${ticket.uploadId}/avatar.webp`;
    const now = Date.now();
    await env.DB.prepare(
      `UPDATE users SET status = 'deletion_pending', deletion_requested_at = ?,
       deletion_due_at = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(now - 7 * 24 * 60 * 60 * 1_000, now - 1, now - 2, owner.id)
      .run();

    // This is the scheduler's stale page: the account was due when selected.
    await expect(
      env.DB.prepare(
        `SELECT id FROM users
         WHERE id = ? AND status = 'deletion_pending' AND deletion_due_at <= ?`,
      )
        .bind(owner.id, now)
        .first(),
    ).resolves.toEqual({ id: owner.id });

    // Cancellation commits before the per-item claim. The guarded claim must
    // lose without listing or deleting any account objects.
    await env.DB.prepare(
      `UPDATE users SET status = 'active', deletion_previous_status = NULL,
       deletion_requested_at = NULL, deletion_due_at = NULL,
       updated_at = ? WHERE id = ? AND status = 'deletion_pending'`,
    )
      .bind(now, owner.id)
      .run();
    await expect(
      cleanupDueAccount(env, owner.id, now + 1, now - 60 * 60 * 1_000),
    ).resolves.toBe(false);
    expect(await env.PROJECTS.get(objectKey)).not.toBeNull();
    await expect(
      env.DB.prepare("SELECT status, avatar_image_id FROM users WHERE id = ?")
        .bind(owner.id)
        .first(),
    ).resolves.toEqual({
      avatar_image_id: ticket.uploadId,
      status: "active",
    });
  });

  it("keeps an active onboarded public avatar available across a Terms version bump", async () => {
    const owner = await seedUser("stale-terms-avatar");
    const token = await seedSession(owner.id, "stale-terms-avatar-token");
    const ticket = await createTicket(token, FIRST_PNG, 50, 50);
    expect((await uploadImage(ticket, FIRST_PNG)).status).toBe(201);
    const imageUrl = `/api/users/${owner.id}/avatar/${ticket.uploadId}`;

    await env.DB.prepare(
      "UPDATE users SET terms_version = '2026-07-13' WHERE id = ?",
    )
      .bind(owner.id)
      .run();

    const account = await SELF.fetch(`${ORIGIN}/api/me`, {
      headers: sessionHeaders(token, false),
    });
    expect(account.status).toBe(200);
    await expect(account.json()).resolves.toMatchObject({
      data: { avatarUrl: imageUrl, termsAccepted: false },
    });

    const profile = await SELF.fetch(
      `${ORIGIN}/api/users/${encodeURIComponent("stale-terms-avatar")}`,
    );
    expect(profile.status).toBe(200);
    await expect(profile.json()).resolves.toMatchObject({
      data: { user: { avatarUrl: imageUrl, id: owner.id } },
    });

    const media = await SELF.fetch(`${ORIGIN}${imageUrl}`);
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toBe("image/webp");
  });

  it("preserves report-time avatar evidence across owner replacement and removal", async () => {
    const owner = await seedUser("evidence-avatar-owner");
    const reporter = await seedUser("evidence-reporter");
    const moderator = await seedUser("evidence-moderator", "moderator");
    const ownerToken = await seedSession(owner.id, "evidence-owner-token");
    const reporterToken = await seedSession(
      reporter.id,
      "evidence-reporter-token",
    );
    const moderatorToken = await seedSession(
      moderator.id,
      "evidence-moderator-token",
    );

    const firstTicket = await createTicket(ownerToken, FIRST_PNG, 30, 70);
    expect((await uploadImage(firstTicket, FIRST_PNG)).status).toBe(201);
    const firstUrl = `/api/users/${owner.id}/avatar/${firstTicket.uploadId}`;
    const firstPublic = await SELF.fetch(`${ORIGIN}${firstUrl}`);
    expect(firstPublic.status).toBe(200);
    const firstBytes = new Uint8Array(await firstPublic.arrayBuffer());

    const report = await SELF.fetch(`${ORIGIN}/api/reports`, {
      body: JSON.stringify({
        details: "Preserve the exact profile image shown with this report.",
        reason: "other",
        targetId: owner.id,
        targetType: "user",
      }),
      headers: sessionHeaders(reporterToken),
      method: "POST",
    });
    expect(report.status).toBe(201);
    const reportId = ((await report.json()) as { data: { id: string } }).data
      .id;

    const secondTicket = await createTicket(ownerToken, SECOND_PNG, 70, 30);
    expect((await uploadImageAndDrain(secondTicket, SECOND_PNG)).status).toBe(
      201,
    );
    const secondUrl = `/api/users/${owner.id}/avatar/${secondTicket.uploadId}`;
    expect((await SELF.fetch(`${ORIGIN}${firstUrl}`)).status).toBe(404);
    expect(
      await env.PROJECTS.get(
        `private/users/${owner.id}/avatar/${firstTicket.uploadId}/avatar.webp`,
      ),
    ).not.toBeNull();

    const staleEvidenceRemoval = await SELF.fetch(
      `${ORIGIN}/api/moderation/reports/${reportId}/remove-profile-image`,
      {
        body: JSON.stringify({
          action: "remove_profile_image",
          reason: "Remove only the image captured by this report.",
        }),
        headers: sessionHeaders(moderatorToken),
        method: "POST",
      },
    );
    expect(staleEvidenceRemoval.status).toBe(409);
    await expect(staleEvidenceRemoval.json()).resolves.toMatchObject({
      error: {
        code: "CONFLICT",
        message:
          "The reported profile image is no longer the user's current image.",
      },
    });
    expect((await SELF.fetch(`${ORIGIN}${secondUrl}`)).status).toBe(200);

    const removed = await fetchAndDrain(
      new Request(`${ORIGIN}/api/me/avatar`, {
        body: JSON.stringify({}),
        headers: sessionHeaders(ownerToken),
        method: "DELETE",
      }),
    );
    expect(removed.status).toBe(200);
    expect(
      await env.PROJECTS.get(
        `private/users/${owner.id}/avatar/${secondTicket.uploadId}/avatar.webp`,
      ),
    ).toBeNull();

    const ownerDenied = await SELF.fetch(
      `${ORIGIN}/api/moderation/reports/${reportId}/profile-image`,
      { headers: sessionHeaders(ownerToken, false) },
    );
    expect(ownerDenied.status).toBe(403);

    const evidence = await SELF.fetch(
      `${ORIGIN}/api/moderation/reports/${reportId}/profile-image`,
      { headers: sessionHeaders(moderatorToken, false) },
    );
    expect(evidence.status).toBe(200);
    expect(evidence.headers.get("cache-control")).toBe("private, no-store");
    expect(evidence.headers.get("content-type")).toBe("image/webp");
    expect(new Uint8Array(await evidence.arrayBuffer())).toEqual(firstBytes);
    await expect(
      env.DB.prepare(
        `SELECT image_id, user_id FROM profile_image_report_evidence
         WHERE report_id = ?`,
      )
        .bind(reportId)
        .first(),
    ).resolves.toEqual({
      image_id: firstTicket.uploadId,
      user_id: owner.id,
    });

    const resolved = await fetchAndDrain(
      new Request(`${ORIGIN}/api/moderation/reports/${reportId}/actions`, {
        body: JSON.stringify({
          action: "resolve_report",
          reason: "Evidence reviewed; release the private image hold.",
        }),
        headers: sessionHeaders(moderatorToken),
        method: "POST",
      }),
    );
    expect(resolved.status).toBe(200);
    expect(
      await env.PROJECTS.get(
        `private/users/${owner.id}/avatar/${firstTicket.uploadId}/avatar.webp`,
      ),
    ).toBeNull();
    await expect(
      env.DB.prepare(
        "SELECT 1 AS found FROM profile_image_report_evidence WHERE report_id = ?",
      )
        .bind(reportId)
        .first(),
    ).resolves.toBeNull();
  });

  it("audits moderator removal and cannot re-expose that image after user restoration", async () => {
    const owner = await seedUser("moderated-avatar-owner");
    const reporter = await seedUser("avatar-reporter");
    const moderator = await seedUser("avatar-removal-mod", "moderator");
    const ownerToken = await seedSession(owner.id, "moderated-owner-token");
    const reporterToken = await seedSession(
      reporter.id,
      "moderated-avatar-reporter-token",
    );
    const moderatorToken = await seedSession(
      moderator.id,
      "avatar-removal-moderator-token",
    );
    const moderatorHeaders = sessionHeaders(moderatorToken);
    const ticket = await createTicket(ownerToken, FIRST_PNG, 50, 50);
    expect((await uploadImage(ticket, FIRST_PNG)).status).toBe(201);
    const imageUrl = `/api/users/${owner.id}/avatar/${ticket.uploadId}`;
    const report = await SELF.fetch(`${ORIGIN}/api/reports`, {
      body: JSON.stringify({
        details: "Review this exact current profile image.",
        reason: "other",
        targetId: owner.id,
        targetType: "user",
      }),
      headers: sessionHeaders(reporterToken),
      method: "POST",
    });
    expect(report.status).toBe(201);
    const reportId = ((await report.json()) as { data: { id: string } }).data
      .id;

    const suspended = await SELF.fetch(
      `${ORIGIN}/api/moderation/users/${owner.id}/suspend`,
      {
        body: JSON.stringify({
          action: "suspend_user",
          reason: "Review the reported custom profile image.",
        }),
        headers: moderatorHeaders,
        method: "POST",
      },
    );
    expect(suspended.status).toBe(200);
    expect((await SELF.fetch(`${ORIGIN}${imageUrl}`)).status).toBe(404);

    const removal = await fetchAndDrain(
      new Request(
        `${ORIGIN}/api/moderation/reports/${reportId}/remove-profile-image`,
        {
          body: JSON.stringify({
            action: "remove_profile_image",
            reason: "Remove the reported custom profile image.",
          }),
          headers: moderatorHeaders,
          method: "POST",
        },
      ),
    );
    expect(removal.status).toBe(200);
    await expect(removal.json()).resolves.toMatchObject({
      data: {
        avatarUrl: null,
        id: owner.id,
        reportId,
        removedImageId: ticket.uploadId,
      },
      requestId: expect.any(String),
    });
    await expect(
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM moderation_actions
         WHERE target_type = 'user' AND target_id = ?
           AND action = 'remove_profile_image' AND report_id = ?`,
      )
        .bind(owner.id, reportId)
        .first(),
    ).resolves.toEqual({ count: 1 });

    const restored = await SELF.fetch(
      `${ORIGIN}/api/moderation/users/${owner.id}/restore`,
      {
        body: JSON.stringify({
          action: "restore_user",
          reason: "Account restoration after image removal.",
        }),
        headers: moderatorHeaders,
        method: "POST",
      },
    );
    expect(restored.status).toBe(200);
    expect((await SELF.fetch(`${ORIGIN}${imageUrl}`)).status).toBe(404);
    await expect(
      env.DB.prepare("SELECT avatar_image_id, status FROM users WHERE id = ?")
        .bind(owner.id)
        .first(),
    ).resolves.toEqual({ avatar_image_id: null, status: "active" });
    const profile = await SELF.fetch(
      `${ORIGIN}/api/users/${encodeURIComponent("moderated-avatar-owner")}`,
    );
    await expect(profile.json()).resolves.toMatchObject({
      data: { user: { avatarUrl: null, id: owner.id } },
    });
  });

  it("isolates one R2 cleanup failure and continues later scheduled maintenance", async () => {
    const owner = await seedUser("cleanup-isolation-owner");
    const first = await seedDeletingProfileImage(owner.id);
    const second = await seedDeletingProfileImage(owner.id);
    const now = Date.now();
    const expiredActionId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO moderation_actions
       (id, report_id, moderator_user_id, actor_pseudonym, target_type,
        target_id, action, reason, created_at, retain_until)
       VALUES (?, NULL, NULL, 'expired-audit', 'user', ?,
        'remove_profile_image', 'Expired cleanup fixture', ?, ?)`,
    )
      .bind(expiredActionId, owner.id, now - 2, now - 1)
      .run();

    const failingEnv = envWithFailingR2Delete(first.objectKey);
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      await runScheduledMaintenance(
        failingEnv,
        createScheduledController({
          cron: "0 * * * *",
          scheduledTime: now,
        }),
      );
      const logged = errorLog.mock.calls.flat().join("\n");
      expect(logged).toContain("scheduled_cleanup_item_failed");
      expect(logged).toContain("deleting_profile_image");
      expect(logged).not.toContain(first.imageId);
      expect(logged).not.toContain(first.objectKey);
      expect(logged).not.toContain(owner.id);
    } finally {
      errorLog.mockRestore();
    }

    expect(await env.PROJECTS.get(first.objectKey)).not.toBeNull();
    expect(await env.PROJECTS.get(second.objectKey)).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 AS found FROM profile_images WHERE id = ?")
        .bind(first.imageId)
        .first(),
    ).not.toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 AS found FROM profile_images WHERE id = ?")
        .bind(second.imageId)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT 1 AS found FROM moderation_actions WHERE id = ?",
      )
        .bind(expiredActionId)
        .first(),
    ).toBeNull();
  });
});

interface UploadTicket {
  uploadId: string;
  uploadToken: string;
  uploadUrl: string;
}

async function createTicket(
  token: string,
  bytes: Uint8Array,
  focusX: number,
  focusY: number,
): Promise<UploadTicket> {
  const response = await SELF.fetch(`${ORIGIN}/api/me/avatar/uploads`, {
    body: JSON.stringify(profileTicketInput(bytes, focusX, focusY)),
    headers: sessionHeaders(token),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: UploadTicket }).data;
}

function profileTicketInput(bytes: Uint8Array, focusX = 50, focusY = 50) {
  return {
    byteSize: bytes.byteLength,
    contentType: "image/png",
    focusX,
    focusY,
  };
}

function uploadImage(
  ticket: UploadTicket,
  bytes: Uint8Array,
  headers: Record<string, string> = {},
): Promise<Response> {
  return SELF.fetch(
    `${ORIGIN}${ticket.uploadUrl}`,
    rawUploadInit(ticket, bytes, headers),
  );
}

function uploadImageAndDrain(
  ticket: UploadTicket,
  bytes: Uint8Array,
): Promise<Response> {
  return fetchAndDrain(
    new Request(`${ORIGIN}${ticket.uploadUrl}`, rawUploadInit(ticket, bytes)),
  );
}

function rawUploadInit(
  ticket: UploadTicket,
  bytes: Uint8Array,
  headers: Record<string, string> = {},
): RequestInit {
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return {
    body: body.buffer,
    headers: {
      Authorization: `Bearer ${ticket.uploadToken}`,
      "Content-Type": "image/png",
      Origin: ORIGIN,
      ...headers,
    },
    method: "PUT",
  };
}

async function fetchAndDrain(
  request: Request,
  runtimeEnv: Env = env,
): Promise<Response> {
  const execution = createExecutionContext();
  const response = await worker.fetch(request, runtimeEnv, execution);
  await waitOnExecutionContext(execution);
  return response;
}

async function seedUser(username: string): Promise<{
  avatarSeed: string;
  id: string;
}>;
async function seedUser(
  username: string,
  role: "admin" | "moderator" | "user",
): Promise<{ avatarSeed: string; id: string }>;
async function seedUser(
  username: string,
  role: "admin" | "moderator" | "user" = "user",
): Promise<{ avatarSeed: string; id: string }> {
  const id = crypto.randomUUID();
  const avatarSeed = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users
       (id, username, display_name, bio, role, status, avatar_seed,
        terms_version, terms_accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, 'active', ?, '2026-07-16', ?, ?, ?)`,
    ).bind(id, username, username, role, avatarSeed, now, now, now),
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
  return { avatarSeed, id };
}

async function seedSession(userId: string, token: string): Promise<string> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO sessions
     (id, token_hash, user_id, ua_label, created_at, last_seen_at,
      last_authenticated_at, expires_at)
     VALUES (?, ?, ?, 'Profile image test', ?, ?, ?, ?)`,
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

function sessionHeaders(token: string, body = true): Record<string, string> {
  return {
    ...(body ? { "Content-Type": "application/json" } : {}),
    Cookie: `tomodachi.sid=${token}`,
    Origin: ORIGIN,
  };
}

async function expectFailedUploadReleased(uploadId: string): Promise<void> {
  await expect(
    env.DB.prepare(
      "SELECT status, upload_token_hash FROM profile_images WHERE id = ?",
    )
      .bind(uploadId)
      .first(),
  ).resolves.toMatchObject({ status: "failed", upload_token_hash: null });
  expect(
    await env.DB.prepare(
      "SELECT 1 AS found FROM quota_reservations WHERE id = ?",
    )
      .bind(uploadId)
      .first(),
  ).toBeNull();
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

async function seedDeletingProfileImage(
  userId: string,
): Promise<{ imageId: string; objectKey: string }> {
  const imageId = crypto.randomUUID();
  const objectKey = `private/users/${userId}/avatar/${imageId}/avatar.webp`;
  const now = Date.now();
  await env.PROJECTS.put(objectKey, new Uint8Array([1]), {
    httpMetadata: { contentType: "image/webp" },
  });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO profile_images
       (id, user_id, upload_token_hash, expected_content_type,
        expected_byte_size, focus_x, focus_y, status, expires_at,
        created_at, updated_at, deleted_at)
       VALUES (?, ?, NULL, 'image/png', 1, 50, 50, 'deleting', ?, ?, ?, ?)`,
    ).bind(imageId, userId, now + 60_000, now, now, now),
    env.DB.prepare(
      `INSERT INTO profile_image_objects
       (id, image_id, user_id, object_key, content_type, byte_size, sha256,
        status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'image/webp', 1, ?, 'deleting', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      imageId,
      userId,
      objectKey,
      "3".repeat(64),
      now,
      now,
    ),
  ]);
  return { imageId, objectKey };
}

function envWithFailingR2Delete(failingKey: string): Env {
  const projects = new Proxy(env.PROJECTS, {
    get(target, property, receiver) {
      if (property === "delete") {
        return async (keys: string | string[]) => {
          const requested = Array.isArray(keys) ? keys : [keys];
          if (requested.includes(failingKey)) {
            throw new Error("Injected R2 cleanup failure");
          }
          return target.delete(keys);
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new Proxy(env, {
    get(target, property, receiver) {
      if (property === "PROJECTS") return projects;
      return Reflect.get(target, property, receiver);
    },
  });
}

function envWithImagesInputFailure(): Env {
  const images = new Proxy(env.IMAGES, {
    get(target, property, receiver) {
      if (property === "input") {
        return () => {
          throw new Error("Injected Images transform failure");
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return envWithBinding("IMAGES", images);
}

function envWithR2PutFailure(): Env {
  const projects = new Proxy(env.PROJECTS, {
    get(target, property, receiver) {
      if (property === "put") {
        return async () => {
          throw new Error("Injected R2 put failure");
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return envWithBinding("PROJECTS", projects);
}

function envWithOneD1BatchFailure(): Env {
  let shouldFail = true;
  const database = new Proxy(env.DB, {
    get(target, property, receiver) {
      if (property === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          if (shouldFail) {
            shouldFail = false;
            throw new Error("Injected D1 commit failure");
          }
          return target.batch(statements);
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return envWithBinding("DB", database);
}

function envWithBinding(
  bindingName: "DB" | "IMAGES" | "PROJECTS",
  binding: D1Database | ImagesBinding | R2Bucket,
): Env {
  return new Proxy(env, {
    get(target, property, receiver) {
      if (property === bindingName) return binding;
      return Reflect.get(target, property, receiver);
    },
  });
}

async function pngFixture(
  width: number,
  height: number,
  color: readonly [number, number, number, number],
): Promise<Uint8Array> {
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      raw.set(color, offset);
    }
  }
  const compressed = new Uint8Array(
    await new Response(
      new Blob([raw.buffer])
        .stream()
        .pipeThrough(new CompressionStream("deflate")),
    ).arrayBuffer(),
  );
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
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
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
