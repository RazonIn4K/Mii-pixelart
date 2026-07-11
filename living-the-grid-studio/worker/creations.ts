import {
  COMMUNITY_LIMITS,
  CanonicalGridDocumentSchema,
  CreateCreationSchema,
  PublishCreationSchema,
  SaveProjectSchema,
  UpdateCreationSchema,
  decodeCursor,
  encodeCursor,
  type CanonicalGridDocument,
} from "../shared/community";
import {
  enforceRateLimit,
  optionalSession,
  requireOnboardedSession,
} from "./auth";
import { randomToken, sha256 } from "./crypto";
import {
  CREATION_SELECT,
  creationToApi,
  getCreationById,
  getCreationBySlug,
  type CreationRow,
} from "./db";
import {
  HttpError,
  normalizeLimit,
  parseJson,
  success,
  type WorkerRequestContext,
} from "./http";
import {
  renderGridSvg,
  storeRevisionObjects,
  type StoredCreationObject,
} from "./media";
import type { Router } from "./router";

interface QuotaRow {
  bytes_total: number;
  creation_count: number;
}

interface ObjectRow {
  content_type: string;
  object_key: string;
}

const PROJECT_REQUEST_LIMIT = COMMUNITY_LIMITS.gridDocumentBytes + 32_768;

export function registerCreationRoutes(router: Router): void {
  router
    .add("POST", "/api/creations", createCreation)
    .add("GET", "/api/creations", listCreations)
    .add("GET", "/api/public/creations/:slug", getPublishedCreation)
    .add("GET", "/api/creations/slug/:slug", getPublishedCreation)
    .add("GET", "/api/creations/:id", getCreation)
    .add("PATCH", "/api/creations/:id", updateCreation)
    .add("DELETE", "/api/creations/:id", deleteCreation)
    .add("GET", "/api/creations/:id/project", downloadProject)
    .add("PUT", "/api/creations/:id/project", saveProject)
    .add("POST", "/api/creations/:id/publish", publishCreation)
    .add("POST", "/api/creations/:id/unpublish", unpublishCreation)
    .add("GET", "/api/creations/:id/media/:variant", serveCreationMedia);
}

async function createCreation(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  await enforceRateLimit(context.env.SAVE_RATE_LIMITER, session.user.id);
  const input = await parseJson(context.request, CreateCreationSchema, PROJECT_REQUEST_LIMIT);
  const quota = await getQuota(context.env, session.user.id);
  if (quota.creation_count >= COMMUNITY_LIMITS.creationsPerUser) {
    throw new HttpError(409, "creation_quota_exceeded", "Cloud creation limit reached.");
  }

  const now = Date.now();
  const creationId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const slug = randomToken(13);
  const canonicalJson = JSON.stringify(input.project);
  const projectBytes = new TextEncoder().encode(canonicalJson).byteLength;
  const title = (input.title ?? input.project.meta.name).slice(0, COMMUNITY_LIMITS.creationTitleCharacters);

  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO creations
       (id, owner_user_id, slug, title, description, state, visibility,
        comments_enabled, project_download_enabled, current_revision_id,
        bytes_total, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', 'draft', 'private', 0, 0, NULL, 0, ?, ?)`,
    ).bind(creationId, session.user.id, slug, title, now, now),
    context.env.DB.prepare(
      `INSERT INTO creation_revisions
       (id, creation_id, revision_number, status, project_bytes, created_at)
       VALUES (?, ?, 1, 'uploading', ?, ?)`,
    ).bind(revisionId, creationId, projectBytes, now),
    context.env.DB.prepare(
      `INSERT INTO creation_stats
       (creation_id, like_count, comment_count, popularity_score, updated_at)
       VALUES (?, 0, 0, 0, ?)`,
    ).bind(creationId, now),
  ]);

  let storedObjects: StoredCreationObject[] = [];
  try {
    const objects = await storeRevisionObjects(
      context.env,
      creationId,
      revisionId,
      input.project,
      canonicalJson,
    );
    storedObjects = objects;
    const bytesTotal = totalObjectBytes(objects);
    if (quota.bytes_total + bytesTotal > COMMUNITY_LIMITS.cloudBytesPerUser) {
      await context.env.PROJECTS.delete(objects.map((object) => object.key));
      throw new HttpError(409, "storage_quota_exceeded", "Cloud storage limit reached.");
    }
    await commitRevision(context.env, {
      bytesTotal,
      creationId,
      objects,
      oldRevisionId: null,
      projectSha256: await sha256(canonicalJson),
      revisionId,
      revisionNumber: 1,
    });
  } catch (error) {
    if (storedObjects.length) {
      await context.env.PROJECTS.delete(storedObjects.map((object) => object.key));
    }
    await context.env.DB.prepare("DELETE FROM creations WHERE id = ?")
      .bind(creationId)
      .run();
    throw error;
  }

  const created = await getCreationById(context.env, creationId);
  const response = success(context.requestId, creationToApi(created!), 201);
  response.headers.set("ETag", revisionEtag(1));
  response.headers.set("Location", `/api/creations/${creationId}`);
  return response;
}

