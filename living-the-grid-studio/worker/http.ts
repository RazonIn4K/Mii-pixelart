import type { z } from "zod";

export interface WorkerRequestContext {
  env: Env;
  executionCtx: WorkerExecutionContext;
  params: Readonly<Record<string, string>>;
  request: Request;
  requestId: string;
  url: URL;
}
export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ApiMeta {
  cursor?: string | null;
  hasMore?: boolean;
  limit?: number;
  nextCursor?: string | null;
}

export interface HttpErrorDetails {
  currentEtag?: string;
  currentRevision?: number;
}

export class HttpError extends Error {
  readonly code: string;
  readonly details?: HttpErrorDetails;
  readonly fields?: Record<string, string[]>;
  readonly headers?: HeadersInit;
  readonly status: number;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string[]>,
    details?: HttpErrorDetails,
    headers?: HeadersInit,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
    this.headers = headers;
  }
}

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
} as const;

export function success(
  requestId: string,
  data: unknown,
  init: number | ResponseInit = 200,
  meta?: ApiMeta,
): Response {
  const responseInit = typeof init === "number" ? { status: init } : init;
  return Response.json(
    { data, ...(meta ? { meta } : {}), requestId },
    {
      ...responseInit,
      headers: mergeHeaders(JSON_HEADERS, responseInit.headers),
    },
  );
}

export function failure(
  requestId: string,
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string[]>,
  details?: HttpErrorDetails,
  headers?: HeadersInit,
): Response {
  return Response.json(
    {
      error: {
        code: publicErrorCode(status, code),
        message,
        ...details,
        ...(fields
          ? {
              fields: Object.fromEntries(
                Object.entries(fields).map(([key, value]) => [
                  key,
                  value.join(" "),
                ]),
              ),
            }
          : {}),
      },
      requestId,
    },
    {
      status,
      headers: mergeHeaders(JSON_HEADERS, headers),
    },
  );
}

function publicErrorCode(status: number, internalCode: string): string {
  if (internalCode === "revision_conflict") return "REVISION_CONFLICT";
  if (internalCode === "comments_disabled") return "COMMENTS_DISABLED";
  if (internalCode.includes("quota")) return "QUOTA_EXCEEDED";
  if (internalCode === "validation_error") return "VALIDATION_FAILED";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  if (status >= 500) return "INTERNAL_ERROR";
  return "BAD_REQUEST";
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof HttpError) {
    return failure(
      requestId,
      error.status,
      error.code,
      error.message,
      error.fields,
      error.details,
      error.headers,
    );
  }

  console.error(
    JSON.stringify({
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: "unhandled_worker_error",
      requestId,
    }),
  );
  return failure(
    requestId,
    500,
    "internal_error",
    "The request could not be completed.",
  );
}

export async function readJson(
  request: Request,
  maxBytes = 100_000,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Requests with a body must use application/json.",
    );
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, "payload_too_large", "Request body is too large.");
  }

  const text = await readText(request, maxBytes);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body is not valid JSON.");
  }
}

export async function readText(
  request: Request,
  maxBytes: number,
): Promise<string> {
  return new TextDecoder().decode(await readBoundedBody(request, maxBytes));
}

export async function readBytes(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, "payload_too_large", "Request body is too large.");
  }
  return readBoundedBody(request, maxBytes);
}

export async function parseJson<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  maxBytes?: number,
): Promise<z.output<TSchema>> {
  const parsed = schema.safeParse(await readJson(request, maxBytes));
  if (parsed.success) return parsed.data;

  const fields: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "body";
    (fields[key] ??= []).push(issue.message);
  }
  throw new HttpError(
    400,
    "validation_error",
    "Request validation failed.",
    fields,
  );
}

async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("Request body exceeds configured limit.");
        throw new HttpError(
          413,
          "payload_too_large",
          "Request body is too large.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function assertSafeOrigin(context: WorkerRequestContext): void {
  if (["GET", "HEAD", "OPTIONS"].includes(context.request.method)) return;
  if (context.url.pathname === "/api/webhooks/stripe") return;

  const expected = new URL(context.env.PUBLIC_SITE_URL).origin;
  const origin = context.request.headers.get("origin");
  if (origin !== expected) {
    throw new HttpError(403, "origin_mismatch", "Request origin was rejected.");
  }

  const contentType =
    context.request.headers.get("content-type")?.toLowerCase() ?? "";
  const isOidcFormStart =
    context.url.pathname === "/api/auth/google/start" &&
    contentType.startsWith("application/x-www-form-urlencoded");
  const isRawImageUpload =
    context.request.method === "PUT" &&
    /^\/api\/(?:creation-image-uploads|avatar-uploads)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/content\/?$/iu.test(
      context.url.pathname,
    );
  if (isRawImageUpload) {
    if (context.request.headers.has("cookie")) {
      throw new HttpError(
        403,
        "upload_cookie_rejected",
        "Image upload requests must not include browser credentials.",
      );
    }
    if (
      !/^Bearer [A-Za-z0-9_-]{43}$/u.test(
        context.request.headers.get("authorization") ?? "",
      )
    ) {
      throw new HttpError(
        401,
        "invalid_upload_ticket",
        "Image upload ticket is invalid or expired.",
      );
    }
    if (
      !["image/heic", "image/jpeg", "image/png", "image/webp"].includes(
        contentType,
      )
    ) {
      throw new HttpError(
        415,
        "unsupported_image_type",
        "Use a JPEG, PNG, WebP, or HEIC image.",
      );
    }
    return;
  }
  if (!isOidcFormStart && !contentType.startsWith("application/json")) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Unsafe requests must use application/json.",
    );
  }
}

export function applySecurityHeaders(
  response: Response,
  requestId: string,
): Response {
  const headers = new Headers(response.headers);
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Request-Id", requestId);
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
  );
  if (
    !headers.has("Strict-Transport-Security") &&
    headers.get("X-Worker-Scheme") === "https"
  ) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }
  headers.delete("X-Worker-Scheme");
  if (!headers.has("Content-Security-Policy")) {
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' https://api.pwnedpasswords.com https://openrouter.ai https://*.openrouter.ai https://*.pages.dev https://a.nel.cloudflare.com https://pagead2.googlesyndication.com https://cloudflareinsights.com https://*.cloudflareinsights.com; frame-src https://googleads.g.doubleclick.net https://www.google.com; form-action 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests",
    );
  }
  // A report-only policy without report-to plus a real Reporting-Endpoints
  // destination has no monitoring effect and causes WebKit console errors.
  // Restore Trusted Types observation only when that reporting path exists.
  return new Response(response.body, { status: response.status, headers });
}

export function parseCookies(request: Request): ReadonlyMap<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies.set(key, value);
  }
  return cookies;
}

export function cookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: "Lax" | "Strict";
    secure?: boolean;
  } = {},
): string {
  const parts = [`${name}=${value}`, `Path=${options.path ?? "/"}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (options.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

export function mergeHeaders(...inputs: (HeadersInit | undefined)[]): Headers {
  const headers = new Headers();
  for (const input of inputs) {
    if (!input) continue;
    new Headers(input).forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

export function normalizeLimit(value: string | null): number {
  const parsed = Number(value ?? 24);
  if (!Number.isInteger(parsed)) return 24;
  return Math.max(1, Math.min(50, parsed));
}

export function publicCacheHeaders(maxAge = 60): HeadersInit {
  return {
    "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${Math.max(maxAge, 300)}`,
  };
}
