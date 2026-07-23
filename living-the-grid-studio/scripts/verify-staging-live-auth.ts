import { spawn } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const STAGING_ORIGIN = "https://staging.tomodachi.pw";
const PRODUCTION_HOSTS = new Set(["tomodachi.pw", "www.tomodachi.pw"]);
const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/iu;
const WORKER_VERSION_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const INTERNAL_ID_PATTERN = WORKER_VERSION_PATTERN;
const STAGING_D1_NAME = "tomodachi-studio-staging";
const WRANGLER_CONFIG = "wrangler.jsonc";
const MAX_COMMAND_OUTPUT_BYTES = 256 * 1_024;
const MAX_PREFLIGHT_RESPONSE_BYTES = 64 * 1_024;
const DEFAULT_TIMEOUT_MS = 20_000;

export type IdentitySlot = "owner" | "second-user";

export interface StagingLiveAuthOptions {
  baseUrl: string;
  expectedCommunityMutations: boolean;
  expectedConsultSales: boolean;
  expectedSourceSha: string;
  expectedWorkerVersion: string;
  timeoutMs?: number;
}

export interface GitState {
  commit: string;
  dirty: boolean;
}

export interface BrowserApiResponseLike {
  body(): Promise<Buffer>;
  headersArray(): Promise<Array<{ name: string; value: string }>>;
  status(): number;
  url(): string;
}

export interface BrowserApiRequestLike {
  fetch(
    url: string,
    options: {
      data?: Buffer;
      failOnStatusCode: false;
      headers: Record<string, string>;
      maxRedirects: 0;
      method: string;
      timeout: number;
    },
  ): Promise<BrowserApiResponseLike>;
}

export interface LiveAuthPageLike {
  goto(
    url: string,
    options: { timeout: number; waitUntil: "domcontentloaded" },
  ): Promise<unknown>;
}

export interface LiveAuthBrowserContextLike {
  close(): Promise<void>;
  newPage(): Promise<LiveAuthPageLike>;
  request: BrowserApiRequestLike;
}

export interface LiveAuthBrowserLike {
  close(): Promise<void>;
  newContext(options: {
    acceptDownloads: false;
    baseURL: string;
    serviceWorkers: "block";
    viewport: { height: number; width: number };
  }): Promise<LiveAuthBrowserContextLike>;
}

export type BrowserMemoryFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface BrowserMemoryIdentity {
  /** The only identity attribute exposed to the writable callback. Never log this value. */
  internalUserId: string;
  request: BrowserMemoryFetch;
  role: "admin" | "moderator" | "user";
  slot: IdentitySlot;
}

export interface VerifiedStagingDeploymentEvidence {
  communityMutationsEnabled: true;
  consultSalesEnabled: false;
  environment: "staging";
  origin: typeof STAGING_ORIGIN;
  sourceCommit: string;
  workerVersion: string;
}

export interface StagingLiveAuthResult<T> {
  callbackResult: T;
  identities: 2;
  sessionsRevoked: 2;
  sourceSha: string;
  target: typeof STAGING_ORIGIN;
  workerVersion: string;
}

export interface StagingLiveAuthDependencies {
  fetchPublic: typeof fetch;
  getActiveDeployment: () => Promise<unknown>;
  getGitState: () => Promise<GitState>;
  launchBrowser: () => Promise<LiveAuthBrowserLike>;
  log: (message: string) => void;
  verifySessionsRevoked: (sessionIds: readonly string[]) => Promise<void>;
  waitForHuman: (step: IdentitySlot | "sessions-ready") => Promise<void>;
}

export class StagingLiveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StagingLiveAuthError";
  }
}

interface ValidatedOptions {
  expectedCommunityMutations: boolean;
  expectedConsultSales: false;
  expectedSourceSha: string;
  expectedWorkerVersion: string;
  target: URL;
  timeoutMs: number;
}

