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
  showcase_json: string;
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

export interface ShowcaseImageApi {
  altText: string;
  createdAt: number;
  displayUrl: string;
  height: number;
  id: string;
  isCover: boolean;
  socialImageUrl: string;
  sortOrder: number;
  thumbnailUrl: string;
  updatedAt: number;
  width: number;
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
    COALESCE((
      SELECT JSON_GROUP_ARRAY(JSON_OBJECT(
        'id', showcase.id,
        'altText', showcase.alt_text,
        'sortOrder', showcase.sort_order,
        'isCover', showcase.is_cover,
        'width', showcase.source_width,
        'height', showcase.source_height,
        'createdAt', showcase.created_at,
        'updatedAt', showcase.updated_at
      ))
      FROM (
        SELECT id, alt_text, sort_order, is_cover, source_width, source_height,
          created_at, updated_at
        FROM creation_showcase_images
        WHERE creation_id = c.id AND status = 'ready'
        ORDER BY sort_order ASC, id ASC
      ) AS showcase
    ), '[]') AS showcase_json,
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
  const images = showcaseImagesToApi(row.id, row.showcase_json);
  const cover = images.find((image) => image.isCover) ?? images[0];
  return {
    commentsEnabled: Boolean(row.comments_enabled),
    commentsLocked: Boolean(row.comments_locked),
    createdAt: row.created_at,
    description: row.description,
    projectDownloadEnabled: Boolean(row.project_download_enabled),
    id: row.id,
    likedByViewer: false,
    images,
    mediaSource: cover ? "showcase" : "generated",
    owner: {
      avatarSeed: row.avatar_seed,
      displayName: row.display_name,
      id: row.owner_user_id,
      username: row.username,
    },
    publishedAt: row.published_at,
    primaryImageUrl: cover?.displayUrl ?? `/api/creations/${row.id}/media/preview`,
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

export function showcaseImagesToApi(
  creationId: string,
  value: string,
): ShowcaseImageApi[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): ShowcaseImageApi[] => {
      if (!entry || typeof entry !== "object") return [];
      const image = entry as Record<string, unknown>;
      if (
        typeof image.id !== "string"
        || typeof image.altText !== "string"
        || !Number.isInteger(image.sortOrder)
        || typeof image.isCover !== "number"
        || !Number.isInteger(image.width)
        || !Number.isInteger(image.height)
        || !Number.isInteger(image.createdAt)
        || !Number.isInteger(image.updatedAt)
      ) return [];
      const encodedCreationId = encodeURIComponent(creationId);
      const encodedImageId = encodeURIComponent(image.id);
      const prefix = `/api/creations/${encodedCreationId}/images/${encodedImageId}`;
      return [{
        altText: image.altText,
        createdAt: Number(image.createdAt),
        displayUrl: `${prefix}/display`,
        height: Number(image.height),
        id: image.id,
        isCover: Boolean(image.isCover),
        socialImageUrl: `${prefix}/social`,
        sortOrder: Number(image.sortOrder),
        thumbnailUrl: `${prefix}/thumb`,
        updatedAt: Number(image.updatedAt),
        width: Number(image.width),
      }];
    });
  } catch {
    return [];
  }
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
