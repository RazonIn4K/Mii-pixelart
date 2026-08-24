import {
  fetchHostedReleaseIdentity,
  HostedReleaseIdentityError,
} from "./hosted-release-identity";

const DEFAULT_BASE_URL = "https://staging.tomodachi.pw";

function readBaseUrl(args: readonly string[]): string {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--base-url") {
      const value = args[index + 1];
      if (!value) {
        throw new HostedReleaseIdentityError(
          "Usage: pnpm print:hosted-release-identity -- --base-url https://staging.tomodachi.pw",
        );
      }
      return value;
    }
    if (arg.startsWith("--base-url=")) {
      return arg.slice("--base-url=".length);
    }
  }
  return DEFAULT_BASE_URL;
}

async function main(): Promise<void> {
  const baseUrl = readBaseUrl(process.argv.slice(2));
  const identity = await fetchHostedReleaseIdentity(baseUrl);
  console.log(
    JSON.stringify(
      {
        approvalFields: {
          sourceCommit: identity.sourceCommit,
          workerVersion: identity.workerVersion,
        },
        communityMutations: identity.communityMutations,
        environment: identity.environment,
        sourceCommit: identity.sourceCommit,
        target: new URL(baseUrl).origin,
        workerVersion: identity.workerVersion,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Hosted release identity failed.";
  console.error(message);
  process.exit(1);
});
