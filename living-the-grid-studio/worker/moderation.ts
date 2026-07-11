import {
  ModerationDecisionSchema,
  decodeCursor,
  encodeCursor,
  type ModerationAction,
} from "../shared/community";
import { requireModerator } from "./auth";
import { pseudonymize } from "./crypto";
import { HttpError, normalizeLimit, parseJson, success, type WorkerRequestContext } from "./http";
import type { Router } from "./router";

interface ModerationReportRow {
  assigned_moderator_user_id: string | null;
  created_at: number;
  details: string;
  id: string;
  reason: string;
  reporter_pseudonym: string;
  resolution_note: string | null;
  resolved_at: number | null;
  status: string;
  target_id: string;
  target_type: "comment" | "creation" | "user";
  updated_at: number;
}

export function registerModerationRoutes(router: Router): void {
  router
    .add("GET", "/api/moderation/stats", moderationStats)
    .add("GET", "/api/moderation/reports", listReports)
    .add("GET", "/api/moderation/reports/:id", getReport)
    .add("POST", "/api/moderation/reports/:id/actions", decideReport)
    .add("POST", "/api/moderation/users/:id/suspend", suspendUser)
    .add("POST", "/api/moderation/users/:id/restore", restoreUser)
    .add("POST", "/api/moderation/creations/:id/hide", hideCreation)
    .add("POST", "/api/moderation/creations/:id/restore", restoreCreation)
    .add("POST", "/api/moderation/creations/:id/lock-comments", lockComments)
    .add("POST", "/api/moderation/creations/:id/unlock-comments", unlockComments)
    .add("POST", "/api/moderation/comments/:id/hide", hideComment)
    .add("POST", "/api/moderation/comments/:id/restore", restoreComment);
}

async function getReport(context: WorkerRequestContext): Promise<Response> {
  await requireModerator(context);
  const report = await context.env.DB.prepare(
    `SELECT id, reporter_pseudonym, target_type, target_id, reason, details,
      status, assigned_moderator_user_id, resolution_note, created_at, updated_at,
      resolved_at FROM reports WHERE id = ? LIMIT 1`,
  ).bind(context.params.id).first<ModerationReportRow>();
  if (!report) throw new HttpError(404, "report_not_found", "Report was not found.");
  const actions = await context.env.DB.prepare(
    `SELECT id, actor_pseudonym, target_type, target_id, action, reason, created_at
     FROM moderation_actions
     WHERE report_id = ? OR (target_type = ? AND target_id = ?)
     ORDER BY created_at ASC`,
  ).bind(context.params.id, report.target_type, report.target_id).all<{
    action: string;
    actor_pseudonym: string;
    created_at: number;
    id: string;
    reason: string;
    target_id: string;
    target_type: string;
  }>();
  return success(context.requestId, {
    actions: actions.results.map((action) => ({
      action: action.action,
      actorPseudonym: action.actor_pseudonym,
      createdAt: action.created_at,
      id: action.id,
      reason: action.reason,
      targetId: action.target_id,
      targetType: action.target_type,
    })),
    report: reportToApi(report),
    target: await reportTargetSummary(context.env, report.target_type, report.target_id),
  });
}

