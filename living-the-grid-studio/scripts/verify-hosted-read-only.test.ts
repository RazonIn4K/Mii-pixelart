import { describe, expect, it } from "vitest";

import {
  assertHostedRequestAllowed,
  HostedAcceptanceError,
  parseHostedAcceptanceArgs,
  parseHostedAcceptanceTarget,
  readBoundedResponseText,
  runHostedReadOnlyAcceptance,
  type AcceptanceFetch,
  type CommunityMutationsExpectation,
} from "./verify-hosted-read-only";

const FIXTURE_ORIGIN = "http://127.0.0.1:48123";
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

interface SeenRequest {
  body: string;
  credentials: RequestCredentials | undefined;
  headers: Headers;
  method: string;
  redirect: RequestRedirect | undefined;
  url: URL;
}

function fixtureFetch(
  options: {
    communityMutations?: CommunityMutationsExpectation;
    omitCsp?: boolean;
  } = {},
): {
  fetchImpl: AcceptanceFetch;
  seen: SeenRequest[];
} {
  const seen: SeenRequest[] = [];
  let requestNumber = 0;

  const fetchImpl: AcceptanceFetch = async (input, init) => {
    const request = new Request(input, init);
    requestNumber += 1;
    const body = request.method === "POST" ? await request.text() : "";
    const url = new URL(request.url);
    seen.push({
      body,
      credentials: init?.credentials,
      headers: new Headers(request.headers),
      method: request.method,
      redirect: init?.redirect,
      url,
    });

    const requestId = `00000000-0000-4000-8000-${requestNumber
      .toString()
      .padStart(12, "0")}`;
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Security-Policy": CSP,
      "Content-Type": "text/html; charset=utf-8",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Request-Id": requestId,
      "X-Robots-Tag": "noindex,nofollow",
    });
    if (options.omitCsp && requestNumber === 1) {
      headers.delete("Content-Security-Policy");
    }

    if (request.method === "POST" && url.pathname === "/api/creations") {
      headers.set("Content-Type", "application/json; charset=utf-8");
      const sameOrigin = request.headers.get("origin") === FIXTURE_ORIGIN;
      const enabled = options.communityMutations === "enabled";
      return new Response(
        JSON.stringify({
          error: {
            code: sameOrigin
              ? enabled
                ? "UNAUTHENTICATED"
                : "SERVICE_UNAVAILABLE"
              : "FORBIDDEN",
            message: "Blocked by fixture policy.",
          },
          requestId,
        }),
        { headers, status: sameOrigin ? (enabled ? 401 : 503) : 403 },
      );
    }

    if (url.pathname === "/robots.txt") {
      headers.set("Content-Type", "text/plain; charset=utf-8");
      return new Response("User-agent: *\nDisallow: /\n", { headers });
    }
    if (["/sitemap.xml", "/sitemap-images.xml"].includes(url.pathname)) {
      headers.set("Content-Type", "application/xml; charset=utf-8");
      return new Response(
        '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
        { headers },
      );
    }
    if (url.pathname.startsWith("/api/")) {
      headers.set("Content-Type", "application/json; charset=utf-8");
      return new Response(JSON.stringify({ data: [], requestId }), { headers });
    }

    const userAgent = request.headers.get("user-agent") ?? "";
    if (url.pathname === "/discover" && /googlebot/iu.test(userAgent)) {
      headers.set("X-Crawler-Render", "search");
      return new Response(
        `<html><head><link rel="canonical" href="${FIXTURE_ORIGIN}/discover"></head></html>`,
        { headers },
      );
    }
    if (
      url.pathname === "/discover" &&
      /facebookexternalhit/iu.test(userAgent)
    ) {
      headers.set("X-Crawler-Render", "social");
      return new Response(
        `<html><head><link rel="canonical" href="${FIXTURE_ORIGIN}/discover"></head></html>`,
        { headers },
      );
    }

    if (
      url.pathname === "/creation/does-not-exist" ||
      url.pathname === "/u/missing-user"
    ) {
      return new Response(
        `<html><head><link rel="canonical" href="${FIXTURE_ORIGIN}${url.pathname}"></head></html>`,
        { headers, status: 404 },
      );
    }

    headers.set("X-Document-Render", "spa");
    const canonical = `${FIXTURE_ORIGIN}${url.pathname}`;
    return new Response(
      `<html><head><link rel="canonical" href="${canonical}"></head><body><div id="root"></div></body></html>`,
      { headers },
    );
  };

  return { fetchImpl, seen };
}

