import { describe, expect, it, vi } from "vitest";

import {
  FIXED_P4_PHASE_A_CONFIRMATIONS,
  FIXED_P4_PHASE_A_OPERATIONS,
  consumeP4PhaseAApproval,
  loadP4PhaseAApproval,
  parseP4PhaseAApproval,
  type P4PhaseAApproval,
} from "./verify-hosted-staging-p4-phase-a-approval";
import {
  FIXED_P4_PHASE_A_LIMITS,
  HostedStagingP4PhaseAError,
  assertP4PhaseARequestAllowed,
  runHostedStagingP4PhaseA,
  type HostedStagingP4PhaseAResult,
  type P4PhaseARequestPolicyState,
} from "./verify-hosted-staging-p4-phase-a";
import {
  createP4PhaseASocialManifestCapture,
  runIntegratedHostedStagingP4PhaseA,
  type IntegratedP4PhaseACliDependencies,
} from "./verify-hosted-staging-p4-phase-a-cli";
import type {
  StagingFixtureManifest,
  StagingManifestRequest,
} from "./verify-hosted-staging-writable";
import type { BrowserMemoryIdentity } from "./verify-staging-live-auth";

const NOW = Date.parse("2026-07-24T18:00:00.000Z");
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const WORKER_ID = "44444444-4444-4444-8444-444444444444";
const SOURCE = "a".repeat(40);
const TARGET = new URL("https://staging.tomodachi.pw/");

function approval(): P4PhaseAApproval {
  return {
    confirmations: FIXED_P4_PHASE_A_CONFIRMATIONS,
    environment: "staging",
    expiresAt: "2026-07-24T18:20:00.000Z",
    issuedAt: "2026-07-24T17:55:00.000Z",
    limits: FIXED_P4_PHASE_A_LIMITS,
    operations: FIXED_P4_PHASE_A_OPERATIONS,
    ownerUserId: OWNER_ID,
    phase: "p4-phase-a",
    runId: RUN_ID,
    schemaVersion: 1,
    secondUserId: SECOND_ID,
    sourceCommit: SOURCE,
    target: "https://staging.tomodachi.pw",
    workerVersion: WORKER_ID,
  };
}

function policyState(): P4PhaseARequestPolicyState {
  return {
    commentId: "55555555-5555-4555-8555-555555555555",
    creationId: RUN_ID,
    etags: ['"rev-1"', '"rev-2"'],
    fixtureName: "P4 phase A p4a333333333333",
    ownerUsername: "owner-user",
    searchToken: "p4a333333333333",
    secondUsername: "second-user",
    slug: "fixture-slug",
  };
}

function mutation(
  method: "DELETE" | "PATCH" | "POST" | "PUT",
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: TARGET.origin,
      ...headers,
    },
    method,
  };
}

describe("P4 phase A approval contract", () => {
  it("accepts only the exact short-lived staging scope", () => {
    expect(parseP4PhaseAApproval(approval(), NOW)).toEqual(approval());

    const widened = structuredClone(approval()) as unknown as {
      operations: string[];
    };
    widened.operations.push("moderation.creation.hide");
    expect(() => parseP4PhaseAApproval(widened, NOW)).toThrow(
      "operation allowlist is not exact",
    );

    const excess = structuredClone(approval()) as unknown as {
      limits: Record<string, number>;
    };
    excess.limits.maxReports = 1;
    expect(() => parseP4PhaseAApproval(excess, NOW)).toThrow(
      "fixed request, write, object, and byte ceilings",
    );

    const production = { ...approval(), target: "https://tomodachi.pw" };
    expect(() => parseP4PhaseAApproval(production, NOW)).toThrow(
      "one exact staging release",
    );
  });

  it("fails closed on stale timestamps and duplicate identities", () => {
    expect(() =>
      parseP4PhaseAApproval(
        {
          ...approval(),
          expiresAt: "2026-07-24T18:40:00.000Z",
        },
        NOW,
      ),
    ).toThrow("valid for too long");
    expect(() =>
      parseP4PhaseAApproval({ ...approval(), secondUserId: OWNER_ID }, NOW),
    ).toThrow("distinct second user");
  });

  it("requires an ignored 0600 file and bounds its contents", async () => {
    const readSecureFile = vi.fn(async () => ({
      mode: 0o100600,
      text: JSON.stringify(approval()),
    }));
    await expect(
      loadP4PhaseAApproval(undefined, {
        isIgnored: async () => true,
        now: () => NOW,
        readSecureFile,
      }),
    ).resolves.toEqual(approval());

    await expect(
      loadP4PhaseAApproval(undefined, {
        isIgnored: async () => true,
        now: () => NOW,
        readSecureFile: async () => ({
          mode: 0o100644,
          text: JSON.stringify(approval()),
        }),
      }),
    ).rejects.toThrow("must have mode 0600");
    await expect(
      loadP4PhaseAApproval(undefined, {
        isIgnored: async () => false,
        now: () => NOW,
        readSecureFile,
      }),
    ).rejects.toThrow("not protected by Git ignore");
  });

  it("consumes the approval once before mutation and removes the source", async () => {
    const createExclusiveMarker = vi.fn(async () => undefined);
    const removeApproval = vi.fn(async () => undefined);
    await consumeP4PhaseAApproval(approval(), {
      createExclusiveMarker,
      loadCurrent: async () => approval(),
      now: () => NOW,
      removeApproval,
    });
    expect(createExclusiveMarker).toHaveBeenCalledOnce();
    expect(createExclusiveMarker.mock.calls[0]?.[2]).toBe(0o600);
    expect(removeApproval).toHaveBeenCalledOnce();

    await expect(
      consumeP4PhaseAApproval(approval(), {
        createExclusiveMarker: async () => {
          throw new Error("exists");
        },
        loadCurrent: async () => approval(),
        now: () => NOW,
        removeApproval,
      }),
    ).rejects.toThrow("already consumed");
  });
});

