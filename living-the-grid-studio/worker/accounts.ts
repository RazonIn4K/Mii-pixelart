import {
  COMMUNITY_LIMITS,
  ProfileUpdateSchema,
  SetupProfileSchema,
  decodeCursor,
  encodeCursor,
  normalizeUsername,
} from "../shared/community";
import {
  clientKey,
  enforceRateLimit,
  optionalSession,
  requireFreshSession,
  requireOnboardedSession,
  requireSession,
} from "./auth";
import { CREATION_SELECT, creationToApi, type CreationRow } from "./db";
import {
  HttpError,
  cookie,
  normalizeLimit,
  parseJson,
  success,
  type WorkerRequestContext,
} from "./http";
import type { Router } from "./router";

interface AccountRow {
  avatar_seed: string;
  bio: string;
  created_at: number;
  deletion_due_at: number | null;
  display_name: string;
  email: string;
  id: string;
  role: "admin" | "moderator" | "user";
  status: "active" | "deleted" | "deletion_pending" | "suspended";
  terms_accepted_at: number | null;
  terms_version: string | null;
  updated_at: number;
  username: string | null;
}

interface PublicProfileRow {
  avatar_seed: string;
  bio: string;
  created_at: number;
  creation_count: number;
  display_name: string;
  follower_count: number;
  following_count: number;
  id: string;
  username: string;
}

interface ExportPageRow extends Record<string, unknown> {
  created_at: number;
  export_id: string;
}

interface ExportCreationRow extends Record<string, unknown> {
  created_at: number;
  id: string;
  object_key: string | null;
}

interface ExportShowcaseImageRow {
  alt_text: string;
  created_at: number;
  id: string;
  is_cover: number;
  sort_order: number;
  source_height: number;
  source_width: number;
  updated_at: number;
}

interface ExportShowcaseObjectRow {
  byte_size: number;
  content_type: string;
  kind: string;
  object_key: string;
  sha256: string;
}

interface ExportQuery {
  idColumn: string;
  predicate: string;
  table: string;
  type: string;
}

const EXPORT_PAGE_SIZE = 100;

export function registerAccountRoutes(router: Router): void {
  router
    .add("POST", "/api/me/setup", setupProfile)
    .add("GET", "/api/me", getMe)
    .add("PATCH", "/api/me", updateMe)
    .add("GET", "/api/me/sessions", listSessions)
    .add("GET", "/api/me/export", exportAccount)
    .add("DELETE", "/api/me", requestDeletion)
    .add("POST", "/api/me/deletion/cancel", cancelDeletion)
    .add("GET", "/api/users/:username", getPublicProfile)
    .add("GET", "/api/users/:username/creations", getPublicProfileCreations)
    .add("PUT", "/api/users/:username/follow", followUser)
    .add("POST", "/api/users/:username/follow", followUser)
    .add("DELETE", "/api/users/:username/follow", unfollowUser)
    .add("GET", "/api/users/:username/followers", listFollowers)
    .add("GET", "/api/users/:username/following", listFollowing);
}

async function setupProfile(context: WorkerRequestContext): Promise<Response> {
  const session = await requireSession(context);
  const input = await parseJson(context.request, SetupProfileSchema, 20_000);
  if (input.termsVersion !== context.env.TERMS_VERSION) {
    throw new HttpError(409, "terms_version_changed", "Review the current Terms before continuing.");
  }
  if (session.user.username && session.user.username !== input.username) {
    throw new HttpError(409, "username_immutable", "Your username cannot be changed.");
  }
  const now = Date.now();
  try {
    const result = await context.env.DB.prepare(
      `UPDATE users SET username = ?, display_name = ?, bio = ?, terms_version = ?,
       terms_accepted_at = ?, updated_at = ?
       WHERE id = ? AND status = 'active'
         AND (username IS NULL OR username = ? COLLATE NOCASE)`,
    ).bind(
      input.username,
      input.displayName,
      input.bio ?? "",
      input.termsVersion,
      now,
      now,
      session.user.id,
      input.username,
    ).run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new HttpError(409, "profile_already_configured", "This profile is already configured.");
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && /unique constraint/iu.test(error.message)) {
      const suggestions = await availableUsernameSuggestions(context.env, input.username);
      throw new HttpError(
        409,
        "username_unavailable",
        "That username is unavailable.",
        { usernameSuggestions: [suggestions.join(",")] },
      );
    }
    throw error;
  }
  return success(context.requestId, await getAccount(context.env, session.user.id));
}

