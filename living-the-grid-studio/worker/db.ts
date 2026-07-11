export interface CreationRow {
  avatar_seed: string;
  bytes_total: number;
  comment_count: number;
  comments_enabled: number;
  comments_locked: number;
  created_at: number;
  current_revision_id: string | null;
  description: string;
  display_name: string;
  id: string;
  like_count: number;
  owner_user_id: string;
  popularity_score: number;
  project_download_enabled: number;
  published_at: number | null;
  revision_number: number | null;
  slug: string;
  state: "deleted" | "draft" | "hidden" | "published";
  tag_slugs: string;
  tags_json: string;
  title: string;
  updated_at: number;
  username: string | null;
  visibility: "private" | "public" | "unlisted";
}

export interface PublicUserRow {
  avatar_seed: string;
  bio: string;
  created_at: number;
  display_name: string;
  follower_count: number;
  following_count: number;
  id: string;
  username: string;
}

export const CREATION_SELECT = `
  SELECT c.id, c.owner_user_id, c.slug, c.title, c.description, c.state,
    c.visibility, c.comments_enabled, c.comments_locked, c.project_download_enabled,
    c.current_revision_id, c.bytes_total, c.published_at, c.created_at,
    c.updated_at, u.username, u.display_name, u.avatar_seed,
    COALESCE(cs.like_count, 0) AS like_count,
    COALESCE(cs.comment_count, 0) AS comment_count,
    COALESCE(cs.popularity_score, 0) AS popularity_score,
    cr.revision_number,
    COALESCE((SELECT GROUP_CONCAT(t.slug, ',') FROM creation_tags ct
      JOIN tags t ON t.id = ct.tag_id WHERE ct.creation_id = c.id), '') AS tag_slugs,
    COALESCE((SELECT JSON_GROUP_ARRAY(JSON_OBJECT(
      'slug', t.slug, 'name', t.name, 'description', t.description
    )) FROM creation_tags ct
      JOIN tags t ON t.id = ct.tag_id WHERE ct.creation_id = c.id), '[]') AS tags_json
  FROM creations c
  JOIN users u ON u.id = c.owner_user_id
  LEFT JOIN creation_stats cs ON cs.creation_id = c.id
  LEFT JOIN creation_revisions cr ON cr.id = c.current_revision_id`;

export function creationToApi(row: CreationRow) {
  return {
    commentsEnabled: Boolean(row.comments_enabled),
    commentsLocked: Boolean(row.comments_locked),
    createdAt: row.created_at,
    description: row.description,
    projectDownloadEnabled: Boolean(row.project_download_enabled),
    id: row.id,
    likedByViewer: false,
    owner: {
      avatarSeed: row.avatar_seed,
      displayName: row.display_name,
      id: row.owner_user_id,
      username: row.username,
    },
    publishedAt: row.published_at,
    revision: row.revision_number,
    slug: row.slug,
    state: row.state,
    stats: {
      comments: row.comment_count,
      likes: row.like_count,
    },
    title: row.title,
    tags: parseTags(row.tags_json),
    updatedAt: row.updated_at,
    visibility: row.visibility,
  };
}

function parseTags(value: string): { description: string; name: string; slug: string }[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((tag): tag is { description: string; name: string; slug: string } => (
      Boolean(tag)
      && typeof tag === "object"
      && typeof (tag as Record<string, unknown>).description === "string"
      && typeof (tag as Record<string, unknown>).name === "string"
      && typeof (tag as Record<string, unknown>).slug === "string"
    ));
  } catch {
    return [];
  }
}

export function publicUserToApi(row: PublicUserRow) {
  return {
    avatarSeed: row.avatar_seed,
    bio: row.bio,
    createdAt: row.created_at,
    displayName: row.display_name,
    followers: row.follower_count,
    following: row.following_count,
    id: row.id,
    username: row.username,
  };
}

export function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /unique constraint failed/iu.test(error.message);
}

export async function getCreationById(
  env: Env,
  id: string,
): Promise<CreationRow | null> {
  return env.DB.prepare(`${CREATION_SELECT} WHERE c.id = ? LIMIT 1`)
    .bind(id)
    .first<CreationRow>();
}

export async function getCreationBySlug(
  env: Env,
  slug: string,
): Promise<CreationRow | null> {
  return env.DB.prepare(`${CREATION_SELECT} WHERE c.slug = ? LIMIT 1`)
    .bind(slug)
    .first<CreationRow>();
}