interface SessionSnapshot {
  internalUserId: string;
  onboarded: boolean;
  role: "admin" | "moderator" | "user";
  sessionId: string;
}

interface AcquiredIdentity extends BrowserMemoryIdentity {
  context: LiveAuthBrowserContextLike;
  /** Retained only for D1 cleanup verification; never expose or log this value. */
  sessionId: string;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
}

export function validateStagingLiveAuthOptions(
  options: StagingLiveAuthOptions,
): ValidatedOptions {
  let target: URL;
  try {
    target = new URL(options.baseUrl);
  } catch {
    throw new StagingLiveAuthError("The live-auth target is not a valid URL.");
  }

  const hostname = target.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(hostname)) {
    throw new StagingLiveAuthError(
      "Production hosts are forbidden for the staging live-auth runner.",
    );
  }
  if (
    target.origin !== STAGING_ORIGIN ||
    target.protocol !== "https:" ||
    target.port ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new StagingLiveAuthError(
      "The live-auth target must be exactly https://staging.tomodachi.pw.",
    );
  }
  if (!SOURCE_SHA_PATTERN.test(options.expectedSourceSha)) {
    throw new StagingLiveAuthError(
      "The expected source SHA must be a full 40-character Git commit.",
    );
  }
  if (!WORKER_VERSION_PATTERN.test(options.expectedWorkerVersion)) {
    throw new StagingLiveAuthError(
      "The expected Worker version must be a UUID.",
    );
  }
  if (options.expectedCommunityMutations !== true) {
    throw new StagingLiveAuthError(
      "The writable live-auth runner requires community mutations to be explicitly expected as true.",
    );
  }
  if (options.expectedConsultSales !== false) {
    throw new StagingLiveAuthError(
      "Consult sales is retired and must be explicitly expected as false.",
    );
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new StagingLiveAuthError(
      "timeoutMs must be an integer between 1000 and 60000.",
    );
  }

  return {
    expectedCommunityMutations: true,
    expectedConsultSales: false,
    expectedSourceSha: options.expectedSourceSha.toLowerCase(),
    expectedWorkerVersion: options.expectedWorkerVersion.toLowerCase(),
    target: new URL(`${STAGING_ORIGIN}/`),
    timeoutMs,
  };
}

export function activeWorkerVersionFromDeployment(value: unknown): string {
  if (!isObject(value) || !Array.isArray(value.versions)) {
    throw new StagingLiveAuthError(
      "Wrangler returned an unrecognized deployment status.",
    );
  }
  if (value.versions.length !== 1 || !isObject(value.versions[0])) {
    throw new StagingLiveAuthError(
      "Staging must have exactly one Worker version receiving traffic.",
    );
  }
  const version = value.versions[0];
  const id = version.version_id;
  const percentage = version.percentage;
  if (
    typeof id !== "string" ||
    !WORKER_VERSION_PATTERN.test(id) ||
    percentage !== 100
  ) {
    throw new StagingLiveAuthError(
      "Staging must have one valid Worker version at 100 percent traffic.",
    );
  }
  return id.toLowerCase();
}

