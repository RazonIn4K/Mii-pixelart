-- Explicit, raster-only showcase images for existing grid creations.
-- Raw uploads are never stored. The Worker records only sanitized WebP/JPEG
-- derivatives and uses short-lived, one-use upload-token hashes.

CREATE TABLE creation_showcase_upload_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE INDEX creation_showcase_upload_attempts_user_time_idx
  ON creation_showcase_upload_attempts(user_id, created_at DESC);

CREATE TRIGGER creation_showcase_upload_attempts_daily_limit
BEFORE INSERT ON creation_showcase_upload_attempts
WHEN (
  SELECT COUNT(*) FROM creation_showcase_upload_attempts
  WHERE user_id = NEW.user_id
    AND created_at >= NEW.created_at - 86400000
) >= 10
BEGIN
  SELECT RAISE(ABORT, 'creation_image_daily_quota_exceeded');
END;

CREATE TABLE creation_showcase_images (
  id TEXT PRIMARY KEY,
  creation_id TEXT NOT NULL REFERENCES creations(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upload_token_hash TEXT UNIQUE
    CHECK (upload_token_hash IS NULL OR length(upload_token_hash) = 64),
  expected_content_type TEXT NOT NULL
    CHECK (expected_content_type IN (
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
    )),
  expected_byte_size INTEGER NOT NULL
    CHECK (expected_byte_size BETWEEN 1 AND 8388608),
  detected_content_type TEXT
    CHECK (
      detected_content_type IS NULL OR
      detected_content_type IN (
        'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
      )
    ),
  source_byte_size INTEGER
    CHECK (source_byte_size IS NULL OR source_byte_size BETWEEN 1 AND 8388608),
  source_width INTEGER
    CHECK (source_width IS NULL OR source_width BETWEEN 1 AND 8192),
  source_height INTEGER
    CHECK (source_height IS NULL OR source_height BETWEEN 1 AND 8192),
  alt_text TEXT NOT NULL CHECK (length(alt_text) BETWEEN 1 AND 200),
  sort_order INTEGER CHECK (sort_order IS NULL OR sort_order BETWEEN 0 AND 3),
  is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
  replaces_image_id TEXT REFERENCES creation_showcase_images(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN (
      'reserved', 'processing', 'reordering', 'ready', 'failed', 'deleting'
    )),
  failure_code TEXT CHECK (failure_code IS NULL OR length(failure_code) <= 80),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ready_at INTEGER,
  deleted_at INTEGER,
  CHECK (expires_at > created_at),
  CHECK (status != 'reserved' OR upload_token_hash IS NOT NULL),
  CHECK (status = 'reserved' OR upload_token_hash IS NULL),
  CHECK (
    status NOT IN ('ready', 'reordering') OR
    (
      detected_content_type IS NOT NULL AND
      source_byte_size IS NOT NULL AND
      source_width IS NOT NULL AND
      source_height IS NOT NULL AND
      sort_order IS NOT NULL AND
      ready_at IS NOT NULL
    )
  ),
  CHECK (is_cover = 0 OR status IN ('ready', 'reordering')),
  CHECK (status != 'deleting' OR deleted_at IS NOT NULL)
);

CREATE INDEX creation_showcase_images_creation_idx
  ON creation_showcase_images(creation_id, status, sort_order, id);
CREATE INDEX creation_showcase_images_owner_attempt_idx
  ON creation_showcase_images(owner_user_id, created_at DESC);
CREATE INDEX creation_showcase_images_expiry_idx
  ON creation_showcase_images(status, expires_at);
CREATE INDEX creation_showcase_images_deleting_idx
  ON creation_showcase_images(status, deleted_at);
CREATE UNIQUE INDEX creation_showcase_images_ready_position_idx
  ON creation_showcase_images(creation_id, sort_order)
  WHERE status = 'ready';
CREATE UNIQUE INDEX creation_showcase_images_one_cover_idx
  ON creation_showcase_images(creation_id)
  WHERE status = 'ready' AND is_cover = 1;

CREATE TABLE creation_showcase_objects (
  id TEXT PRIMARY KEY,
  image_id TEXT NOT NULL REFERENCES creation_showcase_images(id) ON DELETE CASCADE,
  creation_id TEXT NOT NULL REFERENCES creations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('display', 'thumb', 'social')),
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/webp', 'image/jpeg')),
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0 AND byte_size <= 8388608),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'deleting')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (image_id, kind),
  CHECK (kind = 'social' OR content_type = 'image/webp'),
  CHECK (kind != 'social' OR content_type = 'image/jpeg')
);

CREATE INDEX creation_showcase_objects_creation_idx
  ON creation_showcase_objects(creation_id, image_id);
CREATE INDEX creation_showcase_objects_cleanup_idx
  ON creation_showcase_objects(status, updated_at);

