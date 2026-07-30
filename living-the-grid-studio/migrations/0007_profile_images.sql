-- Optional, normalized profile photos. Raw uploads are never retained. The
-- browser receives a short-lived one-use ticket, and only one square WebP
-- derivative is stored in private R2 behind an authorization-aware Worker
-- route. Generated avatars remain the permanent fallback.

CREATE TABLE profile_image_upload_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE INDEX profile_image_upload_attempts_user_time_idx
  ON profile_image_upload_attempts(user_id, created_at DESC);

CREATE TRIGGER profile_image_upload_attempts_daily_limit
BEFORE INSERT ON profile_image_upload_attempts
WHEN (
  SELECT COUNT(*) FROM profile_image_upload_attempts
  WHERE user_id = NEW.user_id
    AND created_at >= NEW.created_at - 86400000
) >= 10
BEGIN
  SELECT RAISE(ABORT, 'profile_image_daily_quota_exceeded');
END;

CREATE TABLE profile_images (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upload_token_hash TEXT UNIQUE
    CHECK (upload_token_hash IS NULL OR length(upload_token_hash) = 64),
  expected_content_type TEXT NOT NULL
    CHECK (expected_content_type IN (
      'image/jpeg', 'image/png', 'image/webp', 'image/heic'
    )),
  expected_byte_size INTEGER NOT NULL
    CHECK (expected_byte_size BETWEEN 1 AND 8388608),
  focus_x INTEGER NOT NULL CHECK (focus_x BETWEEN 0 AND 100),
  focus_y INTEGER NOT NULL CHECK (focus_y BETWEEN 0 AND 100),
  detected_content_type TEXT
    CHECK (
      detected_content_type IS NULL OR detected_content_type IN (
        'image/jpeg', 'image/png', 'image/webp', 'image/heic'
      )
    ),
  source_byte_size INTEGER
    CHECK (source_byte_size IS NULL OR source_byte_size BETWEEN 1 AND 8388608),
  source_width INTEGER
    CHECK (source_width IS NULL OR source_width BETWEEN 1 AND 8192),
  source_height INTEGER
    CHECK (source_height IS NULL OR source_height BETWEEN 1 AND 8192),
  replaces_image_id TEXT REFERENCES profile_images(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'processing', 'ready', 'failed', 'deleting')),
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
    status != 'ready' OR (
      detected_content_type IS NOT NULL AND source_byte_size IS NOT NULL AND
      source_width IS NOT NULL AND source_height IS NOT NULL AND
      ready_at IS NOT NULL
    )
  ),
  CHECK (status != 'deleting' OR deleted_at IS NOT NULL)
);

CREATE INDEX profile_images_user_status_idx
  ON profile_images(user_id, status, updated_at DESC);
CREATE INDEX profile_images_expiry_idx
  ON profile_images(status, expires_at);
CREATE INDEX profile_images_replaces_idx
  ON profile_images(replaces_image_id);
CREATE UNIQUE INDEX profile_images_one_ready_per_user_idx
  ON profile_images(user_id) WHERE status = 'ready';

ALTER TABLE users ADD COLUMN avatar_image_id TEXT
  REFERENCES profile_images(id) ON DELETE SET NULL;

CREATE INDEX users_avatar_image_id_idx
  ON users(avatar_image_id);
CREATE INDEX users_deleted_cleanup_idx
  ON users(status, updated_at) WHERE status = 'deleted';

CREATE TRIGGER users_avatar_image_pointer_guard
BEFORE UPDATE OF avatar_image_id ON users
WHEN NEW.avatar_image_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM profile_images pi
  WHERE pi.id = NEW.avatar_image_id AND pi.user_id = NEW.id
    AND pi.status = 'ready'
)
BEGIN
  SELECT RAISE(ABORT, 'profile_image_pointer_invalid');
END;

CREATE TABLE profile_image_objects (
  id TEXT PRIMARY KEY,
  image_id TEXT NOT NULL REFERENCES profile_images(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type = 'image/webp'),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 2097152),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'deleting')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (image_id)
);