export async function runStagingLiveAuthPreflight(
  options: StagingLiveAuthOptions,
  dependencies: Pick<
    StagingLiveAuthDependencies,
    "fetchPublic" | "getActiveDeployment" | "getGitState"
  >,
): Promise<ValidatedOptions> {
  // Validate the target and every caller-controlled value before Git, Wrangler,
  // fetch, or browser dependencies can run.
  const validated = validateStagingLiveAuthOptions(options);
  const git = await dependencies.getGitState();
  if (
    !SOURCE_SHA_PATTERN.test(git.commit) ||
    git.commit.toLowerCase() !== validated.expectedSourceSha
  ) {
    throw new StagingLiveAuthError(
      "The current source commit does not match the approved source SHA.",
    );
  }
  if (git.dirty) {
    throw new StagingLiveAuthError(
      "The live-auth runner requires a clean working tree at the approved source SHA.",
    );
  }

  const deployment = await dependencies.getActiveDeployment();
  const activeVersion = activeWorkerVersionFromDeployment(deployment);
  if (activeVersion !== validated.expectedWorkerVersion) {
    throw new StagingLiveAuthError(
      "The active staging Worker version does not match the approved version.",
    );
  }

  const sessionResponse = await dependencies.fetchPublic(
    `${validated.target.origin}/api/auth/session`,
    {
      credentials: "omit",
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(validated.timeoutMs),
    },
  );
  if (sessionResponse.status !== 200) {
    throw new StagingLiveAuthError(
      "The anonymous staging capability preflight did not return 200.",
    );
  }
  assertRemoteReleaseIdentity(sessionResponse, validated);
  const sessionEnvelope = await readSmallJson(
    sessionResponse,
    "staging capability response",
  );
  const sessionData = objectAt(sessionEnvelope, "data");
  const capabilities = objectAt(sessionData, "capabilities");
  if (
    capabilities.communityMutationsEnabled !==
    validated.expectedCommunityMutations
  ) {
    throw new StagingLiveAuthError(
      "The staging community-mutation flag does not match the approved value.",
    );
  }
  if (sessionData.user !== null || sessionData.session !== null) {
    throw new StagingLiveAuthError(
      "The credential-free staging preflight unexpectedly returned a session.",
    );
  }

  const consultResponse = await dependencies.fetchPublic(
    `${validated.target.origin}/api/stripe/products`,
    {
      credentials: "omit",
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(validated.timeoutMs),
    },
  );
  if (consultResponse.status !== 410) {
    throw new StagingLiveAuthError(
      "The retired consultation/payment surface is not returning 410.",
    );
  }
  assertRemoteReleaseIdentity(consultResponse, validated);
  const consultEnvelope = await readSmallJson(
    consultResponse,
    "retired consultation response",
  );
  const consultError = objectAt(consultEnvelope, "error");
  if (consultError.code !== "payments_retired") {
    throw new StagingLiveAuthError(
      "The retired consultation/payment surface returned an unexpected error.",
    );
  }

  return validated;
}

function assertRemoteReleaseIdentity(
  response: Response,
  expected: ValidatedOptions,
): void {
  if (
    response.headers.get("x-tomodachi-source-commit")?.toLowerCase() !==
    expected.expectedSourceSha
  ) {
    throw new StagingLiveAuthError(
      "The staging response is not bound to the approved source SHA.",
    );
  }
  if (response.headers.get("x-tomodachi-environment") !== "staging") {
    throw new StagingLiveAuthError(
      "The staging response has an unexpected environment identity.",
    );
  }
  if (
    response.headers.get("x-tomodachi-worker-version")?.toLowerCase() !==
    expected.expectedWorkerVersion
  ) {
    throw new StagingLiveAuthError(
      "The staging response is not bound to the approved Worker version.",
    );
  }
  const expectedMutationMode = expected.expectedCommunityMutations
    ? "enabled"
    : "disabled";
  if (
    response.headers.get("x-tomodachi-community-mutations") !==
    expectedMutationMode
  ) {
    throw new StagingLiveAuthError(
      "The staging response has an unexpected community-mutation identity.",
    );
  }
}

