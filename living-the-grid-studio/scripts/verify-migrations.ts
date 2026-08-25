import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_D1_NAME = "tomodachi-studio-local";
const MIGRATION_PATTERN = /^(\d{4})_[a-z0-9_]+[.]sql$/u;
const REQUIRED_TABLES = [
  "ai_image_requests",
  "comments",
  "creation_objects",
  "creation_revisions",
  "creation_search",
  "creation_showcase_images",
  "creation_showcase_objects",
  "creation_showcase_upload_attempts",
  "creation_stats",
  "creation_tags",
  "creations",
  "external_identities",
  "follows",
  "likes",
  "moderation_actions",
  "profile_image_objects",
  "profile_image_report_evidence",
  "profile_image_upload_attempts",
  "profile_images",
  "quota_reservations",
  "reports",
  "sessions",
  "tags",
  "users",
] as const;
const REQUIRED_INDEXES = [
  "ai_image_requests_global_budget_idx",
  "ai_image_requests_stale_pending_idx",
  "ai_image_requests_user_daily_idx",
  "profile_image_objects_cleanup_idx",
  "profile_image_objects_user_idx",
  "profile_image_report_evidence_image_idx",
  "profile_image_report_evidence_user_idx",
  "profile_image_upload_attempts_user_time_idx",
  "profile_images_expiry_idx",
  "profile_images_one_ready_per_user_idx",
  "profile_images_replaces_idx",
  "profile_images_user_status_idx",
  "users_avatar_image_id_idx",
  "users_deleted_cleanup_idx",
] as const;

function supportsFts5(): boolean {
  const probe = new DatabaseSync(":memory:");
  try {
    probe.exec("CREATE VIRTUAL TABLE fts5_probe USING fts5(content);");
    return true;
  } catch {
    return false;
  } finally {
    probe.close();
  }
}

function validateMigratedDatabase(
  database: DatabaseSync,
  migrationCount: number,
): void {
  const foreignKeysEnabled = database
    .prepare("PRAGMA foreign_keys")
    .get() as Record<string, unknown>;
  if (foreignKeysEnabled.foreign_keys !== 1)
    throw new Error("SQLite foreign keys are not enabled.");

  const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyFailures.length > 0) {
    throw new Error(
      `Foreign-key validation failed: ${JSON.stringify(foreignKeyFailures)}`,
    );
  }

  const integrityRows = database
    .prepare("PRAGMA integrity_check")
    .all() as Record<string, unknown>[];
  if (integrityRows.length !== 1 || integrityRows[0].integrity_check !== "ok") {
    throw new Error(
      `SQLite integrity check failed: ${JSON.stringify(integrityRows)}`,
    );
  }

  const tableRows = database
    .prepare("SELECT name FROM sqlite_schema WHERE type IN ('table', 'view')")
    .all() as { name: string }[];
  const tableNames = new Set(tableRows.map(({ name }) => name));
  const missingTables = REQUIRED_TABLES.filter(
    (table) => !tableNames.has(table),
  );
  if (missingTables.length > 0) {
    throw new Error(
      `Required migrated tables are missing: ${missingTables.join(", ")}`,
    );
  }

  const indexRows = database
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'index'")
    .all() as { name: string }[];
  const indexNames = new Set(indexRows.map(({ name }) => name));
  const missingIndexes = REQUIRED_INDEXES.filter(
    (index) => !indexNames.has(index),
  );
  if (missingIndexes.length > 0) {
    throw new Error(
      `Required migrated indexes are missing: ${missingIndexes.join(", ")}`,
    );
  }

  const facePaintTag = database
    .prepare("SELECT slug, name, description FROM tags WHERE id = ?")
    .get("tag-face-masks") as
    | { slug: string; name: string; description: string }
    | undefined;
  if (
    facePaintTag?.slug !== "face-masks" ||
    facePaintTag.name !== "Face Paint" ||
    facePaintTag.description !==
      "Manual pixel references for Living the Dream Face Paint designs."
  ) {
    throw new Error(
      `Face Paint taxonomy migration is invalid: ${JSON.stringify(facePaintTag)}`,
    );
  }

  console.log(
    `Applied ${migrationCount} migrations; foreign-key and integrity checks passed for ${REQUIRED_TABLES.length} required tables and ${REQUIRED_INDEXES.length} required indexes.`,
  );
}

async function applyMigrationsInMemory(
  migrationFiles: readonly string[],
): Promise<void> {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    for (const file of migrationFiles) {
      try {
        database.exec(
          await readFile(path.join(ROOT, "migrations", file), "utf8"),
        );
      } catch (error) {
        throw new Error(
          `Failed to apply ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    validateMigratedDatabase(database, migrationFiles.length);
  } finally {
    database.close();
  }
}

async function resolveIsolatedWranglerDatabasePath(
  persistRoot: string,
): Promise<string> {
  const localDatabaseDirectory = path.join(
    persistRoot,
    "v3/d1/miniflare-D1DatabaseObject",
  );
  const databaseFiles = (await readdir(localDatabaseDirectory)).filter(
    (file) => file.endsWith(".sqlite") && file !== "metadata.sqlite",
  );
  if (databaseFiles.length !== 1) {
    throw new Error(
      `Expected exactly one isolated Wrangler D1 database file, found ${databaseFiles.length}.`,
    );
  }
  return path.join(localDatabaseDirectory, databaseFiles[0]!);
}

async function validateIsolatedWranglerDatabase(
  migrationCount: number,
): Promise<void> {
  const persistRoot = await mkdtemp(path.join(tmpdir(), "tomodachi-migrations-"));
  try {
    const migrationResult = spawnSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "migrations",
        "apply",
        LOCAL_D1_NAME,
        "--local",
        "--persist-to",
        persistRoot,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    if (migrationResult.status !== 0) {
      throw new Error(
        `Failed to apply isolated local D1 migrations through Wrangler: ${migrationResult.stderr || migrationResult.stdout}`,
      );
    }

    const databasePath = await resolveIsolatedWranglerDatabasePath(persistRoot);
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      database.exec("PRAGMA foreign_keys = ON;");
      validateMigratedDatabase(database, migrationCount);
    } finally {
      database.close();
    }
  } finally {
    await rm(persistRoot, { force: true, recursive: true });
  }
}

const migrationsDirectory = path.join(ROOT, "migrations");
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => MIGRATION_PATTERN.test(file))
  .sort((left, right) => left.localeCompare(right));

if (migrationFiles.length === 0)
  throw new Error("No forward-only D1 migrations were found.");
for (const [index, file] of migrationFiles.entries()) {
  const match = MIGRATION_PATTERN.exec(file);
  const expectedNumber = index + 1;
  if (!match || Number(match[1]) !== expectedNumber) {
    throw new Error(
      `D1 migrations must be contiguous from 0001; expected ${String(expectedNumber).padStart(4, "0")}, found ${file}.`,
    );
  }
}

if (supportsFts5()) {
  await applyMigrationsInMemory(migrationFiles);
} else {
  console.warn(
    "node:sqlite lacks FTS5; validating migrations through an isolated Wrangler local D1 database instead.",
  );
  await validateIsolatedWranglerDatabase(migrationFiles.length);
}
