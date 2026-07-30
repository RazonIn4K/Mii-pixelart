import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { assertNoForbiddenReleaseSecretArtifacts } from "./release-output-hygiene";

const releaseDirectory = path.resolve("dist");
const workerBundle = path.join(
  releaseDirectory,
  "tomodachi_studio",
  "index.js",
);
const execFileAsync = promisify(execFile);

await assertNoForbiddenReleaseSecretArtifacts(releaseDirectory);
const [{ stdout }, { stdout: statusOutput }] = await Promise.all([
  execFileAsync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: path.resolve("."),
  }),
  execFileAsync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: path.resolve("."),
  }),
]);
if (statusOutput.trim()) {
  throw new Error(
    "Release output verification requires a clean Git source tree.",
  );
}
const sourceCommit = stdout.trim().toLowerCase();
if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) {
  throw new Error("Release output source commit could not be verified.");
}

const workerCode = await readFile(workerBundle, "utf8");
if (
  !workerCode.includes(sourceCommit) ||
  !workerCode.includes("X-Tomodachi-Source-Commit") ||
  !workerCode.includes("X-Tomodachi-Worker-Version")
) {
  throw new Error(
    "Worker release output is not bound to the exact Git source commit.",
  );
}

const publicDirectory = path.join(releaseDirectory, "public");
for (const entry of await readdir(publicDirectory, { recursive: true })) {
  if (!/\.(?:css|html|js)$/u.test(entry)) continue;
  const content = await readFile(path.join(publicDirectory, entry), "utf8");
  if (content.includes(sourceCommit)) {
    throw new Error(
      "The internal release source commit leaked into the public static bundle.",
    );
  }
}

console.log(
  "Release output secret-filename and exact Worker source-identity audits passed.",
);