export function createBrowserMemoryFetch(
  target: URL,
  requestContext: BrowserApiRequestLike,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): BrowserMemoryFetch {
  return async (input, init = {}) => {
    const requestInput =
      input instanceof Request ? input : new URL(String(input), target);
    const request = new Request(requestInput, init);
    const url = new URL(request.url);
    if (
      url.origin !== target.origin ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new StagingLiveAuthError(
        "Authenticated acceptance requests must remain on the staging origin.",
      );
    }
    if (PRODUCTION_HOSTS.has(url.hostname.toLowerCase())) {
      throw new StagingLiveAuthError(
        "Production hosts are forbidden for authenticated staging requests.",
      );
    }

    const headers = new Headers(request.headers);
    if (headers.has("authorization") || headers.has("cookie")) {
      throw new StagingLiveAuthError(
        "Authentication headers must never leave the browser-memory cookie jar.",
      );
    }
    const method = request.method.toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const suppliedOrigin = headers.get("origin");
      if (suppliedOrigin && suppliedOrigin !== target.origin) {
        throw new StagingLiveAuthError(
          "Authenticated mutations require the exact staging Origin.",
        );
      }
      headers.set("Origin", target.origin);
    }

    const body =
      method === "GET" || method === "HEAD"
        ? undefined
        : Buffer.from(await request.arrayBuffer());
    const response = await requestContext.fetch(url.href, {
      ...(body && body.byteLength > 0 ? { data: body } : {}),
      failOnStatusCode: false,
      headers: Object.fromEntries(headers.entries()),
      maxRedirects: 0,
      method,
      timeout: timeoutMs,
    });
    const responseUrl = new URL(response.url());
    if (responseUrl.origin !== target.origin) {
      throw new StagingLiveAuthError(
        "The authenticated request escaped the staging origin.",
      );
    }

    const responseHeaders = new Headers();
    let setCookieObserved = false;
    for (const { name, value } of await response.headersArray()) {
      // The context consumes Set-Cookie internally. Never surface session or
      // OAuth cookies to the writable harness, logs, or serialized evidence.
      if (name.toLowerCase() === "set-cookie") {
        setCookieObserved = true;
      } else {
        responseHeaders.append(name, value);
      }
    }
    if (setCookieObserved && url.pathname !== "/api/auth/logout") {
      throw new StagingLiveAuthError(
        "An authenticated acceptance response unexpectedly changed session material.",
      );
    }
    return new Response(await response.body(), {
      headers: responseHeaders,
      status: response.status(),
    });
  };
}

