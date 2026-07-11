import {
  PaginationQuerySchema,
  SearchQuerySchema,
  decodeCursor,
  encodeCursor,
} from "../shared/community";
import { clientKey, enforceRateLimit, optionalSession } from "./auth";
import { CREATION_SELECT, creationToApi, type CreationRow } from "./db";
import { HttpError, success, type WorkerRequestContext } from "./http";
import type { Router } from "./router";

export function registerDiscoveryRoutes(router: Router): void {
  router
    .add("GET", "/api/discover/recent", recentCreations)
    .add("GET", "/api/discover/popular", popularCreations)
    .add("GET", "/api/search", searchCreations)
    .add("GET", "/api/tags", listTags)
    .add("GET", "/api/tags/:slug", creationsByTag)
    .add("GET", "/api/tags/:slug/creations", creationsByTag);
}

async function listTags(context: WorkerRequestContext): Promise<Response> {
  await discoveryLimit(context);
  const rows = await context.env.DB.prepare(
    "SELECT slug, name, description FROM tags WHERE is_active = 1 ORDER BY name ASC",
  ).all<{ description: string; name: string; slug: string }>();
  return success(context.requestId, rows.results);
}

async function recentCreations(context: WorkerRequestContext): Promise<Response> {
  await discoveryLimit(context);
  const pagination = parsePagination(context);
  const cursor = parseCursor(pagination.cursor);
  const values: unknown[] = [];
  let cursorClause = "";
  if (cursor) {
    if (typeof cursor.sortValue !== "number") throw invalidCursor();
    cursorClause = "AND (c.published_at < ? OR (c.published_at = ? AND c.id < ?))";
    values.push(cursor.sortValue, cursor.sortValue, cursor.id);
  }
  values.push(pagination.limit + 1);
  return creationListResponse(
    context,
    await context.env.DB.prepare(
      `${CREATION_SELECT}
       WHERE c.state = 'published' AND c.visibility = 'public' ${cursorClause}
       ORDER BY c.published_at DESC, c.id DESC LIMIT ?`,
    ).bind(...values).all<CreationRow>(),
    pagination.limit,
    (row) => row.published_at ?? 0,
  );
}

async function popularCreations(context: WorkerRequestContext): Promise<Response> {
  await discoveryLimit(context);
  const pagination = parsePagination(context);
  const cursor = parseCursor(pagination.cursor);
  const values: unknown[] = [];
  let cursorClause = "";
  if (cursor) {
    if (typeof cursor.sortValue !== "number") throw invalidCursor();
    cursorClause = "AND (COALESCE(cs.popularity_score, 0) < ? OR (COALESCE(cs.popularity_score, 0) = ? AND c.id < ?))";
    values.push(cursor.sortValue, cursor.sortValue, cursor.id);
  }
  values.push(pagination.limit + 1);
  return creationListResponse(
    context,
    await context.env.DB.prepare(
      `${CREATION_SELECT}
       WHERE c.state = 'published' AND c.visibility = 'public' ${cursorClause}
       ORDER BY COALESCE(cs.popularity_score, 0) DESC, c.id DESC LIMIT ?`,
    ).bind(...values).all<CreationRow>(),
    pagination.limit,
    (row) => row.popularity_score,
  );
}

async function searchCreations(context: WorkerRequestContext): Promise<Response> {
  await discoveryLimit(context);
  const parsed = SearchQuerySchema.safeParse(Object.fromEntries(context.url.searchParams.entries()));
  if (!parsed.success) {
    throw new HttpError(400, "invalid_search", "Search query is invalid.");
  }
  const ftsQuery = toFtsQuery(parsed.data.q);
  if (!ftsQuery) throw new HttpError(400, "invalid_search", "Search query is invalid.");
  const cursor = parseCursor(parsed.data.cursor);
  const offset = cursor ? searchOffset(cursor) : 0;
  const tagJoin = parsed.data.tag
    ? "JOIN creation_tags filter_ct ON filter_ct.creation_id = c.id JOIN tags filter_t ON filter_t.id = filter_ct.tag_id AND filter_t.slug = ?"
    : "";
  const values: unknown[] = [ftsQuery];
  if (parsed.data.tag) values.push(parsed.data.tag);
  values.push(parsed.data.limit + 1, offset);
  const rows = await context.env.DB.prepare(
    `${CREATION_SELECT}
     JOIN creation_search search ON search.creation_id = c.id
     ${tagJoin}
     WHERE creation_search MATCH ? AND c.state = 'published' AND c.visibility = 'public'
     ORDER BY bm25(creation_search), c.published_at DESC, c.id DESC LIMIT ? OFFSET ?`,
  ).bind(...values).all<CreationRow>();
  const page = rows.results.slice(0, parsed.data.limit);
  const hasMore = rows.results.length > parsed.data.limit;
  const liked = await viewerLikes(context, page);
  return success(context.requestId, page.map((row) => ({
    ...creationToApi(row),
    likedByViewer: liked.has(row.id),
  })), {
    status: 200,
  }, {
    hasMore,
    limit: parsed.data.limit,
    nextCursor: hasMore
      ? encodeCursor({ id: "search", sortValue: offset + parsed.data.limit })
      : null,
  });
}