describe("P4 phase A request policy", () => {
  it("allows only the exact actor, route, object, headers, and body", () => {
    const state = policyState();
    expect(
      assertP4PhaseARequestAllowed(
        "second-user",
        TARGET,
        "/api/creations",
        mutation("POST", {
          id: RUN_ID,
          project: { meta: { name: state.fixtureName } },
          title: state.fixtureName,
        }),
        state,
      ).pathname,
    ).toBe("/api/creations");
    expect(
      assertP4PhaseARequestAllowed(
        "second-user",
        TARGET,
        `/api/creations/${RUN_ID}/project`,
        mutation(
          "PUT",
          { project: { meta: { name: state.fixtureName } } },
          { "If-Match": '"rev-1"' },
        ),
        state,
      ).pathname,
    ).toBe(`/api/creations/${RUN_ID}/project`);
    expect(
      assertP4PhaseARequestAllowed(
        "owner",
        TARGET,
        `/api/users/${state.secondUsername}/creations?limit=50`,
        { headers: { Accept: "application/json" } },
        state,
      ).search,
    ).toBe("?limit=50");
  });

  it("rejects route, query, credential, actor, ETag, and object expansion", () => {
    const state = policyState();
    expect(() =>
      assertP4PhaseARequestAllowed(
        "owner",
        TARGET,
        "/api/me/export",
        { headers: { Accept: "application/json" } },
        state,
      ),
    ).toThrow("outside P4 phase A");
    expect(() =>
      assertP4PhaseARequestAllowed(
        "owner",
        TARGET,
        "/api/discover/recent?limit=51",
        { headers: { Accept: "application/json" } },
        state,
      ),
    ).toThrow("outside P4 phase A");
    expect(() =>
      assertP4PhaseARequestAllowed(
        "owner",
        TARGET,
        `/api/creations/${RUN_ID}`,
        {
          headers: {
            Accept: "application/json",
            Cookie: "__Host-tomodachi.sid=forbidden",
          },
        },
        state,
      ),
    ).toThrow("browser-memory adapter");
    expect(() =>
      assertP4PhaseARequestAllowed(
        "owner",
        TARGET,
        "/api/creations",
        mutation("POST", {
          id: RUN_ID,
          project: { meta: { name: state.fixtureName } },
          title: state.fixtureName,
        }),
        state,
      ),
    ).toThrow("outside P4 phase A");
    expect(() =>
      assertP4PhaseARequestAllowed(
        "second-user",
        TARGET,
        `/api/creations/${RUN_ID}/project`,
        mutation(
          "PUT",
          { project: { meta: { name: state.fixtureName } } },
          { "If-Match": '"rev-99"' },
        ),
        state,
      ),
    ).toThrow("ETag observed");
    expect(() =>
      assertP4PhaseARequestAllowed(
        "second-user",
        TARGET,
        "/api/creations/66666666-6666-4666-8666-666666666666",
        mutation("DELETE", {}),
        state,
      ),
    ).toThrow("outside P4 phase A");

    expect(() =>
      assertP4PhaseARequestAllowed(
        "owner",
        TARGET,
        "/api/users/second-user/creations?limit=50",
        { headers: { Accept: "application/json" } },
        { ...state, secondUsername: null },
      ),
    ).toThrow("outside P4 phase A");
  });
});

