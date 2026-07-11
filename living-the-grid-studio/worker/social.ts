import {
  CommentCreateSchema,
  CommentUpdateSchema,
  ReportCreateSchema,
  decodeCursor,
  encodeCursor,
} from "../shared/community";
import {
  enforceRateLimit,
  requireOnboardedSession,
} from "./auth";
import { pseudonymize } from "./crypto";
import { getCreationById } from "./db";
import {
  HttpError,
  normalizeLimit,
  parseJson,
  success,
  type WorkerRequestContext,
} from "./http";
import type { Router } from "./router";

interface CommentRow {
  author_user_id: string;
  avatar_seed: string;
  body: string;
  creation_id: string;
  created_at: number;
  display_name: string;
  id: string;
  status: "active" | "deleted" | "hidden";
  updated_at: number;
  username: string;
}

export function registerSocialRoutes(router: Router): void {
  router
    .add("PUT", "/api/creations/:id/like", likeCreation)
    .add("POST", "/api/creations/:id/like", likeCreation)
    .add("DELETE", "/api/creations/:id/like", unlikeCreation)
    .add("GET", "/api/creations/:id/comments", listComments)
    .add("POST", "/api/creations/:id/comments", createComment)
    .add("PATCH", "/api/comments/:id", updateComment)
    .add("DELETE", "/api/comments/:id", deleteComment)
    .add("POST", "/api/reports", createReport);
}

async function likeCreation(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  await enforceRateLimit(context.env.SOCIAL_RATE_LIMITER, session.user.id);
  await requirePublishedCreation(context);
  const result = await context.env.DB.prepare(
    "INSERT OR IGNORE INTO likes (user_id, creation_id, created_at) VALUES (?, ?, ?)",
  ).bind(session.user.id, context.params.id, Date.now()).run();
  const changed = (result.meta.changes ?? 0) === 1;
  if (changed) {
    await context.env.DB.prepare(
      "UPDATE creation_stats SET like_count = like_count + 1, updated_at = ? WHERE creation_id = ?",
    ).bind(Date.now(), context.params.id).run();
  }
  return success(context.requestId, { changed, liked: true });
}

async function unlikeCreation(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  await enforceRateLimit(context.env.SOCIAL_RATE_LIMITER, session.user.id);
  const result = await context.env.DB.prepare(
    "DELETE FROM likes WHERE user_id = ? AND creation_id = ?",
  ).bind(session.user.id, context.params.id).run();
  const changed = (result.meta.changes ?? 0) === 1;
  if (changed) {
    await context.env.DB.prepare(
      `UPDATE creation_stats SET like_count = MAX(0, like_count - 1), updated_at = ?
       WHERE creation_id = ?`,
    ).bind(Date.now(), context.params.id).run();
  }
  return success(context.requestId, { changed, liked: false });
}

async function listComments(context: WorkerRequestContext): Promise<Response> {
  await requirePublishedCreation(context);
  const limit = normalizeLimit(context.url.searchParams.get("limit"));
  const cursor = parseCommentCursor(context.url.searchParams.get("cursor"));
  const values: unknown[] = [context.params.id];
  const cursorClause = cursor
    ? "AND (c.created_at > ? OR (c.created_at = ? AND c.id > ?))"
    : "";
  if (cursor) values.push(cursor.sortValue, cursor.sortValue, cursor.id);
  values.push(limit + 1);
  const rows = await context.env.DB.prepare(
    `SELECT c.id, c.creation_id, c.author_user_id, c.body, c.status, c.created_at, c.updated_at,
      u.username, u.display_name, u.avatar_seed
     FROM comments c JOIN users u ON u.id = c.author_user_id
     WHERE c.creation_id = ? AND c.status = 'active' AND u.status = 'active' ${cursorClause}
     ORDER BY c.created_at ASC, c.id ASC LIMIT ?`,
  ).bind(...values).all<CommentRow>();
  const hasMore = rows.results.length > limit;
  const page = rows.results.slice(0, limit);
  const last = page.at(-1);
  return success(context.requestId, page.map(commentToApi), 200, {
    hasMore,
    limit,
    nextCursor: hasMore && last
      ? encodeCursor({ id: last.id, sortValue: last.created_at })
      : null,
  });
}

async function createComment(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  await enforceRateLimit(context.env.COMMENT_RATE_LIMITER, session.user.id);
  const creation = await requirePublishedCreation(context);
  if (creation.comments_locked) {
    throw new HttpError(409, "comments_locked", "A moderator locked comments for this creation.");
  }
  if (!creation.comments_enabled) {
    throw new HttpError(409, "comments_disabled", "Comments are disabled for this creation.");
  }
  const input = await parseJson(context.request, CommentCreateSchema, 10_000);
  const id = crypto.randomUUID();
  const now = Date.now();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO comments
       (id, creation_id, author_user_id, body, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    ).bind(id, creation.id, session.user.id, input.body, now, now),
    context.env.DB.prepare(
      "UPDATE creation_stats SET comment_count = comment_count + 1, updated_at = ? WHERE creation_id = ?",
    ).bind(now, creation.id),
  ]);
  const row = await loadComment(context.env, id);
  return success(context.requestId, commentToApi(row!), 201);
}