CREATE INDEX profile_image_objects_user_idx
  ON profile_image_objects(user_id, status);
CREATE INDEX profile_image_objects_cleanup_idx
  ON profile_image_objects(status, updated_at);

-- A user report snapshots the exact normalized image that was public when the
-- report was created. The evidence row is immutable while it exists, and an
-- unresolved report prevents the manifested image row from being deleted.
-- Resolution releases the hold; normal object cleanup then deletes both the
-- image and its evidence row through ON DELETE CASCADE.
CREATE TABLE profile_image_report_evidence (
  report_id TEXT PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
  image_id TEXT NOT NULL REFERENCES profile_images(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type = 'image/webp'),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 2097152),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at INTEGER NOT NULL
);

CREATE INDEX profile_image_report_evidence_image_idx
  ON profile_image_report_evidence(image_id);
CREATE INDEX profile_image_report_evidence_user_idx
  ON profile_image_report_evidence(user_id);

CREATE TRIGGER profile_image_report_evidence_no_update
BEFORE UPDATE ON profile_image_report_evidence
BEGIN
  SELECT RAISE(ABORT, 'profile image report evidence is immutable');
END;

CREATE TRIGGER profile_images_report_hold_delete
BEFORE DELETE ON profile_images
WHEN EXISTS (
  SELECT 1
  FROM profile_image_report_evidence evidence
  JOIN reports report ON report.id = evidence.report_id
  WHERE evidence.image_id = OLD.id
    AND report.status IN ('open', 'reviewing')
)
BEGIN
  SELECT RAISE(ABORT, 'profile_image_evidence_held');
END;

CREATE TRIGGER profile_image_objects_user_guard_insert
BEFORE INSERT ON profile_image_objects
WHEN (
  SELECT user_id FROM profile_images WHERE id = NEW.image_id
) IS NOT NEW.user_id
BEGIN
  SELECT RAISE(ABORT, 'profile_image_object_mismatch');
END;

-- Promotion is valid only while the account still points to the image that
-- the ticket reserved for replacement (or to no image for a first upload).
-- The old image is moved to deleting earlier in the same D1 batch.
CREATE TRIGGER profile_images_ready_pointer_guard
BEFORE UPDATE OF status ON profile_images
WHEN NEW.status = 'ready' AND OLD.status = 'processing' AND (
  NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = NEW.user_id AND u.status = 'active'
      AND u.avatar_image_id IS OLD.replaces_image_id
  ) OR (
    OLD.replaces_image_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM profile_images old_image
      WHERE old_image.id = OLD.replaces_image_id
        AND old_image.user_id = NEW.user_id
        AND old_image.status = 'deleting'
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'profile_image_set_changed');
END;

-- Extend the database-authoritative 50 MiB account quota to profile-image
-- derivatives. Reservations remain the concurrency authority.
DROP TRIGGER quota_reservations_enforce_insert;
DROP TRIGGER quota_reservations_enforce_update;
DROP TRIGGER creation_objects_enforce_owner_storage_quota;
DROP TRIGGER creation_showcase_objects_enforce_owner_storage_quota;

CREATE TRIGGER quota_reservations_enforce_insert
BEFORE INSERT ON quota_reservations
BEGIN
  SELECT RAISE(ABORT, 'creation_quota_exceeded') WHERE (
    (SELECT COUNT(*) FROM creations WHERE owner_user_id = NEW.user_id) +
    COALESCE((SELECT SUM(creation_slots) FROM quota_reservations
      WHERE user_id = NEW.user_id AND expires_at > NEW.updated_at), 0) +
    NEW.creation_slots
  ) > 100;

  SELECT RAISE(ABORT, 'storage_quota_exceeded') WHERE (
    COALESCE((SELECT SUM(co.byte_size) FROM creation_objects co
      JOIN creations c ON c.id = co.creation_id
      WHERE c.owner_user_id = NEW.user_id), 0) +
    COALESCE((SELECT SUM(cso.byte_size) FROM creation_showcase_objects cso
      JOIN creation_showcase_images csi ON csi.id = cso.image_id
      WHERE csi.owner_user_id = NEW.user_id AND cso.status = 'ready'), 0) +
    COALESCE((SELECT SUM(pio.byte_size) FROM profile_image_objects pio
      WHERE pio.user_id = NEW.user_id
        AND pio.status IN ('ready', 'deleting')), 0) +
    COALESCE((SELECT SUM(storage_bytes) FROM quota_reservations
      WHERE user_id = NEW.user_id AND expires_at > NEW.updated_at), 0) +
    NEW.storage_bytes
  ) > 52428800;