async function getMe(context: WorkerRequestContext): Promise<Response> {
  const session = await requireSession(context);
  const account = await getAccount(context.env, session.user.id);
  return success(context.requestId, account);
}

async function updateMe(context: WorkerRequestContext): Promise<Response> {
  const session = await requireSession(context);
  const input = await parseJson(context.request, ProfileUpdateSchema, 20_000);
  const account = await getAccount(context.env, session.user.id);
  if (!account) throw new HttpError(404, "account_not_found", "Account was not found.");

  const updates: string[] = [];
  const bindings: unknown[] = [];
  if (input.displayName !== undefined) {
    updates.push("display_name = ?");
    bindings.push(input.displayName);
  }
  if (input.bio !== undefined) {
    updates.push("bio = ?");
    bindings.push(input.bio);
  }
  if (input.regenerateAvatar) {
    await enforceRateLimit(context.env.SAVE_RATE_LIMITER, session.user.id);
    updates.push("avatar_seed = ?");
    bindings.push(crypto.randomUUID());
  }
  updates.push("updated_at = ?");
  bindings.push(Date.now(), session.user.id);

  try {
    await context.env.DB.prepare(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ? AND status != 'deleted'`,
    ).bind(...bindings).run();
  } catch (error) {
    if (error instanceof Error && /unique constraint/iu.test(error.message)) {
      throw new HttpError(409, "username_unavailable", "That username is unavailable.");
    }
    throw error;
  }
  return success(context.requestId, await getAccount(context.env, session.user.id));
}

async function listSessions(context: WorkerRequestContext): Promise<Response> {
  const session = await requireSession(context);
  const rows = await context.env.DB.prepare(
    `SELECT id, ua_label, created_at, last_seen_at, last_authenticated_at, expires_at
     FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC LIMIT ?`,
  ).bind(session.user.id, Date.now(), COMMUNITY_LIMITS.activeSessionsPerUser).all<{
    created_at: number;
    expires_at: number;
    id: string;
    last_authenticated_at: number;
    last_seen_at: number;
    ua_label: string;
  }>();
  return success(
    context.requestId,
    rows.results.map((row) => ({
      createdAt: row.created_at,
      current: row.id === session.id,
      expiresAt: row.expires_at,
      id: row.id,
      uaLabel: row.ua_label,
      userAgentLabel: row.ua_label,
      lastAuthenticatedAt: row.last_authenticated_at,
      lastSeenAt: row.last_seen_at,
    })),
  );
}

async function exportAccount(context: WorkerRequestContext): Promise<Response> {
  const session = await requireFreshSession(context);
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  context.executionCtx.waitUntil((async () => {
    try {
      const account = await getAccount(context.env, session.user.id);
      await writer.write(encoder.encode(`${JSON.stringify({ type: "account", data: account })}\n`));
      await writeCreationExport(context, session.user.id, writer, encoder);
      for (const query of [
        { type: "comment", table: "comments", predicate: "author_user_id", idColumn: "id" },
        { type: "like", table: "likes", predicate: "user_id", idColumn: "creation_id" },
        { type: "following", table: "follows", predicate: "follower_user_id", idColumn: "followed_user_id" },
        { type: "follower", table: "follows", predicate: "followed_user_id", idColumn: "follower_user_id" },
        { type: "report", table: "reports", predicate: "reporter_user_id", idColumn: "id" },
        {
          type: "creation_image_upload_attempt",
          table: "creation_showcase_upload_attempts",
          predicate: "user_id",
          idColumn: "id",
        },
      ] satisfies ExportQuery[]) {
        await writePagedRows(
          context.env.DB,
          session.user.id,
          query,
          writer,
          encoder,
        );
      }
    } catch (error) {
      console.error(JSON.stringify({
        errorType: error instanceof Error ? error.name : "UnknownError",
        message: "account_export_failed",
        requestId: context.requestId,
      }));
      await writer.abort(error).catch(() => undefined);
      return;
    }
    await writer.close();
  })());

  return new Response(readable, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="tomodachi-account-${new Date().toISOString().slice(0, 10)}.ndjson"`,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Request-Id": context.requestId,
    },
  });
}