async function saveProject(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  await enforceRateLimit(context.env.SAVE_RATE_LIMITER, session.user.id);
  const input = await parseJson(context.request, SaveProjectSchema, PROJECT_REQUEST_LIMIT);
  const creation = await ownerCreation(context, session.user.id);
  const currentRevision = creation.revision_number;
  assertRevisionMatch(context.request, currentRevision);

  const revisionNumber = (currentRevision ?? 0) + 1;
  const revisionId = crypto.randomUUID();
  const now = Date.now();
  const canonicalJson = JSON.stringify(input.project);
  const projectBytes = new TextEncoder().encode(canonicalJson).byteLength;
  try {
    await context.env.DB.prepare(
      `INSERT INTO creation_revisions
       (id, creation_id, revision_number, status, project_bytes, created_at)
       VALUES (?, ?, ?, 'uploading', ?, ?)`,
    ).bind(revisionId, creation.id, revisionNumber, projectBytes, now).run();
  } catch (error) {
    if (error instanceof Error && /unique constraint/iu.test(error.message)) {
      throw new HttpError(409, "revision_conflict", "The cloud project has a newer revision.");
    }
    throw error;
  }

  let storedObjects: StoredCreationObject[] = [];
  try {
    const objects = await storeRevisionObjects(
      context.env,
      creation.id,
      revisionId,
      input.project,
      canonicalJson,
    );
    storedObjects = objects;
    const bytesTotal = totalObjectBytes(objects);
    const quota = await getQuota(context.env, session.user.id);
    if (quota.bytes_total + bytesTotal > COMMUNITY_LIMITS.cloudBytesPerUser) {
      await context.env.PROJECTS.delete(objects.map((object) => object.key));
      throw new HttpError(409, "storage_quota_exceeded", "Cloud storage limit reached.");
    }
    await commitRevision(context.env, {
      bytesTotal,
      creationId: creation.id,
      objects,
      oldRevisionId: creation.current_revision_id,
      projectSha256: await sha256(canonicalJson),
      revisionId,
      revisionNumber,
    });
  } catch (error) {
    if (storedObjects.length) {
      await context.env.PROJECTS.delete(storedObjects.map((object) => object.key));
    }
    await context.env.DB.prepare(
      "UPDATE creation_revisions SET status = 'failed' WHERE id = ? AND status = 'uploading'",
    ).bind(revisionId).run();
    throw error;
  }

  const saved = await getCreationById(context.env, creation.id);
  const response = success(context.requestId, creationToApi(saved!));
  response.headers.set("ETag", revisionEtag(revisionNumber));
  return response;
}

async function getCreation(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  const creation = await getCreationById(context.env, context.params.id);
  if (!creation) throw new HttpError(404, "creation_not_found", "Creation was not found.");
  if (creation.owner_user_id !== session.user.id) {
    throw new HttpError(403, "creation_forbidden", "You cannot access this creation.");
  }
  const project = await loadCurrentProject(context.env, creation);
  const response = success(context.requestId, {
    creation: creationToApi(creation),
    project,
  });
  if (creation.revision_number) response.headers.set("ETag", revisionEtag(creation.revision_number));
  return response;
}

