import {
  COMMUNITY_LIMITS,
  CreateProfileImageUploadSchema,
} from "../shared/community";
import { getAccount } from "./accounts";
import { clientKey, enforceRateLimit, requireOnboardedSession } from "./auth";
import { isStrongRuntimeSecret, randomToken, sha256 } from "./crypto";
import {
  HttpError,
  parseJson,
  readBytes,
  success,
  type WorkerRequestContext,
} from "./http";
import {
  storeProfileImageObject,
  type StoredProfileImageObject,
} from "./media";
import type { Router } from "./router";

const UPLOAD_TICKET_TTL_MS = 10 * 60 * 1_000;

interface CurrentProfileImageRow {
  avatar_image_id: string | null;
}

interface ClaimedProfileUploadRow {
  account_status: string;
  current_avatar_image_id: string | null;
  expected_byte_size: number;
  expected_content_type: string;
  focus_x: number;
  focus_y: number;
  id: string;
  replaces_image_id: string | null;
  user_id: string;
}

export function registerProfileImageRoutes(router: Router): void {
  router
    .add("POST", "/api/me/avatar/uploads", createProfileImageUpload)
    .add("PUT", "/api/avatar-uploads/:uploadId/content", uploadProfileImage)
    .add("GET", "/api/users/:userId/avatar/:imageId", serveProfileImage)
    .add("DELETE", "/api/me/avatar", removeProfileImage);
}

