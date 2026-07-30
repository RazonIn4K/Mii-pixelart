import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { CliTerminationError } from "./cli-termination";
import {
  activeWorkerVersionFromDeployment,
  assertStagingSessionRowsRevoked,
  createBrowserMemoryFetch,
  createEphemeralChromeBrowser,
  parseStagingLiveAuthArgs,
  StagingLiveAuthError,
  type BrowserApiRequestLike,
  type BrowserApiResponseLike,
  type BrowserMemoryIdentity,
  type IdentitySlot,
  type LiveAuthBrowserContextLike,
  type LiveAuthBrowserLike,
  type LiveAuthPageLike,
  type StagingLiveAuthDependencies,
  type StagingLiveAuthOptions,
  type VerifiedStagingDeploymentEvidence,
  withStagingLiveAuthSessions,
} from "./verify-staging-live-auth";

const SOURCE_SHA = "a".repeat(40);
const WORKER_VERSION = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_USER_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_SESSION_ID = "44444444-4444-4444-8444-444444444444";
const SECOND_SESSION_ID = "55555555-5555-4555-8555-555555555555";
const STAGING_ORIGIN = "https://staging.tomodachi.pw";

const OPTIONS: StagingLiveAuthOptions = {
  baseUrl: STAGING_ORIGIN,
  expectedCommunityMutations: true,
  expectedConsultSales: false,
  expectedSourceSha: SOURCE_SHA,
  expectedWorkerVersion: WORKER_VERSION,
};

interface SeenBrowserRequest {
  body: Buffer | undefined;
  headers: Record<string, string>;
  method: string;
  url: string;
}

class FakeApiResponse implements BrowserApiResponseLike {
  constructor(
    private readonly responseUrl: string,
    private readonly responseStatus: number,
    private readonly responseBody: unknown,
    private readonly responseHeaders: Array<{
      name: string;
      value: string;
    }> = [],
  ) {}

  async body(): Promise<Buffer> {
    return Buffer.from(JSON.stringify(this.responseBody));
  }

  async headersArray(): Promise<Array<{ name: string; value: string }>> {
    return [
      { name: "Content-Type", value: "application/json" },
      ...this.responseHeaders,
    ];
  }

  status(): number {
    return this.responseStatus;
  }

  url(): string {
    return this.responseUrl;
  }
}

class FakeApiRequest implements BrowserApiRequestLike {
  authenticated = true;
  readonly seen: SeenBrowserRequest[] = [];

  constructor(
    private readonly internalUserId: string,
    private readonly privateEmail: string,
    private readonly sessionId: string,
  ) {}

  async fetch(
    url: string,
    options: {
      data?: Buffer;
      failOnStatusCode: false;
      headers: Record<string, string>;
      maxRedirects: 0;
      method: string;
      timeout: number;
    },
  ): Promise<BrowserApiResponseLike> {
    this.seen.push({
      body: options.data,
      headers: options.headers,
      method: options.method,
      url,
    });
    const pathname = new URL(url).pathname;
    if (pathname === "/api/auth/logout" && options.method === "POST") {
      this.authenticated = false;
      return new FakeApiResponse(
        url,
        200,
        {
          data: null,
          requestId: "00000000-0000-4000-8000-000000000001",
        },
        [
          {
            name: "Set-Cookie",
            value: "__Host-tomodachi.sid=; Max-Age=0; Secure; HttpOnly",
          },
        ],
      );
    }
    if (pathname === "/api/auth/session") {
      return new FakeApiResponse(
        url,
        200,
        this.authenticated
          ? {
              data: {
                capabilities: { communityMutationsEnabled: true },
                session: { current: true, id: this.sessionId },
                user: {
                  email: this.privateEmail,
                  id: this.internalUserId,
                  role: this.internalUserId === OWNER_ID ? "admin" : "user",
                  termsAccepted: true,
                  username:
                    this.internalUserId === OWNER_ID
                      ? "approved-owner"
                      : "approved-second-user",
                },
              },
              requestId: "00000000-0000-4000-8000-000000000002",
            }
          : {
              data: {
                capabilities: { communityMutationsEnabled: true },
                session: null,
                user: null,
              },
              requestId: "00000000-0000-4000-8000-000000000003",
            },
      );
    }
    if (pathname === "/api/me-cookie") {
      return new FakeApiResponse(
        url,
        200,
        {
          data: { ok: true },
          requestId: "00000000-0000-4000-8000-000000000005",
        },
        [
          {
            name: "Set-Cookie",
            value: "__Host-tomodachi.sid=must-never-leave-browser-memory",
          },
        ],
      );
    }
    return new FakeApiResponse(url, 200, {
      data: { ok: true },
      requestId: "00000000-0000-4000-8000-000000000004",
    });
  }
}