async function listCreations(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  if (context.url.searchParams.get("owner") !== "me") {
    throw new HttpError(400, "invalid_owner_filter", "Only owner=me is supported.");
  }
  const visibility = context.url.searchParams.get("visibility") ?? "all";
  if (!["all", "private", "unlisted", "public"].includes(visibility)) {
    throw new HttpError(400, "invalid_visibility", "Visibility filter is invalid.");
  }
  const limit = normalizeLimit(context.url.searchParams.get("limit"));
  const cursor = parseCreationCursor(context.url.searchParams.get("cursor"));
  const visibilityClause = visibility === "all" ? "" : "AND c.visibility = ?";
  const cursorClause = cursor
    ? "AND (c.updated_at < ? OR (c.updated_at = ? AND c.id < ?))"
    : "";
  const values: unknown[] = [session.user.id];
  if (visibility !== "all") values.push(visibility);
  if (cursor) values.push(cursor.sortValue, cursor.sortValue, cursor.id);
  values.push(limit + 1);
  const rows = await context.env.DB.prepare(
    `${CREATION_SELECT}
     WHERE c.owner_user_id = ? AND c.state != 'deleted' ${visibilityClause} ${cursorClause}
     ORDER BY c.updated_at DESC, c.id DESC LIMIT ?`,
  ).bind(...values).all<CreationRow>();
  const hasMore = rows.results.length > limit;
  const page = rows.results.slice(0, limit);
  const last = page.at(-1);
  return success(context.requestId, page.map(creationToApi), 200, {
    hasMore,
    limit,
    nextCursor: hasMore && last
      ? encodeCursor({ id: last.id, sortValue: last.updated_at })
      : null,
  });
}

async function updateCreation(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  const creation = await ownerCreation(context, session.user.id);
  const input = await parseJson(context.request, UpdateCreationSchema, 25_000);
  if (
    input.commentsEnabled !== undefined
    && creation.comments_locked
    && input.commentsEnabled !== Boolean(creation.comments_enabled)
  ) {
    throw new HttpError(409, "comments_locked", "A moderator locked comments for this creation.");
  }
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [field, value] of [
    ["title", input.title],
    ["description", input.description],
    ["comments_enabled", input.commentsEnabled === undefined ? undefined : Number(input.commentsEnabled)],
    ["project_download_enabled", input.projectDownloadEnabled === undefined ? undefined : Number(input.projectDownloadEnabled)],
  ] as const) {
    if (value !== undefined) {
      updates.push(`${field} = ?`);
      values.push(value);
    }
  }
  updates.push("updated_at = ?");
  values.push(Date.now(), creation.id);
  const statements: D1PreparedStatement[] = [
    context.env.DB.prepare(`UPDATE creations SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...values),
  ];
  if (
    creation.state === "published"
    && creation.visibility === "public"
    && (input.title !== undefined || input.description !== undefined)
  ) {
    statements.push(
      context.env.DB.prepare("DELETE FROM creation_search WHERE creation_id = ?").bind(creation.id),
      context.env.DB.prepare(
        `INSERT INTO creation_search (creation_id, title, description, username, tags)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        creation.id,
        input.title ?? creation.title,
        input.description ?? creation.description,
        creation.username ?? "",
        creation.tag_slugs.replaceAll(",", " "),
      ),
    );
  }
  await context.env.DB.batch(statements);
  return success(context.requestId, creationToApi((await getCreationById(context.env, creation.id))!));
}

