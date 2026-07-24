import { describe, expect, it } from "vitest";

import {
  assertWritableRequestAllowed,
  HostedStagingWritableError,
  parseHostedStagingWritableTarget,
  runHostedStagingWritableAcceptance,
  validateStagingDeploymentEvidence,
  type StagingFixtureManifest,
  type WritableRequestPolicyState,
} from "./verify-hosted-staging-writable";
import type { AcceptanceFetch } from "./verify-hosted-read-only";

const FIXTURE_ORIGIN = "http://127.0.0.1:48124";
const SOURCE_COMMIT = "a".repeat(40);
const WORKER_VERSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const CREATION_ID = "11111111-1111-4111-8111-111111111111";

interface FixtureOptions {
  delayedDeleteMisses?: number;
  failDelete?: boolean;
  failAt?: "read";
  leakText?: string;
  releaseSourceCommit?: string;
  throwAfterCreate?: boolean;
  weakEtags?: boolean;
}

interface SeenRequest {
  body: string;
  headers: Headers;
  method: string;
  url: URL;
}

function emptyManifest(
  overrides: Partial<StagingFixtureManifest> = {},
): StagingFixtureManifest {
  return {
    fixtureActiveCreationRows: 0,
    fixtureDeletedCreationRows: 0,
    fixtureObjectBytes: 0,
    fixtureObjectRows: 0,
    fixtureR2ObjectBytes: 0,
    fixtureR2ObjectCount: 0,
    fixtureRevisionRows: 0,
    totalCreationRows: 3,
    totalObjectBytes: 12_345,
    totalObjectRows: 8,
    totalR2ObjectCount: 8,
    totalRevisionRows: 4,
    ...overrides,
  };
}

function writableFixture(options: FixtureOptions = {}): {
  fetchImpl: AcceptanceFetch;
  seen: SeenRequest[];
} {
  const seen: SeenRequest[] = [];
  let fixtureName = "";
  let creationId = "";
  let putCount = 0;
  let deleteAttempts = 0;
  let deletionCompleted = false;

  const fetchImpl: AcceptanceFetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const body = request.method === "GET" ? "" : await request.text();
    seen.push({
      body,
      headers: new Headers(request.headers),
      method: request.method,
      url,
    });
    const requestId = `00000000-0000-4000-8000-${seen.length
      .toString()
      .padStart(12, "0")}`;
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Tomodachi-Community-Mutations": "enabled",
      "X-Tomodachi-Environment": "staging",
      "X-Tomodachi-Source-Commit": options.releaseSourceCommit ?? SOURCE_COMMIT,
      "X-Tomodachi-Worker-Version": WORKER_VERSION,
      "X-Request-Id": requestId,
    });
    const envelope = (value: Record<string, unknown>, status = 200) =>
      new Response(JSON.stringify({ ...value, requestId }), {
        headers,
        status,
      });

    if (request.method === "GET" && url.pathname === "/api/auth/session") {
      return envelope({
        data: { user: { id: USER_ID, username: "acceptance-owner" } },
      });
    }
    if (request.method === "POST" && url.pathname === "/api/creations") {
      const parsed = JSON.parse(body) as {
        id: string;
        project: { meta: { name: string } };
        title: string;
      };
      fixtureName = parsed.title;
      creationId = parsed.id;
      expect(parsed.project.meta.name).toBe(fixtureName);
      if (options.throwAfterCreate) {
        throw new Error("simulated lost response after persistence");
      }
      headers.set("ETag", options.weakEtags ? 'W/"rev-1"' : '"rev-1"');
      return envelope(
        {
          data: {
            id: creationId,
            revision: 1,
            state: "draft",
            visibility: "private",
          },
        },
        201,
      );
    }
    if (
      request.method === "GET" &&
      url.pathname === `/api/creations/${creationId}`
    ) {
      if (options.failAt === "read") {
        return envelope(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: options.leakText ?? "private provider detail",
            },
          },
          500,
        );
      }
      return envelope({
        data: {
          creation: { id: creationId, revision: 1, state: "draft" },
          project: { meta: { name: fixtureName }, version: 1 },
        },
      });
    }
    if (
      request.method === "PUT" &&
      url.pathname === `/api/creations/${creationId}/project`
    ) {
      putCount += 1;
      if (putCount === 1) {
        headers.set("ETag", options.weakEtags ? 'W/"rev-2"' : '"rev-2"');
        return envelope({
          data: { id: creationId, revision: 2, state: "draft" },
        });
      }
      return envelope(
        {
          error: {
            code: "REVISION_CONFLICT",
            currentEtag: options.weakEtags ? 'W/"rev-2"' : '"rev-2"',
            currentRevision: 2,
            message: "Conflict",
          },
        },
        409,
      );
    }
    if (
      request.method === "DELETE" &&
      url.pathname === `/api/creations/${creationId}`
    ) {
      if (options.failDelete) {
        return envelope(
          { error: { code: "INTERNAL_ERROR", message: "Cleanup failed" } },
          500,
        );
      }
      deleteAttempts += 1;
      if (deleteAttempts <= (options.delayedDeleteMisses ?? 0)) {
        return envelope(
          { error: { code: "NOT_FOUND", message: "Not found" } },
          404,
        );
      }
      if (!deletionCompleted) {
        deletionCompleted = true;
        return envelope({ data: { deletedAt: 1, id: creationId } });
      }
      return envelope(
        { error: { code: "NOT_FOUND", message: "Not found" } },
        404,
      );
    }
    return envelope(
      { error: { code: "NOT_FOUND", message: "Unexpected fixture route" } },
      404,
    );
  };
  return { fetchImpl, seen };
}