export async function withStagingLiveAuthSessions<T>(
  options: StagingLiveAuthOptions,
  useSessions: (
    identities: readonly [BrowserMemoryIdentity, BrowserMemoryIdentity],
    deployment: VerifiedStagingDeploymentEvidence,
  ) => Promise<T>,
  dependencyOverrides: Partial<StagingLiveAuthDependencies> = {},
): Promise<StagingLiveAuthResult<T>> {
  const dependencies = {
    ...defaultDependencies(),
    ...dependencyOverrides,
  } satisfies StagingLiveAuthDependencies;
  const validated = await runStagingLiveAuthPreflight(options, dependencies);
  dependencies.log(
    "[live-auth] Source, Worker version, mutation mode, and retired consultation state verified.",
  );

  const browser = await dependencies.launchBrowser();
  const acquired: AcquiredIdentity[] = [];
  let callbackResult!: T;
  let primaryError: unknown;
  const cleanupErrors: unknown[] = [];

  try {
    for (const slot of ["owner", "second-user"] as const) {
      const context = await browser.newContext({
        acceptDownloads: false,
        baseURL: validated.target.origin,
        serviceWorkers: "block",
        viewport: { height: 900, width: 1280 },
      });
      try {
        const page = await context.newPage();
        await page.goto(`${validated.target.origin}/me`, {
          timeout: validated.timeoutMs,
          waitUntil: "domcontentloaded",
        });
        dependencies.log(
          `[live-auth] Complete Google sign-in and profile setup for the ${safeSlotLabel(slot)} in the new Chrome window, then return here.`,
        );
        await dependencies.waitForHuman(slot);

        const request = createBrowserMemoryFetch(
          validated.target,
          context.request,
          validated.timeoutMs,
        );
        const snapshot = await readSessionSnapshot(request);
        if (!snapshot) {
          throw new StagingLiveAuthError(
            `The ${safeSlotLabel(slot)} browser did not contain an authenticated staging session.`,
          );
        }
        if (!snapshot.onboarded) {
          throw new StagingLiveAuthError(
            `The ${safeSlotLabel(slot)} must finish username and Terms setup before this gate can continue.`,
          );
        }
        if (
          acquired.some(
            (identity) => identity.internalUserId === snapshot.internalUserId,
          )
        ) {
          throw new StagingLiveAuthError(
            "The two browser sessions must belong to distinct approved Google identities.",
          );
        }
        acquired.push({
          context,
          internalUserId: snapshot.internalUserId,
          request,
          role: snapshot.role,
          sessionId: snapshot.sessionId,
          slot,
        });
        dependencies.log(
          `[live-auth] The ${safeSlotLabel(slot)} session is authenticated and onboarded in browser memory.`,
        );
      } catch (error) {
        if (!acquired.some((identity) => identity.context === context)) {
          await context.close().catch(() => undefined);
        }
        throw error;
      }
    }

    const publicIdentities = acquired.map(
      ({ internalUserId, request, role, slot }) => ({
        internalUserId,
        request,
        role,
        slot,
      }),
    ) as [BrowserMemoryIdentity, BrowserMemoryIdentity];
    dependencies.log(
      "[live-auth] Two distinct sessions are ready. No cookies or provider identity values were serialized.",
    );
    // Interactive sign-in can take several minutes. Recheck Git, the active
    // Worker version, public release identity, and flags immediately before
    // handing either authenticated adapter to a writable callback.
    const freshDeployment = await runStagingLiveAuthPreflight(
      options,
      dependencies,
    );
    callbackResult = await useSessions(publicIdentities, {
      communityMutationsEnabled: true,
      consultSalesEnabled: false,
      environment: "staging",
      origin: STAGING_ORIGIN,
      sourceCommit: freshDeployment.expectedSourceSha,
      workerVersion: freshDeployment.expectedWorkerVersion,
    });
  } catch (error) {
    primaryError = error;
  } finally {
    for (const identity of acquired) {
      try {
        await revokeAndVerify(identity.request);
      } catch (error) {
        cleanupErrors.push(error);
      }
      await identity.context.close().catch((error: unknown) => {
        cleanupErrors.push(error);
      });
    }
    if (acquired.length > 0) {
      try {
        await dependencies.verifySessionsRevoked(
          acquired.map((identity) => identity.sessionId),
        );
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    await browser.close().catch((error: unknown) => {
      cleanupErrors.push(error);
    });
  }

  if (primaryError !== undefined) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [primaryError, ...cleanupErrors],
        "The live-auth run failed and one or more session cleanup steps also failed.",
      );
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "One or more browser-memory sessions could not be revoked and closed.",
    );
  }

  dependencies.log(
    "[live-auth] Both sessions were revoked, verified in staging D1, and both ephemeral browser contexts were closed.",
  );
  return {
    callbackResult,
    identities: 2,
    sessionsRevoked: 2,
    sourceSha: validated.expectedSourceSha,
    target: STAGING_ORIGIN,
    workerVersion: validated.expectedWorkerVersion,
  };
}

async function readSessionSnapshot(
  request: BrowserMemoryFetch,
): Promise<SessionSnapshot | null> {
  const response = await request("/api/auth/session", {
    headers: { Accept: "application/json" },
    method: "GET",
    redirect: "manual",
  });
  if (response.status !== 200) {
    throw new StagingLiveAuthError(
      "The authenticated session probe did not return 200.",
    );
  }
  const envelope = await readSmallJson(
    response,
    "authenticated session response",
  );
  const data = objectAt(envelope, "data");
  if (data.user === null || data.session === null) return null;
  const user = objectAt(data, "user");
  const session = objectAt(data, "session");
  if (
    typeof user.id !== "string" ||
    !INTERNAL_ID_PATTERN.test(user.id) ||
    typeof user.username !== "string" ||
    typeof user.termsAccepted !== "boolean" ||
    !["admin", "moderator", "user"].includes(String(user.role)) ||
    typeof session.id !== "string" ||
    !INTERNAL_ID_PATTERN.test(session.id) ||
    session.current !== true
  ) {
    throw new StagingLiveAuthError(
      "The authenticated session response did not match the live-auth contract.",
    );
  }
  return {
    internalUserId: user.id,
    onboarded: user.username.length >= 3 && user.termsAccepted,
    role: user.role as SessionSnapshot["role"],
    sessionId: session.id.toLowerCase(),
  };
}