describe("hosted read-only target policy", () => {
  it("requires an explicit, allowlisted origin", () => {
    expect(
      parseHostedAcceptanceTarget("https://staging.tomodachi.pw").origin,
    ).toBe("https://staging.tomodachi.pw");
    expect(
      parseHostedAcceptanceTarget(`${FIXTURE_ORIGIN}/`, {
        allowLoopback: true,
      }).origin,
    ).toBe(FIXTURE_ORIGIN);

    for (const target of [
      "",
      "https://tomodachi.pw",
      "https://www.tomodachi.pw",
      "http://staging.tomodachi.pw",
      "https://staging.tomodachi.pw:444",
      "https://staging.tomodachi.pw/studio",
      "https://staging.tomodachi.pw/?target=production",
      "https://user:pass@staging.tomodachi.pw",
      "https://staging.tomodachi.pw.example.com",
      "https://example.com",
      FIXTURE_ORIGIN,
    ]) {
      expect(() => parseHostedAcceptanceTarget(target), target).toThrow(
        HostedAcceptanceError,
      );
    }
  });

  it("has no implicit CLI target", () => {
    expect(() => parseHostedAcceptanceArgs([])).toThrow(
      "An explicit --base-url is required",
    );
    expect(() =>
      parseHostedAcceptanceArgs(["--base-url", "https://tomodachi.pw"]),
    ).toThrow("Production hosts are forbidden");
    expect(() =>
      parseHostedAcceptanceArgs(["--base-url", FIXTURE_ORIGIN]),
    ).toThrow("not in the acceptance allowlist");
    expect(
      parseHostedAcceptanceArgs([
        "--",
        "--base-url",
        "https://staging.tomodachi.pw",
      ]),
    ).toEqual({ baseUrl: "https://staging.tomodachi.pw" });
    expect(
      parseHostedAcceptanceArgs([
        "--base-url",
        "https://staging.tomodachi.pw",
        "--expect-community-mutations",
        "enabled",
      ]),
    ).toEqual({
      baseUrl: "https://staging.tomodachi.pw",
      expectedCommunityMutations: "enabled",
    });
    for (const args of [
      [
        "--base-url",
        "https://staging.tomodachi.pw",
        "--expect-community-mutations",
        "blocked",
      ],
      [
        "--base-url",
        "https://staging.tomodachi.pw",
        "--community-mutations",
        "enabled",
      ],
      [
        "--base-url",
        "https://staging.tomodachi.pw",
        "--expect-community-mutations",
      ],
    ]) {
      expect(() => parseHostedAcceptanceArgs(args), args.join(" ")).toThrow(
        HostedAcceptanceError,
      );
    }
  });

  it("rejects production before the fetch implementation is reached", async () => {
    let fetchCalls = 0;
    await expect(
      runHostedReadOnlyAcceptance({
        baseUrl: "https://tomodachi.pw",
        fetchImpl: async () => {
          fetchCalls += 1;
          throw new Error("must not run");
        },
      }),
    ).rejects.toThrow("Production hosts are forbidden");
    expect(fetchCalls).toBe(0);
  });

  it("rejects routes, methods, bodies, and credentials outside the policy", () => {
    const target = parseHostedAcceptanceTarget(FIXTURE_ORIGIN, {
      allowLoopback: true,
    });
    for (const pathname of [
      "/api/auth/session",
      "/api/me",
      "/api/ai/status",
      "/api/stripe/products",
      "/api/webhooks/stripe",
      "/api/moderation/reports",
      "/api/creations/private-id",
      "/api/discover/recent?limit=50",
    ]) {
      expect(
        () => assertHostedRequestAllowed(target, pathname),
        pathname,
      ).toThrow(HostedAcceptanceError);
    }
    expect(() =>
      assertHostedRequestAllowed(target, "/api/creations", {
        headers: {
          "Content-Type": "application/json",
          Origin: target.origin,
        },
        method: "DELETE",
      }),
    ).toThrow("not an approved fail-closed probe");
    expect(() =>
      assertHostedRequestAllowed(target, "/api/creations", {
        body: '{"title":"write"}',
        headers: {
          "Content-Type": "application/json",
          Origin: target.origin,
        },
        method: "POST",
      }),
    ).toThrow("body must be exactly {}");
    expect(() =>
      assertHostedRequestAllowed(target, "/", {
        headers: { Authorization: "Bearer forbidden" },
      }),
    ).toThrow("Header authorization is forbidden");
    expect(() =>
      assertHostedRequestAllowed(target, `//user:pass@${target.host}/`),
    ).toThrow("absolute path");
  });
});