async function createProfileImageUpload(
  context: WorkerRequestContext,
): Promise<Response> {
  const session = await requireOnboardedSession(context);
  await enforceRateLimit(context.env.SAVE_RATE_LIMITER, session.user.id);
  const input = await parseJson(
    context.request,
    CreateProfileImageUploadSchema,
    10_000,
  );
  const current = await context.env.DB.prepare(
    `SELECT u.avatar_image_id
     FROM users u WHERE u.id = ? AND u.status = 'active' LIMIT 1`,
  )
    .bind(session.user.id)
    .first<CurrentProfileImageRow>();
  if (!current) {
    throw new HttpError(
      403,
      "account_not_active",
      "Restore the account before continuing.",
    );
  }

  const uploadId = crypto.randomUUID();
  const uploadToken = randomToken();
  const tokenHash = await profileUploadTokenHash(context.env, uploadToken);
  const now = Date.now();
  const expiresAt = now + UPLOAD_TICKET_TTL_MS;
  // The old normalized object remains physically present until R2 confirms
  // deletion (and may be held as report evidence), so replacement reserves
  // the full maximum derivative rather than netting out the current object.
  const reservedBytes = COMMUNITY_LIMITS.profileImageOutputBytes;
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO profile_image_upload_attempts (id, user_id, created_at)
         VALUES (?, ?, ?)`,
      ).bind(uploadId, session.user.id, now),
      context.env.DB.prepare(
        `INSERT INTO profile_images
         (id, user_id, upload_token_hash, expected_content_type,
          expected_byte_size, focus_x, focus_y, replaces_image_id, status,
          expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?)`,
      ).bind(
        uploadId,
        session.user.id,
        tokenHash,
        input.contentType,
        input.byteSize,
        input.focusX,
        input.focusY,
        current.avatar_image_id,
        expiresAt,
        now,
        now,
      ),
      context.env.DB.prepare(
        `INSERT INTO quota_reservations
         (id, user_id, creation_slots, storage_bytes, created_at, updated_at, expires_at)
         VALUES (?, ?, 0, ?, ?, ?, ?)`,
      ).bind(uploadId, session.user.id, reservedBytes, now, now, expiresAt),
    ]);
  } catch (error) {
    throw profileImageError(error) ?? error;
  }

  const uploadUrl = `/api/avatar-uploads/${uploadId}/content`;
  const response = success(
    context.requestId,
    {
      expiresAt,
      maximumBytes: COMMUNITY_LIMITS.profileImageInputBytes,
      uploadId,
      uploadToken,
      uploadUrl,
    },
    201,
  );
  response.headers.set("Location", uploadUrl);
  return response;
}

async function uploadProfileImage(
  context: WorkerRequestContext,
): Promise<Response> {
  await enforceRateLimit(
    context.env.SAVE_RATE_LIMITER,
    await clientKey(context.env, context.request),
  );
  const token = context.request.headers
    .get("authorization")!
    .slice("Bearer ".length);
  const tokenHash = await profileUploadTokenHash(context.env, token);
  const now = Date.now();
  const processingExpiresAt = now + UPLOAD_TICKET_TTL_MS;
  const claimed = await context.env.DB.prepare(
    `UPDATE profile_images
     SET status = 'processing', upload_token_hash = NULL, expires_at = ?, updated_at = ?
     WHERE id = ? AND status = 'reserved' AND upload_token_hash = ?
       AND expires_at > ?`,
  )
    .bind(processingExpiresAt, now, context.params.uploadId, tokenHash, now)
    .run();
  if ((claimed.meta.changes ?? 0) !== 1) {
    throw new HttpError(
      401,
      "invalid_upload_ticket",
      "Profile image upload ticket is invalid or expired.",
    );
  }
  await context.env.DB.prepare(
    "UPDATE quota_reservations SET updated_at = ?, expires_at = ? WHERE id = ?",
  )
    .bind(now, processingExpiresAt, context.params.uploadId)
    .run();

  const upload = await context.env.DB.prepare(
    `SELECT pi.id, pi.user_id, pi.expected_content_type,
      pi.expected_byte_size, pi.focus_x, pi.focus_y, pi.replaces_image_id,
      u.status AS account_status,
      u.avatar_image_id AS current_avatar_image_id
     FROM profile_images pi JOIN users u ON u.id = pi.user_id
     WHERE pi.id = ? AND pi.status = 'processing' LIMIT 1`,
  )
    .bind(context.params.uploadId)
    .first<ClaimedProfileUploadRow>();
  if (!upload) {
    await failProfileUpload(
      context.env,
      context.params.uploadId,
      "claim_missing",
    );
    throw new HttpError(
      401,
      "invalid_upload_ticket",
      "Profile image upload ticket is invalid or expired.",
    );
  }

  let stored: StoredProfileImageObject | null = null;
  try {
    if (
      upload.account_status !== "active" ||
      upload.current_avatar_image_id !== upload.replaces_image_id
    ) {
      throw new HttpError(
        409,
        "profile_image_set_changed",
        "Your profile image changed. Choose the file again.",
      );
    }
    const requestedType = context.request.headers
      .get("content-type")!
      .toLowerCase();
    if (requestedType !== upload.expected_content_type) {
      throw new HttpError(
        415,
        "profile_image_type_mismatch",
        "The uploaded image type does not match its ticket.",
      );
    }
    const bytes = await readBytes(
      context.request,
      COMMUNITY_LIMITS.profileImageInputBytes,
    );
    if (bytes.byteLength !== upload.expected_byte_size) {
      throw new HttpError(
        400,
        "profile_image_size_mismatch",
        "The uploaded image size does not match its ticket.",
      );
    }
    const info = await inspectProfileImage(context.env, bytes);
    if (!sameImageFormat(upload.expected_content_type, info.contentType)) {
      throw new HttpError(
        415,
        "profile_image_format_mismatch",
        "The uploaded bytes do not match the declared image type.",
      );
    }
    if (
      info.width > COMMUNITY_LIMITS.profileImageDimensionMaximum ||
      info.height > COMMUNITY_LIMITS.profileImageDimensionMaximum ||
      info.width * info.height > COMMUNITY_LIMITS.profileImageMaximumPixels
    ) {
      throw new HttpError(
        400,
        "profile_image_dimensions_exceeded",
        "Image dimensions exceed the profile image limit.",
      );
    }
    try {
      stored = await storeProfileImageObject(
        context.env,
        upload.user_id,
        upload.id,
        bytes,
        info.contentType,
        upload.focus_x,
        upload.focus_y,
      );
    } catch {
      throw new HttpError(
        503,
        "profile_image_processing_unavailable",
        "Profile image processing is temporarily unavailable. Try again later.",
      );
    }
    const replacedImageId = await commitProfileImage(
      context.env,
      upload,
      info,
      stored,
    );
    if (replacedImageId) {
      context.executionCtx.waitUntil(
        deleteProfileImageObjects(
          context.env,
          upload.user_id,
          replacedImageId,
        ).catch(() => {
          console.error(
            JSON.stringify({
              message: "profile_image_replacement_cleanup_failed",
            }),
          );
        }),
      );
    }
  } catch (error) {
    if (stored) await context.env.PROJECTS.delete(stored.key);
    await failProfileUpload(
      context.env,
      upload.id,
      error instanceof HttpError ? error.code : "processing_failed",
    );
    throw profileImageError(error) ?? error;
  }

  return success(
    context.requestId,
    await getAccount(context.env, upload.user_id),
    201,
  );
}

async function serveProfileImage(
  context: WorkerRequestContext,
): Promise<Response> {
  const row = await context.env.DB.prepare(
    `SELECT pio.object_key, pio.content_type
     FROM users u
     JOIN profile_images pi ON pi.id = u.avatar_image_id
     JOIN profile_image_objects pio ON pio.image_id = pi.id
     WHERE u.id = ? AND u.avatar_image_id = ? AND u.status = 'active'
       AND u.username IS NOT NULL
       AND u.terms_accepted_at IS NOT NULL
       AND pi.user_id = u.id AND pi.status = 'ready'
       AND pio.user_id = u.id AND pio.status = 'ready'
     LIMIT 1`,
  )
    .bind(context.params.userId, context.params.imageId)
    .first<{ content_type: string; object_key: string }>();
  if (!row) {
    throw new HttpError(
      404,
      "profile_image_not_found",
      "Profile image was not found.",
    );
  }
  const object = await context.env.PROJECTS.get(row.object_key);
  if (!object) {
    throw new HttpError(
      404,
      "profile_image_not_found",
      "Profile image was not found.",
    );
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "image/webp");
  headers.set("ETag", object.httpEtag);
  // Avatar URLs are revocable when an owner removes the image, an account is
  // suspended, or moderation acts. Do not let a browser or edge cache extend
  // the public lifetime beyond the current D1 authorization decision.
  headers.set("Cache-Control", "no-store");
  return new Response(object.body, { headers });
}

async function removeProfileImage(
  context: WorkerRequestContext,
): Promise<Response> {
  const session = await requireOnboardedSession(context);
  await enforceRateLimit(context.env.SAVE_RATE_LIMITER, session.user.id);
  const row = await context.env.DB.prepare(
    "SELECT avatar_image_id FROM users WHERE id = ? AND status = 'active' LIMIT 1",
  )
    .bind(session.user.id)
    .first<{ avatar_image_id: string | null }>();
  const imageId = row?.avatar_image_id ?? null;
  if (!imageId) {
    return success(
      context.requestId,
      await getAccount(context.env, session.user.id),
    );
  }
  const now = Date.now();
  const results = await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE profile_images SET status = 'deleting', deleted_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'ready'
         AND EXISTS (SELECT 1 FROM users WHERE id = ? AND avatar_image_id = ?)`,
    ).bind(now, now, imageId, session.user.id, session.user.id, imageId),
    context.env.DB.prepare(
      `UPDATE profile_image_objects SET status = 'deleting', updated_at = ?
       WHERE image_id = ? AND user_id = ? AND status = 'ready'
         AND EXISTS (SELECT 1 FROM profile_images WHERE id = ? AND status = 'deleting')`,
    ).bind(now, imageId, session.user.id, imageId),
    context.env.DB.prepare(
      "UPDATE users SET avatar_image_id = NULL, updated_at = ? WHERE id = ? AND avatar_image_id = ?",
    ).bind(now, session.user.id, imageId),
  ]);
  const changed = results.map((result) => result.meta.changes ?? 0);
  if (changed.some((value) => value !== 1)) {
    throw new HttpError(
      409,
      "profile_image_set_changed",
      "Your profile image changed. Reload before trying again.",
    );
  }
  context.executionCtx.waitUntil(
    deleteProfileImageObjects(context.env, session.user.id, imageId).catch(
      () => {
        console.error(
          JSON.stringify({ message: "profile_image_delete_cleanup_failed" }),
        );
      },
    ),
  );
  return success(
    context.requestId,
    await getAccount(context.env, session.user.id),
  );
}