function runFixture(
  fixture = writableFixture(),
  overrides: Partial<
    Parameters<typeof runHostedStagingWritableAcceptance>[0]
  > = {},
) {
  return {
    fixture,
    run: runHostedStagingWritableAcceptance({
      baseUrl: FIXTURE_ORIGIN,
      captureManifest: async ({ phase }) =>
        phase === "before"
          ? emptyManifest()
          : emptyManifest({
              fixtureDeletedCreationRows: 1,
              fixtureObjectBytes: 3_655,
              fixtureObjectRows: 8,
              fixtureR2ObjectBytes: 3_655,
              fixtureR2ObjectCount: 8,
              fixtureRevisionRows: 2,
              totalCreationRows: 4,
              totalObjectBytes: 16_000,
              totalObjectRows: 16,
              totalR2ObjectCount: 16,
              totalRevisionRows: 6,
            }),
      expectedSourceCommit: SOURCE_COMMIT,
      expectedUserId: USER_ID,
      expectedWorkerVersion: WORKER_VERSION,
      fetchImpl: fixture.fetchImpl,
      cleanupRetryDelaysMs: [0, 0, 0, 0],
      unsafeAllowLoopbackFixture: true,
      verifyDeployment: async () => ({
        communityMutationsEnabled: true,
        environment: "staging",
        origin: FIXTURE_ORIGIN,
        sourceCommit: SOURCE_COMMIT,
        workerVersion: WORKER_VERSION,
      }),
      ...overrides,
    }),
  };
}

