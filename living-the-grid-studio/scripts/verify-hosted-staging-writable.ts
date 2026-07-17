import {
  canonicalizeGridDocument,
  type CanonicalGridDocument,
} from "../shared/community";
import {
  readBoundedResponseText,
  type AcceptanceFetch,
} from "./verify-hosted-read-only";

type JsonObject = Record<string, unknown>;

export interface StagingDeploymentEvidence {
  communityMutationsEnabled: boolean;
  environment: string;
  origin: string;
  sourceCommit: string;
  workerVersion: string;
}

export interface StagingFixtureManifest {
  fixtureActiveCreationRows: number;
  fixtureDeletedCreationRows: number;
  fixtureObjectBytes: number;
  fixtureObjectRows: number;
  fixtureR2ObjectBytes: number;
  fixtureR2ObjectCount: number;
  fixtureRevisionRows: number;
  totalCreationRows: number;
  totalObjectBytes: number;
  totalObjectRows: number;
  totalR2ObjectCount: number;
  totalRevisionRows: number;
}

export interface StagingManifestRequest {
  phase: "before" | "after";
  trackedCreationIds: readonly string[];
}

export interface HostedStagingWritableOptions {
  baseUrl: string;
  captureManifest(
    request: StagingManifestRequest,
  ): Promise<StagingFixtureManifest>;
  expectedSourceCommit: string;
  expectedUserId: string;
  expectedWorkerVersion: string;
  fetchImpl: AcceptanceFetch;
  maxPendingCleanupObjects?: number;
  timeoutMs?: number;
  /** Test-only timing override. Remote/CLI callers must use the bounded defaults. */
  cleanupRetryDelaysMs?: readonly number[];
  /** Test-only escape hatch. Remote/CLI callers must never enable this. */
  unsafeAllowLoopbackFixture?: boolean;
  verifyDeployment(): Promise<StagingDeploymentEvidence>;
}

export interface HostedStagingWritableResult {
  assertions: number;
  cleanup: "verified";
  deployment: {
    communityMutations: "enabled";
    sourceCommit: string;
    workerVersion: string;
  };
  manifests: {
    after: StagingFixtureManifest;
    before: StagingFixtureManifest;
  };
  mutationAttempts: number;
  requests: number;
  target: string;
}

export interface WritableRequestPolicyState {
  expectedSourceCommit: string;
  expectedWorkerVersion: string;
  fixtureCreationId: string | null;
  fixtureEtags: string[];
  fixtureName: string;
}

export class HostedStagingWritableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedStagingWritableError";
  }
}

