import { describe, expect, it } from "vitest";

import { compareStagingHead } from "./staging-deploy-preflight";

const LOCAL = "0e2da5ab571b58c4f407125b9f912b8febe50ece";
const REMOTE = "57beeafbdb9e177f9fc51e0ce212e2ff9e7f6bdb";
const WORKER = "1a90ac21-57a9-4903-a36c-8ed6b0d38269";

describe("compareStagingHead", () => {
  it("reports no deploy when local and remote commits match", () => {
    const result = compareStagingHead(LOCAL, {
      communityMutations: "enabled",
      environment: "staging",
      sourceCommit: LOCAL,
      workerVersion: WORKER,
    });

    expect(result.deployRequired).toBe(false);
    expect(result.message).toContain("matches local HEAD");
  });

  it("requires deploy when live staging is behind local HEAD", () => {
    const result = compareStagingHead(LOCAL, {
      communityMutations: "enabled",
      environment: "staging",
      sourceCommit: REMOTE,
      workerVersion: WORKER,
    });

    expect(result.deployRequired).toBe(true);
    expect(result.message).toContain("does not match local HEAD");
  });
});