describe("hosted read-only acceptance", () => {
  it("passes against a local Worker-shaped fixture without remote state", async () => {
    const fixture = fixtureFetch();
    const result = await runHostedReadOnlyAcceptance({
      baseUrl: FIXTURE_ORIGIN,
      fetchImpl: fixture.fetchImpl,
    });

    expect(result).toMatchObject({
      communityMutations: "blocked",
      requests: 28,
      target: FIXTURE_ORIGIN,
    });
    expect(result.assertions).toBeGreaterThanOrEqual(280);
    expect(fixture.seen).toHaveLength(28);
    expect(
      fixture.seen.every(
        (request) =>
          request.url.origin === FIXTURE_ORIGIN &&
          request.credentials === "omit" &&
          request.redirect === "manual" &&
          !request.headers.has("authorization") &&
          !request.headers.has("cookie"),
      ),
    ).toBe(true);
    expect(fixture.seen.filter((request) => request.method === "POST")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body: "{}" }),
        expect.objectContaining({ body: "{}" }),
      ]),
    );
    expect(
      fixture.seen.some((request) =>
        /^\/api\/(?:auth|me|ai|stripe|webhooks|moderation)(?:\/|$)/u.test(
          request.url.pathname,
        ),
      ),
    ).toBe(false);
  });

  it("accepts an explicitly enabled deployment only when anonymous writes reach authentication", async () => {
    const fixture = fixtureFetch({ communityMutations: "enabled" });
    const result = await runHostedReadOnlyAcceptance({
      baseUrl: FIXTURE_ORIGIN,
      expectedCommunityMutations: "enabled",
      fetchImpl: fixture.fetchImpl,
    });

    expect(result).toMatchObject({
      communityMutations: "enabled",
      requests: 28,
      target: FIXTURE_ORIGIN,
    });
    expect(result.assertions).toBeGreaterThanOrEqual(280);
    const probes = fixture.seen.filter((request) => request.method === "POST");
    expect(probes).toHaveLength(2);
    expect(
      probes.every(
        (request) =>
          request.url.pathname === "/api/creations" &&
          request.body === "{}" &&
          request.credentials === "omit" &&
          !request.headers.has("authorization") &&
          !request.headers.has("cookie"),
      ),
    ).toBe(true);
  });

  it("rejects a deployment whose mutation mode does not match the explicit expectation", async () => {
    const fixture = fixtureFetch();
    await expect(
      runHostedReadOnlyAcceptance({
        baseUrl: FIXTURE_ORIGIN,
        expectedCommunityMutations: "enabled",
        fetchImpl: fixture.fetchImpl,
      }),
    ).rejects.toThrow("same-origin community probe did not fail closed");
    expect(fixture.seen).toHaveLength(27);
  });

  it("stops at the first failed security invariant", async () => {
    const fixture = fixtureFetch({ omitCsp: true });
    await expect(
      runHostedReadOnlyAcceptance({
        baseUrl: FIXTURE_ORIGIN,
        fetchImpl: fixture.fetchImpl,
      }),
    ).rejects.toThrow("incomplete CSP");
    expect(fixture.seen).toHaveLength(1);
  });

  it("keeps the request deadline active while a response body is stalled", async () => {
    let fetchCalls = 0;
    const stalledBody = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => {}),
    });
    const run = runHostedReadOnlyAcceptance({
      baseUrl: FIXTURE_ORIGIN,
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(stalledBody, { status: 200 });
      },
      timeoutMs: 25,
    });
    const guardedRun = Promise.race([
      run,
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error("test guard: stalled body did not time out")),
          500,
        );
      }),
    ]);

    await expect(guardedRun).rejects.toThrow("timed out after 25ms");
    expect(fetchCalls).toBe(1);
  });

  it.each([
    {
      expected: "attempted to redirect",
      label: "redirect",
      response: () =>
        new Response(null, {
          headers: { Location: "https://tomodachi.pw/" },
          status: 302,
        }),
    },
    {
      expected: "unexpectedly returned session material",
      label: "Set-Cookie",
      response: () =>
        new Response("blocked", {
          headers: { "Set-Cookie": "session=forbidden; Secure; HttpOnly" },
          status: 200,
        }),
    },
    {
      expected: "returned a response from another origin",
      label: "cross-origin response URL",
      response: () => {
        const response = new Response("blocked", { status: 200 });
        Object.defineProperty(response, "url", {
          value: "https://example.invalid/",
        });
        return response;
      },
    },
  ])("rejects a $label before continuing", async ({ expected, response }) => {
    let fetchCalls = 0;
    await expect(
      runHostedReadOnlyAcceptance({
        baseUrl: FIXTURE_ORIGIN,
        fetchImpl: async () => {
          fetchCalls += 1;
          return response();
        },
      }),
    ).rejects.toThrow(expected);
    expect(fetchCalls).toBe(1);
  });

  it("rejects declared and streamed oversized bodies", async () => {
    await expect(
      readBoundedResponseText(
        new Response("small", { headers: { "Content-Length": "100" } }),
        5,
      ),
    ).rejects.toThrow("exceeds the 5-byte");
    await expect(
      readBoundedResponseText(new Response("sixsix"), 5),
    ).rejects.toThrow("exceeds the 5-byte");
  });
});