async function moderationStats(context: WorkerRequestContext): Promise<Response> {
  await requireModerator(context);
  const row = await context.env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM reports WHERE status IN ('open', 'reviewing')) AS open_reports,
      (SELECT COUNT(*) FROM users WHERE status = 'suspended') AS suspended_users,
      (SELECT COUNT(*) FROM creations WHERE state = 'hidden') AS hidden_creations,
      (SELECT COUNT(*) FROM comments WHERE status = 'hidden') AS hidden_comments`,
  ).first<{
    hidden_comments: number;
    hidden_creations: number;
    open_reports: number;
    suspended_users: number;
  }>();
  return success(context.requestId, {
    hiddenComments: row?.hidden_comments ?? 0,
    hiddenCreations: row?.hidden_creations ?? 0,
    openReports: row?.open_reports ?? 0,
    suspendedUsers: row?.suspended_users ?? 0,
  });
}

async function listReports(context: WorkerRequestContext): Promise<Response> {
  await requireModerator(context);
  const limit = normalizeLimit(context.url.searchParams.get("limit"));
  const status = context.url.searchParams.get("status") ?? "open";
  if (!["open", "reviewing", "resolved", "dismissed"].includes(status)) {
    throw new HttpError(400, "invalid_report_status", "Report status is invalid.");
  }
  const cursor = parseReportCursor(context.url.searchParams.get("cursor"));
  const cursorClause = cursor
    ? "AND (created_at > ? OR (created_at = ? AND id > ?))"
    : "";
  const values: unknown[] = [status];
  if (cursor) values.push(cursor.sortValue, cursor.sortValue, cursor.id);
  values.push(limit + 1);
  const rows = await context.env.DB.prepare(
    `SELECT id, reporter_pseudonym, target_type, target_id, reason, details,
      status, assigned_moderator_user_id, resolution_note, created_at, updated_at,
      resolved_at FROM reports WHERE status = ? ${cursorClause}
      ORDER BY created_at ASC, id ASC LIMIT ?`,
  ).bind(...values).all<ModerationReportRow>();
  const hasMore = rows.results.length > limit;
  const page = rows.results.slice(0, limit);
  const last = page.at(-1);
  return success(context.requestId, page.map(reportToApi), 200, {
    hasMore,
    limit,
    nextCursor: hasMore && last
      ? encodeCursor({ id: last.id, sortValue: last.created_at })
      : null,
  });
}

function reportToApi(row: ModerationReportRow) {
  return {
    assignedModeratorId: row.assigned_moderator_user_id,
    createdAt: row.created_at,
    details: row.details,
    id: row.id,
    reason: row.reason,
    reporterPseudonym: row.reporter_pseudonym,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
    status: row.status,
    targetId: row.target_id,
    targetType: row.target_type,
    updatedAt: row.updated_at,
  };
}

async function reportTargetSummary(
  env: Env,
  targetType: ModerationReportRow["target_type"],
  targetId: string,
): Promise<Record<string, unknown>> {
  if (targetType === "creation") {
    const row = await env.DB.prepare(
      `SELECT c.id, c.slug, c.title, c.description, c.state, c.visibility,
       c.comments_enabled, c.comments_locked, u.id AS owner_id,
       u.username AS owner_username, u.display_name AS owner_display_name
       FROM creations c JOIN users u ON u.id = c.owner_user_id
       WHERE c.id = ? LIMIT 1`,
    ).bind(targetId).first<{
      comments_enabled: number;
      comments_locked: number;
      description: string;
      id: string;
      owner_display_name: string;
      owner_id: string;
      owner_username: string | null;
      slug: string;
      state: string;
      title: string;
      visibility: string;
    }>();
    return row ? {
      commentsEnabled: Boolean(row.comments_enabled),
      commentsLocked: Boolean(row.comments_locked),
      description: row.description,
      id: row.id,
      label: row.title,
      owner: {
        displayName: row.owner_display_name,
        id: row.owner_id,
        username: row.owner_username,
      },
      slug: row.slug,
      state: row.state,
      type: "creation",
      visibility: row.visibility,
    } : unavailableTarget(targetType, targetId);
  }

  if (targetType === "comment") {
    const row = await env.DB.prepare(
      `SELECT cm.id, cm.body, cm.status, cm.creation_id, cm.author_user_id,
       u.username AS author_username, u.display_name AS author_display_name,
       c.title AS creation_title, c.slug AS creation_slug, c.state AS creation_state
       FROM comments cm
       JOIN users u ON u.id = cm.author_user_id
       JOIN creations c ON c.id = cm.creation_id
       WHERE cm.id = ? LIMIT 1`,
    ).bind(targetId).first<{
      author_display_name: string;
      author_user_id: string;
      author_username: string | null;
      body: string;
      creation_id: string;
      creation_slug: string;
      creation_state: string;
      creation_title: string;
      id: string;
      status: string;
    }>();
    return row ? {
      author: {
        displayName: row.author_display_name,
        id: row.author_user_id,
        username: row.author_username,
      },
      body: row.body,
      creation: {
        id: row.creation_id,
        slug: row.creation_slug,
        state: row.creation_state,
        title: row.creation_title,
      },
      id: row.id,
      label: `Comment on ${row.creation_title}`,
      state: row.status,
      type: "comment",
    } : unavailableTarget(targetType, targetId);
  }

  const row = await env.DB.prepare(
    `SELECT id, username, display_name, bio, role, status, created_at
     FROM users WHERE id = ? LIMIT 1`,
  ).bind(targetId).first<{
    bio: string;
    created_at: number;
    display_name: string;
    id: string;
    role: string;
    status: string;
    username: string | null;
  }>();
  return row ? {
    bio: row.bio,
    createdAt: row.created_at,
    id: row.id,
    label: row.display_name,
    role: row.role,
    state: row.status,
    type: "user",
    username: row.username,
  } : unavailableTarget(targetType, targetId);
}

function unavailableTarget(type: string, id: string): Record<string, unknown> {
  return { id, label: "Target unavailable", state: "unavailable", type };
}

async function decideReport(context: WorkerRequestContext): Promise<Response> {
  const moderator = await requireModerator(context);
  const input = await parseJson(context.request, ModerationDecisionSchema, 20_000);
  if (input.action !== "resolve_report" && input.action !== "dismiss_report") {
    throw new HttpError(400, "invalid_moderation_action", "Use a report decision action.");
  }
  const report = await context.env.DB.prepare(
    "SELECT id, status FROM reports WHERE id = ?",
  ).bind(context.params.id).first<{ id: string; status: string }>();
  if (!report) throw new HttpError(404, "report_not_found", "Report was not found.");
  const now = Date.now();
  const nextStatus = input.action === "resolve_report" ? "resolved" : "dismissed";
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE reports SET status = ?, assigned_moderator_user_id = ?, resolution_note = ?,
       resolved_at = ?, free_text_purge_at = ?, retain_until = ?, updated_at = ? WHERE id = ?`,
    ).bind(
      nextStatus,
      moderator.user.id,
      input.reason,
      now,
      now + 90 * 24 * 60 * 60 * 1_000,
      now + 2 * 365 * 24 * 60 * 60 * 1_000,
      now,
      report.id,
    ),
    await actionStatement(context.env, moderator.user.id, {
      action: input.action,
      reason: input.reason,
      reportId: report.id,
      targetId: report.id,
      targetType: "report",
    }),
  ]);
  return success(context.requestId, { id: report.id, resolvedAt: now, status: nextStatus });
}