async function publishCreation(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  const creation = await ownerCreation(context, session.user.id);
  if (!creation.current_revision_id) {
    throw new HttpError(409, "project_required", "Save the project before publishing.");
  }
  const input = await parseJson(context.request, PublishCreationSchema, 25_000);
  if (creation.comments_locked && input.commentsEnabled !== Boolean(creation.comments_enabled)) {
    throw new HttpError(409, "comments_locked", "A moderator locked comments for this creation.");
  }
  const tags = await loadActiveTags(context.env, input.tags);
  if (tags.length !== input.tags.length) {
    throw new HttpError(400, "invalid_tags", "One or more tags are unavailable.");
  }
  const now = Date.now();
  const commentsEnabled = input.commentsEnabled ?? input.visibility === "public";
  const statements: D1PreparedStatement[] = [
    context.env.DB.prepare(
      `UPDATE creations SET title = ?, description = ?, state = 'published',
       visibility = ?, comments_enabled = ?, project_download_enabled = ?,
       published_at = COALESCE(published_at, ?), hidden_at = NULL, updated_at = ?
       WHERE id = ? AND owner_user_id = ?`,
    ).bind(
      input.title,
      input.description,
      input.visibility,
      Number(commentsEnabled),
      Number(input.projectDownloadEnabled),
      now,
      now,
      creation.id,
      session.user.id,
    ),
    context.env.DB.prepare("DELETE FROM creation_tags WHERE creation_id = ?").bind(creation.id),
    context.env.DB.prepare("DELETE FROM creation_search WHERE creation_id = ?").bind(creation.id),
  ];
  for (const tag of tags) {
    statements.push(
      context.env.DB.prepare(
        "INSERT INTO creation_tags (creation_id, tag_id, created_at) VALUES (?, ?, ?)",
      ).bind(creation.id, tag.id, now),
    );
  }
  if (input.visibility === "public") {
    statements.push(
      context.env.DB.prepare(
        `INSERT INTO creation_search (creation_id, title, description, username, tags)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        creation.id,
        input.title,
        input.description,
        session.user.username ?? "",
        tags.map((tag) => tag.slug).join(" "),
      ),
    );
  }
  await context.env.DB.batch(statements);
  return success(
    context.requestId,
    creationToApi((await getCreationById(context.env, creation.id))!),
  );
}

async function unpublishCreation(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  const creation = await ownerCreation(context, session.user.id);
  const now = Date.now();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE creations SET state = 'draft', visibility = 'private',
       comments_enabled = 0, published_at = NULL, updated_at = ? WHERE id = ?`,
    ).bind(now, creation.id),
    context.env.DB.prepare("DELETE FROM creation_tags WHERE creation_id = ?").bind(creation.id),
    context.env.DB.prepare("DELETE FROM creation_search WHERE creation_id = ?").bind(creation.id),
  ]);
  return success(context.requestId, creationToApi((await getCreationById(context.env, creation.id))!));
}

async function deleteCreation(context: WorkerRequestContext): Promise<Response> {
  const session = await requireOnboardedSession(context);
  const creation = await ownerCreation(context, session.user.id);
  const now = Date.now();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE creations SET state = 'deleted', visibility = 'private', deleted_at = ?,
       published_at = NULL, updated_at = ? WHERE id = ?`,
    ).bind(now, now, creation.id),
    context.env.DB.prepare("DELETE FROM creation_search WHERE creation_id = ?").bind(creation.id),
  ]);
  return success(context.requestId, { deletedAt: now, id: creation.id });
}

async function getPublishedCreation(context: WorkerRequestContext): Promise<Response> {
  const creation = await getCreationBySlug(context.env, context.params.slug);
  if (!creation || creation.state !== "published" || creation.visibility === "private") {
    throw new HttpError(404, "creation_not_found", "Creation was not found.");
  }
  const viewer = await optionalSession(context);
  let liked = false;
  if (viewer) {
    liked = Boolean(await context.env.DB.prepare(
      "SELECT 1 AS found FROM likes WHERE user_id = ? AND creation_id = ?",
    ).bind(viewer.user.id, creation.id).first<{ found: number }>());
  }
  return success(context.requestId, {
    ...creationToApi(creation),
    likedByViewer: liked,
    socialImageUrl: `/api/creations/${creation.id}/media/social`,
  });
}

async function downloadProject(context: WorkerRequestContext): Promise<Response> {
  const creation = await getCreationById(context.env, context.params.id);
  if (!creation || !creation.current_revision_id || !creation.revision_number) {
    throw new HttpError(404, "creation_not_found", "Creation was not found.");
  }
  const viewer = await optionalSession(context);
  const isOwner = Boolean(viewer && viewer.user.id === creation.owner_user_id);
  const isPublished = creation.state === "published" && creation.visibility !== "private";
  if (!isOwner && (!isPublished || !creation.project_download_enabled)) {
    throw new HttpError(404, "creation_not_found", "Creation was not found.");
  }

  const row = await context.env.DB.prepare(
    `SELECT object_key, content_type FROM creation_objects
     WHERE revision_id = ? AND kind = 'project_json' AND status = 'ready' LIMIT 1`,
  ).bind(creation.current_revision_id).first<ObjectRow>();
  if (!row) throw new HttpError(404, "media_not_found", "Project was not found.");
  const object = await context.env.PROJECTS.get(row.object_key);
  if (!object) throw new HttpError(404, "media_not_found", "Project was not found.");

  return new Response(object.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${safeFilename(creation.title)}.json"`,
      "Content-Type": "application/json; charset=utf-8",
      ETag: revisionEtag(creation.revision_number),
    },
  });
}