class FakePage implements LiveAuthPageLike {
  constructor(readonly visits: string[]) {}

  async goto(url: string): Promise<void> {
    this.visits.push(url);
  }
}

class FakeContext implements LiveAuthBrowserContextLike {
  closed = false;
  readonly request: FakeApiRequest;
  readonly visits: string[] = [];

  constructor(internalUserId: string, privateEmail: string, sessionId: string) {
    this.request = new FakeApiRequest(internalUserId, privateEmail, sessionId);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async newPage(): Promise<LiveAuthPageLike> {
    return new FakePage(this.visits);
  }
}

class FakeBrowser implements LiveAuthBrowserLike {
  closed = false;
  readonly contextOptions: unknown[] = [];
  readonly contexts: FakeContext[] = [];
  private index = 0;

  constructor(
    private readonly ids = [OWNER_ID, SECOND_USER_ID],
    private readonly sessionIds = [OWNER_SESSION_ID, SECOND_SESSION_ID],
  ) {}

  async close(): Promise<void> {
    this.closed = true;
  }

  async newContext(options: unknown): Promise<LiveAuthBrowserContextLike> {
    this.contextOptions.push(options);
    const id = this.ids[this.index] ?? this.ids.at(-1)!;
    const sessionId = this.sessionIds[this.index] ?? this.sessionIds.at(-1)!;
    this.index += 1;
    const context = new FakeContext(
      id,
      `private-${this.index}@example.test`,
      sessionId,
    );
    this.contexts.push(context);
    return context;
  }
}

function publicFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  const pathname = new URL(request.url).pathname;
  const headers = {
    "X-Tomodachi-Community-Mutations": "enabled",
    "X-Tomodachi-Environment": "staging",
    "X-Tomodachi-Source-Commit": SOURCE_SHA,
    "X-Tomodachi-Worker-Version": WORKER_VERSION,
  };
  if (pathname === "/api/auth/session") {
    return Promise.resolve(
      Response.json(
        {
          data: {
            capabilities: { communityMutationsEnabled: true },
            session: null,
            user: null,
          },
          requestId: "00000000-0000-4000-8000-000000000010",
        },
        { headers },
      ),
    );
  }
  if (pathname === "/api/stripe/products") {
    return Promise.resolve(
      Response.json(
        {
          error: {
            code: "route_decommissioned",
            message: "This legacy route is no longer available.",
          },
          requestId: "00000000-0000-4000-8000-000000000011",
        },
        { headers, status: 410 },
      ),
    );
  }
  throw new Error(`Unexpected public path ${pathname}`);
}

function harness(browser = new FakeBrowser()): {
  browser: FakeBrowser;
  dependencies: Partial<StagingLiveAuthDependencies>;
  logs: string[];
  prompts: Array<IdentitySlot | "sessions-ready">;
  verifiedSessionIds: string[][];
} {
  const logs: string[] = [];
  const prompts: Array<IdentitySlot | "sessions-ready"> = [];
  const verifiedSessionIds: string[][] = [];
  return {
    browser,
    dependencies: {
      fetchPublic: publicFetch,
      getActiveDeployment: async () => ({
        versions: [{ percentage: 100, version_id: WORKER_VERSION }],
      }),
      getGitState: async () => ({ commit: SOURCE_SHA, dirty: false }),
      launchBrowser: async () => browser,
      log: (message) => logs.push(message),
      verifySessionsRevoked: async (sessionIds) => {
        verifiedSessionIds.push([...sessionIds]);
      },
      waitForHuman: async (step) => {
        prompts.push(step);
      },
    },
    logs,
    prompts,
    verifiedSessionIds,
  };
}