describe("P4 phase A orchestration boundaries", () => {
  it("rejects invalid approval bindings before deployment, manifests, or requests", async () => {
    const request = vi.fn(async () => new Response());
    const verifyDeployment = vi.fn();
    const captureCreationManifest = vi.fn();
    const captureSocialManifest = vi.fn();
    const identities = [
      identity("owner", OWNER_ID, "admin", request),
      identity("second-user", SECOND_ID, "user", request),
    ] as const;

    await expect(
      runHostedStagingP4PhaseA({
        captureCreationManifest,
        captureSocialManifest,
        expectedOwnerUserId: OWNER_ID,
        expectedSecondUserId: SECOND_ID,
        expectedSourceCommit: "not-a-commit",
        expectedWorkerVersion: WORKER_ID,
        identities,
        runId: RUN_ID,
        verifyDeployment,
      }),
    ).rejects.toBeInstanceOf(HostedStagingP4PhaseAError);
    expect(verifyDeployment).not.toHaveBeenCalled();
    expect(captureCreationManifest).not.toHaveBeenCalled();
    expect(captureSocialManifest).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("runs the complete two-user scenario through the single-use integrated adapter", async () => {
    const api = new InjectedP4Api();
    const identities = [
      identity("owner", OWNER_ID, "admin", api.requestFor("owner")),
      identity("second-user", SECOND_ID, "user", api.requestFor("second-user")),
    ] as const;
    const consumeApproval = vi.fn(async () => undefined);
    const creationCaptures: StagingManifestRequest[] = [];
    const socialCaptures: Array<{
      commentId: string | null;
      creationId: string;
      phase: "before" | "after";
    }> = [];
    const createCreationManifestCapture = vi.fn(
      () => async (request: StagingManifestRequest) => {
        creationCaptures.push(request);
        return request.phase === "before"
          ? creationManifestBefore()
          : creationManifestAfter();
      },
    );
    const createSocialManifestCapture = vi.fn(
      () =>
        async (request: {
          commentId: string | null;
          creationId: string;
          phase: "before" | "after";
        }) => {
          socialCaptures.push(request);
          return request.phase === "before"
            ? socialManifestBefore()
            : {
                ...socialManifestBefore(),
                commentAuthorUserId: OWNER_ID,
                commentState: "deleted" as const,
                creationOwnerUserId: SECOND_ID,
                creationState: "deleted" as const,
              };
        },
    );
    const withSessions = vi.fn(async (options, callback) => {
      expect(options).toMatchObject({
        baseUrl: "https://staging.tomodachi.pw",
        expectedCommunityMutations: true,
        expectedConsultSales: false,
        expectedSourceSha: SOURCE,
        expectedWorkerVersion: WORKER_ID,
      });
      const callbackResult = await callback(identities, {
        communityMutationsEnabled: true,
        consultSalesEnabled: false,
        environment: "staging",
        origin: "https://staging.tomodachi.pw",
        sourceCommit: SOURCE,
        workerVersion: WORKER_ID,
      });
      return {
        callbackResult,
        identities: 2 as const,
        sessionsRevoked: 2 as const,
        sourceSha: SOURCE,
        target: "https://staging.tomodachi.pw" as const,
        workerVersion: WORKER_ID,
      };
    });

    const result = await runIntegratedHostedStagingP4PhaseA({
      consumeApproval,
      createCreationManifestCapture,
      createSocialManifestCapture,
      loadApproval: async () => approval(),
      now: () => NOW,
      withSessions,
    });

    expect(result).toMatchObject({
      cleanup: "verified",
      identities: 2,
      sessionsRevoked: 2,
      sourceCommit: SOURCE,
      target: "https://staging.tomodachi.pw",
      workerVersion: WORKER_ID,
    });
    expect(result.assertions).toBeGreaterThanOrEqual(15);
    expect(result.requests).toBeLessThanOrEqual(
      FIXED_P4_PHASE_A_LIMITS.maxRequests,
    );
    expect(result.mutationAttempts).toBeLessThanOrEqual(
      FIXED_P4_PHASE_A_LIMITS.maxMutationAttempts,
    );
    expect(consumeApproval).toHaveBeenCalledOnce();
    expect(api.created).toBe(true);
    expect(api.deleted).toBe(true);
    expect(api.requestCount).toBe(result.requests);
    expect(creationCaptures).toEqual([
      { phase: "before", trackedCreationIds: [RUN_ID] },
      { phase: "after", trackedCreationIds: [RUN_ID] },
    ]);
    expect(socialCaptures).toEqual([
      { commentId: null, creationId: RUN_ID, phase: "before" },
      {
        commentId: InjectedP4Api.COMMENT_ID,
        creationId: RUN_ID,
        phase: "after",
      },
    ]);
  });

  it("records and deletes a generated comment when interrupted after its response", async () => {
    const controller = new AbortController();
    const interruption = new Error("abort after comment response");
    const api = new InjectedP4Api();
    const ownerRequest = api.requestFor("owner");
    const interruptedOwnerRequest: BrowserMemoryIdentity["request"] = async (
      input,
      init,
    ) => {
      const response = await ownerRequest(input, init);
      const request = new Request(input, init);
      if (
        request.method === "POST" &&
        new URL(request.url).pathname === `/api/creations/${RUN_ID}/comments`
      ) {
        controller.abort(interruption);
      }
      return response;
    };
    const identities = [
      identity("owner", OWNER_ID, "admin", interruptedOwnerRequest),
      identity("second-user", SECOND_ID, "user", api.requestFor("second-user")),
    ] as const;
    const scenario = injectedCoreScenario(api, {
      abortSignal: controller.signal,
      identities,
    });

    await expect(scenario.result).rejects.toBe(interruption);
    expect(
      api.operationCount(
        "owner",
        "DELETE",
        `/api/comments/${InjectedP4Api.COMMENT_ID}`,
      ),
    ).toBe(1);
    expect(api.deleted).toBe(true);
    expect(scenario.socialCaptures.at(-1)).toEqual({
      commentId: InjectedP4Api.COMMENT_ID,
      creationId: RUN_ID,
      phase: "after",
    });
  });

  it("leaves approval consumption and acceptance untouched when aborted before consume", async () => {
    const controller = new AbortController();
    const interruption = new Error("abort before P4 approval consumption");
    const consumeApproval = vi.fn(async () => undefined);
    const runAcceptance = vi.fn(async () => successfulP4Result());
    const withSessions: IntegratedP4PhaseACliDependencies["withSessions"] =
      async (options, callback) => {
        expect(options.abortSignal).toBe(controller.signal);
        controller.abort(interruption);
        const callbackResult = await callback(
          integratedIdentities(),
          integratedDeployment(),
        );
        return integratedLiveAuthResult(callbackResult);
      };

    await expect(
      runIntegratedHostedStagingP4PhaseA(
        {
          consumeApproval,
          createCreationManifestCapture: () => async () =>
            creationManifestBefore(),
          createSocialManifestCapture: () => async () => socialManifestBefore(),
          loadApproval: async () => approval(),
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

  it("finishes approval consumption before honoring an abort and does not start acceptance", async () => {
    const controller = new AbortController();
    const interruption = new Error("abort during P4 approval consumption");
    const consumeEvents: string[] = [];
    const consumeApproval = vi.fn(async () => {
      consumeEvents.push("consume-start");
      controller.abort(interruption);
      await Promise.resolve();
      consumeEvents.push("consume-complete");
    });
    const runAcceptance = vi.fn(async () => successfulP4Result());
    const withSessions: IntegratedP4PhaseACliDependencies["withSessions"] =
      async (_options, callback) => {
        const callbackResult = await callback(
          integratedIdentities(),
          integratedDeployment(),
        );
        return integratedLiveAuthResult(callbackResult);
      };

    await expect(
      runIntegratedHostedStagingP4PhaseA(
        {
          consumeApproval,
          createCreationManifestCapture: () => async () =>
            creationManifestBefore(),
          createSocialManifestCapture: () => async () => socialManifestBefore(),
          loadApproval: async () => approval(),
          now: () => NOW,
          runAcceptance,
          withSessions,
        },
        controller.signal,
      ),
    ).rejects.toBe(interruption);

    expect(consumeEvents).toEqual(["consume-start", "consume-complete"]);
    expect(consumeApproval).toHaveBeenCalledOnce();
    expect(runAcceptance).not.toHaveBeenCalled();
  });

  it("threads one abort signal through live auth and P4 acceptance options", async () => {
    const controller = new AbortController();
    const consumeApproval = vi.fn(async () => undefined);
    const runAcceptance: IntegratedP4PhaseACliDependencies["runAcceptance"] =
      vi.fn(async (options) => {
        expect(options.abortSignal).toBe(controller.signal);
        return successfulP4Result();
      });
    const withSessions: IntegratedP4PhaseACliDependencies["withSessions"] =
      vi.fn(async (options, callback) => {
        expect(options.abortSignal).toBe(controller.signal);
        const callbackResult = await callback(
          integratedIdentities(),
          integratedDeployment(),
        );
        return integratedLiveAuthResult(callbackResult);
      });

    await expect(
      runIntegratedHostedStagingP4PhaseA(
        {
          consumeApproval,
          createCreationManifestCapture: () => async () =>
            creationManifestBefore(),
          createSocialManifestCapture: () => async () => socialManifestBefore(),
          loadApproval: async () => approval(),
          now: () => NOW,
          runAcceptance,
          withSessions,
        },
        controller.signal,
      ),
    ).resolves.toMatchObject({
      cleanup: "verified",
      identities: 2,
      sessionsRevoked: 2,
      sourceCommit: SOURCE,
      workerVersion: WORKER_ID,
    });

    expect(withSessions).toHaveBeenCalledOnce();
    expect(consumeApproval).toHaveBeenCalledOnce();
    expect(runAcceptance).toHaveBeenCalledOnce();
  });

  it("continues later cleanup actions and reconciliation after an earlier permanent failure", async () => {
    const api = new InjectedP4Api({
      "owner:DELETE:/api/users/second-user/follow": [
        { call: 3, kind: "status", status: 400 },
      ],
    });
    const scenario = injectedCoreScenario(api);

    await expect(scenario.result).rejects.toThrow(
      "cleanup or reconciliation left 1 unresolved failure",
    );
    expect(
      api.operationCount("owner", "DELETE", `/api/creations/${RUN_ID}/like`),
    ).toBe(3);
    expect(
      api.operationCount(
        "second-user",
        "POST",
        `/api/creations/${RUN_ID}/unpublish`,
      ),
    ).toBe(2);
    expect(
      api.operationCount("second-user", "DELETE", `/api/creations/${RUN_ID}`),
    ).toBe(1);
    expect(scenario.creationCaptures.at(-1)?.phase).toBe("after");
    expect(scenario.socialCaptures.at(-1)?.phase).toBe("after");
  });

  it("retries transient cleanup network and 5xx failures once, then succeeds", async () => {
    const api = new InjectedP4Api({
      "owner:DELETE:/api/creations/33333333-3333-4333-8333-333333333333/like": [
        { call: 3, kind: "status", status: 503 },
      ],
      "owner:DELETE:/api/users/second-user/follow": [
        { call: 3, kind: "network" },
      ],
      "second-user:POST:/api/creations/33333333-3333-4333-8333-333333333333/unpublish":
        [{ call: 2, kind: "status", status: 502 }],
    });

    await expect(injectedCoreScenario(api).result).resolves.toMatchObject({
      cleanup: "verified",
    });
    expect(
      api.operationCount("owner", "DELETE", "/api/users/second-user/follow"),
    ).toBe(4);
    expect(
      api.operationCount("owner", "DELETE", `/api/creations/${RUN_ID}/like`),
    ).toBe(4);
    expect(
      api.operationCount(
        "second-user",
        "POST",
        `/api/creations/${RUN_ID}/unpublish`,
      ),
    ).toBe(3);
  });

  it("retries a creation-delete 5xx and accepts the successful retry", async () => {
    const api = new InjectedP4Api({
      "second-user:DELETE:/api/creations/33333333-3333-4333-8333-333333333333":
        [{ call: 1, kind: "status", status: 503 }],
    });

    await expect(injectedCoreScenario(api).result).resolves.toMatchObject({
      cleanup: "verified",
    });
    expect(
      api.operationCount("second-user", "DELETE", `/api/creations/${RUN_ID}`),
    ).toBe(2);
    expect(api.deleted).toBe(true);
  });

  it("aggregates every unresolved action after reconciliation still runs", async () => {
    const api = new InjectedP4Api({
      "owner:DELETE:/api/creations/33333333-3333-4333-8333-333333333333/like": [
        { call: 3, kind: "status", status: 409 },
      ],
      "owner:DELETE:/api/users/second-user/follow": [
        { call: 3, kind: "status", status: 400 },
      ],
    });
    const scenario = injectedCoreScenario(api);
    let failure: unknown;
    try {
      await scenario.result;
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toHaveLength(2);
    expect((failure as AggregateError).message).toContain(
      "left 2 unresolved failure(s)",
    );
    expect(
      api.operationCount(
        "second-user",
        "POST",
        `/api/creations/${RUN_ID}/unpublish`,
      ),
    ).toBe(2);
    expect(
      api.operationCount("second-user", "DELETE", `/api/creations/${RUN_ID}`),
    ).toBe(1);
    expect(scenario.creationCaptures.at(-1)?.phase).toBe("after");
    expect(scenario.socialCaptures.at(-1)?.phase).toBe("after");
  });
});

describe("P4 phase A Wrangler social manifest adapter", () => {
  it("uses only the exact staging D1 command and parses the bounded row", async () => {
    const runJson = vi.fn(async () => [
      {
        results: [
          {
            comment_author_user_id: OWNER_ID,
            comment_state: "deleted",
            creation_owner_user_id: SECOND_ID,
            creation_state: "deleted",
            follow_count: 0,
            foreign_key_violations: 0,
            like_count: 0,
            moderation_action_count: 0,
            report_count: 0,
            search_count: 0,
            showcase_image_count: 0,
          },
        ],
        success: true,
      },
    ]);
    const capture = createP4PhaseASocialManifestCapture(approval(), {
      runJson,
    });

    await expect(
      capture({
        commentId: InjectedP4Api.COMMENT_ID,
        creationId: RUN_ID,
        phase: "after",
      }),
    ).resolves.toMatchObject({
      commentAuthorUserId: OWNER_ID,
      creationOwnerUserId: SECOND_ID,
      foreignKeyViolations: 0,
    });
    expect(runJson).toHaveBeenCalledOnce();
    const args = runJson.mock.calls[0]?.[0] ?? [];
    expect(args).toEqual(
      expect.arrayContaining([
        "d1",
        "execute",
        "tomodachi-studio-staging",
        "--remote",
        "--env",
        "staging",
        "--json",
      ]),
    );
    const command = args[args.indexOf("--command") + 1] ?? "";
    expect(command).toContain(RUN_ID);
    expect(command).toContain(OWNER_ID);
    expect(command).toContain(SECOND_ID);
    expect(command).toContain("pragma_foreign_key_check");
    expect(command).not.toContain("DELETE");

    await expect(
      capture({
        commentId: null,
        creationId: "66666666-6666-4666-8666-666666666666",
        phase: "before",
      }),
    ).rejects.toThrow("escaped the exact approved fixture scope");
  });
});

function identity(
  slot: "owner" | "second-user",
  internalUserId: string,
  role: "admin" | "user",
  request: BrowserMemoryIdentity["request"],
): BrowserMemoryIdentity {
  return { internalUserId, request, role, slot };
}

function integratedIdentities(): readonly [
  BrowserMemoryIdentity,
  BrowserMemoryIdentity,
] {
  const request = async () => new Response();
  return [
    identity("owner", OWNER_ID, "admin", request),
    identity("second-user", SECOND_ID, "user", request),
  ];
}

function integratedDeployment() {
  return {
    communityMutationsEnabled: true as const,
    consultSalesEnabled: false as const,
    environment: "staging" as const,
    origin: "https://staging.tomodachi.pw" as const,
    sourceCommit: SOURCE,
    workerVersion: WORKER_ID,
  };
}

function integratedLiveAuthResult(callbackResult: HostedStagingP4PhaseAResult) {
  return {
    callbackResult,
    identities: 2 as const,
    sessionsRevoked: 2 as const,
    sourceSha: SOURCE,
    target: "https://staging.tomodachi.pw" as const,
    workerVersion: WORKER_ID,
  };
}

function successfulP4Result(): HostedStagingP4PhaseAResult {
  return {
    assertions: 1,
    cleanup: "verified",
    coveredScenarios: [],
    manifests: {
      creationAfter: creationManifestBefore(),
      creationBefore: creationManifestBefore(),
      socialAfter: socialManifestBefore(),
      socialBefore: socialManifestBefore(),
    },
    mutationAttempts: 0,
    requests: 0,
    sourceCommit: SOURCE,
    target: "https://staging.tomodachi.pw",
    workerVersion: WORKER_ID,
  };
}

function creationManifestBefore(): StagingFixtureManifest {
  return {
    fixtureActiveCreationRows: 0,
    fixtureDeletedCreationRows: 0,
    fixtureObjectBytes: 0,
    fixtureObjectRows: 0,
    fixtureR2ObjectBytes: 0,
    fixtureR2ObjectCount: 0,
    fixtureRevisionRows: 0,
    totalCreationRows: 10,
    totalObjectBytes: 200,
    totalObjectRows: 5,
    totalR2ObjectCount: 5,
    totalRevisionRows: 20,
  };
}

function creationManifestAfter(): StagingFixtureManifest {
  return {
    fixtureActiveCreationRows: 0,
    fixtureDeletedCreationRows: 1,
    fixtureObjectBytes: 0,
    fixtureObjectRows: 0,
    fixtureR2ObjectBytes: 0,
    fixtureR2ObjectCount: 0,
    fixtureRevisionRows: 2,
    totalCreationRows: 11,
    totalObjectBytes: 200,
    totalObjectRows: 5,
    totalR2ObjectCount: 5,
    totalRevisionRows: 22,
  };
}

function socialManifestBefore() {
  return {
    commentAuthorUserId: null,
    commentState: null,
    creationOwnerUserId: null,
    creationState: null,
    followCount: 0,
    foreignKeyViolations: 0,
    likeCount: 0,
    moderationActionCount: 0,
    reportCount: 0,
    searchCount: 0,
    showcaseImageCount: 0,
  };
}

type InjectedFault =
  | { call: number; kind: "network" }
  | { call: number; kind: "status"; status: number };

function injectedCoreScenario(
  api: InjectedP4Api,
  overrides: {
    abortSignal?: AbortSignal;
    identities?: readonly [BrowserMemoryIdentity, BrowserMemoryIdentity];
  } = {},
) {
  const creationCaptures: StagingManifestRequest[] = [];
  const socialCaptures: Array<{
    commentId: string | null;
    creationId: string;
    phase: "before" | "after";
  }> = [];
  const identities =
    overrides.identities ??
    ([
      identity("owner", OWNER_ID, "admin", api.requestFor("owner")),
      identity("second-user", SECOND_ID, "user", api.requestFor("second-user")),
    ] as const);
  const result = runHostedStagingP4PhaseA({
    abortSignal: overrides.abortSignal,
    captureCreationManifest: async (request) => {
      creationCaptures.push(request);
      return request.phase === "before"
        ? creationManifestBefore()
        : creationManifestAfter();
    },
    captureSocialManifest: async (request) => {
      socialCaptures.push(request);
      return request.phase === "before"
        ? socialManifestBefore()
        : {
            ...socialManifestBefore(),
            commentAuthorUserId: OWNER_ID,
            commentState: "deleted" as const,
            creationOwnerUserId: SECOND_ID,
            creationState: "deleted" as const,
          };
    },
    expectedOwnerUserId: OWNER_ID,
    expectedSecondUserId: SECOND_ID,
    expectedSourceCommit: SOURCE,
    expectedWorkerVersion: WORKER_ID,
    identities,
    runId: RUN_ID,
    verifyDeployment: async () => ({
      communityMutationsEnabled: true,
      environment: "staging",
      origin: TARGET.origin,
      sourceCommit: SOURCE,
      workerVersion: WORKER_ID,
    }),
  });
  return { creationCaptures, result, socialCaptures };
}

class InjectedP4Api {
  static readonly COMMENT_ID = "55555555-5555-4555-8555-555555555555";
  private commentsEnabled = true;
  created = false;
  deleted = false;
  private readonly operationCounts = new Map<string, number>();
  private follow = false;
  private liked = false;
  private published: "draft" | "public" | "unlisted" = "draft";
  private revision = 0;
  requestCount = 0;

  constructor(
    private readonly faults: Readonly<
      Record<string, readonly InjectedFault[]>
    > = {},
  ) {}

  operationCount(
    actor: "owner" | "second-user",
    method: string,
    pathname: string,
  ): number {
    return this.operationCounts.get(`${actor}:${method}:${pathname}`) ?? 0;
  }

  requestFor(actor: "owner" | "second-user"): BrowserMemoryIdentity["request"] {
    return async (input, init = {}) => {
      this.requestCount += 1;
      const url = new URL(String(input));
      const method = (init.method ?? "GET").toUpperCase();
      const pathname = url.pathname;
      const creation = `/api/creations/${RUN_ID}`;
      const operation = `${actor}:${method}:${pathname}`;
      const operationCall = (this.operationCounts.get(operation) ?? 0) + 1;
      this.operationCounts.set(operation, operationCall);
      const fault = this.faults[operation]?.find(
        (candidate) => candidate.call === operationCall,
      );
      if (fault?.kind === "network") {
        throw new Error(`Synthetic network failure for ${operation}.`);
      }
      if (fault?.kind === "status") {
        return this.error(fault.status, "SYNTHETIC_FAILURE");
      }

      if (method === "GET" && pathname === "/api/auth/session") {
        return this.envelope(200, {
          user: {
            id: actor === "owner" ? OWNER_ID : SECOND_ID,
            role: actor === "owner" ? "admin" : "user",
            username: actor === "owner" ? "owner-user" : "second-user",
          },
        });
      }
      if (
        actor === "owner" &&
        ((pathname === creation && ["DELETE", "PATCH"].includes(method)) ||
          (pathname === `${creation}/project` && method === "PUT") ||
          (pathname === `${creation}/publish` && method === "POST") ||
          (pathname === `${creation}/images/uploads` && method === "POST"))
      ) {
        return this.error(403, "FORBIDDEN");
      }
      if (
        actor === "owner" &&
        method === "GET" &&
        pathname === creation &&
        this.published === "draft"
      ) {
        return this.error(403, "FORBIDDEN");
      }
      if (
        actor === "owner" &&
        method === "GET" &&
        pathname.startsWith(`${creation}/media/`) &&
        this.published === "draft"
      ) {
        return this.error(404, "NOT_FOUND");
      }
      if (
        actor === "second-user" &&
        method === "POST" &&
        pathname === "/api/creations"
      ) {
        this.created = true;
        this.revision = 1;
        return this.envelope(
          201,
          {
            id: RUN_ID,
            slug: "abcdefghijklmnopqr",
            state: "draft",
            visibility: "private",
          },
          { ETag: '"rev-1"' },
        );
      }
      if (
        actor === "second-user" &&
        method === "GET" &&
        pathname === creation
      ) {
        return this.envelope(200, {
          creation: { id: RUN_ID },
          project: { meta: { name: "P4 phase A p4a333333333333" } },
        });
      }
      if (
        actor === "second-user" &&
        method === "PUT" &&
        pathname === `${creation}/project`
      ) {
        if (this.revision === 1) {
          this.revision = 2;
          return this.envelope(200, { id: RUN_ID }, { ETag: '"rev-2"' });
        }
        return this.error(409, "REVISION_CONFLICT", {
          currentEtag: '"rev-2"',
        });
      }
      if (
        actor === "second-user" &&
        method === "POST" &&
        pathname === `${creation}/publish`
      ) {
        const body = this.body(init);
        this.published = body.visibility === "unlisted" ? "unlisted" : "public";
        this.commentsEnabled = body.commentsEnabled === true;
        return this.envelope(200, { id: RUN_ID });
      }
      if (
        method === "GET" &&
        pathname === "/api/creations/slug/abcdefghijklmnopqr"
      ) {
        return this.published === "draft"
          ? this.error(404, "NOT_FOUND")
          : this.envelope(200, { id: RUN_ID });
      }
      if (
        actor === "owner" &&
        method === "GET" &&
        (pathname === `/api/users/second-user/creations` ||
          pathname === "/api/discover/recent" ||
          pathname === "/api/search")
      ) {
        return this.envelope(
          200,
          this.published === "public" ? [{ id: RUN_ID }] : [],
        );
      }
      if (
        actor === "owner" &&
        method === "GET" &&
        pathname === `${creation}/media/preview`
      ) {
        return this.response(200, new Uint8Array([1, 2, 3]), {
          "Content-Type": "image/webp",
        });
      }
      if (
        actor === "owner" &&
        method === "GET" &&
        pathname === `${creation}/media/project`
      ) {
        return this.published === "unlisted"
          ? this.response(200, JSON.stringify({ version: 1 }), {
              "Content-Type": "application/json",
            })
          : this.error(404, "NOT_FOUND");
      }
      if (
        actor === "owner" &&
        pathname === `${creation}/like` &&
        ["PUT", "DELETE"].includes(method)
      ) {
        const next = method === "PUT";
        const changed = this.liked !== next;
        this.liked = next;
        return this.envelope(200, { changed, liked: this.liked });
      }
      if (
        actor === "owner" &&
        pathname === "/api/users/second-user/follow" &&
        ["PUT", "DELETE"].includes(method)
      ) {
        const next = method === "PUT";
        const changed = this.follow !== next;
        this.follow = next;
        return this.envelope(200, { changed, following: this.follow });
      }
      if (
        actor === "owner" &&
        method === "POST" &&
        pathname === `${creation}/comments`
      ) {
        return this.commentsEnabled
          ? this.envelope(201, { id: InjectedP4Api.COMMENT_ID })
          : this.error(409, "COMMENTS_DISABLED");
      }
      if (
        actor === "second-user" &&
        pathname === `/api/comments/${InjectedP4Api.COMMENT_ID}` &&
        ["PATCH", "DELETE"].includes(method)
      ) {
        return this.error(403, "FORBIDDEN");
      }
      if (
        actor === "owner" &&
        pathname === `/api/comments/${InjectedP4Api.COMMENT_ID}` &&
        ["PATCH", "DELETE"].includes(method)
      ) {
        return this.envelope(200, { id: InjectedP4Api.COMMENT_ID });
      }
      if (
        actor === "second-user" &&
        method === "PATCH" &&
        pathname === creation
      ) {
        this.commentsEnabled = false;
        return this.envelope(200, { id: RUN_ID });
      }
      if (
        actor === "second-user" &&
        method === "POST" &&
        pathname === `${creation}/unpublish`
      ) {
        this.published = "draft";
        return this.envelope(200, { id: RUN_ID });
      }
      if (
        actor === "second-user" &&
        method === "GET" &&
        pathname === "/api/moderation/stats"
      ) {
        return this.error(403, "FORBIDDEN");
      }
      if (
        actor === "owner" &&
        method === "GET" &&
        pathname === "/api/moderation/stats"
      ) {
        return this.envelope(200, { openReports: 0 });
      }
      if (
        actor === "second-user" &&
        method === "DELETE" &&
        pathname === creation
      ) {
        if (this.deleted) return this.error(404, "NOT_FOUND");
        this.deleted = true;
        return this.envelope(200, { id: RUN_ID });
      }
      throw new Error(`Unexpected injected request: ${actor} ${method} ${url}`);
    };
  }

  private body(init: RequestInit): Record<string, unknown> {
    return typeof init.body === "string"
      ? (JSON.parse(init.body) as Record<string, unknown>)
      : {};
  }

  private envelope(
    status: number,
    data: unknown,
    extraHeaders: Record<string, string> = {},
  ): Response {
    const requestId = this.requestId();
    return this.response(status, JSON.stringify({ data, requestId }), {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...extraHeaders,
    });
  }

  private error(
    status: number,
    code: string,
    fields: Record<string, unknown> = {},
  ): Response {
    const requestId = this.requestId();
    return this.response(
      status,
      JSON.stringify({ error: { code, ...fields }, requestId }),
      {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
    );
  }

  private response(
    status: number,
    body: BodyInit,
    extraHeaders: Record<string, string>,
  ): Response {
    return new Response(body, {
      headers: {
        "X-Tomodachi-Community-Mutations": "enabled",
        "X-Tomodachi-Environment": "staging",
        "X-Tomodachi-Source-Commit": SOURCE,
        "X-Tomodachi-Worker-Version": WORKER_ID,
        ...extraHeaders,
      },
      status,
    });
  }

  private requestId(): string {
    const suffix = String(this.requestCount).padStart(12, "0");
    return `99999999-9999-4999-8999-${suffix}`;
  }
}
