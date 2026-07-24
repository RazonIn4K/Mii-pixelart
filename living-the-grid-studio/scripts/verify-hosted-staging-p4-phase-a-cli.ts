import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  consumeP4PhaseAApproval,
  loadP4PhaseAApproval,
  parseP4PhaseAApproval,
  type P4PhaseAApproval,
} from "./verify-hosted-staging-p4-phase-a-approval";
import {
  FIXED_P4_PHASE_A_LIMITS,
  runHostedStagingP4PhaseA,
  type HostedStagingP4PhaseAOptions,
  type HostedStagingP4PhaseAResult,
  type P4PhaseAManifestRequest,
  type P4PhaseASocialManifest,
} from "./verify-hosted-staging-p4-phase-a";
import {
  createWranglerManifestCapture,
  runBoundedWranglerJson,
} from "./verify-hosted-staging-writable-cli";
import type {
  StagingFixtureManifest,
  StagingManifestRequest,
} from "./verify-hosted-staging-writable";
import {
  withStagingLiveAuthSessions,
  type BrowserMemoryIdentity,
  type StagingLiveAuthOptions,
  type StagingLiveAuthResult,
  type VerifiedStagingDeploymentEvidence,
} from "./verify-staging-live-auth";

type JsonObject = Record<string, unknown>;

const STAGING_ORIGIN = "https://staging.tomodachi.pw";
const STAGING_D1_NAME = "tomodachi-studio-staging";
const WRANGLER_CONFIG = "wrangler.jsonc";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface P4PhaseASocialManifestDependencies {
  runJson(args: readonly string[]): Promise<unknown>;
}

type P4PhaseASessionsRunner = (
  options: StagingLiveAuthOptions,
  useSessions: (
    identities: readonly [BrowserMemoryIdentity, BrowserMemoryIdentity],
    deployment: VerifiedStagingDeploymentEvidence,
  ) => Promise<HostedStagingP4PhaseAResult>,
) => Promise<StagingLiveAuthResult<HostedStagingP4PhaseAResult>>;

export interface IntegratedP4PhaseACliDependencies {
  consumeApproval(approval: P4PhaseAApproval): Promise<void>;
  createCreationManifestCapture(
    approval: P4PhaseAApproval,
  ): (request: StagingManifestRequest) => Promise<StagingFixtureManifest>;
  createSocialManifestCapture(
    approval: P4PhaseAApproval,
  ): (request: P4PhaseAManifestRequest) => Promise<P4PhaseASocialManifest>;
  loadApproval(): Promise<P4PhaseAApproval>;
  now(): number;
  runAcceptance(
    options: HostedStagingP4PhaseAOptions,
  ): Promise<HostedStagingP4PhaseAResult>;
  withSessions: P4PhaseASessionsRunner;
}

export interface IntegratedP4PhaseACliResult {
  assertions: number;
  cleanup: "verified";
  coveredScenarios: readonly string[];
  identities: 2;
  mutationAttempts: number;
  requests: number;
  sessionsRevoked: 2;
  sourceCommit: string;
  target: typeof STAGING_ORIGIN;
  workerVersion: string;
}

export class P4PhaseACliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P4PhaseACliError";
  }
}

export function createP4PhaseACreationManifestCapture(
  approval: P4PhaseAApproval,
): (request: StagingManifestRequest) => Promise<StagingFixtureManifest> {
  return createWranglerManifestCapture({
    limits: {
      fixtureR2Bytes: approval.limits.maxFixtureR2Bytes,
      maxPendingR2Objects: approval.limits.maxPendingR2Objects,
      maxSingleR2ObjectBytes: approval.limits.maxSingleR2ObjectBytes,
    },
    ownerUserId: approval.secondUserId,
  });
}

export function createP4PhaseASocialManifestCapture(
  approval: P4PhaseAApproval,
  overrides: Partial<P4PhaseASocialManifestDependencies> = {},
): (request: P4PhaseAManifestRequest) => Promise<P4PhaseASocialManifest> {
  const dependencies = {
    runJson: runBoundedWranglerJson,
    ...overrides,
  } satisfies P4PhaseASocialManifestDependencies;

  return async (request) => {
    if (
      (request.phase !== "before" && request.phase !== "after") ||
      request.creationId.toLowerCase() !== approval.runId ||
      (request.commentId !== null && !UUID_V4.test(request.commentId))
    ) {
      throw new P4PhaseACliError(
        "The social manifest request escaped the exact approved fixture scope.",
      );
    }
    const payload = await dependencies.runJson([
      "exec",
      "wrangler",
      "d1",
      "execute",
      STAGING_D1_NAME,
      "--remote",
      "--config",
      WRANGLER_CONFIG,
      "--env",
      "staging",
      "--command",
      buildSocialManifestQuery(approval, request.commentId),
      "--json",
    ]);
    return parseSocialManifestPayload(payload);
  };
}

