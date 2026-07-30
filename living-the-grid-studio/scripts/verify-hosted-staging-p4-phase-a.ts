import {
  canonicalizeGridDocument,
  type CanonicalGridDocument,
} from "../shared/community";
import type { BrowserMemoryIdentity } from "./verify-staging-live-auth";
import {
  readBoundedResponseText,
  type AcceptanceFetch,
} from "./verify-hosted-read-only";
import {
  parseHostedStagingWritableTarget,
  validateStagingDeploymentEvidence,
  type StagingDeploymentEvidence,
  type StagingFixtureManifest,
  type StagingManifestRequest,
} from "./verify-hosted-staging-writable";

type JsonObject = Record<string, unknown>;
type ActorSlot = "owner" | "second-user";
type RequestPhase = "scenario" | "cleanup";
type ResponseKind = "binary" | "envelope" | "json";

const STAGING_ORIGIN = "https://staging.tomodachi.pw";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const COMMIT_SHA = /^[0-9a-f]{40}$/iu;
const REVISION_ETAG = /^"rev-[1-9][0-9]*"$/u;
const USERNAME = /^[a-z0-9](?:[a-z0-9]|[-_](?=[a-z0-9])){1,22}[a-z0-9]$/u;
const DEFAULT_TIMEOUT_MS = 20_000;
const CLEANUP_ACTION_RETRY_DELAYS_MS = [500] as const;
const RECONCILIATION_RETRY_DELAYS_MS = [500, 2_000, 7_500, 20_000] as const;

export const FIXED_P4_PHASE_A_LIMITS = Object.freeze({
  maxComments: 1,
  maxCreations: 1,
  maxFixtureR2Bytes: 4 * 1_024 * 1_024,
  maxFollows: 1,
  maxLikes: 1,
  maxMutationAttempts: 40,
  maxPendingR2Objects: 16,
  maxReports: 0,
  maxRequests: 64,
  maxResponseBytes: 2 * 1_024 * 1_024,
  maxRevisions: 2,
  maxScenarioMutationAttempts: 30,
  maxScenarioRequests: 52,
  maxShowcaseImages: 0,
  maxSingleR2ObjectBytes: 2 * 1_024 * 1_024,
  requestBodyBytes: 128 * 1_024,
  routeOperations: 20,
});

export const P4_PHASE_A_COVERAGE = Object.freeze({
  covered: [
    "private owner-route denial",
    "private generated-media denial",
    "If-Match save and stale-revision conflict",
    "public and unlisted direct access",
    "public discovery/profile/search inclusion and unlisted exclusion",
    "project-download permission",
    "like and follow idempotency",
    "comment create/edit/delete and cross-author denial",
    "disabled comments",
    "moderation read-role boundary",
    "normal owner-API cleanup and exact D1/R2 reconciliation",
  ],
  intentionallyUncovered: [
    "offline browser retry and both conflict-resolution UI choices",
    "unlisted document noindex/canonical metadata",
    "tag feeds and cursor pagination",
    "moderator lock/unlock and reversible moderation transitions",
    "reports, duplicate-open limits, and report daily quota",
    "profile and showcase upload/replace/moderation/failure injection",
    "100-creation and 50-MiB quotas",
    "streaming account export",
  ],
});

export interface P4PhaseASocialManifest {
  commentAuthorUserId: string | null;
  commentState: "active" | "deleted" | "hidden" | null;
  creationOwnerUserId: string | null;
  creationState: "deleted" | "draft" | "hidden" | "published" | null;
  followCount: number;
  foreignKeyViolations: number;
  likeCount: number;
  moderationActionCount: number;
  reportCount: number;
  searchCount: number;
  showcaseImageCount: number;
}

export interface P4PhaseAManifestRequest {
  commentId: string | null;
  creationId: string;
  phase: "before" | "after";
}

export interface HostedStagingP4PhaseAOptions {
  abortSignal?: AbortSignal;
  captureCreationManifest(
    request: StagingManifestRequest,
  ): Promise<StagingFixtureManifest>;
  captureSocialManifest(
    request: P4PhaseAManifestRequest,
  ): Promise<P4PhaseASocialManifest>;
  expectedOwnerUserId: string;
  expectedSecondUserId: string;
  expectedSourceCommit: string;
  expectedWorkerVersion: string;
  identities: readonly [BrowserMemoryIdentity, BrowserMemoryIdentity];
  runId: string;
  timeoutMs?: number;
  unsafeAllowLoopbackFixture?: boolean;
  verifyDeployment(): Promise<StagingDeploymentEvidence>;
}

export interface HostedStagingP4PhaseAResult {
  assertions: number;
  cleanup: "verified";
  coveredScenarios: readonly string[];
  manifests: {
    creationAfter: StagingFixtureManifest;
    creationBefore: StagingFixtureManifest;
    socialAfter: P4PhaseASocialManifest;
    socialBefore: P4PhaseASocialManifest;
  };
  mutationAttempts: number;
  requests: number;
  sourceCommit: string;
  target: typeof STAGING_ORIGIN;
  workerVersion: string;
}

export interface P4PhaseARequestPolicyState {
  commentId: string | null;
  creationId: string;
  etags: string[];
  fixtureName: string;
  ownerUsername: string | null;
  searchToken: string;
  secondUsername: string | null;
  slug: string | null;
}

interface RunCounters {
  mutationAttempts: number;
  requests: number;
}

interface ExpectedResponse {
  errorCode?: string;
  kind?: ResponseKind;
  label: string;
  phase?: RequestPhase;
  statuses: readonly number[];
}

interface ParsedResponse {
  body: JsonObject | Uint8Array;
  response: Response;
}

export class HostedStagingP4PhaseAError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedStagingP4PhaseAError";
  }
}

class P4PhaseARequestError extends HostedStagingP4PhaseAError {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "P4PhaseARequestError";
  }
}