async function serveCreationMedia(context: WorkerRequestContext): Promise<Response> {
  const creation = await getCreationById(context.env, context.params.id);
  if (!creation) throw new HttpError(404, "creation_not_found", "Creation was not found.");
  const viewer = await optionalSession(context);
  const isOwner = Boolean(viewer && viewer.user.id === creation.owner_user_id);
  const isPublished = creation.state === "published" && creation.visibility !== "private";
  if (!isOwner && !isPublished) {
    throw new HttpError(404, "creation_not_found", "Creation was not found.");
  }

  const variantMap = {
    preview: "preview",
    project: "project_json",
    social: "social",
    thumb: "thumb",
  } as const;
  const kind = variantMap[context.params.variant as keyof typeof variantMap];
  if (!kind) throw new HttpError(404, "media_not_found", "Media variant was not found.");
  if (kind === "project_json" && !isOwner && !creation.project_download_enabled) {
    throw new HttpError(403, "download_disabled", "Project downloads are disabled.");
  }
  if (!creation.current_revision_id) throw new HttpError(404, "media_not_found", "Media was not found.");

  const row = await context.env.DB.prepare(
    `SELECT object_key, content_type FROM creation_objects
     WHERE revision_id = ? AND kind = ? AND status = 'ready' LIMIT 1`,
  ).bind(creation.current_revision_id, kind).first<ObjectRow>();
  if (!row && kind !== "project_json" && context.env.ENVIRONMENT === "local") {
    return dynamicSvgFallback(context, creation);
  }
  if (!row) throw new HttpError(404, "media_not_found", "Media was not found.");
  const object = await context.env.PROJECTS.get(row.object_key);
  if (!object) throw new HttpError(404, "media_not_found", "Media was not found.");

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", row.content_type);
  headers.set("ETag", object.httpEtag);
  if (kind === "project_json") {
    headers.set("Cache-Control", "no-store");
    headers.set("Content-Disposition", `attachment; filename="${safeFilename(creation.title)}.json"`);
  } else if (isPublished && creation.visibility === "public") {
    headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  } else {
    headers.set("Cache-Control", "private, no-store");
  }
  return new Response(object.body, { headers });
}