export async function runIntegratedHostedStagingP4PhaseA(
  overrides: Partial<IntegratedP4PhaseACliDependencies> = {},
): Promise<IntegratedP4PhaseACliResult> {
  const dependencies = {
    consumeApproval: (approval: P4PhaseAApproval) =>
      consumeP4PhaseAApproval(approval),
    createCreationManifestCapture: createP4PhaseACreationManifestCapture,
    createSocialManifestCapture: createP4PhaseASocialManifestCapture,
    loadApproval: () => loadP4PhaseAApproval(),
    now: Date.now,
    runAcceptance: runHostedStagingP4PhaseA,
    withSessions: (options, callback) =>
      withStagingLiveAuthSessions(options, callback),
    ...overrides,
  } satisfies IntegratedP4PhaseACliDependencies;

  const approval = await dependencies.loadApproval();
  const captureCreationManifest =
    dependencies.createCreationManifestCapture(approval);
  const captureSocialManifest =
    dependencies.createSocialManifestCapture(approval);
  const liveAuth = await dependencies.withSessions(
    {
      baseUrl: approval.target,
      expectedCommunityMutations: true,
      expectedConsultSales: false,
      expectedSourceSha: approval.sourceCommit,
      expectedWorkerVersion: approval.workerVersion,
    },
    async (identities, deployment) => {
      const freshApproval = parseP4PhaseAApproval(approval, dependencies.now());
      const owner = identityForSlot(identities, "owner");
      const secondUser = identityForSlot(identities, "second-user");
      if (
        owner.internalUserId.toLowerCase() !== freshApproval.ownerUserId ||
        owner.role !== "admin" ||
        secondUser.internalUserId.toLowerCase() !==
          freshApproval.secondUserId ||
        secondUser.role !== "user" ||
        deployment.sourceCommit.toLowerCase() !== freshApproval.sourceCommit ||
        deployment.workerVersion.toLowerCase() !==
          freshApproval.workerVersion ||
        deployment.origin !== freshApproval.target ||
        deployment.environment !== "staging" ||
        deployment.communityMutationsEnabled !== true ||
        deployment.consultSalesEnabled !== false
      ) {
        throw new P4PhaseACliError(
          "The live sessions or deployment do not match the fresh P4 phase A approval.",
        );
      }

      // Consume only after both ephemeral sessions and the exact deployment
      // have been reverified, but before the first acceptance mutation.
      await dependencies.consumeApproval(freshApproval);
      return dependencies.runAcceptance({
        captureCreationManifest,
        captureSocialManifest,
        expectedOwnerUserId: freshApproval.ownerUserId,
        expectedSecondUserId: freshApproval.secondUserId,
        expectedSourceCommit: freshApproval.sourceCommit,
        expectedWorkerVersion: freshApproval.workerVersion,
        identities,
        runId: freshApproval.runId,
        verifyDeployment: async () => ({
          communityMutationsEnabled: deployment.communityMutationsEnabled,
          environment: deployment.environment,
          origin: deployment.origin,
          sourceCommit: deployment.sourceCommit,
          workerVersion: deployment.workerVersion,
        }),
      });
    },
  );

  const acceptance = liveAuth.callbackResult;
  return {
    assertions: acceptance.assertions,
    cleanup: acceptance.cleanup,
    coveredScenarios: acceptance.coveredScenarios,
    identities: liveAuth.identities,
    mutationAttempts: acceptance.mutationAttempts,
    requests: acceptance.requests,
    sessionsRevoked: liveAuth.sessionsRevoked,
    sourceCommit: liveAuth.sourceSha,
    target: liveAuth.target,
    workerVersion: liveAuth.workerVersion,
  };
}

