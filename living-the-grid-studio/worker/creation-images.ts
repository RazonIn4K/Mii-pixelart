import {
  COMMUNITY_LIMITS,
  CreateCreationImageUploadSchema,
  UpdateCreationImagesSchema,
} from "../shared/community";
import {
  clientKey,
  enforceRateLimit,
  optionalSession,
  requireOnboardedSession,
} from "./auth";
import { isStrongRuntimeSecret, randomToken, sha256 } from "./crypto";
import {
  creationToApi,
  getCreationById,
  type CreationRow,
  type ShowcaseImageApi,
} from "./db";
import {
  HttpError,
  parseJson,
  readBytes,
  success,
  type WorkerRequestContext,
} from "./http";
import {
  storeShowcaseObjects,
  type ShowcaseObjectKind,
  type StoredShowcaseObject,
} from "./media";
import type { Router } from "./router";

const UPLOAD_TICKET_TTL_MS = 10 * 60 * 1_000;
const UPLOAD_REQUEST_LIMIT = COMMUNITY_LIMITS.creationImageInputBytes;

interface ClaimedUploadRow {
  account_status: string;
  alt_text: string;
  creation_id: string;
  creation_state: CreationRow["state"];
  creation_visibility: CreationRow["visibility"];
  expected_byte_size: number;
  expected_content_type: string;
  id: string;
  owner_user_id: string;
  replaces_image_id: string | null;
}

interface ReadyImageRow {
  id: string;
  is_cover: number;
  object_bytes: number;
  sort_order: number;
}

export interface ShowcaseMediaObjectRow {
  content_type: string;
  object_key: string;
}

export function registerCreationImageRoutes(router: Router): void {
  router
    .add("POST", "/api/creations/:id/images/uploads", createUploadTicket)
    .add("GET", "/api/creations/:id/images", listCreationImages)
    .add("PATCH", "/api/creations/:id/images", reorderCreationImages)
    .add("DELETE", "/api/creations/:id/images/:imageId", deleteCreationImage)
    .add("GET", "/api/creations/:id/images/:imageId/:variant", serveCreationImage)
    .add("PUT", "/api/creation-image-uploads/:uploadId/content", uploadCreationImage);
}