export async function runHostedStagingP4PhaseA(
  options: HostedStagingP4PhaseAOptions,
): Promise<HostedStagingP4PhaseAResult> {
  options.abortSignal?.throwIfAborted();
  const target = parseHostedStagingWritableTarget(STAGING_ORIGIN, {
    allowLoopback: options.unsafeAllowLoopbackFixture === true,
  });
  validateRunInputs(options);
  const timeoutMs = validateTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const evidence = await externalStep(
    options.verifyDeployment,
    "Deployment evidence could not be verified safely.",
  );
  options.abortSignal?.throwIfAborted();
  validateStagingDeploymentEvidence(evidence, {
    origin: target.origin,
    sourceCommit: options.expectedSourceCommit,
    workerVersion: options.expectedWorkerVersion,
  });

  const owner = identityForSlot(options.identities, "owner");
  const secondUser = identityForSlot(options.identities, "second-user");
  if (
    owner.internalUserId.toLowerCase() !==
      options.expectedOwnerUserId.toLowerCase() ||
    secondUser.internalUserId.toLowerCase() !==
      options.expectedSecondUserId.toLowerCase() ||
    owner.role !== "admin" ||
    secondUser.role !== "user"
  ) {
    throw new HostedStagingP4PhaseAError(
      "The in-memory sessions do not match the approved admin owner and ordinary second user.",
    );
  }

  const searchToken = `p4a${options.runId.replaceAll("-", "").slice(0, 12)}`;
  const fixtureName = `P4 phase A ${searchToken}`;
  const state: P4PhaseARequestPolicyState = {
    commentId: null,
    creationId: options.runId.toLowerCase(),
    etags: [],
    fixtureName,
    ownerUsername: null,
    searchToken,
    secondUsername: null,
    slug: null,
  };
  const counters: RunCounters = { mutationAttempts: 0, requests: 0 };
  let assertions = 0;
  const expect = (condition: boolean, label: string): void => {
    assertions += 1;
    if (!condition) throw new HostedStagingP4PhaseAError(label);
  };

  const creationBefore = validateCreationManifest(
    await externalStep(
      () =>
        options.captureCreationManifest({
          phase: "before",
          trackedCreationIds: [state.creationId],
        }),
      "The pre-run creation manifest could not be captured safely.",
    ),
  );
  const socialBefore = validateSocialManifest(
    await externalStep(
      () =>
        options.captureSocialManifest({
          commentId: null,
          creationId: state.creationId,
          phase: "before",
        }),
      "The pre-run social manifest could not be captured safely.",
    ),
  );
  options.abortSignal?.throwIfAborted();
  expect(
    creationBefore.fixtureActiveCreationRows === 0 &&
      creationBefore.fixtureDeletedCreationRows === 0 &&
      creationBefore.fixtureObjectRows === 0 &&
      creationBefore.fixtureRevisionRows === 0 &&
      creationBefore.fixtureR2ObjectCount === 0,
    "The approved creation fixture scope is not empty before the run.",
  );
  expect(
    socialBefore.creationState === null &&
      socialBefore.commentState === null &&
      socialBefore.likeCount === 0 &&
      socialBefore.followCount === 0 &&
      socialBefore.reportCount === 0 &&
      socialBefore.moderationActionCount === 0 &&
      socialBefore.showcaseImageCount === 0 &&
      socialBefore.searchCount === 0 &&
      socialBefore.foreignKeyViolations === 0,
    "The approved social fixture scope is not empty before the run.",
  );

  let creationAttempted = false;
  let commentAttempted = false;
  let runFailure: unknown;
  const unresolvedCleanupFailures: unknown[] = [];
  let creationAfter: StagingFixtureManifest | null = null;
  let socialAfter: P4PhaseASocialManifest | null = null;

  try {
    const ownerSession = await envelopeRequest(
      owner,
      target,
      "/api/auth/session",
      { headers: { Accept: "application/json" } },
      state,
      counters,
      options,
      timeoutMs,
      { label: "owner session", statuses: [200] },
    );
    const secondSession = await envelopeRequest(
      secondUser,
      target,
      "/api/auth/session",
      { headers: { Accept: "application/json" } },
      state,
      counters,
      options,
      timeoutMs,
      { label: "second-user session", statuses: [200] },
    );
    const ownerUser = sessionUser(ownerSession.body, "Owner session");
    const secondSessionUser = sessionUser(
      secondSession.body,
      "Second-user session",
    );
    state.ownerUsername = usernameFrom(ownerUser, "owner");
    state.secondUsername = usernameFrom(secondSessionUser, "second user");
    expect(
      ownerUser.id === options.expectedOwnerUserId &&
        ownerUser.role === "admin",
      "The owner session is not the approved admin.",
    );
    expect(
      secondSessionUser.id === options.expectedSecondUserId &&
        secondSessionUser.role === "user",
      "The second-user session is not the approved ordinary user.",
    );

    creationAttempted = true;
    const created = await envelopeRequest(
      secondUser,
      target,
      "/api/creations",
      jsonMutation(target.origin, "POST", {
        id: state.creationId,
        project: fixtureProject(fixtureName, 1),
        title: fixtureName,
      }),
      state,
      counters,
      options,
      timeoutMs,
      { label: "private fixture creation", statuses: [201] },
    );
    const createdData = dataObject(created.body, "Created creation");
    expect(
      createdData.id === state.creationId &&
        createdData.state === "draft" &&
        createdData.visibility === "private",
      "The private fixture was not created in the approved state.",
    );
    state.slug = stringField(createdData, "slug", "Created creation");
    const firstEtag = responseEtag(created.response);
    state.etags.push(firstEtag);
    expect(firstEtag === '"rev-1"', "The first revision ETag is not rev-1.");

    const readBack = await envelopeRequest(
      secondUser,
      target,
      `/api/creations/${state.creationId}`,
      { headers: { Accept: "application/json" } },
      state,
      counters,
      options,
      timeoutMs,
      { label: "second-user private read", statuses: [200] },
    );
    expect(
      dataObject(readBack.body, "Private read").creation instanceof Object,
      "The second user could not read the owned private fixture.",
    );

    for (const denial of [
      {
        expected: { errorCode: "FORBIDDEN", status: 403 },
        init: jsonMutation(target.origin, "PATCH", { title: fixtureName }),
        label: "cross-user creation update",
        path: `/api/creations/${state.creationId}`,
      },
      {
        expected: { errorCode: "FORBIDDEN", status: 403 },
        init: jsonMutation(
          target.origin,
          "PUT",
          { project: fixtureProject(fixtureName, 2) },
          { "If-Match": firstEtag },
        ),
        label: "cross-user project save",
        path: `/api/creations/${state.creationId}/project`,
      },
      {
        expected: { errorCode: "FORBIDDEN", status: 403 },
        init: jsonMutation(target.origin, "DELETE", {}),
        label: "cross-user creation delete",
        path: `/api/creations/${state.creationId}`,
      },
      {
        expected: { errorCode: "FORBIDDEN", status: 403 },
        init: jsonMutation(target.origin, "POST", publishBody(state, "public")),
        label: "cross-user publish",
        path: `/api/creations/${state.creationId}/publish`,
      },
      {
        expected: { errorCode: "FORBIDDEN", status: 403 },
        init: jsonMutation(target.origin, "POST", {
          altText: `${fixtureName} denied upload`,
          byteSize: 1,
          contentType: "image/png",
        }),
        label: "cross-user showcase upload ticket",
        path: `/api/creations/${state.creationId}/images/uploads`,
      },
    ] as const) {
      await envelopeRequest(
        owner,
        target,
        denial.path,
        denial.init,
        state,
        counters,
        options,
        timeoutMs,
        {
          errorCode: denial.expected.errorCode,
          label: denial.label,
          statuses: [denial.expected.status],
        },
      );
    }
    await envelopeRequest(
      owner,
      target,
      `/api/creations/${state.creationId}`,
      { headers: { Accept: "application/json" } },
      state,
      counters,
      options,
      timeoutMs,
      {
        errorCode: "FORBIDDEN",
        label: "cross-user private read",
        statuses: [403],
      },
    );
    for (const variant of ["project", "preview"] as const) {
      await envelopeRequest(
        owner,
        target,
        `/api/creations/${state.creationId}/media/${variant}`,
        { headers: { Accept: "*/*" } },
        state,
        counters,
        options,
        timeoutMs,
        {
          errorCode: "NOT_FOUND",
          label: `cross-user private ${variant} read`,
          statuses: [404],
        },
      );
    }

    const saved = await envelopeRequest(
      secondUser,
      target,
      `/api/creations/${state.creationId}/project`,
      jsonMutation(
        target.origin,
        "PUT",
        { project: fixtureProject(fixtureName, 2) },
        { "If-Match": firstEtag },
      ),
      state,
      counters,
      options,
      timeoutMs,
      { label: "second revision save", statuses: [200] },
    );
    const secondEtag = responseEtag(saved.response);
    state.etags.push(secondEtag);
    expect(
      secondEtag === '"rev-2"',
      "The second project save did not return rev-2.",
    );
    const conflict = await envelopeRequest(
      secondUser,
      target,
      `/api/creations/${state.creationId}/project`,
      jsonMutation(
        target.origin,
        "PUT",
        { project: fixtureProject(fixtureName, 3) },
        { "If-Match": firstEtag },
      ),
      state,
      counters,
      options,
      timeoutMs,
      {
        errorCode: "REVISION_CONFLICT",
        label: "stale project save",
        statuses: [409],
      },
    );
    const conflictError = errorObject(conflict.body, "Revision conflict");
    expect(
      conflictError.currentEtag === secondEtag,
      "The conflict response did not identify the current revision.",
    );

    await envelopeRequest(
      secondUser,
      target,
      `/api/creations/${state.creationId}/publish`,
      jsonMutation(target.origin, "POST", publishBody(state, "public")),
      state,
      counters,
      options,
      timeoutMs,
      { label: "public publish", statuses: [200] },
    );
    await assertVisibility(
      owner,
      target,
      state,
      counters,
      options,
      timeoutMs,
      true,
    );
    await binaryRequest(
      owner,
      target,
      `/api/creations/${state.creationId}/media/preview`,
      { headers: { Accept: "image/webp" } },
      state,
      counters,
      options,
      timeoutMs,
      { kind: "binary", label: "public preview", statuses: [200] },
    );
    await envelopeRequest(
      owner,
      target,
      `/api/creations/${state.creationId}/media/project`,
      { headers: { Accept: "application/json" } },
      state,
      counters,
      options,
      timeoutMs,
      {
        errorCode: "NOT_FOUND",
        label: "download-disabled project",
        statuses: [404],
      },
    );

    await assertIdempotentToggle({
      actor: owner,
      counters,
      disablePath: `/api/creations/${state.creationId}/like`,
      enabledField: "liked",
      enablePath: `/api/creations/${state.creationId}/like`,
      label: "like",
      options,
      state,
      target,
      timeoutMs,
    });
    await assertIdempotentToggle({
      actor: owner,
      counters,
      disablePath: `/api/users/${state.secondUsername}/follow`,
      enabledField: "following",
      enablePath: `/api/users/${state.secondUsername}/follow`,
      label: "follow",
      options,
      state,
      target,
      timeoutMs,
    });

    commentAttempted = true;
    const comment = await envelopeRequest(
      owner,
      target,
      `/api/creations/${state.creationId}/comments`,
      jsonMutation(target.origin, "POST", {
        body: `${fixtureName} synthetic comment`,
      }),
      state,
      counters,
      options,
      timeoutMs,
      { label: "comment create", statuses: [201] },
    );
    state.commentId = stringField(
      dataObject(comment.body, "Created comment"),
      "id",
      "Created comment",
    );
    for (const method of ["PATCH", "DELETE"] as const) {
      await envelopeRequest(
        secondUser,
        target,
        `/api/comments/${state.commentId}`,
        jsonMutation(
          target.origin,
          method,
          method === "PATCH"
            ? { body: `${fixtureName} denied comment edit` }
            : {},
        ),
        state,
        counters,
        options,
        timeoutMs,
        {
          errorCode: "FORBIDDEN",
          label: `cross-author comment ${method.toLowerCase()}`,
          statuses: [403],
        },
      );
    }
    await envelopeRequest(
      owner,
      target,
      `/api/comments/${state.commentId}`,
      jsonMutation(target.origin, "PATCH", {
        body: `${fixtureName} synthetic comment edited`,
      }),
      state,
      counters,
      options,
      timeoutMs,
      { label: "comment edit", statuses: [200] },
    );
    await envelopeRequest(
      owner,
      target,
      `/api/comments/${state.commentId}`,
      jsonMutation(target.origin, "DELETE", {}),
      state,
      counters,
      options,
      timeoutMs,
      { label: "comment delete", statuses: [200] },
    );
    commentAttempted = false;

    await envelopeRequest(
      secondUser,
      target,
      `/api/creations/${state.creationId}`,
      jsonMutation(target.origin, "PATCH", { commentsEnabled: false }),
      state,
      counters,
      options,
      timeoutMs,
      { label: "disable comments", statuses: [200] },
    );
    await envelopeRequest(
      owner,
      target,
      `/api/creations/${state.creationId}/comments`,
      jsonMutation(target.origin, "POST", {
        body: `${fixtureName} blocked comment`,
      }),
      state,
      counters,
      options,
      timeoutMs,
      {
        errorCode: "COMMENTS_DISABLED",
        label: "disabled comment denial",
        statuses: [409],
      },
    );

    await envelopeRequest(
      secondUser,
      target,
      `/api/creations/${state.creationId}/publish`,
      jsonMutation(target.origin, "POST", publishBody(state, "unlisted")),
      state,
      counters,
      options,
      timeoutMs,
      { label: "unlisted publish", statuses: [200] },
    );
    await assertVisibility(
      owner,
      target,
      state,
      counters,
      options,
      timeoutMs,
      false,
    );
    const projectDownload = await jsonRequest(
      owner,
      target,
      `/api/creations/${state.creationId}/media/project`,
      { headers: { Accept: "application/json" } },
      state,
      counters,
      options,
      timeoutMs,
      { kind: "json", label: "enabled project download", statuses: [200] },
    );
    expect(
      objectBody(projectDownload.body, "Project download").version === 1,
      "The enabled project download is not a canonical v1 document.",
    );

    await envelopeRequest(
      secondUser,
      target,
      `/api/creations/${state.creationId}/unpublish`,
      jsonMutation(target.origin, "POST", {}),
      state,
      counters,
      options,
      timeoutMs,
      { label: "unpublish", statuses: [200] },
    );
    await envelopeRequest(
      owner,
      target,
      `/api/creations/slug/${state.slug}`,
      { headers: { Accept: "application/json" } },
      state,
      counters,
      options,
      timeoutMs,
      {
        errorCode: "NOT_FOUND",
        label: "unpublished direct-access denial",
        statuses: [404],
      },
    );
    await envelopeRequest(
      secondUser,
      target,
      "/api/moderation/stats",
      { headers: { Accept: "application/json" } },
      state,
      counters,
      options,
      timeoutMs,
      {
        errorCode: "FORBIDDEN",
        label: "ordinary-user moderation denial",
        statuses: [403],
      },
    );
    await envelopeRequest(
      owner,
      target,
      "/api/moderation/stats",
      { headers: { Accept: "application/json" } },
      state,
      counters,
      options,
      timeoutMs,
      { label: "admin moderation read", statuses: [200] },
    );
  } catch (error) {
    runFailure = error;
  } finally {
    try {
      await cleanupPhaseAFixture({
        commentAttempted,
        counters,
        creationAttempted,
        identities: { owner, secondUser },
        options,
        state,
        target,
        timeoutMs,
      });
    } catch (error) {
      unresolvedCleanupFailures.push(...flattenAggregateErrors(error));
    }
    let reconciliationFailure: unknown;
    for (
      let attempt = 0;
      attempt <= RECONCILIATION_RETRY_DELAYS_MS.length;
      attempt += 1
    ) {
      if (attempt > 0) {
        await delay(RECONCILIATION_RETRY_DELAYS_MS[attempt - 1] ?? 0);
      }
      try {
        creationAfter = validateCreationManifest(
          await externalStep(
            () =>
              options.captureCreationManifest({
                phase: "after",
                trackedCreationIds: [state.creationId],
              }),
            "The post-run creation manifest could not be captured safely.",
          ),
        );
        socialAfter = validateSocialManifest(
          await externalStep(
            () =>
              options.captureSocialManifest({
                commentId: state.commentId,
                creationId: state.creationId,
                phase: "after",
              }),
            "The post-run social manifest could not be captured safely.",
          ),
        );
        assertCleanupManifests(
          creationBefore,
          creationAfter,
          socialBefore,
          socialAfter,
          options.expectedSecondUserId,
          state.commentId,
          expect,
        );
        reconciliationFailure = undefined;
        break;
      } catch (error) {
        reconciliationFailure = error;
      }
    }
    if (reconciliationFailure !== undefined) {
      unresolvedCleanupFailures.push(reconciliationFailure);
    }
  }

  if (options.abortSignal?.aborted && runFailure === undefined) {
    runFailure = options.abortSignal.reason;
  }
  if (runFailure && unresolvedCleanupFailures.length > 0) {
    throw new AggregateError(
      [runFailure, ...unresolvedCleanupFailures],
      `P4 phase A failed and cleanup or reconciliation left ${unresolvedCleanupFailures.length} unresolved failure(s).`,
    );
  }
  if (runFailure) {
    options.abortSignal?.throwIfAborted();
    throw sanitizeFailure(
      runFailure,
      "P4 phase A stopped at its first failed assertion.",
    );
  }
  if (unresolvedCleanupFailures.length > 0 || !creationAfter || !socialAfter) {
    if (!creationAfter || !socialAfter) {
      unresolvedCleanupFailures.push(
        new HostedStagingP4PhaseAError(
          "P4 phase A reconciliation did not produce both bounded manifests.",
        ),
      );
    }
    throw new AggregateError(
      unresolvedCleanupFailures,
      `P4 phase A cleanup or reconciliation left ${unresolvedCleanupFailures.length} unresolved failure(s).`,
    );
  }
  expect(
    counters.requests <= FIXED_P4_PHASE_A_LIMITS.maxRequests &&
      counters.mutationAttempts <= FIXED_P4_PHASE_A_LIMITS.maxMutationAttempts,
    "P4 phase A exceeded its total request ceilings.",
  );

  return {
    assertions,
    cleanup: "verified",
    coveredScenarios: P4_PHASE_A_COVERAGE.covered,
    manifests: {
      creationAfter,
      creationBefore,
      socialAfter,
      socialBefore,
    },
    mutationAttempts: counters.mutationAttempts,
    requests: counters.requests,
    sourceCommit: evidence.sourceCommit.toLowerCase(),
    target: STAGING_ORIGIN,
    workerVersion: evidence.workerVersion.toLowerCase(),
  };
}