function buildSocialManifestQuery(
  approval: P4PhaseAApproval,
  commentId: string | null,
): string {
  const creation = sqlUuid(approval.runId);
  const owner = sqlUuid(approval.ownerUserId);
  const secondUser = sqlUuid(approval.secondUserId);
  const comment = commentId === null ? "NULL" : sqlUuid(commentId);
  return `SELECT
    (SELECT owner_user_id FROM creations WHERE id = ${creation}) AS creation_owner_user_id,
    (SELECT state FROM creations WHERE id = ${creation}) AS creation_state,
    (SELECT author_user_id FROM comments WHERE id = ${comment}) AS comment_author_user_id,
    (SELECT status FROM comments WHERE id = ${comment}) AS comment_state,
    (SELECT COUNT(*) FROM likes
      WHERE user_id = ${owner} AND creation_id = ${creation}) AS like_count,
    (SELECT COUNT(*) FROM follows
      WHERE follower_user_id = ${owner}
        AND followed_user_id = ${secondUser}) AS follow_count,
    (SELECT COUNT(*) FROM reports
      WHERE target_id IN (${creation}, ${comment})) AS report_count,
    (SELECT COUNT(*) FROM moderation_actions
      WHERE target_id IN (${creation}, ${comment})) AS moderation_action_count,
    (SELECT COUNT(*) FROM creation_showcase_images
      WHERE creation_id = ${creation}) AS showcase_image_count,
    (SELECT COUNT(*) FROM creation_search
      WHERE creation_id = ${creation}) AS search_count,
    (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreign_key_violations`;
}

function parseSocialManifestPayload(payload: unknown): P4PhaseASocialManifest {
  if (
    !Array.isArray(payload) ||
    payload.length !== 1 ||
    !isObject(payload[0]) ||
    payload[0].success !== true ||
    !Array.isArray(payload[0].results) ||
    payload[0].results.length !== 1 ||
    !isObject(payload[0].results[0])
  ) {
    throw new P4PhaseACliError(
      "Wrangler returned an unrecognized P4 social manifest response.",
    );
  }
  const row = payload[0].results[0];
  const expectedKeys = [
    "comment_author_user_id",
    "comment_state",
    "creation_owner_user_id",
    "creation_state",
    "follow_count",
    "foreign_key_violations",
    "like_count",
    "moderation_action_count",
    "report_count",
    "search_count",
    "showcase_image_count",
  ];
  if (
    JSON.stringify(Object.keys(row).sort()) !==
    JSON.stringify(expectedKeys.sort())
  ) {
    throw new P4PhaseACliError(
      "The P4 social manifest returned fields outside its fixed schema.",
    );
  }
  const counts = [
    "follow_count",
    "foreign_key_violations",
    "like_count",
    "moderation_action_count",
    "report_count",
    "search_count",
    "showcase_image_count",
  ] as const;
  if (
    counts.some(
      (key) => !Number.isSafeInteger(row[key]) || Number(row[key]) < 0,
    ) ||
    !nullableUuid(row.creation_owner_user_id) ||
    !nullableUuid(row.comment_author_user_id) ||
    ![null, "deleted", "draft", "hidden", "published"].includes(
      row.creation_state as never,
    ) ||
    ![null, "active", "deleted", "hidden"].includes(row.comment_state as never)
  ) {
    throw new P4PhaseACliError(
      "The P4 social manifest contained invalid or unbounded fixture state.",
    );
  }
  return {
    commentAuthorUserId: row.comment_author_user_id as string | null,
    commentState: row.comment_state as P4PhaseASocialManifest["commentState"],
    creationOwnerUserId: row.creation_owner_user_id as string | null,
    creationState:
      row.creation_state as P4PhaseASocialManifest["creationState"],
    followCount: Number(row.follow_count),
    foreignKeyViolations: Number(row.foreign_key_violations),
    likeCount: Number(row.like_count),
    moderationActionCount: Number(row.moderation_action_count),
    reportCount: Number(row.report_count),
    searchCount: Number(row.search_count),
    showcaseImageCount: Number(row.showcase_image_count),
  };
}

function identityForSlot(
  identities: readonly [BrowserMemoryIdentity, BrowserMemoryIdentity],
  slot: BrowserMemoryIdentity["slot"],
): BrowserMemoryIdentity {
  const matches = identities.filter((identity) => identity.slot === slot);
  if (matches.length !== 1) {
    throw new P4PhaseACliError(
      "The live-auth adapter did not return exactly one identity per slot.",
    );
  }
  return matches[0]!;
}

function sqlUuid(value: string): string {
  if (!UUID_V4.test(value)) {
    throw new P4PhaseACliError(
      "A P4 manifest identifier is not a canonical UUIDv4.",
    );
  }
  return `'${value.toLowerCase()}'`;
}

function nullableUuid(value: unknown): boolean {
  return value === null || (typeof value === "string" && UUID_V4.test(value));
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new P4PhaseACliError(
      "This command accepts no CLI values; use the fixed private P4 phase A approval file.",
    );
  }
  const result = await runIntegratedHostedStagingP4PhaseA();
  console.log(JSON.stringify(result, null, 2));
}

const isCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "P4PhaseACliError: The integrated P4 phase A acceptance failed.",
    );
    process.exitCode = 1;
  });
}
