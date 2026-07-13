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
    const mediaProjectDownload = await SELF.fetch(
      `${ORIGIN}/api/creations/${createdBody.data.id}/media/project`,
      { headers },
    );
    expect(mediaProjectDownload.status).toBe(200);
    expect(mediaProjectDownload.headers.get("etag")).toBe('"rev-1"');
    await expect(mediaProjectDownload.json()).resolves.toMatchObject({
      meta: { name: "First project" },
      version: 1,
    });

    const conflict = await SELF.fetch(`${ORIGIN}/api/creations/${createdBody.data.id}/project`, {
      body: JSON.stringify({ project: project("Conflicting project") }),
      headers: { ...headers, "If-Match": '"rev-0"' },
      method: "PUT",
    });
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: {
        code: "REVISION_CONFLICT",
        currentEtag: '"rev-1"',
        currentRevision: 1,
      },
    });

    const competingRevisionId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO creation_revisions
       (id, creation_id, revision_number, status, project_bytes, created_at)
       VALUES (?, ?, 2, 'uploading', 0, ?)`,
    ).bind(competingRevisionId, createdBody.data.id, Date.now()).run();
    const raceConflict = await SELF.fetch(
      `${ORIGIN}/api/creations/${createdBody.data.id}/project`,
      {
        body: JSON.stringify({ project: project("Racing project") }),
        headers: { ...headers, "If-Match": '"rev-1"' },
        method: "PUT",
      },
    );
    expect(raceConflict.status).toBe(409);
    await expect(raceConflict.json()).resolves.toMatchObject({
      error: {
        code: "REVISION_CONFLICT",
        currentEtag: '"rev-1"',
        currentRevision: 1,
      },
    });
    await env.DB.prepare(
      "UPDATE creation_revisions SET status = 'failed' WHERE id = ? AND status = 'uploading'",
    ).bind(competingRevisionId).run();

    const saved = await SELF.fetch(`${ORIGIN}/api/creations/${createdBody.data.id}/project`, {
      body: JSON.stringify({ project: project("Second revision") }),
      headers: { ...headers, "If-Match": '"rev-1"' },
      method: "PUT",
    });
    expect(saved.status).toBe(200);
    expect(saved.headers.get("etag")).toBe('"rev-3"');
    await expect(saved.json()).resolves.toMatchObject({
      data: { id: createdBody.data.id, revision: 3, state: "draft" },
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
      data: { canEdit: false, id: createdBody.data.id, state: "published" },
    });

    const ownerPublicDetail = await SELF.fetch(
      `${ORIGIN}/api/public/creations/${createdBody.data.slug}`,
      { headers },
    );
    expect(ownerPublicDetail.status).toBe(200);
    await expect(ownerPublicDetail.json()).resolves.toMatchObject({
      data: { canEdit: true, id: createdBody.data.id },
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

    const random = await SELF.fetch(`${ORIGIN}/api/discover/random`, {
      headers: visitorHeaders,
    });
    expect(random.status).toBe(200);
    await expect(random.json()).resolves.toMatchObject({
      data: {
        id: createdBody.data.id,
        likedByViewer: true,
        visibility: "public",
      },
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

    const random = await SELF.fetch(`${ORIGIN}/api/discover/random`);
    expect(random.status).toBe(200);
    await expect(random.json()).resolves.toMatchObject({ data: null });
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
    await seedUser("taken-name-2");
    await seedUser("taken-name-3");
    const newcomer = await seedUnconfiguredUser();
    const headers = authenticatedHeaders(await seedSession(newcomer.id, "setup-token"));
    const response = await SELF.fetch(`${ORIGIN}/api/me/setup`, {
      body: JSON.stringify({
        acceptsTerms: true,
        confirmsAge13OrOlder: true,
        displayName: "New Islander",
        termsVersion: "2026-07-13",
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
    expect(suggestions).toEqual(["taken-name-4", "taken-name-5", "taken-name-6"]);
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
        termsVersion: "2026-07-13",
        username: "atomic-islander",
      }),
      headers,
      method: "POST",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        bio: "Building tiny island portraits.",
        termsVersion: "2026-07-13",
        username: "atomic-islander",
      },
    });
    await expect(env.DB.prepare(
      "SELECT username, bio, terms_version FROM users WHERE id = ?",
    ).bind(newcomer.id).first()).resolves.toMatchObject({
      bio: "Building tiny island portraits.",
      terms_version: "2026-07-13",
      username: "atomic-islander",
    });
  });

  it("lets an existing username accept a newer Terms version without changing identity", async () => {
    const returning = await seedUser("returning-islander");
    await env.DB.prepare(
      "UPDATE users SET terms_version = '2026-07-10' WHERE id = ?",
    ).bind(returning.id).run();
    const headers = authenticatedHeaders(
      await seedSession(returning.id, "returning-terms-token"),
    );

    const session = await SELF.fetch(`${ORIGIN}/api/auth/session`, { headers });
    await expect(session.json()).resolves.toMatchObject({
      data: { user: { termsAccepted: false, username: "returning-islander" } },
    });

    const changedUsername = await SELF.fetch(`${ORIGIN}/api/me/setup`, {
      body: JSON.stringify({
        acceptsTerms: true,
        confirmsAge13OrOlder: true,
        displayName: "Returning Islander",
        termsVersion: "2026-07-13",
        username: "different-islander",
      }),
      headers,
      method: "POST",
    });
    expect(changedUsername.status).toBe(409);

    const accepted = await SELF.fetch(`${ORIGIN}/api/me/setup`, {
      body: JSON.stringify({
        acceptsTerms: true,
        bio: "Still making tiny portraits.",
        confirmsAge13OrOlder: true,
        displayName: "Returning Islander",
        termsVersion: "2026-07-13",
        username: "returning-islander",
      }),
      headers,
      method: "POST",
    });
    expect(accepted.status).toBe(200);
    await expect(
      env.DB.prepare("SELECT username, terms_version FROM users WHERE id = ?")
        .bind(returning.id)
        .first(),
    ).resolves.toMatchObject({
      terms_version: "2026-07-13",
      username: "returning-islander",
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

    const tagged = await SELF.fetch(
      `${ORIGIN}/api/search?q=spark&tag=portraits&limit=10`,
    );
    expect(tagged.status).toBe(200);
    const taggedBody = await tagged.json() as { data: { id: string }[] };
    expect(taggedBody.data).toHaveLength(2);

    const wrongTag = await SELF.fetch(`${ORIGIN}/api/search?q=spark&tag=icons&limit=10`);
    expect(wrongTag.status).toBe(200);
    await expect(wrongTag.json()).resolves.toMatchObject({ data: [] });
  });

  it("removes public search rows during deletion and keeps them absent after cancellation", async () => {
    const owner = await seedUser("deletion-search-owner");
    const headers = authenticatedHeaders(await seedSession(owner.id, "deletion-search-token"));
    const created = await SELF.fetch(`${ORIGIN}/api/creations`, {
      body: JSON.stringify({
        project: project("Deletion search project"),
        title: "Deletion search project",
      }),
      headers,
      method: "POST",
    });
    expect(created.status).toBe(201);
    const creation = (await created.json() as { data: { id: string } }).data;
    const published = await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/publish`, {
      body: JSON.stringify({
        commentsEnabled: true,
        description: "Public text that must leave the search index.",
        projectDownloadEnabled: false,
        tags: ["portraits"],
        title: "Deletion search project",
        visibility: "public",
      }),
      headers,
      method: "POST",
    });
    expect(published.status).toBe(200);
    await expect(env.DB.prepare(
      "SELECT creation_id FROM creation_search WHERE creation_id = ?",
    ).bind(creation.id).first()).resolves.toEqual({ creation_id: creation.id });

    const deletion = await SELF.fetch(`${ORIGIN}/api/me`, {
      body: "{}",
      headers,
      method: "DELETE",
    });
    expect(deletion.status).toBe(202);
    await expect(env.DB.prepare(
      "SELECT creation_id FROM creation_search WHERE creation_id = ?",
    ).bind(creation.id).first()).resolves.toBeNull();
    await expect(env.DB.prepare(
      "SELECT state, visibility FROM creations WHERE id = ?",
    ).bind(creation.id).first()).resolves.toEqual({
      state: "draft",
      visibility: "private",
    });

    const cancellationHeaders = authenticatedHeaders(
      await seedSession(owner.id, "deletion-cancel-token"),
    );
    const cancellation = await SELF.fetch(`${ORIGIN}/api/me/deletion/cancel`, {
      body: "{}",
      headers: cancellationHeaders,
      method: "POST",
    });
    expect(cancellation.status).toBe(200);
    await expect(cancellation.json()).resolves.toMatchObject({
      data: { id: owner.id, status: "active" },
    });
    await expect(env.DB.prepare(
      "SELECT creation_id FROM creation_search WHERE creation_id = ?",
    ).bind(creation.id).first()).resolves.toBeNull();
    const search = await SELF.fetch(`${ORIGIN}/api/search?q=deletion&limit=10`);
    expect(search.status).toBe(200);
    await expect(search.json()).resolves.toMatchObject({ data: [] });
  });

  it("keeps moderator-hidden creations under moderator-only restore authority", async () => {
    const owner = await seedUser("moderation-hold-owner");
    const moderator = await seedUser("moderation-hold-mod", "moderator");
    const ownerHeaders = authenticatedHeaders(
      await seedSession(owner.id, "moderation-hold-owner-token"),
    );
    const moderatorHeaders = authenticatedHeaders(
      await seedSession(moderator.id, "moderation-hold-moderator-token"),
    );
    const created = await SELF.fetch(`${ORIGIN}/api/creations`, {
      body: JSON.stringify({ project: project("Moderation hold") }),
      headers: ownerHeaders,
      method: "POST",
    });
    expect(created.status).toBe(201);
    const creation = (await created.json() as { data: { id: string } }).data;
    const publishBody = JSON.stringify({
      commentsEnabled: true,
      description: "A creation placed under a moderation hold.",
      projectDownloadEnabled: false,
      tags: [],
      title: "Moderation hold",
      visibility: "public",
    });
    const published = await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/publish`, {
      body: publishBody,
      headers: ownerHeaders,
      method: "POST",
    });
    expect(published.status).toBe(200);

    const hidden = await SELF.fetch(
      `${ORIGIN}/api/moderation/creations/${creation.id}/hide`,
      {
        body: JSON.stringify({ action: "hide_creation", reason: "Focused safety review" }),
        headers: moderatorHeaders,
        method: "POST",
      },
    );
    expect(hidden.status).toBe(200);

    for (const action of [
      { body: publishBody, path: "publish" },
      { body: "{}", path: "unpublish" },
    ]) {
      const bypass = await SELF.fetch(
        `${ORIGIN}/api/creations/${creation.id}/${action.path}`,
        { body: action.body, headers: ownerHeaders, method: "POST" },
      );
      expect(bypass.status).toBe(409);
      await expect(bypass.json()).resolves.toMatchObject({
        error: {
          code: "CONFLICT",
          message: "A moderator must restore this creation before it can be published again.",
        },
      });
    }
    await expect(
      env.DB.prepare("SELECT state, visibility FROM creations WHERE id = ?")
        .bind(creation.id)
        .first(),
    ).resolves.toEqual({ state: "hidden", visibility: "private" });

    const restored = await SELF.fetch(
      `${ORIGIN}/api/moderation/creations/${creation.id}/restore`,
      {
        body: JSON.stringify({ action: "restore_creation", reason: "Review complete" }),
        headers: moderatorHeaders,
        method: "POST",
      },
    );
    expect(restored.status).toBe(200);
    const republished = await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/publish`, {
      body: publishBody,
      headers: ownerHeaders,
      method: "POST",
    });
    expect(republished.status).toBe(200);
  });

  it("restores a canceled deletion to suspension without clearing hidden creations", async () => {
    const owner = await seedUser("suspended-deletion-owner");
    const moderator = await seedUser("suspension-mod", "moderator");
    const ownerHeaders = authenticatedHeaders(
      await seedSession(owner.id, "suspended-deletion-owner-token"),
    );
    const moderatorHeaders = authenticatedHeaders(
      await seedSession(moderator.id, "suspended-deletion-moderator-token"),
    );
    const created = await SELF.fetch(`${ORIGIN}/api/creations`, {
      body: JSON.stringify({ project: project("Suspended deletion") }),
      headers: ownerHeaders,
      method: "POST",
    });
    expect(created.status).toBe(201);
    const creation = (await created.json() as { data: { id: string } }).data;
    const published = await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/publish`, {
      body: JSON.stringify({
        commentsEnabled: true,
        description: "Must remain hidden after deletion cancellation.",
        projectDownloadEnabled: false,
        tags: [],
        title: "Suspended deletion",
        visibility: "public",
      }),
      headers: ownerHeaders,
      method: "POST",
    });
    expect(published.status).toBe(200);
    const suspended = await SELF.fetch(
      `${ORIGIN}/api/moderation/users/${owner.id}/suspend`,
      {
        body: JSON.stringify({ action: "suspend_user", reason: "Safety suspension" }),
        headers: moderatorHeaders,
        method: "POST",
      },
    );
    expect(suspended.status).toBe(200);

    const deletionHeaders = authenticatedHeaders(
      await seedSession(owner.id, "suspended-deletion-reauth-token"),
    );
    const deletion = await SELF.fetch(`${ORIGIN}/api/me`, {
      body: "{}",
      headers: deletionHeaders,
      method: "DELETE",
    });
    expect(deletion.status).toBe(202);
    await expect(
      env.DB.prepare(
        "SELECT status, deletion_previous_status FROM users WHERE id = ?",
      ).bind(owner.id).first(),
    ).resolves.toEqual({
      deletion_previous_status: "suspended",
      status: "deletion_pending",
    });
    await expect(
      env.DB.prepare("SELECT state, visibility FROM creations WHERE id = ?")
        .bind(creation.id)
        .first(),
    ).resolves.toEqual({ state: "hidden", visibility: "private" });

    const cancellationHeaders = authenticatedHeaders(
      await seedSession(owner.id, "suspended-deletion-cancel-token"),
    );
    const cancellation = await SELF.fetch(`${ORIGIN}/api/me/deletion/cancel`, {
      body: "{}",
      headers: cancellationHeaders,
      method: "POST",
    });
    expect(cancellation.status).toBe(200);
    await expect(cancellation.json()).resolves.toMatchObject({
      data: { id: owner.id, status: "suspended" },
    });
    await expect(
      env.DB.prepare(
        "SELECT status, deletion_previous_status FROM users WHERE id = ?",
      ).bind(owner.id).first(),
    ).resolves.toEqual({ deletion_previous_status: null, status: "suspended" });
    await expect(
      env.DB.prepare("SELECT state, visibility FROM creations WHERE id = ?")
        .bind(creation.id)
        .first(),
    ).resolves.toEqual({ state: "hidden", visibility: "private" });

    const blocked = await SELF.fetch(`${ORIGIN}/api/creations`, {
      body: JSON.stringify({ project: project("Still suspended") }),
      headers: cancellationHeaders,
      method: "POST",
    });
    expect(blocked.status).toBe(403);
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

  it("enforces read-only community mode before handlers mutate storage", async () => {
    const readOnlyEnv = new Proxy(env as Env, {
      get(target, property, receiver) {
        if (property === "COMMUNITY_MUTATIONS_ENABLED") return "false";
        return Reflect.get(target, property, receiver);
      },
    });
    const execution = createExecutionContext();
    const blocked = await worker.fetch(new Request(`${ORIGIN}/api/creations`, {
      body: JSON.stringify({ project: project("Blocked by read-only mode") }),
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      method: "POST",
    }), readOnlyEnv, execution);
    await waitOnExecutionContext(execution);

    expect(blocked.status).toBe(503);
    await expect(blocked.json()).resolves.toMatchObject({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Community changes are temporarily paused. Please try again later.",
      },
    });
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM creations").first())
      .resolves.toMatchObject({ count: 0 });

    const logoutExecution = createExecutionContext();
    const logout = await worker.fetch(new Request(`${ORIGIN}/api/auth/logout`, {
      body: "{}",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      method: "POST",
    }), readOnlyEnv, logoutExecution);
    await waitOnExecutionContext(logoutExecution);
    expect(logout.status).toBe(200);
  });

  it("rejects placeholder identity credentials outside local development", async () => {
    const productionEnv = new Proxy(env as Env, {
      get(target, property, receiver) {
        const overrides: Partial<Env> = {
          ENVIRONMENT: "production",
          PUBLIC_SITE_URL: "https://tomodachi.pw",
          GOOGLE_OIDC_REDIRECT_URI: "https://tomodachi.pw/api/auth/google/callback",
          GOOGLE_CLIENT_ID: "test-google-client-id",
          GOOGLE_CLIENT_SECRET: "test-google-client-secret",
          SESSION_PEPPER: "session hashing phrase for tests only",
          PSEUDONYM_KEY: "pseudonym signing phrase for tests only",
        };
        if (property in overrides) return overrides[property as keyof Env];
        return Reflect.get(target, property, receiver);
      },
    });
    const execution = createExecutionContext();
    const response = await worker.fetch(new Request(
      "https://tomodachi.pw/api/auth/google/start",
      {
        body: JSON.stringify({ returnTo: "/me" }),
        headers: { "Content-Type": "application/json", Origin: "https://tomodachi.pw" },
        method: "POST",
      },
    ), productionEnv, execution);
    await waitOnExecutionContext(execution);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SERVICE_UNAVAILABLE" },
    });
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
      data: { commentsEnabled: true, commentsLocked: true },
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
      body: JSON.stringify({ commentsEnabled: false }),
      headers: ownerHeaders,
      method: "PATCH",
    });
    expect(ownerBypass.status).toBe(409);

    const unlocked = await SELF.fetch(
      `${ORIGIN}/api/moderation/creations/${creation.id}/unlock-comments`,
      {
        body: JSON.stringify({ action: "unlock_comments", reason: "Moderation review complete" }),
        headers: moderatorHeaders,
        method: "POST",
      },
    );
    expect(unlocked.status).toBe(200);
    await expect(unlocked.json()).resolves.toMatchObject({
      data: { commentsEnabled: true, commentsLocked: false },
    });
    const resumedComment = await SELF.fetch(`${ORIGIN}/api/creations/${creation.id}/comments`, {
      body: JSON.stringify({ body: "The owner's enabled setting applies again." }),
      headers: ownerHeaders,
      method: "POST",
    });
    expect(resumedComment.status).toBe(201);

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
     VALUES (?, ?, ?, '', ?, 'active', ?, '2026-07-13', ?, ?, ?)`,
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