async function writeCreationExport(
  context: WorkerRequestContext,
  userId: string,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  let cursorCreatedAt: number | null = null;
  let cursorId = "";

  while (true) {
    const creations: D1Result<ExportCreationRow> = await context.env.DB.prepare(
      `SELECT c.*, cr.revision_number, co.object_key
       FROM creations c
       LEFT JOIN creation_revisions cr ON cr.id = c.current_revision_id
       LEFT JOIN creation_objects co ON co.revision_id = cr.id AND co.kind = 'project_json'
       WHERE c.owner_user_id = ?
         AND (? IS NULL OR c.created_at > ? OR (c.created_at = ? AND c.id > ?))
       ORDER BY c.created_at ASC, c.id ASC LIMIT ?`,
    ).bind(
      userId,
      cursorCreatedAt,
      cursorCreatedAt,
      cursorCreatedAt,
      cursorId,
      EXPORT_PAGE_SIZE,
    ).all<ExportCreationRow>();

    for (const creation of creations.results) {
      const { object_key: objectKey, ...metadata } = creation;
      await writeNdjson(writer, encoder, { type: "creation", data: metadata });
      if (objectKey) {
        const object = await context.env.PROJECTS.get(objectKey);
        if (object) {
          const text = await object.text();
          await writeNdjson(writer, encoder, {
            type: "project",
            creationId: metadata.id,
            data: JSON.parse(text),
          });
        }
      }
      await writeShowcaseImageExport(
        context,
        metadata.id as string,
        writer,
        encoder,
      );
    }

    const last: ExportCreationRow | undefined = creations.results.at(-1);
    if (!last || creations.results.length < EXPORT_PAGE_SIZE) return;
    cursorCreatedAt = last.created_at;
    cursorId = last.id;
  }
}

async function writeShowcaseImageExport(
  context: WorkerRequestContext,
  creationId: string,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  const images = await context.env.DB.prepare(
    `SELECT id, alt_text, sort_order, is_cover, source_width, source_height,
      created_at, updated_at
     FROM creation_showcase_images
     WHERE creation_id = ? AND status = 'ready'
     ORDER BY sort_order ASC, id ASC`,
  ).bind(creationId).all<ExportShowcaseImageRow>();
  for (const image of images.results) {
    await writeNdjson(writer, encoder, {
      type: "creation_image",
      creationId,
      data: {
        altText: image.alt_text,
        createdAt: image.created_at,
        height: image.source_height,
        id: image.id,
        isCover: Boolean(image.is_cover),
        sortOrder: image.sort_order,
        updatedAt: image.updated_at,
        width: image.source_width,
      },
    });
    const objects = await context.env.DB.prepare(
      `SELECT kind, object_key, content_type, byte_size, sha256
       FROM creation_showcase_objects
       WHERE image_id = ? AND status = 'ready' ORDER BY kind ASC`,
    ).bind(image.id).all<ExportShowcaseObjectRow>();
    for (const objectRow of objects.results) {
      await writeNdjson(writer, encoder, {
        type: "creation_image_object",
        creationId,
        imageId: image.id,
        data: {
          byteSize: objectRow.byte_size,
          contentType: objectRow.content_type,
          kind: objectRow.kind,
          sha256: objectRow.sha256,
        },
      });
      const object = await context.env.PROJECTS.get(objectRow.object_key);
      if (!object) continue;
      const reader = object.body.getReader();
      let sequence = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writeNdjson(writer, encoder, {
            type: "creation_image_object_chunk",
            creationId,
            imageId: image.id,
            kind: objectRow.kind,
            sequence,
            dataBase64: bytesToBase64(value),
          });
          sequence += 1;
        }
      } finally {
        reader.releaseLock();
      }
    }
  }
}

