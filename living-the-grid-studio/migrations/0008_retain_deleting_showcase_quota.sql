-- Keep every physically present showcase derivative charged to the owner's
-- 50 MiB quota until its R2 deletion succeeds. Replacement and explicit
-- deletion move rows to `deleting` before asynchronous cleanup, so counting
-- only `ready` rows allowed failed cleanup to understate stored bytes.

DROP TRIGGER quota_reservations_enforce_insert;
DROP TRIGGER quota_reservations_enforce_update;
DROP TRIGGER creation_objects_enforce_owner_storage_quota;
DROP TRIGGER creation_showcase_objects_enforce_owner_storage_quota;
DROP TRIGGER profile_image_objects_enforce_owner_storage_quota;

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
      WHERE csi.owner_user_id = NEW.user_id
        AND cso.status IN ('ready', 'deleting')), 0) +
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
      WHERE csi.owner_user_id = NEW.user_id
        AND cso.status IN ('ready', 'deleting')), 0) +
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
      AND cso.status IN ('ready', 'deleting')), 0) +
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
      AND cso.status IN ('ready', 'deleting')), 0) +
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
    WHERE csi.owner_user_id = NEW.user_id
      AND cso.status IN ('ready', 'deleting')), 0) +
  COALESCE((SELECT SUM(pio.byte_size) FROM profile_image_objects pio
    WHERE pio.user_id = NEW.user_id
      AND pio.status IN ('ready', 'deleting')), 0) + NEW.byte_size
) > 52428800
BEGIN
  SELECT RAISE(ABORT, 'storage_quota_exceeded');
END;
