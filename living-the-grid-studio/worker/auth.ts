import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from "openid-client";
import { CompactEncrypt, compactDecrypt } from "jose";
import { z } from "zod";
import { GoogleAuthStartSchema } from "../shared/community";

import {
  isStrongRuntimeSecret,
  isValidOidcCookieKey,
  pseudonymize,
  randomToken,
  safeRelativeReturnTo,
  secretKey,
  sha256,
} from "./crypto";
import {
  HttpError,
  cookie,
  parseCookies,
  parseJson,
  readText,
  success,
  type WorkerRequestContext,
} from "./http";
import type { Router } from "./router";

const GOOGLE_ISSUER = new URL("https://accounts.google.com");
const OIDC_TTL_SECONDS = 10 * 60;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const FRESH_SESSION_MS = 15 * 60 * 1_000;
const MAX_ACTIVE_SESSIONS = 10;

const OidcTransactionSchema = z.object({
  expiresAt: z.number().int(),
  nonce: z.string().min(16),
  pkceVerifier: z.string().min(32),
  returnTo: z.string(),
  state: z.string().min(16),
});

interface SessionRow {
  avatar_seed: string;
  bio: string;
  created_at: number;
  deletion_due_at: number | null;
  display_name: string;
  email: string;
  expires_at: number;
  last_seen_at: number;
  role: "admin" | "moderator" | "user";
  last_authenticated_at: number;
  session_id: string;
  status: "active" | "deleted" | "deletion_pending" | "suspended";
  terms_accepted_at: number | null;
  terms_version: string | null;
  user_id: string;
  user_created_at: number;
  username: string | null;
}

export interface AuthenticatedSession {
  authenticatedAt: number;
  expiresAt: number;
  fresh: boolean;
  id: string;
  createdAt: number;
  lastSeenAt: number;
  role: "admin" | "moderator" | "user";
  user: {
    avatarSeed: string;
    bio: string;
    createdAt: number;
    deletionDueAt: number | null;
    displayName: string;
    email: string;
    id: string;
    status: "active" | "deleted" | "deletion_pending" | "suspended";
    termsAccepted: boolean;
    termsAcceptedAt: number | null;
    termsVersion: string | null;
    username: string | null;
  };
}

export function registerAuthRoutes(router: Router): void {
  router
    .add("POST", "/api/auth/google/start", startGoogleLogin)
    .add("GET", "/api/auth/google/callback", finishGoogleLogin)
    .add("GET", "/api/auth/session", getAuthSession)
    .add("POST", "/api/auth/logout", logout)
    .add("POST", "/api/auth/revoke-all", revokeAllSessions);
}

async function startGoogleLogin(context: WorkerRequestContext): Promise<Response> {
  assertOidcConfigured(context.env);
  await enforceRateLimit(context.env.AUTH_RATE_LIMITER, await clientKey(context.env, context.request));
  const { returnTo: requestedReturnTo } = await readLoginStart(context.request);

  const state = randomState();
  const nonce = randomNonce();
  const pkceVerifier = randomPKCECodeVerifier();
  const codeChallenge = await calculatePKCECodeChallenge(pkceVerifier);
  const transaction = {
    expiresAt: Date.now() + OIDC_TTL_SECONDS * 1_000,
    nonce,
    pkceVerifier,
    returnTo: safeRelativeReturnTo(requestedReturnTo),
    state,
  };

  const config = await googleConfiguration(context.env);
  const authorizationUrl = buildAuthorizationUrl(config, {
    client_id: context.env.GOOGLE_CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    nonce,
    prompt: "select_account",
    redirect_uri: context.env.GOOGLE_OIDC_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
  });

  const encryptedTransaction = await encryptTransaction(transaction, context.env);
  const isFormNavigation = context.request.headers.get("content-type")
    ?.toLowerCase()
    .startsWith("application/x-www-form-urlencoded") ?? false;
  const headers = new Headers(isFormNavigation ? { Location: authorizationUrl.href } : undefined);
  headers.append("Set-Cookie", transactionCookie(context.env, encryptedTransaction));
  if (isFormNavigation) return new Response(null, { status: 303, headers });
  const response = success(context.requestId, { authorizationUrl: authorizationUrl.href });
  for (const value of headers.getSetCookie()) response.headers.append("Set-Cookie", value);
  return response;
}

