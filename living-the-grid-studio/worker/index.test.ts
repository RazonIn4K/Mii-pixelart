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

describe("community Worker integration", () => {
  beforeEach(async () => {
    await env.DB.exec(`
      DELETE FROM moderation_actions;
      DELETE FROM reports;
      DELETE FROM follows;
      DELETE FROM comments;
      DELETE FROM likes;
      DELETE FROM creation_search;
      DELETE FROM creation_tags;
      DELETE FROM creation_objects;
      DELETE FROM creation_revisions;
      DELETE FROM creation_stats;
      DELETE FROM creations;
      DELETE FROM sessions;
      DELETE FROM external_identities;
      DELETE FROM users;
    `);
  });

  it("authenticates, saves immutable revisions, publishes, and serves discovery", async () => {
    const owner = await seedUser("islander");
    const session = await seedSession(owner.id, "owner-token");
    const headers = authenticatedHeaders(session);

    const auth = await SELF.fetch(`${ORIGIN}/api/auth/session`, { headers });
    expect(auth.status).toBe(200);
    await expect(auth.json()).resolves.toMatchObject({
      data: { user: { id: owner.id, username: "islander" } },
    });

    const created = await SELF.fetch(`${ORIGIN}/api/creations`, {
      body: JSON.stringify({ project: project("First project"), title: "First project" }),
      headers,
      method: "POST",
    });
    expect(created.status).toBe(201);
    expect(created.headers.get("etag")).toBe('"rev-1"');
    const createdBody = await created.json() as { data: { id: string; slug: string } };

    const owned = await SELF.fetch(`${ORIGIN}/api/creations/${createdBody.data.id}`, { headers });
    expect(owned.status).toBe(200);
    await expect(owned.json()).resolves.toMatchObject({
      data: {
        creation: {
          id: createdBody.data.id,
          revision: 1,
          state: "draft",
        },
        project: { meta: { name: "First project" }, version: 1 },
      },
    });

    const projectDownload = await SELF.fetch(
      `${ORIGIN}/api/creations/${createdBody.data.id}/project`,
      { headers },
    );
    expect(projectDownload.status).toBe(200);
    expect(projectDownload.headers.get("etag")).toBe('"rev-1"');
    await expect(projectDownload.json()).resolves.toMatchObject({
      meta: { name: "First project" },
      version: 1,
    });

    const conflict = await SELF.fetch(`${ORIGIN}/api/creations/${createdBody.data.id}/project`, {
      body: JSON.stringify({ project: project("Conflicting project") }),
      headers: { ...headers, "If-Match": '"rev-0"' },
      method: "PUT",
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ error: { code: "REVISION_CONFLICT" } });

    const saved = await SELF.fetch(`${ORIGIN}/api/creations/${createdBody.data.id}/project`, {
      body: JSON.stringify({ project: project("Second revision") }),
      headers: { ...headers, "If-Match": '"rev-1"' },
      method: "PUT",
    });
    expect(saved.status).toBe(200);
    expect(saved.headers.get("etag")).toBe('"rev-2"');
    await expect(saved.json()).resolves.toMatchObject({
      data: { id: createdBody.data.id, revision: 2, state: "draft" },
    });

    const published = await SELF.fetch(`${ORIGIN}/api/creations/${createdBody.data.id}/publish`, {
      body: JSON.stringify({
        commentsEnabled: true,
        description: "A public test project.",
        projectDownloadEnabled: false,
        tags: ["portraits"],
        title: "First project",
        visibility: "public",
      }),
      headers,
      method: "POST",
    });
    expect(published.status).toBe(200);
    await expect(published.json()).resolves.toMatchObject({
      data: {
        state: "published",
        tags: [{ slug: "portraits" }],
        visibility: "public",
      },
    });

    const publicDetail = await SELF.fetch(
      `${ORIGIN}/api/public/creations/${createdBody.data.slug}`,
    );
    expect(publicDetail.status).toBe(200);
    await expect(publicDetail.json()).resolves.toMatchObject({
      data: { id: createdBody.data.id, state: "published" },
    });

    const visitor = await seedUser("visitor-one");
    const visitorHeaders = authenticatedHeaders(await seedSession(visitor.id, "visitor-token"));
    const liked = await SELF.fetch(`${ORIGIN}/api/creations/${createdBody.data.id}/like`, {
      body: "{}",
      headers: visitorHeaders,
      method: "PUT",
    });
    expect(liked.status).toBe(200);
    const commented = await SELF.fetch(`${ORIGIN}/api/creations/${createdBody.data.id}/comments`, {
      body: JSON.stringify({ body: "A constructive comment." }),
      headers: visitorHeaders,
      method: "POST",
    });
    expect(commented.status).toBe(201);
    await expect(commented.json()).resolves.toMatchObject({
      data: { body: "A constructive comment.", creationId: createdBody.data.id },
    });
    const comments = await SELF.fetch(
      `${ORIGIN}/api/creations/${createdBody.data.id}/comments?limit=1`,
    );
    expect(comments.status).toBe(200);
    await expect(comments.json()).resolves.toMatchObject({
      data: [{ body: "A constructive comment." }],
      meta: { hasMore: false, limit: 1, nextCursor: null },
    });

    const discovered = await SELF.fetch(`${ORIGIN}/api/discover/recent?limit=5`, {
      headers: visitorHeaders,
    });
    expect(discovered.status).toBe(200);
    await expect(discovered.json()).resolves.toMatchObject({
      data: [{
        id: createdBody.data.id,
        likedByViewer: true,
        stats: { comments: 1, likes: 1 },
      }],
    });
  });

  it("enforces object authorization and comment defaults", async () => {
    const owner = await seedUser("owner-two");
    const stranger = await seedUser("stranger-two");
    const moderator = await seedUser("private-moderator", "moderator");
    const admin = await seedUser("private-admin", "admin");
    const ownerHeaders = authenticatedHeaders(await seedSession(owner.id, "owner-two-token"));
    const strangerHeaders = authenticatedHeaders(await seedSession(stranger.id, "stranger-token"));
    const moderatorHeaders = authenticatedHeaders(
      await seedSession(moderator.id, "private-moderator-token"),
    );
    const adminHeaders = authenticatedHeaders(await seedSession(admin.id, "private-admin-token"));
    const created = await SELF.fetch(`${ORIGIN}/api/creations`, {
      body: JSON.stringify({ project: project("Private") }),
      headers: ownerHeaders,
      method: "POST",
    });
    const body = await created.json() as { data: { id: string } };

    const forbidden = await SELF.fetch(`${ORIGIN}/api/creations/${body.data.id}`, {
      headers: strangerHeaders,
    });
    expect(forbidden.status).toBe(403);

    const privateComment = await SELF.fetch(`${ORIGIN}/api/creations/${body.data.id}/comments`, {
      body: JSON.stringify({ body: "Should not be accepted" }),
      headers: strangerHeaders,
      method: "POST",
    });
    expect(privateComment.status).toBe(404);

    for (const elevatedHeaders of [moderatorHeaders, adminHeaders]) {
      const [privateDetail, privateProject, privatePreview] = await Promise.all([
        SELF.fetch(`${ORIGIN}/api/creations/${body.data.id}`, { headers: elevatedHeaders }),
        SELF.fetch(`${ORIGIN}/api/creations/${body.data.id}/project`, {
          headers: elevatedHeaders,
        }),
        SELF.fetch(`${ORIGIN}/api/creations/${body.data.id}/media/preview`, {
          headers: elevatedHeaders,
        }),
      ]);
      expect(privateDetail.status).toBe(403);
      expect(privateProject.status).toBe(404);
      expect(privatePreview.status).toBe(404);
    }

    const published = await SELF.fetch(`${ORIGIN}/api/creations/${body.data.id}/publish`, {
      body: JSON.stringify({
        commentsEnabled: false,
        description: "Unlisted link-holder access",
        projectDownloadEnabled: true,
        tags: [],
        title: "Unlisted project",
        visibility: "unlisted",
      }),
      headers: ownerHeaders,
      method: "POST",
    });
    expect(published.status).toBe(200);
    const [unlistedProject, unlistedPreview] = await Promise.all([
      SELF.fetch(`${ORIGIN}/api/creations/${body.data.id}/project`),
      SELF.fetch(`${ORIGIN}/api/creations/${body.data.id}/media/preview`),
    ]);
    expect(unlistedProject.status).toBe(200);
    expect(unlistedPreview.status).toBe(200);
  });

  it("keeps author deletion separate from audited moderator comment actions", async () => {
    const owner = await seedUser("comment-owner");
    const moderator = await seedUser("comment-moderator", "moderator");
    const ownerHeaders = authenticatedHeaders(await seedSession(owner.id, "comment-owner-token"));
    const moderatorHeaders = authenticatedHeaders(
      await seedSession(moderator.id, "comment-moderator-token"),
    );
    const created = await SELF.fetch(`${ORIGIN}/api/creations`, {
      body: JSON.stringify({ project: project("Audited comment") }),
      headers: ownerHeaders,
      method: "POST",
    });
    const creation = (await created.json() as { data: { id: string } }).data;
    await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/publish`, {
      body: JSON.stringify({
        commentsEnabled: true,
        description: "Moderator action boundary",
        projectDownloadEnabled: false,
        tags: [],
        title: "Audited comment",
        visibility: "public",
      }),
      headers: ownerHeaders,
      method: "POST",
    });
    const createdComment = await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/comments`, {
      body: JSON.stringify({ body: "Keep moderation reversible and audited." }),
      headers: ownerHeaders,
      method: "POST",
    });
    const comment = (await createdComment.json() as { data: { id: string } }).data;

    const moderatorDelete = await SELF.fetch(`${ORIGIN}/api/comments/${comment.id}`, {
      body: "{}",
      headers: moderatorHeaders,
      method: "DELETE",
    });
    expect(moderatorDelete.status).toBe(403);

    const moderatorHide = await SELF.fetch(
      `${ORIGIN}/api/moderation/comments/${comment.id}/hide`,
      {
        body: JSON.stringify({ action: "hide_comment", reason: "Policy review" }),
        headers: moderatorHeaders,
        method: "POST",
      },
    );
    expect(moderatorHide.status).toBe(200);
    await expect(
      env.DB.prepare(
        "SELECT action FROM moderation_actions WHERE target_type = 'comment' AND target_id = ?",
      ).bind(comment.id).first<{ action: string }>(),
    ).resolves.toMatchObject({ action: "hide_comment" });
  });

  it("offers three database-checked username alternatives on collision", async () => {
    await seedUser("taken-name");
    const newcomer = await seedUnconfiguredUser();
    const headers = authenticatedHeaders(await seedSession(newcomer.id, "setup-token"));
    const response = await SELF.fetch(`${ORIGIN}/api/me/setup`, {
      body: JSON.stringify({
        acceptsTerms: true,
        confirmsAge13OrOlder: true,
        displayName: "New Islander",
        termsVersion: "2026-07-10",
        username: "taken-name",
      }),
      headers,
      method: "POST",
    });
    expect(response.status).toBe(409);
    const body = await response.json() as {
      error: { fields: { usernameSuggestions: string } };
    };
    const suggestions = body.error.fields.usernameSuggestions.split(",");
    expect(suggestions).toHaveLength(3);
    expect(suggestions).toEqual(["taken-name-2", "taken-name-3", "taken-name-4"]);
  });

  it("commits onboarding identity, terms, and bio atomically", async () => {
    const newcomer = await seedUnconfiguredUser();
    const headers = authenticatedHeaders(await seedSession(newcomer.id, "atomic-setup-token"));
    const response = await SELF.fetch(`${ORIGIN}/api/me/setup`, {
      body: JSON.stringify({
        acceptsTerms: true,
        bio: "Building tiny island portraits.",
        confirmsAge13OrOlder: true,
        displayName: "Atomic Islander",
        termsVersion: "2026-07-10",
        username: "atomic-islander",
      }),
      headers,
      method: "POST",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        bio: "Building tiny island portraits.",
        termsVersion: "2026-07-10",
        username: "atomic-islander",
      },
    });
    await expect(env.DB.prepare(
      "SELECT username, bio, terms_version FROM users WHERE id = ?",
    ).bind(newcomer.id).first()).resolves.toMatchObject({
      bio: "Building tiny island portraits.",
      terms_version: "2026-07-10",
      username: "atomic-islander",
    });
  });

  it("paginates full-text search with opaque cursors", async () => {
    const owner = await seedUser("search-owner");
    const headers = authenticatedHeaders(await seedSession(owner.id, "search-owner-token"));
    for (const title of ["Spark portrait", "Spark emblem"]) {
      const created = await SELF.fetch(`${ORIGIN}/api/creations`, {
        body: JSON.stringify({ project: project(title), title }),
        headers,
        method: "POST",
      });
      const creation = (await created.json() as { data: { id: string } }).data;
      const published = await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/publish`, {
        body: JSON.stringify({
          commentsEnabled: true,
          description: "A searchable spark design.",
          projectDownloadEnabled: false,
          tags: ["portraits"],
          title,
          visibility: "public",
        }),
        headers,
        method: "POST",
      });
      expect(published.status).toBe(200);
    }

    const first = await SELF.fetch(`${ORIGIN}/api/search?q=spark&limit=1`);
    expect(first.status).toBe(200);
    const firstBody = await first.json() as {
      data: { id: string }[];
      meta: { nextCursor: string | null };
    };
    expect(firstBody.data).toHaveLength(1);
    expect(firstBody.meta.nextCursor).toEqual(expect.any(String));
    const second = await SELF.fetch(
      `${ORIGIN}/api/search?q=spark&limit=1&cursor=${encodeURIComponent(firstBody.meta.nextCursor!)}`,
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json() as {
      data: { id: string }[];
      meta: { nextCursor: string | null };
    };
    expect(secondBody.data).toHaveLength(1);
    expect(secondBody.data[0].id).not.toBe(firstBody.data[0].id);
    expect(secondBody.meta.nextCursor).toBeNull();
  });

  it("lets suspended sessions reach account controls but blocks community mutations", async () => {
    const user = await seedUser("suspended-user");
    const token = await seedSession(user.id, "suspended-token");
    const headers = authenticatedHeaders(token);
    await env.DB.prepare("UPDATE users SET status = 'suspended' WHERE id = ?")
      .bind(user.id)
      .run();

    const session = await SELF.fetch(`${ORIGIN}/api/auth/session`, { headers });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toMatchObject({
      data: { user: { id: user.id, status: "suspended" } },
    });
    const blocked = await SELF.fetch(`${ORIGIN}/api/creations`, {
      body: JSON.stringify({ project: project("Blocked") }),
      headers,
      method: "POST",
    });
    expect(blocked.status).toBe(403);
    const logout = await SELF.fetch(`${ORIGIN}/api/auth/logout`, {
      body: "{}",
      headers,
      method: "POST",
    });
    expect(logout.status).toBe(200);
  });

  it("rejects malformed projects and preserves user text as plain JSON data", async () => {
    const owner = await seedUser("plain-text-owner");
    const headers = authenticatedHeaders(await seedSession(owner.id, "plain-text-token"));
    const malformed = project("Malformed");
    malformed.cells.pop();
    const rejected = await SELF.fetch(`${ORIGIN}/api/creations`, {
      body: JSON.stringify({ project: malformed }),
      headers,
      method: "POST",
    });
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });

    const title = "<script>alert('stored text')</script>";
    const description = "<img src=x onerror=alert(1)> stays text";
    const created = await SELF.fetch(`${ORIGIN}/api/creations`, {
      body: JSON.stringify({ project: project("Safe preview"), title }),
      headers,
      method: "POST",
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { data: { id: string; slug: string } };
    expect(createdBody.data.title).toBe(title);
    const published = await SELF.fetch(`${ORIGIN}/api/creations/${createdBody.data.id}/publish`, {
      body: JSON.stringify({
        commentsEnabled: true,
        description,
        projectDownloadEnabled: false,
        tags: [],
        title,
        visibility: "public",
      }),
      headers,
      method: "POST",
    });
    expect(published.headers.get("content-type")).toContain("application/json");
    await expect(published.json()).resolves.toMatchObject({ data: { description, title } });
  });

  it("enforces comment locks and moderation role hierarchy", async () => {
    const owner = await seedUser("lock-owner");
    const moderator = await seedUser("lock-moderator", "moderator");
    const peerModerator = await seedUser("peer-moderator", "moderator");
    const admin = await seedUser("lock-admin", "admin");
    const ownerHeaders = authenticatedHeaders(await seedSession(owner.id, "lock-owner-token"));
    const moderatorHeaders = authenticatedHeaders(await seedSession(moderator.id, "lock-mod-token"));
    const peerModeratorHeaders = authenticatedHeaders(
      await seedSession(peerModerator.id, "peer-mod-token"),
    );
    const adminHeaders = authenticatedHeaders(await seedSession(admin.id, "lock-admin-token"));

    const created = await SELF.fetch(`${ORIGIN}/api/creations`, {
      body: JSON.stringify({ project: project("Lockable") }),
      headers: ownerHeaders,
      method: "POST",
    });
    const creation = (await created.json() as { data: { id: string } }).data;
    await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/publish`, {
      body: JSON.stringify({
        commentsEnabled: true,
        description: "Lock test",
        projectDownloadEnabled: false,
        tags: [],
        title: "Lockable",
        visibility: "public",
      }),
      headers: ownerHeaders,
      method: "POST",
    });
    const reportResponse = await SELF.fetch(`${ORIGIN}/api/reports`, {
      body: JSON.stringify({
        details: "Please review the current target and its discussion controls.",
        reason: "other",
        targetId: creation.id,
        targetType: "creation",
      }),
      headers: ownerHeaders,
      method: "POST",
    });
    expect(reportResponse.status).toBe(201);
    const report = (await reportResponse.json() as { data: { id: string } }).data;

    const locked = await SELF.fetch(
      `${ORIGIN}/api/moderation/creations/${creation.id}/lock-comments`,
      {
        body: JSON.stringify({ action: "lock_comments", reason: "Active moderation review" }),
        headers: moderatorHeaders,
        method: "POST",
      },
    );
    expect(locked.status).toBe(200);
    await expect(locked.json()).resolves.toMatchObject({
      data: { commentsEnabled: false, commentsLocked: true },
    });
    const reportContext = await SELF.fetch(
      `${ORIGIN}/api/moderation/reports/${report.id}`,
      { headers: moderatorHeaders },
    );
    expect(reportContext.status).toBe(200);
    await expect(reportContext.json()).resolves.toMatchObject({
      data: {
        actions: [{ action: "lock_comments" }],
        report: { id: report.id, targetId: creation.id },
        target: { id: creation.id, label: "Lockable", state: "published", type: "creation" },
      },
    });

    const lockedComment = await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/comments`, {
      body: JSON.stringify({ body: "This should stay locked." }),
      headers: ownerHeaders,
      method: "POST",
    });
    expect(lockedComment.status).toBe(409);
    await expect(lockedComment.json()).resolves.toMatchObject({
      error: { code: "CONFLICT" },
    });

    const ownerBypass = await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}`, {
      body: JSON.stringify({ commentsEnabled: true }),
      headers: ownerHeaders,
      method: "PATCH",
    });
    expect(ownerBypass.status).toBe(409);

    const hierarchyDenied = await SELF.fetch(
      `${ORIGIN}/api/moderation/users/${peerModerator.id}/suspend`,
      {
        body: JSON.stringify({ action: "suspend_user", reason: "Hierarchy test" }),
        headers: moderatorHeaders,
        method: "POST",
      },
    );
    expect(hierarchyDenied.status).toBe(403);

    const adminAllowed = await SELF.fetch(
      `${ORIGIN}/api/moderation/users/${peerModerator.id}/suspend`,
      {
        body: JSON.stringify({ action: "suspend_user", reason: "Admin hierarchy test" }),
        headers: adminHeaders,
        method: "POST",
      },
    );
    expect(adminAllowed.status).toBe(200);
    const revokedPeerSession = await SELF.fetch(`${ORIGIN}/api/auth/session`, {
      headers: peerModeratorHeaders,
    });
    await expect(revokedPeerSession.json()).resolves.toMatchObject({
      data: { session: null, user: null },
    });

    const selfDenied = await SELF.fetch(`${ORIGIN}/api/moderation/users/${admin.id}/suspend`, {
      body: JSON.stringify({ action: "suspend_user", reason: "Self test" }),
      headers: adminHeaders,
      method: "POST",
    });
    expect(selfDenied.status).toBe(400);
  });

  it("runs scheduled cleanup, retention purge, and derived-stat healing", async () => {
    const now = Date.now();
    const owner = await seedUser("scheduled-owner");
    const visitor = await seedUser("scheduled-visitor");
    const expiredToken = "expired-session-token";
    await env.DB.prepare(
      `INSERT INTO sessions
       (id, token_hash, user_id, ua_label, created_at, last_seen_at,
        last_authenticated_at, expires_at)
       VALUES (?, ?, ?, 'Expired browser', ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      await sha256(`${SESSION_PEPPER}:${expiredToken}`),
      owner.id,
      now - 2 * 60 * 60 * 1_000,
      now - 2 * 60 * 60 * 1_000,
      now - 2 * 60 * 60 * 1_000,
      now - 60 * 60 * 1_000,
    ).run();

    const creationId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO creations
         (id, owner_user_id, slug, title, description, state, visibility,
          comments_enabled, project_download_enabled, bytes_total, created_at, updated_at)
         VALUES (?, ?, 'stale-upload-00001', 'Scheduled', '', 'draft', 'private', 0, 0, 0, ?, ?)`,
      ).bind(creationId, owner.id, now - 2 * 60 * 60 * 1_000, now),
      env.DB.prepare(
        `INSERT INTO creation_revisions
         (id, creation_id, revision_number, status, project_bytes, created_at)
         VALUES (?, ?, 1, 'uploading', 2, ?)`,
      ).bind(revisionId, creationId, now - 2 * 60 * 60 * 1_000),
      env.DB.prepare(
        `INSERT INTO creation_stats
         (creation_id, like_count, comment_count, popularity_score, updated_at)
         VALUES (?, 0, 0, 0, ?)`,
      ).bind(creationId, now),
      env.DB.prepare("INSERT INTO likes (user_id, creation_id, created_at) VALUES (?, ?, ?)")
        .bind(visitor.id, creationId, now),
      env.DB.prepare(
        `INSERT INTO comments
         (id, creation_id, author_user_id, body, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Count me', 'active', ?, ?)`,
      ).bind(crypto.randomUUID(), creationId, visitor.id, now, now),
    ]);
    const staleKey = `private/creations/${creationId}/${revisionId}/project.json`;
    await env.PROJECTS.put(staleKey, "{}");

    const resolvedReportId = crypto.randomUUID();
    const openReportId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO reports
         (id, reporter_user_id, reporter_pseudonym, target_type, target_id, reason,
          details, status, resolution_note, created_at, updated_at, resolved_at,
          free_text_purge_at, retain_until)
         VALUES (?, ?, 'resolved-pseudo', 'user', ?, 'spam', 'purge details',
          'resolved', 'purge resolution', ?, ?, ?, ?, ?)`,
      ).bind(resolvedReportId, visitor.id, owner.id, now, now, now, now - 1, now + 10_000),
      env.DB.prepare(
        `INSERT INTO reports
         (id, reporter_user_id, reporter_pseudonym, target_type, target_id, reason,
          details, status, created_at, updated_at, retain_until)
         VALUES (?, ?, 'open-pseudo', 'user', ?, 'other', '', 'open', ?, ?, ?)`,
      ).bind(openReportId, owner.id, visitor.id, now, now, now - 1),
    ]);

    const controller = createScheduledController({
      cron: "0 * * * *",
      scheduledTime: now,
    });
    const execution = createExecutionContext();
    worker.scheduled(controller, env, execution);
    await waitOnExecutionContext(execution);

    expect(await env.PROJECTS.get(staleKey)).toBeNull();
    await expect(env.DB.prepare("SELECT status FROM creation_revisions WHERE id = ?")
      .bind(revisionId).first()).resolves.toMatchObject({ status: "failed" });
    expect(await env.DB.prepare("SELECT 1 AS found FROM sessions WHERE token_hash = ?")
      .bind(await sha256(`${SESSION_PEPPER}:${expiredToken}`)).first()).toBeNull();
    await expect(env.DB.prepare(
      "SELECT like_count, comment_count FROM creation_stats WHERE creation_id = ?",
    ).bind(creationId).first()).resolves.toMatchObject({ comment_count: 1, like_count: 1 });
    await expect(env.DB.prepare(
      "SELECT details, resolution_note FROM reports WHERE id = ?",
    ).bind(resolvedReportId).first()).resolves.toMatchObject({ details: "", resolution_note: null });
    expect(await env.DB.prepare("SELECT 1 AS found FROM reports WHERE id = ?")
      .bind(openReportId).first()).not.toBeNull();
  });
});

async function seedUser(
  username: string,
  role: "admin" | "moderator" | "user" = "user",
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users
     (id, username, display_name, bio, role, status, avatar_seed,
      terms_version, terms_accepted_at, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, 'active', ?, '2026-07-10', ?, ?, ?)`,
  ).bind(id, username, username, role, id, now, now, now).run();
  await env.DB.prepare(
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
  ).run();
  return { id };
}