async function suspendUser(context: WorkerRequestContext): Promise<Response> {
  const moderator = await requireModerator(context);
  await requireModeratableUser(context, moderator, "suspend");
  const input = await exactAction(context, "suspend_user");
  const now = Date.now();
  await context.env.DB.batch([
    context.env.DB.prepare(
      "UPDATE users SET status = 'suspended', updated_at = ? WHERE id = ? AND status = 'active'",
    ).bind(now, context.params.id),
    context.env.DB.prepare(
      "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    ).bind(now, context.params.id),
    context.env.DB.prepare(
      `UPDATE creations SET state = 'hidden', visibility = 'private', hidden_at = ?,
       published_at = NULL, updated_at = ?
       WHERE owner_user_id = ? AND state = 'published'`,
    ).bind(now, now, context.params.id),
    context.env.DB.prepare(
      "DELETE FROM creation_search WHERE creation_id IN (SELECT id FROM creations WHERE owner_user_id = ?)",
    ).bind(context.params.id),
    await actionStatement(context.env, moderator.user.id, {
      action: input.action,
      reason: input.reason,
      targetId: context.params.id,
      targetType: "user",
    }),
  ]);
  return success(context.requestId, { id: context.params.id, status: "suspended" });
}

async function restoreUser(context: WorkerRequestContext): Promise<Response> {
  const moderator = await requireModerator(context);
  await requireModeratableUser(context, moderator, "restore");
  const input = await exactAction(context, "restore_user");
  await context.env.DB.batch([
    context.env.DB.prepare(
      "UPDATE users SET status = 'active', updated_at = ? WHERE id = ? AND status = 'suspended'",
    ).bind(Date.now(), context.params.id),
    await actionStatement(context.env, moderator.user.id, {
      action: input.action,
      reason: input.reason,
      targetId: context.params.id,
      targetType: "user",
    }),
  ]);
  return success(context.requestId, { id: context.params.id, status: "active" });
}

async function hideCreation(context: WorkerRequestContext): Promise<Response> {
  const moderator = await requireModerator(context);
  await requireCreationState(context, "published");
  const input = await exactAction(context, "hide_creation");
  const now = Date.now();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE creations SET state = 'hidden', visibility = 'private', hidden_at = ?,
       published_at = NULL, updated_at = ? WHERE id = ? AND state = 'published'`,
    ).bind(now, now, context.params.id),
    context.env.DB.prepare("DELETE FROM creation_search WHERE creation_id = ?").bind(context.params.id),
    await actionStatement(context.env, moderator.user.id, {
      action: input.action,
      reason: input.reason,
      targetId: context.params.id,
      targetType: "creation",
    }),
  ]);
  return success(context.requestId, { id: context.params.id, state: "hidden" });
}

async function restoreCreation(context: WorkerRequestContext): Promise<Response> {
  const moderator = await requireModerator(context);
  await requireCreationState(context, "hidden");
  const input = await exactAction(context, "restore_creation");
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE creations SET state = 'draft', visibility = 'private', hidden_at = NULL,
       updated_at = ? WHERE id = ? AND state = 'hidden'`,
    ).bind(Date.now(), context.params.id),
    await actionStatement(context.env, moderator.user.id, {
      action: input.action,
      reason: input.reason,
      targetId: context.params.id,
      targetType: "creation",
    }),
  ]);
  return success(context.requestId, { id: context.params.id, state: "draft", visibility: "private" });
}

