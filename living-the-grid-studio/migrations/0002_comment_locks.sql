-- Add moderator-owned comment locks without rewriting the initial migration.

ALTER TABLE creations ADD COLUMN comments_locked INTEGER NOT NULL DEFAULT 0
  CHECK (comments_locked IN (0, 1));

DROP TRIGGER moderation_actions_no_update;
ALTER TABLE moderation_actions RENAME TO moderation_actions_v1;

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
FROM moderation_actions_v1;

DROP TABLE moderation_actions_v1;

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