async function dynamicSvgFallback(
  context: WorkerRequestContext,
  creation: CreationRow,
): Promise<Response> {
  const projectRow = await context.env.DB.prepare(
    `SELECT object_key FROM creation_objects
     WHERE revision_id = ? AND kind = 'project_json' AND status = 'ready' LIMIT 1`,
  ).bind(creation.current_revision_id).first<{ object_key: string }>();
  if (!projectRow) throw new HttpError(404, "media_not_found", "Media was not found.");
  const object = await context.env.PROJECTS.get(projectRow.object_key);
  if (!object) throw new HttpError(404, "media_not_found", "Media was not found.");
  const project = CanonicalGridDocumentSchema.parse(JSON.parse(await object.text()));
  return new Response(renderGridSvg(project), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}

async function ownerCreation(
  context: WorkerRequestContext,
  userId: string,
): Promise<CreationRow> {
  const creation = await getCreationById(context.env, context.params.id);
  if (!creation || creation.state === "deleted") {
    throw new HttpError(404, "creation_not_found", "Creation was not found.");
  }
  if (creation.owner_user_id !== userId) {
    throw new HttpError(403, "creation_forbidden", "You cannot change this creation.");
  }
  return creation;
}

function assertRevisionMatch(request: Request, currentRevision: number | null): void {
  if (currentRevision === null) return;
  const provided = request.headers.get("if-match");
  if (provided !== revisionEtag(currentRevision)) {
    throw new HttpError(409, "revision_conflict", "The cloud project has a newer revision.");
  }
}

function revisionEtag(revision: number): string {
  return `"rev-${revision}"`;
}

async function commitRevision(
  env: Env,
  input: {
    bytesTotal: number;
    creationId: string;
    objects: StoredCreationObject[];
    oldRevisionId: string | null;
    projectSha256: string;
    revisionId: string;
    revisionNumber: number;
  },
): Promise<void> {
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE creation_revisions SET status = 'ready', project_sha256 = ?, ready_at = ?
       WHERE id = ? AND status = 'uploading'`,
    ).bind(input.projectSha256, now, input.revisionId),
    env.DB.prepare(
      `UPDATE creations SET current_revision_id = ?, bytes_total = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(input.revisionId, input.bytesTotal, now, input.creationId),
  ];
  if (input.oldRevisionId) {
    statements.push(
      env.DB.prepare(
        "UPDATE creation_revisions SET status = 'obsolete', obsolete_at = ? WHERE id = ? AND status = 'ready'",
      ).bind(now, input.oldRevisionId),
    );
  }
  for (const object of input.objects) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO creation_objects
         (id, creation_id, revision_id, kind, object_key, content_type,
          byte_size, sha256, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        input.creationId,
        input.revisionId,
        object.kind,
        object.key,
        object.contentType,
        object.byteSize,
        object.sha256,
        now,
        now,
      ),
    );
  }
  await env.DB.batch(statements);
}

async function getQuota(env: Env, userId: string): Promise<QuotaRow> {
  return (await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM creations WHERE owner_user_id = ?) AS creation_count,
       COALESCE((
         SELECT SUM(co.byte_size) FROM creation_objects co
         JOIN creations c ON c.id = co.creation_id
         WHERE c.owner_user_id = ?
       ), 0) AS bytes_total`,
  ).bind(userId, userId).first<QuotaRow>()) ?? { bytes_total: 0, creation_count: 0 };
}

async function loadActiveTags(
  env: Env,
  slugs: string[],
): Promise<{ id: string; slug: string }[]> {
  if (slugs.length === 0) return [];
  const placeholders = slugs.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT id, slug FROM tags WHERE is_active = 1 AND slug IN (${placeholders})`,
  ).bind(...slugs).all<{ id: string; slug: string }>();
  return rows.results;
}

async function loadCurrentProject(
  env: Env,
  creation: CreationRow,
): Promise<CanonicalGridDocument | null> {
  if (!creation.current_revision_id) return null;
  const row = await env.DB.prepare(
    `SELECT object_key FROM creation_objects
     WHERE revision_id = ? AND kind = 'project_json' AND status = 'ready' LIMIT 1`,
  ).bind(creation.current_revision_id).first<{ object_key: string }>();
  if (!row) return null;
  const object = await env.PROJECTS.get(row.object_key);
  if (!object) return null;
  return CanonicalGridDocumentSchema.parse(JSON.parse(await object.text()));
}

function totalObjectBytes(objects: StoredCreationObject[]): number {
  return objects.reduce((total, object) => total + object.byteSize, 0);
}

function safeFilename(title: string): string {
  return title.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 64) || "tomodachi-project";
}

function parseCreationCursor(value: string | null): { id: string; sortValue: number } | null {
  if (!value) return null;
  try {
    const cursor = decodeCursor(value);
    if (typeof cursor.sortValue !== "number") throw new Error("Invalid creation cursor");
    return { id: cursor.id, sortValue: cursor.sortValue };
  } catch {
    throw new HttpError(400, "invalid_cursor", "Pagination cursor is invalid.");
  }
}