async function createUploadTicket(
  context: WorkerRequestContext,
): Promise<Response> {
  const session = await requireOnboardedSession(context);
  await enforceRateLimit(context.env.SAVE_RATE_LIMITER, session.user.id);
  const input = await parseJson(
    context.request,
    CreateCreationImageUploadSchema,
    25_000,
  );
  const creation = await ownerDraftCreation(context, session.user.id);
  const readyImages = imagesFromCreation(creation);
  let replacementBytes = 0;
  if (input.replaceImageId) {
    if (!readyImages.some((image) => image.id === input.replaceImageId)) {
      throw new HttpError(404, "creation_image_not_found", "Showcase image was not found.");
    }
    replacementBytes = await imageObjectBytes(context.env, input.replaceImageId);
  } else if (readyImages.length >= COMMUNITY_LIMITS.creationImagesPerCreation) {
    throw new HttpError(
      409,
      "creation_image_limit_exceeded",
      "A creation may have up to four showcase images.",
    );
  }

  const uploadId = crypto.randomUUID();
  const uploadToken = randomToken();
  const tokenHash = await uploadTokenHash(context.env, uploadToken);
  const now = Date.now();
  const expiresAt = now + UPLOAD_TICKET_TTL_MS;
  const reservedBytes = Math.max(
    0,
    COMMUNITY_LIMITS.creationImageOutputBytes - replacementBytes,
  );

  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO creation_showcase_upload_attempts (id, user_id, created_at)
         VALUES (?, ?, ?)`,
      ).bind(uploadId, session.user.id, now),
      context.env.DB.prepare(
        `INSERT INTO creation_showcase_images
         (id, creation_id, owner_user_id, upload_token_hash,
          expected_content_type, expected_byte_size, alt_text,
          replaces_image_id, status, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?)`,
      ).bind(
        uploadId,
        creation.id,
        session.user.id,
        tokenHash,
        input.contentType,
        input.byteSize,
        input.altText,
        input.replaceImageId ?? null,
        expiresAt,
        now,
        now,
      ),
      context.env.DB.prepare(
        `INSERT INTO quota_reservations
         (id, user_id, creation_slots, storage_bytes, created_at, updated_at, expires_at)
         VALUES (?, ?, 0, ?, ?, ?, ?)`,
      ).bind(
        uploadId,
        session.user.id,
        reservedBytes,
        now,
        now,
        expiresAt,
      ),
    ]);
  } catch (error) {
    throw imageQuotaError(error) ?? error;
  }

  const uploadUrl = `/api/creation-image-uploads/${uploadId}/content`;
  const response = success(context.requestId, {
    expiresAt,
    maximumBytes: COMMUNITY_LIMITS.creationImageInputBytes,
    uploadId,
    uploadToken,
    uploadUrl,
  }, 201);
  response.headers.set("Location", uploadUrl);
  return response;
}

async function uploadCreationImage(
  context: WorkerRequestContext,
): Promise<Response> {
  await enforceRateLimit(
    context.env.SAVE_RATE_LIMITER,
    await clientKey(context.env, context.request),
  );
  const uploadToken = context.request.headers.get("authorization")!.slice("Bearer ".length);
  const tokenHash = await uploadTokenHash(context.env, uploadToken);
  const now = Date.now();
  const processingExpiresAt = now + UPLOAD_TICKET_TTL_MS;
  const claimed = await context.env.DB.prepare(
    `UPDATE creation_showcase_images
     SET status = 'processing', upload_token_hash = NULL, expires_at = ?, updated_at = ?
     WHERE id = ? AND status = 'reserved' AND upload_token_hash = ? AND expires_at > ?`,
  ).bind(
    processingExpiresAt,
    now,
    context.params.uploadId,
    tokenHash,
    now,
  ).run();
  if ((claimed.meta.changes ?? 0) !== 1) {
    throw new HttpError(401, "invalid_upload_ticket", "Image upload ticket is invalid or expired.");
  }
  await context.env.DB.prepare(
    `UPDATE quota_reservations SET updated_at = ?, expires_at = ? WHERE id = ?`,
  ).bind(now, processingExpiresAt, context.params.uploadId).run();

  const upload = await context.env.DB.prepare(
    `SELECT csi.id, csi.creation_id, csi.owner_user_id,
      csi.expected_content_type, csi.expected_byte_size, csi.alt_text,
      csi.replaces_image_id, c.state AS creation_state,
      c.visibility AS creation_visibility, u.status AS account_status
     FROM creation_showcase_images csi
     JOIN creations c ON c.id = csi.creation_id
     JOIN users u ON u.id = csi.owner_user_id
     WHERE csi.id = ? AND csi.status = 'processing' LIMIT 1`,
  ).bind(context.params.uploadId).first<ClaimedUploadRow>();
  if (!upload) {
    await failUpload(context.env, context.params.uploadId, "claim_missing");
    throw new HttpError(401, "invalid_upload_ticket", "Image upload ticket is invalid or expired.");
  }

  let storedObjects: StoredShowcaseObject[] = [];
  try {
    if (
      upload.account_status !== "active"
      || upload.creation_state !== "draft"
      || upload.creation_visibility !== "private"
    ) {
      throw new HttpError(
        409,
        "creation_image_private_draft_required",
        "Unpublish the creation before adding showcase images.",
      );
    }
    const requestedContentType = context.request.headers.get("content-type")!.toLowerCase();
    if (requestedContentType !== upload.expected_content_type) {
      throw new HttpError(
        415,
        "creation_image_type_mismatch",
        "The uploaded image type does not match its ticket.",
      );
    }
    const bytes = await readBytes(context.request, UPLOAD_REQUEST_LIMIT);
    if (bytes.byteLength !== upload.expected_byte_size) {
      throw new HttpError(
        400,
        "creation_image_size_mismatch",
        "The uploaded image size does not match its ticket.",
      );
    }
    const imageInfo = await inspectImage(context.env, bytes);
    if (!sameImageFormat(upload.expected_content_type, imageInfo.contentType)) {
      throw new HttpError(
        415,
        "creation_image_format_mismatch",
        "The uploaded bytes do not match the declared image type.",
      );
    }
    if (
      imageInfo.width > COMMUNITY_LIMITS.creationImageDimensionMaximum
      || imageInfo.height > COMMUNITY_LIMITS.creationImageDimensionMaximum
      || imageInfo.width * imageInfo.height > COMMUNITY_LIMITS.creationImageMaximumPixels
    ) {
      throw new HttpError(
        400,
        "creation_image_dimensions_exceeded",
        "Image dimensions exceed the showcase limit.",
      );
    }

    try {
      storedObjects = await storeShowcaseObjects(
        context.env,
        upload.creation_id,
        upload.id,
        bytes,
        imageInfo.contentType,
      );
    } catch (error) {
      if (error instanceof Error && /output_limit_exceeded/iu.test(error.message)) {
        throw new HttpError(413, "creation_image_output_too_large", "Processed image is too large.");
      }
      throw new HttpError(
        503,
        "creation_image_processing_unavailable",
        "Image processing is temporarily unavailable. Try again later.",
      );
    }

    const replacementId = await commitShowcaseImage(context.env, upload, imageInfo, storedObjects);
    if (replacementId) {
      context.executionCtx.waitUntil(
        deleteShowcaseImageObjects(context.env, upload.creation_id, replacementId)
          .catch(() => {
            console.error(JSON.stringify({ message: "showcase_replacement_cleanup_failed" }));
          }),
      );
    }
  } catch (error) {
    if (storedObjects.length) {
      await context.env.PROJECTS.delete(storedObjects.map((object) => object.key));
    }
    await failUpload(
      context.env,
      upload.id,
      error instanceof HttpError ? error.code : "processing_failed",
    );
    throw imageQuotaError(error) ?? error;
  }

  const creation = await getCreationById(context.env, upload.creation_id);
  if (!creation) throw new Error("Committed showcase image has no creation.");
  const images = imagesFromCreation(creation);
  const image = images.find((candidate) => candidate.id === upload.id);
  if (!image) throw new Error("Committed showcase image is unavailable.");
  return success(context.requestId, { image, images }, 201);
}

async function listCreationImages(
  context: WorkerRequestContext,
): Promise<Response> {
  const creation = await visibleCreation(context);
  return success(context.requestId, imagesFromCreation(creation));
}

async function reorderCreationImages(
  context: WorkerRequestContext,
): Promise<Response> {
  const session = await requireOnboardedSession(context);
  const creation = await ownerDraftCreation(context, session.user.id);
  const input = await parseJson(context.request, UpdateCreationImagesSchema, 10_000);
  const current = imagesFromCreation(creation);
  const currentIds = new Set(current.map((image) => image.id));
  if (
    currentIds.size !== input.orderedImageIds.length
    || input.orderedImageIds.some((id) => !currentIds.has(id))
  ) {
    throw new HttpError(
      409,
      "creation_image_set_changed",
      "The showcase image list changed. Reload it before reordering.",
    );
  }
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    guardExactReadyImageSet(context.env, {
      creationId: creation.id,
      expectedImageIds: current.map((image) => image.id),
      now,
      ownerUserId: session.user.id,
      requiredRowId: current[0].id,
      requiredStatus: "ready",
    }),
    context.env.DB.prepare(
      `UPDATE creation_showcase_images
       SET status = 'reordering', is_cover = 0, updated_at = ?
       WHERE creation_id = ? AND status = 'ready'`,
    ).bind(now, creation.id),
  ];
  input.orderedImageIds.forEach((id, sortOrder) => {
    statements.push(
      context.env.DB.prepare(
        `UPDATE creation_showcase_images SET sort_order = ?, is_cover = ?, updated_at = ?
         WHERE id = ? AND creation_id = ? AND status = 'reordering'`,
      ).bind(sortOrder, Number(id === input.coverImageId), now, id, creation.id),
    );
  });
  statements.push(
    context.env.DB.prepare(
      `UPDATE creation_showcase_images SET status = 'ready', updated_at = ?
       WHERE creation_id = ? AND status = 'reordering'`,
    ).bind(now, creation.id),
  );
  try {
    await context.env.DB.batch(statements);
  } catch (error) {
    throw imageQuotaError(error) ?? error;
  }
  const updated = await getCreationById(context.env, creation.id);
  return success(context.requestId, { images: imagesFromCreation(updated!) });
}

async function deleteCreationImage(
  context: WorkerRequestContext,
): Promise<Response> {
  const session = await requireOnboardedSession(context);
  const creation = await ownerDraftCreation(context, session.user.id);
  const images = imagesFromCreation(creation);
  const target = images.find((image) => image.id === context.params.imageId);
  if (!target) throw new HttpError(404, "creation_image_not_found", "Showcase image was not found.");
  const remaining = images.filter((image) => image.id !== target.id);
  const coverId = target.isCover
    ? remaining[0]?.id
    : remaining.find((image) => image.isCover)?.id ?? remaining[0]?.id;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    guardExactReadyImageSet(context.env, {
      creationId: creation.id,
      expectedImageIds: images.map((image) => image.id),
      now,
      ownerUserId: session.user.id,
      requiredRowId: target.id,
      requiredStatus: "ready",
    }),
    context.env.DB.prepare(
      `UPDATE creation_showcase_images SET status = 'deleting', is_cover = 0,
       sort_order = NULL, upload_token_hash = NULL, deleted_at = ?, updated_at = ?
       WHERE id = ? AND creation_id = ? AND status = 'ready'`,
    ).bind(now, now, target.id, creation.id),
    context.env.DB.prepare(
      `UPDATE creation_showcase_objects SET status = 'deleting', updated_at = ?
       WHERE image_id = ? AND status = 'ready'`,
    ).bind(now, target.id),
    context.env.DB.prepare(
      `UPDATE creation_showcase_images SET status = 'reordering', is_cover = 0,
       updated_at = ? WHERE creation_id = ? AND status = 'ready'`,
    ).bind(now, creation.id),
  ];
  remaining.forEach((image, sortOrder) => {
    statements.push(
      context.env.DB.prepare(
        `UPDATE creation_showcase_images SET sort_order = ?, is_cover = ?, updated_at = ?
         WHERE id = ? AND creation_id = ? AND status = 'reordering'`,
      ).bind(sortOrder, Number(image.id === coverId), now, image.id, creation.id),
    );
  });
  statements.push(
    context.env.DB.prepare(
      `UPDATE creation_showcase_images SET status = 'ready', updated_at = ?
       WHERE creation_id = ? AND status = 'reordering'`,
    ).bind(now, creation.id),
  );
  let results: D1Result[];
  try {
    results = await context.env.DB.batch(statements);
  } catch (error) {
    throw imageQuotaError(error) ?? error;
  }
  if ((results[1]?.meta.changes ?? 0) !== 1) {
    throw new HttpError(409, "creation_image_set_changed", "The showcase image list changed.");
  }
  context.executionCtx.waitUntil(
    deleteShowcaseImageObjects(context.env, creation.id, target.id).catch(() => {
      console.error(JSON.stringify({ message: "showcase_delete_cleanup_failed" }));
    }),
  );
  const updated = await getCreationById(context.env, creation.id);
  return success(context.requestId, {
    deletedImageId: target.id,
    images: imagesFromCreation(updated!),
  });
}

async function serveCreationImage(
  context: WorkerRequestContext,
): Promise<Response> {
  const creation = await visibleCreation(context);
  const kind = context.params.variant as ShowcaseObjectKind;
  if (!(["display", "social", "thumb"] as const).includes(kind)) {
    throw new HttpError(404, "media_not_found", "Media variant was not found.");
  }
  const row = await context.env.DB.prepare(
    `SELECT cso.object_key, cso.content_type
     FROM creation_showcase_objects cso
     JOIN creation_showcase_images csi ON csi.id = cso.image_id
     WHERE csi.id = ? AND csi.creation_id = ? AND csi.status = 'ready'
       AND cso.kind = ? AND cso.status = 'ready' LIMIT 1`,
  ).bind(
    context.params.imageId,
    creation.id,
    kind,
  ).first<ShowcaseMediaObjectRow>();
  if (!row) throw new HttpError(404, "media_not_found", "Media was not found.");
  const object = await context.env.PROJECTS.get(row.object_key);
  if (!object) throw new HttpError(404, "media_not_found", "Media was not found.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", row.content_type);
  headers.set("ETag", object.httpEtag);
  if (creation.state === "published" && creation.visibility === "public") {
    headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  } else {
    headers.set("Cache-Control", "private, no-store");
  }
  return new Response(object.body, { headers });
}

export async function getPreferredShowcaseObject(
  env: Env,
  creationId: string,
  kind: ShowcaseObjectKind,
): Promise<ShowcaseMediaObjectRow | null> {
  return env.DB.prepare(
    `SELECT cso.object_key, cso.content_type
     FROM creation_showcase_images csi
     JOIN creation_showcase_objects cso ON cso.image_id = csi.id
     WHERE csi.creation_id = ? AND csi.status = 'ready' AND csi.is_cover = 1
       AND cso.kind = ? AND cso.status = 'ready' LIMIT 1`,
  ).bind(creationId, kind).first<ShowcaseMediaObjectRow>();
}

export async function deleteShowcaseImageObjects(
  env: Env,
  creationId: string,
  imageId: string,
): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT object_key FROM creation_showcase_objects WHERE image_id = ?",
  ).bind(imageId).all<{ object_key: string }>();
  const prefix = `private/creations/${creationId}/showcase/${imageId}`;
  const keys = Array.from(new Set([
    ...rows.results.map((row) => row.object_key),
    `${prefix}/display.webp`,
    `${prefix}/thumb.webp`,
    `${prefix}/social.jpg`,
  ]));
  await env.PROJECTS.delete(keys);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM quota_reservations WHERE id = ?").bind(imageId),
    env.DB.prepare(
      `DELETE FROM creation_showcase_images
       WHERE id = ? AND status IN ('reserved', 'processing', 'failed', 'deleting')`,
    ).bind(imageId),
  ]);
}

async function commitShowcaseImage(
  env: Env,
  upload: ClaimedUploadRow,
  imageInfo: { contentType: string; height: number; width: number },
  objects: StoredShowcaseObject[],
): Promise<string | null> {
  const ready = await readyImageRows(env, upload.creation_id);
  const replacement = upload.replaces_image_id
    ? ready.find((image) => image.id === upload.replaces_image_id) ?? null
    : null;
  if (upload.replaces_image_id && !replacement) {
    throw new HttpError(
      409,
      "creation_image_set_changed",
      "The image being replaced changed. Reload the showcase before trying again.",
    );
  }
  if (!replacement && ready.length >= COMMUNITY_LIMITS.creationImagesPerCreation) {
    throw new HttpError(
      409,
      "creation_image_limit_exceeded",
      "A creation may have up to four showcase images.",
    );
  }
  const usedPositions = new Set(ready.map((image) => image.sort_order));
  const sortOrder = replacement?.sort_order
    ?? [0, 1, 2, 3].find((position) => !usedPositions.has(position));
  if (sortOrder === undefined) {
    throw new HttpError(409, "creation_image_limit_exceeded", "No showcase image slot is available.");
  }
  const isCover = replacement ? Boolean(replacement.is_cover) : ready.length === 0;
  const objectBytes = objects.reduce((total, object) => total + object.byteSize, 0);
  const reservedBytes = Math.max(0, objectBytes - (replacement?.object_bytes ?? 0));
  const now = Date.now();
  try {
    const reservation = await env.DB.prepare(
      `UPDATE quota_reservations SET storage_bytes = ?, updated_at = ?, expires_at = ?
       WHERE id = ?`,
    ).bind(
      reservedBytes,
      now,
      now + UPLOAD_TICKET_TTL_MS,
      upload.id,
    ).run();
    if ((reservation.meta.changes ?? 0) !== 1) {
      throw new HttpError(
        409,
        "quota_reservation_expired",
        "The image upload reservation expired. Try again.",
      );
    }
  } catch (error) {
    throw imageQuotaError(error) ?? error;
  }

  // The reservation has already been resized to the exact positive storage
  // delta. Remove it inside the same atomic batch before inserting objects so
  // quota triggers count each byte exactly once. If a later statement fails,
  // D1 rolls the reservation deletion back with the rest of the batch.
  const statements: D1PreparedStatement[] = [
    guardExactReadyImageSet(env, {
      creationId: upload.creation_id,
      expectedImageIds: ready.map((image) => image.id),
      now,
      ownerUserId: upload.owner_user_id,
      requiredRowId: upload.id,
      requiredStatus: "processing",
    }),
    env.DB.prepare("DELETE FROM quota_reservations WHERE id = ?").bind(upload.id),
  ];
  if (replacement) {
    statements.push(
      env.DB.prepare(
        `UPDATE creation_showcase_images SET status = 'deleting', is_cover = 0,
         sort_order = NULL, deleted_at = ?, updated_at = ?
         WHERE id = ? AND creation_id = ? AND status = 'ready'
           AND sort_order = ? AND is_cover = ?`,
      ).bind(
        now,
        now,
        replacement.id,
        upload.creation_id,
        replacement.sort_order,
        replacement.is_cover,
      ),
      env.DB.prepare(
        `UPDATE creation_showcase_objects SET status = 'deleting', updated_at = ?
         WHERE image_id = ? AND status = 'ready'`,
      ).bind(now, replacement.id),
    );
  }
  for (const object of objects) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO creation_showcase_objects
         (id, image_id, creation_id, kind, object_key, content_type,
          byte_size, sha256, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        upload.id,
        upload.creation_id,
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
  statements.push(
    env.DB.prepare(
      `UPDATE creation_showcase_images SET status = 'ready',
       detected_content_type = ?, source_byte_size = ?, source_width = ?,
       source_height = ?, sort_order = ?, is_cover = ?, ready_at = ?,
       expires_at = ?, updated_at = ?, failure_code = NULL
       WHERE id = ? AND status = 'processing'`,
    ).bind(
      imageInfo.contentType,
      upload.expected_byte_size,
      imageInfo.width,
      imageInfo.height,
      sortOrder,
      Number(isCover),
      now,
      now + UPLOAD_TICKET_TTL_MS,
      now,
      upload.id,
    ),
  );
  try {
    const results = await env.DB.batch(statements);
    const promotion = results.at(-1);
    if ((promotion?.meta.changes ?? 0) !== 1) {
      throw new HttpError(409, "creation_image_set_changed", "The showcase image list changed.");
    }
  } catch (error) {
    throw imageQuotaError(error) ?? error;
  }
  return replacement?.id ?? null;
}

export function guardExactReadyImageSet(
  env: Env,
  options: {
    creationId: string;
    expectedImageIds: string[];
    now: number;
    ownerUserId: string;
    requiredRowId: string;
    requiredStatus: "processing" | "ready";
  },
): D1PreparedStatement {
  const placeholders = options.expectedImageIds.map(() => "?").join(", ");
  const unexpectedImageClause = options.expectedImageIds.length
    ? `OR EXISTS (
         SELECT 1 FROM creation_showcase_images
         WHERE creation_id = ? AND status = 'ready'
           AND id NOT IN (${placeholders})
       )`
    : "";
  const statement = env.DB.prepare(
    `INSERT INTO creation_showcase_images
     (id, creation_id, owner_user_id, upload_token_hash,
      expected_content_type, expected_byte_size, alt_text, status,
      failure_code, expires_at, created_at, updated_at)
     SELECT ?, ?, ?, NULL, 'image/png', 1, 'Gallery mutation guard', 'failed',
       'creation_image_set_guard', ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM creation_showcase_images
       WHERE id = ? AND creation_id = ? AND status = ?
     )
     OR (
       SELECT COUNT(*) FROM creation_showcase_images
       WHERE creation_id = ? AND status = 'ready'
     ) != ?
     ${unexpectedImageClause}`,
  );
  return statement.bind(
    options.requiredRowId,
    options.creationId,
    options.ownerUserId,
    options.now + 1,
    options.now,
    options.now,
    options.requiredRowId,
    options.creationId,
    options.requiredStatus,
    options.creationId,
    options.expectedImageIds.length,
    ...(options.expectedImageIds.length
      ? [options.creationId, ...options.expectedImageIds]
      : []),
  );
}

async function inspectImage(
  env: Env,
  bytes: Uint8Array,
): Promise<{ contentType: string; height: number; width: number }> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  let info: ImageInfoResponse;
  try {
    info = await env.IMAGES.info(new Blob([copy.buffer]).stream());
  } catch {
    throw new HttpError(400, "invalid_creation_image", "Uploaded bytes are not a valid image.");
  }
  if (!("width" in info) || !("height" in info)) {
    throw new HttpError(415, "unsupported_image_type", "SVG showcase images are not supported.");
  }
  const contentType = normalizeDetectedImageType(info.format);
  if (!contentType) {
    throw new HttpError(
      415,
      "unsupported_image_type",
      "Use a JPEG, PNG, WebP, HEIC, or HEIF image.",
    );
  }
  return { contentType, height: info.height, width: info.width };
}

function normalizeDetectedImageType(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    heic: "image/heic",
    heif: "image/heif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const candidate = aliases[normalized] ?? normalized;
  return ["image/heic", "image/heif", "image/jpeg", "image/png", "image/webp"]
    .includes(candidate)
    ? candidate
    : null;
}

function sameImageFormat(expected: string, detected: string): boolean {
  const heicFamily = new Set(["image/heic", "image/heif"]);
  return expected === detected || (heicFamily.has(expected) && heicFamily.has(detected));
}

async function ownerDraftCreation(
  context: WorkerRequestContext,
  userId: string,
): Promise<CreationRow> {
  const creation = await ownerCreation(context, userId);
  if (creation.state !== "draft" || creation.visibility !== "private") {
    throw new HttpError(
      409,
      "creation_image_private_draft_required",
      "Unpublish the creation before changing showcase images.",
    );
  }
  return creation;
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
  if (creation.state === "hidden") {
    throw new HttpError(
      409,
      "creation_moderation_hold",
      "A moderator must restore this creation before it can be changed.",
    );
  }
  return creation;
}

async function visibleCreation(
  context: WorkerRequestContext,
): Promise<CreationRow> {
  const creation = await getCreationById(context.env, context.params.id);
  if (!creation || creation.state === "deleted") {
    throw new HttpError(404, "creation_not_found", "Creation was not found.");
  }
  const viewer = await optionalSession(context);
  const isOwner = Boolean(viewer && viewer.user.id === creation.owner_user_id);
  const isPublished = creation.state === "published" && creation.visibility !== "private";
  if (!isOwner && !isPublished) {
    throw new HttpError(404, "creation_not_found", "Creation was not found.");
  }
  return creation;
}

function imagesFromCreation(creation: CreationRow): ShowcaseImageApi[] {
  return creationToApi(creation).images;
}

async function readyImageRows(env: Env, creationId: string): Promise<ReadyImageRow[]> {
  const rows = await env.DB.prepare(
    `SELECT csi.id, csi.sort_order, csi.is_cover,
      COALESCE(SUM(CASE WHEN cso.status = 'ready' THEN cso.byte_size ELSE 0 END), 0)
        AS object_bytes
     FROM creation_showcase_images csi
     LEFT JOIN creation_showcase_objects cso ON cso.image_id = csi.id
     WHERE csi.creation_id = ? AND csi.status = 'ready'
     GROUP BY csi.id, csi.sort_order, csi.is_cover
     ORDER BY csi.sort_order ASC, csi.id ASC`,
  ).bind(creationId).all<ReadyImageRow>();
  return rows.results;
}

async function imageObjectBytes(env: Env, imageId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(byte_size), 0) AS bytes
     FROM creation_showcase_objects WHERE image_id = ? AND status = 'ready'`,
  ).bind(imageId).first<{ bytes: number }>();
  return Number(row?.bytes ?? 0);
}

