import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { canonicalizeGridDocument } from "../shared/community";
import { clientKey } from "./auth";
import { safeRelativeReturnTo, sha256 } from "./crypto";
import { applySecurityHeaders, failure, readJson } from "./http";
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
      data: { session: null, user: null },
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
});