async function hideComment(context: WorkerRequestContext): Promise<Response> {
  const moderator = await requireModerator(context);
  const input = await exactAction(context, "hide_comment");
  const comment = await context.env.DB.prepare(
    "SELECT id, creation_id, status FROM comments WHERE id = ?",
  ).bind(context.params.id).first<{ creation_id: string; id: string; status: string }>();
  if (!comment) throw new HttpError(404, "comment_not_found", "Comment was not found.");
  if (comment.status !== "active") {
    throw new HttpError(409, "invalid_comment_state", "Only an active comment can be hidden.");
  }
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    context.env.DB.prepare(
      "UPDATE comments SET status = 'hidden', hidden_at = ?, updated_at = ? WHERE id = ? AND status = 'active'",
    ).bind(now, now, comment.id),
    await actionStatement(context.env, moderator.user.id, {
      action: input.action,
      reason: input.reason,
      targetId: comment.id,
      targetType: "comment",
    }),
  ];
  if (comment.status === "active") {
    statements.push(context.env.DB.prepare(
      "UPDATE creation_stats SET comment_count = MAX(0, comment_count - 1), updated_at = ? WHERE creation_id = ?",
    ).bind(now, comment.creation_id));
  }
  await context.env.DB.batch(statements);
  return success(context.requestId, { id: comment.id, status: "hidden" });
}

async function restoreComment(context: WorkerRequestContext): Promise<Response> {
  const moderator = await requireModerator(context);
  const input = await exactAction(context, "restore_comment");
  const comment = await context.env.DB.prepare(
    "SELECT id, creation_id, status FROM comments WHERE id = ?",
  ).bind(context.params.id).first<{ creation_id: string; id: string; status: string }>();
  if (!comment) throw new HttpError(404, "comment_not_found", "Comment was not found.");
  if (comment.status !== "hidden") {
    throw new HttpError(409, "invalid_comment_state", "Only a hidden comment can be restored.");
  }
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    context.env.DB.prepare(
      "UPDATE comments SET status = 'active', hidden_at = NULL, updated_at = ? WHERE id = ? AND status = 'hidden'",
    ).bind(now, comment.id),
    await actionStatement(context.env, moderator.user.id, {
      action: input.action,
      reason: input.reason,
      targetId: comment.id,
      targetType: "comment",
    }),
  ];
  if (comment.status === "hidden") {
    statements.push(context.env.DB.prepare(
      "UPDATE creation_stats SET comment_count = comment_count + 1, updated_at = ? WHERE creation_id = ?",
    ).bind(now, comment.creation_id));
  }
  await context.env.DB.batch(statements);
  return success(context.requestId, { id: comment.id, status: "active" });
}

async function exactAction(context: WorkerRequestContext, action: ModerationAction) {
  const input = await parseJson(context.request, ModerationDecisionSchema, 20_000);
  if (input.action !== action) {
    throw new HttpError(400, "invalid_moderation_action", `Expected ${action}.`);
  }
  return input;
}

async function lockComments(context: WorkerRequestContext): Promise<Response> {
  const moderator = await requireModerator(context);
  const creation = await loadModeratedCreation(context);
  if (creation.comments_locked) {
    throw new HttpError(409, "comments_already_locked", "Comments are already locked.");
  }
  const input = await exactAction(context, "lock_comments");
  const now = Date.now();
  await context.env.DB.batch([
    context.env.DB.prepare(
      "UPDATE creations SET comments_enabled = 0, comments_locked = 1, updated_at = ? WHERE id = ?",
    ).bind(now, creation.id),
    await actionStatement(context.env, moderator.user.id, {
      action: input.action,
      reason: input.reason,
      targetId: creation.id,
      targetType: "creation",
    }),
  ]);
  return success(context.requestId, {
    commentsEnabled: false,
    commentsLocked: true,
    id: creation.id,
  });
}