describe("staging live-auth target and CLI policy", () => {
  it("requires only the five explicit non-secret gate values", () => {
    expect(
      parseStagingLiveAuthArgs([
        "--",
        "--base-url",
        STAGING_ORIGIN,
        "--expected-source-sha",
        SOURCE_SHA,
        "--expected-worker-version",
        WORKER_VERSION,
        "--expected-community-mutations",
        "true",
        "--expected-consult-sales",
        "false",
      ]),
    ).toMatchObject(OPTIONS);

    for (const args of [
      [],
      ["--base-url", "https://tomodachi.pw"],
      ["--base-url", "https://staging.tomodachi.pw.example.com"],
      ["--base-url", STAGING_ORIGIN, "--email", "private@example.test"],
    ]) {
      expect(() => parseStagingLiveAuthArgs(args), args.join(" ")).toThrow(
        StagingLiveAuthError,
      );
    }
  });

  it("refuses production before Git, Wrangler, fetch, or browser work", async () => {
    const touched: string[] = [];
    await expect(
      withStagingLiveAuthSessions(
        { ...OPTIONS, baseUrl: "https://tomodachi.pw" },
        async () => undefined,
        {
          fetchPublic: async () => {
            touched.push("fetch");
            throw new Error("must not run");
          },
          getActiveDeployment: async () => {
            touched.push("wrangler");
            return {};
          },
          getGitState: async () => {
            touched.push("git");
            return { commit: SOURCE_SHA, dirty: false };
          },
          launchBrowser: async () => {
            touched.push("browser");
            return new FakeBrowser();
          },
        },
      ),
    ).rejects.toThrow("Production hosts are forbidden");
    expect(touched).toEqual([]);
  });

  it("requires one exact Worker version at 100 percent traffic", () => {
    expect(
      activeWorkerVersionFromDeployment({
        versions: [{ percentage: 100, version_id: WORKER_VERSION }],
      }),
    ).toBe(WORKER_VERSION);
    for (const value of [
      {},
      { versions: [] },
      { versions: [{ percentage: 50, version_id: WORKER_VERSION }] },
      {
        versions: [
          { percentage: 50, version_id: WORKER_VERSION },
          {
            percentage: 50,
            version_id: "99999999-9999-4999-8999-999999999999",
          },
        ],
      },
    ]) {
      expect(() => activeWorkerVersionFromDeployment(value)).toThrow(
        StagingLiveAuthError,
      );
    }
  });
});

