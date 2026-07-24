import { constants } from "node:fs";
import { open, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FIXED_P4_PHASE_A_LIMITS } from "./verify-hosted-staging-p4-phase-a";

type JsonObject = Record<string, unknown>;

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const P4_PHASE_A_APPROVAL_PATH = path.join(
  APP_ROOT,
  ".deployment-readiness",
  "staging-p4-phase-a.json",
);
const APPROVAL_RELATIVE_PATH = ".deployment-readiness/staging-p4-phase-a.json";
const STAGING_ORIGIN = "https://staging.tomodachi.pw";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const COMMIT_SHA = /^[0-9a-f]{40}$/iu;
const MAX_APPROVAL_BYTES = 32 * 1_024;
const MAX_APPROVAL_AGE_MS = 15 * 60 * 1_000;
const MAX_APPROVAL_LIFETIME_MS = 30 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 30 * 1_000;

export const FIXED_P4_PHASE_A_OPERATIONS = Object.freeze([
  "auth.session.read",
  "creation.create",
  "creation.owner.read",
  "creation.crossUser.denial",
  "project.save",
  "project.conflict",
  "creation.publish",
  "creation.unpublish",
  "creation.delete",
  "creation.public.directRead",
  "creation.public.discoveryRead",
  "creation.media.privateDenial",
  "creation.media.projectPermission",
  "showcase.ticket.crossUserDenial",
  "like.idempotency",
  "follow.idempotency",
  "comment.lifecycle",
  "comment.crossAuthorDenial",
  "comment.disabledDenial",
  "moderation.readRoleBoundary",
]);

export const FIXED_P4_PHASE_A_CONFIRMATIONS = Object.freeze({
  cleanupRequired: true,
  communityMutationsEnabled: true,
  consultSalesDisabled: true,
  exactSourceAndWorkerApproved: true,
  noFallbackD1R2Writes: true,
  noMediaUploadsReportsOrModerationMutations: true,
  noProductionDnsSecretsMigrationsOAuthOrRoles: true,
  normalOwnerApiCleanupOnly: true,
  retainImmutableAuditHistory: true,
  syntheticFixturesOnly: true,
  twoNamedInternalUsersApproved: true,
});

export interface P4PhaseAApproval {
  confirmations: typeof FIXED_P4_PHASE_A_CONFIRMATIONS;
  environment: "staging";
  expiresAt: string;
  issuedAt: string;
  limits: typeof FIXED_P4_PHASE_A_LIMITS;
  operations: typeof FIXED_P4_PHASE_A_OPERATIONS;
  ownerUserId: string;
  phase: "p4-phase-a";
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

export class P4PhaseAApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P4PhaseAApprovalError";
  }
}