export function assertP4PhaseARequestAllowed(
  actor: ActorSlot,
  target: URL,
  relativePath: string,
  init: RequestInit,
  state: P4PhaseARequestPolicyState,
): URL {
  if (!relativePath.startsWith("/") || relativePath.startsWith("//")) {
    throw new HostedStagingP4PhaseAError(
      "P4 requests must use a site-relative absolute path.",
    );
  }
  const url = new URL(relativePath, target);
  if (
    url.origin !== target.origin ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new HostedStagingP4PhaseAError(
      "P4 requests must remain on the exact approved staging origin.",
    );
  }
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (headers.has("authorization") || headers.has("cookie")) {
    throw new HostedStagingP4PhaseAError(
      "Authentication material must remain in the browser-memory adapter.",
    );
  }
  const allowedHeaderNames = new Set([
    "accept",
    "content-type",
    "if-match",
    "origin",
    "user-agent",
  ]);
  for (const name of headers.keys()) {
    if (!allowedHeaderNames.has(name)) {
      throw new HostedStagingP4PhaseAError(
        "A request header is outside the P4 phase A allowlist.",
      );
    }
  }

  const creation = `/api/creations/${state.creationId}`;
  const allowed = new Set<string>([
    `${actor}:GET:/api/auth/session`,
    `second-user:POST:/api/creations`,
    `owner:GET:${creation}`,
    `owner:PATCH:${creation}`,
    `owner:DELETE:${creation}`,
    `second-user:GET:${creation}`,
    `second-user:PATCH:${creation}`,
    `second-user:DELETE:${creation}`,
    `owner:PUT:${creation}/project`,
    `second-user:PUT:${creation}/project`,
    `owner:POST:${creation}/publish`,
    `second-user:POST:${creation}/publish`,
    `second-user:POST:${creation}/unpublish`,
    `owner:POST:${creation}/images/uploads`,
    `owner:GET:${creation}/media/project`,
    `owner:GET:${creation}/media/preview`,
    `owner:PUT:${creation}/like`,
    `owner:DELETE:${creation}/like`,
    `owner:GET:${creation}/comments`,
    `owner:POST:${creation}/comments`,
    "owner:GET:/api/moderation/stats",
    "second-user:GET:/api/moderation/stats",
  ]);
  if (state.slug) {
    allowed.add(`owner:GET:/api/creations/slug/${state.slug}`);
  }
  if (state.secondUsername) {
    allowed.add(
      `owner:GET:/api/users/${state.secondUsername}/creations?limit=50`,
    );
  }
  if (state.secondUsername) {
    allowed.add(`owner:PUT:/api/users/${state.secondUsername}/follow`);
    allowed.add(`owner:DELETE:/api/users/${state.secondUsername}/follow`);
  }
  if (state.commentId) {
    allowed.add(`owner:PATCH:/api/comments/${state.commentId}`);
    allowed.add(`owner:DELETE:/api/comments/${state.commentId}`);
    allowed.add(`second-user:PATCH:/api/comments/${state.commentId}`);
    allowed.add(`second-user:DELETE:/api/comments/${state.commentId}`);
  }
  allowed.add("owner:GET:/api/discover/recent?limit=50");
  allowed.add(
    `owner:GET:/api/search?q=${encodeURIComponent(state.searchToken)}&limit=50`,
  );

  const routeKey = `${actor}:${method}:${url.pathname}${url.search}`;
  if (!allowed.has(routeKey)) {
    throw new HostedStagingP4PhaseAError(
      "The route, method, actor, query, or object ID is outside P4 phase A.",
    );
  }
  if (method === "GET" || method === "HEAD") {
    if (
      headers.has("content-type") ||
      headers.has("origin") ||
      headers.has("if-match") ||
      init.body !== undefined
    ) {
      throw new HostedStagingP4PhaseAError(
        "P4 read requests cannot carry mutation headers or bodies.",
      );
    }
    return url;
  }
  if (
    headers.get("origin") !== target.origin ||
    headers.get("content-type")?.toLowerCase() !== "application/json" ||
    typeof init.body !== "string"
  ) {
    throw new HostedStagingP4PhaseAError(
      "Every P4 mutation requires exact-Origin bounded JSON.",
    );
  }
  if (
    new TextEncoder().encode(init.body).byteLength >
    FIXED_P4_PHASE_A_LIMITS.requestBodyBytes
  ) {
    throw new HostedStagingP4PhaseAError(
      "A P4 mutation body exceeds its fixed byte ceiling.",
    );
  }
  const body = objectBody(parseJson(init.body), "P4 request body");
  assertFixtureBody(method, url.pathname, body, headers, state);
  return url;
}

