import { deleteShowcaseImageObjects } from "./creation-images";

interface RevisionCleanupRow {
  creation_id: string;
  id: string;
}

interface ShowcaseCleanupRow {
  creation_id: string;
  id: string;
}

export async function runScheduledMaintenance(
  env: Env,
  controller: ScheduledController,
): Promise<void> {
  const now = controller.scheduledTime || Date.now();
  const hourAgo = now - 60 * 60 * 1_000;
  const dayAgo = now - 24 * 60 * 60 * 1_000;

  const purgedShowcaseAttempts = await env.DB.prepare(
    "DELETE FROM creation_showcase_upload_attempts WHERE created_at < ?",
  ).bind(dayAgo).run();

  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ? OR revoked_at <= ?")
    .bind(now, dayAgo)
    .run();

  const staleUploads = await env.DB.prepare(
    "SELECT id, creation_id FROM creation_revisions WHERE status = 'uploading' AND created_at <= ? LIMIT 100",
  ).bind(hourAgo).all<RevisionCleanupRow>();
  for (const revision of staleUploads.results) {
    await deleteRevisionObjects(env, revision.creation_id, revision.id);
    await env.DB.prepare(
      "UPDATE creation_revisions SET status = 'failed' WHERE id = ? AND status = 'uploading'",
    ).bind(revision.id).run();
  }

  const staleShowcaseUploads = await env.DB.prepare(
    `SELECT id, creation_id FROM creation_showcase_images
     WHERE status IN ('reserved', 'processing') AND expires_at <= ? LIMIT 100`,
  ).bind(now).all<ShowcaseCleanupRow>();
  let claimedStaleShowcaseUploads = 0;
  for (const image of staleShowcaseUploads.results) {
    if (await cleanupExpiredShowcaseUpload(env, image, now)) {
      claimedStaleShowcaseUploads += 1;
    }
  }

  const failedShowcaseUploads = await env.DB.prepare(
    `SELECT id, creation_id FROM creation_showcase_images
     WHERE status = 'failed' AND updated_at <= ? LIMIT 100`,
  ).bind(dayAgo).all<ShowcaseCleanupRow>();
  for (const image of failedShowcaseUploads.results) {
    await deleteShowcaseImageObjects(env, image.creation_id, image.id);
  }

  const deletingShowcaseImages = await env.DB.prepare(
    `SELECT id, creation_id FROM creation_showcase_images
     WHERE status = 'deleting' LIMIT 100`,
  ).all<ShowcaseCleanupRow>();
  for (const image of deletingShowcaseImages.results) {
    await deleteShowcaseImageObjects(env, image.creation_id, image.id);
  }

  const obsolete = await env.DB.prepare(
    "SELECT id, creation_id FROM creation_revisions WHERE status = 'obsolete' AND obsolete_at <= ? LIMIT 100",
  ).bind(dayAgo).all<RevisionCleanupRow>();
  for (const revision of obsolete.results) {
    await deleteRevisionObjects(env, revision.creation_id, revision.id);
    await env.DB.prepare("DELETE FROM creation_revisions WHERE id = ? AND status = 'obsolete'")
      .bind(revision.id)
      .run();
  }

  const deletedCreations = await env.DB.prepare(
    "SELECT id FROM creations WHERE state = 'deleted' AND deleted_at <= ? LIMIT 50",
  ).bind(dayAgo).all<{ id: string }>();
  for (const creation of deletedCreations.results) {
    await deleteCreationObjects(env, creation.id);
    await env.DB.prepare("DELETE FROM creations WHERE id = ? AND state = 'deleted'")
      .bind(creation.id)
      .run();
  }

  const dueAccounts = await env.DB.prepare(
    `SELECT id FROM users
     WHERE status = 'deletion_pending' AND deletion_due_at <= ? LIMIT 25`,
  ).bind(now).all<{ id: string }>();
  for (const user of dueAccounts.results) {
    const creations = await env.DB.prepare("SELECT id FROM creations WHERE owner_user_id = ?")
      .bind(user.id)
      .all<{ id: string }>();
    for (const creation of creations.results) {
      await deleteCreationObjects(env, creation.id);
    }
    await env.DB.prepare("DELETE FROM users WHERE id = ? AND status = 'deletion_pending'")
      .bind(user.id)
      .run();
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE reports SET details = '', resolution_note = NULL,
       free_text_purge_at = NULL, updated_at = ? WHERE free_text_purge_at <= ?`,
    ).bind(now, now),
    env.DB.prepare("DELETE FROM moderation_actions WHERE retain_until <= ?").bind(now),
    env.DB.prepare(
      "DELETE FROM reports WHERE status IN ('resolved', 'dismissed') AND retain_until <= ?",
    ).bind(now),
    env.DB.prepare(
      `UPDATE creation_stats SET
       like_count = (SELECT COUNT(*) FROM likes WHERE creation_id = creation_stats.creation_id),
       comment_count = (SELECT COUNT(*) FROM comments
         WHERE creation_id = creation_stats.creation_id AND status = 'active'),
       updated_at = ?`,
    ).bind(now),
    env.DB.prepare(
      `UPDATE creation_stats SET
       popularity_score = (like_count * 3.0) + (comment_count * 5.0) +
         CASE
           WHEN (SELECT published_at FROM creations WHERE id = creation_stats.creation_id) >= ? THEN 25
           WHEN (SELECT published_at FROM creations WHERE id = creation_stats.creation_id) >= ? THEN 10
           ELSE 0
         END,
       updated_at = ?`,
    ).bind(now - 24 * 60 * 60 * 1_000, now - 7 * 24 * 60 * 60 * 1_000, now),
  ]);

  console.log(JSON.stringify({
    cron: controller.cron,
    deletedAccounts: dueAccounts.results.length,
    deletedCreations: deletedCreations.results.length,
    message: "scheduled_maintenance_complete",
    obsoleteRevisions: obsolete.results.length,
    purgedShowcaseAttempts: purgedShowcaseAttempts.meta.changes ?? 0,
    showcaseDeletes: deletingShowcaseImages.results.length,
    showcaseFailedUploads: failedShowcaseUploads.results.length,
    showcaseStaleUploads: claimedStaleShowcaseUploads,
    staleUploads: staleUploads.results.length,
  }));
}

/**
 * Claim a stale upload before touching R2. The SELECT that built the cleanup
 * page is only a snapshot: a foreground request may promote the image before
 * this guarded UPDATE runs. In that case the zero-change result is authoritative
 * and the ready image and all of its objects must be left untouched.
 */
export async function cleanupExpiredShowcaseUpload(
  env: Env,
  image: { creation_id: string; id: string },
  now: number,
): Promise<boolean> {
  const claimed = await env.DB.prepare(
    `UPDATE creation_showcase_images SET status = 'failed',
     upload_token_hash = NULL, failure_code = 'upload_expired', updated_at = ?
     WHERE id = ? AND status IN ('reserved', 'processing') AND expires_at <= ?`,
  ).bind(now, image.id, now).run();
  if ((claimed.meta.changes ?? 0) !== 1) return false;
  await deleteShowcaseImageObjects(env, image.creation_id, image.id);
  return true;
}

async function deleteRevisionObjects(
  env: Env,
  creationId: string,
  revisionId: string,
): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT object_key FROM creation_objects WHERE revision_id = ?",
  ).bind(revisionId).all<{ object_key: string }>();
  const knownKeys = rows.results.map((row) => row.object_key);
  const deterministicKeys = [
    `private/creations/${creationId}/${revisionId}/project.json`,
    `private/creations/${creationId}/${revisionId}/preview.webp`,
    `private/creations/${creationId}/${revisionId}/thumb.webp`,
    `private/creations/${creationId}/${revisionId}/social.jpg`,
  ];
  await env.PROJECTS.delete(Array.from(new Set([...knownKeys, ...deterministicKeys])));
  await env.DB.prepare("DELETE FROM creation_objects WHERE revision_id = ?")
    .bind(revisionId)
    .run();
}

async function deleteCreationObjects(env: Env, creationId: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await env.PROJECTS.list({
      cursor,
      limit: 1_000,
      prefix: `private/creations/${creationId}/`,
    });
    if (page.objects.length) {
      await env.PROJECTS.delete(page.objects.map((object) => object.key));
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