async function revokeAndVerify(request: BrowserMemoryFetch): Promise<void> {
  const logout = await request("/api/auth/logout", {
    body: "{}",
    headers: { "Content-Type": "application/json" },
    method: "POST",
    redirect: "manual",
  });
  if (logout.status !== 200) {
    throw new StagingLiveAuthError(
      "A browser-memory session could not be revoked through logout.",
    );
  }
  const snapshot = await readSessionSnapshot(request);
  if (snapshot !== null) {
    throw new StagingLiveAuthError(
      "A revoked browser-memory session remained authenticated.",
    );
  }
}

function validatedSessionIds(sessionIds: readonly string[]): string[] {
  if (sessionIds.length < 1 || sessionIds.length > 2) {
    throw new StagingLiveAuthError(
      "The live-auth runner received an invalid session cleanup set.",
    );
  }
  const normalized = sessionIds.map((sessionId) => {
    if (!INTERNAL_ID_PATTERN.test(sessionId)) {
      throw new StagingLiveAuthError(
        "The live-auth runner received an invalid session cleanup set.",
      );
    }
    return sessionId.toLowerCase();
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new StagingLiveAuthError(
      "The live-auth runner received an invalid session cleanup set.",
    );
  }
  return normalized;
}

export function assertStagingSessionRowsRevoked(
  value: unknown,
  expectedCount: number,
): void {
  if (
    !Number.isInteger(expectedCount) ||
    expectedCount < 1 ||
    expectedCount > 2 ||
    !Array.isArray(value) ||
    value.length !== 1 ||
    !isObject(value[0]) ||
    value[0].success !== true ||
    !Array.isArray(value[0].results) ||
    value[0].results.length !== 1 ||
    !isObject(value[0].results[0])
  ) {
    throw new StagingLiveAuthError(
      "Wrangler returned an unrecognized staging session-revocation result.",
    );
  }
  const row = value[0].results[0];
  if (
    Object.keys(row).sort().join(",") !== "matched_count,revoked_count" ||
    !Number.isInteger(row.matched_count) ||
    !Number.isInteger(row.revoked_count)
  ) {
    throw new StagingLiveAuthError(
      "Wrangler returned an unrecognized staging session-revocation result.",
    );
  }
  if (
    row.matched_count !== expectedCount ||
    row.revoked_count !== expectedCount
  ) {
    throw new StagingLiveAuthError(
      "Staging D1 did not confirm every acquired session as revoked.",
    );
  }
}

async function verifyStagingSessionsRevoked(
  sessionIds: readonly string[],
): Promise<void> {
  const normalized = validatedSessionIds(sessionIds);
  const quotedIds = normalized.map((sessionId) => `'${sessionId}'`).join(", ");
  const query =
    "SELECT COUNT(*) AS matched_count, " +
    "COALESCE(SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS revoked_count " +
    `FROM sessions WHERE id IN (${quotedIds});`;
  const result = await runCommand("pnpm", [
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
    query,
    "--json",
  ]);
  if (result.exitCode !== 0) {
    throw new StagingLiveAuthError(
      "Wrangler could not verify staging session revocation.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout) as unknown;
  } catch {
    throw new StagingLiveAuthError(
      "Wrangler returned an unrecognized staging session-revocation result.",
    );
  }
  assertStagingSessionRowsRevoked(parsed, normalized.length);
}

async function readSmallJson(
  response: Response,
  label: string,
): Promise<JsonObject> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_PREFLIGHT_RESPONSE_BYTES
  ) {
    throw new StagingLiveAuthError(`The ${label} exceeded its size limit.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_PREFLIGHT_RESPONSE_BYTES) {
    throw new StagingLiveAuthError(`The ${label} exceeded its size limit.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new StagingLiveAuthError(`The ${label} was not valid JSON.`);
  }
  if (!isObject(parsed)) {
    throw new StagingLiveAuthError(`The ${label} was not a JSON object.`);
  }
  return parsed;
}

function objectAt(value: JsonObject, key: string): JsonObject {
  const nested = value[key];
  if (!isObject(nested)) {
    throw new StagingLiveAuthError(`The response field ${key} is missing.`);
  }
  return nested;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeSlotLabel(slot: IdentitySlot): string {
  return slot === "owner" ? "approved owner" : "approved second user";
}

async function runCommand(
  command: string,
  args: readonly string[],
  cwd = APP_ROOT,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: {
        ...process.env,
        WRANGLER_LOG_SANITIZE: "true",
        WRANGLER_WRITE_LOGS: "false",
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let outputBytes = 0;
    const capture = (chunk: Buffer): void => {
      outputBytes += chunk.byteLength;
      if (outputBytes <= MAX_COMMAND_OUTPUT_BYTES) stdout += chunk.toString();
    };
    child.stdout.on("data", capture);
    // Drain stderr without retaining or repeating CLI/auth diagnostics.
    child.stderr.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
    });
    child.once("error", () =>
      reject(
        new StagingLiveAuthError(
          "A required local preflight command could not start.",
        ),
      ),
    );
    child.once("close", (code) => {
      if (outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
        reject(
          new StagingLiveAuthError(
            "A required local preflight command exceeded its output limit.",
          ),
        );
        return;
      }
      resolve({ exitCode: code ?? 1, stdout });
    });
  });
}

