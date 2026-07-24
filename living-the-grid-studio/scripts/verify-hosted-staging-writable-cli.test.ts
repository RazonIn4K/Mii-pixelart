import { describe, expect, it, vi } from "vitest";

import type { HostedStagingWritableResult } from "./verify-hosted-staging-writable";
import {
  FIXED_STAGING_WRITABLE_LIMITS,
  consumeStagingWritableApproval,
  createWranglerManifestCapture,
  loadStagingWritableApproval,
  parseStagingWritableApproval,
  runIntegratedHostedStagingWritable,
  type IntegratedWritableCliDependencies,
  type StagingWritableApproval,
} from "./verify-hosted-staging-writable-cli";

const NOW = Date.parse("2026-07-17T00:00:00.000Z");
const SOURCE = "a".repeat(40);
const OWNER = "11111111-1111-4111-8111-111111111111";
const SECOND = "22222222-2222-4222-8222-222222222222";
const WORKER = "33333333-3333-4333-8333-333333333333";
const CREATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REVISION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJECT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OBJECT_SHA256 = "e".repeat(64);
const RUN_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PROJECT_KEY = `private/creations/${CREATION}/${REVISION}/project.json`;

function approvalValue(): StagingWritableApproval {
  return {
    confirmations: {
      approvedTwoUserStagingMutationRun: true,
      noFallbackCleanup: true,
      noProductionDnsSecretsMigrationsOrRoles: true,
      normalApiCleanupOnly: true,
    },
    environment: "staging",
    expiresAt: "2026-07-17T00:20:00.000Z",
    issuedAt: "2026-07-16T23:55:00.000Z",
    limits: FIXED_STAGING_WRITABLE_LIMITS,
    ownerUserId: OWNER,
    runId: RUN_ID,
    schemaVersion: 1,
    secondUserId: SECOND,
    sourceCommit: SOURCE,
    target: "https://staging.tomodachi.pw",
    workerVersion: WORKER,
  };
}

function emptyManifest() {
  return {
    fixtureActiveCreationRows: 0,
    fixtureDeletedCreationRows: 0,
    fixtureObjectBytes: 0,
    fixtureObjectRows: 0,
    fixtureR2ObjectBytes: 0,
    fixtureR2ObjectCount: 0,
    fixtureRevisionRows: 0,
    totalCreationRows: 1,
    totalObjectBytes: 0,
    totalObjectRows: 0,
    totalR2ObjectCount: 0,
    totalRevisionRows: 0,
  };
}

function acceptanceResult(): HostedStagingWritableResult {
  const manifest = emptyManifest();
  return {
    assertions: 14,
    cleanup: "verified",
    deployment: {
      communityMutations: "enabled",
      sourceCommit: SOURCE,
      workerVersion: WORKER,
    },
    manifests: { after: manifest, before: manifest },
    mutationAttempts: 4,
    requests: 7,
    target: "https://staging.tomodachi.pw",
  };
}

function d1ManifestWithProjectObject(
  overrides: { byteSize?: number; key?: string } = {},
) {
  const byteSize = overrides.byteSize ?? 123;
  return [
    {
      success: true,
      results: [
        {
          row_type: "summary",
          total_creation_rows: 8,
          total_revision_rows: 3,
          total_object_rows: 2,
          total_object_bytes: byteSize,
        },
        {
          row_type: "creation",
          entity_id: CREATION,
          owner_user_id: OWNER,
          state: "deleted",
        },
        {
          row_type: "revision",
          entity_id: REVISION,
          creation_id: CREATION,
          status: "ready",
        },
        {
          row_type: "object",
          entity_id: OBJECT,
          creation_id: CREATION,
          revision_id: REVISION,
          kind: "project_json",
          object_key: overrides.key ?? PROJECT_KEY,
          object_sha256: OBJECT_SHA256,
          byte_size: byteSize,
          status: "ready",
        },
      ],
    },
  ];
}

