import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { canonicalizeGridDocument } from "../shared/community";
import { clientKey, enforceRateLimit } from "./auth";
import { isCommunityMutationBlocked } from "./community-mode";
import {
  isStrongRuntimeSecret,
  isValidOidcCookieKey,
  safeRelativeReturnTo,
  secretKey,
  sha256,
} from "./crypto";
import { applySecurityHeaders, errorResponse, failure, readJson } from "./http";
import { renderGridSvg } from "./media";

describe("Worker security primitives", () => {
  it("hashes session material as lowercase SHA-256 hex", async () => {
    await expect(sha256("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("accepts only site-relative return paths", () => {
    expect(safeRelativeReturnTo("/studio?cloud=abc")).toBe("/studio?cloud=abc");
    expect(safeRelativeReturnTo("//evil.example/path")).toBe("/me");
    expect(safeRelativeReturnTo("https://evil.example/path")).toBe("/me");
  });

  it("derives deterministic keyed client pseudonyms rather than raw IP hashes", async () => {
    const fakeEnv = {
      ENVIRONMENT: "local",
      PSEUDONYM_KEY: "unit-test-pseudonym-key",
    } as unknown as Env;
    const request = new Request("https://example.test", {
      headers: { "CF-Connecting-IP": "203.0.113.42" },
    });
    const first = await clientKey(fakeEnv, request);
    const second = await clientKey(fakeEnv, request);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(first).not.toBe(await sha256("203.0.113.42"));
  });

  it("rejects weak remote secrets and decodes exact 32-byte OIDC keys", () => {
    const keyBytes = new Uint8Array(32).fill(7);
    const encodedKey = btoa(String.fromCharCode(...keyBytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/u, "");
    expect(isValidOidcCookieKey(encodedKey)).toBe(true);
    expect(secretKey(encodedKey)).toEqual(keyBytes);
    expect(isValidOidcCookieKey("replace-with-32-byte-base64url-key")).toBe(false);
    expect(() => secretKey("short")).toThrow(/32 base64url/iu);

    expect(isStrongRuntimeSecret("short-local-secret", "local")).toBe(true);
    expect(isStrongRuntimeSecret("short", "staging")).toBe(false);
    expect(isStrongRuntimeSecret("test-only-".padEnd(48, "x"), "production")).toBe(false);
    expect(isStrongRuntimeSecret("7FqQW-1sz9y8wSRjK5odL4hB2cPN6Vmu", "production")).toBe(true);
  });

  it("rejects bodies that exceed a bounded reader limit", async () => {
    const request = new Request("https://example.test/api", {
      body: JSON.stringify({ value: "too large" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    await expect(readJson(request, 4)).rejects.toMatchObject({ status: 413 });
  });

  it("normalizes internal errors and applies HTTPS security headers", async () => {
    const raw = failure("request-1", 401, "authentication_required", "Sign in.");
    const withScheme = new Response(raw.body, { headers: { ...Object.fromEntries(raw.headers), "X-Worker-Scheme": "https" }, status: raw.status });
    const response = applySecurityHeaders(withScheme, "request-1");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
      requestId: "request-1",
    });
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(response.headers.get("content-security-policy")).toContain(
      "form-action 'self' https://accounts.google.com https://checkout.stripe.com",
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "font-src 'self' data:",
    );
    expect(response.headers.get("content-security-policy")).not.toContain(
      "fonts.googleapis.com",
    );
    expect(response.headers.get("content-security-policy")).not.toContain(
      "fonts.gstatic.com",
    );
    expect(
      response.headers.get("content-security-policy-report-only"),
    ).toBeNull();
  });

  it("returns a Retry-After hint when a binding rejects a request", async () => {
    const limiter: RateLimit = {
      limit: async () => ({ success: false }),
    };
    const error = await enforceRateLimit(limiter, "pseudonymous-client").catch(
      (caught: unknown) => caught,
    );
    const response = errorResponse(error, "request-rate-limited");

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED" },
      requestId: "request-rate-limited",
    });
  });

  it("fails closed for community mutations while preserving operational controls", () => {
    for (const value of [undefined, "", "false", "TRUE", "1"]) {
      expect(isCommunityMutationBlocked("POST", "/api/creations", value)).toBe(true);
    }
    expect(isCommunityMutationBlocked("POST", "/api/creations", "true")).toBe(false);

    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(isCommunityMutationBlocked(method, "/api/creations", undefined)).toBe(false);
    }

    for (const [method, path] of [
      ["POST", "/api/auth/google/start"],
      ["POST", "/api/auth/logout"],
      ["POST", "/api/auth/revoke-all"],
      ["DELETE", "/api/me"],
      ["POST", "/api/me/deletion/cancel"],
      ["POST", "/api/ai/chat"],
      ["POST", "/api/stripe/checkout"],
      ["POST", "/api/webhooks/stripe"],
    ]) {
      expect(isCommunityMutationBlocked(method, path, undefined)).toBe(false);
    }

    expect(isCommunityMutationBlocked("POST", "/api/reports", undefined)).toBe(true);
    expect(isCommunityMutationBlocked("PATCH", "/api/me", undefined)).toBe(true);
    expect(isCommunityMutationBlocked("POST", "/api/moderation/reports/id/actions", undefined)).toBe(true);
    expect(isCommunityMutationBlocked("POST", "/api/future-write", undefined)).toBe(true);
  });
});
describe("deterministic preview rendering", () => {
  it("renders exact Studio palette hex colors and no user markup", () => {
    const timestamp = "2026-07-10T12:00:00.000Z";
    const project = canonicalizeGridDocument({
      version: 1,
      meta: { name: "<script>alert(1)</script>", createdAt: timestamp, modifiedAt: timestamp },
      width: 8,
      height: 8,
      cells: ["R1C1", "R10C7", ...Array.from({ length: 62 }, () => null)],
      usedColors: ["R1C1", "R10C7"],
      lockedColors: [],
    });
    const svg = renderGridSvg(project);
    expect(svg).toContain('fill="#8B0000"');
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).not.toContain("script");
    expect(renderGridSvg(project)).toBe(svg);
  });
});

describe("Worker HTTP integration", () => {
  it("returns the anonymous session envelope with hardened headers", async () => {
    const response = await SELF.fetch("http://localhost:3000/api/auth/session");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        capabilities: { communityMutationsEnabled: true },
        session: null,
        user: null,
      },
    });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves an empty public discovery feed from migrated D1", async () => {
    const response = await SELF.fetch("http://localhost:3000/api/discover/recent");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [],
      meta: { hasMore: false, limit: 24, nextCursor: null },
    });
  });

  it("returns a successful null envelope when random discovery is empty", async () => {
    const response = await SELF.fetch("http://localhost:3000/api/discover/random");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: null,
    });
  });

  it("returns the documented not-found envelope for unknown tag feeds", async () => {
    const response = await SELF.fetch("http://localhost:3000/api/tags/not-a-launch-tag");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("rejects unsafe cross-origin mutations before route handling", async () => {
    const response = await SELF.fetch("http://localhost:3000/api/auth/logout", {
      body: "{}",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      method: "POST",
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  it("rejects same-origin unsafe mutations that are not JSON", async () => {
    const response = await SELF.fetch("http://localhost:3000/api/auth/logout", {
      body: "not-json",
      headers: { "Content-Type": "text/plain", Origin: "http://localhost:3000" },
      method: "POST",
    });
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BAD_REQUEST" },
    });
  });

  it("requires an onboarded session before accepting AI requests", async () => {
    const response = await SELF.fetch("http://localhost:3000/api/ai/chat", {
      body: JSON.stringify({
        messages: [{ content: "Reply with pong.", role: "user" }],
        model: "anthropic/claude-opus-4.1",
      }),
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      method: "POST",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });
});
