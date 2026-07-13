import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { calculatePKCECodeChallenge } from "openid-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  registerAuthRoutes,
  type GoogleOidcProvider,
} from "./auth";
import { sha256 } from "./crypto";
import {
  assertSafeOrigin,
  errorResponse,
  failure,
  type WorkerRequestContext,
} from "./http";
import { Router } from "./router";

const ORIGIN = "https://tomodachi.test";
const SESSION_PEPPER = "test-only-session-pepper";

interface ProviderControl {
  authorizationInput?: Parameters<GoogleOidcProvider["authorizationUrl"]>[1];
  callbackChecks?: Parameters<GoogleOidcProvider["exchangeCallback"]>[2];
  claims: Awaited<ReturnType<GoogleOidcProvider["exchangeCallback"]>>;
  exchangeError?: Error;
}

describe("Google OIDC routes", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await env.DB.exec(`
      DELETE FROM sessions;
      DELETE FROM external_identities;
      DELETE FROM users;
    `);
  });

  it("creates a bounded OIDC transaction and a hashed application session", async () => {
    const control = providerControl();
    const start = await beginAuth(control);

    expect(start.response.status).toBe(303);
    expect(start.response.headers.get("location")).toMatch(
      /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/u,
    );
    expect(start.setCookie).toContain("__Host-tomodachi.oidc=");
    expect(start.setCookie).toContain("Path=/");
    expect(start.setCookie).toContain("Max-Age=600");
    expect(start.setCookie).toContain("HttpOnly");
    expect(start.setCookie).toContain("SameSite=Lax");
    expect(start.setCookie).toContain("Secure");
    expect(control.authorizationInput).toMatchObject({
      redirectUri: `${ORIGIN}/api/auth/google/callback`,
    });
    expect(control.authorizationInput?.codeChallenge).toHaveLength(43);

    const callback = await callbackAuth(control, start.transactionCookie);
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe(
      "/me/setup?returnTo=%2Fstudio",
    );
    expect(control.callbackChecks?.expectedNonce).toBe(
      control.authorizationInput?.nonce,
    );
    expect(control.callbackChecks?.expectedState).toBe(
      control.authorizationInput?.state,
    );
    await expect(
      calculatePKCECodeChallenge(control.callbackChecks?.pkceCodeVerifier ?? ""),
    ).resolves.toBe(control.authorizationInput?.codeChallenge);

    const sessionSetCookie = cookieHeader(callback, "__Host-tomodachi.sid");
    expect(sessionSetCookie).toContain("Max-Age=2592000");
    expect(sessionSetCookie).toContain("HttpOnly");
    expect(sessionSetCookie).toContain("SameSite=Lax");
    expect(sessionSetCookie).toContain("Secure");
    expect(cookieHeader(callback, "__Host-tomodachi.oidc")).toContain("Max-Age=0");
    const sessionToken = cookieValue(sessionSetCookie);
    expect(sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    const stored = await env.DB.prepare(
      "SELECT token_hash FROM sessions LIMIT 1",
    ).first<{ token_hash: string }>();
    expect(stored?.token_hash).toBe(
      await sha256(`${SESSION_PEPPER}:${sessionToken}`),
    );
    expect(stored?.token_hash).not.toContain(sessionToken);

    const sessionResponse = await dispatch(
      control,
      new Request(`${ORIGIN}/api/auth/session`, {
        headers: { Cookie: `__Host-tomodachi.sid=${sessionToken}` },
      }),
    );
    await expect(sessionResponse.json()).resolves.toMatchObject({
      data: {
        session: { current: true },
        user: {
          email: "islander@example.com",
          requiredTermsVersion: testEnv.TERMS_VERSION,
          username: null,
        },
      },
    });
  });

  it("requires an active session before starting reauthentication", async () => {
    const control = providerControl();
    const start = await beginAuth(control, {
      intent: "reauth",
      returnTo: "/me/settings",
    });

    expect(start.response.status).toBe(401);
    expect(control.authorizationInput).toBeUndefined();
    expect(start.setCookie).toBe("");
    await expect(start.response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("binds reauthentication to the current subject and rotates only that session", async () => {
    const identity = await seedUser("reauth-islander", "google-subject-1");
    const oldToken = "old-reauth-session-token";
    const sessionId = await seedSession(identity.userId, oldToken, Date.now() - 3_600_000);
    const control = providerControl({ subject: identity.subject });
    const start = await beginAuth(control, {
      intent: "reauth",
      returnTo: "/me/settings",
      sessionToken: oldToken,
    });

    const callback = await callbackAuth(
      control,
      start.transactionCookie,
      oldToken,
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("/me/settings");
    const newToken = cookieValue(cookieHeader(callback, "__Host-tomodachi.sid"));
    expect(newToken).not.toBe(oldToken);

    const rows = await env.DB.prepare(
      `SELECT id, token_hash, revoked_at, last_authenticated_at
       FROM sessions WHERE user_id = ?`,
    ).bind(identity.userId).all<{
      id: string;
      last_authenticated_at: number;
      revoked_at: number | null;
      token_hash: string;
    }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]).toMatchObject({ id: sessionId, revoked_at: null });
    expect(rows.results[0]?.token_hash).toBe(
      await sha256(`${SESSION_PEPPER}:${newToken}`),
    );

    const oldSession = await dispatch(
      control,
      new Request(`${ORIGIN}/api/auth/session`, {
        headers: { Cookie: `__Host-tomodachi.sid=${oldToken}` },
      }),
    );
    await expect(oldSession.json()).resolves.toMatchObject({
      data: { session: null, user: null },
    });
    const newSession = await dispatch(
      control,
      new Request(`${ORIGIN}/api/auth/session`, {
        headers: { Cookie: `__Host-tomodachi.sid=${newToken}` },
      }),
    );
    await expect(newSession.json()).resolves.toMatchObject({
      data: { session: { id: sessionId }, user: { id: identity.userId } },
    });
  });

  it("rejects a different Google subject without switching or provisioning accounts", async () => {
    const identity = await seedUser("bound-islander", "bound-google-subject");
    const sessionToken = "bound-session-token";
    await seedSession(identity.userId, sessionToken, Date.now() - 3_600_000);
    const control = providerControl({ subject: "different-google-subject" });
    const start = await beginAuth(control, {
      intent: "reauth",
      returnTo: "/me/settings",
      sessionToken,
    });

    const callback = await callbackAuth(
      control,
      start.transactionCookie,
      sessionToken,
    );
    expect(callback.status).toBe(403);
    expect(cookieHeader(callback, "__Host-tomodachi.oidc")).toContain("Max-Age=0");
    await expect(callback.json()).resolves.toMatchObject({
      error: {
        code: "FORBIDDEN",
        message: "Use the same Google account that is already connected to this profile.",
      },
    });
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM users").first())
      .resolves.toMatchObject({ count: 1 });
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM sessions").first())
      .resolves.toMatchObject({ count: 1 });
  });

  it("clears invalid transactions and normalizes provider validation failures", async () => {
    const control = providerControl();
    const missing = await callbackAuth(control, null);
    expect(missing.status).toBe(400);
    expect(cookieHeader(missing, "__Host-tomodachi.oidc")).toContain("Max-Age=0");

    const corrupt = await callbackAuth(control, "not-an-encrypted-transaction");
    expect(corrupt.status).toBe(400);
    await expect(corrupt.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST", message: "Login transaction is invalid." },
    });

    control.exchangeError = new Error("state, nonce, or PKCE validation failed");
    const start = await beginAuth(control);
    const rejected = await callbackAuth(control, start.transactionCookie);
    expect(rejected.status).toBe(400);
    expect(cookieHeader(rejected, "__Host-tomodachi.oidc")).toContain("Max-Age=0");
    await expect(rejected.json()).resolves.toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "Google login could not be verified. Start sign-in again.",
      },
    });
  });

  it("rejects expired transactions and unverified email identities", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T18:00:00.000Z"));
    try {
      const expiredControl = providerControl();
      const start = await beginAuth(expiredControl);
      vi.advanceTimersByTime(11 * 60 * 1_000);
      const expired = await callbackAuth(expiredControl, start.transactionCookie);
      expect(expired.status).toBe(400);
      await expect(expired.json()).resolves.toMatchObject({
        error: { message: "Login transaction has expired." },
      });

      const unverifiedControl = providerControl({ emailVerified: false });
      const unverifiedStart = await beginAuth(unverifiedControl);
      const unverified = await callbackAuth(
        unverifiedControl,
        unverifiedStart.transactionCookie,
      );
      expect(unverified.status).toBe(403);
      await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM users").first())
        .resolves.toMatchObject({ count: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps at most ten active sessions after a normal login", async () => {
    const identity = await seedUser("session-cap", "session-cap-subject");
    const now = Date.now();
    const oldestSessionId = await seedSession(
      identity.userId,
      "cap-token-0",
      now - 20_000,
    );
    for (let index = 1; index < 10; index += 1) {
      await seedSession(identity.userId, `cap-token-${index}`, now - 20_000 + index);
    }

    const control = providerControl({ subject: identity.subject });
    const start = await beginAuth(control, { returnTo: "/me" });
    const callback = await callbackAuth(control, start.transactionCookie);
    expect(callback.status).toBe(303);
    await expect(env.DB.prepare(
      "SELECT COUNT(*) AS count FROM sessions WHERE user_id = ? AND revoked_at IS NULL",
    ).bind(identity.userId).first()).resolves.toMatchObject({ count: 10 });
    await expect(env.DB.prepare(
      "SELECT revoked_at FROM sessions WHERE id = ?",
    ).bind(oldestSessionId).first()).resolves.toMatchObject({
      revoked_at: expect.any(Number),
    });
  });
});