const STAGING_ORIGIN = "https://staging.tomodachi.pw";
const PRODUCTION_HOSTS = new Set(["tomodachi.pw", "www.tomodachi.pw"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const COMMIT_SHA = /^[0-9a-f]{40}$/iu;
const REVISION_ETAG = /^"rev-[1-9][0-9]*"$/u;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_REQUEST_BODY_BYTES = 128 * 1_024;
const MAX_RESPONSE_BYTES = 512 * 1_024;
const MAX_REQUESTS = 11;
const MAX_MUTATION_ATTEMPTS = 9;
const DEFAULT_MAX_PENDING_CLEANUP_OBJECTS = 16;
const MAX_FIXTURE_OBJECT_BYTES = 4 * 1_024 * 1_024;
const DEFAULT_CLEANUP_RETRY_DELAYS_MS = [500, 2_000, 7_500, 20_000] as const;
const MAX_CLEANUP_RETRY_DELAY_TOTAL_MS = 30_000;
const ALLOWED_HEADERS = new Set([
  "accept",
  "content-type",
  "if-match",
  "origin",
  "user-agent",
]);

interface RunCounters {
  mutationAttempts: number;
  requests: number;
}

interface ExpectedResponse {
  label: string;
  statuses: readonly number[];
}

interface ParsedApiResponse {
  body: JsonObject;
  response: Response;
}

export function parseHostedStagingWritableTarget(
  raw: string,
  options: { allowLoopback?: boolean } = {},
): URL {
  if (!raw.trim()) {
    throw new HostedStagingWritableError(
      "An explicit staging base URL is required; there is no default target.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new HostedStagingWritableError(
      "The writable acceptance target is not a valid URL.",
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(hostname)) {
    throw new HostedStagingWritableError(
      "Production hosts are forbidden for the writable staging harness.",
    );
  }
  if (parsed.username || parsed.password) {
    throw new HostedStagingWritableError(
      "The writable acceptance target must not contain credentials.",
    );
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new HostedStagingWritableError(
      "The writable acceptance target must be an origin with no path, query, or fragment.",
    );
  }

  if (parsed.origin === STAGING_ORIGIN) return new URL(`${STAGING_ORIGIN}/`);
  if (
    options.allowLoopback === true &&
    LOOPBACK_HOSTS.has(hostname) &&
    (parsed.protocol === "http:" || parsed.protocol === "https:")
  ) {
    return new URL(`${parsed.origin}/`);
  }
  throw new HostedStagingWritableError(
    "The host is not in the writable acceptance allowlist.",
  );
}

export function validateStagingDeploymentEvidence(
  evidence: StagingDeploymentEvidence,
  expected: {
    origin: string;
    sourceCommit: string;
    workerVersion: string;
  },
): void {
  if (!COMMIT_SHA.test(expected.sourceCommit)) {
    throw new HostedStagingWritableError(
      "The expected source commit must be a full 40-character Git SHA.",
    );
  }
  if (!UUID_V4.test(expected.workerVersion)) {
    throw new HostedStagingWritableError(
      "The expected Worker version must be a UUIDv4.",
    );
  }
  if (
    evidence.environment !== "staging" ||
    evidence.origin !== expected.origin ||
    evidence.sourceCommit.toLowerCase() !==
      expected.sourceCommit.toLowerCase() ||
    evidence.workerVersion.toLowerCase() !==
      expected.workerVersion.toLowerCase() ||
    evidence.communityMutationsEnabled !== true
  ) {
    throw new HostedStagingWritableError(
      "Deployment evidence does not match the approved staging source, Worker version, origin, and writable flag.",
    );
  }
}

export function assertWritableRequestAllowed(
  target: URL,
  relativePath: string,
  init: RequestInit,
  state: WritableRequestPolicyState,
): URL {
  if (!relativePath.startsWith("/") || relativePath.startsWith("//")) {
    throw new HostedStagingWritableError(
      "Writable acceptance requests must use a site-relative absolute path.",
    );
  }
  const url = new URL(relativePath, target);
  if (
    url.origin !== target.origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  ) {
    throw new HostedStagingWritableError(
      "Writable acceptance requests must stay on the selected origin without query or fragment data.",
    );
  }

  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  for (const header of headers.keys()) {
    if (!ALLOWED_HEADERS.has(header)) {
      throw new HostedStagingWritableError(
        "A request header is outside the writable acceptance allowlist.",
      );
    }
  }
  if (headers.has("authorization") || headers.has("cookie")) {
    throw new HostedStagingWritableError(
      "Credential values must be supplied only by the in-memory browser session.",
    );
  }

  const isSessionRead =
    method === "GET" && url.pathname === "/api/auth/session";
  const isCreationCreate =
    method === "POST" && url.pathname === "/api/creations";
  const creationPath = state.fixtureCreationId
    ? `/api/creations/${encodeURIComponent(state.fixtureCreationId)}`
    : null;
  const isCreationRead =
    creationPath !== null && method === "GET" && url.pathname === creationPath;
  const isCreationDelete =
    creationPath !== null &&
    method === "DELETE" &&
    url.pathname === creationPath;
  const isProjectSave =
    creationPath !== null &&
    method === "PUT" &&
    url.pathname === `${creationPath}/project`;

  if (
    !isSessionRead &&
    !isCreationCreate &&
    !isCreationRead &&
    !isCreationDelete &&
    !isProjectSave
  ) {
    throw new HostedStagingWritableError(
      "The route or object ID is outside the writable acceptance allowlist.",
    );
  }

  if (method === "GET") {
    if (
      headers.has("content-type") ||
      headers.has("if-match") ||
      headers.has("origin")
    ) {
      throw new HostedStagingWritableError(
        "Mutation-only headers are forbidden on writable acceptance GET requests.",
      );
    }
    if (init.body !== undefined && init.body !== null) {
      throw new HostedStagingWritableError(
        "Writable acceptance GET requests cannot have a body.",
      );
    }
    return url;
  }

  if (headers.get("origin") !== target.origin) {
    throw new HostedStagingWritableError(
      "Every writable acceptance mutation requires the exact staging Origin.",
    );
  }
  if (headers.get("content-type")?.toLowerCase() !== "application/json") {
    throw new HostedStagingWritableError(
      "Every writable acceptance mutation must use application/json.",
    );
  }
  if (typeof init.body !== "string") {
    throw new HostedStagingWritableError(
      "Writable acceptance bodies must be bounded JSON strings.",
    );
  }
  if (new TextEncoder().encode(init.body).byteLength > MAX_REQUEST_BODY_BYTES) {
    throw new HostedStagingWritableError(
      `A writable acceptance body exceeds ${MAX_REQUEST_BODY_BYTES} bytes.`,
    );
  }

  const body = parseJsonObject(init.body, "Writable acceptance request");
  if (isCreationCreate || isProjectSave) {
    const expectedKeys = isCreationCreate
      ? ["id", "project", "title"]
      : ["project"];
    if (
      JSON.stringify(Object.keys(body).sort()) !==
      JSON.stringify(expectedKeys.sort())
    ) {
      throw new HostedStagingWritableError(
        "A writable acceptance request has fields outside the fixed fixture schema.",
      );
    }
    const project = isJsonObject(body.project) ? body.project : null;
    const meta = project && isJsonObject(project.meta) ? project.meta : null;
    if (!meta || meta.name !== state.fixtureName) {
      throw new HostedStagingWritableError(
        "A writable acceptance project is not bound to this fixture run.",
      );
    }
  }
  if (isCreationCreate && body.title !== state.fixtureName) {
    throw new HostedStagingWritableError(
      "The writable acceptance creation is not bound to this fixture run.",
    );
  }
  if (isCreationCreate && body.id !== state.fixtureCreationId) {
    throw new HostedStagingWritableError(
      "The writable acceptance creation ID is not bound to this fixture run.",
    );
  }
  if (isProjectSave) {
    const ifMatch = headers.get("if-match") ?? "";
    if (!REVISION_ETAG.test(ifMatch) || !state.fixtureEtags.includes(ifMatch)) {
      throw new HostedStagingWritableError(
        "A project save requires an ETag observed during this fixture run.",
      );
    }
  } else if (headers.has("if-match")) {
    throw new HostedStagingWritableError(
      "If-Match is allowed only for the tracked fixture project save.",
    );
  }
  if (isCreationDelete && Object.keys(body).length !== 0) {
    throw new HostedStagingWritableError(
      "Fixture cleanup must use an empty JSON object.",
    );
  }
  return url;
}

export async function runHostedStagingWritableAcceptance(
  options: HostedStagingWritableOptions,
): Promise<HostedStagingWritableResult> {
  const target = parseHostedStagingWritableTarget(options.baseUrl, {
    allowLoopback: options.unsafeAllowLoopbackFixture === true,
  });
  if (!COMMIT_SHA.test(options.expectedSourceCommit)) {
    throw new HostedStagingWritableError(
      "The expected source commit must be a full 40-character Git SHA.",
    );
  }
  if (!UUID_V4.test(options.expectedWorkerVersion)) {
    throw new HostedStagingWritableError(
      "The expected Worker version must be a UUIDv4.",
    );
  }
  if (!UUID_V4.test(options.expectedUserId)) {
    throw new HostedStagingWritableError(
      "The approved staging user must be identified by one internal UUIDv4.",
    );
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new HostedStagingWritableError(
      "timeoutMs must be an integer between 1 and 60000.",
    );
  }
  const maxPendingCleanupObjects =
    options.maxPendingCleanupObjects ?? DEFAULT_MAX_PENDING_CLEANUP_OBJECTS;
  if (
    !Number.isInteger(maxPendingCleanupObjects) ||
    maxPendingCleanupObjects < 0 ||
    maxPendingCleanupObjects > 64
  ) {
    throw new HostedStagingWritableError(
      "maxPendingCleanupObjects must be an integer between 0 and 64.",
    );
  }
  const cleanupRetryDelaysMs = validateCleanupRetryDelays(
    options.cleanupRetryDelaysMs ?? DEFAULT_CLEANUP_RETRY_DELAYS_MS,
  );

  const evidence = await runExternalStep(
    options.verifyDeployment,
    "Deployment evidence could not be verified safely.",
  );
  validateStagingDeploymentEvidence(evidence, {
    origin: target.origin,
    sourceCommit: options.expectedSourceCommit,
    workerVersion: options.expectedWorkerVersion,
  });

  const counters: RunCounters = { mutationAttempts: 0, requests: 0 };
  let assertions = 0;
  const expect = (condition: boolean, label: string): void => {
    assertions += 1;
    if (!condition) throw new HostedStagingWritableError(label);
  };

  const runToken = crypto.randomUUID();
  const fixtureName = `Acceptance ${runToken}`;
  const state: WritableRequestPolicyState = {
    expectedSourceCommit: options.expectedSourceCommit.toLowerCase(),
    expectedWorkerVersion: options.expectedWorkerVersion.toLowerCase(),
    fixtureCreationId: runToken,
    fixtureEtags: [],
    fixtureName,
  };
  const trackedCreationIds = [runToken];
  const before = validateManifest(
    await runExternalStep(
      () => options.captureManifest({ phase: "before", trackedCreationIds }),
      "The pre-run fixture manifest could not be captured safely.",
    ),
  );
  expect(
    before.fixtureActiveCreationRows === 0 &&
      before.fixtureDeletedCreationRows === 0 &&
      before.fixtureObjectRows === 0 &&
      before.fixtureObjectBytes === 0 &&
      before.fixtureR2ObjectCount === 0 &&
      before.fixtureR2ObjectBytes === 0 &&
      before.fixtureRevisionRows === 0,
    "The pre-run manifest contains rows for the new fixture scope.",
  );

  let after: StagingFixtureManifest | null = null;
  let runFailure: unknown;
  let cleanupFailure: unknown;
  let creationAttempted = false;
  try {
    const session = await apiRequest(
      target,
      "/api/auth/session",
      { headers: { Accept: "application/json" } },
      state,
      counters,
      options.fetchImpl,
      timeoutMs,
      { label: "authenticated session preflight", statuses: [200] },
    );
    const sessionData = objectAt(session.body, "data", "Session envelope");
    const sessionUser = objectAt(sessionData, "user", "Session user");
    expect(
      sessionUser.id === options.expectedUserId,
      "The browser session does not belong to the approved staging user.",
    );
    expect(
      typeof sessionUser.username === "string" &&
        sessionUser.username.length >= 3,
      "The browser session has not completed onboarding.",
    );

    creationAttempted = true;
    const created = await apiRequest(
      target,
      "/api/creations",
      jsonMutation("POST", target.origin, {
        id: runToken,
        project: fixtureProject(fixtureName, 1),
        title: fixtureName,
      }),
      state,
      counters,
      options.fetchImpl,
      timeoutMs,
      { label: "fixture creation", statuses: [201] },
    );
    const createdData = objectAt(created.body, "data", "Creation envelope");
    const creationId = String(createdData.id ?? "");
    expect(
      UUID_V4.test(creationId),
      "The fixture creation returned an invalid ID.",
    );
    expect(
      createdData.state === "draft",
      "The fixture creation was not a draft.",
    );
    expect(
      createdData.visibility === "private",
      "The fixture creation was not private.",
    );
    const firstEtag = created.response.headers.get("etag") ?? "";
    expect(
      REVISION_ETAG.test(firstEtag),
      "The fixture creation lacks a revision ETag.",
    );
    state.fixtureEtags.push(firstEtag);
    expect(
      creationId === runToken,
      "The fixture creation did not preserve its approved client UUID.",
    );

    const owned = await apiRequest(
      target,
      `/api/creations/${encodeURIComponent(creationId)}`,
      { headers: { Accept: "application/json" } },
      state,
      counters,
      options.fetchImpl,
      timeoutMs,
      { label: "fixture read-back", statuses: [200] },
    );
    const ownedData = objectAt(owned.body, "data", "Owned creation envelope");
    const ownedCreation = objectAt(ownedData, "creation", "Owned creation");
    const ownedProject = objectAt(ownedData, "project", "Owned project");
    const ownedMeta = objectAt(ownedProject, "meta", "Owned project metadata");
    expect(
      ownedCreation.id === creationId,
      "The fixture read-back returned another object.",
    );
    expect(
      ownedMeta.name === fixtureName,
      "The fixture read-back returned another project.",
    );

    const saved = await apiRequest(
      target,
      `/api/creations/${encodeURIComponent(creationId)}/project`,
      jsonMutation(
        "PUT",
        target.origin,
        { project: fixtureProject(fixtureName, 2) },
        { "If-Match": firstEtag },
      ),
      state,
      counters,
      options.fetchImpl,
      timeoutMs,
      { label: "fixture revision save", statuses: [200] },
    );
    const savedData = objectAt(saved.body, "data", "Saved creation envelope");
    const nextEtag = saved.response.headers.get("etag") ?? "";
    expect(
      savedData.id === creationId,
      "The revision save returned another object.",
    );
    expect(
      REVISION_ETAG.test(nextEtag),
      "The revision save lacks a valid ETag.",
    );
    expect(
      nextEtag !== firstEtag,
      "The revision save did not advance the ETag.",
    );
    state.fixtureEtags.push(nextEtag);

    const conflict = await apiRequest(
      target,
      `/api/creations/${encodeURIComponent(creationId)}/project`,
      jsonMutation(
        "PUT",
        target.origin,
        { project: fixtureProject(fixtureName, 3) },
        { "If-Match": firstEtag },
      ),
      state,
      counters,
      options.fetchImpl,
      timeoutMs,
      { label: "stale revision conflict", statuses: [409] },
    );
    const conflictError = objectAt(conflict.body, "error", "Conflict envelope");
    expect(
      conflictError.code === "REVISION_CONFLICT",
      "A stale revision did not fail with REVISION_CONFLICT.",
    );
    expect(
      conflictError.currentEtag === nextEtag,
      "The conflict response did not identify the current revision.",
    );
  } catch (error) {
    runFailure = error;
  } finally {
    try {
      await cleanupTrackedCreation({
        attempted: creationAttempted,
        cleanupRetryDelaysMs,
        counters,
        fetchImpl: options.fetchImpl,
        state,
        target,
        timeoutMs,
      });
    } catch (error) {
      cleanupFailure = error;
    }
    try {
      after = validateManifest(
        await runExternalStep(
          () =>
            options.captureManifest({
              phase: "after",
              trackedCreationIds: [...trackedCreationIds],
            }),
          "The post-run fixture manifest could not be captured safely.",
        ),
      );
      expect(
        after.fixtureActiveCreationRows === 0 &&
          after.fixtureDeletedCreationRows <= 1 &&
          after.fixtureRevisionRows <= 2,
        "The post-run manifest contains active fixture rows.",
      );
      expect(
        after.fixtureObjectRows <= maxPendingCleanupObjects &&
          after.fixtureR2ObjectCount <= maxPendingCleanupObjects &&
          after.fixtureObjectBytes <= MAX_FIXTURE_OBJECT_BYTES &&
          after.fixtureR2ObjectBytes <= MAX_FIXTURE_OBJECT_BYTES,
        "The post-run manifest exceeds the approved pending-cleanup object ceiling.",
      );
      expect(
        after.fixtureObjectRows === after.fixtureR2ObjectCount &&
          after.fixtureObjectBytes === after.fixtureR2ObjectBytes,
        "The post-run D1 object manifest does not match the exact R2 fixture prefix.",
      );
      assertManifestDelta(
        before,
        after,
        trackedCreationIds.length,
        maxPendingCleanupObjects,
        expect,
      );
    } catch (error) {
      cleanupFailure ??= error;
    }
  }

  if (runFailure && cleanupFailure) {
    throw new HostedStagingWritableError(
      "Writable acceptance failed and cleanup or reconciliation also failed.",
    );
  }
  if (runFailure)
    throw sanitizeFailure(
      runFailure,
      "Writable acceptance stopped at its first failed assertion.",
    );
  if (cleanupFailure || !after) {
    throw sanitizeFailure(
      cleanupFailure,
      "Writable acceptance cleanup or reconciliation failed.",
    );
  }
  expect(
    counters.requests <= MAX_REQUESTS,
    "The writable acceptance request ceiling was exceeded.",
  );
  expect(
    counters.mutationAttempts <= MAX_MUTATION_ATTEMPTS,
    "The writable acceptance mutation ceiling was exceeded.",
  );

  return {
    assertions,
    cleanup: "verified",
    deployment: {
      communityMutations: "enabled",
      sourceCommit: evidence.sourceCommit.toLowerCase(),
      workerVersion: evidence.workerVersion.toLowerCase(),
    },
    manifests: { after, before },
    mutationAttempts: counters.mutationAttempts,
    requests: counters.requests,
    target: target.origin,
  };
}

async function cleanupTrackedCreation(input: {
  attempted: boolean;
  cleanupRetryDelaysMs: readonly number[];
  counters: RunCounters;
  fetchImpl: AcceptanceFetch;
  state: WritableRequestPolicyState;
  target: URL;
  timeoutMs: number;
}): Promise<void> {
  if (!input.attempted || !input.state.fixtureCreationId) return;
  const pathname = `/api/creations/${encodeURIComponent(input.state.fixtureCreationId)}`;
  let deleted = false;
  for (
    let attempt = 0;
    attempt <= input.cleanupRetryDelaysMs.length;
    attempt += 1
  ) {
    if (attempt > 0) {
      await delay(input.cleanupRetryDelaysMs[attempt - 1] ?? 0);
    }
    const cleanup = await apiRequest(
      input.target,
      pathname,
      jsonMutation("DELETE", input.target.origin, {}),
      input.state,
      input.counters,
      input.fetchImpl,
      input.timeoutMs,
      { label: "fixture cleanup", statuses: [200, 404] },
    );
    if (cleanup.response.status === 200) {
      deleted = true;
      break;
    }
  }
  if (deleted) {
    await apiRequest(
      input.target,
      pathname,
      jsonMutation("DELETE", input.target.origin, {}),
      input.state,
      input.counters,
      input.fetchImpl,
      input.timeoutMs,
      { label: "idempotent fixture cleanup", statuses: [404] },
    );
    return;
  }
  throw new HostedStagingWritableError(
    "Fixture cleanup could not observe deletion within the bounded quiescence window.",
  );
}

async function apiRequest(
  target: URL,
  pathname: string,
  init: RequestInit,
  state: WritableRequestPolicyState,
  counters: RunCounters,
  fetchImpl: AcceptanceFetch,
  timeoutMs: number,
  expected: ExpectedResponse,
): Promise<ParsedApiResponse> {
  const headers = new Headers({
    Accept: "application/json",
    "User-Agent": "Tomodachi-Staging-Writable-Acceptance/1.0",
    ...Object.fromEntries(new Headers(init.headers)),
  });
  const requestInit = { ...init, headers };
  const url = assertWritableRequestAllowed(
    target,
    pathname,
    requestInit,
    state,
  );
  if (counters.requests >= MAX_REQUESTS) {
    throw new HostedStagingWritableError(
      "The writable acceptance request ceiling was exceeded.",
    );
  }
  const method = (requestInit.method ?? "GET").toUpperCase();
  if (!new Set(["GET", "HEAD"]).has(method)) {
    if (counters.mutationAttempts >= MAX_MUTATION_ATTEMPTS) {
      throw new HostedStagingWritableError(
        "The writable acceptance mutation ceiling was exceeded.",
      );
    }
    counters.mutationAttempts += 1;
  }
  counters.requests += 1;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response | undefined;
  try {
    response = await fetchImpl(url, {
      ...requestInit,
      cache: "no-store",
      credentials: "include",
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new HostedStagingWritableError(
        `${expected.label} attempted to redirect.`,
      );
    }
    if (response.url && new URL(response.url).origin !== target.origin) {
      throw new HostedStagingWritableError(
        `${expected.label} returned from another origin.`,
      );
    }
    if (response.headers.has("set-cookie")) {
      throw new HostedStagingWritableError(
        `${expected.label} unexpectedly changed session material.`,
      );
    }
    if (
      response.headers.get("x-tomodachi-source-commit")?.toLowerCase() !==
        state.expectedSourceCommit ||
      response.headers.get("x-tomodachi-worker-version")?.toLowerCase() !==
        state.expectedWorkerVersion ||
      response.headers.get("x-tomodachi-environment") !== "staging" ||
      response.headers.get("x-tomodachi-community-mutations") !== "enabled"
    ) {
      throw new HostedStagingWritableError(
        `${expected.label} returned from an unapproved release identity.`,
      );
    }
    const responseText = await readBoundedResponseText(
      response,
      MAX_RESPONSE_BYTES,
      controller.signal,
    );
    const body = parseJsonObject(responseText, expected.label);
    assertStandardEnvelope(body, response, expected.label);
    if (!expected.statuses.includes(response.status)) {
      throw new HostedStagingWritableError(
        `${expected.label} returned an unexpected status.`,
      );
    }
    return { body, response };
  } catch (error) {
    if (response?.body && !response.bodyUsed) {
      void response.body.cancel("Writable acceptance stopped.").catch(() => {});
    }
    if (controller.signal.aborted) {
      throw new HostedStagingWritableError(`${expected.label} timed out.`);
    }
    if (error instanceof HostedStagingWritableError) throw error;
    throw new HostedStagingWritableError(`${expected.label} request failed.`);
  } finally {
    clearTimeout(timer);
  }
}

function jsonMutation(
  method: "POST" | "PUT" | "DELETE",
  origin: string,
  body: JsonObject,
  additionalHeaders: Record<string, string> = {},
): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...additionalHeaders,
    },
    method,
  };
}

function fixtureProject(name: string, revision: number): CanonicalGridDocument {
  const timestamp = `2026-01-01T00:00:0${Math.min(revision, 9)}.000Z`;
  return canonicalizeGridDocument({
    cells: Array.from({ length: 64 }, (_, index) =>
      index === revision - 1 ? "R1C1" : null,
    ),
    height: 8,
    lockedColors: [],
    meta: {
      createdAt: "2026-01-01T00:00:00.000Z",
      modifiedAt: timestamp,
      name,
    },
    usedColors: ["R1C1"],
    version: 1,
    width: 8,
  });
}

function assertStandardEnvelope(
  body: JsonObject,
  response: Response,
  label: string,
): void {
  const headerRequestId = response.headers.get("x-request-id") ?? "";
  if (!UUID_V4.test(headerRequestId) || body.requestId !== headerRequestId) {
    throw new HostedStagingWritableError(
      `${label} has an invalid request ID envelope.`,
    );
  }
  const hasData = Object.hasOwn(body, "data");
  const hasError = isJsonObject(body.error);
  if (hasData === hasError) {
    throw new HostedStagingWritableError(
      `${label} is not a standard API envelope.`,
    );
  }
}

function validateManifest(
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
    throw new HostedStagingWritableError(
      "A fixture manifest contains invalid or unbounded counts.",
    );
  }
  return Object.fromEntries(
    keys.map((key) => [key, value[key]]),
  ) as unknown as StagingFixtureManifest;
}