describe("staging writable approval", () => {
  it("accepts one fresh exact-bound approval", () => {
    expect(parseStagingWritableApproval(approvalValue(), NOW)).toMatchObject({
      ownerUserId: OWNER,
      runId: RUN_ID,
      secondUserId: SECOND,
      sourceCommit: SOURCE,
      workerVersion: WORKER,
    });
  });

  it("rejects drifted ceilings, reused identities, and stale approvals", () => {
    const drifted = approvalValue() as unknown as Record<string, unknown>;
    drifted.limits = {
      ...FIXED_STAGING_WRITABLE_LIMITS,
      maxRequests: FIXED_STAGING_WRITABLE_LIMITS.maxRequests + 1,
    };
    expect(() => parseStagingWritableApproval(drifted, NOW)).toThrow(
      /fixed request and storage ceilings/u,
    );

    expect(() =>
      parseStagingWritableApproval(
        { ...approvalValue(), secondUserId: OWNER },
        NOW,
      ),
    ).toThrow(/two distinct internal users/u);

    expect(() =>
      parseStagingWritableApproval(
        {
          ...approvalValue(),
          expiresAt: "2026-07-16T23:55:00.000Z",
          issuedAt: "2026-07-16T23:30:00.000Z",
        },
        NOW,
      ),
    ).toThrow(/stale, premature, expired/u);
  });

  it("requires an ignored regular approval with mode 0600", async () => {
    const readSecureFile = vi.fn(async () => ({
      mode: 0o100600,
      text: JSON.stringify(approvalValue()),
    }));
    const loaded = await loadStagingWritableApproval(undefined, {
      isIgnored: async () => true,
      now: () => NOW,
      readSecureFile,
    });
    expect(loaded.sourceCommit).toBe(SOURCE);
    expect(readSecureFile).toHaveBeenCalledOnce();

    await expect(
      loadStagingWritableApproval(undefined, {
        isIgnored: async () => true,
        now: () => NOW,
        readSecureFile: async () => ({
          mode: 0o100644,
          text: JSON.stringify(approvalValue()),
        }),
      }),
    ).rejects.toThrow(/mode 0600/u);
    await expect(
      loadStagingWritableApproval(undefined, {
        isIgnored: async () => false,
        now: () => NOW,
        readSecureFile,
      }),
    ).rejects.toThrow(/Git ignore/u);
  });

  it("atomically consumes one unchanged run approval before mutation", async () => {
    const createExclusiveMarker = vi.fn(async () => undefined);
    const removeApproval = vi.fn(async () => undefined);
    await consumeStagingWritableApproval(approvalValue(), {
      createExclusiveMarker,
      loadCurrent: async () => approvalValue(),
      now: () => NOW,
      removeApproval,
    });
    expect(createExclusiveMarker).toHaveBeenCalledOnce();
    expect(createExclusiveMarker.mock.calls[0]?.[0]).toContain(RUN_ID);
    expect(createExclusiveMarker.mock.calls[0]?.[2]).toBe(0o600);
    expect(removeApproval).toHaveBeenCalledOnce();

    await expect(
      consumeStagingWritableApproval(approvalValue(), {
        createExclusiveMarker: async () => {
          throw new Error("already exists");
        },
        loadCurrent: async () => approvalValue(),
        now: () => NOW,
        removeApproval,
      }),
    ).rejects.toThrow("already consumed");
    expect(removeApproval).toHaveBeenCalledOnce();
  });
});