const testEnv = new Proxy(env as Env, {
  get(target, property, receiver) {
    if (property === "AUTH_RATE_LIMITER") {
      return { limit: async () => ({ success: true }) } satisfies RateLimit;
    }
    if (property === "PUBLIC_SITE_URL") return ORIGIN;
    if (property === "GOOGLE_OIDC_REDIRECT_URI") {
      return `${ORIGIN}/api/auth/google/callback`;
    }
    return Reflect.get(target, property, receiver);
  },
});

function providerControl(
  claims: Partial<ProviderControl["claims"]> = {},
): ProviderControl {
  return {
    claims: {
      email: "islander@example.com",
      emailVerified: true,
      name: "Test Islander",
      subject: "google-subject-1",
      ...claims,
    },
  };
}

function providerFor(control: ProviderControl): GoogleOidcProvider {
  return {
    async authorizationUrl(_environment, input) {
      control.authorizationInput = input;
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("state", input.state);
      return url;
    },
    async exchangeCallback(_environment, callbackUrl, checks) {
      control.callbackChecks = checks;
      if (control.exchangeError) throw control.exchangeError;
      if (callbackUrl.searchParams.get("state") !== checks.expectedState) {
        throw new Error("state mismatch");
      }
      return control.claims;
    },
  };
}

