import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const CLIENT_DIRECTORY = path.resolve("dist/client");
const INITIAL_JAVASCRIPT_BUDGET = 200 * 1024;
const CHUNK_JAVASCRIPT_BUDGET = 250 * 1024;

async function main(): Promise<void> {
  const html = await readFile(
    path.join(CLIENT_DIRECTORY, "index.html"),
    "utf8",
  );
  const initialSources = [
    ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/giu),
  ].map((match) => match[1]);
  if (!initialSources.length) {
    throw new Error(
      "No initial JavaScript entry was found in dist/client/index.html.",
    );
  }

  const initialFiles = initialSources.map((source) =>
    path.join(CLIENT_DIRECTORY, source.replace(/^\/+/, "")),
  );
  const initialBytes = (await Promise.all(initialFiles.map(gzipBytes))).reduce(
    (total, bytes) => total + bytes,
    0,
  );
  if (initialBytes > INITIAL_JAVASCRIPT_BUDGET) {
    throw new Error(
      `Homepage JavaScript is ${formatKiB(initialBytes)} gzip; budget is ${formatKiB(INITIAL_JAVASCRIPT_BUDGET)}.`,
    );
  }

  const chunks = (
    await listJavaScript(path.join(CLIENT_DIRECTORY, "assets"))
  ).map(async (filePath) => ({
    filePath,
    gzipBytes: await gzipBytes(filePath),
  }));
  const measuredChunks = await Promise.all(chunks);
  const oversized = measuredChunks.filter(
    (chunk) => chunk.gzipBytes > CHUNK_JAVASCRIPT_BUDGET,
  );
  if (oversized.length) {
    throw new Error(
      `JavaScript chunk budget exceeded: ${oversized
        .map(
          (chunk) =>
            `${path.basename(chunk.filePath)} (${formatKiB(chunk.gzipBytes)})`,
        )
        .join(", ")}`,
    );
  }

  const largest = measuredChunks.sort(
    (left, right) => right.gzipBytes - left.gzipBytes,
  )[0];
  console.log(
    `Bundle budgets passed: initial ${formatKiB(initialBytes)} gzip; largest chunk ${largest ? `${path.basename(largest.filePath)} ${formatKiB(largest.gzipBytes)}` : "none"}.`,
  );
}

async function gzipBytes(filePath: string): Promise<number> {
  return gzipSync(await readFile(filePath), { level: 9 }).byteLength;
}

async function listJavaScript(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listJavaScript(entryPath);
      return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
    }),
  );
  return files.flat();
}

function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Bundle budget verification failed.",
  );
  process.exitCode = 1;
});