END;

CREATE TRIGGER quota_reservations_enforce_update
BEFORE UPDATE OF user_id, creation_slots, storage_bytes, updated_at, expires_at
ON quota_reservations
BEGIN
  SELECT RAISE(ABORT, 'creation_quota_exceeded') WHERE (
    (SELECT COUNT(*) FROM creations WHERE owner_user_id = NEW.user_id) +
    COALESCE((SELECT SUM(creation_slots) FROM quota_reservations
      WHERE user_id = NEW.user_id AND id != OLD.id
        AND expires_at > NEW.updated_at), 0) +
    NEW.creation_slots
  ) > 100;

  SELECT RAISE(ABORT, 'storage_quota_exceeded') WHERE (
    COALESCE((SELECT SUM(co.byte_size) FROM creation_objects co
      JOIN creations c ON c.id = co.creation_id
      WHERE c.owner_user_id = NEW.user_id), 0) +
    COALESCE((SELECT SUM(cso.byte_size) FROM creation_showcase_objects cso
      JOIN creation_showcase_images csi ON csi.id = cso.image_id
      WHERE csi.owner_user_id = NEW.user_id AND cso.status = 'ready'), 0) +
    COALESCE((SELECT SUM(pio.byte_size) FROM profile_image_objects pio
      WHERE pio.user_id = NEW.user_id
        AND pio.status IN ('ready', 'deleting')), 0) +
    COALESCE((SELECT SUM(storage_bytes) FROM quota_reservations
      WHERE user_id = NEW.user_id AND id != OLD.id
        AND expires_at > NEW.updated_at), 0) +
    NEW.storage_bytes
  ) > 52428800;
END;

CREATE TRIGGER creation_objects_enforce_owner_storage_quota
BEFORE INSERT ON creation_objects
WHEN (
  COALESCE((SELECT SUM(co.byte_size) FROM creation_objects co
    JOIN creations c ON c.id = co.creation_id
    WHERE c.owner_user_id = (SELECT owner_user_id FROM creations WHERE id = NEW.creation_id)), 0) +
  COALESCE((SELECT SUM(cso.byte_size) FROM creation_showcase_objects cso
    JOIN creation_showcase_images csi ON csi.id = cso.image_id
    WHERE csi.owner_user_id = (SELECT owner_user_id FROM creations WHERE id = NEW.creation_id)
      AND cso.status = 'ready'), 0) +
  COALESCE((SELECT SUM(pio.byte_size) FROM profile_image_objects pio
    WHERE pio.user_id = (SELECT owner_user_id FROM creations WHERE id = NEW.creation_id)
      AND pio.status IN ('ready', 'deleting')), 0) + NEW.byte_size
) > 52428800
BEGIN
  SELECT RAISE(ABORT, 'storage_quota_exceeded');
END;

CREATE TRIGGER creation_showcase_objects_enforce_owner_storage_quota
BEFORE INSERT ON creation_showcase_objects
WHEN (
  COALESCE((SELECT SUM(co.byte_size) FROM creation_objects co
    JOIN creations c ON c.id = co.creation_id
    WHERE c.owner_user_id = (SELECT owner_user_id FROM creation_showcase_images WHERE id = NEW.image_id)), 0) +
  COALESCE((SELECT SUM(cso.byte_size) FROM creation_showcase_objects cso
    JOIN creation_showcase_images csi ON csi.id = cso.image_id
    WHERE csi.owner_user_id = (SELECT owner_user_id FROM creation_showcase_images WHERE id = NEW.image_id)
      AND cso.status = 'ready'), 0) +
  COALESCE((SELECT SUM(pio.byte_size) FROM profile_image_objects pio
    WHERE pio.user_id = (SELECT owner_user_id FROM creation_showcase_images WHERE id = NEW.image_id)
      AND pio.status IN ('ready', 'deleting')), 0) + NEW.byte_size
) > 52428800
BEGIN
  SELECT RAISE(ABORT, 'storage_quota_exceeded');
