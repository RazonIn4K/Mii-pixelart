import { readdir } from "node:fs/promises";
import path from "node:path";

export function isForbiddenReleaseSecretFilename(filename: string): boolean {
  return (
    filename === ".dev.vars" ||
    filename.startsWith(".dev.vars.") ||
    filename === ".env" ||
    filename.startsWith(".env.")
  );
}

export async function findForbiddenReleaseSecretArtifacts(
  rootDirectory: string,
): Promise<string[]> {
  const matches: string[] = [];

  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (isForbiddenReleaseSecretFilename(entry.name)) {
        matches.push(path.relative(rootDirectory, absolutePath));
        continue;
      }
      if (entry.isDirectory()) await visit(absolutePath);
    }
  }

  await visit(rootDirectory);
  return matches.sort();
}

export async function assertNoForbiddenReleaseSecretArtifacts(
  rootDirectory: string,
): Promise<void> {
  const matches = await findForbiddenReleaseSecretArtifacts(rootDirectory);
  if (matches.length === 0) return;

  throw new Error(
    `Release output contains forbidden local-secret artifacts: ${matches.join(", ")}`,
  );
}