async function dispatch(control: ProviderControl, request: Request): Promise<Response> {
  const router = new Router();
  registerAuthRoutes(router, providerFor(control));
  const executionCtx = createExecutionContext();
  const context: WorkerRequestContext = {
    env: testEnv,
    executionCtx,
    params: {},
    request,
    requestId: crypto.randomUUID(),
    url: new URL(request.url),
  };
  let response: Response;
  try {
    assertSafeOrigin(context);
    response = await router.dispatch(context)
      ?? failure(context.requestId, 404, "route_not_found", "API route was not found.");
  } catch (error) {
    response = errorResponse(error, context.requestId);
  }
  await waitOnExecutionContext(executionCtx);
  return response;
}

async function beginAuth(
  control: ProviderControl,
  options: {
    intent?: "login" | "reauth";
    returnTo?: string;
    sessionToken?: string;
  } = {},
): Promise<{
  response: Response;
  setCookie: string;
  transactionCookie: string;
}> {
  const form = new URLSearchParams({ returnTo: options.returnTo ?? "/studio" });
  if (options.intent) form.set("intent", options.intent);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Origin: ORIGIN,
  };
  if (options.sessionToken) {
    headers.Cookie = `__Host-tomodachi.sid=${options.sessionToken}`;
  }
  const response = await dispatch(
    control,
    new Request(`${ORIGIN}/api/auth/google/start`, {
      body: form,
      headers,
      method: "POST",
    }),
  );
  const setCookie = cookieHeader(response, "__Host-tomodachi.oidc");
  return {
    response,
    setCookie,
    transactionCookie: cookieValue(setCookie),
  };
}

function callbackAuth(
  control: ProviderControl,
  transactionCookie: string | null,
  sessionToken?: string,
): Promise<Response> {
  const cookies = [
    transactionCookie
      ? `__Host-tomodachi.oidc=${transactionCookie}`
      : null,
    sessionToken ? `__Host-tomodachi.sid=${sessionToken}` : null,
  ].filter((value): value is string => Boolean(value));
  const state = control.authorizationInput?.state ?? "missing-state";
  return dispatch(
    control,
    new Request(`${ORIGIN}/api/auth/google/callback?code=test-code&state=${encodeURIComponent(state)}`, {
      headers: cookies.length ? { Cookie: cookies.join("; ") } : undefined,
    }),
  );
}

function cookieHeader(response: Response, name: string): string {
  return response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`)) ?? "";
}

function cookieValue(setCookie: string): string {
  return setCookie.slice(setCookie.indexOf("=") + 1, setCookie.indexOf(";"));
}

async function seedUser(username: string, subject: string): Promise<{
  subject: string;
  userId: string;
}> {
  const userId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users
       (id, username, display_name, bio, role, status, avatar_seed,
        terms_version, terms_accepted_at, created_at, updated_at)
       VALUES (?, ?, 'Test Islander', '', 'user', 'active', ?, ?, ?, ?, ?)`,
    ).bind(userId, username, userId, testEnv.TERMS_VERSION, now, now, now),
    env.DB.prepare(
      `INSERT INTO external_identities
       (id, user_id, provider, provider_subject, email, email_verified, created_at, updated_at)
       VALUES (?, ?, 'google', ?, 'islander@example.com', 1, ?, ?)`,
    ).bind(crypto.randomUUID(), userId, subject, now, now),
  ]);
  return { subject, userId };
}

async function seedSession(
  userId: string,
  token: string,
  authenticatedAt: number,
): Promise<string> {
  const id = crypto.randomUUID();
  const createdAt = authenticatedAt - 1_000;
  await env.DB.prepare(
    `INSERT INTO sessions
     (id, user_id, token_hash, ua_label, created_at, last_seen_at,
      last_authenticated_at, expires_at, revoked_at)
     VALUES (?, ?, ?, 'Test browser', ?, ?, ?, ?, NULL)`,
  ).bind(
    id,
    userId,
    await sha256(`${SESSION_PEPPER}:${token}`),
    createdAt,
    authenticatedAt,
    authenticatedAt,
    Date.now() + 30 * 24 * 60 * 60 * 1_000,
  ).run();
  return id;
}
