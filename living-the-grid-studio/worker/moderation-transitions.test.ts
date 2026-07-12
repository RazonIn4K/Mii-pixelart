import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { sha256 } from "./crypto";

const ORIGIN = "http://localhost:3000";
const SESSION_PEPPER = "test-only-session-pepper";

describe("moderation state transitions", () => {
  beforeEach(async () => {
    await env.DB.exec(`
      DELETE FROM moderation_actions;
      DELETE FROM reports;
      DELETE FROM comments;
      DELETE FROM creation_search;
      DELETE FROM creation_stats;
      DELETE FROM creations;
      DELETE FROM sessions;
      DELETE FROM external_identities;
      DELETE FROM users;
    `);
  });

  it("allows only one terminal report decision and never records a stale action", async () => {
    const moderator = await seedUser("decision-moderator", "moderator");
    const target = await seedUser("decision-target");
    const reportId = await seedReport(target.id);
    const headers = authenticatedHeaders(
      await seedSession(moderator.id, "decision-moderator-token"),
    );

    const responses = await Promise.all([
      moderate(`/api/moderation/reports/${reportId}/actions`, headers, {
        action: "resolve_report",
        reason: "Resolve exactly once",
      }),
      moderate(`/api/moderation/reports/${reportId}/actions`, headers, {
        action: "dismiss_report",
        reason: "Stale competing dismissal",
      }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);

    const report = await env.DB.prepare(
      "SELECT status, resolution_note FROM reports WHERE id = ?",
    )
      .bind(reportId)
      .first<{ resolution_note: string; status: string }>();
    const actions = await env.DB.prepare(
      `SELECT action, reason FROM moderation_actions
       WHERE report_id = ? ORDER BY created_at, id`,
    )
      .bind(reportId)
      .all<{ action: string; reason: string }>();
    expect(actions.results).toHaveLength(1);
    expect(report).toEqual(
      actions.results[0]?.action === "resolve_report"
        ? { resolution_note: "Resolve exactly once", status: "resolved" }
        : { resolution_note: "Stale competing dismissal", status: "dismissed" },
    );

    const terminalRetry = await moderate(
      `/api/moderation/reports/${reportId}/actions`,
      headers,
      {
        action:
          report?.status === "resolved" ? "dismiss_report" : "resolve_report",
        reason: "Must not overwrite the terminal decision",
      },
    );
    expect(terminalRetry.status).toBe(409);
    await expect(terminalRetry.json()).resolves.toMatchObject({
      error: {
        code: "CONFLICT",
        message: "The report has already been resolved or dismissed.",
      },
    });
    await expect(
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM moderation_actions WHERE report_id = ?",
      )
        .bind(reportId)
        .first<{ count: number }>(),
    ).resolves.toMatchObject({ count: 1 });
    await expect(
      env.DB.prepare("SELECT status, resolution_note FROM reports WHERE id = ?")
        .bind(reportId)
        .first(),
    ).resolves.toEqual(report);
  });

  it("audits user, creation, comment, and comment-lock transitions exactly once", async () => {
    const moderator = await seedUser("transition-moderator", "moderator");
    const owner = await seedUser("transition-owner");
    const headers = authenticatedHeaders(
      await seedSession(moderator.id, "transition-moderator-token"),
    );
    await seedSession(owner.id, "transition-owner-token");
    const ownedCreation = await seedCreation(owner.id, "published");

    await expectOneSuccessOneConflict([
      moderate(`/api/moderation/users/${owner.id}/suspend`, headers, {
        action: "suspend_user",
        reason: "Concurrent suspension A",
      }),
      moderate(`/api/moderation/users/${owner.id}/suspend`, headers, {
        action: "suspend_user",
        reason: "Concurrent suspension B",
      }),
    ]);
    await expectActionCount("user", owner.id, "suspend_user", 1);
    await expect(
      env.DB.prepare("SELECT status FROM users WHERE id = ?")
        .bind(owner.id)
        .first(),
    ).resolves.toMatchObject({ status: "suspended" });
    await expect(
      env.DB.prepare("SELECT state FROM creations WHERE id = ?")
        .bind(ownedCreation.id)
        .first(),
    ).resolves.toMatchObject({ state: "hidden" });

    await expectOneSuccessOneConflict([
      moderate(`/api/moderation/users/${owner.id}/restore`, headers, {
        action: "restore_user",
        reason: "Concurrent restoration A",
      }),
      moderate(`/api/moderation/users/${owner.id}/restore`, headers, {
        action: "restore_user",
        reason: "Concurrent restoration B",
      }),
    ]);
    await expectActionCount("user", owner.id, "restore_user", 1);

    const creationOwner = await seedUser("creation-owner");
    const creation = await seedCreation(creationOwner.id, "published");
    await expectOneSuccessOneConflict([
      moderate(`/api/moderation/creations/${creation.id}/hide`, headers, {
        action: "hide_creation",
        reason: "Concurrent creation hide A",
      }),
      moderate(`/api/moderation/creations/${creation.id}/hide`, headers, {
        action: "hide_creation",
        reason: "Concurrent creation hide B",
      }),
    ]);
    await expectActionCount("creation", creation.id, "hide_creation", 1);
    await expectOneSuccessOneConflict([
      moderate(`/api/moderation/creations/${creation.id}/restore`, headers, {
        action: "restore_creation",
        reason: "Concurrent creation restore A",
      }),
      moderate(`/api/moderation/creations/${creation.id}/restore`, headers, {
        action: "restore_creation",
        reason: "Concurrent creation restore B",
      }),
    ]);
    await expectActionCount("creation", creation.id, "restore_creation", 1);

    const discussionOwner = await seedUser("discussion-owner");
    const discussion = await seedCreation(discussionOwner.id, "published");
    const commentId = await seedComment(discussion.id, discussionOwner.id);
    await expectOneSuccessOneConflict([
      moderate(`/api/moderation/comments/${commentId}/hide`, headers, {
        action: "hide_comment",
        reason: "Concurrent comment hide A",
      }),
      moderate(`/api/moderation/comments/${commentId}/hide`, headers, {
        action: "hide_comment",
        reason: "Concurrent comment hide B",
      }),
    ]);
    await expectActionCount("comment", commentId, "hide_comment", 1);
    await expectCommentCount(discussion.id, 0);
    await expectOneSuccessOneConflict([
      moderate(`/api/moderation/comments/${commentId}/restore`, headers, {
        action: "restore_comment",
        reason: "Concurrent comment restore A",
      }),
      moderate(`/api/moderation/comments/${commentId}/restore`, headers, {
        action: "restore_comment",
        reason: "Concurrent comment restore B",
      }),
    ]);
    await expectActionCount("comment", commentId, "restore_comment", 1);
    await expectCommentCount(discussion.id, 1);

    await expectOneSuccessOneConflict([
      moderate(
        `/api/moderation/creations/${discussion.id}/lock-comments`,
        headers,
        {
          action: "lock_comments",
          reason: "Concurrent lock A",
        },
      ),
      moderate(
        `/api/moderation/creations/${discussion.id}/lock-comments`,
        headers,
        {
          action: "lock_comments",
          reason: "Concurrent lock B",
        },
      ),
    ]);
    await expectActionCount("creation", discussion.id, "lock_comments", 1);
    await expectOneSuccessOneConflict([
      moderate(
        `/api/moderation/creations/${discussion.id}/unlock-comments`,
        headers,
        {
          action: "unlock_comments",
          reason: "Concurrent unlock A",
        },
      ),
      moderate(
        `/api/moderation/creations/${discussion.id}/unlock-comments`,
        headers,
        {
          action: "unlock_comments",
          reason: "Concurrent unlock B",
        },
      ),
    ]);
    await expectActionCount("creation", discussion.id, "unlock_comments", 1);
    await expect(
      env.DB.prepare(
        "SELECT comments_enabled, comments_locked FROM creations WHERE id = ?",
      )
        .bind(discussion.id)
        .first(),
    ).resolves.toEqual({
      comments_enabled: 1,
      comments_locked: 0,
    });
  });

  it("cursor-paginates report action history with the standard envelope and limits", async () => {
    const moderator = await seedUser("history-moderator", "moderator");
    const target = await seedUser("history-target");
    const reportId = await seedReport(target.id);
    const headers = authenticatedHeaders(
      await seedSession(moderator.id, "history-moderator-token"),
    );
    const now = Date.now();
    await env.DB.batch(
      Array.from({ length: 55 }, (_, index) =>
        env.DB.prepare(
          `INSERT INTO moderation_actions
           (id, report_id, moderator_user_id, actor_pseudonym, target_type, target_id,
            action, reason, created_at, retain_until)
           VALUES (?, ?, ?, 'history-pseudonym', 'report', ?, 'resolve_report', ?, ?, ?)`,
        ).bind(
          `history-action-${String(index).padStart(3, "0")}`,
          reportId,
          moderator.id,
          reportId,
          `History action ${index}`,
          now + Math.floor(index / 2),
          now + 10_000,
        ),
      ),
    );

    const collected: string[] = [];
    let cursor: string | null = null;
    const pageSizes: number[] = [];
    do {
      const response = await SELF.fetch(
        `${ORIGIN}/api/moderation/reports/${reportId}?limit=20${
          cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
        }`,
        { headers },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { actions: { id: string }[] };
        meta: { hasMore: boolean; limit: number; nextCursor: string | null };
        requestId: string;
      };
      expect(body.requestId).toEqual(expect.any(String));
      expect(body.meta.limit).toBe(20);
      pageSizes.push(body.data.actions.length);
      collected.push(...body.data.actions.map((action) => action.id));
      cursor = body.meta.nextCursor;
      expect(body.meta.hasMore).toBe(Boolean(cursor));
    } while (cursor);

    expect(pageSizes).toEqual([20, 20, 15]);
    expect(collected).toHaveLength(55);
    expect(new Set(collected).size).toBe(55);
    expect(collected).toEqual(
      Array.from(
        { length: 55 },
        (_, index) => `history-action-${String(index).padStart(3, "0")}`,
      ),
    );

    const capped = await SELF.fetch(
      `${ORIGIN}/api/moderation/reports/${reportId}?limit=999`,
      { headers },
    );
    const cappedBody = (await capped.json()) as {
      data: { actions: unknown[] };
      meta: { hasMore: boolean; limit: number };
    };
    expect(cappedBody.meta).toMatchObject({ hasMore: true, limit: 50 });
    expect(cappedBody.data.actions).toHaveLength(50);
  });
});

async function seedUser(
  username: string,
  role: "admin" | "moderator" | "user" = "user",
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users
       (id, username, display_name, bio, role, status, avatar_seed,
        terms_version, terms_accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, 'active', ?, '2026-07-12', ?, ?, ?)`,
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
     VALUES (?, ?, ?, 'Moderation test', ?, ?, ?, ?)`,
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

async function seedCreation(
  ownerId: string,
  state: "hidden" | "published",
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO creations
       (id, owner_user_id, slug, title, description, state, visibility,
        comments_enabled, project_download_enabled, published_at, hidden_at,
        created_at, updated_at)
       VALUES (?, ?, ?, 'Moderation fixture', '', ?, ?, 1, 0, ?, ?, ?, ?)`,
    ).bind(
      id,
      ownerId,
      id.replaceAll("-", "").slice(0, 18),
      state,
      state === "published" ? "public" : "private",
      state === "published" ? now : null,
      state === "hidden" ? now : null,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO creation_stats
       (creation_id, like_count, comment_count, popularity_score, updated_at)
       VALUES (?, 0, 0, 0, ?)`,
    ).bind(id, now),
  ]);
  return { id };
}