async function unlockComments(context: WorkerRequestContext): Promise<Response> {
  const moderator = await requireModerator(context);
  const creation = await loadModeratedCreation(context);
  if (!creation.comments_locked) {
    throw new HttpError(409, "comments_not_locked", "Comments are not locked.");
  }
  const input = await exactAction(context, "unlock_comments");
  const now = Date.now();
  await context.env.DB.batch([
    context.env.DB.prepare(
      "UPDATE creations SET comments_locked = 0, updated_at = ? WHERE id = ?",
    ).bind(now, creation.id),
    await actionStatement(context.env, moderator.user.id, {
      action: input.action,
      reason: input.reason,
      targetId: creation.id,
      targetType: "creation",
    }),
  ]);
  return success(context.requestId, {
    commentsEnabled: Boolean(creation.comments_enabled),
    commentsLocked: false,
    id: creation.id,
  });
}

async function actionStatement(
  env: Env,
  moderatorUserId: string,
  input: {
    action: ModerationAction;
    reason: string;
    reportId?: string;
    targetId: string;
    targetType: "comment" | "creation" | "report" | "user";
  },
): Promise<D1PreparedStatement> {
  const now = Date.now();
  const actorPseudonym = (await pseudonymize(env, "moderator", moderatorUserId)).slice(0, 24);
  return env.DB.prepare(
    `INSERT INTO moderation_actions
     (id, report_id, moderator_user_id, actor_pseudonym, target_type, target_id,
      action, reason, created_at, retain_until)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    input.reportId ?? null,
    moderatorUserId,
    actorPseudonym,
    input.targetType,
    input.targetId,
    input.action,
    input.reason,
    now,
    now + 2 * 365 * 24 * 60 * 60 * 1_000,
  );
}

async function requireModeratableUser(
  context: WorkerRequestContext,
  actor: Awaited<ReturnType<typeof requireModerator>>,
  transition: "restore" | "suspend",
): Promise<{ id: string; role: "admin" | "moderator" | "user"; status: string }> {
  const target = await context.env.DB.prepare(
    "SELECT id, role, status FROM users WHERE id = ? AND status != 'deleted' LIMIT 1",
  ).bind(context.params.id).first<{
    id: string;
    role: "admin" | "moderator" | "user";
    status: string;
  }>();
  if (!target) throw new HttpError(404, "user_not_found", "User was not found.");
  if (transition === "suspend" && target.id === actor.user.id) {
    throw new HttpError(400, "cannot_suspend_self", "You cannot suspend your own account.");
  }
  if (actor.role === "moderator" && target.role !== "user") {
    throw new HttpError(403, "role_hierarchy", "Moderators cannot act on elevated accounts.");
  }
  const expected = transition === "suspend" ? "active" : "suspended";
  if (target.status !== expected) {
    throw new HttpError(409, "invalid_user_state", `User must be ${expected} for this action.`);
  }
  return target;
}

async function requireCreationState(
  context: WorkerRequestContext,
  expected: "hidden" | "published",
): Promise<void> {
  const creation = await context.env.DB.prepare(
    "SELECT id, state FROM creations WHERE id = ? AND state != 'deleted' LIMIT 1",
  ).bind(context.params.id).first<{ id: string; state: string }>();
  if (!creation) throw new HttpError(404, "creation_not_found", "Creation was not found.");
  if (creation.state !== expected) {
    throw new HttpError(409, "invalid_creation_state", `Creation must be ${expected} for this action.`);
  }
}

async function loadModeratedCreation(context: WorkerRequestContext): Promise<{
  comments_enabled: number;
  comments_locked: number;
  id: string;
}> {
  const creation = await context.env.DB.prepare(
    `SELECT id, comments_enabled, comments_locked FROM creations
     WHERE id = ? AND state != 'deleted' LIMIT 1`,
  ).bind(context.params.id).first<{
    comments_enabled: number;
    comments_locked: number;
    id: string;
  }>();
  if (!creation) throw new HttpError(404, "creation_not_found", "Creation was not found.");
  return creation;
}

function parseReportCursor(value: string | null): { id: string; sortValue: number } | null {
  if (!value) return null;
  try {
    const cursor = decodeCursor(value);
    if (typeof cursor.sortValue !== "number") throw new Error("Invalid report cursor");
    return { id: cursor.id, sortValue: cursor.sortValue };
  } catch {
    throw new HttpError(400, "invalid_cursor", "Pagination cursor is invalid.");
  }
}