function assertFixtureBody(
  method: string,
  pathname: string,
  body: JsonObject,
  headers: Headers,
  state: P4PhaseARequestPolicyState,
): void {
  const creation = `/api/creations/${state.creationId}`;
  if (method === "POST" && pathname === "/api/creations") {
    exactKeys(body, ["id", "project", "title"], "creation fixture");
    if (body.id !== state.creationId || body.title !== state.fixtureName) {
      throw new HostedStagingP4PhaseAError(
        "The creation request is not bound to this fixture run.",
      );
    }
    assertProject(body.project, state.fixtureName);
    return;
  }
  if (method === "PUT" && pathname === `${creation}/project`) {
    exactKeys(body, ["project"], "project save");
    assertProject(body.project, state.fixtureName);
    const ifMatch = headers.get("if-match") ?? "";
    if (!state.etags.includes(ifMatch)) {
      throw new HostedStagingP4PhaseAError(
        "A project save must use an ETag observed in this fixture run.",
      );
    }
    return;
  }
  if (method === "PATCH" && pathname === creation) {
    const keys = Object.keys(body);
    if (
      keys.length !== 1 ||
      !["commentsEnabled", "title"].includes(keys[0] ?? "") ||
      (keys[0] === "commentsEnabled" && body.commentsEnabled !== false) ||
      (keys[0] === "title" && body.title !== state.fixtureName)
    ) {
      throw new HostedStagingP4PhaseAError(
        "The creation update is outside the fixed fixture schema.",
      );
    }
    return;
  }
  if (method === "POST" && pathname === `${creation}/publish`) {
    exactKeys(
      body,
      [
        "commentsEnabled",
        "description",
        "projectDownloadEnabled",
        "tags",
        "title",
        "visibility",
      ],
      "publish fixture",
    );
    if (
      body.title !== state.fixtureName ||
      body.description !== `${state.fixtureName} description` ||
      !Array.isArray(body.tags) ||
      body.tags.length !== 0 ||
      !["public", "unlisted"].includes(String(body.visibility))
    ) {
      throw new HostedStagingP4PhaseAError(
        "The publish request is outside the fixed fixture schema.",
      );
    }
    return;
  }
  if (method === "POST" && pathname === `${creation}/images/uploads`) {
    exactKeys(
      body,
      ["altText", "byteSize", "contentType"],
      "denied image ticket",
    );
    if (
      body.altText !== `${state.fixtureName} denied upload` ||
      body.byteSize !== 1 ||
      body.contentType !== "image/png"
    ) {
      throw new HostedStagingP4PhaseAError(
        "The denied upload ticket is outside the fixed fixture schema.",
      );
    }
    return;
  }
  if (
    pathname === `${creation}/like` ||
    pathname === `${creation}/unpublish` ||
    pathname === creation ||
    (state.secondUsername &&
      pathname === `/api/users/${state.secondUsername}/follow`) ||
    (state.commentId &&
      pathname === `/api/comments/${state.commentId}` &&
      method === "DELETE")
  ) {
    exactKeys(body, [], "empty mutation");
    return;
  }
  if (
    pathname === `${creation}/comments` ||
    (state.commentId && pathname === `/api/comments/${state.commentId}`)
  ) {
    exactKeys(body, ["body"], "comment fixture");
    if (
      typeof body.body !== "string" ||
      !body.body.startsWith(state.fixtureName)
    ) {
      throw new HostedStagingP4PhaseAError(
        "The comment request is not bound to this fixture run.",
      );
    }
    return;
  }
  throw new HostedStagingP4PhaseAError(
    "The mutation body has no P4 phase A schema.",
  );
}