async function failUpload(env: Env, uploadId: string, code: string): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM quota_reservations WHERE id = ?").bind(uploadId),
    env.DB.prepare(
      `UPDATE creation_showcase_images SET status = 'failed', upload_token_hash = NULL,
       failure_code = ?, updated_at = ?
       WHERE id = ? AND status IN ('reserved', 'processing')`,
    ).bind(code.slice(0, 80), now, uploadId),
  ]);
}

async function uploadTokenHash(env: Env, token: string): Promise<string> {
  if (!isStrongRuntimeSecret(env.SESSION_PEPPER, env.ENVIRONMENT)) {
    throw new Error("Session secret is not securely configured.");
  }
  return sha256(`${env.SESSION_PEPPER.trim()}:creation-image-upload:${token}`);
}

function imageQuotaError(error: unknown): HttpError | null {
  if (!(error instanceof Error)) return null;
  if (/creation_image_daily_quota_exceeded/iu.test(error.message)) {
    return new HttpError(
      429,
      "creation_image_daily_quota_exceeded",
      "Daily showcase image upload limit reached.",
      undefined,
      undefined,
      { "Retry-After": "86400" },
    );
  }
  if (/creation_image_limit_exceeded/iu.test(error.message)) {
    return new HttpError(
      409,
      "creation_image_limit_exceeded",
      "A creation may have up to four showcase images.",
    );
  }
  if (/storage_quota_exceeded/iu.test(error.message)) {
    return new HttpError(409, "storage_quota_exceeded", "Cloud storage limit reached.");
  }
  if (/creation_image_private_draft_required/iu.test(error.message)) {
    return new HttpError(
      409,
      "creation_image_private_draft_required",
      "Unpublish the creation before changing showcase images.",
    );
  }
  if (
    /creation_image_set_changed/iu.test(error.message)
    || /unique constraint failed: creation_showcase_images\.creation_id/iu.test(error.message)
  ) {
    return new HttpError(
      409,
      "creation_image_set_changed",
      "The showcase image list changed. Reload it before trying again.",
    );
  }
  return null;
}