async function seedSession(userId: string, token: string): Promise<string> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO sessions
     (id, token_hash, user_id, ua_label, created_at, last_seen_at,
      last_authenticated_at, expires_at)
     VALUES (?, ?, ?, 'Test browser', ?, ?, ?, ?)`,
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

async function seedUnconfiguredUser(): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users
       (id, username, display_name, bio, role, status, avatar_seed, created_at, updated_at)
       VALUES (?, NULL, 'New Islander', '', 'user', 'active', ?, ?, ?)`,
    ).bind(id, id, now, now),
    env.DB.prepare(
      `INSERT INTO external_identities
       (id, user_id, provider, provider_subject, email, email_verified, created_at, updated_at)
       VALUES (?, ?, 'google', ?, ?, 1, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      id,
      `subject-${id}`,
      `new-${id}@example.test`,
      now,
      now,
    ),
  ]);
  return { id };
}

function authenticatedHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Cookie: `tomodachi.sid=${token}`,
    Origin: ORIGIN,
  };
}

function project(name: string) {
  const timestamp = "2026-07-10T12:00:00.000Z";
  return {
    cells: Array.from({ length: 64 }, (_, index) => index === 0 ? "R1C1" : null),
    height: 8,
    lockedColors: [],
    meta: { createdAt: timestamp, modifiedAt: timestamp, name },
    usedColors: ["R1C1"],
    version: 1,
    width: 8,
  };
}