async function assertVisibility(
  actor: BrowserMemoryIdentity,
  target: URL,
  state: P4PhaseARequestPolicyState,
  counters: RunCounters,
  options: HostedStagingP4PhaseAOptions,
  timeoutMs: number,
  shouldBePublic: boolean,
): Promise<void> {
  if (!state.slug || !state.secondUsername) {
    throw new HostedStagingP4PhaseAError(
      "Visibility checks require the fixture slug and username.",
    );
  }
  const direct = await envelopeRequest(
    actor,
    target,
    `/api/creations/slug/${state.slug}`,
    { headers: { Accept: "application/json" } },
    state,
    counters,
    options,
    timeoutMs,
    { label: "direct creation access", statuses: [200] },
  );
  if (dataObject(direct.body, "Direct creation").id !== state.creationId) {
    throw new HostedStagingP4PhaseAError(
      "Direct access returned another creation.",
    );
  }
  for (const check of [
    {
      label: "profile creations",
      path: `/api/users/${state.secondUsername}/creations?limit=50`,
    },
    { label: "recent discovery", path: "/api/discover/recent?limit=50" },
    {
      label: "search",
      path: `/api/search?q=${encodeURIComponent(state.searchToken)}&limit=50`,
    },
  ]) {
    const response = await envelopeRequest(
      actor,
      target,
      check.path,
      { headers: { Accept: "application/json" } },
      state,
      counters,
      options,
      timeoutMs,
      { label: check.label, statuses: [200] },
    );
    const listed = dataArray(response.body, check.label).some(
      (item) => isJsonObject(item) && item.id === state.creationId,
    );
    if (listed !== shouldBePublic) {
      throw new HostedStagingP4PhaseAError(
        `${check.label} did not enforce public-only visibility.`,
      );
    }
  }
}

async function assertIdempotentToggle(input: {
  actor: BrowserMemoryIdentity;
  counters: RunCounters;
  disablePath: string;
  enabledField: "following" | "liked";
  enablePath: string;
  label: string;
  options: HostedStagingP4PhaseAOptions;
  state: P4PhaseARequestPolicyState;
  target: URL;
  timeoutMs: number;
}): Promise<void> {
  for (const expectedChanged of [true, false]) {
    const enabled = await envelopeRequest(
      input.actor,
      input.target,
      input.enablePath,
      jsonMutation(input.target.origin, "PUT", {}),
      input.state,
      input.counters,
      input.options,
      input.timeoutMs,
      { label: `${input.label} enable`, statuses: [200] },
    );
    const data = dataObject(enabled.body, `${input.label} enable`);
    if (data[input.enabledField] !== true || data.changed !== expectedChanged) {
      throw new HostedStagingP4PhaseAError(
        `${input.label} enable was not idempotent.`,
      );
    }
  }
  for (const expectedChanged of [true, false]) {
    const disabled = await envelopeRequest(
      input.actor,
      input.target,
      input.disablePath,
      jsonMutation(input.target.origin, "DELETE", {}),
      input.state,
      input.counters,
      input.options,
      input.timeoutMs,
      { label: `${input.label} disable`, statuses: [200] },
    );
    const data = dataObject(disabled.body, `${input.label} disable`);
    if (
      data[input.enabledField] !== false ||
      data.changed !== expectedChanged
    ) {
      throw new HostedStagingP4PhaseAError(
        `${input.label} disable was not idempotent.`,
      );
    }
  }
}