END;

CREATE TRIGGER profile_image_objects_enforce_owner_storage_quota
BEFORE INSERT ON profile_image_objects
WHEN (
  COALESCE((SELECT SUM(co.byte_size) FROM creation_objects co
    JOIN creations c ON c.id = co.creation_id WHERE c.owner_user_id = NEW.user_id), 0) +
  COALESCE((SELECT SUM(cso.byte_size) FROM creation_showcase_objects cso
    JOIN creation_showcase_images csi ON csi.id = cso.image_id
    WHERE csi.owner_user_id = NEW.user_id AND cso.status = 'ready'), 0) +
  COALESCE((SELECT SUM(pio.byte_size) FROM profile_image_objects pio
    WHERE pio.user_id = NEW.user_id
      AND pio.status IN ('ready', 'deleting')), 0) + NEW.byte_size
) > 52428800
BEGIN
  SELECT RAISE(ABORT, 'storage_quota_exceeded');
END;

-- Extend the immutable moderation-action vocabulary with the explicit custom
-- profile-image removal action. SQLite CHECK constraints require rebuilding
-- the table; 0007 is still forward-only and unapplied remotely.
DROP TRIGGER moderation_actions_no_update;
ALTER TABLE moderation_actions RENAME TO moderation_actions_v2;

CREATE TABLE moderation_actions (
  id TEXT PRIMARY KEY,
  report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
  moderator_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_pseudonym TEXT NOT NULL,
  target_type TEXT NOT NULL
    CHECK (target_type IN ('creation', 'comment', 'user', 'report')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN (
      'hide_creation',
      'restore_creation',
      'hide_comment',
      'restore_comment',
      'suspend_user',
      'restore_user',
      'remove_profile_image',
      'lock_comments',
      'unlock_comments',
      'resolve_report',
      'dismiss_report'
    )),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  created_at INTEGER NOT NULL,
  retain_until INTEGER NOT NULL
);

INSERT INTO moderation_actions (
  id, report_id, moderator_user_id, actor_pseudonym, target_type, target_id,
  action, reason, created_at, retain_until
)
SELECT
  id, report_id, moderator_user_id, actor_pseudonym, target_type, target_id,
  action, reason, created_at, retain_until
FROM moderation_actions_v2;

DROP TABLE moderation_actions_v2;

CREATE INDEX moderation_actions_target_idx
  ON moderation_actions(target_type, target_id, created_at DESC);
CREATE INDEX moderation_actions_report_idx
  ON moderation_actions(report_id, created_at ASC);
CREATE INDEX moderation_actions_retention_idx
  ON moderation_actions(retain_until);

CREATE TRIGGER moderation_actions_no_update
BEFORE UPDATE ON moderation_actions
WHEN NOT (
  NEW.id IS OLD.id AND
  NEW.actor_pseudonym IS OLD.actor_pseudonym AND
  NEW.target_type IS OLD.target_type AND
  NEW.target_id IS OLD.target_id AND
  NEW.action IS OLD.action AND
  NEW.reason IS OLD.reason AND
  NEW.created_at IS OLD.created_at AND
  NEW.retain_until IS OLD.retain_until AND
  (
    NEW.report_id IS OLD.report_id OR
    (OLD.report_id IS NOT NULL AND NEW.report_id IS NULL)
  ) AND
  (
    NEW.moderator_user_id IS OLD.moderator_user_id OR
    (OLD.moderator_user_id IS NOT NULL AND NEW.moderator_user_id IS NULL)
  ) AND
  (
    NEW.report_id IS NOT OLD.report_id OR
    NEW.moderator_user_id IS NOT OLD.moderator_user_id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'moderation_actions are immutable');
END;