async function finishGoogleLogin(context: WorkerRequestContext): Promise<Response> {
  assertOidcConfigured(context.env);
  await enforceRateLimit(context.env.AUTH_RATE_LIMITER, await clientKey(context.env, context.request));
  const encrypted = parseCookies(context.request).get(transactionCookieName(context.env));
  if (!encrypted) {
    throw new HttpError(400, "invalid_oidc_transaction", "Login transaction is missing or expired.");
  }

  const transaction = await decryptTransaction(encrypted, context.env);
  if (transaction.expiresAt < Date.now()) {
    throw new HttpError(400, "expired_oidc_transaction", "Login transaction has expired.");
  }

  const config = await googleConfiguration(context.env);
  const tokens = await authorizationCodeGrant(config, context.url, {
    expectedNonce: transaction.nonce,
    expectedState: transaction.state,
    idTokenExpected: true,
    pkceCodeVerifier: transaction.pkceVerifier,
  });
  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw new HttpError(400, "invalid_identity", "Google did not return a valid subject.");
  }
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email || claims.email_verified !== true) {
    throw new HttpError(403, "email_not_verified", "A verified Google email is required.");
  }
  const displayName =
    typeof claims.name === "string" && claims.name.trim()
      ? claims.name.trim().slice(0, 50)
      : email.split("@")[0].slice(0, 50);

  const userId = await provisionGoogleUser(context.env, {
    displayName,
    email,
    subject: claims.sub,
  });
  const session = await createSession(context, userId);
  const user = await loadUser(context.env, userId);
  const destination = user?.username ? transaction.returnTo : "/me/setup";

  const headers = new Headers({ Location: destination });
  headers.append("Set-Cookie", sessionCookie(context.env, session.token));
  headers.append("Set-Cookie", clearTransactionCookie(context.env));
  return new Response(null, { status: 303, headers });
}

async function getAuthSession(context: WorkerRequestContext): Promise<Response> {
  const session = await optionalSession(context);
  return success(context.requestId, session
    ? {
        user: { ...session.user, role: session.role },
        session: {
          createdAt: session.createdAt,
          current: true,
          expiresAt: session.expiresAt,
          id: session.id,
          lastSeenAt: session.lastSeenAt,
        },
      }
    : { user: null, session: null });
}

async function logout(context: WorkerRequestContext): Promise<Response> {
  const session = await optionalSession(context);
  if (session) {
    await context.env.DB.prepare(
      "UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
    ).bind(Date.now(), session.id).run();
  }
  const response = success(context.requestId, { loggedOut: true });
  response.headers.append("Set-Cookie", clearSessionCookie(context.env));
  return response;
}

async function revokeAllSessions(context: WorkerRequestContext): Promise<Response> {
  const session = await requireSession(context);
  const now = Date.now();
  await context.env.DB.prepare(
    "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
  ).bind(now, session.user.id).run();
  const response = success(context.requestId, { revokedAt: now });
  response.headers.append("Set-Cookie", clearSessionCookie(context.env));
  return response;
}

export async function optionalSession(
  context: WorkerRequestContext,
): Promise<AuthenticatedSession | null> {
  const token = parseCookies(context.request).get(sessionCookieName(context.env));
  if (!token || token.length > 256) return null;
  const tokenHash = await sha256(`${sessionPepper(context.env)}:${token}`);
  const now = Date.now();
  const row = await context.env.DB.prepare(
    `SELECT
       s.id AS session_id, s.last_authenticated_at, s.created_at, s.last_seen_at,
       s.expires_at, u.id AS user_id, u.username, u.display_name, u.bio,
       u.role, u.status, u.avatar_seed, u.terms_accepted_at, u.terms_version,
       u.deletion_due_at, u.created_at AS user_created_at, ei.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN external_identities ei ON ei.user_id = u.id AND ei.provider = 'google'
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
     LIMIT 1`,
  ).bind(tokenHash, now).first<SessionRow>();
  if (!row || row.status === "deleted") return null;

  if (now - row.last_seen_at >= 60 * 60 * 1_000) {
    context.executionCtx.waitUntil(
      context.env.DB.prepare(
        "UPDATE sessions SET last_seen_at = ? WHERE id = ? AND last_seen_at = ?",
      ).bind(now, row.session_id, row.last_seen_at).run().then(() => undefined),
    );
  }

  return {
    authenticatedAt: row.last_authenticated_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    fresh: now - row.last_authenticated_at <= FRESH_SESSION_MS,
    id: row.session_id,
    lastSeenAt: row.last_seen_at,
    role: row.role,
    user: {
      avatarSeed: row.avatar_seed,
      bio: row.bio,
      createdAt: row.user_created_at,
      deletionDueAt: row.deletion_due_at,
      displayName: row.display_name,
      email: row.email,
      id: row.user_id,
      status: row.status,
      termsAccepted:
        row.terms_accepted_at !== null && row.terms_version === context.env.TERMS_VERSION,
      termsAcceptedAt: row.terms_accepted_at,
      termsVersion: row.terms_version,
      username: row.username,
    },
  };
}