async function cleanupPhaseAFixture(input: {
  commentAttempted: boolean;
  counters: RunCounters;
  creationAttempted: boolean;
  identities: {
    owner: BrowserMemoryIdentity;
    secondUser: BrowserMemoryIdentity;
  };
  options: HostedStagingP4PhaseAOptions;
  state: P4PhaseARequestPolicyState;
  target: URL;
  timeoutMs: number;
}): Promise<void> {
  const failures: unknown[] = [];
  const attempt = async (operation: () => Promise<unknown>): Promise<void> => {
    try {
      await retryCleanupAction(operation);
    } catch (error) {
      failures.push(error);
    }
  };

  if (input.commentAttempted && input.state.commentId) {
    await attempt(() =>
      envelopeRequest(
        input.identities.owner,
        input.target,
        `/api/comments/${input.state.commentId}`,
        jsonMutation(input.target.origin, "DELETE", {}),
        input.state,
        input.counters,
        input.options,
        input.timeoutMs,
        {
          label: "comment cleanup",
          phase: "cleanup",
          statuses: [200, 404],
        },
      ),
    );
  }
  if (input.state.secondUsername) {
    await attempt(() =>
      envelopeRequest(
        input.identities.owner,
        input.target,
        `/api/users/${input.state.secondUsername}/follow`,
        jsonMutation(input.target.origin, "DELETE", {}),
        input.state,
        input.counters,
        input.options,
        input.timeoutMs,
        {
          label: "follow cleanup",
          phase: "cleanup",
          statuses: [200],
        },
      ),
    );
  }
  if (input.creationAttempted) {
    await attempt(() =>
      envelopeRequest(
        input.identities.owner,
        input.target,
        `/api/creations/${input.state.creationId}/like`,
        jsonMutation(input.target.origin, "DELETE", {}),
        input.state,
        input.counters,
        input.options,
        input.timeoutMs,
        { label: "like cleanup", phase: "cleanup", statuses: [200] },
      ),
    );
    await attempt(() =>
      envelopeRequest(
        input.identities.secondUser,
        input.target,
        `/api/creations/${input.state.creationId}/unpublish`,
        jsonMutation(input.target.origin, "POST", {}),
        input.state,
        input.counters,
        input.options,
        input.timeoutMs,
        {
          label: "unpublish cleanup",
          phase: "cleanup",
          statuses: [200, 404],
        },
      ),
    );
    await attempt(() =>
      envelopeRequest(
        input.identities.secondUser,
        input.target,
        `/api/creations/${input.state.creationId}`,
        jsonMutation(input.target.origin, "DELETE", {}),
        input.state,
        input.counters,
        input.options,
        input.timeoutMs,
        {
          label: "creation cleanup",
          phase: "cleanup",
          statuses: [200, 404],
        },
      ),
    );
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `P4 phase A cleanup left ${failures.length} unresolved action failure(s).`,
    );
  }
}

async function retryCleanupAction<T>(operation: () => Promise<T>): Promise<T> {
  for (
    let attempt = 0;
    attempt <= CLEANUP_ACTION_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    try {
      return await operation();
    } catch (error) {
      if (
        !(error instanceof P4PhaseARequestError) ||
        !error.retryable ||
        attempt === CLEANUP_ACTION_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }
      await delay(CLEANUP_ACTION_RETRY_DELAYS_MS[attempt] ?? 0);
    }
  }
  throw new HostedStagingP4PhaseAError(
    "A cleanup action exhausted its bounded retry loop.",
  );
}

async function envelopeRequest(
  actor: BrowserMemoryIdentity,
  target: URL,
  pathname: string,
  init: RequestInit,
  state: P4PhaseARequestPolicyState,
  counters: RunCounters,
  options: HostedStagingP4PhaseAOptions,
  timeoutMs: number,
  expected: ExpectedResponse,
): Promise<{ body: JsonObject; response: Response }> {
  const parsed = await performRequest(
    actor,
    target,
    pathname,
    init,
    state,
    counters,
    options,
    timeoutMs,
    { ...expected, kind: "envelope" },
  );
  return {
    body: objectBody(parsed.body, expected.label),
    response: parsed.response,
  };
}

async function jsonRequest(
  actor: BrowserMemoryIdentity,
  target: URL,
  pathname: string,
  init: RequestInit,
  state: P4PhaseARequestPolicyState,
  counters: RunCounters,
  options: HostedStagingP4PhaseAOptions,
  timeoutMs: number,
  expected: ExpectedResponse,
): Promise<{ body: JsonObject; response: Response }> {
  const parsed = await performRequest(
    actor,
    target,
    pathname,
    init,
    state,
    counters,
    options,
    timeoutMs,
    { ...expected, kind: "json" },
  );
  return {
    body: objectBody(parsed.body, expected.label),
    response: parsed.response,
  };
}

async function binaryRequest(
  actor: BrowserMemoryIdentity,
  target: URL,
  pathname: string,
  init: RequestInit,
  state: P4PhaseARequestPolicyState,
  counters: RunCounters,
  options: HostedStagingP4PhaseAOptions,
  timeoutMs: number,
  expected: ExpectedResponse,
): Promise<ParsedResponse> {
  return performRequest(
    actor,
    target,
    pathname,
    init,
    state,
    counters,
    options,
    timeoutMs,
    { ...expected, kind: "binary" },
  );
}