describe("Wrangler-backed manifest capture", () => {
  it("uses only read-only D1/R2 commands and streams exact object bytes", async () => {
    const commands: string[][] = [];
    const streamed: Array<{ args: string[]; ceiling: number }> = [];
    const capture = createWranglerManifestCapture(approvalValue(), {
      listR2Prefix: async (creationId) => {
        expect(creationId).toBe(CREATION);
        return [{ key: PROJECT_KEY, size: 123 }];
      },
      runJson: async (args) => {
        commands.push([...args]);
        if (args.includes("d1")) {
          return d1ManifestWithProjectObject();
        }
        return {
          name: "tomodachi-studio-projects-staging",
          object_count: "1,234",
        };
      },
      streamObjectBytes: async (args, ceiling) => {
        streamed.push({ args: [...args], ceiling });
        return { bytes: 123, sha256: OBJECT_SHA256 };
      },
    });

    const manifest = await capture({
      phase: "after",
      trackedCreationIds: [CREATION],
    });
    expect(manifest).toMatchObject({
      fixtureDeletedCreationRows: 1,
      fixtureObjectBytes: 123,
      fixtureR2ObjectBytes: 123,
      totalR2ObjectCount: 1234,
    });
    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual(
      expect.arrayContaining(["d1", "execute", "--remote", "--json"]),
    );
    expect(commands[1]).toEqual(
      expect.arrayContaining(["r2", "bucket", "info", "--json"]),
    );
    expect(streamed).toHaveLength(1);
    expect(streamed[0]?.args).toEqual(
      expect.arrayContaining(["r2", "object", "get", "--remote", "--pipe"]),
    );
    expect(streamed[0]?.ceiling).toBe(124);
    const unsafeCommands = new Set([
      "delete",
      "deploy",
      "migrations",
      "put",
      "secret",
    ]);
    expect(
      [...commands, ...streamed.map((entry) => entry.args)]
        .flat()
        .some((argument) => unsafeCommands.has(argument)),
    ).toBe(false);
  });

  it("rejects a non-canonical key before object retrieval", async () => {
    const streamObjectBytes = vi.fn(async () => ({
      bytes: 1,
      sha256: OBJECT_SHA256,
    }));
    const capture = createWranglerManifestCapture(approvalValue(), {
      runJson: async (args) =>
        args.includes("d1")
          ? [
              {
                success: true,
                results: [
                  {
                    row_type: "summary",
                    total_creation_rows: 1,
                    total_revision_rows: 1,
                    total_object_rows: 1,
                    total_object_bytes: 1,
                  },
                  {
                    row_type: "creation",
                    entity_id: CREATION,
                    owner_user_id: OWNER,
                    state: "deleted",
                  },
                  {
                    row_type: "revision",
                    entity_id: REVISION,
                    creation_id: CREATION,
                    status: "ready",
                  },
                  {
                    row_type: "object",
                    entity_id: OBJECT,
                    creation_id: CREATION,
                    revision_id: REVISION,
                    kind: "project_json",
                    object_key:
                      "private/creations/not-the-fixture/project.json",
                    object_sha256: OBJECT_SHA256,
                    byte_size: 1,
                    status: "ready",
                  },
                ],
              },
            ]
          : {
              name: "tomodachi-studio-projects-staging",
              object_count: "1",
            },
      streamObjectBytes,
    });
    await expect(
      capture({ phase: "after", trackedCreationIds: [CREATION] }),
    ).rejects.toThrow(/immutable fixture prefix/u);
    expect(streamObjectBytes).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "an orphaned R2 object",
      list: [
        { key: PROJECT_KEY, size: 123 },
        {
          key: `private/creations/${CREATION}/${REVISION}/thumb.webp`,
          size: 99,
        },
      ],
    },
    { label: "a missing R2 object", list: [] },
    {
      label: "a per-key size mismatch",
      list: [{ key: PROJECT_KEY, size: 122 }],
    },
    {
      label: "a different same-sized R2 key",
      list: [
        {
          key: `private/creations/${CREATION}/${REVISION}/thumb.webp`,
          size: 123,
        },
      ],
    },
  ])("rejects $label before any object stream", async ({ list }) => {
    const streamObjectBytes = vi.fn(async () => ({
      bytes: 123,
      sha256: OBJECT_SHA256,
    }));
    const capture = createWranglerManifestCapture(approvalValue(), {
      listR2Prefix: async () => list,
      runJson: async (args) =>
        args.includes("d1")
          ? d1ManifestWithProjectObject()
          : {
              name: "tomodachi-studio-projects-staging",
              object_count: "10",
            },
      streamObjectBytes,
    });

    await expect(
      capture({ phase: "after", trackedCreationIds: [CREATION] }),
    ).rejects.toThrow(/exact R2 fixture prefix does not match/u);
    expect(streamObjectBytes).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "a duplicate key",
      list: [
        { key: PROJECT_KEY, size: 123 },
        { key: PROJECT_KEY, size: 123 },
      ],
    },
    {
      label: "a key outside the fixture prefix",
      list: [{ key: `private/creations/${SECOND}/object`, size: 123 }],
    },
    {
      label: "unexpected object metadata",
      list: [{ key: PROJECT_KEY, size: 123, etag: "not-allowed" }],
    },
  ])("rejects $label from the independent listing", async ({ list }) => {
    const streamObjectBytes = vi.fn(async () => ({
      bytes: 123,
      sha256: OBJECT_SHA256,
    }));
    const capture = createWranglerManifestCapture(approvalValue(), {
      listR2Prefix: async () => list,
      runJson: async (args) =>
        args.includes("d1")
          ? d1ManifestWithProjectObject()
          : {
              name: "tomodachi-studio-projects-staging",
              object_count: "10",
            },
      streamObjectBytes,
    });

    await expect(
      capture({ phase: "after", trackedCreationIds: [CREATION] }),
    ).rejects.toThrow(/invalid object metadata/u);
    expect(streamObjectBytes).not.toHaveBeenCalled();
  });

  it("rejects same-sized R2 content whose digest differs from D1", async () => {
    const capture = createWranglerManifestCapture(approvalValue(), {
      listR2Prefix: async () => [{ key: PROJECT_KEY, size: 123 }],
      runJson: async (args) =>
        args.includes("d1")
          ? d1ManifestWithProjectObject()
          : {
              name: "tomodachi-studio-projects-staging",
              object_count: "10",
            },
      streamObjectBytes: async () => ({
        bytes: 123,
        sha256: "f".repeat(64),
      }),
    });

    await expect(
      capture({ phase: "after", trackedCreationIds: [CREATION] }),
    ).rejects.toThrow(/byte and hash manifest/u);
  });
});

