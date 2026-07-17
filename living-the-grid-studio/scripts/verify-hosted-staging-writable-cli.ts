import { spawn, type ChildProcess } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { mkdtemp, open, rm, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  runHostedStagingWritableAcceptance,
  type HostedStagingWritableOptions,
  type HostedStagingWritableResult,
  type StagingFixtureManifest,
  type StagingManifestRequest,
} from "./verify-hosted-staging-writable";
import {
  withStagingLiveAuthSessions,
  type BrowserMemoryIdentity,
  type StagingLiveAuthOptions,
  type StagingLiveAuthResult,
  type VerifiedStagingDeploymentEvidence,
} from "./verify-staging-live-auth";

type JsonObject = Record<string, unknown>;

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const APPROVAL_PATH = path.join(
  APP_ROOT,
  ".deployment-readiness",
  "staging-writable.json",
);
const APPROVAL_RELATIVE_PATH = ".deployment-readiness/staging-writable.json";
const STAGING_ORIGIN = "https://staging.tomodachi.pw";
const STAGING_D1_NAME = "tomodachi-studio-staging";
const STAGING_R2_BUCKET = "tomodachi-studio-projects-staging";
const WRANGLER_CONFIG = "wrangler.jsonc";
const R2_AUDIT_WORKER_PATH = path.join(
  APP_ROOT,
  "scripts",
  "staging-r2-prefix-audit-worker.ts",
);

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const COMMIT_SHA = /^[0-9a-f]{40}$/iu;
const MAX_APPROVAL_BYTES = 32 * 1_024;
const MAX_APPROVAL_AGE_MS = 15 * 60 * 1_000;
const MAX_APPROVAL_LIFETIME_MS = 30 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 30 * 1_000;
const MAX_JSON_OUTPUT_BYTES = 512 * 1_024;
const MAX_COMMAND_ERROR_BYTES = 256 * 1_024;
const R2_AUDIT_STARTUP_TIMEOUT_MS = 20_000;
const R2_AUDIT_REQUEST_TIMEOUT_MS = 5_000;
const WRANGLER_READ_TIMEOUT_MS = 30_000;

export const FIXED_STAGING_WRITABLE_LIMITS = Object.freeze({
  fixtureR2Bytes: 4 * 1_024 * 1_024,
  maxMutationAttempts: 9,
  maxPendingR2Objects: 16,
  maxRequests: 11,
  maxSingleR2ObjectBytes: 2 * 1_024 * 1_024,
  requestBodyBytes: 128 * 1_024,
  routeOperations: 5,
});

const FIXED_CONFIRMATIONS = Object.freeze({
  approvedTwoUserStagingMutationRun: true,
  noProductionDnsSecretsMigrationsOrRoles: true,
  normalApiCleanupOnly: true,
  noFallbackCleanup: true,
});

export interface StagingWritableApproval {
  confirmations: typeof FIXED_CONFIRMATIONS;
  environment: "staging";
  expiresAt: string;
  issuedAt: string;
  limits: typeof FIXED_STAGING_WRITABLE_LIMITS;
  ownerUserId: string;
  runId: string;
  schemaVersion: 1;
  secondUserId: string;
  sourceCommit: string;
  target: typeof STAGING_ORIGIN;
  workerVersion: string;
}

export interface SecureApprovalFile {
  mode: number;
  text: string;
}

export interface ApprovalFileDependencies {
  isIgnored(relativePath: string): Promise<boolean>;
  now(): number;
  readSecureFile(absolutePath: string): Promise<SecureApprovalFile>;
}

export interface WranglerManifestDependencies {
  listR2Prefix(creationId: string): Promise<readonly ListedR2Object[]>;
  runJson(args: readonly string[]): Promise<unknown>;
  streamObjectBytes(
    args: readonly string[],
    byteCeiling: number,
  ): Promise<{ bytes: number; sha256: string }>;
}

export interface ListedR2Object {
  key: string;
  size: number;
}

type IntegratedSessionsRunner = (
  options: StagingLiveAuthOptions,
  useSessions: (
    identities: readonly [BrowserMemoryIdentity, BrowserMemoryIdentity],
    deployment: VerifiedStagingDeploymentEvidence,
  ) => Promise<HostedStagingWritableResult>,
) => Promise<StagingLiveAuthResult<HostedStagingWritableResult>>;

export interface IntegratedWritableCliDependencies {
  consumeApproval(approval: StagingWritableApproval): Promise<void>;
  createManifestCapture(
    approval: StagingWritableApproval,
  ): (request: StagingManifestRequest) => Promise<StagingFixtureManifest>;
  loadApproval(): Promise<StagingWritableApproval>;
  now(): number;
  runAcceptance(
    options: HostedStagingWritableOptions,
  ): Promise<HostedStagingWritableResult>;
  withSessions: IntegratedSessionsRunner;
}

export interface IntegratedWritableCliResult {
  assertions: number;
  cleanup: "verified";
  identities: 2;
  mutationAttempts: number;
  requests: number;
  sessionsRevoked: 2;
  sourceCommit: string;
  target: typeof STAGING_ORIGIN;
  workerVersion: string;
}

interface ManifestSummaryRow extends JsonObject {
  row_type: "summary";
  total_creation_rows: number;
  total_object_bytes: number;
  total_object_rows: number;
  total_revision_rows: number;
}

interface TrackedCreationRow {
  id: string;
  ownerUserId: string;
  state: "deleted" | "draft" | "hidden" | "published";
}

