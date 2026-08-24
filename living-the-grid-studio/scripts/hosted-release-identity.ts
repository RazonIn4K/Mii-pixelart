export const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/iu;
export const WORKER_VERSION_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type HostedCommunityMutations = "enabled" | "disabled";

export interface HostedReleaseIdentity {
  communityMutations: HostedCommunityMutations;
  environment: string;
  sourceCommit: string;
  workerVersion: string;
}

export class HostedReleaseIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedReleaseIdentityError";
  }
}

export function parseHostedReleaseIdentityHeaders(
  headers: Headers,
): HostedReleaseIdentity {
  const sourceCommit = headers.get("x-tomodachi-source-commit")?.toLowerCase();
  const workerVersion = headers.get("x-tomodachi-worker-version")?.toLowerCase();
  const environment = headers.get("x-tomodachi-environment") ?? "";
  const communityMutations = headers.get("x-tomodachi-community-mutations");

  if (!sourceCommit || !SOURCE_SHA_PATTERN.test(sourceCommit)) {
    throw new HostedReleaseIdentityError(
      "The response is missing a valid X-Tomodachi-Source-Commit header.",
    );
  }
  if (!workerVersion || !WORKER_VERSION_PATTERN.test(workerVersion)) {
    throw new HostedReleaseIdentityError(
      "The response is missing a valid X-Tomodachi-Worker-Version header.",
    );
  }
  if (!environment) {
    throw new HostedReleaseIdentityError(
      "The response is missing X-Tomodachi-Environment.",
    );
  }
  if (communityMutations !== "enabled" && communityMutations !== "disabled") {
    throw new HostedReleaseIdentityError(
      "The response is missing a valid X-Tomodachi-Community-Mutations header.",
    );
  }

  return {
    communityMutations,
    environment,
    sourceCommit,
    workerVersion,
  };
}

export async function fetchHostedReleaseIdentity(
  baseUrl: string,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<HostedReleaseIdentity> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const target = new URL(baseUrl);
  const response = await fetchImpl(new URL("/", target).toString(), {
    credentials: "omit",
    headers: { Accept: "text/html" },
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (response.status !== 200) {
    throw new HostedReleaseIdentityError(
      `The hosted release identity probe returned HTTP ${response.status}.`,
    );
  }

  return parseHostedReleaseIdentityHeaders(response.headers);
}