async function updateComment(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  await enforceRateLimit(context.env.COMMENT_RATE_LIMITER, session.user.id);
  const input = await parseJson(context.request, CommentUpdateSchema, 10_000);
  const existing = await loadComment(context.env, context.params.id);
  if (!existing || existing.status !== "active") {
    throw new HttpError(404, "comment_not_found", "Comment was not found.");
  }
  if (existing.author_user_id !== session.user.id) {
    throw new HttpError(403, "comment_forbidden", "You cannot edit this comment.");
  }
  await context.env.DB.prepare(
    "UPDATE comments SET body = ?, updated_at = ? WHERE id = ? AND status = 'active'",
  ).bind(input.body, Date.now(), existing.id).run();
  return success(context.requestId, commentToApi((await loadComment(context.env, existing.id))!));
}

async function deleteComment(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  await enforceRateLimit(context.env.COMMENT_RATE_LIMITER, session.user.id);
  const existing = await context.env.DB.prepare(
    "SELECT id, creation_id, author_user_id, status FROM comments WHERE id = ?",
  ).bind(context.params.id).first<{
    author_user_id: string;
    creation_id: string;
    id: string;
    status: string;
  }>();
  if (!existing || existing.status !== "active") {
    throw new HttpError(404, "comment_not_found", "Comment was not found.");
  }
  if (existing.author_user_id !== session.user.id) {
    throw new HttpError(403, "comment_forbidden", "You cannot delete this comment.");
  }
  const now = Date.now();
  await context.env.DB.batch([
    context.env.DB.prepare(
      "UPDATE comments SET status = 'deleted', body = '', deleted_at = ?, updated_at = ? WHERE id = ?",
    ).bind(now, now, existing.id),
    context.env.DB.prepare(
      `UPDATE creation_stats SET comment_count = MAX(0, comment_count - 1), updated_at = ?
       WHERE creation_id = ?`,
    ).bind(now, existing.creation_id),
  ]);
  return success(context.requestId, { deletedAt: now, id: existing.id });
}

async function createReport(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  const input = await parseJson(context.request, ReportCreateSchema, 15_000);
  const cutoff = Date.now() - 24 * 60 * 60 * 1_000;
  const daily = await context.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM reports WHERE reporter_user_id = ? AND created_at >= ?",
  ).bind(session.user.id, cutoff).first<{ count: number }>();
  if ((daily?.count ?? 0) >= 5) {
    throw new HttpError(429, "report_rate_limited", "Daily report limit reached.");
  }
  if (!(await reportTargetExists(context.env, input.targetType, input.targetId))) {
    throw new HttpError(404, "report_target_not_found", "Report target was not found.");
  }
  const now = Date.now();
  const id = crypto.randomUUID();
  const reporterPseudonym = (await pseudonymize(
    context.env,
    "reporter",
    session.user.id,
  )).slice(0, 24);
  try {
    await context.env.DB.prepare(
      `INSERT INTO reports
       (id, reporter_user_id, reporter_pseudonym, target_type, target_id, reason,
        details, status, created_at, updated_at, retain_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    ).bind(
      id,
      session.user.id,
      reporterPseudonym,
      input.targetType,
      input.targetId,
      input.reason,
      input.details,
      now,
      now,
      now + 2 * 365 * 24 * 60 * 60 * 1_000,
    ).run();
  } catch (error) {
    if (error instanceof Error && /unique constraint/iu.test(error.message)) {
      throw new HttpError(409, "duplicate_report", "You already have an open report for this item.");
    }
    throw error;
  }
  return success(context.requestId, {
    createdAt: now,
    details: input.details,
    id,
    reason: input.reason,
    resolutionNote: null,
    resolvedAt: null,
    status: "open",
    targetId: input.targetId,
    targetType: input.targetType,
    updatedAt: now,
  }, 201);
}

async function requirePublishedCreation(context: WorkerRequestContext) {
  const creation = await getCreationById(context.env, context.params.id);
  if (!creation || creation.state !== "published" || creation.visibility === "private") {
    throw new HttpError(404, "creation_not_found", "Creation was not found.");
  }
  return creation;
}

async function loadComment(env: Env, id: string): Promise<CommentRow | null> {
  return env.DB.prepare(
    `SELECT c.id, c.creation_id, c.author_user_id, c.body, c.status, c.created_at, c.updated_at,
      u.username, u.display_name, u.avatar_seed
     FROM comments c JOIN users u ON u.id = c.author_user_id WHERE c.id = ? LIMIT 1`,
  ).bind(id).first<CommentRow>();
}

function commentToApi(row: CommentRow) {
  return {
    author: {
      avatarSeed: row.avatar_seed,
      displayName: row.display_name,
      id: row.author_user_id,
      username: row.username,
    },
    body: row.body,
    creationId: row.creation_id,
    createdAt: row.created_at,
    id: row.id,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

async function reportTargetExists(
  env: Env,
  type: "comment" | "creation" | "user",
  id: string,
): Promise<boolean> {
  const queries = {
    comment: "SELECT 1 AS found FROM comments WHERE id = ? AND status = 'active'",
    creation: "SELECT 1 AS found FROM creations WHERE id = ? AND state = 'published'",
    user: "SELECT 1 AS found FROM users WHERE id = ? AND status != 'deleted'",
  } as const;
  return Boolean(await env.DB.prepare(queries[type]).bind(id).first<{ found: number }>());
}

function parseCommentCursor(value: string | null): { id: string; sortValue: number } | null {
  if (!value) return null;
  try {
    const cursor = decodeCursor(value);
    if (typeof cursor.sortValue !== "number") throw new Error("Invalid comment cursor");
    return { id: cursor.id, sortValue: cursor.sortValue };
  } catch {
    throw new HttpError(400, "invalid_cursor", "Pagination cursor is invalid.");
  }
}