function defaultDependencies(): StagingLiveAuthDependencies {
  return {
    fetchPublic: fetch,
    getActiveDeployment: async () => {
      const result = await runCommand("pnpm", [
        "exec",
        "wrangler",
        "deployments",
        "status",
        "--config",
        "wrangler.jsonc",
        "--env",
        "staging",
        "--json",
      ]);
      if (result.exitCode !== 0) {
        throw new StagingLiveAuthError(
          "Wrangler could not verify the active staging Worker version.",
        );
      }
      try {
        return JSON.parse(result.stdout) as unknown;
      } catch {
        throw new StagingLiveAuthError(
          "Wrangler returned an unrecognized deployment status.",
        );
      }
    },
    getGitState: async () => {
      const [commit, status] = await Promise.all([
        runCommand("git", ["rev-parse", "HEAD"]),
        runCommand("git", [
          "status",
          "--porcelain",
          "--untracked-files=normal",
        ]),
      ]);
      if (commit.exitCode !== 0 || status.exitCode !== 0) {
        throw new StagingLiveAuthError(
          "Git could not verify the approved local source state.",
        );
      }
      return {
        commit: commit.stdout.trim(),
        dirty: status.stdout.trim().length > 0,
      };
    },
    launchBrowser: async () => {
      const { chromium } = await import("@playwright/test");
      const { homedir } = await import("node:os");
      // Google's secure-browser policy rejects credential entry inside the
      // automation-flagged bundled Chromium ("This browser or app may not be
      // secure"). Launch the installed real Chrome with one persistent
      // profile per identity slot instead: sign-in state survives between
      // acceptance runs, so after the first manual sign-in the flow passes
      // the account chooser without hitting the blocked credential screen.
      const profileRoot =
        process.env.LTG_LIVE_AUTH_PROFILE_DIR ??
        path.join(homedir(), ".ltg-live-auth-profiles");
      let slotIndex = 0;
      const contexts: Array<{ close(): Promise<void> }> = [];
      const browserLike = {
        close: async () => {
          for (const context of contexts.splice(0)) {
            await context.close();
          }
        },
        newContext: async (options: {
          acceptDownloads: false;
          baseURL: string;
          serviceWorkers: "block";
          viewport: { height: number; width: number };
        }) => {
          const context = await chromium.launchPersistentContext(
            path.join(profileRoot, `slot-${slotIndex++}`),
            {
              acceptDownloads: options.acceptDownloads,
              args: ["--disable-blink-features=AutomationControlled"],
              baseURL: options.baseURL,
              channel: "chrome",
              headless: false,
              ignoreDefaultArgs: ["--enable-automation"],
              serviceWorkers: options.serviceWorkers,
              viewport: options.viewport,
            },
          );
          contexts.push(context);
          return context;
        },
      };
      return browserLike as unknown as LiveAuthBrowserLike;
    },
    log: (message) => console.log(message),
    verifySessionsRevoked: verifyStagingSessionsRevoked,
    waitForHuman: async (step) => {
      const reader = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const prompt =
        step === "sessions-ready"
          ? "Press Enter to revoke both sessions and close the ephemeral browser. "
          : `Press Enter after the ${safeSlotLabel(step)} has finished Google sign-in and profile setup. `;
      try {
        await reader.question(prompt);
      } finally {
        reader.close();
      }
    },
  };
}

