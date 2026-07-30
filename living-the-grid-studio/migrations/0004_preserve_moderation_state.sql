-- Preserve the account state that existed before a deletion request so
-- canceling deletion cannot silently lift a moderator suspension.

ALTER TABLE users ADD COLUMN deletion_previous_status TEXT
  CHECK (
    deletion_previous_status IS NULL OR
    deletion_previous_status IN ('active', 'suspended')
  );
