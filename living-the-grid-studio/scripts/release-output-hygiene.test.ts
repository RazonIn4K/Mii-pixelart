import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertNoForbiddenReleaseSecretArtifacts,
  findForbiddenReleaseSecretArtifacts,
  isForbiddenReleaseSecretFilename,
} from "./release-output-hygiene";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tomodachi-release-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("release output secret hygiene", () => {
  it.each([
    ".dev.vars",
    ".dev.vars.production",
    ".dev.vars.example",
    ".env",
    ".env.local",
    ".env.example",
  ])("rejects %s", (filename) => {
    expect(isForbiddenReleaseSecretFilename(filename)).toBe(true);
  });

  it.each([".environment", "dev.vars", "environment.json", "index.js"])(
    "allows %s",
    (filename) => {
      expect(isForbiddenReleaseSecretFilename(filename)).toBe(false);
    },
  );

  it("finds nested secret artifacts without reading their contents", async () => {
    const root = await temporaryDirectory();
    await mkdir(path.join(root, "worker", "nested"), { recursive: true });
    await writeFile(path.join(root, "worker", ".dev.vars"), "not-read");
    await writeFile(
      path.join(root, "worker", "nested", ".env.local"),
      "not-read",
    );
    await writeFile(path.join(root, "worker", "index.js"), "safe");

    await expect(findForbiddenReleaseSecretArtifacts(root)).resolves.toEqual([
      path.join("worker", ".dev.vars"),
      path.join("worker", "nested", ".env.local"),
    ]);
    await expect(assertNoForbiddenReleaseSecretArtifacts(root)).rejects.toThrow(
      "forbidden local-secret artifacts",
    );
  });

  it("accepts a missing or clean release directory", async () => {
    const root = await temporaryDirectory();
    await writeFile(path.join(root, "index.js"), "safe");

    await expect(
      assertNoForbiddenReleaseSecretArtifacts(root),
    ).resolves.toBeUndefined();
    await expect(
      assertNoForbiddenReleaseSecretArtifacts(path.join(root, "missing")),
    ).resolves.toBeUndefined();
  });
});