interface TrackedRevisionRow {
  creationId: string;
  id: string;
  status: "failed" | "obsolete" | "ready" | "uploading";
}

interface TrackedObjectRow {
  byteSize: number;
  creationId: string;
  id: string;
  key: string;
  kind: "preview" | "project_json" | "social" | "thumb";
  revisionId: string;
  sha256: string;
  status: "deleting" | "ready";
}

interface ParsedD1Manifest {
  creations: TrackedCreationRow[];
  objects: TrackedObjectRow[];
  revisions: TrackedRevisionRow[];
  summary: ManifestSummaryRow;
}

export class StagingWritableCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StagingWritableCliError";
  }
}

export function parseStagingWritableApproval(
  value: unknown,
  now = Date.now(),
): StagingWritableApproval {
  const approval = exactObject(
    value,
    [
      "confirmations",
      "environment",
      "expiresAt",
      "issuedAt",
      "limits",
      "ownerUserId",
      "runId",
      "schemaVersion",
      "secondUserId",
      "sourceCommit",
      "target",
      "workerVersion",
    ],
    "approval",
  );
  if (
    approval.schemaVersion !== 1 ||
    approval.environment !== "staging" ||
    approval.target !== STAGING_ORIGIN ||
    typeof approval.sourceCommit !== "string" ||
    !COMMIT_SHA.test(approval.sourceCommit) ||
    typeof approval.workerVersion !== "string" ||
    !UUID_V4.test(approval.workerVersion) ||
    typeof approval.ownerUserId !== "string" ||
    !UUID_V4.test(approval.ownerUserId) ||
    typeof approval.runId !== "string" ||
    !UUID_V4.test(approval.runId) ||
    typeof approval.secondUserId !== "string" ||
    !UUID_V4.test(approval.secondUserId) ||
    approval.ownerUserId.toLowerCase() === approval.secondUserId.toLowerCase()
  ) {
    throw new StagingWritableCliError(
      "The writable staging approval is not bound to one exact staging deployment and two distinct internal users.",
    );
  }

  const limits = exactObject(
    approval.limits,
    Object.keys(FIXED_STAGING_WRITABLE_LIMITS),
    "approval limits",
  );
  for (const [name, expected] of Object.entries(
    FIXED_STAGING_WRITABLE_LIMITS,
  )) {
    if (limits[name] !== expected) {
      throw new StagingWritableCliError(
        "The writable staging approval does not match the fixed request and storage ceilings.",
      );
    }
  }

  const confirmations = exactObject(
    approval.confirmations,
    Object.keys(FIXED_CONFIRMATIONS),
    "approval confirmations",
  );
  for (const name of Object.keys(FIXED_CONFIRMATIONS)) {
    if (confirmations[name] !== true) {
      throw new StagingWritableCliError(
        "The writable staging approval is missing a required safety confirmation.",
      );
    }
  }

  if (
    typeof approval.issuedAt !== "string" ||
    typeof approval.expiresAt !== "string"
  ) {
    throw new StagingWritableCliError(
      "The writable staging approval must have an explicit short validity window.",
    );
  }
  const issuedAt = parseExactIsoTime(approval.issuedAt);
  const expiresAt = parseExactIsoTime(approval.expiresAt);
  if (
    issuedAt > now + MAX_CLOCK_SKEW_MS ||
    now - issuedAt > MAX_APPROVAL_AGE_MS ||
    expiresAt <= now ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_APPROVAL_LIFETIME_MS
  ) {
    throw new StagingWritableCliError(
      "The writable staging approval is stale, premature, expired, or valid for too long.",
    );
  }

  return {
    confirmations: FIXED_CONFIRMATIONS,
    environment: "staging",
    expiresAt: approval.expiresAt,
    issuedAt: approval.issuedAt,
    limits: FIXED_STAGING_WRITABLE_LIMITS,
    ownerUserId: approval.ownerUserId.toLowerCase(),
    runId: approval.runId.toLowerCase(),
    schemaVersion: 1,
    secondUserId: approval.secondUserId.toLowerCase(),
    sourceCommit: approval.sourceCommit.toLowerCase(),
    target: STAGING_ORIGIN,
    workerVersion: approval.workerVersion.toLowerCase(),
  };
}