async function performRequest(
  actor: BrowserMemoryIdentity,
  target: URL,
  pathname: string,
  init: RequestInit,
  state: P4PhaseARequestPolicyState,
  counters: RunCounters,
  options: HostedStagingP4PhaseAOptions,
  timeoutMs: number,
  expected: ExpectedResponse,
): Promise<ParsedResponse> {
  const headers = new Headers({
    Accept: "application/json",
    "User-Agent": "Tomodachi-Staging-P4-Phase-A/1.0",
    ...Object.fromEntries(new Headers(init.headers)),
  });
  const requestInit = { ...init, headers };
  const url = assertP4PhaseARequestAllowed(
    actor.slot,
    target,
    pathname,
    requestInit,
    state,
  );
  const method = (requestInit.method ?? "GET").toUpperCase();
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const phase = expected.phase ?? "scenario";
  if (phase === "scenario") {
    options.abortSignal?.throwIfAborted();
  }
  if (
    counters.requests >= FIXED_P4_PHASE_A_LIMITS.maxRequests ||
    (phase === "scenario" &&
      counters.requests >= FIXED_P4_PHASE_A_LIMITS.maxScenarioRequests)
  ) {
    throw new HostedStagingP4PhaseAError(
      "P4 phase A exceeded its request ceiling.",
    );
  }
  if (
    mutation &&
    (counters.mutationAttempts >= FIXED_P4_PHASE_A_LIMITS.maxMutationAttempts ||
      (phase === "scenario" &&
        counters.mutationAttempts >=
          FIXED_P4_PHASE_A_LIMITS.maxScenarioMutationAttempts))
  ) {
    throw new HostedStagingP4PhaseAError(
      "P4 phase A exceeded its mutation ceiling.",
    );
  }
  counters.requests += 1;
  if (mutation) counters.mutationAttempts += 1;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response | undefined;
  try {
    response = await actor.request(url, {
      ...requestInit,
      cache: "no-store",
      credentials: "include",
      redirect: "manual",
      signal: controller.signal,
    });
    if (
      (response.url && new URL(response.url).origin !== target.origin) ||
      (response.status >= 300 && response.status < 400) ||
      response.headers.has("set-cookie")
    ) {
      throw new HostedStagingP4PhaseAError(
        `${expected.label} escaped its approved response boundary.`,
      );
    }
    assertReleaseHeaders(
      response,
      options.expectedSourceCommit,
      options.expectedWorkerVersion,
      expected.label,
    );
    if (!expected.statuses.includes(response.status)) {
      throw new P4PhaseARequestError(
        `${expected.label} returned an unexpected status.`,
        response.status >= 500,
      );
    }
    const kind = expected.kind ?? "envelope";
    if (kind === "binary") {
      const body = await readBoundedBytes(
        response,
        FIXED_P4_PHASE_A_LIMITS.maxResponseBytes,
      );
      if (body.byteLength === 0) {
        throw new HostedStagingP4PhaseAError(
          `${expected.label} returned an empty body.`,
        );
      }
      return { body, response };
    }
    const text = await readBoundedResponseText(
      response,
      FIXED_P4_PHASE_A_LIMITS.maxResponseBytes,
      controller.signal,
    );
    const body = objectBody(parseJson(text), expected.label);
    if (kind === "envelope") {
      assertEnvelope(body, response, expected.label);
      if (expected.errorCode) {
        const error = errorObject(body, expected.label);
        if (error.code !== expected.errorCode) {
          throw new HostedStagingP4PhaseAError(
            `${expected.label} returned an unexpected error code.`,
          );
        }
      }
    }
    return { body, response };
  } catch (error) {
    if (response?.body && !response.bodyUsed) {
      void response.body.cancel("P4 phase A stopped.").catch(() => {});
    }
    if (phase === "scenario") {
      options.abortSignal?.throwIfAborted();
    }
    if (controller.signal.aborted) {
      throw new P4PhaseARequestError(`${expected.label} timed out.`, true);
    }
    if (error instanceof HostedStagingP4PhaseAError) throw error;
    throw new P4PhaseARequestError(`${expected.label} request failed.`, true);
  } finally {
    clearTimeout(timer);
  }
}

function assertCleanupManifests(
  creationBefore: StagingFixtureManifest,
  creationAfter: StagingFixtureManifest,
  socialBefore: P4PhaseASocialManifest,
  socialAfter: P4PhaseASocialManifest,
  expectedSecondUserId: string,
  commentId: string | null,
  expect: (condition: boolean, label: string) => void,
): void {
  expect(
    creationAfter.fixtureActiveCreationRows === 0 &&
      creationAfter.fixtureDeletedCreationRows <= 1 &&
      creationAfter.fixtureRevisionRows <= FIXED_P4_PHASE_A_LIMITS.maxRevisions,
    "The post-run creation manifest contains active or excess fixture rows.",
  );
  expect(
    creationAfter.fixtureObjectRows <=
      FIXED_P4_PHASE_A_LIMITS.maxPendingR2Objects &&
      creationAfter.fixtureR2ObjectCount <=
        FIXED_P4_PHASE_A_LIMITS.maxPendingR2Objects &&
      creationAfter.fixtureObjectBytes <=
        FIXED_P4_PHASE_A_LIMITS.maxFixtureR2Bytes &&
      creationAfter.fixtureR2ObjectBytes <=
        FIXED_P4_PHASE_A_LIMITS.maxFixtureR2Bytes &&
      creationAfter.fixtureObjectRows === creationAfter.fixtureR2ObjectCount &&
      creationAfter.fixtureObjectBytes === creationAfter.fixtureR2ObjectBytes,
    "The post-run D1/R2 object manifest exceeds its ceiling or is inconsistent.",
  );
  expect(
    socialAfter.creationState === "deleted" &&
      socialAfter.creationOwnerUserId?.toLowerCase() ===
        expectedSecondUserId.toLowerCase() &&
      socialAfter.likeCount === 0 &&
      socialAfter.followCount === 0 &&
      socialAfter.reportCount === socialBefore.reportCount &&
      socialAfter.moderationActionCount ===
        socialBefore.moderationActionCount &&
      socialAfter.showcaseImageCount === socialBefore.showcaseImageCount &&
      socialAfter.searchCount === 0 &&
      socialAfter.foreignKeyViolations === 0 &&
      (commentId === null ||
        socialAfter.commentState === "deleted" ||
        socialAfter.commentState === null),
    "The post-run social manifest contains an unauthorized or unclean fixture delta.",
  );
  expect(
    creationAfter.totalCreationRows - creationBefore.totalCreationRows ===
      creationAfter.fixtureDeletedCreationRows,
    "The creation-row delta is outside the one-fixture ceiling.",
  );
}

function validateRunInputs(options: HostedStagingP4PhaseAOptions): void {
  if (
    !COMMIT_SHA.test(options.expectedSourceCommit) ||
    !UUID_V4.test(options.expectedWorkerVersion) ||
    !UUID_V4.test(options.expectedOwnerUserId) ||
    !UUID_V4.test(options.expectedSecondUserId) ||
    !UUID_V4.test(options.runId) ||
    options.expectedOwnerUserId.toLowerCase() ===
      options.expectedSecondUserId.toLowerCase()
  ) {
    throw new HostedStagingP4PhaseAError(
      "P4 phase A requires one exact source, Worker, run, admin, and distinct second-user identity.",
    );
  }
}

function identityForSlot(
  identities: readonly [BrowserMemoryIdentity, BrowserMemoryIdentity],
  slot: ActorSlot,
): BrowserMemoryIdentity {
  const found = identities.find((identity) => identity.slot === slot);
  if (!found) {
    throw new HostedStagingP4PhaseAError(
      "P4 phase A requires exactly one identity for each approved slot.",
    );
  }
  return found;
}

function validateTimeout(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 60_000) {
    throw new HostedStagingP4PhaseAError(
      "timeoutMs must be an integer between 1 and 60000.",
    );
  }
  return value;
}