async function writePagedRows(
  db: D1Database,
  userId: string,
  query: ExportQuery,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  let cursorCreatedAt: number | null = null;
  let cursorId = "";

  while (true) {
    // Table and column names come only from the static allowlist above; all
    // user-controlled values remain bound parameters.
    const rows: D1Result<ExportPageRow> = await db.prepare(
      `SELECT *, ${query.idColumn} AS export_id FROM ${query.table}
       WHERE ${query.predicate} = ?
         AND (? IS NULL OR created_at > ? OR (created_at = ? AND ${query.idColumn} > ?))
       ORDER BY created_at ASC, ${query.idColumn} ASC LIMIT ?`,
    ).bind(
      userId,
      cursorCreatedAt,
      cursorCreatedAt,
      cursorCreatedAt,
      cursorId,
      EXPORT_PAGE_SIZE,
    ).all<ExportPageRow>();

    for (const row of rows.results) {
      const data: Record<string, unknown> = { ...row };
      delete data.export_id;
      await writeNdjson(writer, encoder, { type: query.type, data });
    }

    const last: ExportPageRow | undefined = rows.results.at(-1);
    if (!last || rows.results.length < EXPORT_PAGE_SIZE) return;
    cursorCreatedAt = last.created_at;
    cursorId = last.export_id;
  }
}

function writeNdjson(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  value: unknown,
): Promise<void> {
  return writer.write(encoder.encode(`${JSON.stringify(value)}\n`));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
  }
  return btoa(binary);
}