async function creationsByTag(context: WorkerRequestContext): Promise<Response> {
  await discoveryLimit(context);
  const pagination = parsePagination(context);
  const cursor = parseCursor(pagination.cursor);
  const values: unknown[] = [context.params.slug];
  let cursorClause = "";
  if (cursor) {
    if (typeof cursor.sortValue !== "number") throw invalidCursor();
    cursorClause = "AND (c.published_at < ? OR (c.published_at = ? AND c.id < ?))";
    values.push(cursor.sortValue, cursor.sortValue, cursor.id);
  }
  values.push(pagination.limit + 1);
  const rows = await context.env.DB.prepare(
    `${CREATION_SELECT}
     JOIN creation_tags ct ON ct.creation_id = c.id
     JOIN tags t ON t.id = ct.tag_id
     WHERE t.slug = ? AND t.is_active = 1 AND c.state = 'published' AND c.visibility = 'public'
     ${cursorClause}
     ORDER BY c.published_at DESC, c.id DESC LIMIT ?`,
  ).bind(...values).all<CreationRow>();
  return creationListResponse(context, rows, pagination.limit, (row) => row.published_at ?? 0);
}

async function creationListResponse(
  context: WorkerRequestContext,
  result: D1Result<CreationRow>,
  limit: number,
  sortValue: (row: CreationRow) => number,
): Promise<Response> {
  const hasMore = result.results.length > limit;
  const page = result.results.slice(0, limit);
  const last = page.at(-1);
  const nextCursor = hasMore && last
    ? encodeCursor({ id: last.id, sortValue: sortValue(last) })
    : null;
  const liked = await viewerLikes(context, page);
  return success(context.requestId, page.map((row) => ({
    ...creationToApi(row),
    likedByViewer: liked.has(row.id),
  })), 200, {
    hasMore,
    limit,
    nextCursor,
  });
}

async function viewerLikes(
  context: WorkerRequestContext,
  creations: CreationRow[],
): Promise<Set<string>> {
  if (creations.length === 0) return new Set();
  const viewer = await optionalSession(context);
  if (!viewer) return new Set();
  const placeholders = creations.map(() => "?").join(",");
  const rows = await context.env.DB.prepare(
    `SELECT creation_id FROM likes WHERE user_id = ? AND creation_id IN (${placeholders})`,
  ).bind(viewer.user.id, ...creations.map((creation) => creation.id)).all<{ creation_id: string }>();
  return new Set(rows.results.map((row) => row.creation_id));
}

function parsePagination(context: WorkerRequestContext) {
  const parsed = PaginationQuerySchema.safeParse(Object.fromEntries(context.url.searchParams.entries()));
  if (!parsed.success) throw new HttpError(400, "invalid_pagination", "Pagination is invalid.");
  return parsed.data;
}

function parseCursor(value: string | undefined) {
  if (!value) return null;
  try {
    return decodeCursor(value);
  } catch {
    throw invalidCursor();
  }
}

function invalidCursor(): HttpError {
  return new HttpError(400, "invalid_cursor", "Pagination cursor is invalid.");
}

function searchOffset(cursor: ReturnType<typeof decodeCursor>): number {
  if (
    cursor.id !== "search"
    || typeof cursor.sortValue !== "number"
    || !Number.isSafeInteger(cursor.sortValue)
    || cursor.sortValue < 0
    || cursor.sortValue > 10_000
  ) {
    throw invalidCursor();
  }
  return cursor.sortValue;
}

function toFtsQuery(value: string): string {
  return (value.match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 12)
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(" AND ");
}

async function discoveryLimit(context: WorkerRequestContext): Promise<void> {
  await enforceRateLimit(
    context.env.DISCOVERY_RATE_LIMITER,
    await clientKey(context.env, context.request),
  );
}
