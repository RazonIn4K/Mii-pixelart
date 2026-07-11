import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import type { CreationRow } from "./db";
import { dynamicDocument } from "./documents";
import type { WorkerRequestContext } from "./http";

const SPA = `<!doctype html><html lang="en"><head>
  <title>Generic SPA title</title>
  <meta name="description" content="generic description">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="https://example.invalid/">
  <meta property="og:title" content="generic social title">
  <meta name="twitter:title" content="generic social title">
  <script type="application/ld+json">{"@type":"WrongPage"}</script>
  </head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`;

describe("Worker route documents", () => {
  it("keeps the SPA for normal browsers while replacing generic metadata and legacy JSON-LD", async () => {
    const response = await dynamicDocument(context("/faq", "Mozilla/5.0"));
    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-document-render")).toBe("spa");
    expect(response?.headers.get("x-robots-tag")).toBe("index,follow");

    const html = await response!.text();
    expect(html).toContain('<script type="module" src="/app.js"></script>');
    expect(html).toContain("<title>FAQ · Tomodachi</title>");
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain("http://localhost:3000/community-og.jpg");
    expect(html).not.toContain("Generic SPA title");
    expect(html).not.toContain('"@type":"WrongPage"');
    expect(html).not.toContain("og-image.png");
  });

  it("preserves the legacy pre-rendered FAQ shell for search crawlers", async () => {
    const response = await dynamicDocument(
      context("/faq", "Mozilla/5.0 Googlebot/2.1"),
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-crawler-render")).toBe("search");
    const html = await response!.text();
    expect(html).toContain("Frequently asked questions");
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain("http://localhost:3000/community-og.jpg");
    expect(html).not.toContain("og-image.png");
  });

  it("escapes creation text in both HTML metadata and JSON-LD", async () => {
    const creation = creationRow({
      description: '"><img src=x onerror=alert(1)>',
      title: "</title><script>alert(1)</script>",
      visibility: "public",
    });
    const response = await dynamicDocument(
      context("/creation/Test_slug", "Mozilla/5.0", creation),
    );
    expect(response?.status).toBe(200);
    const html = await response!.text();
    expect(html).toContain(
      "&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).not.toContain("</title><script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
  });

  it("serves unlisted creations for sharing but marks every representation noindex", async () => {
    const response = await dynamicDocument(
      context(
        "/creation/Test_slug",
        "facebookexternalhit/1.1",
        creationRow({ visibility: "unlisted" }),
      ),
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-crawler-render")).toBe("social");
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(response?.headers.get("x-robots-tag")).toBe("noindex,nofollow");
    const html = await response!.text();
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).not.toContain('"@type":"CreativeWork"');
  });

  it("handles malformed path encoding as an unavailable noindex SPA document", async () => {
    const response = await dynamicDocument(
      context("/creation/%E0%A4%A", "Mozilla/5.0"),
    );
    expect(response?.status).toBe(404);
    expect(response?.headers.get("x-document-render")).toBe("spa");
    expect(response?.headers.get("x-robots-tag")).toBe("noindex,nofollow");
    const html = await response!.text();
    expect(html).toContain("Creation unavailable · Tomodachi");
    expect(html).toContain('<script type="module" src="/app.js"></script>');
  });

  it("handles malformed path encoding through the full Worker entry point", async () => {
    const response = await SELF.fetch(
      "http://localhost:3000/creation/%E0%A4%A",
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-robots-tag")).toBe("noindex,nofollow");
    expect(await response.text()).toContain("Creation unavailable · Tomodachi");
  });

  it("serves escaped canonical profile metadata to normal browsers", async () => {
    const response = await dynamicDocument(
      context("/u/Island_Artist", "Mozilla/5.0", undefined, {
        bio: "<img src=x onerror=alert(1)>",
        created_at: Date.UTC(2026, 6, 10),
        display_name: "<Island Artist>",
        username: "island_artist",
      }),
    );
    expect(response?.status).toBe(200);
    const html = await response!.text();
    expect(html).toContain(
      '<link rel="canonical" href="http://localhost:3000/u/island_artist">',
    );
    expect(html).toContain("&lt;Island Artist&gt;");
    expect(html).toContain("\\u003cimg src=x onerror=alert(1)\\u003e");
    expect(html).not.toContain("<img src=x");
  });

  it("does not leak private creation metadata", async () => {
    const response = await dynamicDocument(
      context(
        "/creation/Test_slug",
        "Twitterbot/1.0",
        creationRow({ title: "Private secret title", visibility: "private" }),
      ),
    );
    expect(response?.status).toBe(404);
    expect(response?.headers.get("x-robots-tag")).toBe("noindex,nofollow");
    const html = await response!.text();
    expect(html).toContain("Creation unavailable · Tomodachi");
    expect(html).not.toContain("Private secret title");
  });
});

function context(
  path: string,
  userAgent: string,
  creation?: CreationRow,
  profile?: {
    bio: string;
    created_at: number;
    display_name: string;
    username: string;
  },
): WorkerRequestContext {
  const env = {
    ASSETS: {
      fetch: () =>
        Promise.resolve(
          new Response(SPA, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
        ),
    },
    DB: {
      prepare(query: string) {
        return {
          bind() {
            return {
              first: () =>
                Promise.resolve(
                  query.includes("FROM users u")
                    ? (profile ?? null)
                    : query.includes("FROM creations c")
                      ? (creation ?? null)
                      : { active: 1 },
                ),
            };
          },
        };
      },
    },
    ENVIRONMENT: "local",
    PUBLIC_SITE_URL: "http://localhost:3000",
  } as Env;
  const request = new Request(`http://localhost:3000${path}`, {
    headers: { "User-Agent": userAgent },
  });
  return {
    env,
    executionCtx: {} as ExecutionContext,
    params: {},
    request,
    requestId: "document-test",
    url: new URL(request.url),
  };
}

function creationRow(overrides: Partial<CreationRow> = {}): CreationRow {
  return {
    avatar_seed: "avatar-seed",
    bytes_total: 1,
    comment_count: 0,
    comments_enabled: 1,
    comments_locked: 0,
    created_at: Date.UTC(2026, 6, 10),
    current_revision_id: "revision-id",
    description: "A public project.",
    display_name: "Island Artist",
    id: "creation-id",
    like_count: 0,
    owner_user_id: "owner-id",
    popularity_score: 0,
    project_download_enabled: 0,
    published_at: Date.UTC(2026, 6, 10),
    revision_number: 1,
    slug: "Test_slug",
    state: "published",
    tag_slugs: "portraits,cute",
    tags_json: "[]",
    title: "Public project",
    updated_at: Date.UTC(2026, 6, 10),
    username: "island-artist",
    visibility: "public",
    ...overrides,
  };
}
