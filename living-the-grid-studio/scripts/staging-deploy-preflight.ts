import type { HostedReleaseIdentity } from "./hosted-release-identity";
import { SOURCE_SHA_PATTERN } from "./hosted-release-identity";

export interface StagingHeadComparison {
  deployRequired: boolean;
  localCommit: string;
  message: string;
  remoteCommit: string;
}

export function compareStagingHead(
  localCommit: string,
  remote: HostedReleaseIdentity,
): StagingHeadComparison {
  const normalizedLocal = localCommit.trim().toLowerCase();
  const normalizedRemote = remote.sourceCommit.toLowerCase();

  if (!SOURCE_SHA_PATTERN.test(normalizedLocal)) {
    return {
      deployRequired: true,
      localCommit: normalizedLocal,
      message: "Local HEAD is not a full 40-character Git commit.",
      remoteCommit: normalizedRemote,
    };
  }

  if (normalizedLocal === normalizedRemote) {
    return {
      deployRequired: false,
      localCommit: normalizedLocal,
      message: "Live staging matches local HEAD.",
      remoteCommit: normalizedRemote,
    };
  }

  return {
    deployRequired: true,
    localCommit: normalizedLocal,
    message:
      "Live staging does not match local HEAD. A separately approved staging deploy is required before writable acceptance.",
    remoteCommit: normalizedRemote,
  };
}