export async function loadStagingWritableApproval(
  absolutePath = APPROVAL_PATH,
  dependencyOverrides: Partial<ApprovalFileDependencies> = {},
): Promise<StagingWritableApproval> {
  if (path.resolve(absolutePath) !== APPROVAL_PATH) {
    throw new StagingWritableCliError(
      "The writable staging approval must use the fixed private readiness path.",
    );
  }
  const dependencies = {
    ...defaultApprovalFileDependencies(),
    ...dependencyOverrides,
  } satisfies ApprovalFileDependencies;
  const ignored = await dependencies.isIgnored(APPROVAL_RELATIVE_PATH);
  if (!ignored) {
    throw new StagingWritableCliError(
      "The writable staging approval path is not protected by Git ignore rules.",
    );
  }
  const file = await dependencies.readSecureFile(APPROVAL_PATH);
  if ((file.mode & 0o777) !== 0o600) {
    throw new StagingWritableCliError(
      "The writable staging approval file must have mode 0600.",
    );
  }
  if (Buffer.byteLength(file.text) > MAX_APPROVAL_BYTES) {
    throw new StagingWritableCliError(
      "The writable staging approval file exceeds its size limit.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch {
    throw new StagingWritableCliError(
      "The writable staging approval file is not valid JSON.",
    );
  }
  return parseStagingWritableApproval(parsed, dependencies.now());
}

export async function consumeStagingWritableApproval(
  approval: StagingWritableApproval,
  dependencyOverrides: Partial<{
    createExclusiveMarker(
      absolutePath: string,
      text: string,
      mode: number,
    ): Promise<void>;
    loadCurrent(): Promise<StagingWritableApproval>;
    now(): number;
    removeApproval(): Promise<void>;
  }> = {},
): Promise<void> {
  const dependencies = {
    createExclusiveMarker: async (
      absolutePath: string,
      text: string,
      mode: number,
    ) => {
      const noFollow =
        (constants as typeof constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ??
        0;
      let handle;
      try {
        handle = await open(
          absolutePath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
          mode,
        );
        await handle.writeFile(text, { encoding: "utf8" });
      } catch {
        throw new StagingWritableCliError(
          "The writable staging approval was already consumed or could not be consumed safely.",
        );
      } finally {
        await handle?.close().catch(() => undefined);
      }
    },
    loadCurrent: () => loadStagingWritableApproval(),
    now: Date.now,
    removeApproval: () => unlink(APPROVAL_PATH),
    ...dependencyOverrides,
  };
  const current = await dependencies.loadCurrent();
  if (JSON.stringify(current) !== JSON.stringify(approval)) {
    throw new StagingWritableCliError(
      "The writable staging approval changed after live-auth began.",
    );
  }

  const markerPath = path.join(
    APP_ROOT,
    ".deployment-readiness",
    `staging-writable-consumed-${approval.runId}.json`,
  );
  try {
    await dependencies.createExclusiveMarker(
      markerPath,
      `${JSON.stringify({
        consumedAt: new Date(dependencies.now()).toISOString(),
        runId: approval.runId,
        schemaVersion: 1,
        sourceCommit: approval.sourceCommit,
      })}\n`,
      0o600,
    );
  } catch {
    throw new StagingWritableCliError(
      "The writable staging approval was already consumed or could not be consumed safely.",
    );
  }
  try {
    await dependencies.removeApproval();
  } catch {
    throw new StagingWritableCliError(
      "The consumed writable staging approval could not be removed before mutation.",
    );
  }
}

export function createWranglerManifestCapture(
  approval: StagingWritableApproval,
  dependencyOverrides: Partial<WranglerManifestDependencies> = {},
): (request: StagingManifestRequest) => Promise<StagingFixtureManifest> {
  const dependencies = {
    ...defaultWranglerManifestDependencies(),
    ...dependencyOverrides,
  } satisfies WranglerManifestDependencies;

  return async (request) => {
    const trackedCreationIds = validateTrackedCreationIds(
      request.trackedCreationIds,
    );
    if (request.phase !== "before" && request.phase !== "after") {
      throw new StagingWritableCliError(
        "The staging manifest phase is outside the fixed acceptance sequence.",
      );
    }

    const d1Payload = await dependencies.runJson([
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
      buildManifestQuery(trackedCreationIds),
      "--json",
    ]);
    const parsed = parseD1Manifest(
      d1Payload,
      trackedCreationIds,
      approval.ownerUserId,
    );
    if (parsed.objects.length > approval.limits.maxPendingR2Objects) {
      throw new StagingWritableCliError(
        "The tracked fixture exceeds the fixed R2 object-count ceiling.",
      );
    }

    const listedR2 = validateListedR2Objects(
      await dependencies.listR2Prefix(trackedCreationIds[0]),
      trackedCreationIds[0],
      approval.limits,
    );
    const d1ObjectsByKey = new Map(
      parsed.objects.map((object) => [object.key, object] as const),
    );
    if (
      listedR2.length !== parsed.objects.length ||
      listedR2.some((object) => {
        const d1Object = d1ObjectsByKey.get(object.key);
        return !d1Object || d1Object.byteSize !== object.size;
      })
    ) {
      throw new StagingWritableCliError(
        "The exact R2 fixture prefix does not match its D1 object manifest.",
      );
    }

    const bucketPayload = await dependencies.runJson([
      "exec",
      "wrangler",
      "r2",
      "bucket",
      "info",
      STAGING_R2_BUCKET,
      "--config",
      WRANGLER_CONFIG,
      "--env",
      "staging",
      "--json",
    ]);
    const totalR2ObjectCount = parseR2ObjectCount(bucketPayload);

    let fixtureR2ObjectBytes = 0;
    for (const object of listedR2) {
      const d1Object = d1ObjectsByKey.get(object.key);
      if (!d1Object) {
        throw new StagingWritableCliError(
          "The exact R2 fixture prefix lost its D1 object manifest.",
        );
      }
      if (
        object.size > approval.limits.maxSingleR2ObjectBytes ||
        fixtureR2ObjectBytes + object.size > approval.limits.fixtureR2Bytes
      ) {
        throw new StagingWritableCliError(
          "The tracked fixture objects exceed the fixed R2 byte ceilings.",
        );
      }
      const streamedObject = await dependencies.streamObjectBytes(
        [
          "exec",
          "wrangler",
          "r2",
          "object",
          "get",
          `${STAGING_R2_BUCKET}/${object.key}`,
          "--remote",
          "--pipe",
          "--config",
          WRANGLER_CONFIG,
          "--env",
          "staging",
        ],
        Math.min(approval.limits.maxSingleR2ObjectBytes, object.size + 1),
      );
      if (
        streamedObject.bytes !== object.size ||
        streamedObject.sha256 !== d1Object.sha256
      ) {
        throw new StagingWritableCliError(
          "A tracked R2 object does not match its exact D1 byte and hash manifest.",
        );
      }
      fixtureR2ObjectBytes += streamedObject.bytes;
    }
    if (totalR2ObjectCount < parsed.objects.length) {
      throw new StagingWritableCliError(
        "The R2 global object count is smaller than the verified fixture scope.",
      );
    }

    const fixtureObjectBytes = parsed.objects.reduce(
      (total, object) => total + object.byteSize,
      0,
    );
    return {
      fixtureActiveCreationRows: parsed.creations.filter(
        (creation) => creation.state !== "deleted",
      ).length,
      fixtureDeletedCreationRows: parsed.creations.filter(
        (creation) => creation.state === "deleted",
      ).length,
      fixtureObjectBytes,
      fixtureObjectRows: parsed.objects.length,
      fixtureR2ObjectBytes,
      fixtureR2ObjectCount: listedR2.length,
      fixtureRevisionRows: parsed.revisions.length,
      totalCreationRows: parsed.summary.total_creation_rows,
      totalObjectBytes: parsed.summary.total_object_bytes,
      totalObjectRows: parsed.summary.total_object_rows,
      totalR2ObjectCount,
      totalRevisionRows: parsed.summary.total_revision_rows,
    };
  };
}

export async function runIntegratedHostedStagingWritable(
  dependencyOverrides: Partial<IntegratedWritableCliDependencies> = {},
): Promise<IntegratedWritableCliResult> {
  const dependencies = {
    consumeApproval: (approval: StagingWritableApproval) =>
      consumeStagingWritableApproval(approval),
    createManifestCapture: (approval: StagingWritableApproval) =>
      createWranglerManifestCapture(approval),
    loadApproval: () => loadStagingWritableApproval(),
    now: Date.now,
    runAcceptance: runHostedStagingWritableAcceptance,
    withSessions: (options, callback) =>
      withStagingLiveAuthSessions(options, callback),
    ...dependencyOverrides,
  } satisfies IntegratedWritableCliDependencies;
  const approval = await dependencies.loadApproval();
  const liveAuthOptions: StagingLiveAuthOptions = {
    baseUrl: approval.target,
    expectedCommunityMutations: true,
    expectedConsultSales: false,
    expectedSourceSha: approval.sourceCommit,
    expectedWorkerVersion: approval.workerVersion,
  };
  const captureManifest = dependencies.createManifestCapture(approval);
  const liveAuth = await dependencies.withSessions(
    liveAuthOptions,
    async (identities, deployment) => {
      const freshApproval = parseStagingWritableApproval(
        approval,
        dependencies.now(),
      );
      const [owner, secondUser] = identities;
      if (
        owner.slot !== "owner" ||
        secondUser.slot !== "second-user" ||
        owner.internalUserId.toLowerCase() !== freshApproval.ownerUserId ||
        secondUser.internalUserId.toLowerCase() !== freshApproval.secondUserId
      ) {
        throw new StagingWritableCliError(
          "The authenticated browser sessions do not match the two approved internal users.",
        );
      }
      await dependencies.consumeApproval(freshApproval);
      return dependencies.runAcceptance({
        baseUrl: freshApproval.target,
        captureManifest,
        expectedSourceCommit: freshApproval.sourceCommit,
        expectedUserId: freshApproval.ownerUserId,
        expectedWorkerVersion: freshApproval.workerVersion,
        fetchImpl: owner.request,
        maxPendingCleanupObjects: freshApproval.limits.maxPendingR2Objects,
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
    identities: liveAuth.identities,
    mutationAttempts: acceptance.mutationAttempts,
    requests: acceptance.requests,
    sessionsRevoked: liveAuth.sessionsRevoked,
    sourceCommit: liveAuth.sourceSha,
    target: liveAuth.target,
    workerVersion: liveAuth.workerVersion,
  };
}

function buildManifestQuery(trackedCreationIds: readonly string[]): string {
  const ids = trackedCreationIds.map((id) => `'${id}'`).join(", ");
  return `SELECT 'summary' AS row_type,
    NULL AS entity_id, NULL AS owner_user_id, NULL AS creation_id,
    NULL AS revision_id, NULL AS state, NULL AS status, NULL AS kind,
    NULL AS object_key, NULL AS byte_size, NULL AS object_sha256,
    (SELECT COUNT(*) FROM creations) AS total_creation_rows,
    (SELECT COUNT(*) FROM creation_revisions) AS total_revision_rows,
    (SELECT COUNT(*) FROM creation_objects) AS total_object_rows,
    COALESCE((SELECT SUM(byte_size) FROM creation_objects), 0) AS total_object_bytes
  UNION ALL
  SELECT 'creation', id, owner_user_id, id, NULL, state, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL
  FROM creations WHERE id IN (${ids})
  UNION ALL
  SELECT 'revision', id, NULL, creation_id, id, NULL, status, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL
  FROM creation_revisions WHERE creation_id IN (${ids})
  UNION ALL
  SELECT 'object', id, NULL, creation_id, revision_id, NULL, status, kind,
    object_key, byte_size, sha256, NULL, NULL, NULL, NULL
  FROM creation_objects WHERE creation_id IN (${ids})
  ORDER BY row_type, entity_id`;
}

function parseD1Manifest(
  payload: unknown,
  trackedCreationIds: readonly string[],
  expectedOwnerUserId: string,
): ParsedD1Manifest {
  if (
    !Array.isArray(payload) ||
    payload.length !== 1 ||
    !isObject(payload[0]) ||
    payload[0].success !== true ||
    !Array.isArray(payload[0].results)
  ) {
    throw new StagingWritableCliError(
      "Wrangler returned an unrecognized D1 manifest response.",
    );
  }
  const rows = payload[0].results;
  const summaryRows = rows.filter(
    (row): row is ManifestSummaryRow =>
      isObject(row) && row.row_type === "summary",
  );
  if (summaryRows.length !== 1) {
    throw new StagingWritableCliError(
      "The D1 manifest did not contain exactly one global summary.",
    );
  }
  const summary = summaryRows[0];
  for (const field of [
    "total_creation_rows",
    "total_revision_rows",
    "total_object_rows",
    "total_object_bytes",
  ] as const) {
    if (!isNonNegativeInteger(summary[field])) {
      throw new StagingWritableCliError(
        "The D1 manifest contained an invalid global total.",
      );
    }
  }

  const trackedIds = new Set(trackedCreationIds);
  const creations: TrackedCreationRow[] = [];
  const revisions: TrackedRevisionRow[] = [];
  const objects: TrackedObjectRow[] = [];
  const seenCreationIds = new Set<string>();
  const seenRevisionIds = new Set<string>();
  const seenObjectIds = new Set<string>();
  const seenObjectKeys = new Set<string>();

  for (const row of rows) {
    if (!isObject(row)) {
      throw new StagingWritableCliError(
        "The D1 manifest contained an invalid tracked row.",
      );
    }
    if (row.row_type === "summary") continue;
    if (row.row_type === "creation") {
      const id = uuidField(row, "entity_id");
      const ownerUserId = uuidField(row, "owner_user_id");
      if (
        !trackedIds.has(id) ||
        ownerUserId !== expectedOwnerUserId ||
        !["deleted", "draft", "hidden", "published"].includes(
          String(row.state),
        ) ||
        seenCreationIds.has(id)
      ) {
        throw new StagingWritableCliError(
          "A D1 creation row escaped the exact approved fixture scope.",
        );
      }
      seenCreationIds.add(id);
      creations.push({
        id,
        ownerUserId,
        state: row.state as TrackedCreationRow["state"],
      });
      continue;
    }
    if (row.row_type === "revision") {
      const id = uuidField(row, "entity_id");
      const creationId = uuidField(row, "creation_id");
      if (
        !trackedIds.has(creationId) ||
        !["failed", "obsolete", "ready", "uploading"].includes(
          String(row.status),
        ) ||
        seenRevisionIds.has(id)
      ) {
        throw new StagingWritableCliError(
          "A D1 revision row escaped the exact approved fixture scope.",
        );
      }
      seenRevisionIds.add(id);
      revisions.push({
        creationId,
        id,
        status: row.status as TrackedRevisionRow["status"],
      });
      continue;
    }
    if (row.row_type === "object") {
      const id = uuidField(row, "entity_id");
      const creationId = uuidField(row, "creation_id");
      const revisionId = uuidField(row, "revision_id");
      if (
        !trackedIds.has(creationId) ||
        !["preview", "project_json", "social", "thumb"].includes(
          String(row.kind),
        ) ||
        !["deleting", "ready"].includes(String(row.status)) ||
        typeof row.object_key !== "string" ||
        !isNonNegativeInteger(row.byte_size) ||
        typeof row.object_sha256 !== "string" ||
        !/^[0-9a-f]{64}$/u.test(row.object_sha256) ||
        seenObjectIds.has(id) ||
        seenObjectKeys.has(row.object_key)
      ) {
        throw new StagingWritableCliError(
          "A D1 object row escaped the exact approved fixture scope.",
        );
      }
      const kind = row.kind as TrackedObjectRow["kind"];
      const expectedKey = `private/creations/${creationId}/${revisionId}/${filenameForKind(kind)}`;
      if (row.object_key !== expectedKey) {
        throw new StagingWritableCliError(
          "A D1 object key does not match the immutable fixture prefix and kind.",
        );
      }
      seenObjectIds.add(id);
      seenObjectKeys.add(row.object_key);
      objects.push({
        byteSize: row.byte_size,
        creationId,
        id,
        key: row.object_key,
        kind,
        revisionId,
        sha256: row.object_sha256,
        status: row.status as TrackedObjectRow["status"],
      });
      continue;
    }
    throw new StagingWritableCliError(
      "The D1 manifest contained an unknown tracked row type.",
    );
  }

  for (const revision of revisions) {
    if (!seenCreationIds.has(revision.creationId)) {
      throw new StagingWritableCliError(
        "A tracked D1 revision has no exact tracked creation row.",
      );
    }
  }
  for (const object of objects) {
    const revision = revisions.find(
      (candidate) => candidate.id === object.revisionId,
    );
    if (!revision || revision.creationId !== object.creationId) {
      throw new StagingWritableCliError(
        "A tracked D1 object has no exact tracked revision row.",
      );
    }
  }
  const fixtureObjectBytes = objects.reduce(
    (total, object) => total + object.byteSize,
    0,
  );
  if (
    summary.total_creation_rows < creations.length ||
    summary.total_revision_rows < revisions.length ||
    summary.total_object_rows < objects.length ||
    summary.total_object_bytes < fixtureObjectBytes
  ) {
    throw new StagingWritableCliError(
      "The D1 global totals are smaller than the exact tracked fixture scope.",
    );
  }
  return { creations, objects, revisions, summary };
}

function parseR2ObjectCount(payload: unknown): number {
  if (!isObject(payload) || payload.name !== STAGING_R2_BUCKET) {
    throw new StagingWritableCliError(
      "Wrangler returned an unrecognized R2 bucket response.",
    );
  }
  const value = payload.object_count;
  if (typeof value === "number" && isNonNegativeInteger(value)) return value;
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+)$/u.test(value)
  ) {
    throw new StagingWritableCliError(
      "The R2 bucket response did not contain a valid global object count.",
    );
  }
  const parsed = Number(value.replaceAll(",", ""));
  if (!Number.isSafeInteger(parsed)) {
    throw new StagingWritableCliError(
      "The R2 global object count is outside the supported range.",
    );
  }
  return parsed;
}

function validateListedR2Objects(
  value: readonly ListedR2Object[],
  creationId: string,
  limits: typeof FIXED_STAGING_WRITABLE_LIMITS,
): ListedR2Object[] {
  if (!Array.isArray(value) || value.length > limits.maxPendingR2Objects) {
    throw new StagingWritableCliError(
      "The exact R2 fixture prefix exceeds its object-count ceiling.",
    );
  }
  const prefix = `private/creations/${creationId}/`;
  const seen = new Set<string>();
  let totalBytes = 0;
  const result: ListedR2Object[] = [];
  for (const object of value) {
    if (
      !isObject(object) ||
      Object.keys(object).length !== 2 ||
      typeof object.key !== "string" ||
      !object.key.startsWith(prefix) ||
      seen.has(object.key) ||
      !isNonNegativeInteger(object.size) ||
      object.size > limits.maxSingleR2ObjectBytes
    ) {
      throw new StagingWritableCliError(
        "The exact R2 fixture prefix contains invalid object metadata.",
      );
    }
    seen.add(object.key);
    totalBytes += object.size;
    if (totalBytes > limits.fixtureR2Bytes) {
      throw new StagingWritableCliError(
        "The exact R2 fixture prefix exceeds its byte ceiling.",
      );
    }
    result.push({ key: object.key, size: object.size });
  }
  result.sort((left, right) => left.key.localeCompare(right.key));
  return result;
}

function validateTrackedCreationIds(ids: readonly string[]): string[] {
  if (
    ids.length !== 1 ||
    !UUID_V4.test(ids[0] ?? "") ||
    new Set(ids.map((id) => id.toLowerCase())).size !== ids.length
  ) {
    throw new StagingWritableCliError(
      "The manifest capture accepts exactly one generated fixture UUIDv4.",
    );
  }
  return ids.map((id) => id.toLowerCase());
}

function filenameForKind(kind: TrackedObjectRow["kind"]): string {
  switch (kind) {
    case "project_json":
      return "project.json";
    case "preview":
      return "preview.webp";
    case "thumb":
      return "thumb.webp";
    case "social":
      return "social.jpg";
  }
}

function exactObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): JsonObject {
  if (!isObject(value)) {
    throw new StagingWritableCliError(`The ${label} must be a JSON object.`);
  }
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new StagingWritableCliError(
      `The ${label} contains missing or unexpected fields.`,
    );
  }
  return value;
}

function parseExactIsoTime(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new StagingWritableCliError(
      "Approval timestamps must be canonical UTC ISO-8601 values.",
    );
  }
  return parsed;
}

