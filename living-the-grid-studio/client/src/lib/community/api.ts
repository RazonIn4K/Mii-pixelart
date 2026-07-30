import type { ApiEnvelope, ApiErrorEnvelope, CursorMeta } from "./types";

export const COMMUNITY_SERVICE_UNAVAILABLE_MESSAGE =
  "Community accounts, discovery, and sharing are not connected to this deployment yet. Anonymous Studio editing and local exports still work.";

export class CommunityApiError extends Error {
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly requestId?: string;
  readonly status: number;

  constructor(
    message: string,
    options: {
      code?: string;
      fields?: Record<string, string>;
      requestId?: string;
      status?: number;
    } = {},
  ) {
    super(message);
    this.name = "CommunityApiError";
    this.code = options.code ?? "UNKNOWN_ERROR";
    this.fields = options.fields;
    this.requestId = options.requestId;
    this.status = options.status ?? 0;
  }
}

export interface ApiResult<T> {
  data: T;
  meta?: CursorMeta;
  requestId?: string;
  etag?: string;
}

export function queryString(
  values: Record<string, string | number | boolean | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function communityApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined && init.body !== null;
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new CommunityApiError(
      "The community service is unreachable. Your local work is still safe in this browser.",
      { code: "NETWORK_ERROR" },
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const expectsJson = contentType.toLowerCase().includes("application/json");
  let body: ApiEnvelope<T> | ApiErrorEnvelope | null = null;
  if (expectsJson) {
    try {
      body = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
    } catch {
      body = null;
    }
  }

  // A static SPA fallback commonly answers an unhandled `/api/*` request with
  // the app document and a misleading 200. Treat that as an unavailable
  // community deployment instead of pretending the viewer is signed out or
  // showing a generic request failure.
  if (response.ok && !body) {
    throw new CommunityApiError(COMMUNITY_SERVICE_UNAVAILABLE_MESSAGE, {
      code: "SERVICE_UNAVAILABLE",
      status: response.status,
    });
  }

  if (!response.ok || !body || "error" in body) {
    const errorBody = body && "error" in body ? body : null;
    throw new CommunityApiError(
      errorBody?.error.message ??
        (response.status === 404
          ? "That community resource could not be found."
          : "The community request could not be completed."),
      {
        code: errorBody?.error.code ?? `HTTP_${response.status}`,
        fields: errorBody?.error.fields,
        requestId: errorBody?.requestId,
        status: response.status,
      },
    );
  }

  return {
    data: normalizeCommunityData(body.data) as T,
    meta: body.meta,
    requestId: body.requestId,
    etag: response.headers.get("etag") ?? undefined,
  };
}

/**
 * Keep the presentation model ergonomic while the public API retains its
 * explicit contract names (`state`, nested `stats`, and media endpoints).
 * This is deliberately a pure boundary adapter rather than scattered page
 * conditionals, and remains tolerant during a staged Worker cutover.
 */
function normalizeCommunityData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeCommunityData);
  if (!value || typeof value !== "object") return value;

  const input = value as Record<string, unknown>;
  let output = Object.fromEntries(
    Object.entries(input).map(([key, entry]) => [
      key,
      normalizeCommunityData(entry),
    ]),
  ) as Record<string, unknown>;

  if (output.creation && typeof output.creation === "object") {
    output = {
      ...(output.creation as Record<string, unknown>),
      ...(output.project !== undefined ? { project: output.project } : {}),
    };
  }

  if (
    typeof output.id === "string" &&
    typeof output.slug === "string" &&
    typeof output.state === "string" &&
    output.owner &&
    typeof output.owner === "object"
  ) {
    const stats =
      output.stats && typeof output.stats === "object"
        ? (output.stats as Record<string, unknown>)
        : {};
    output.status = output.state;
    output.likeCount = Number(
      output.likeCount ?? stats.likes ?? stats.likeCount ?? 0,
    );
    output.commentCount = Number(
      output.commentCount ?? stats.comments ?? stats.commentCount ?? 0,
    );
    output.isLiked = Boolean(
      output.likedByViewer ?? output.isLiked ?? output.liked,
    );
    output.downloadEnabled = Boolean(
      output.downloadEnabled ?? output.projectDownloadEnabled,
    );
    output.commentsLocked = Boolean(
      output.commentsLocked ?? stats.commentsLocked ?? false,
    );
    output.previewUrl = `/api/creations/${encodeURIComponent(output.id)}/media/preview`;
    output.thumbnailUrl = `/api/creations/${encodeURIComponent(output.id)}/media/thumb`;
    output.socialImageUrl = `/api/creations/${encodeURIComponent(output.id)}/media/social`;
    output.tags = Array.isArray(output.tags)
      ? output.tags.flatMap((tag) =>
          typeof tag === "string"
            ? [tag]
            : tag &&
                typeof tag === "object" &&
                typeof (tag as Record<string, unknown>).slug === "string"
              ? [(tag as Record<string, unknown>).slug]
              : [],
        )
      : [];
  }

  if (typeof output.avatarSeed === "string") {
    if (output.followerCount === undefined && output.followers !== undefined) {
      output.followerCount = Number(output.followers);
    }
    if (output.followingCount === undefined && output.following !== undefined) {
      output.followingCount = Number(output.following);
    }
    if (
      output.isFollowing === undefined &&
      output.followedByViewer !== undefined
    ) {
      output.isFollowing = Boolean(output.followedByViewer);
    }
  }

  if (output.user && Array.isArray(output.creations)) {
    const user = output.user as Record<string, unknown>;
    user.creationCount ??= output.creations.length;
  }

  return output;
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

export function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something unexpected happened. Please try again.";
}
