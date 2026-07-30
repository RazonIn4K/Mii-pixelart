-- Tomodachi Studio community platform: initial forward-only D1 migration.
-- Timestamps are Unix milliseconds. IDs are application-generated UUIDv4
-- values except for stable governed tag IDs. Raw OAuth/session tokens are
-- never stored; sessions.token_hash contains a lowercase SHA-256 hex digest.

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT COLLATE NOCASE UNIQUE,
  display_name TEXT,
  bio TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'moderator', 'admin')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deletion_pending', 'deleted')),
  avatar_seed TEXT NOT NULL,
  terms_version TEXT,
  terms_accepted_at INTEGER,
  deletion_requested_at INTEGER,
  deletion_due_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (username IS NULL OR length(username) BETWEEN 3 AND 24),
  CHECK (display_name IS NULL OR length(display_name) BETWEEN 1 AND 50),
  CHECK (length(bio) <= 500),
  CHECK (
    (terms_version IS NULL AND terms_accepted_at IS NULL) OR
    (terms_version IS NOT NULL AND terms_accepted_at IS NOT NULL)
  ),
  CHECK (
    status != 'deletion_pending' OR
    (deletion_requested_at IS NOT NULL AND deletion_due_at IS NOT NULL)
  )
);

CREATE INDEX users_status_deletion_due_idx
  ON users(status, deletion_due_at)
  WHERE status = 'deletion_pending';

CREATE TABLE external_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'google'),
  provider_subject TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider)
);

CREATE INDEX external_identities_user_idx
  ON external_identities(user_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ua_label TEXT CHECK (ua_label IS NULL OR length(ua_label) <= 160),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_authenticated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_active_idx
  ON sessions(user_id, created_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX sessions_expiry_idx
  ON sessions(expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE creations (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) = 18),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  state TEXT NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'published', 'hidden', 'deleted')),
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  comments_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (comments_enabled IN (0, 1)),
  project_download_enabled INTEGER NOT NULL DEFAULT 0
    CHECK (project_download_enabled IN (0, 1)),
  current_revision_id TEXT REFERENCES creation_revisions(id) ON DELETE SET NULL,
  bytes_total INTEGER NOT NULL DEFAULT 0 CHECK (bytes_total >= 0),
  published_at INTEGER,
  hidden_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (state != 'published' OR visibility IN ('unlisted', 'public')),
  CHECK (state != 'published' OR published_at IS NOT NULL),
  CHECK (state != 'deleted' OR deleted_at IS NOT NULL)
);

CREATE INDEX creations_owner_updated_idx
  ON creations(owner_user_id, state, updated_at DESC, id DESC);
CREATE INDEX creations_public_recent_idx
  ON creations(published_at DESC, id DESC)
  WHERE state = 'published' AND visibility = 'public';
CREATE INDEX creations_unlisted_slug_idx
  ON creations(slug)
  WHERE state = 'published' AND visibility = 'unlisted';

CREATE TABLE creation_revisions (
  id TEXT PRIMARY KEY,
  creation_id TEXT NOT NULL REFERENCES creations(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'ready', 'failed', 'obsolete')),
  project_bytes INTEGER NOT NULL DEFAULT 0
    CHECK (project_bytes BETWEEN 0 AND 2097152),
  project_sha256 TEXT CHECK (project_sha256 IS NULL OR length(project_sha256) = 64),
  created_at INTEGER NOT NULL,
  ready_at INTEGER,
  obsolete_at INTEGER,
  UNIQUE (creation_id, revision_number),
  CHECK (status != 'ready' OR (ready_at IS NOT NULL AND project_sha256 IS NOT NULL)),
  CHECK (status != 'obsolete' OR obsolete_at IS NOT NULL)
);

CREATE INDEX creation_revisions_creation_idx
  ON creation_revisions(creation_id, revision_number DESC);
CREATE INDEX creation_revisions_stale_upload_idx
  ON creation_revisions(created_at)
  WHERE status = 'uploading';
CREATE INDEX creation_revisions_obsolete_idx
  ON creation_revisions(obsolete_at)
  WHERE status = 'obsolete';

CREATE TABLE creation_objects (
  id TEXT PRIMARY KEY,
  creation_id TEXT NOT NULL REFERENCES creations(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL REFERENCES creation_revisions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('project_json', 'preview', 'thumb', 'social')),
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL
    CHECK (content_type IN ('application/json', 'image/webp', 'image/jpeg')),
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'deleting')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (revision_id, kind)
);

CREATE INDEX creation_objects_creation_idx
  ON creation_objects(creation_id, revision_id);
CREATE INDEX creation_objects_cleanup_idx
  ON creation_objects(status, updated_at);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (length(slug) BETWEEN 2 AND 40),
  CHECK (length(name) BETWEEN 2 AND 50),
  CHECK (length(description) <= 300)
);