describe("ephemeral real-Chrome profile lifecycle", () => {
  const contextOptions = {
    acceptDownloads: false as const,
    baseURL: STAGING_ORIGIN,
    serviceWorkers: "block" as const,
    viewport: { height: 900, width: 1280 },
  };

  it("creates fresh 0700 slot profiles and removes the whole run tree", async () => {
    const parent = await mkdtemp(
      path.join(tmpdir(), "tomodachi-live-auth-test-"),
    );
    try {
      const userDataDirectories: string[] = [];
      const contexts: FakeContext[] = [];
      const browser = await createEphemeralChromeBrowser({
        launchPersistentContext: async (userDataDirectory, options) => {
          userDataDirectories.push(userDataDirectory);
          expect(options).toMatchObject({
            acceptDownloads: false,
            baseURL: STAGING_ORIGIN,
            channel: "chrome",
            headless: false,
            serviceWorkers: "block",
          });
          expect(options.args).toContain(
            "--disable-blink-features=AutomationControlled",
          );
          expect(options.ignoreDefaultArgs).toContain("--enable-automation");
          const context = new FakeContext(
            userDataDirectories.length === 1 ? OWNER_ID : SECOND_USER_ID,
            "private@example.test",
            userDataDirectories.length === 1
              ? OWNER_SESSION_ID
              : SECOND_SESSION_ID,
          );
          contexts.push(context);
          return context;
        },
        profileParentDirectory: parent,
      });

      const first = await browser.newContext(contextOptions);
      await browser.newContext(contextOptions);

      expect(userDataDirectories).toHaveLength(2);
      expect(new Set(userDataDirectories).size).toBe(2);
      const profileRoot = path.dirname(userDataDirectories[0]!);
      expect(path.dirname(userDataDirectories[1]!)).toBe(profileRoot);
      for (const directory of [profileRoot, ...userDataDirectories]) {
        expect((await stat(directory)).mode & 0o777).toBe(0o700);
      }

      await first.close();
      await browser.close();

      expect(contexts.every((context) => context.closed)).toBe(true);
      await expect(stat(profileRoot)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(parent, { force: true, recursive: true });
    }
  });

  it("still removes the run tree when a context fails to close", async () => {
    const parent = await mkdtemp(
      path.join(tmpdir(), "tomodachi-live-auth-failure-test-"),
    );
    try {
      let profileRoot = "";
      const browser = await createEphemeralChromeBrowser({
        launchPersistentContext: async (userDataDirectory) => {
          profileRoot = path.dirname(userDataDirectory);
          return {
            close: async () => {
              throw new Error("synthetic context close failure");
            },
            newPage: async () => new FakePage([]),
            request: new FakeApiRequest(
              OWNER_ID,
              "private@example.test",
              OWNER_SESSION_ID,
            ),
          };
        },
        profileParentDirectory: parent,
      });

      await browser.newContext(contextOptions);
      await expect(browser.close()).rejects.toThrow(
        "ephemeral Chrome profile could not be fully closed and removed",
      );
      await expect(stat(profileRoot)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(parent, { force: true, recursive: true });
    }
  });

  it("removes the run tree after a persistent-context launch failure", async () => {
    const parent = await mkdtemp(
      path.join(tmpdir(), "tomodachi-live-auth-launch-test-"),
    );
    try {
      let profileRoot = "";
      const browser = await createEphemeralChromeBrowser({
        launchPersistentContext: async (userDataDirectory) => {
          profileRoot = path.dirname(userDataDirectory);
          throw new Error("synthetic Chrome launch failure");
        },
        profileParentDirectory: parent,
      });

      await expect(browser.newContext(contextOptions)).rejects.toThrow(
        "synthetic Chrome launch failure",
      );
      await browser.close();
      await expect(stat(profileRoot)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(parent, { force: true, recursive: true });
    }
  });
});

describe("browser-memory fetch adapter", () => {
  it("keeps requests same-origin and never exposes cookie headers", async () => {
    const api = new FakeApiRequest(
      OWNER_ID,
      "private-owner@example.test",
      OWNER_SESSION_ID,
    );
    const request = createBrowserMemoryFetch(
      new URL(`${STAGING_ORIGIN}/`),
      api,
    );
    const response = await request("/api/me", {
      body: JSON.stringify({ displayName: "Fixture" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    expect(response.status).toBe(200);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(api.seen).toHaveLength(1);
    expect(api.seen[0]).toMatchObject({
      method: "PATCH",
      url: `${STAGING_ORIGIN}/api/me`,
    });
    expect(api.seen[0].headers.origin).toBe(STAGING_ORIGIN);
    expect(api.seen[0].headers.cookie).toBeUndefined();

    await expect(request("https://tomodachi.pw/api/me")).rejects.toThrow(
      "remain on the staging origin",
    );
    await expect(
      request("/api/me", { headers: { Cookie: "forbidden" } }),
    ).rejects.toThrow("browser-memory cookie jar");
    await expect(
      request("/api/me", { headers: { Authorization: "Bearer forbidden" } }),
    ).rejects.toThrow("browser-memory cookie jar");
    await expect(request("/api/me-cookie")).rejects.toThrow(
      "unexpectedly changed session material",
    );
    expect(api.seen).toHaveLength(2);
  });
});

describe("secret-free live-auth session lifecycle", () => {
  it("supplies two distinct in-memory adapters, revokes them, and closes ephemeral contexts", async () => {
    const testHarness = harness();
    const callback = vi.fn(
      async (
        identities: readonly [BrowserMemoryIdentity, BrowserMemoryIdentity],
        deployment: VerifiedStagingDeploymentEvidence,
      ) => {
        expect(identities.map((identity) => identity.slot)).toEqual([
          "owner",
          "second-user",
        ]);
        expect(
          new Set(identities.map((identity) => identity.internalUserId)).size,
        ).toBe(2);
        expect(identities.every((identity) => !("sessionId" in identity))).toBe(
          true,
        );
        expect(deployment).toEqual({
          communityMutationsEnabled: true,
          consultSalesEnabled: false,
          environment: "staging",
          origin: STAGING_ORIGIN,
          sourceCommit: SOURCE_SHA,
          workerVersion: WORKER_VERSION,
        });
        const response = await identities[1].request("/api/me");
        expect(response.status).toBe(200);
        expect(response.headers.has("set-cookie")).toBe(false);
        return "writable-harness-complete" as const;
      },
    );

    const result = await withStagingLiveAuthSessions(
      OPTIONS,
      callback,
      testHarness.dependencies,
    );

    expect(result).toEqual({
      callbackResult: "writable-harness-complete",
      identities: 2,
      sessionsRevoked: 2,
      sourceSha: SOURCE_SHA,
      target: STAGING_ORIGIN,
      workerVersion: WORKER_VERSION,
    });
    expect(callback).toHaveBeenCalledOnce();
    expect(testHarness.prompts).toEqual(["owner", "second-user"]);
    expect(testHarness.verifiedSessionIds).toEqual([
      [OWNER_SESSION_ID, SECOND_SESSION_ID],
    ]);
    expect(testHarness.browser.closed).toBe(true);
    expect(testHarness.browser.contexts).toHaveLength(2);
    expect(
      testHarness.browser.contexts.every(
        (context) => context.closed && !context.request.authenticated,
      ),
    ).toBe(true);
    expect(testHarness.browser.contextOptions).toEqual([
      {
        acceptDownloads: false,
        baseURL: STAGING_ORIGIN,
        serviceWorkers: "block",
        viewport: { height: 900, width: 1280 },
      },
      {
        acceptDownloads: false,
        baseURL: STAGING_ORIGIN,
        serviceWorkers: "block",
        viewport: { height: 900, width: 1280 },
      },
    ]);
    expect(JSON.stringify(testHarness.browser.contextOptions)).not.toMatch(
      /storageState|recordVideo|trace|screenshot|userDataDir/iu,
    );
    expect(testHarness.logs.join("\n")).not.toMatch(
      /private-|example[.]test|must-never-leave|22222222|33333333|44444444|55555555/iu,
    );
  });

  it("rejects the same Google-backed identity twice and revokes both browser sessions", async () => {
    const browser = new FakeBrowser([OWNER_ID, OWNER_ID]);
    const testHarness = harness(browser);
    const callback = vi.fn(async () => undefined);
    await expect(
      withStagingLiveAuthSessions(OPTIONS, callback, testHarness.dependencies),
    ).rejects.toThrow("distinct approved Google identities");
    expect(callback).not.toHaveBeenCalled();
    expect(browser.closed).toBe(true);
    expect(browser.contexts[0].request.authenticated).toBe(false);
    expect(browser.contexts.every((context) => context.closed)).toBe(true);
    expect(testHarness.verifiedSessionIds).toEqual([
      [OWNER_SESSION_ID, SECOND_SESSION_ID],
    ]);
  });

  it("blocks source or deployment drift before opening Chrome", async () => {
    const testHarness = harness();
    const launch = vi.fn(async () => testHarness.browser);
    await expect(
      withStagingLiveAuthSessions(OPTIONS, async () => undefined, {
        ...testHarness.dependencies,
        getGitState: async () => ({ commit: "b".repeat(40), dirty: false }),
        launchBrowser: launch,
      }),
    ).rejects.toThrow("does not match the approved source SHA");
    expect(launch).not.toHaveBeenCalled();

    await expect(
      withStagingLiveAuthSessions(OPTIONS, async () => undefined, {
        ...testHarness.dependencies,
        getActiveDeployment: async () => ({
          versions: [
            {
              percentage: 100,
              version_id: "99999999-9999-4999-8999-999999999999",
            },
          ],
        }),
        launchBrowser: launch,
      }),
    ).rejects.toThrow("does not match the approved version");
    expect(launch).not.toHaveBeenCalled();

    await expect(
      withStagingLiveAuthSessions(OPTIONS, async () => undefined, {
        ...testHarness.dependencies,
        fetchPublic: async (input, init) => {
          const response = await publicFetch(input, init);
          const headers = new Headers(response.headers);
          headers.set("X-Tomodachi-Source-Commit", "b".repeat(40));
          return new Response(response.body, {
            headers,
            status: response.status,
          });
        },
        launchBrowser: launch,
      }),
    ).rejects.toThrow("not bound to the approved source SHA");
    expect(launch).not.toHaveBeenCalled();
  });

  it("rechecks deployment drift after interactive sign-in and revokes both sessions", async () => {
    const testHarness = harness();
    let deploymentChecks = 0;
    const callback = vi.fn(async () => undefined);
    await expect(
      withStagingLiveAuthSessions(OPTIONS, callback, {
        ...testHarness.dependencies,
        getActiveDeployment: async () => {
          deploymentChecks += 1;
          return {
            versions: [
              {
                percentage: 100,
                version_id:
                  deploymentChecks === 1
                    ? WORKER_VERSION
                    : "99999999-9999-4999-8999-999999999999",
              },
            ],
          };
        },
      }),
    ).rejects.toThrow("does not match the approved version");
    expect(callback).not.toHaveBeenCalled();
    expect(deploymentChecks).toBe(2);
    expect(
      testHarness.browser.contexts.every(
        (context) => context.closed && !context.request.authenticated,
      ),
    ).toBe(true);
    expect(testHarness.verifiedSessionIds).toEqual([
      [OWNER_SESSION_ID, SECOND_SESSION_ID],
    ]);
  });

  it("rejects an authenticated response without a valid session-row UUID", async () => {
    const browser = new FakeBrowser(
      [OWNER_ID, SECOND_USER_ID],
      ["not-a-uuid", SECOND_SESSION_ID],
    );
    const testHarness = harness(browser);
    const error = await withStagingLiveAuthSessions(
      OPTIONS,
      async () => undefined,
      testHarness.dependencies,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AggregateError);
    expect(
      (error as AggregateError).errors.some(
        (nested) =>
          nested instanceof Error &&
          nested.message.includes("did not match the live-auth contract"),
      ),
    ).toBe(true);
    expect(testHarness.verifiedSessionIds).toEqual([]);
    expect(browser.closed).toBe(true);
    expect(browser.contexts[0].request.authenticated).toBe(false);
  });

  it("revokes a session discovered during cleanup when SIGINT interrupts the owner prompt", async () => {
    const controller = new AbortController();
    const testHarness = harness();
    const callback = vi.fn(async () => undefined);
    const error = await withStagingLiveAuthSessions(
      { ...OPTIONS, abortSignal: controller.signal },
      callback,
      {
        ...testHarness.dependencies,
        waitForHuman: async (step, signal) => {
          expect(step).toBe("owner");
          expect(signal).toBe(controller.signal);
          controller.abort(new CliTerminationError("SIGINT"));
          signal?.throwIfAborted();
        },
      },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CliTerminationError);
    expect(callback).not.toHaveBeenCalled();
    expect(testHarness.verifiedSessionIds).toEqual([[OWNER_SESSION_ID]]);
    expect(testHarness.browser.contexts).toHaveLength(1);
    expect(testHarness.browser.contexts[0].request.authenticated).toBe(false);
    expect(testHarness.browser.contexts[0].closed).toBe(true);
    expect(testHarness.browser.closed).toBe(true);
  });

  it("revokes both sessions when SIGTERM interrupts the second-user prompt", async () => {
    const controller = new AbortController();
    const testHarness = harness();
    const callback = vi.fn(async () => undefined);
    const prompts: IdentitySlot[] = [];
    const error = await withStagingLiveAuthSessions(
      { ...OPTIONS, abortSignal: controller.signal },
      callback,
      {
        ...testHarness.dependencies,
        waitForHuman: async (step, signal) => {
          if (step === "sessions-ready") return;
          prompts.push(step);
          if (step === "second-user") {
            controller.abort(new CliTerminationError("SIGTERM"));
            signal?.throwIfAborted();
          }
        },
      },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CliTerminationError);
    expect((error as CliTerminationError).exitCode).toBe(143);
    expect(callback).not.toHaveBeenCalled();
    expect(prompts).toEqual(["owner", "second-user"]);
    expect(testHarness.verifiedSessionIds).toEqual([
      [OWNER_SESSION_ID, SECOND_SESSION_ID],
    ]);
    expect(
      testHarness.browser.contexts.every(
        (context) => context.closed && !context.request.authenticated,
      ),
    ).toBe(true);
    expect(testHarness.browser.closed).toBe(true);
  });

  it("waits for an in-flight callback to settle, then revokes both sessions after termination", async () => {
    const controller = new AbortController();
    const testHarness = harness();
    const callback = vi.fn(async () => {
      controller.abort(new CliTerminationError("SIGINT"));
      return "must-not-be-reported";
    });
    const error = await withStagingLiveAuthSessions(
      { ...OPTIONS, abortSignal: controller.signal },
      callback,
      testHarness.dependencies,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CliTerminationError);
    expect(callback).toHaveBeenCalledOnce();
    expect(testHarness.verifiedSessionIds).toEqual([
      [OWNER_SESSION_ID, SECOND_SESSION_ID],
    ]);
    expect(
      testHarness.browser.contexts.every(
        (context) => context.closed && !context.request.authenticated,
      ),
    ).toBe(true);
    expect(testHarness.browser.closed).toBe(true);
  });

  it("fails closed when browser logout clears cookies but D1 does not confirm revocation", async () => {
    const testHarness = harness();
    const callback = vi.fn(async () => "callback-complete" as const);
    await expect(
      withStagingLiveAuthSessions(OPTIONS, callback, {
        ...testHarness.dependencies,
        verifySessionsRevoked: async () => {
          throw new StagingLiveAuthError(
            "Staging D1 did not confirm every acquired session as revoked.",
          );
        },
      }),
    ).rejects.toThrow(
      "One or more ephemeral browser sessions could not be revoked and closed.",
    );
    expect(callback).toHaveBeenCalledOnce();
    expect(
      testHarness.browser.contexts.every(
        (context) => context.closed && !context.request.authenticated,
      ),
    ).toBe(true);
    expect(testHarness.browser.closed).toBe(true);
  });
});

describe("staging D1 session-revocation proof", () => {
  it("accepts only one exact count row with every acquired session revoked", () => {
    expect(() =>
      assertStagingSessionRowsRevoked(
        [
          {
            results: [{ matched_count: 2, revoked_count: 2 }],
            success: true,
          },
        ],
        2,
      ),
    ).not.toThrow();
  });

  it("rejects missing, active, malformed, and extra D1 results", () => {
    for (const value of [
      [{ results: [{ matched_count: 1, revoked_count: 1 }], success: true }],
      [{ results: [{ matched_count: 2, revoked_count: 1 }], success: true }],
      [{ results: [{ matched_count: "2", revoked_count: 2 }], success: true }],
      [
        {
          results: [
            { matched_count: 2, revoked_count: 2 },
            { matched_count: 2, revoked_count: 2 },
          ],
          success: true,
        },
      ],
      [
        { results: [{ matched_count: 2, revoked_count: 2 }], success: true },
        { results: [{ matched_count: 2, revoked_count: 2 }], success: true },
      ],
    ]) {
      expect(() => assertStagingSessionRowsRevoked(value, 2)).toThrow(
        StagingLiveAuthError,
      );
    }
  });
});
