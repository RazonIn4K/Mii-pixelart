-- Make cloud creation/storage quotas and the rolling report limit
-- database-authoritative under concurrent Worker requests.

CREATE TABLE quota_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creation_slots INTEGER NOT NULL DEFAULT 0
    CHECK (creation_slots IN (0, 1)),
  storage_bytes INTEGER NOT NULL DEFAULT 0
    CHECK (storage_bytes BETWEEN 0 AND 52428800),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK (updated_at >= created_at),
  CHECK (expires_at > updated_at)
);

CREATE INDEX quota_reservations_user_expiry_idx
  ON quota_reservations(user_id, expires_at);

-- Reservations serialize quota admission in D1. Expired reservations do not
-- count, so an interrupted Worker cannot block a user indefinitely.
CREATE TRIGGER quota_reservations_enforce_insert
BEFORE INSERT ON quota_reservations
BEGIN
  SELECT CASE WHEN (
    (SELECT COUNT(*) FROM creations WHERE owner_user_id = NEW.user_id) +
    COALESCE((
      SELECT SUM(creation_slots) FROM quota_reservations
      WHERE user_id = NEW.user_id AND expires_at > NEW.updated_at
    ), 0) + NEW.creation_slots
  ) > 100 THEN RAISE(ABORT, 'creation_quota_exceeded') END;

  SELECT CASE WHEN (
    COALESCE((
      SELECT SUM(co.byte_size)
      FROM creation_objects co
      JOIN creations c ON c.id = co.creation_id
      WHERE c.owner_user_id = NEW.user_id
    ), 0) +
    COALESCE((
      SELECT SUM(storage_bytes) FROM quota_reservations
      WHERE user_id = NEW.user_id AND expires_at > NEW.updated_at
    ), 0) + NEW.storage_bytes
  ) > 52428800 THEN RAISE(ABORT, 'storage_quota_exceeded') END;
END;

CREATE TRIGGER quota_reservations_enforce_update
BEFORE UPDATE OF user_id, creation_slots, storage_bytes, updated_at, expires_at
ON quota_reservations
BEGIN
  SELECT CASE WHEN (
    (SELECT COUNT(*) FROM creations WHERE owner_user_id = NEW.user_id) +
    COALESCE((
      SELECT SUM(creation_slots) FROM quota_reservations
      WHERE user_id = NEW.user_id
        AND id != OLD.id
        AND expires_at > NEW.updated_at
    ), 0) + NEW.creation_slots
  ) > 100 THEN RAISE(ABORT, 'creation_quota_exceeded') END;

  SELECT CASE WHEN (
    COALESCE((
      SELECT SUM(co.byte_size)
      FROM creation_objects co
      JOIN creations c ON c.id = co.creation_id
      WHERE c.owner_user_id = NEW.user_id
    ), 0) +
    COALESCE((
      SELECT SUM(storage_bytes) FROM quota_reservations
      WHERE user_id = NEW.user_id
        AND id != OLD.id
        AND expires_at > NEW.updated_at
    ), 0) + NEW.storage_bytes
  ) > 52428800 THEN RAISE(ABORT, 'storage_quota_exceeded') END;
END;

-- These guards keep direct/future writes authoritative even if they bypass
-- the current Worker reservation helpers.
CREATE TRIGGER creations_enforce_owner_quota
BEFORE INSERT ON creations
WHEN (SELECT COUNT(*) FROM creations WHERE owner_user_id = NEW.owner_user_id) >= 100
BEGIN
  SELECT RAISE(ABORT, 'creation_quota_exceeded');
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
  ), 0) + NEW.byte_size
) > 52428800
BEGIN
  SELECT RAISE(ABORT, 'storage_quota_exceeded');
END;

-- The hourly stale-upload job changes uploading revisions to failed. This
-- trigger releases any surviving reservation in that same D1 transaction.
CREATE TRIGGER quota_reservations_release_on_revision_status
AFTER UPDATE OF status ON creation_revisions
WHEN NEW.status IN ('failed', 'obsolete') AND NEW.status != OLD.status
BEGIN
  DELETE FROM quota_reservations WHERE id = NEW.id;
END;

CREATE TRIGGER quota_reservations_release_on_revision_delete
AFTER DELETE ON creation_revisions
BEGIN
  DELETE FROM quota_reservations WHERE id = OLD.id;
END;

CREATE TRIGGER quota_reservations_prune_after_insert
AFTER INSERT ON quota_reservations
BEGIN
  DELETE FROM quota_reservations
  WHERE user_id = NEW.user_id AND id != NEW.id AND expires_at <= NEW.updated_at;
END;

CREATE TRIGGER quota_reservations_prune_after_update
AFTER UPDATE ON quota_reservations
BEGIN
  DELETE FROM quota_reservations
  WHERE user_id = NEW.user_id AND id != NEW.id AND expires_at <= NEW.updated_at;
END;

-- The report row is the reservation and commit. D1 evaluates this trigger
-- under the same serialized write transaction as the INSERT, preserving the
-- existing rolling 24-hour semantics for concurrent distinct targets.
CREATE TRIGGER reports_enforce_rolling_daily_quota
BEFORE INSERT ON reports
WHEN NEW.reporter_user_id IS NOT NULL AND (
  SELECT COUNT(*) FROM reports
  WHERE reporter_user_id = NEW.reporter_user_id
    AND created_at >= NEW.created_at - 86400000
) >= 5
BEGIN
  SELECT RAISE(ABORT, 'report_daily_quota_exceeded');
END;