describe("writable staging target and deployment policy", () => {
  it("allows only the exact staging origin unless a local fixture is explicit", () => {
    expect(
      parseHostedStagingWritableTarget("https://staging.tomodachi.pw").origin,
    ).toBe("https://staging.tomodachi.pw");
    expect(
      parseHostedStagingWritableTarget(FIXTURE_ORIGIN, { allowLoopback: true })
        .origin,
    ).toBe(FIXTURE_ORIGIN);

    for (const target of [
      "",
      "https://tomodachi.pw",
      "https://www.tomodachi.pw",
      "http://staging.tomodachi.pw",
      "https://staging.tomodachi.pw:444",
      "https://staging.tomodachi.pw/studio",
      "https://staging.tomodachi.pw/?target=production",
      "https://user:pass@staging.tomodachi.pw",
      "https://staging.tomodachi.pw.example.com",
      "https://example.com",
      FIXTURE_ORIGIN,
    ]) {
      expect(() => parseHostedStagingWritableTarget(target), target).toThrow(
        HostedStagingWritableError,
      );
    }
  });

  it("rejects mismatched source, version, flag, origin, and environment", () => {
    const expected = {
      origin: FIXTURE_ORIGIN,
      sourceCommit: SOURCE_COMMIT,
      workerVersion: WORKER_VERSION,
    };
    const valid = {
      communityMutationsEnabled: true,
      environment: "staging",
      origin: FIXTURE_ORIGIN,
      sourceCommit: SOURCE_COMMIT,
      workerVersion: WORKER_VERSION,
    };
    expect(() =>
      validateStagingDeploymentEvidence(valid, expected),
    ).not.toThrow();
    for (const evidence of [
      { ...valid, sourceCommit: "b".repeat(40) },
      { ...valid, workerVersion: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      { ...valid, communityMutationsEnabled: false },
      { ...valid, environment: "production" },
      { ...valid, origin: "https://tomodachi.pw" },
    ]) {
      expect(() =>
        validateStagingDeploymentEvidence(evidence, expected),
      ).toThrow("does not match");
    }
  });

  it("fails evidence checks before a manifest or target request", async () => {
    let manifests = 0;
    let requests = 0;
    await expect(
      runHostedStagingWritableAcceptance({
        baseUrl: FIXTURE_ORIGIN,
        captureManifest: async () => {
          manifests += 1;
          return emptyManifest();
        },
        expectedSourceCommit: SOURCE_COMMIT,
        expectedUserId: USER_ID,
        expectedWorkerVersion: WORKER_VERSION,
        fetchImpl: async () => {
          requests += 1;
          throw new Error("must not run");
        },
        unsafeAllowLoopbackFixture: true,
        verifyDeployment: async () => ({
          communityMutationsEnabled: false,
          environment: "staging",
          origin: FIXTURE_ORIGIN,
          sourceCommit: SOURCE_COMMIT,
          workerVersion: WORKER_VERSION,
        }),
      }),
    ).rejects.toThrow("does not match");
    expect(manifests).toBe(0);
    expect(requests).toBe(0);
  });

  it("redacts deployment and manifest dependency failures", async () => {
    const secret = "sk-or-v1-never-log-this";
    const fixture = writableFixture();
    const deploymentFailure = runFixture(fixture, {
      verifyDeployment: async () => {
        throw new HostedStagingWritableError(secret);
      },
    }).run;
    const deploymentError = await deploymentFailure.catch(
      (caught: unknown) => caught,
    );
    expect((deploymentError as Error).message).toBe(
      "Deployment evidence could not be verified safely.",
    );
    expect((deploymentError as Error).message).not.toContain(secret);

    const manifestFailure = runFixture(writableFixture(), {
      captureManifest: async () => {
        throw new Error(secret);
      },
    }).run;
    const manifestError = await manifestFailure.catch(
      (caught: unknown) => caught,
    );
    expect((manifestError as Error).message).toBe(
      "The pre-run fixture manifest could not be captured safely.",
    );
    expect((manifestError as Error).message).not.toContain(secret);
  });

  it.each(["https://tomodachi.pw", "https://unknown.example"])(
    "refuses %s before deployment, manifest, or target callbacks",
    async (baseUrl) => {
      const touched: string[] = [];
      await expect(
        runHostedStagingWritableAcceptance({
          baseUrl,
          captureManifest: async () => {
            touched.push("manifest");
            return emptyManifest();
          },
          expectedSourceCommit: SOURCE_COMMIT,
          expectedUserId: USER_ID,
          expectedWorkerVersion: WORKER_VERSION,
          fetchImpl: async () => {
            touched.push("fetch");
            throw new Error("must not run");
          },
          verifyDeployment: async () => {
            touched.push("deployment");
            throw new Error("must not run");
          },
        }),
      ).rejects.toThrow(HostedStagingWritableError);
      expect(touched).toEqual([]);
    },
  );
});

describe("writable request allowlist", () => {
  const target = parseHostedStagingWritableTarget(FIXTURE_ORIGIN, {
    allowLoopback: true,
  });
  const state: WritableRequestPolicyState = {
    expectedSourceCommit: SOURCE_COMMIT,
    expectedWorkerVersion: WORKER_VERSION,
    fixtureCreationId: CREATION_ID,
    fixtureEtags: ['"rev-1"'],
    fixtureName: "Acceptance fixture",
  };
  const jsonHeaders = {
    "Content-Type": "application/json",
    Origin: FIXTURE_ORIGIN,
  };

  it("permits only tracked fixture routes, IDs, headers, and bodies", () => {
    expect(
      assertWritableRequestAllowed(
        target,
        `/api/creations/${CREATION_ID}`,
        { headers: { Accept: "application/json" } },
        state,
      ).pathname,
    ).toBe(`/api/creations/${CREATION_ID}`);
    expect(
      assertWritableRequestAllowed(
        target,
        `/api/creations/${CREATION_ID}`,
        { body: "{}", headers: jsonHeaders, method: "DELETE" },
        state,
      ).pathname,
    ).toBe(`/api/creations/${CREATION_ID}`);

    for (const pathname of [
      "/api/me",
      "/api/reports",
      "/api/moderation/reports",
      "/api/creations/33333333-3333-4333-8333-333333333333",
      `/api/creations/${CREATION_ID}?owner=me`,
      "https://tomodachi.pw/api/creations",
    ]) {
      expect(() =>
        assertWritableRequestAllowed(target, pathname, {}, state),
      ).toThrow(HostedStagingWritableError);
    }
    expect(() =>
      assertWritableRequestAllowed(
        target,
        `/api/creations/${CREATION_ID}`,
        {
          body: "{}",
          headers: { ...jsonHeaders, Authorization: "Bearer forbidden" },
          method: "DELETE",
        },
        state,
      ),
    ).toThrow("header");
    expect(() =>
      assertWritableRequestAllowed(
        target,
        `/api/creations/${CREATION_ID}`,
        {
          body: JSON.stringify({ unexpected: true }),
          headers: jsonHeaders,
          method: "DELETE",
        },
        state,
      ),
    ).toThrow("empty JSON");
    expect(() =>
      assertWritableRequestAllowed(
        target,
        "/api/creations",
        {
          body: "x".repeat(128 * 1_024 + 1),
          headers: jsonHeaders,
          method: "POST",
        },
        state,
      ),
    ).toThrow("exceeds 131072 bytes");
    expect(() =>
      assertWritableRequestAllowed(
        target,
        "/api/auth/session",
        { headers: { Origin: FIXTURE_ORIGIN } },
        state,
      ),
    ).toThrow("Mutation-only headers");
  });
});

describe("writable staging acceptance", () => {
  it("refuses a browser session that is not the explicitly approved user", async () => {
    const fixture = writableFixture();
    const { run } = runFixture(fixture, {
      captureManifest: async () => emptyManifest(),
      expectedUserId: "33333333-3333-4333-8333-333333333333",
    });
    await expect(run).rejects.toThrow("approved staging user");
    expect(fixture.seen.map(({ method }) => method)).toEqual(["GET"]);
  });

  it("stops before writes when any response carries a drifted release identity", async () => {
    const fixture = writableFixture({ releaseSourceCommit: "b".repeat(40) });
    const { run } = runFixture(fixture);
    await expect(run).rejects.toThrow("unapproved release identity");
    expect(fixture.seen.map(({ method }) => method)).toEqual(["GET"]);
  });

  it("uses one private fixture, proves a conflict, and reconciles cleanup", async () => {
    const { fixture, run } = runFixture();
    const result = await run;

    expect(result).toMatchObject({
      cleanup: "verified",
      deployment: {
        communityMutations: "enabled",
        sourceCommit: SOURCE_COMMIT,
        workerVersion: WORKER_VERSION,
      },
      mutationAttempts: 5,
      requests: 7,
      target: FIXTURE_ORIGIN,
    });
    expect(result.assertions).toBeGreaterThanOrEqual(17);
    expect(result.manifests.after.fixtureR2ObjectCount).toBe(8);
    expect(fixture.seen.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "GET",
      "PUT",
      "PUT",
      "DELETE",
      "DELETE",
    ]);
    expect(
      fixture.seen.every(
        ({ headers, url }) =>
          url.origin === FIXTURE_ORIGIN &&
          !headers.has("authorization") &&
          !headers.has("cookie"),
      ),
    ).toBe(true);
  });

  it("normalizes weak revision ETags without weakening conflict checks", async () => {
    const { run } = runFixture(writableFixture({ weakEtags: true }));
    await expect(run).resolves.toMatchObject({
      cleanup: "verified",
      mutationAttempts: 5,
      requests: 7,
    });
  });

  it("retries a transient post-run manifest before accepting reconciliation", async () => {
    let afterCaptures = 0;
    const { run } = runFixture(writableFixture(), {
      cleanupRetryDelaysMs: [0],
      captureManifest: async ({ phase }) => {
        if (phase === "before") return emptyManifest();
        afterCaptures += 1;
        if (afterCaptures === 1) {
          return emptyManifest({ fixtureActiveCreationRows: 1 });
        }
        return emptyManifest({
          fixtureDeletedCreationRows: 1,
          fixtureObjectBytes: 3_655,
          fixtureObjectRows: 8,
          fixtureR2ObjectBytes: 3_655,
          fixtureR2ObjectCount: 8,
          fixtureRevisionRows: 2,
          totalCreationRows: 4,
          totalObjectBytes: 16_000,
          totalObjectRows: 16,
          totalR2ObjectCount: 16,
          totalRevisionRows: 6,
        });
      },
    });

    await expect(run).resolves.toMatchObject({ cleanup: "verified" });
    expect(afterCaptures).toBe(2);
  });

  it("allows a lower eventually-consistent global R2 object delta", async () => {
    const { run } = runFixture(writableFixture(), {
      captureManifest: async ({ phase }) =>
        phase === "before"
          ? emptyManifest()
          : emptyManifest({
              fixtureDeletedCreationRows: 1,
              fixtureObjectBytes: 3_655,
              fixtureObjectRows: 8,
              fixtureR2ObjectBytes: 3_655,
              fixtureR2ObjectCount: 8,
              fixtureRevisionRows: 2,
              totalCreationRows: 4,
              totalObjectBytes: 16_000,
              totalObjectRows: 16,
              totalR2ObjectCount: 12,
              totalRevisionRows: 6,
            }),
    });

    await expect(run).resolves.toMatchObject({ cleanup: "verified" });
  });

  it("stops normal writes at the first failure but still performs cleanup", async () => {
    const fixture = writableFixture({ failAt: "read" });
    const { run } = runFixture(fixture);
    await expect(run).rejects.toThrow(
      "fixture read-back returned an unexpected status",
    );
    expect(fixture.seen.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "GET",
      "DELETE",
      "DELETE",
    ]);
  });

  it("never includes a server secret or response body in its failure", async () => {
    const secret = "whsec_must_never_appear";
    const fixture = writableFixture({ failAt: "read", leakText: secret });
    const { run } = runFixture(fixture);
    const error = await run.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HostedStagingWritableError);
    expect(String((error as Error).message)).not.toContain(secret);
    expect(String((error as Error).message)).not.toContain(CREATION_ID);
  });

  it("cleans the known UUID after a persisted create response is lost", async () => {
    const fixture = writableFixture({ throwAfterCreate: true });
    const { run } = runFixture(fixture, {
      captureManifest: async ({ phase }) =>
        phase === "before"
          ? emptyManifest()
          : emptyManifest({
              fixtureDeletedCreationRows: 1,
              fixtureObjectBytes: 3_655,
              fixtureObjectRows: 8,
              fixtureR2ObjectBytes: 3_655,
              fixtureR2ObjectCount: 8,
              fixtureRevisionRows: 2,
              totalCreationRows: 4,
              totalObjectBytes: 16_000,
              totalObjectRows: 16,
              totalR2ObjectCount: 16,
              totalRevisionRows: 6,
            }),
    });
    await expect(run).rejects.toThrow("fixture creation request failed");
    expect(fixture.seen.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "DELETE",
      "DELETE",
    ]);
  });

  it("finishes fixture cleanup and reconciliation when aborted after creation", async () => {
    const controller = new AbortController();
    const interruption = new Error("synthetic termination after create");
    const fixture = writableFixture();
    const phases: string[] = [];
    const abortingFixture = {
      ...fixture,
      fetchImpl: async (
        input: Parameters<AcceptanceFetch>[0],
        init?: Parameters<AcceptanceFetch>[1],
      ) => {
        const response = await fixture.fetchImpl(input, init);
        if (new Request(input, init).method === "POST") {
          controller.abort(interruption);
        }
        return response;
      },
    };
    const { run } = runFixture(abortingFixture, {
      abortSignal: controller.signal,
      captureManifest: async ({ phase }) => {
        phases.push(phase);
        return phase === "before"
          ? emptyManifest()
          : emptyManifest({
              fixtureDeletedCreationRows: 1,
              fixtureObjectBytes: 3_655,
              fixtureObjectRows: 8,
              fixtureR2ObjectBytes: 3_655,
              fixtureR2ObjectCount: 8,
              fixtureRevisionRows: 2,
              totalCreationRows: 4,
              totalObjectBytes: 16_000,
              totalObjectRows: 16,
              totalR2ObjectCount: 16,
              totalRevisionRows: 6,
            });
      },
    });

    await expect(run).rejects.toBe(interruption);
    expect(controller.signal.reason).toBe(interruption);
    expect(fixture.seen.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "DELETE",
      "DELETE",
    ]);
    expect(phases).toEqual(["before", "after"]);
  });

  it("waits through bounded not-found cleanup races before reconciling", async () => {
    const fixture = writableFixture({
      delayedDeleteMisses: 2,
      throwAfterCreate: true,
    });
    const { run } = runFixture(fixture, {
      cleanupRetryDelaysMs: [0, 0],
    });
    await expect(run).rejects.toThrow("fixture creation request failed");
    expect(fixture.seen.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "DELETE",
      "DELETE",
      "DELETE",
      "DELETE",
    ]);
  });

  it("reports a combined run and cleanup failure without leaking dependency details", async () => {
    const fixture = writableFixture({ failAt: "read", failDelete: true });
    const { run } = runFixture(fixture);
    await expect(run).rejects.toThrow(
      "failed and cleanup or reconciliation also failed",
    );
  });

  it("fails reconciliation when active fixture rows remain", async () => {
    const { run } = runFixture(writableFixture(), {
      captureManifest: async ({ phase }) =>
        phase === "before"
          ? emptyManifest()
          : emptyManifest({ fixtureActiveCreationRows: 1 }),
    });
    await expect(run).rejects.toThrow(
      "post-run manifest contains active fixture rows",
    );
  });

  it("rejects exact-prefix R2 count and byte ceilings", async () => {
    const { run } = runFixture(writableFixture(), {
      captureManifest: async ({ phase }) =>
        phase === "before"
          ? emptyManifest()
          : emptyManifest({
              fixtureDeletedCreationRows: 1,
              fixtureObjectBytes: 4 * 1_024 * 1_024 + 1,
              fixtureObjectRows: 17,
              fixtureR2ObjectBytes: 4 * 1_024 * 1_024 + 1,
              fixtureR2ObjectCount: 17,
              fixtureRevisionRows: 2,
              totalCreationRows: 4,
              totalObjectBytes: 12_345 + 4 * 1_024 * 1_024 + 1,
              totalObjectRows: 25,
              totalR2ObjectCount: 25,
              totalRevisionRows: 6,
            }),
    });
    await expect(run).rejects.toThrow("pending-cleanup object ceiling");
  });
});