async function requestDeletion(context: WorkerRequestContext): Promise<Response> {
  const session = await requireFreshSession(context);
  const now = Date.now();
  const dueAt = now + 7 * 24 * 60 * 60 * 1_000;
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE users SET deletion_previous_status = status,
       status = 'deletion_pending', deletion_requested_at = ?,
       deletion_due_at = ?, updated_at = ?
       WHERE id = ? AND status IN ('active', 'suspended')`,
    ).bind(now, dueAt, now, session.user.id),
    context.env.DB.prepare(
      `UPDATE creations SET
       state = CASE WHEN state = 'hidden' THEN 'hidden' ELSE 'draft' END,
       visibility = 'private',
       published_at = NULL, updated_at = ? WHERE owner_user_id = ? AND state != 'deleted'`,
    ).bind(now, session.user.id),
    context.env.DB.prepare(
      `DELETE FROM creation_search WHERE creation_id IN (
         SELECT id FROM creations WHERE owner_user_id = ?
       )`,
    ).bind(session.user.id),
    context.env.DB.prepare(
      "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    ).bind(now, session.user.id),
  ]);
  const response = success(context.requestId, { deletionDueAt: dueAt }, 202);
  response.headers.append(
    "Set-Cookie",
    cookie(new URL(context.env.PUBLIC_SITE_URL).protocol === "https:" ? "__Host-tomodachi.sid" : "tomodachi.sid", "", {
      maxAge: 0,
      secure: new URL(context.env.PUBLIC_SITE_URL).protocol === "https:",
    }),
  );
  return response;
}

async function cancelDeletion(context: WorkerRequestContext): Promise<Response> {
  const session = await requireFreshSession(context);
  const now = Date.now();
  const result = await context.env.DB.prepare(
    `UPDATE users SET
     status = CASE
       WHEN deletion_previous_status = 'suspended' THEN 'suspended'
       ELSE 'active'
     END,
     deletion_previous_status = NULL, deletion_requested_at = NULL,
     deletion_due_at = NULL, updated_at = ?
     WHERE id = ? AND status = 'deletion_pending' AND deletion_due_at > ?`,
  ).bind(now, session.user.id, now).run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new HttpError(409, "deletion_not_cancelable", "Account deletion cannot be canceled.");
  }
  return success(context.requestId, await getAccount(context.env, session.user.id));
}

async function getPublicProfile(context: WorkerRequestContext): Promise<Response> {
  const username = normalizeUsername(context.params.username);
  const user = await publicProfile(context.env, username);
  if (!user) throw new HttpError(404, "profile_not_found", "Profile was not found.");
  const creations = await context.env.DB.prepare(
    `${CREATION_SELECT}
     WHERE c.owner_user_id = ? AND c.state = 'published' AND c.visibility = 'public'
     ORDER BY c.published_at DESC, c.id DESC LIMIT 24`,
  ).bind(user.id).all<CreationRow>();
  const viewer = await optionalSession(context);
  const isFollowing = viewer
    ? Boolean(await context.env.DB.prepare(
        "SELECT 1 AS found FROM follows WHERE follower_user_id = ? AND followed_user_id = ?",
      ).bind(viewer.user.id, user.id).first<{ found: number }>())
    : false;
  return success(context.requestId, {
    creations: creations.results.map(creationToApi),
    user: {
      ...publicProfileToApi(user),
      creationCount: user.creation_count,
      isFollowing,
    },
  });
}

async function getPublicProfileCreations(context: WorkerRequestContext): Promise<Response> {
  const username = normalizeUsername(context.params.username);
  const user = await publicProfile(context.env, username);
  if (!user) throw new HttpError(404, "profile_not_found", "Profile was not found.");
  const limit = normalizeLimit(context.url.searchParams.get("limit"));
  const cursor = parseTimestampCursor(context.url.searchParams.get("cursor"));
  const cursorClause = cursor
    ? "AND (c.published_at < ? OR (c.published_at = ? AND c.id < ?))"
    : "";
  const values: unknown[] = [user.id];
  if (cursor) values.push(cursor.sortValue, cursor.sortValue, cursor.id);
  values.push(limit + 1);
  const creations = await context.env.DB.prepare(
    `${CREATION_SELECT}
     WHERE c.owner_user_id = ? AND c.state = 'published' AND c.visibility = 'public'
     ${cursorClause} ORDER BY c.published_at DESC, c.id DESC LIMIT ?`,
  ).bind(...values).all<CreationRow>();
  const hasMore = creations.results.length > limit;
  const page = creations.results.slice(0, limit);
  const last = page.at(-1);
  return success(context.requestId, page.map(creationToApi), 200, {
    hasMore,
    limit,
    nextCursor: hasMore && last
      ? encodeCursor({ id: last.id, sortValue: last.published_at ?? 0 })
      : null,
  });
}

async function followUser(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  await enforceRateLimit(context.env.SOCIAL_RATE_LIMITER, session.user.id);
  const target = await publicProfile(context.env, normalizeUsername(context.params.username));
  if (!target) throw new HttpError(404, "profile_not_found", "Profile was not found.");
  if (target.id === session.user.id) {
    throw new HttpError(400, "cannot_follow_self", "You cannot follow yourself.");
  }
  const result = await context.env.DB.prepare(
    "INSERT OR IGNORE INTO follows (follower_user_id, followed_user_id, created_at) VALUES (?, ?, ?)",
  ).bind(session.user.id, target.id, Date.now()).run();
  return success(context.requestId, { following: true, changed: (result.meta.changes ?? 0) === 1 });
}

async function unfollowUser(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  await enforceRateLimit(context.env.SOCIAL_RATE_LIMITER, session.user.id);
  const target = await publicProfile(context.env, normalizeUsername(context.params.username));
  if (!target) throw new HttpError(404, "profile_not_found", "Profile was not found.");
  const result = await context.env.DB.prepare(
    "DELETE FROM follows WHERE follower_user_id = ? AND followed_user_id = ?",
  ).bind(session.user.id, target.id).run();
  return success(context.requestId, { following: false, changed: (result.meta.changes ?? 0) === 1 });
}

async function listFollowers(context: WorkerRequestContext): Promise<Response> {
  return listConnections(context, "followers");
}

async function listFollowing(context: WorkerRequestContext): Promise<Response> {
  return listConnections(context, "following");
}

async function listConnections(
  context: WorkerRequestContext,
  direction: "followers" | "following",
): Promise<Response> {
  await enforceRateLimit(
    context.env.DISCOVERY_RATE_LIMITER,
    await clientKey(context.env, context.request),
  );
  const target = await publicProfile(context.env, normalizeUsername(context.params.username));
  if (!target) throw new HttpError(404, "profile_not_found", "Profile was not found.");
  const limit = normalizeLimit(context.url.searchParams.get("limit"));
  const cursor = parseTimestampCursor(context.url.searchParams.get("cursor"));
  const join = direction === "followers"
    ? "JOIN users u ON u.id = f.follower_user_id WHERE f.followed_user_id = ?"
    : "JOIN users u ON u.id = f.followed_user_id WHERE f.follower_user_id = ?";
  const cursorClause = cursor
    ? "AND (f.created_at < ? OR (f.created_at = ? AND u.id < ?))"
    : "";
  const values: unknown[] = [target.id];
  if (cursor) values.push(cursor.sortValue, cursor.sortValue, cursor.id);
  values.push(limit + 1);
  const rows = await context.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.avatar_seed, f.created_at AS followed_at
     FROM follows f ${join} AND u.status = 'active' ${cursorClause}
     ORDER BY f.created_at DESC, u.id DESC LIMIT ?`,
  ).bind(...values).all<{
    avatar_seed: string;
    display_name: string;
    followed_at: number;
    id: string;
    username: string;
  }>();
  const hasMore = rows.results.length > limit;
  const page = rows.results.slice(0, limit);
  const last = page.at(-1);
  return success(context.requestId, page.map((row) => ({
    avatarSeed: row.avatar_seed,
    displayName: row.display_name,
    id: row.id,
    username: row.username,
  })), 200, {
    hasMore,
    limit,
    nextCursor: hasMore && last
      ? encodeCursor({ id: last.id, sortValue: last.followed_at })
      : null,
  });
}