export function parseP4PhaseAApproval(
  value: unknown,
  now = Date.now(),
): P4PhaseAApproval {
  const approval = exactObject(
    value,
    [
      "confirmations",
      "environment",
      "expiresAt",
      "issuedAt",
      "limits",
      "operations",
      "ownerUserId",
      "phase",
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
    approval.phase !== "p4-phase-a" ||
    approval.environment !== "staging" ||
    approval.target !== STAGING_ORIGIN ||
    typeof approval.sourceCommit !== "string" ||
    !COMMIT_SHA.test(approval.sourceCommit) ||
    typeof approval.workerVersion !== "string" ||
    !UUID_V4.test(approval.workerVersion) ||
    typeof approval.ownerUserId !== "string" ||
    !UUID_V4.test(approval.ownerUserId) ||
    typeof approval.secondUserId !== "string" ||
    !UUID_V4.test(approval.secondUserId) ||
    approval.ownerUserId.toLowerCase() ===
      approval.secondUserId.toLowerCase() ||
    typeof approval.runId !== "string" ||
    !UUID_V4.test(approval.runId)
  ) {
    throw new P4PhaseAApprovalError(
      "The P4 phase A approval is not bound to one exact staging release, run, admin, and distinct second user.",
    );
  }

  const operations = exactStringArray(approval.operations, "operations");
  if (
    JSON.stringify(operations) !== JSON.stringify(FIXED_P4_PHASE_A_OPERATIONS)
  ) {
    throw new P4PhaseAApprovalError(
      "The P4 phase A approval operation allowlist is not exact.",
    );
  }
  const limits = exactObject(
    approval.limits,
    Object.keys(FIXED_P4_PHASE_A_LIMITS),
    "limits",
  );
  for (const [key, expected] of Object.entries(FIXED_P4_PHASE_A_LIMITS)) {
    if (limits[key] !== expected) {
      throw new P4PhaseAApprovalError(
        "The P4 phase A approval does not match the fixed request, write, object, and byte ceilings.",
      );
    }
  }
  const confirmations = exactObject(
    approval.confirmations,
    Object.keys(FIXED_P4_PHASE_A_CONFIRMATIONS),
    "confirmations",
  );
  for (const key of Object.keys(FIXED_P4_PHASE_A_CONFIRMATIONS)) {
    if (confirmations[key] !== true) {
      throw new P4PhaseAApprovalError(
        "The P4 phase A approval is missing a required cleanup or safety confirmation.",
      );
    }
  }

  if (
    typeof approval.issuedAt !== "string" ||
    typeof approval.expiresAt !== "string"
  ) {
    throw new P4PhaseAApprovalError(
      "The P4 phase A approval requires an explicit short validity window.",
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
    throw new P4PhaseAApprovalError(
      "The P4 phase A approval is stale, premature, expired, or valid for too long.",
    );
  }

  return {
    confirmations: FIXED_P4_PHASE_A_CONFIRMATIONS,
    environment: "staging",
    expiresAt: approval.expiresAt,
    issuedAt: approval.issuedAt,
    limits: FIXED_P4_PHASE_A_LIMITS,
    operations: FIXED_P4_PHASE_A_OPERATIONS,
    ownerUserId: approval.ownerUserId.toLowerCase(),
    phase: "p4-phase-a",
    runId: approval.runId.toLowerCase(),
    schemaVersion: 1,
    secondUserId: approval.secondUserId.toLowerCase(),
    sourceCommit: approval.sourceCommit.toLowerCase(),
    target: STAGING_ORIGIN,
    workerVersion: approval.workerVersion.toLowerCase(),
  };
}

export async function loadP4PhaseAApproval(
  absolutePath = P4_PHASE_A_APPROVAL_PATH,
  overrides: Partial<ApprovalFileDependencies> = {},
): Promise<P4PhaseAApproval> {
  if (path.resolve(absolutePath) !== P4_PHASE_A_APPROVAL_PATH) {
    throw new P4PhaseAApprovalError(
      "The P4 phase A approval must use the fixed private readiness path.",
    );
  }
  const dependencies = {
    ...defaultApprovalFileDependencies(),
    ...overrides,
  } satisfies ApprovalFileDependencies;
  if (!(await dependencies.isIgnored(APPROVAL_RELATIVE_PATH))) {
    throw new P4PhaseAApprovalError(
      "The P4 phase A approval path is not protected by Git ignore rules.",
    );
  }
  const file = await dependencies.readSecureFile(absolutePath);
  if ((file.mode & 0o777) !== 0o600) {
    throw new P4PhaseAApprovalError(
      "The P4 phase A approval file must have mode 0600.",
    );
  }
  if (Buffer.byteLength(file.text) > MAX_APPROVAL_BYTES) {
    throw new P4PhaseAApprovalError(
      "The P4 phase A approval file exceeds its byte ceiling.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch {
    throw new P4PhaseAApprovalError(
      "The P4 phase A approval file is not valid JSON.",
    );
  }
  return parseP4PhaseAApproval(parsed, dependencies.now());
}

export async function consumeP4PhaseAApproval(
  approval: P4PhaseAApproval,
  overrides: Partial<{
    createExclusiveMarker(
      absolutePath: string,
      text: string,
      mode: number,
    ): Promise<void>;
    loadCurrent(): Promise<P4PhaseAApproval>;
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
        await handle.writeFile(text, "utf8");
      } finally {
        await handle?.close().catch(() => undefined);
      }
    },
    loadCurrent: () => loadP4PhaseAApproval(),
    now: Date.now,
    removeApproval: () => unlink(P4_PHASE_A_APPROVAL_PATH),
    ...overrides,
  };
  const current = await dependencies.loadCurrent();
  if (JSON.stringify(current) !== JSON.stringify(approval)) {
    throw new P4PhaseAApprovalError(
      "The P4 phase A approval changed after authentication began.",
    );
  }
  const marker = path.join(
    APP_ROOT,
    ".deployment-readiness",
    `staging-p4-phase-a-consumed-${approval.runId}.json`,
  );
  try {
    await dependencies.createExclusiveMarker(
      marker,
      `${JSON.stringify({
        consumedAt: new Date(dependencies.now()).toISOString(),
        phase: approval.phase,
        runId: approval.runId,
        schemaVersion: approval.schemaVersion,
        sourceCommit: approval.sourceCommit,
      })}\n`,
      0o600,
    );
  } catch {
    throw new P4PhaseAApprovalError(
      "The P4 phase A approval was already consumed or could not be consumed safely.",
    );
  }
  try {
    await dependencies.removeApproval();
  } catch {
    throw new P4PhaseAApprovalError(
      "The consumed P4 phase A approval could not be removed before mutation.",
    );
  }
}

function defaultApprovalFileDependencies(): ApprovalFileDependencies {
  return {
    isIgnored: async (relativePath) => {
      const child = await import("node:child_process");
      return new Promise<boolean>((resolve, reject) => {
        const process = child.spawn(
          "git",
          ["check-ignore", "--quiet", "--", relativePath],
          {
            cwd: APP_ROOT,
            stdio: "ignore",
          },
        );
        process.once("error", () =>
          reject(
            new P4PhaseAApprovalError(
              "Git could not verify the private approval path.",
            ),
          ),
        );
        process.once("close", (code) => resolve(code === 0));
      });
    },
    now: Date.now,
    readSecureFile: async (absolutePath) => {
      const noFollow =
        (constants as typeof constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ??
        0;
      let handle;
      try {
        handle = await open(absolutePath, constants.O_RDONLY | noFollow);
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > MAX_APPROVAL_BYTES) {
          throw new P4PhaseAApprovalError(
            "The P4 phase A approval is not a bounded regular file.",
          );
        }
        return {
          mode: stat.mode,
          text: await handle.readFile({ encoding: "utf8" }),
        };
      } catch (error) {
        if (error instanceof P4PhaseAApprovalError) throw error;
        throw new P4PhaseAApprovalError(
          "The private P4 phase A approval file could not be opened safely.",
        );
      } finally {
        await handle?.close().catch(() => undefined);
      }
    },
  };
}

function exactObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): JsonObject {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...expectedKeys].sort())
  ) {
    throw new P4PhaseAApprovalError(
      `The P4 phase A ${label} has an invalid shape.`,
    );
  }
  return value as JsonObject;
}

function exactStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new P4PhaseAApprovalError(
      `The P4 phase A ${label} must be an exact string array.`,
    );
  }
  return [...value];
}

function parseExactIsoTime(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    throw new P4PhaseAApprovalError(
      "P4 phase A approval timestamps must be exact UTC millisecond timestamps.",
    );
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new P4PhaseAApprovalError(
      "P4 phase A approval timestamps are invalid.",
    );
  }
  return parsed;
}
