import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

export type AcceptanceFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type CommunityMutationsExpectation = "blocked" | "enabled";

export interface HostedReadOnlyAcceptanceOptions {
  baseUrl: string;
  expectedCommunityMutations?: CommunityMutationsExpectation;
  fetchImpl?: AcceptanceFetch;
  timeoutMs?: number;
}

export interface HostedReadOnlyAcceptanceResult {
  assertions: number;
  communityMutations: CommunityMutationsExpectation;
  requests: number;
  target: string;
}

export class HostedAcceptanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedAcceptanceError";
  }
}

const STAGING_HOST = "staging.tomodachi.pw";
const PRODUCTION_HOSTS = new Set(["tomodachi.pw", "www.tomodachi.pw"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
const MAX_RESPONSE_BYTES = 2 * 1_024 * 1_024;
const DEFAULT_TIMEOUT_MS = 15_000;
const WRONG_ORIGIN = "https://example.invalid";
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const DOCUMENT_PATHS = [
  "/",
  "/about",
  "/faq",
  "/studio",
  "/discover",
  "/search",
  "/community-guidelines",
  "/copyright",
  "/security",
  "/privacy",
  "/terms",
  "/cookies",
  "/unlock",
] as const;

const API_READ_PATHS = [
  "/api/discover/recent?limit=1",
  "/api/discover/popular?limit=1",
  "/api/search?q=island&limit=1",
  "/api/tags",
  "/api/tags/portraits?limit=1",
  "/api/tags/portraits/creations?limit=1",
] as const;

const CRAWLER_PATH = "/discover";
const MISSING_DOCUMENT_PATHS = [
  "/creation/does-not-exist",
  "/u/missing-user",
] as const;
const CRAWLER_CONTROL_PATHS = [
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap-images.xml",
] as const;
const COMMUNITY_PROBE_PATH = "/api/creations";

const ALLOWED_GET_PATHS = new Set<string>([
  ...DOCUMENT_PATHS,
  ...API_READ_PATHS,
  ...MISSING_DOCUMENT_PATHS,
  ...CRAWLER_CONTROL_PATHS,
]);
const ALLOWED_HEADERS = new Set([
  "accept",
  "content-type",
  "origin",
  "user-agent",
]);
const FORBIDDEN_ROUTE_PREFIXES = [
  "/api/auth",
  "/api/me",
  "/api/ai",
  "/api/stripe",
  "/api/webhooks",
  "/api/moderation",
] as const;

export function parseHostedAcceptanceTarget(
  raw: string,
  options: { allowLoopback?: boolean } = {},
): URL {
  if (!raw.trim()) {
    throw new HostedAcceptanceError(
      "An explicit --base-url is required; there is no default target.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new HostedAcceptanceError(
      "The acceptance target is not a valid URL.",
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(hostname)) {
    throw new HostedAcceptanceError(
      "Production hosts are forbidden for the read-only staging harness.",
    );
  }
  if (parsed.username || parsed.password) {
    throw new HostedAcceptanceError(
      "The acceptance target must not contain credentials.",
    );
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new HostedAcceptanceError(
      "The acceptance target must be an origin with no path, query, or fragment.",
    );
  }

  if (hostname === STAGING_HOST) {
    if (parsed.protocol !== "https:" || parsed.port) {
      throw new HostedAcceptanceError(
        "The staging target must use HTTPS on its default port.",
      );
    }
  } else if (options.allowLoopback === true && LOOPBACK_HOSTS.has(hostname)) {
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new HostedAcceptanceError(
        "Loopback fixtures must use HTTP or HTTPS.",
      );
    }
  } else {
    throw new HostedAcceptanceError(
      `Host ${hostname || "(missing)"} is not in the acceptance allowlist.`,
    );
  }

  return new URL(`${parsed.origin}/`);
}

export function assertHostedRequestAllowed(
  target: URL,
  relativePath: string,
  init: RequestInit = {},
): URL {
  if (!relativePath.startsWith("/") || relativePath.startsWith("//")) {
    throw new HostedAcceptanceError(
      "Acceptance requests must use an absolute path on the selected origin.",
    );
  }
  const url = new URL(relativePath, target);
  if (
    url.origin !== target.origin ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new HostedAcceptanceError(
      "Acceptance requests must remain on the selected target origin.",
    );
  }

  const method = (init.method ?? "GET").toUpperCase();
  const pathAndQuery = `${url.pathname}${url.search}`;
  if (
    FORBIDDEN_ROUTE_PREFIXES.some(
      (prefix) =>
        url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
    )
  ) {
    throw new HostedAcceptanceError(
      `Route ${url.pathname} is forbidden by the read-only acceptance policy.`,
    );
  }

  const headers = new Headers(init.headers);
  for (const header of headers.keys()) {
    if (!ALLOWED_HEADERS.has(header)) {
      throw new HostedAcceptanceError(
        `Header ${header} is forbidden by the anonymous acceptance policy.`,
      );
    }
  }
  if (headers.has("authorization") || headers.has("cookie")) {
    throw new HostedAcceptanceError(
      "Acceptance requests must never contain credentials.",
    );
  }

  if (method === "GET" || method === "HEAD") {
    if (!ALLOWED_GET_PATHS.has(pathAndQuery)) {
      throw new HostedAcceptanceError(
        `${method} ${pathAndQuery} is not in the read-only acceptance allowlist.`,
      );
    }
    if (init.body !== undefined && init.body !== null) {
      throw new HostedAcceptanceError(
        `${method} requests must not have a body.`,
      );
    }
    return url;
  }

  if (method !== "POST" || pathAndQuery !== COMMUNITY_PROBE_PATH) {
    throw new HostedAcceptanceError(
      `${method} ${pathAndQuery} is not an approved fail-closed probe.`,
    );
  }
  if (init.body !== "{}") {
    throw new HostedAcceptanceError(
      "The community fail-closed probe body must be exactly {}.",
    );
  }
  if (
    headers.get("content-type")?.toLowerCase() !== "application/json" ||
    ![target.origin, WRONG_ORIGIN].includes(headers.get("origin") ?? "")
  ) {
    throw new HostedAcceptanceError(
      "The community probe requires JSON and an approved test Origin.",
    );
  }
  return url;
}

export async function runHostedReadOnlyAcceptance(
  options: HostedReadOnlyAcceptanceOptions,
): Promise<HostedReadOnlyAcceptanceResult> {
  const target = parseHostedAcceptanceTarget(options.baseUrl, {
    allowLoopback: options.fetchImpl !== undefined,
  });
  const expectedCommunityMutations =
    options.expectedCommunityMutations ?? "blocked";
  if (
    expectedCommunityMutations !== "blocked" &&
    expectedCommunityMutations !== "enabled"
  ) {
    throw new HostedAcceptanceError(
      "The expected community-mutations mode must be blocked or enabled.",
    );
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new HostedAcceptanceError(
      "timeoutMs must be an integer between 1 and 60000.",
    );
  }

  let assertions = 0;
  let requests = 0;
  const expect = (condition: boolean, label: string): void => {
    assertions += 1;
    if (!condition) throw new HostedAcceptanceError(label);
  };

  const request = async (
    relativePath: string,
    init: RequestInit = {},
  ): Promise<{ body: string; response: Response }> => {
    const headers = new Headers({
      "User-Agent":
        "Tomodachi-Read-Only-Acceptance/1.0 (+anonymous; no-credentials)",
      ...Object.fromEntries(new Headers(init.headers)),
    });
    const requestInit: RequestInit = { ...init, headers };
    const url = assertHostedRequestAllowed(target, relativePath, requestInit);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    requests += 1;
    let response: Response | undefined;
    try {
      response = await fetchImpl(url, {
        ...requestInit,
        cache: "no-store",
        credentials: "omit",
        redirect: "manual",
        signal: controller.signal,
      });
      expect(
        response.status < 300 || response.status >= 400,
        `${relativePath} attempted to redirect; redirects are never followed`,
      );
      if (response.url) {
        expect(
          new URL(response.url).origin === target.origin,
          `${relativePath} returned a response from another origin`,
        );
      }
      expect(
        !response.headers.has("set-cookie"),
        `${relativePath} unexpectedly returned session material`,
      );
      const body = await readBoundedResponseText(
        response,
        MAX_RESPONSE_BYTES,
        controller.signal,
      );
      return { body, response };
    } catch (error) {
      if (response?.body && !response.bodyUsed) {
        void response.body.cancel("Acceptance request failed.").catch(() => {});
      }
      if (controller.signal.aborted) {
        throw new HostedAcceptanceError(
          `${requestInit.method ?? "GET"} ${relativePath} timed out after ${timeoutMs}ms.`,
        );
      }
      if (error instanceof HostedAcceptanceError) throw error;
      throw new HostedAcceptanceError(
        `${requestInit.method ?? "GET"} ${relativePath} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  };

  let rootHtml = "";
  for (const pathname of DOCUMENT_PATHS) {
    const { body, response } = await request(pathname, {
      headers: { Accept: "text/html" },
    });
    if (pathname === "/") rootHtml = body;
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(response.status === 200, `${pathname} did not return HTTP 200`);
    expect(
      response.headers.get("content-type")?.includes("text/html") ?? false,
      `${pathname} did not return HTML`,
    );
    expect(
      response.headers.get("x-robots-tag") === "noindex,nofollow",
      `${pathname} is not protected by the staging noindex policy`,
    );
    expect(
      response.headers.get("x-document-render") === "spa",
      `${pathname} did not use the browser SPA document`,
    );
    assertSecurityHeaders(response, csp, pathname, expect);
    assertRequestId(response, pathname, expect);
  }

  expect(
    rootHtml.includes(`href="${target.origin}/"`),
    "The root document does not contain the selected staging canonical URL",
  );
  expect(
    !containsProductionOrigin(rootHtml),
    "The root document contains production metadata",
  );
  expect(rootHtml.includes('id="root"'), "The root SPA mount is missing");

  for (const [userAgent, renderMode] of [
    ["Googlebot/2.1 (+http://www.google.com/bot.html)", "search"],
    ["facebookexternalhit/1.1", "social"],
  ] as const) {
    const { body, response } = await request(CRAWLER_PATH, {
      headers: { Accept: "text/html", "User-Agent": userAgent },
    });
    expect(response.status === 200, `${renderMode} crawler did not return 200`);
    expect(
      response.headers.get("x-crawler-render") === renderMode,
      `${renderMode} crawler shell was not selected`,
    );
    expect(
      response.headers.get("x-robots-tag") === "noindex,nofollow",
      `${renderMode} crawler shell is indexable`,
    );
    expect(
      body.includes(`${target.origin}${CRAWLER_PATH}`),
      `${renderMode} crawler shell has the wrong canonical URL`,
    );
    expect(
      !containsProductionOrigin(body),
      `${renderMode} crawler shell contains production metadata`,
    );
    assertRequestId(response, `${renderMode} crawler`, expect);
  }

  for (const pathname of MISSING_DOCUMENT_PATHS) {
    const { body, response } = await request(pathname, {
      headers: { Accept: "text/html" },
    });
    expect(response.status === 404, `${pathname} did not return a safe 404`);
    expect(
      response.headers.get("content-type")?.includes("text/html") ?? false,
      `${pathname} did not return an HTML 404`,
    );
    expect(
      response.headers.get("x-robots-tag") === "noindex,nofollow",
      `${pathname} 404 is indexable`,
    );
    expect(
      body.includes(target.origin),
      `${pathname} 404 omits staging metadata`,
    );
    expect(
      !containsProductionOrigin(body),
      `${pathname} 404 contains production metadata`,
    );
    assertRequestId(response, pathname, expect);
  }

  {
    const pathname = "/robots.txt";
    const { body, response } = await request(pathname);
    expect(response.status === 200, "robots.txt did not return 200");
    expect(
      response.headers.get("content-type")?.includes("text/plain") ?? false,
      "robots.txt did not return text/plain",
    );
    expect(
      response.headers.get("cache-control") === "no-store",
      "robots.txt is cacheable",
    );
    expect(
      response.headers.get("x-robots-tag") === "noindex,nofollow",
      "robots.txt lacks the staging noindex header",
    );
    expect(
      body.includes("User-agent: *") && body.includes("Disallow: /"),
      "robots.txt does not deny all crawlers",
    );
    expect(
      !/sitemap:/iu.test(body) && !body.includes("tomodachi.pw"),
      "robots.txt advertises a sitemap or public hostname",
    );
    assertRequestId(response, pathname, expect);
  }

  for (const pathname of ["/sitemap.xml", "/sitemap-images.xml"] as const) {
    const { body, response } = await request(pathname);
    expect(response.status === 200, `${pathname} did not return 200`);
    expect(
      response.headers.get("content-type")?.includes("application/xml") ??
        false,
      `${pathname} did not return XML`,
    );
    expect(
      response.headers.get("cache-control") === "no-store",
      `${pathname} is cacheable`,
    );
    expect(
      response.headers.get("x-robots-tag") === "noindex,nofollow",
      `${pathname} lacks the staging noindex header`,
    );
    expect(
      body.includes("<urlset") && !body.includes("<loc>"),
      `${pathname} is not empty`,
    );
    expect(
      !body.includes("tomodachi.pw"),
      `${pathname} contains a public hostname`,
    );
    assertRequestId(response, pathname, expect);
  }

  for (const pathname of API_READ_PATHS) {
    const { body: responseBody, response } = await request(pathname, {
      headers: { Accept: "application/json" },
    });
    const body = parseJsonObject(responseBody, pathname);
    expect(response.status === 200, `${pathname} did not return 200`);
    expect(
      response.headers.get("content-type")?.includes("application/json") ??
        false,
      `${pathname} did not return JSON`,
    );
    expect(
      response.headers.get("cache-control") === "no-store",
      `${pathname} is cacheable`,
    );
    expect(
      response.headers.get("x-robots-tag") === "noindex,nofollow",
      `${pathname} lacks the staging noindex header`,
    );
    expect(Object.hasOwn(body, "data"), `${pathname} lacks the data envelope`);
    assertEnvelopeRequestId(body, response, pathname, expect);
  }

  for (const origin of [target.origin, WRONG_ORIGIN]) {
    const { body: responseBody, response } = await request(
      COMMUNITY_PROBE_PATH,
      {
        body: "{}",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: origin,
        },
        method: "POST",
      },
    );
    const label = origin === target.origin ? "same-origin" : "wrong-origin";
    const body = parseJsonObject(responseBody, `${label} community probe`);
    const error = isJsonObject(body.error) ? body.error : {};
    const expectedStatus =
      origin !== target.origin
        ? 403
        : expectedCommunityMutations === "enabled"
          ? 401
          : 503;
    const expectedErrorCode =
      origin !== target.origin
        ? "FORBIDDEN"
        : expectedCommunityMutations === "enabled"
          ? "UNAUTHENTICATED"
          : "SERVICE_UNAVAILABLE";
    expect(
      response.status === expectedStatus,
      `${label} community probe did not fail closed`,
    );
    expect(
      error.code === expectedErrorCode,
      `${label} community probe returned the wrong error code`,
    );
    expect(
      response.headers.get("x-robots-tag") === "noindex,nofollow",
      `${label} community probe lacks the staging noindex header`,
    );
    assertEnvelopeRequestId(body, response, `${label} community probe`, expect);
  }

  expect(requests === 28, `Expected exactly 28 requests, received ${requests}`);
  return {
    assertions,
    communityMutations: expectedCommunityMutations,
    requests,
    target: target.origin,
  };
}

function assertSecurityHeaders(
  response: Response,
  csp: string,
  label: string,
  expect: (condition: boolean, label: string) => void,
): void {
  expect(
    response.headers.get("x-content-type-options") === "nosniff",
    `${label} lacks nosniff`,
  );
  expect(
    response.headers.get("x-frame-options") === "DENY",
    `${label} is frameable`,
  );
  expect(
    response.headers.get("referrer-policy") ===
      "strict-origin-when-cross-origin",
    `${label} has the wrong referrer policy`,
  );
  expect(
    response.headers.get("cross-origin-opener-policy") === "same-origin",
    `${label} has the wrong opener policy`,
  );
  expect(
    response.headers.get("permissions-policy")?.includes("camera=()") ?? false,
    `${label} has an incomplete permissions policy`,
  );
  expect(
    response.headers
      .get("strict-transport-security")
      ?.includes("max-age=31536000") ?? false,
    `${label} lacks HSTS`,
  );
  expect(
    csp.includes("default-src 'self'") &&
      csp.includes("frame-ancestors 'none'") &&
      csp.includes("base-uri 'self'") &&
      csp.includes("object-src 'none'"),
    `${label} has an incomplete CSP`,
  );
  expect(!csp.includes("'unsafe-eval'"), `${label} permits unsafe-eval`);
  expect(
    !/fonts[.]googleapis|fonts[.]gstatic/iu.test(csp),
    `${label} permits external Google fonts`,
  );
  expect(
    !response.headers.has("content-security-policy-report-only"),
    `${label} unexpectedly emits a report-only CSP`,
  );
}

function assertRequestId(
  response: Response,
  label: string,
  expect: (condition: boolean, label: string) => void,
): void {
  expect(
    UUID_V4.test(response.headers.get("x-request-id") ?? ""),
    `${label} lacks a UUIDv4 request ID`,
  );
}

function assertEnvelopeRequestId(
  body: JsonObject,
  response: Response,
  label: string,
  expect: (condition: boolean, label: string) => void,
): void {
  const headerRequestId = response.headers.get("x-request-id") ?? "";
  expect(UUID_V4.test(headerRequestId), `${label} lacks a UUIDv4 request ID`);
  expect(
    body.requestId === headerRequestId,
    `${label} request ID envelope does not match its header`,
  );
}

function parseJsonObject(text: string, label: string): JsonObject {
  try {
    const value: unknown = JSON.parse(text);
    if (!isJsonObject(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new HostedAcceptanceError(`${label} did not return a JSON object.`);
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsProductionOrigin(value: string): boolean {
  return /https:\/\/(?:www[.])?tomodachi[.]pw(?:[/:"'<>]|$)/iu.test(value);
}

export async function readBoundedResponseText(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
  signal?: AbortSignal,
): Promise<string> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new HostedAcceptanceError("The response limit must be positive.");
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel("Response exceeds the acceptance limit.");
    throw new HostedAcceptanceError(
      `Response exceeds the ${maxBytes}-byte acceptance limit.`,
    );
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, signal);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new HostedAcceptanceError(
          `Response exceeds the ${maxBytes}-byte acceptance limit.`,
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel("Response body read stopped.").catch(() => {});
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A hostile or synthetic stream may still have a pending read while its
      // asynchronous cancellation settles. The abort listener is removed by
      // readWithAbort, so releasing later is not required for process safety.
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!signal) return reader.read();
  if (signal.aborted) {
    return Promise.reject(
      new HostedAcceptanceError("Response body read was aborted."),
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void => {
      finish(() =>
        reject(new HostedAcceptanceError("Response body read was aborted.")),
      );
    };
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (result) => finish(() => resolve(result)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

export function parseHostedAcceptanceArgs(args: readonly string[]): {
  baseUrl: string;
  expectedCommunityMutations?: CommunityMutationsExpectation;
} {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const usage =
    "Usage: pnpm verify:hosted-read-only -- --base-url https://staging.tomodachi.pw [--expect-community-mutations enabled]";
  if (normalizedArgs[0] !== "--base-url" || !normalizedArgs[1]) {
    throw new HostedAcceptanceError(
      `An explicit --base-url is required. ${usage}`,
    );
  }
  if (normalizedArgs.length !== 2 && normalizedArgs.length !== 4) {
    throw new HostedAcceptanceError(usage);
  }
  parseHostedAcceptanceTarget(normalizedArgs[1]);
  if (normalizedArgs.length === 2) {
    return { baseUrl: normalizedArgs[1] };
  }
  if (
    normalizedArgs[2] !== "--expect-community-mutations" ||
    normalizedArgs[3] !== "enabled"
  ) {
    throw new HostedAcceptanceError(
      `The only explicit community-mutations mode is enabled. ${usage}`,
    );
  }
  return {
    baseUrl: normalizedArgs[1],
    expectedCommunityMutations: "enabled",
  };
}

async function main(): Promise<void> {
  const options = parseHostedAcceptanceArgs(process.argv.slice(2));
  const result = await runHostedReadOnlyAcceptance(options);
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
        : String(error),
    );
    process.exitCode = 1;
  });
}