CREATE TRIGGER creation_showcase_images_owner_guard_insert
BEFORE INSERT ON creation_showcase_images
WHEN (
  SELECT owner_user_id FROM creations WHERE id = NEW.creation_id
) IS NOT NEW.owner_user_id
BEGIN
  SELECT RAISE(ABORT, 'creation_image_owner_mismatch');
END;

CREATE TRIGGER creation_showcase_images_owner_guard_update
BEFORE UPDATE OF creation_id, owner_user_id ON creation_showcase_images
WHEN (
  SELECT owner_user_id FROM creations WHERE id = NEW.creation_id
) IS NOT NEW.owner_user_id
BEGIN
  SELECT RAISE(ABORT, 'creation_image_owner_mismatch');
END;

-- D1.batch() is atomic, but application code cannot branch on the affected-row
-- count of an earlier statement inside that batch. Gallery mutations therefore
-- issue a conditional sentinel insert as their first statement. If the exact
-- ready-image snapshot or required row changed, this trigger aborts the whole
-- transaction before any order, cover, object, or quota write can commit.
CREATE TRIGGER creation_showcase_images_set_guard
BEFORE INSERT ON creation_showcase_images
WHEN NEW.failure_code = 'creation_image_set_guard'
BEGIN
  SELECT RAISE(ABORT, 'creation_image_set_changed');
END;

CREATE TRIGGER creation_showcase_images_ready_limit
BEFORE UPDATE OF status ON creation_showcase_images
WHEN NEW.status = 'ready' AND OLD.status != 'ready' AND (
  SELECT COUNT(*) FROM creation_showcase_images
  WHERE creation_id = NEW.creation_id AND status = 'ready' AND id != NEW.id
) >= 4
BEGIN
  SELECT RAISE(ABORT, 'creation_image_limit_exceeded');
END;

-- The foreground transform runs outside D1. Recheck the parent at the exact
-- promotion write so a publish/unpublish race cannot attach a late image to a
-- non-private creation. RAISE aborts and rolls back the entire D1.batch(),
-- including derivative object rows and the quota-reservation deletion.
CREATE TRIGGER creation_showcase_images_ready_parent_guard
BEFORE UPDATE OF status ON creation_showcase_images
WHEN NEW.status = 'ready' AND OLD.status IN ('processing', 'reordering') AND NOT EXISTS (
  SELECT 1 FROM creations c
  WHERE c.id = NEW.creation_id
    AND c.owner_user_id = NEW.owner_user_id
    AND c.state = 'draft'
    AND c.visibility = 'private'
)
BEGIN
  SELECT RAISE(ABORT, 'creation_image_private_draft_required');
END;

CREATE TRIGGER creation_showcase_images_draft_mutation_guard
BEFORE UPDATE OF status ON creation_showcase_images
WHEN NEW.status IN ('reordering', 'deleting') AND OLD.status = 'ready' AND NOT EXISTS (
  SELECT 1 FROM creations c
  WHERE c.id = NEW.creation_id
    AND c.owner_user_id = NEW.owner_user_id
    AND c.state = 'draft'
    AND c.visibility = 'private'
)
BEGIN
  SELECT RAISE(ABORT, 'creation_image_private_draft_required');
END;

-- A replacement target is moved to deleting in the same transaction before
-- its successor is promoted. Require that exact transition so a concurrent
-- delete/reorder can never turn a replacement ticket into an implicit append.
CREATE TRIGGER creation_showcase_images_replacement_guard
BEFORE UPDATE OF status ON creation_showcase_images
WHEN NEW.status = 'ready' AND OLD.status = 'processing'
  AND OLD.replaces_image_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM creation_showcase_images replaced
    WHERE replaced.id = OLD.replaces_image_id
      AND replaced.creation_id = NEW.creation_id
      AND replaced.status = 'deleting'
      AND replaced.deleted_at = NEW.updated_at
      AND replaced.updated_at = NEW.updated_at
  )
BEGIN
  SELECT RAISE(ABORT, 'creation_image_set_changed');
END;

CREATE TRIGGER creation_showcase_objects_creation_guard_insert
BEFORE INSERT ON creation_showcase_objects
WHEN (
  SELECT creation_id FROM creation_showcase_images WHERE id = NEW.image_id
) IS NOT NEW.creation_id
BEGIN
  SELECT RAISE(ABORT, 'creation_image_object_mismatch');
END;

-- Extend the existing database-authoritative storage accounting to include
-- showcase derivatives whose original source bytes are never persisted.
DROP TRIGGER IF EXISTS quota_reservations_enforce_insert;
DROP TRIGGER IF EXISTS quota_reservations_enforce_update;
DROP TRIGGER IF EXISTS creation_objects_enforce_owner_storage_quota;