function validateCleanupRetryDelays(value: readonly number[]): number[] {
  if (
    value.length < 1 ||
    value.length > DEFAULT_CLEANUP_RETRY_DELAYS_MS.length ||
    value.some((delayMs) => !Number.isInteger(delayMs) || delayMs < 0) ||
    value.reduce((total, delayMs) => total + delayMs, 0) >
      MAX_CLEANUP_RETRY_DELAY_TOTAL_MS
  ) {
    throw new HostedStagingWritableError(
      "Cleanup retry delays are outside the fixed quiescence window.",
    );
  }
  return [...value];
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function assertManifestDelta(
  before: StagingFixtureManifest,
  after: StagingFixtureManifest,
  trackedCreationCount: number,
  maxPendingCleanupObjects: number,
  expect: (condition: boolean, label: string) => void,
): void {
  const creationDelta = after.totalCreationRows - before.totalCreationRows;
  const revisionDelta = after.totalRevisionRows - before.totalRevisionRows;
  const objectDelta = after.totalObjectRows - before.totalObjectRows;
  const byteDelta = after.totalObjectBytes - before.totalObjectBytes;
  const r2ObjectDelta = after.totalR2ObjectCount - before.totalR2ObjectCount;
  expect(
    trackedCreationCount === 1 &&
      creationDelta === after.fixtureDeletedCreationRows,
    "The fixture creation-row delta is outside the one-object ceiling.",
  );
  expect(
    revisionDelta === after.fixtureRevisionRows,
    "The fixture revision-row delta is outside the two-revision ceiling.",
  );
  expect(
    objectDelta === after.fixtureObjectRows &&
      objectDelta <= maxPendingCleanupObjects,
    "The fixture object-row delta is outside the approved object ceiling.",
  );
  expect(
    byteDelta === after.fixtureObjectBytes &&
      byteDelta <= MAX_FIXTURE_OBJECT_BYTES,
    "The fixture object-byte delta is outside the approved byte ceiling.",
  );
  expect(
    r2ObjectDelta === after.fixtureR2ObjectCount,
    "The exact R2 object-count delta does not match the fixture prefix.",
  );
}

function parseJsonObject(text: string, label: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isJsonObject(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new HostedStagingWritableError(
      `${label} did not contain a JSON object.`,
    );
  }
}

function objectAt(value: JsonObject, key: string, label: string): JsonObject {
  const nested = value[key];
  if (!isJsonObject(nested)) {
    throw new HostedStagingWritableError(`${label} is missing or invalid.`);
  }
  return nested;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeFailure(
  error: unknown,
  fallback: string,
): HostedStagingWritableError {
  return error instanceof HostedStagingWritableError
    ? error
    : new HostedStagingWritableError(fallback);
}

async function runExternalStep<T>(
  operation: () => Promise<T>,
  failureMessage: string,
): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new HostedStagingWritableError(failureMessage);
  }
}
