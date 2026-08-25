import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchHostedReleaseIdentity,
  HostedReleaseIdentityError,
} from "./hosted-release-identity";
import { compareStagingHead } from "./staging-deploy-preflight";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_STAGING_URL = "https://staging.tomodachi.pw";

const QUICK_STEPS = [
  ["pnpm", ["check"]],
  ["pnpm", ["test:preflight"]],
  ["pnpm", ["worker:dry-run:staging"]],
  ["pnpm", ["verify:release-output"]],
] as const;

const FULL_STEPS = [
  ["pnpm", ["verify"]],
  ["pnpm", ["test:worker"]],
  ["pnpm", ["build"]],
  ["pnpm", ["verify:bundle"]],
] as const;

function readArgs(args: readonly string[]): {
  baseUrl: string;
  full: boolean;
} {
  let baseUrl = DEFAULT_STAGING_URL;
  let full = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--full") {
      full = true;
      continue;
    }
    if (arg === "--base-url") {
      const value = args[index + 1];
      if (!value) {
        throw new Error(
          "Usage: pnpm verify:staging-deploy-preflight -- --base-url https://staging.tomodachi.pw [--full]",
        );
      }
      baseUrl = value;
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      baseUrl = arg.slice("--base-url=".length);
    }
  }
  return { baseUrl, full };
}

function runStep(command: string, args: readonly string[]): void {
  console.log(`[staging-deploy-preflight] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: APP_ROOT,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readLocalCommit(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: APP_ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout?.trim()) {
    throw new Error("Unable to read the current Git commit.");
  }
  return result.stdout.trim();
}

async function main(): Promise<void> {
  const { baseUrl, full } = readArgs(process.argv.slice(2));
  const steps = full ? [...FULL_STEPS, ...QUICK_STEPS] : QUICK_STEPS;

  for (const [command, args] of steps) {
    runStep(command, args);
  }

  const localCommit = readLocalCommit();
  const identity = await fetchHostedReleaseIdentity(baseUrl);
  const comparison = compareStagingHead(localCommit, identity);

  console.log(
    JSON.stringify(
      {
        comparison: comparison.message,
        deployRequired: comparison.deployRequired,
        live: {
          communityMutations: identity.communityMutations,
          environment: identity.environment,
          sourceCommit: identity.sourceCommit,
          workerVersion: identity.workerVersion,
        },
        localCommit: comparison.localCommit,
        mode: full ? "full" : "quick",
        readinessTemplate: "config/staging-standard-deploy.example.json",
        writableApprovalTemplate: "config/staging-writable.example.json",
      },
      null,
      2,
    ),
  );

  if (comparison.deployRequired) {
    console.warn(
      "[staging-deploy-preflight] Staging head drift detected. Deploy before writable acceptance.",
    );
    process.exit(2);
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof HostedReleaseIdentityError || error instanceof Error
      ? error.message
      : "Staging deploy preflight failed.";
  console.error(message);
  process.exit(1);
});