async function seedComment(
  creationId: string,
  authorId: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO comments
       (id, creation_id, author_user_id, body, status, created_at, updated_at)
       VALUES (?, ?, ?, 'Moderation fixture comment', 'active', ?, ?)`,
    ).bind(id, creationId, authorId, now, now),
    env.DB.prepare(
      "UPDATE creation_stats SET comment_count = 1, updated_at = ? WHERE creation_id = ?",
    ).bind(now, creationId),
  ]);
  return id;
}

async function seedReport(targetId: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO reports
     (id, reporter_pseudonym, target_type, target_id, reason, details, status,
      created_at, updated_at, retain_until)
     VALUES (?, 'reporter-pseudonym', 'user', ?, 'other', 'Review fixture', 'open', ?, ?, ?)`,
  )
    .bind(id, targetId, now, now, now + 10_000)
    .run();
  return id;
}

function authenticatedHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Cookie: `tomodachi.sid=${token}`,
    Origin: ORIGIN,
  };
}

function moderate(
  path: string,
  headers: Record<string, string>,
  body: { action: string; reason: string },
): Promise<Response> {
  return SELF.fetch(`${ORIGIN}${path}`, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}

async function expectOneSuccessOneConflict(
  pending: [Promise<Response>, Promise<Response>],
): Promise<void> {
  const responses = await Promise.all(pending);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  const conflict = responses.find((response) => response.status === 409);
  await expect(conflict?.json()).resolves.toMatchObject({
    error: { code: "CONFLICT" },
  });
}

async function expectActionCount(
  targetType: "comment" | "creation" | "user",
  targetId: string,
  action: string,
  count: number,
): Promise<void> {
  await expect(
    env.DB.prepare(
      `SELECT COUNT(*) AS count FROM moderation_actions
       WHERE target_type = ? AND target_id = ? AND action = ?`,
    )
      .bind(targetType, targetId, action)
      .first<{ count: number }>(),
  ).resolves.toMatchObject({ count });
}

async function expectCommentCount(
  creationId: string,
  count: number,
): Promise<void> {
  await expect(
    env.DB.prepare(
      "SELECT comment_count FROM creation_stats WHERE creation_id = ?",
    )
      .bind(creationId)
      .first(),
  ).resolves.toMatchObject({ comment_count: count });
}