describe("integrated hosted staging writable runner", () => {
  it("binds both in-memory identities and passes only the owner adapter to P2", async () => {
    const ownerRequest = vi.fn(async () => new Response());
    const consumeApproval = vi.fn(async () => undefined);
    const runAcceptance = vi.fn(async (options) => {
      expect(options.fetchImpl).toBe(ownerRequest);
      expect(options.expectedUserId).toBe(OWNER);
      expect(await options.verifyDeployment()).toMatchObject({
        environment: "staging",
        sourceCommit: SOURCE,
        workerVersion: WORKER,
      });
      return acceptanceResult();
    });
    const withSessions: IntegratedWritableCliDependencies["withSessions"] =
      async (options, callback) => {
        expect(options).toMatchObject({
          baseUrl: "https://staging.tomodachi.pw",
          expectedCommunityMutations: true,
          expectedConsultSales: false,
          expectedSourceSha: SOURCE,
          expectedWorkerVersion: WORKER,
        });
        const callbackResult = await callback(
          [
            {
              internalUserId: OWNER,
              request: ownerRequest,
              role: "admin",
              slot: "owner",
            },
            {
              internalUserId: SECOND,
              request: async () => new Response(),
              role: "user",
              slot: "second-user",
            },
          ],
          {
            communityMutationsEnabled: true,
            consultSalesEnabled: false,
            environment: "staging",
            origin: "https://staging.tomodachi.pw",
            sourceCommit: SOURCE,
            workerVersion: WORKER,
          },
        );
        return {
          callbackResult,
          identities: 2,
          sessionsRevoked: 2,
          sourceSha: SOURCE,
          target: "https://staging.tomodachi.pw",
          workerVersion: WORKER,
        };
      };
    const result = await runIntegratedHostedStagingWritable({
      consumeApproval,
      createManifestCapture: () => async () => emptyManifest(),
      loadApproval: async () => approvalValue(),
      now: () => NOW,
      runAcceptance,
      withSessions,
    });
    expect(result).toMatchObject({
      assertions: 14,
      cleanup: "verified",
      identities: 2,
      sessionsRevoked: 2,
    });
    expect(runAcceptance).toHaveBeenCalledOnce();
    expect(consumeApproval).toHaveBeenCalledOnce();
    expect(consumeApproval.mock.invocationCallOrder[0]).toBeLessThan(
      runAcceptance.mock.invocationCallOrder[0]!,
    );
  });

  it("stops before P2 when either browser identity differs from approval", async () => {
    const runAcceptance = vi.fn(async () => acceptanceResult());
    await expect(
      runIntegratedHostedStagingWritable({
        consumeApproval: async () => undefined,
        createManifestCapture: () => async () => emptyManifest(),
        loadApproval: async () => approvalValue(),
        now: () => NOW,
        runAcceptance,
        withSessions: async (_options, callback) => {
          const callbackResult = await callback(
            [
              {
                internalUserId: OWNER,
                request: async () => new Response(),
                role: "admin",
                slot: "owner",
              },
              {
                internalUserId: "44444444-4444-4444-8444-444444444444",
                request: async () => new Response(),
                role: "user",
                slot: "second-user",
              },
            ],
            {
              communityMutationsEnabled: true,
              consultSalesEnabled: false,
              environment: "staging",
              origin: "https://staging.tomodachi.pw",
              sourceCommit: SOURCE,
              workerVersion: WORKER,
            },
          );
          return {
            callbackResult,
            identities: 2,
            sessionsRevoked: 2,
            sourceSha: SOURCE,
            target: "https://staging.tomodachi.pw",
            workerVersion: WORKER,
          };
        },
      }),
    ).rejects.toThrow(/two approved internal users/u);
    expect(runAcceptance).not.toHaveBeenCalled();
  });

  it("does not consume approval or start acceptance when aborted before the session callback", async () => {
    const controller = new AbortController();
    const interruption = new Error("synthetic pre-consume termination");
    const consumeApproval = vi.fn(async () => undefined);
    const runAcceptance = vi.fn(async () => acceptanceResult());
    const withSessions: IntegratedWritableCliDependencies["withSessions"] =
      async (options, callback) => {
        expect(options.abortSignal).toBe(controller.signal);
        controller.abort(interruption);
        await callback(
          [
            {
              internalUserId: OWNER,
              request: async () => new Response(),
              role: "admin",
              slot: "owner",
            },
            {
              internalUserId: SECOND,
              request: async () => new Response(),
              role: "user",
              slot: "second-user",
            },
          ],
          {
            communityMutationsEnabled: true,
            consultSalesEnabled: false,
            environment: "staging",
            origin: "https://staging.tomodachi.pw",
            sourceCommit: SOURCE,
            workerVersion: WORKER,
          },
        );
        throw new Error("callback should have rejected");
      };

    await expect(
      runIntegratedHostedStagingWritable(
        {
          consumeApproval,
          createManifestCapture: () => async () => emptyManifest(),
          loadApproval: async () => approvalValue(),
          now: () => NOW,
          runAcceptance,
          withSessions,
        },
        controller.signal,
      ),
    ).rejects.toBe(interruption);
    expect(consumeApproval).not.toHaveBeenCalled();
    expect(runAcceptance).not.toHaveBeenCalled();
  });

  it("does not start acceptance when aborted immediately after approval consumption", async () => {
    const controller = new AbortController();
    const interruption = new Error("synthetic post-consume termination");
    const consumeApproval = vi.fn(async () => {
      controller.abort(interruption);
    });
    const runAcceptance = vi.fn(async () => acceptanceResult());
    const withSessions: IntegratedWritableCliDependencies["withSessions"] =
      async (_options, callback) => {
        const callbackResult = await callback(
          [
            {
              internalUserId: OWNER,
              request: async () => new Response(),
              role: "admin",
              slot: "owner",
            },
            {
              internalUserId: SECOND,
              request: async () => new Response(),
              role: "user",
              slot: "second-user",
            },
          ],
          {
            communityMutationsEnabled: true,
            consultSalesEnabled: false,
            environment: "staging",
            origin: "https://staging.tomodachi.pw",
            sourceCommit: SOURCE,
            workerVersion: WORKER,
          },
        );
        return {
          callbackResult,
          identities: 2,
          sessionsRevoked: 2,
          sourceSha: SOURCE,
          target: "https://staging.tomodachi.pw",
          workerVersion: WORKER,
        };
      };

    await expect(
      runIntegratedHostedStagingWritable(
        {
          consumeApproval,
          createManifestCapture: () => async () => emptyManifest(),
          loadApproval: async () => approvalValue(),
          now: () => NOW,
          runAcceptance,
          withSessions,
        },
        controller.signal,
      ),
    ).rejects.toBe(interruption);
    expect(consumeApproval).toHaveBeenCalledOnce();
    expect(runAcceptance).not.toHaveBeenCalled();
  });
});