export async function requireSession(
  context: WorkerRequestContext,
): Promise<AuthenticatedSession> {
  const session = await optionalSession(context);
  if (!session) throw new HttpError(401, "authentication_required", "Sign in is required.");
  return session;
}

export async function requireOnboardedSession(
  context: WorkerRequestContext,
): Promise<AuthenticatedSession> {
  const session = await requireSession(context);
  if (session.user.status !== "active") {
    throw new HttpError(403, "account_not_active", "Restore the account before continuing.");
  }
  if (!session.user.username || !session.user.termsAccepted) {
    throw new HttpError(403, "profile_setup_required", "Finish account setup before continuing.");
  }
  return session;
}

export async function requireFreshSession(
  context: WorkerRequestContext,
): Promise<AuthenticatedSession> {
  const session = await requireSession(context);
  if (!session.fresh) {
    throw new HttpError(401, "fresh_authentication_required", "Sign in again to continue.");
  }
  return session;
}

export async function requireModerator(
  context: WorkerRequestContext,
): Promise<AuthenticatedSession> {
  const session = await requireSession(context);
  if (session.user.status !== "active") {
    throw new HttpError(403, "account_not_active", "Restore the account before continuing.");
  }
  if (session.role !== "moderator" && session.role !== "admin") {
    throw new HttpError(403, "moderator_required", "Moderator access is required.");
  }
  return session;
}

export async function enforceRateLimit(limiter: RateLimit, key: string): Promise<void> {
  const outcome = await limiter.limit({ key });
  if (!outcome.success) {
    throw new HttpError(429, "rate_limited", "Too many requests. Try again later.");
  }
}

export async function clientKey(env: Env, request: Request): Promise<string> {
  const address = request.headers.get("CF-Connecting-IP") ?? "local";
  return pseudonymize(env, "client_ip", address);
}