function uuidField(row: JsonObject, name: string): string {
  const value = row[name];
  if (typeof value !== "string" || !UUID_V4.test(value)) {
    throw new StagingWritableCliError(
      "A tracked D1 row contains an invalid internal identifier.",
    );
  }
  return value.toLowerCase();
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultApprovalFileDependencies(): ApprovalFileDependencies {
  return {
    isIgnored: async (relativePath) =>
      new Promise((resolve, reject) => {
        const child = spawn(
          "git",
          ["check-ignore", "--quiet", "--", relativePath],
          {
            cwd: APP_ROOT,
            shell: false,
            stdio: "ignore",
          },
        );
        child.once("error", () =>
          reject(
            new StagingWritableCliError(
              "Git could not verify the private approval path.",
            ),
          ),
        );
        child.once("close", (code) => {
          if (code === 0) resolve(true);
          else if (code === 1) resolve(false);
          else {
            reject(
              new StagingWritableCliError(
                "Git could not verify the private approval path.",
              ),
            );
          }
        });
      }),
    now: Date.now,
    readSecureFile: async (absolutePath) => {
      const noFollow =
        (constants as typeof constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ??
        0;
      let handle;
      try {
        handle = await open(absolutePath, constants.O_RDONLY | noFollow);
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size > MAX_APPROVAL_BYTES) {
          throw new StagingWritableCliError(
            "The writable staging approval is not a bounded regular file.",
          );
        }
        return {
          mode: stats.mode,
          text: await handle.readFile({ encoding: "utf8" }),
        };
      } catch (error) {
        if (error instanceof StagingWritableCliError) throw error;
        throw new StagingWritableCliError(
          "The private writable staging approval file could not be opened safely.",
        );
      } finally {
        await handle?.close().catch(() => undefined);
      }
    },
  };
}

function defaultWranglerManifestDependencies(): WranglerManifestDependencies {
  return {
    listR2Prefix: runR2PrefixAuditWorker,
    runJson: async (args) => {
      const result = await runBoundedCommand(args, MAX_JSON_OUTPUT_BYTES, true);
      try {
        return JSON.parse(result.text) as unknown;
      } catch {
        throw new StagingWritableCliError(
          "Wrangler returned invalid JSON during staging reconciliation.",
        );
      }
    },
    streamObjectBytes: async (args, byteCeiling) => {
      const result = await runBoundedCommand(args, byteCeiling, false);
      return { bytes: result.bytes, sha256: result.sha256 };
    },
  };
}

async function runR2PrefixAuditWorker(
  creationId: string,
): Promise<readonly ListedR2Object[]> {
  if (!UUID_V4.test(creationId)) {
    throw new StagingWritableCliError(
      "The R2 prefix audit requires one exact fixture UUIDv4.",
    );
  }
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "tomodachi-r2-audit-"),
  );
  let child: ChildProcess | null = null;
  try {
    const configPath = path.join(temporaryDirectory, "wrangler.json");
    const nonce = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const attestationKey = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const challenge = createHash("sha256")
      .update(`${crypto.randomUUID()}${crypto.randomUUID()}`)
      .digest("hex");
    const port = await availableLoopbackPort();
    await writeFile(
      configPath,
      `${JSON.stringify(
        {
          name: "tomodachi-staging-r2-audit-local-only",
          main: R2_AUDIT_WORKER_PATH,
          compatibility_date: "2025-05-01",
          workers_dev: false,
          preview_urls: false,
          vars: {
            AUDIT_ATTESTATION_KEY: attestationKey,
            AUDIT_NONCE: nonce,
          },
          r2_buckets: [
            {
              binding: "PROJECTS",
              bucket_name: STAGING_R2_BUCKET,
              remote: true,
            },
          ],
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );

    child = spawn(
      "pnpm",
      [
        "exec",
        "wrangler",
        "dev",
        "--config",
        configPath,
        "--ip",
        "127.0.0.1",
        "--port",
        String(port),
        "--latest=false",
        "--log-level",
        "error",
        "--show-interactive-dev-session=false",
      ],
      {
        cwd: APP_ROOT,
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          WRANGLER_LOG_SANITIZE: "true",
          WRANGLER_WRITE_LOGS: "false",
        },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const runningChild = child;
    let outputBytes = 0;
    let exited = false;
    let startupError = false;
    const drain = (chunk: Buffer): void => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_COMMAND_ERROR_BYTES) {
        try {
          signalChildProcess(runningChild, "SIGTERM");
        } catch {
          // The bounded finally path performs the authoritative group shutdown.
        }
      }
    };
    runningChild.stdout?.on("data", drain);
    runningChild.stderr?.on("data", drain);
    runningChild.once("error", () => {
      startupError = true;
    });
    runningChild.once("close", () => {
      exited = true;
    });

    const deadline = Date.now() + R2_AUDIT_STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (outputBytes > MAX_COMMAND_ERROR_BYTES || startupError || exited) {
        throw new StagingWritableCliError(
          "The loopback R2 prefix audit Worker could not start safely.",
        );
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/audit`, {
          body: JSON.stringify({ creationId }),
          headers: {
            "Content-Type": "application/json",
            "X-Tomodachi-Audit-Challenge": challenge,
            "X-Tomodachi-Audit-Nonce": nonce,
          },
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(R2_AUDIT_REQUEST_TIMEOUT_MS),
        });
        if (response.status !== 200) {
          throw new StagingWritableCliError(
            "The loopback R2 prefix audit Worker rejected the bounded read.",
          );
        }
        const body = await readBoundedAuditResponse(response);
        verifyAuditAttestation(
          body,
          challenge,
          attestationKey,
          response.headers.get("x-tomodachi-audit-attestation"),
        );
        let payload: unknown;
        try {
          payload = JSON.parse(body) as unknown;
        } catch {
          throw new StagingWritableCliError(
            "The attested loopback R2 prefix audit response was not valid JSON.",
          );
        }
        return parseR2PrefixAuditPayload(payload);
      } catch (error) {
        if (error instanceof StagingWritableCliError) throw error;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    throw new StagingWritableCliError(
      "The loopback R2 prefix audit Worker did not become ready in time.",
    );
  } finally {
    let shutdownError: unknown;
    try {
      if (child) await stopChildProcess(child);
    } catch (error) {
      shutdownError = error;
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
    if (shutdownError) throw shutdownError;
  }
}