async function getAccount(env: Env, userId: string): Promise<ReturnType<typeof accountToApi> | null> {
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.bio, u.role, u.status,
     u.avatar_seed, u.terms_version, u.terms_accepted_at, u.deletion_due_at,
     u.created_at, u.updated_at, ei.email
     FROM users u JOIN external_identities ei
       ON ei.user_id = u.id AND ei.provider = 'google'
     WHERE u.id = ? AND u.status != 'deleted' LIMIT 1`,
  ).bind(userId).first<AccountRow>();
  return row ? accountToApi(row, env.TERMS_VERSION) : null;
}

function accountToApi(row: AccountRow, requiredTermsVersion: string) {
  return {
    avatarSeed: row.avatar_seed,
    bio: row.bio,
    createdAt: row.created_at,
    deletionDueAt: row.deletion_due_at,
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    role: row.role,
    status: row.status,
    requiredTermsVersion,
    termsAccepted:
      row.terms_accepted_at !== null && row.terms_version === requiredTermsVersion,
    termsAcceptedAt: row.terms_accepted_at,
    termsVersion: row.terms_version,
    updatedAt: row.updated_at,
    username: row.username,
  };
}

async function publicProfile(env: Env, username: string): Promise<PublicProfileRow | null> {
  return env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.bio, u.avatar_seed, u.created_at,
      (SELECT COUNT(*) FROM follows WHERE followed_user_id = u.id) AS follower_count,
      (SELECT COUNT(*) FROM follows WHERE follower_user_id = u.id) AS following_count,
      (SELECT COUNT(*) FROM creations c WHERE c.owner_user_id = u.id
        AND c.state = 'published' AND c.visibility = 'public') AS creation_count
     FROM users u WHERE u.username = ? COLLATE NOCASE AND u.status = 'active' LIMIT 1`,
  ).bind(username).first<PublicProfileRow>();
}

function publicProfileToApi(row: PublicProfileRow) {
  return {
    avatarSeed: row.avatar_seed,
    bio: row.bio,
    createdAt: row.created_at,
    displayName: row.display_name,
    followerCount: row.follower_count,
    followingCount: row.following_count,
    id: row.id,
    username: row.username,
  };
}

async function availableUsernameSuggestions(env: Env, requested: string): Promise<string[]> {
  const rows = await env.DB.prepare(
    `WITH RECURSIVE suffixes(value) AS (
       SELECT 2
       UNION ALL
       SELECT value + 1 FROM suffixes WHERE value < 999
     ), candidates(value, username) AS (
       SELECT value,
         RTRIM(SUBSTR(?, 1, ? - LENGTH('-' || value)), '-_') || '-' || value
       FROM suffixes
     )
     SELECT candidates.username
     FROM candidates
     LEFT JOIN users ON users.username = candidates.username COLLATE NOCASE
     WHERE users.id IS NULL
     ORDER BY candidates.value ASC
     LIMIT 3`,
  ).bind(requested, COMMUNITY_LIMITS.usernameMaximum).all<{ username: string }>();
  return rows.results.map((row) => row.username);
}

function parseTimestampCursor(value: string | null): { id: string; sortValue: number } | null {
  if (!value) return null;
  try {
    const cursor = decodeCursor(value);
    if (typeof cursor.sortValue !== "number") throw new Error("Invalid timestamp cursor");
    return { id: cursor.id, sortValue: cursor.sortValue };
  } catch {
    throw new HttpError(400, "invalid_cursor", "Pagination cursor is invalid.");
  }
}