async function commitProfileImage(
  env: Env,
  upload: ClaimedProfileUploadRow,
  info: { contentType: string; height: number; width: number },
  object: StoredProfileImageObject,
): Promise<string | null> {
  const now = Date.now();
  const reservation = await env.DB.prepare(
    `UPDATE quota_reservations SET storage_bytes = ?, updated_at = ?, expires_at = ?
     WHERE id = ?`,
  )
    .bind(object.byteSize, now, now + UPLOAD_TICKET_TTL_MS, upload.id)
    .run();
  if ((reservation.meta.changes ?? 0) !== 1) {
    throw new HttpError(
      409,
      "quota_reservation_expired",
      "The profile image reservation expired. Try again.",
    );
  }

  const statements: D1PreparedStatement[] = [];
  if (upload.replaces_image_id) {
    statements.push(
      env.DB.prepare(
        `UPDATE profile_images SET status = 'deleting', deleted_at = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND status = 'ready'
           AND EXISTS (SELECT 1 FROM users WHERE id = ? AND avatar_image_id = ?)`,
      ).bind(
        now,
        now,
        upload.replaces_image_id,
        upload.user_id,
        upload.user_id,
        upload.replaces_image_id,
      ),
      env.DB.prepare(
        `UPDATE profile_image_objects SET status = 'deleting', updated_at = ?
         WHERE image_id = ? AND user_id = ? AND status = 'ready'`,
      ).bind(now, upload.replaces_image_id, upload.user_id),
    );
  }
  statements.push(
    env.DB.prepare("DELETE FROM quota_reservations WHERE id = ?").bind(
      upload.id,
    ),
    env.DB.prepare(
      `INSERT INTO profile_image_objects
       (id, image_id, user_id, object_key, content_type, byte_size, sha256,
        status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'image/webp', ?, ?, 'ready', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      upload.id,
      upload.user_id,
      object.key,
      object.byteSize,
      object.sha256,
      now,
      now,
    ),
    env.DB.prepare(
      `UPDATE profile_images SET status = 'ready', detected_content_type = ?,
       source_byte_size = ?, source_width = ?, source_height = ?, ready_at = ?,
       updated_at = ?, expires_at = ?, failure_code = NULL
       WHERE id = ? AND user_id = ? AND status = 'processing'`,
    ).bind(
      info.contentType,
      upload.expected_byte_size,
      info.width,
      info.height,
      now,
      now,
      now + UPLOAD_TICKET_TTL_MS,
      upload.id,
      upload.user_id,
    ),
    env.DB.prepare(
      `UPDATE users SET avatar_image_id = ?, updated_at = ?
       WHERE id = ? AND status = 'active' AND avatar_image_id IS ?`,
    ).bind(upload.id, now, upload.user_id, upload.replaces_image_id),
  );
  try {
    const results = await env.DB.batch(statements);
    const pointer = results.at(-1)?.meta.changes ?? 0;
    const promotion = results.at(-2)?.meta.changes ?? 0;
    if (promotion !== 1 || pointer !== 1) {
      throw new Error("Profile image promotion invariant failed.");
    }
  } catch (error) {
    throw profileImageError(error) ?? error;
  }
  return upload.replaces_image_id;
}

async function inspectProfileImage(
  env: Env,
  bytes: Uint8Array,
): Promise<{ contentType: string; height: number; width: number }> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  let info: ImageInfoResponse;
  try {
    info = await env.IMAGES.info(new Blob([copy.buffer]).stream());
  } catch {
    throw new HttpError(
      400,
      "invalid_profile_image",
      "Uploaded bytes are not a valid image.",
    );
  }
  if (!("width" in info) || !("height" in info)) {
    throw new HttpError(
      415,
      "unsupported_image_type",
      "SVG profile images are not supported.",
    );
  }
  const contentType = normalizeDetectedImageType(info.format);
  if (!contentType) {
    throw new HttpError(
      415,
      "unsupported_image_type",
      "Use a JPEG, PNG, WebP, or HEIC image.",
    );
  }
  return { contentType, height: info.height, width: info.width };
}

function normalizeDetectedImageType(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    heic: "image/heic",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const candidate = aliases[normalized] ?? normalized;
  return ["image/heic", "image/jpeg", "image/png", "image/webp"].includes(
    candidate,
  )
    ? candidate
    : null;
}

function sameImageFormat(expected: string, detected: string): boolean {
  return expected === detected;
}

async function failProfileUpload(
  env: Env,
  uploadId: string,
  code: string,
): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM quota_reservations WHERE id = ?").bind(
      uploadId,
    ),
    env.DB.prepare(
      `UPDATE profile_images SET status = 'failed', upload_token_hash = NULL,
       failure_code = ?, updated_at = ?
       WHERE id = ? AND status IN ('reserved', 'processing')`,
    ).bind(code.slice(0, 80), now, uploadId),
  ]);
}

async function profileUploadTokenHash(
  env: Env,
  token: string,
): Promise<string> {
  if (!isStrongRuntimeSecret(env.SESSION_PEPPER, env.ENVIRONMENT)) {
    throw new Error("Session secret is not securely configured.");
  }
  return sha256(`${env.SESSION_PEPPER.trim()}:profile-image-upload:${token}`);
}

function profileImageError(error: unknown): HttpError | null {
  if (!(error instanceof Error)) return null;
  if (/profile_image_daily_quota_exceeded/iu.test(error.message)) {
    return new HttpError(
      429,
      "profile_image_daily_quota_exceeded",
      "Daily profile image upload limit reached.",
      undefined,
      undefined,
      { "Retry-After": "86400" },
    );
  }
  if (/storage_quota_exceeded/iu.test(error.message)) {
    return new HttpError(
      409,
      "storage_quota_exceeded",
      "Cloud storage limit reached.",
    );
  }
  if (
    /profile_image_set_changed/iu.test(error.message) ||
    /profile_image_pointer_invalid/iu.test(error.message) ||
    /unique constraint failed: profile_images\.user_id/iu.test(error.message)
  ) {
    return new HttpError(
      409,
      "profile_image_set_changed",
      "Your profile image changed. Reload before trying again.",
    );
  }
  return null;
}

export async function deleteProfileImageObjects(
  env: Env,
  userId: string,
  imageId: string,
): Promise<boolean> {
  const held = await env.DB.prepare(
    `SELECT 1 AS held
     FROM profile_image_report_evidence evidence
     JOIN reports report ON report.id = evidence.report_id
     WHERE evidence.image_id = ? AND evidence.user_id = ?
       AND report.status IN ('open', 'reviewing')
     LIMIT 1`,
  )
    .bind(imageId, userId)
    .first<{ held: number }>();
  if (held) return false;

  const rows = await env.DB.prepare(
    "SELECT object_key FROM profile_image_objects WHERE image_id = ? AND user_id = ?",
  )
    .bind(imageId, userId)
    .all<{ object_key: string }>();
  const deterministicKey = `private/users/${userId}/avatar/${imageId}/avatar.webp`;
  await env.PROJECTS.delete(
    Array.from(
      new Set([deterministicKey, ...rows.results.map((row) => row.object_key)]),
    ),
  );
  await env.DB.batch([
    env.DB.prepare("DELETE FROM quota_reservations WHERE id = ?").bind(imageId),
    env.DB.prepare(
      `DELETE FROM profile_images WHERE id = ? AND user_id = ?
       AND status IN ('reserved', 'processing', 'failed', 'deleting')`,
    ).bind(imageId, userId),
  ]);
  return true;
}

export async function deleteAllProfileImageObjectsForUser(
  env: Env,
  userId: string,
): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await env.PROJECTS.list({
      cursor,
      limit: 1_000,
      prefix: `private/users/${userId}/avatar/`,
    });
    if (page.objects.length) {
      await env.PROJECTS.delete(page.objects.map((object) => object.key));
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