async function availableLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error || port < 1) reject(error ?? new Error("No loopback port."));
        else resolve(port);
      });
    });
  });
}

async function readBoundedAuditResponse(response: Response): Promise<string> {
  const mediaType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new StagingWritableCliError(
      "The loopback R2 prefix audit response was not JSON.",
    );
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    (declaredLength < 0 || declaredLength > MAX_JSON_OUTPUT_BYTES)
  ) {
    throw new StagingWritableCliError(
      "The loopback R2 prefix audit response exceeded its byte ceiling.",
    );
  }
  if (!response.body) {
    throw new StagingWritableCliError(
      "The loopback R2 prefix audit response had no body.",
    );
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_OUTPUT_BYTES) {
        await reader.cancel();
        throw new StagingWritableCliError(
          "The loopback R2 prefix audit response exceeded its byte ceiling.",
        );
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof StagingWritableCliError) throw error;
    throw new StagingWritableCliError(
      "The loopback R2 prefix audit response could not be read safely.",
    );
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

function verifyAuditAttestation(
  body: string,
  challenge: string,
  attestationKey: string,
  received: string | null,
): void {
  const expected = createHmac("sha256", attestationKey)
    .update(`${challenge}.${body}`)
    .digest("base64url");
  if (
    !received ||
    !/^[A-Za-z0-9_-]{43}$/u.test(received) ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  ) {
    throw new StagingWritableCliError(
      "The loopback R2 prefix audit response was not attested by the expected Worker.",
    );
  }
}