CREATE TABLE creation_tags (
  creation_id TEXT NOT NULL REFERENCES creations(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (creation_id, tag_id)
);

CREATE INDEX creation_tags_tag_idx
  ON creation_tags(tag_id, creation_id);

CREATE TABLE creation_stats (
  creation_id TEXT PRIMARY KEY REFERENCES creations(id) ON DELETE CASCADE,
  like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  popularity_score REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX creation_stats_popular_idx
  ON creation_stats(popularity_score DESC, creation_id DESC);

CREATE TABLE likes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creation_id TEXT NOT NULL REFERENCES creations(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, creation_id)
);

CREATE INDEX likes_creation_idx
  ON likes(creation_id, created_at DESC);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  creation_id TEXT NOT NULL REFERENCES creations(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'hidden', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  hidden_at INTEGER,
  deleted_at INTEGER,
  CHECK (status != 'hidden' OR hidden_at IS NOT NULL),
  CHECK (status != 'deleted' OR deleted_at IS NOT NULL)
);

CREATE INDEX comments_creation_active_idx
  ON comments(creation_id, created_at ASC, id ASC)
  WHERE status = 'active';
CREATE INDEX comments_author_idx
  ON comments(author_user_id, created_at DESC);

CREATE TABLE follows (
  follower_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_user_id, followed_user_id),
  CHECK (follower_user_id != followed_user_id)
);

CREATE INDEX follows_followed_idx
  ON follows(followed_user_id, created_at DESC);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reporter_pseudonym TEXT NOT NULL,
  target_type TEXT NOT NULL
    CHECK (target_type IN ('creation', 'comment', 'user')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL
    CHECK (reason IN (
      'spam',
      'harassment',
      'sexual_content',
      'violence',
      'personal_information',
      'copyright',
      'other'
    )),
  details TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  assigned_moderator_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT CHECK (resolution_note IS NULL OR length(resolution_note) <= 2000),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER,
  free_text_purge_at INTEGER,
  retain_until INTEGER NOT NULL,
  CHECK (status NOT IN ('resolved', 'dismissed') OR resolved_at IS NOT NULL)
);

CREATE UNIQUE INDEX reports_one_open_target_idx
  ON reports(reporter_user_id, target_type, target_id)
  WHERE reporter_user_id IS NOT NULL AND status IN ('open', 'reviewing');
CREATE INDEX reports_moderation_queue_idx
  ON reports(status, created_at ASC, id ASC);
CREATE INDEX reports_reporter_daily_idx
  ON reports(reporter_user_id, created_at DESC);
CREATE INDEX reports_free_text_cleanup_idx
  ON reports(free_text_purge_at)
  WHERE free_text_purge_at IS NOT NULL;

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
      'resolve_report',
      'dismiss_report'
    )),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  created_at INTEGER NOT NULL,
  retain_until INTEGER NOT NULL
);

CREATE INDEX moderation_actions_target_idx
  ON moderation_actions(target_type, target_id, created_at DESC);
CREATE INDEX moderation_actions_report_idx
  ON moderation_actions(report_id, created_at ASC);
CREATE INDEX moderation_actions_retention_idx
  ON moderation_actions(retain_until);

-- Moderation actions are append-only. The retention job may DELETE expired
-- rows, but neither application code nor operators may rewrite audit history.
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

-- This FTS table intentionally has no automatic insert/update triggers.
-- A publish/profile/tag transaction deletes and reinserts the complete public
-- search row so title, username, and aggregated allowlisted tags stay atomic.
-- Unpublish, hide, delete, or public->unlisted transitions delete its row.
CREATE VIRTUAL TABLE creation_search USING fts5(
  creation_id UNINDEXED,
  title,
  description,
  username,
  tags,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER creations_search_delete
AFTER DELETE ON creations
BEGIN
  DELETE FROM creation_search WHERE creation_id = OLD.id;
END;

-- Governed launch taxonomy. Users may select up to five active tags; only a
-- moderator migration or moderation tool can create/activate taxonomy terms.
INSERT INTO tags (id, slug, name, description, is_active, created_at, updated_at)
VALUES
  ('tag-portraits', 'portraits', 'Portraits', 'Pixel portraits and face studies.', 1, 0, 0),
  ('tag-face-masks', 'face-masks', 'Face Masks', 'Repaint guides intended for in-game face masks.', 1, 0, 0),
  ('tag-characters', 'characters', 'Characters', 'Original character and mascot designs.', 1, 0, 0),
  ('tag-icons', 'icons', 'Icons', 'Small, readable icons and badges.', 1, 0, 0),
  ('tag-logos', 'logos', 'Logos & Marks', 'Original logos, emblems, and graphic marks.', 1, 0, 0),
  ('tag-outfits', 'outfits', 'Outfits', 'Clothing and outfit repaint ideas.', 1, 0, 0),
  ('tag-decor', 'decor', 'Decor', 'Furniture, signs, exteriors, and decorative builds.', 1, 0, 0),
  ('tag-food', 'food', 'Food', 'Food, drink, and menu-inspired pixel art.', 1, 0, 0),
  ('tag-sprites', 'sprites', 'Sprites', 'Compact sprite-style pixel art.', 1, 0, 0),
  ('tag-guides', 'guides', 'Paint Guides', 'Step-by-step and paint-by-number friendly work.', 1, 0, 0),
  ('tag-memes', 'memes', 'Memes', 'Transformative joke and reaction designs.', 1, 0, 0),
  ('tag-other', 'other', 'Other', 'Community work that does not fit another launch tag.', 1, 0, 0);