CREATE TRIGGER quota_reservations_enforce_insert
BEFORE INSERT ON quota_reservations
BEGIN
  SELECT RAISE(ABORT, 'creation_quota_exceeded') WHERE (
    (SELECT COUNT(*) FROM creations WHERE owner_user_id = NEW.user_id) +
    COALESCE((
      SELECT SUM(creation_slots) FROM quota_reservations
      WHERE user_id = NEW.user_id AND expires_at > NEW.updated_at
    ), 0) + NEW.creation_slots
  ) > 100;

  SELECT RAISE(ABORT, 'storage_quota_exceeded') WHERE (
    COALESCE((
      SELECT SUM(co.byte_size)
      FROM creation_objects co
      JOIN creations c ON c.id = co.creation_id
      WHERE c.owner_user_id = NEW.user_id
    ), 0) +
    COALESCE((
      SELECT SUM(cso.byte_size)
      FROM creation_showcase_objects cso
      JOIN creation_showcase_images csi ON csi.id = cso.image_id
      WHERE csi.owner_user_id = NEW.user_id
        AND cso.status = 'ready'
    ), 0) +
    COALESCE((
      SELECT SUM(storage_bytes) FROM quota_reservations
      WHERE user_id = NEW.user_id AND expires_at > NEW.updated_at
    ), 0) + NEW.storage_bytes
  ) > 52428800;
END;

CREATE TRIGGER quota_reservations_enforce_update
BEFORE UPDATE OF user_id, creation_slots, storage_bytes, updated_at, expires_at
ON quota_reservations
BEGIN
  SELECT RAISE(ABORT, 'creation_quota_exceeded') WHERE (
    (SELECT COUNT(*) FROM creations WHERE owner_user_id = NEW.user_id) +
    COALESCE((
      SELECT SUM(creation_slots) FROM quota_reservations
      WHERE user_id = NEW.user_id
        AND id != OLD.id
        AND expires_at > NEW.updated_at
    ), 0) + NEW.creation_slots
  ) > 100;

  SELECT RAISE(ABORT, 'storage_quota_exceeded') WHERE (
    COALESCE((
      SELECT SUM(co.byte_size)
      FROM creation_objects co
      JOIN creations c ON c.id = co.creation_id
      WHERE c.owner_user_id = NEW.user_id
    ), 0) +
    COALESCE((
      SELECT SUM(cso.byte_size)
      FROM creation_showcase_objects cso
      JOIN creation_showcase_images csi ON csi.id = cso.image_id
      WHERE csi.owner_user_id = NEW.user_id
        AND cso.status = 'ready'
    ), 0) +
    COALESCE((
      SELECT SUM(storage_bytes) FROM quota_reservations
      WHERE user_id = NEW.user_id
        AND id != OLD.id
        AND expires_at > NEW.updated_at
    ), 0) + NEW.storage_bytes
  ) > 52428800;
END;

CREATE TRIGGER creation_objects_enforce_owner_storage_quota
BEFORE INSERT ON creation_objects
WHEN (
  COALESCE((
    SELECT SUM(co.byte_size)
    FROM creation_objects co
    JOIN creations c ON c.id = co.creation_id
    WHERE c.owner_user_id = (
      SELECT owner_user_id FROM creations WHERE id = NEW.creation_id
    )
  ), 0) +
  COALESCE((
    SELECT SUM(cso.byte_size)
    FROM creation_showcase_objects cso
    JOIN creation_showcase_images csi ON csi.id = cso.image_id
    WHERE csi.owner_user_id = (
      SELECT owner_user_id FROM creations WHERE id = NEW.creation_id
    ) AND cso.status = 'ready'
  ), 0) + NEW.byte_size
) > 52428800
BEGIN
  SELECT RAISE(ABORT, 'storage_quota_exceeded');
END;

CREATE TRIGGER creation_showcase_objects_enforce_owner_storage_quota
BEFORE INSERT ON creation_showcase_objects
WHEN (
  COALESCE((
    SELECT SUM(co.byte_size)
    FROM creation_objects co
    JOIN creations c ON c.id = co.creation_id
    WHERE c.owner_user_id = (
      SELECT owner_user_id FROM creation_showcase_images WHERE id = NEW.image_id
    )
  ), 0) +
  COALESCE((
    SELECT SUM(cso.byte_size)
    FROM creation_showcase_objects cso
    JOIN creation_showcase_images csi ON csi.id = cso.image_id
    WHERE csi.owner_user_id = (
      SELECT owner_user_id FROM creation_showcase_images WHERE id = NEW.image_id
    ) AND cso.status = 'ready'
  ), 0) + NEW.byte_size
) > 52428800
BEGIN
  SELECT RAISE(ABORT, 'storage_quota_exceeded');
END;