function validateCreationManifest(
  value: StagingFixtureManifest,
): StagingFixtureManifest {
  const keys = [
    "fixtureActiveCreationRows",
    "fixtureDeletedCreationRows",
    "fixtureObjectBytes",
    "fixtureObjectRows",
    "fixtureR2ObjectBytes",
    "fixtureR2ObjectCount",
    "fixtureRevisionRows",
    "totalCreationRows",
    "totalObjectBytes",
    "totalObjectRows",
    "totalR2ObjectCount",
    "totalRevisionRows",
  ] as const;
  if (
    !isJsonObject(value) ||
    keys.some((key) => !Number.isSafeInteger(value[key]) || value[key] < 0)
  ) {
    throw new HostedStagingP4PhaseAError(
      "A creation manifest contains invalid counts.",
    );
  }
  return value;
}

function validateSocialManifest(
  value: P4PhaseASocialManifest,
): P4PhaseASocialManifest {
  if (
    !isJsonObject(value) ||
    ![
      "followCount",
      "foreignKeyViolations",
      "likeCount",
      "moderationActionCount",
      "reportCount",
      "searchCount",
      "showcaseImageCount",
    ].every(
      (key) =>
        Number.isSafeInteger(value[key as keyof P4PhaseASocialManifest]) &&
        Number(value[key as keyof P4PhaseASocialManifest]) >= 0,
    ) ||
    ![null, "deleted", "draft", "hidden", "published"].includes(
      value.creationState,
    ) ||
    ![null, "active", "deleted", "hidden"].includes(value.commentState) ||
    (value.creationOwnerUserId !== null &&
      !UUID_V4.test(value.creationOwnerUserId)) ||
    (value.commentAuthorUserId !== null &&
      !UUID_V4.test(value.commentAuthorUserId))
  ) {
    throw new HostedStagingP4PhaseAError(
      "A social manifest contains invalid or unbounded fixture state.",
    );
  }
  return value;
}

function assertReleaseHeaders(
  response: Response,
  sourceCommit: string,
  workerVersion: string,
  label: string,
): void {
  if (
    response.headers.get("x-tomodachi-source-commit")?.toLowerCase() !==
      sourceCommit.toLowerCase() ||
    response.headers.get("x-tomodachi-worker-version")?.toLowerCase() !==
      workerVersion.toLowerCase() ||
    response.headers.get("x-tomodachi-environment") !== "staging" ||
    response.headers.get("x-tomodachi-community-mutations") !== "enabled"
  ) {
    throw new HostedStagingP4PhaseAError(
      `${label} returned from an unapproved release identity.`,
    );
  }
}

function assertEnvelope(
  body: JsonObject,
  response: Response,
  label: string,
): void {
  const requestId = response.headers.get("x-request-id") ?? "";
  if (
    !UUID_V4.test(requestId) ||
    body.requestId !== requestId ||
    Object.hasOwn(body, "data") === isJsonObject(body.error)
  ) {
    throw new HostedStagingP4PhaseAError(
      `${label} is not a standard API envelope.`,
    );
  }
}

function sessionUser(body: JsonObject, label: string): JsonObject {
  const data = dataObject(body, label);
  const user = data.user;
  if (!isJsonObject(user)) {
    throw new HostedStagingP4PhaseAError(`${label} has no authenticated user.`);
  }
  return user;
}

function usernameFrom(user: JsonObject, label: string): string {
  const username = user.username;
  if (typeof username !== "string" || !USERNAME.test(username)) {
    throw new HostedStagingP4PhaseAError(
      `The ${label} session has not completed onboarding.`,
    );
  }
  return username;
}

function responseEtag(response: Response): string {
  const value = response.headers.get("etag")?.trim() ?? "";
  const normalized =
    value.startsWith("W/") || value.startsWith("w/")
      ? value.slice(2).trim()
      : value;
  if (!REVISION_ETAG.test(normalized)) {
    throw new HostedStagingP4PhaseAError(
      "A project response lacks a valid strong revision ETag.",
    );
  }
  return normalized;
}

function publishBody(
  state: P4PhaseARequestPolicyState,
  visibility: "public" | "unlisted",
): JsonObject {
  return {
    commentsEnabled: visibility === "public",
    description: `${state.fixtureName} description`,
    projectDownloadEnabled: visibility === "unlisted",
    tags: [],
    title: state.fixtureName,
    visibility,
  };
}

function jsonMutation(
  origin: string,
  method: "DELETE" | "PATCH" | "POST" | "PUT",
  body: JsonObject,
  extraHeaders: Record<string, string> = {},
): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...extraHeaders,
    },
    method,
  };
}

function fixtureProject(name: string, revision: number): CanonicalGridDocument {
  const safeRevision = Math.min(Math.max(revision, 1), 9);
  return canonicalizeGridDocument({
    cells: Array.from({ length: 64 }, (_, index) =>
      index === safeRevision - 1 ? "R1C1" : null,
    ),
    height: 8,
    lockedColors: [],
    meta: {
      createdAt: "2026-01-01T00:00:00.000Z",
      modifiedAt: `2026-01-01T00:00:0${safeRevision}.000Z`,
      name,
    },
    usedColors: ["R1C1"],
    version: 1,
    width: 8,
  });
}

function assertProject(value: unknown, expectedName: string): void {
  if (
    !isJsonObject(value) ||
    !isJsonObject(value.meta) ||
    value.meta.name !== expectedName
  ) {
    throw new HostedStagingP4PhaseAError(
      "The project document is not bound to this fixture run.",
    );
  }
}

function dataObject(body: JsonObject, label: string): JsonObject {
  return objectField(body, "data", label);
}

function dataArray(body: JsonObject, label: string): unknown[] {
  const data = body.data;
  if (!Array.isArray(data)) {
    throw new HostedStagingP4PhaseAError(
      `${label} returned invalid list data.`,
    );
  }
  return data;
}

function errorObject(body: JsonObject, label: string): JsonObject {
  return objectField(body, "error", label);
}

function objectField(body: JsonObject, key: string, label: string): JsonObject {
  const nested = body[key];
  if (!isJsonObject(nested)) {
    throw new HostedStagingP4PhaseAError(`${label} is missing ${key}.`);
  }
  return nested;
}

function stringField(body: JsonObject, key: string, label: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new HostedStagingP4PhaseAError(`${label} has an invalid ${key}.`);
  }
  return value;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HostedStagingP4PhaseAError(
      "A P4 response or request did not contain valid JSON.",
    );
  }
}

function objectBody(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new HostedStagingP4PhaseAError(`${label} is not a JSON object.`);
  }
  return value;
}

function exactKeys(
  value: JsonObject,
  expected: readonly string[],
  label: string,
): void {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...expected].sort())
  ) {
    throw new HostedStagingP4PhaseAError(
      `The ${label} has fields outside its fixed schema.`,
    );
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBoundedBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new HostedStagingP4PhaseAError(
      "A binary response exceeds the fixed byte ceiling.",
    );
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        throw new HostedStagingP4PhaseAError(
          "A binary response exceeds the fixed byte ceiling.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function externalStep<T>(
  operation: () => Promise<T>,
  failureMessage: string,
): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new HostedStagingP4PhaseAError(failureMessage);
  }
}

function sanitizeFailure(
  error: unknown,
  fallback: string,
): HostedStagingP4PhaseAError {
  return error instanceof HostedStagingP4PhaseAError
    ? error
    : new HostedStagingP4PhaseAError(fallback);
}

function flattenAggregateErrors(error: unknown): unknown[] {
  return error instanceof AggregateError ? [...error.errors] : [error];
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