function parseR2PrefixAuditPayload(payload: unknown): ListedR2Object[] {
  if (
    !isObject(payload) ||
    Object.keys(payload).length !== 1 ||
    !Array.isArray(payload.objects) ||
    payload.objects.length > FIXED_STAGING_WRITABLE_LIMITS.maxPendingR2Objects
  ) {
    throw new StagingWritableCliError(
      "The loopback R2 prefix audit response was not recognized.",
    );
  }
  return payload.objects.map((object) => {
    if (
      !isObject(object) ||
      Object.keys(object).length !== 2 ||
      typeof object.key !== "string" ||
      !isNonNegativeInteger(object.size)
    ) {
      throw new StagingWritableCliError(
        "The loopback R2 prefix audit returned invalid object metadata.",
      );
    }
    return { key: object.key, size: object.size };
  });
}

async function stopChildProcess(child: ChildProcess): Promise<void> {
  if (process.platform !== "win32" && child.pid) {
    if (isProcessGroupAlive(child.pid)) {
      signalProcessGroup(child.pid, "SIGTERM");
      if (!(await waitForProcessGroupExit(child.pid, 2_000))) {
        signalProcessGroup(child.pid, "SIGKILL");
        if (!(await waitForProcessGroupExit(child.pid, 2_000))) {
          throw new StagingWritableCliError(
            "The loopback R2 prefix audit process group did not terminate safely.",
          );
        }
      }
    }
    await waitForChildClose(child, 500);
    return;
  }

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    if (!(await waitForChildClose(child, 2_000))) {
      child.kill("SIGKILL");
      if (!(await waitForChildClose(child, 2_000))) {
        throw new StagingWritableCliError(
          "The loopback R2 prefix audit Worker did not terminate safely.",
        );
      }
    }
  }
}

function signalChildProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform !== "win32" && child.pid) {
    signalProcessGroup(child.pid, signal);
    return;
  }
  if (!child.kill(signal)) {
    throw new StagingWritableCliError(
      "A read-only Wrangler reconciliation process could not be signaled safely.",
    );
  }
}

function isProcessGroupAlive(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function signalProcessGroup(
  processGroupId: number,
  signal: NodeJS.Signals,
): void {
  try {
    process.kill(-processGroupId, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw new StagingWritableCliError(
        "A read-only Wrangler reconciliation process group could not be signaled safely.",
      );
    }
  }
}

async function waitForProcessGroupExit(
  processGroupId: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessGroupAlive(processGroupId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !isProcessGroupAlive(processGroupId);
}

async function waitForChildClose(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    child.once("close", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

async function runBoundedCommand(
  args: readonly string[],
  stdoutCeiling: number,
  retainText: boolean,
): Promise<{ bytes: number; sha256: string; text: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", [...args], {
      cwd: APP_ROOT,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        WRANGLER_LOG_SANITIZE: "true",
        WRANGLER_WRITE_LOGS: "false",
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let bytes = 0;
    let errorBytes = 0;
    let exceeded = false;
    let timedOut = false;
    let text = "";
    const hash = createHash("sha256");
    let stopPromise: Promise<void> | null = null;
    const requestStop = (): void => {
      stopPromise ??= stopChildProcess(child);
      void stopPromise.catch(() => undefined);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      requestStop();
    }, WRANGLER_READ_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > stdoutCeiling) {
        exceeded = true;
        requestStop();
        return;
      }
      hash.update(chunk);
      if (retainText) text += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorBytes += chunk.byteLength;
      if (errorBytes > MAX_COMMAND_ERROR_BYTES) {
        exceeded = true;
        requestStop();
      }
      // Intentionally drained without retaining or logging Wrangler output.
    });
    child.once("error", () => {
      clearTimeout(timeout);
      reject(
        new StagingWritableCliError(
          "A required read-only Wrangler reconciliation command could not start.",
        ),
      );
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      void (stopPromise ?? stopChildProcess(child))
        .then(() => {
          if (timedOut) {
            reject(
              new StagingWritableCliError(
                "A required read-only Wrangler reconciliation command timed out.",
              ),
            );
          } else if (exceeded) {
            reject(
              new StagingWritableCliError(
                "A read-only Wrangler reconciliation command exceeded its byte ceiling.",
              ),
            );
          } else if (code !== 0) {
            reject(
              new StagingWritableCliError(
                "A required read-only Wrangler reconciliation command failed.",
              ),
            );
          } else {
            resolve({ bytes, sha256: hash.digest("hex"), text });
          }
        })
        .catch(() => {
          reject(
            new StagingWritableCliError(
              "A required read-only Wrangler reconciliation process did not terminate safely.",
            ),
          );
        });
    });
  });
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new StagingWritableCliError(
      "This command accepts no CLI values; use the fixed private approval file.",
    );
  }
  const result = await runIntegratedHostedStagingWritable();
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
        : "StagingWritableCliError: The integrated staging acceptance failed.",
    );
    process.exitCode = 1;
  });
}
