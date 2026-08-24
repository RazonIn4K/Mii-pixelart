import { describe, expect, it } from "vitest";

import {
  HostedReleaseIdentityError,
  parseHostedReleaseIdentityHeaders,
} from "./hosted-release-identity";

const SOURCE = "57beeafbdb9e177f9fc51e0ce212e2ff9e7f6bdb";
const WORKER = "1a90ac21-57a9-4903-a36c-8ed6b0d38269";

describe("parseHostedReleaseIdentityHeaders", () => {
  it("parses the public release identity headers", () => {
    const headers = new Headers({
      "X-Tomodachi-Community-Mutations": "enabled",
      "X-Tomodachi-Environment": "staging",
      "X-Tomodachi-Source-Commit": SOURCE,
      "X-Tomodachi-Worker-Version": WORKER,
    });

    expect(parseHostedReleaseIdentityHeaders(headers)).toEqual({
      communityMutations: "enabled",
      environment: "staging",
      sourceCommit: SOURCE,
      workerVersion: WORKER,
    });
  });

  it("rejects missing or invalid headers", () => {
    const headers = new Headers({
      "X-Tomodachi-Environment": "staging",
      "X-Tomodachi-Source-Commit": SOURCE,
      "X-Tomodachi-Worker-Version": WORKER,
    });

    expect(() => parseHostedReleaseIdentityHeaders(headers)).toThrow(
      HostedReleaseIdentityError,
    );
  });
});