async function googleConfiguration(env: Env) {
  return discovery(GOOGLE_ISSUER, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
}

function assertOidcConfigured(env: Env): void {
  if (
    !isConfiguredCredential(env.GOOGLE_CLIENT_ID, env.ENVIRONMENT)
    || !isConfiguredCredential(env.GOOGLE_CLIENT_SECRET, env.ENVIRONMENT)
    || !isValidOidcCookieKey(env.OIDC_COOKIE_KEY)
    || !isStrongRuntimeSecret(env.SESSION_PEPPER, env.ENVIRONMENT)
    || (
      env.ENVIRONMENT !== "local"
      && !isStrongRuntimeSecret(env.PSEUDONYM_KEY, env.ENVIRONMENT)
    )
  ) {
    throw new HttpError(503, "oidc_not_configured", "Google sign-in is not configured.");
  }
}

async function provisionGoogleUser(
  env: Env,
  identity: { displayName: string; email: string; subject: string },
): Promise<string> {
  const existing = await env.DB.prepare(
    "SELECT user_id FROM external_identities WHERE provider = 'google' AND provider_subject = ?",
  ).bind(identity.subject).first<{ user_id: string }>();
  const now = Date.now();
  if (existing) {
    await env.DB.prepare(
      "UPDATE external_identities SET email = ?, email_verified = 1, updated_at = ? WHERE provider = 'google' AND provider_subject = ?",
    ).bind(identity.email, now, identity.subject).run();
    return existing.user_id;
  }

  const userId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users
       (id, username, display_name, bio, role, status, avatar_seed, created_at, updated_at)
       VALUES (?, NULL, ?, '', 'user', 'active', ?, ?, ?)`,
    ).bind(userId, identity.displayName, userId, now, now),
    env.DB.prepare(
      `INSERT INTO external_identities
       (id, user_id, provider, provider_subject, email, email_verified, created_at, updated_at)
       VALUES (?, ?, 'google', ?, ?, 1, ?, ?)`,
    ).bind(identityId, userId, identity.subject, identity.email, now, now),
  ]);
  return userId;
}

async function createSession(
  context: WorkerRequestContext,
  userId: string,
): Promise<{ token: string }> {
  const id = crypto.randomUUID();
  const token = randomToken();
  const now = Date.now();
  const tokenHash = await sha256(`${sessionPepper(context.env)}:${token}`);
  const userAgentLabel = normalizeUserAgent(context.request.headers.get("user-agent"));
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO sessions
       (id, user_id, token_hash, ua_label, last_authenticated_at, created_at, last_seen_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).bind(id, userId, tokenHash, userAgentLabel, now, now, now, now + SESSION_TTL_MS),
    context.env.DB.prepare(
      `UPDATE sessions SET revoked_at = ?
       WHERE user_id = ? AND revoked_at IS NULL AND id IN (
         SELECT id FROM sessions WHERE user_id = ? AND revoked_at IS NULL
         ORDER BY created_at DESC LIMIT -1 OFFSET ?
       )`,
    ).bind(now, userId, userId, MAX_ACTIVE_SESSIONS),
  ]);
  return { token };
}

async function loadUser(env: Env, id: string): Promise<{ username: string | null } | null> {
  return env.DB.prepare("SELECT username FROM users WHERE id = ?")
    .bind(id)
    .first<{ username: string | null }>();
}

async function encryptTransaction(
  transaction: z.output<typeof OidcTransactionSchema>,
  env: Env,
): Promise<string> {
  const key = secretKey(env.OIDC_COOKIE_KEY);
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(transaction)))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT" })
    .encrypt(key);
}

async function decryptTransaction(value: string, env: Env) {
  try {
    const { plaintext } = await compactDecrypt(value, secretKey(env.OIDC_COOKIE_KEY));
    const parsed = OidcTransactionSchema.safeParse(JSON.parse(new TextDecoder().decode(plaintext)));
    if (parsed.success) return parsed.data;
  } catch {
    // Normalize crypto and JSON failures to one safe public error.
  }
  throw new HttpError(400, "invalid_oidc_transaction", "Login transaction is invalid.");
}

function sessionPepper(env: Env): string {
  if (!isStrongRuntimeSecret(env.SESSION_PEPPER, env.ENVIRONMENT)) {
    throw new Error("Session secret is not securely configured.");
  }
  return env.SESSION_PEPPER.trim();
}

function isConfiguredCredential(
  value: string | undefined,
  environment: Env["ENVIRONMENT"],
): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (environment === "local") return true;
  if (trimmed.length < 16) return false;
  const normalized = trimmed.toLowerCase();
  return !PLACEHOLDER_CREDENTIAL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

const PLACEHOLDER_CREDENTIAL_PREFIXES = [
  "change-me",
  "change_me",
  "changeme",
  "dev-",
  "dev_",
  "development-",
  "example-",
  "example_",
  "local-",
  "local_",
  "placeholder",
  "replace-",
  "replace_",
  "test-only-",
  "test_only_",
  "test-",
  "test_",
  "your-",
  "your_",
] as const;

function sessionCookieName(env: Env): string {
  return secureCookies(env) ? "__Host-tomodachi.sid" : "tomodachi.sid";
}

function transactionCookieName(env: Env): string {
  return secureCookies(env) ? "__Host-tomodachi.oidc" : "tomodachi.oidc";
}

function sessionCookie(env: Env, token: string): string {
  return cookie(sessionCookieName(env), token, {
    maxAge: SESSION_TTL_MS / 1_000,
    secure: secureCookies(env),
  });
}

function transactionCookie(env: Env, value: string): string {
  return cookie(transactionCookieName(env), value, {
    maxAge: OIDC_TTL_SECONDS,
    secure: secureCookies(env),
  });
}

function clearSessionCookie(env: Env): string {
  return cookie(sessionCookieName(env), "", { maxAge: 0, secure: secureCookies(env) });
}

function clearTransactionCookie(env: Env): string {
  return cookie(transactionCookieName(env), "", { maxAge: 0, secure: secureCookies(env) });
}

function secureCookies(env: Env): boolean {
  return new URL(env.PUBLIC_SITE_URL).protocol === "https:";
}

function normalizeUserAgent(value: string | null): string {
  return (value ?? "Unknown browser")
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .slice(0, 120);
}

async function readLoginStart(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.startsWith("application/json")) {
    return parseJson(request, GoogleAuthStartSchema, 10_000);
  }
  if (contentType.startsWith("application/x-www-form-urlencoded")) {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > 10_000) {
      throw new HttpError(413, "payload_too_large", "Request body is too large.");
    }
    const text = await readText(request, 10_000);
    const form = new URLSearchParams(text);
    const parsed = GoogleAuthStartSchema.safeParse({ returnTo: form.get("returnTo") ?? undefined });
    if (parsed.success) return parsed.data;
    throw new HttpError(400, "validation_error", "Login return path is invalid.");
  }
  throw new HttpError(415, "unsupported_media_type", "Use a form or JSON request.");
}