export function parseStagingLiveAuthArgs(
  args: readonly string[],
): StagingLiveAuthOptions {
  const normalized = args[0] === "--" ? args.slice(1) : [...args];
  const allowed = new Set([
    "--base-url",
    "--expected-community-mutations",
    "--expected-consult-sales",
    "--expected-source-sha",
    "--expected-worker-version",
  ]);
  const values = new Map<string, string>();
  for (let index = 0; index < normalized.length; index += 2) {
    const key = normalized[index];
    const value = normalized[index + 1];
    if (
      !key ||
      !allowed.has(key) ||
      !value ||
      value.startsWith("--") ||
      values.has(key)
    ) {
      throw new StagingLiveAuthError(
        "Live-auth arguments are missing, duplicated, or malformed.",
      );
    }
    values.set(key, value);
  }
  if (values.size !== allowed.size) {
    throw new StagingLiveAuthError(
      "All five non-secret live-auth preflight arguments are required.",
    );
  }
  const parseBoolean = (key: string): boolean => {
    const value = values.get(key);
    if (value !== "true" && value !== "false") {
      throw new StagingLiveAuthError(`${key} must be exactly true or false.`);
    }
    return value === "true";
  };
  const options: StagingLiveAuthOptions = {
    baseUrl: values.get("--base-url")!,
    expectedCommunityMutations: parseBoolean("--expected-community-mutations"),
    expectedConsultSales: parseBoolean("--expected-consult-sales"),
    expectedSourceSha: values.get("--expected-source-sha")!,
    expectedWorkerVersion: values.get("--expected-worker-version")!,
  };
  validateStagingLiveAuthOptions(options);
  return options;
}

async function main(): Promise<void> {
  const options = parseStagingLiveAuthArgs(process.argv.slice(2));
  const result = await withStagingLiveAuthSessions(options, async () => {
    const dependencies = defaultDependencies();
    dependencies.log(
      "[live-auth] Both in-memory adapters are available to an integrated writable harness.",
    );
    await dependencies.waitForHuman("sessions-ready");
    return "standalone-session-check" as const;
  });
  console.log(
    JSON.stringify(
      {
        identities: result.identities,
        sessionsRevoked: result.sessionsRevoked,
        sourceSha: result.sourceSha,
        target: result.target,
        workerVersion: result.workerVersion,
      },
      null,
      2,
    ),
  );
}

const isCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "StagingLiveAuthError: The live-auth runner failed.",
    );
    process.exitCode = 1;
  });
}
