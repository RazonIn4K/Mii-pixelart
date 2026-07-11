import { onRequest as legacyCrawlerDocument } from "../functions/_middleware";

import { getCreationBySlug } from "./db";
import type { WorkerRequestContext } from "./http";

const CRAWLER_PATTERN =
  /(?:bot|crawler|spider|slurp|bingpreview|facebookcatalog|facebookexternalhit|facebot|sogou|twitterbot|linkedinbot|whatsapp|slackbot|telegrambot|discordbot)/iu;
const SOCIAL_CRAWLER_PATTERN =
  /(?:facebookexternalhit|facebot|facebookcatalog|facebookbot|twitterbot|linkedinbot|whatsapp|slackbot|telegrambot|discordbot)/iu;
const USERNAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9]|[-_](?=[a-z0-9])){1,22}[a-z0-9]$/u;
const CREATION_SLUG_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
const LEGACY_PRODUCTION_ORIGIN = "https://tomodachi.pw";
const DEFAULT_SOCIAL_IMAGE = "/community-og.jpg";

interface DocumentMetadata {
  canonicalPath: string;
  description: string;
  image?: string;
  jsonLd?: readonly Record<string, unknown>[];
  noindex: boolean;
  ogType?: "article" | "profile" | "website";
  status?: number;
  title: string;
}

interface StaticRouteMetadata {
  description: string;
  noindex?: boolean;
  title: string;
}

interface ProfileMetadataRow {
  bio: string;
  created_at: number;
  display_name: string;
  username: string;
}

const LEGACY_STATIC_METADATA: Readonly<Record<string, StaticRouteMetadata>> = {
  "/": {
    description:
      "A browser-first Mii pixel-art studio paired with practical Tomodachishare breach-recovery guides for Tomodachi Life players.",
    title: "Tomodachi · Mii Studio & Recovery Guides",
  },
  "/about": {
    description:
      "Why Tomodachi exists, what is in it, who is behind it, and how to reach the project for press or partnership.",
    title: "About · Tomodachi",
  },
  "/faq": {
    description:
      "Common questions about Tomodachi Life in 2026, the Tomodachishare breach recovery process, the pixel-art Mii face mask studio, and how this site is funded.",
    title: "FAQ · Tomodachi",
  },
  "/guides": {
    description:
      "Free walkthroughs on Mii creation, Tomodachi Life gameplay basics, Tomodachishare breach recovery, and QR codes + save backup.",
    title: "Guides · Tomodachi",
  },
  "/help": {
    description:
      "Free 24-hour action plan and ongoing checklist for anyone affected by the Tomodachishare breach.",
    title: "Help · Tomodachi",
  },
  "/studio": {
    description:
      "Browser-first Mii pixel-art editor. Import a face photo, reduce colors to the in-game palette, export a paint-by-numbers reference pack.",
    title: "Studio · Tomodachi",
  },
  "/support": {
    description:
      "Tip jar for the Tomodachi project. Drop $5, $15, or $25 to fund the next free guide.",
    title: "Support · Tomodachi",
  },
  "/unlock": {
    description:
      "Paid recovery checklist ($9) and 30-minute one-on-one consult ($49) for the Tomodachishare breach.",
    title: "Unlock · Tomodachi",
  },
};

const LEGACY_ROUTE_ALIASES: Readonly<Record<string, string>> = {
  "/disclosure": "/about",
  "/donate": "/support",
};

const STATIC_METADATA: Readonly<Record<string, StaticRouteMetadata>> = {
  "/affiliate-disclosure": {
    description: "Tomodachi affiliate and funding disclosures.",
    title: "Affiliate disclosure · Tomodachi",
  },
  "/community-guidelines": {
    description:
      "Rules that keep the Island Workshop community original, safe, and constructive.",
    title: "Community guidelines · Tomodachi",
  },
  "/cookies": {
    description:
      "Cookies used for secure sign-in, sessions, preferences, and site operation.",
    title: "Cookie policy · Tomodachi",
  },
  "/copyright": {
    description:
      "Copyright policy and the process for reporting allegedly infringing community content.",
    title: "Copyright policy · Tomodachi",
  },
  "/privacy": {
    description:
      "How Tomodachi handles local projects, accounts, cookies, and community data.",
    title: "Privacy · Tomodachi",
  },
  "/security": {
    description:
      "How Tomodachi protects sessions, community data, and account-recovery tools.",
    title: "Security · Tomodachi",
  },
  "/terms": {
    description: "Terms for using Tomodachi Studio and its community features.",
    title: "Terms · Tomodachi",
  },
};

/**
 * Returns a route-aware HTML response before Static Assets handles the request.
 * Crawlers receive a compact/pre-rendered shell; normal browsers receive the
 * actual SPA shell with its route-specific metadata injected server-side.
 */
export async function dynamicDocument(
  context: WorkerRequestContext,
): Promise<Response | null> {
  if (context.request.method !== "GET" && context.request.method !== "HEAD")
    return null;

  const metadata = await metadataForRequest(context);
  if (!metadata) return null;

  const userAgent = context.request.headers.get("user-agent") ?? "";
  const isCrawler = CRAWLER_PATTERN.test(userAgent);
  const legacyRoute = legacyCanonicalRoute(context.url.pathname);

  if (isCrawler && legacyRoute) {
    const legacy = await renderLegacyCrawlerDocument(context, userAgent);
    if (legacy) return legacy;
  }

  if (isCrawler) {
    return metadataShell(
      context.env,
      metadata,
      SOCIAL_CRAWLER_PATTERN.test(userAgent) ? "social" : "search",
    );
  }

  return spaDocument(context, metadata);
}

async function metadataForRequest(
  context: WorkerRequestContext,
): Promise<DocumentMetadata | null> {
  const path = context.url.pathname;

  if (path.startsWith("/creation/")) {
    return creationMetadata(context, path);
  }

  if (path.startsWith("/u/")) {
    return profileMetadata(context, path);
  }

  if (path === "/discover") {
    const canonicalPath = "/discover";
    return {
      canonicalPath,
      description:
        "Explore original pixel-art projects from the Tomodachi Island Workshop community.",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          description:
            "Explore original pixel-art projects from the Tomodachi Island Workshop community.",
          name: "Discover community creations",
          url: absoluteUrl(context.env, canonicalPath),
        },
      ],
      noindex: false,
      title: "Discover community creations · Tomodachi",
    };
  }

  if (path === "/search") {
    return {
      canonicalPath: "/search",
      description:
        "Search public Island Workshop creations, creators, and allowlisted tags.",
      noindex: true,
      title: "Search · Tomodachi",
    };
  }

  if (path === "/moderation") {
    return {
      canonicalPath: "/moderation",
      description: "Private Tomodachi moderation workspace.",
      noindex: true,
      title: "Moderation · Tomodachi",
    };
  }

  if (path === "/me" || path.startsWith("/me/")) {
    return {
      canonicalPath: safePath(path),
      description: "Private Tomodachi account workspace.",
      noindex: true,
      title: "Account workspace · Tomodachi",
    };
  }

  const legacyPath = legacyCanonicalRoute(path);
  if (legacyPath) {
    const staticMetadata = LEGACY_STATIC_METADATA[legacyPath];
    return {
      canonicalPath: legacyPath,
      description: staticMetadata.description,
      jsonLd: await legacyJsonLd(context, legacyPath),
      noindex: false,
      title: staticMetadata.title,
    };
  }

  const staticMetadata = STATIC_METADATA[path];
  if (staticMetadata) {
    return {
      canonicalPath: path,
      description: staticMetadata.description,
      noindex: staticMetadata.noindex ?? false,
      title: staticMetadata.title,
    };
  }

  return null;
}

async function creationMetadata(
  context: WorkerRequestContext,
  path: string,
): Promise<DocumentMetadata> {
  const decoded = decodeSinglePathSegment(path.slice("/creation/".length));
  if (!decoded || !CREATION_SLUG_PATTERN.test(decoded)) {
    return unavailableCreation(path);
  }

  const creation = await getCreationBySlug(context.env, decoded);
  if (
    !creation ||
    creation.state !== "published" ||
    creation.visibility === "private"
  ) {
    return unavailableCreation(path);
  }
  const activeOwner = await context.env.DB.prepare(
    "SELECT 1 AS active FROM users WHERE id = ? AND status = 'active' LIMIT 1",
  )
    .bind(creation.owner_user_id)
    .first<{ active: number }>();
  if (!activeOwner) return unavailableCreation(path);

  const canonicalPath = `/creation/${encodeURIComponent(decoded)}`;
  const description =
    creation.description || `Pixel-art project by ${creation.display_name}.`;
  const image = `/api/creations/${encodeURIComponent(creation.id)}/media/social`;
  const publishedAt = isoDate(creation.published_at);
  const creatorUrl = creation.username
    ? absoluteUrl(context.env, `/u/${encodeURIComponent(creation.username)}`)
    : undefined;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    creator: {
      "@type": "Person",
      name: creation.display_name,
      ...(creatorUrl ? { url: creatorUrl } : {}),
    },
    description,
    image: absoluteUrl(context.env, image),
    name: creation.title,
    url: absoluteUrl(context.env, canonicalPath),
    ...(creation.tag_slugs
      ? { keywords: creation.tag_slugs.split(",").filter(Boolean) }
      : {}),
    ...(publishedAt ? { datePublished: publishedAt } : {}),
  };

  return {
    canonicalPath,
    description,
    image,
    jsonLd: creation.visibility === "public" ? [jsonLd] : undefined,
    noindex: creation.visibility === "unlisted",
    ogType: "article",
    title: `${creation.title} · Tomodachi`,
  };
}

async function profileMetadata(
  context: WorkerRequestContext,
  path: string,
): Promise<DocumentMetadata> {
  const decoded = decodeSinglePathSegment(path.slice("/u/".length));
  const normalized = decoded?.toLowerCase() ?? "";
  if (!USERNAME_PATTERN.test(normalized)) return unavailableProfile(path);

  const user = await context.env.DB.prepare(
    `SELECT u.username, u.display_name, u.bio, u.created_at
     FROM users u
     WHERE u.username = ? COLLATE NOCASE AND u.status = 'active'
     LIMIT 1`,
  )
    .bind(normalized)
    .first<ProfileMetadataRow>();
  if (!user) return unavailableProfile(path);

  const canonicalPath = `/u/${encodeURIComponent(user.username.toLowerCase())}`;
  const description =
    user.bio || `See ${user.display_name}'s public Island Workshop creations.`;
  const profileUrl = absoluteUrl(context.env, canonicalPath);
  const createdAt = isoDate(user.created_at);
  return {
    canonicalPath,
    description,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        ...(createdAt ? { dateCreated: createdAt } : {}),
        mainEntity: {
          "@type": "Person",
          additionalName: `@${user.username}`,
          description: user.bio || undefined,
          name: user.display_name,
          url: profileUrl,
        },
        name: `${user.display_name}'s Island Workshop profile`,
        url: profileUrl,
      },
    ],
    noindex: false,
    ogType: "profile",
    title: `${user.display_name} (@${user.username}) · Tomodachi`,
  };
}

function unavailableCreation(path: string): DocumentMetadata {
  return {
    canonicalPath: safePath(path),
    description: "This community creation is unavailable.",
    noindex: true,
    status: 404,
    title: "Creation unavailable · Tomodachi",
  };
}

function unavailableProfile(path: string): DocumentMetadata {
  return {
    canonicalPath: safePath(path),
    description: "This community profile is unavailable.",
    noindex: true,
    status: 404,
    title: "Profile unavailable · Tomodachi",
  };
}

async function renderLegacyCrawlerDocument(
  context: WorkerRequestContext,
  userAgent: string,
): Promise<Response | null> {
  const response = await requestLegacyDocument(
    context,
    CRAWLER_PATTERN.test(userAgent) ? userAgent : "Googlebot",
  );
  if (!response) return null;

  const site = siteOrigin(context.env);
  const html = rebaseLegacyHtml(await response.text(), site);
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.set("Content-Type", "text/html; charset=utf-8");
  appendVary(headers, "User-Agent");
  return new Response(html, { headers, status: response.status });
}

async function legacyJsonLd(
  context: WorkerRequestContext,
  canonicalPath: string,
): Promise<readonly Record<string, unknown>[]> {
  const response = await requestLegacyDocument(
    context,
    "Googlebot",
    canonicalPath,
  );
  if (!response) return [];

  const html = rebaseLegacyHtml(await response.text(), siteOrigin(context.env));
  const blocks: Record<string, unknown>[] = [];
  for (const match of html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/giu,
  )) {
    try {
      const value = JSON.parse(match[1]) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        blocks.push(value as Record<string, unknown>);
      }
    } catch {
      // The legacy blocks are static, but a malformed block should never make
      // the SPA document fail. It is safer to omit invalid structured data.
    }
  }
  return blocks;
}

async function requestLegacyDocument(
  context: WorkerRequestContext,
  userAgent: string,
  canonicalPath?: string,
): Promise<Response | null> {
  const url = new URL(context.request.url);
  url.pathname = canonicalPath ?? context.url.pathname;
  url.search = "";
  url.hash = "";
  const headers = new Headers(context.request.headers);
  headers.set("User-Agent", userAgent);
  const request = new Request(url, { headers, method: "GET" });
  const sentinelStatus = 599;
  const response = await legacyCrawlerDocument({
    next: () => Promise.resolve(new Response(null, { status: sentinelStatus })),
    request,
  });
  return response.status === sentinelStatus ? null : response;
}

async function spaDocument(
  context: WorkerRequestContext,
  metadata: DocumentMetadata,
): Promise<Response> {
  const asset = await getSpaAsset(context);
  if (!asset) return metadataShell(context.env, metadata, "spa-fallback");

  const headers = new Headers(asset.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.set("Cache-Control", cacheControl(metadata));
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("X-Document-Render", "spa");
  headers.set("X-Robots-Tag", robotsValue(metadata));
  appendVary(headers, "User-Agent");

  const source = new Response(asset.body, {
    headers,
    status: metadata.status ?? 200,
  });
  const remove = {
    element(element: Element): void {
      element.remove();
    },
  };
  return new HTMLRewriter()
    .on("title", remove)
    .on('meta[name="description"]', remove)
    .on('meta[name="robots"]', remove)
    .on('link[rel="canonical"]', remove)
    .on('meta[property^="og:"]', remove)
    .on('meta[name^="twitter:"]', remove)
    .on('script[type="application/ld+json"]', remove)
    .on("head", {
      element(element) {
        element.append(renderHead(metadata, context.env), { html: true });
      },
    })
    .transform(source);
}

async function getSpaAsset(
  context: WorkerRequestContext,
): Promise<Response | null> {
  const headers = new Headers(context.request.headers);
  headers.delete("If-Modified-Since");
  headers.delete("If-None-Match");
  headers.delete("Range");
  headers.set("Accept", "text/html");

  for (const path of ["/", "/index.html"] as const) {
    try {
      const url = new URL(path, context.request.url);
      const response = await context.env.ASSETS.fetch(
        new Request(url, {
          headers,
          method: "GET",
        }),
      );
      if (
        response.ok &&
        response.headers.get("content-type")?.includes("text/html")
      ) {
        return response;
      }
    } catch {
      // A missing local/test Static Assets binding must not turn a safe
      // noindex document into a 500. The caller falls back to a compact shell.
      return null;
    }
  }
  return null;
}

function metadataShell(
  env: Env,
  metadata: DocumentMetadata,
  renderKind: "search" | "social" | "spa-fallback",
): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${renderHead(metadata, env)}</head><body><header><a href="/">Tomodachi</a></header><main><h1>${escapeHtml(metadata.title)}</h1><p>${escapeHtml(metadata.description)}</p><p><a href="${escapeHtml(metadata.canonicalPath)}">Open in Tomodachi</a></p></main></body></html>`;
  const headers = new Headers({
    "Cache-Control": cacheControl(metadata),
    "Content-Type": "text/html; charset=utf-8",
    "X-Robots-Tag": robotsValue(metadata),
  });
  if (renderKind === "spa-fallback") {
    headers.set("X-Document-Render", renderKind);
  } else {
    headers.set("X-Crawler-Render", renderKind);
  }
  appendVary(headers, "User-Agent");
  return new Response(html, {
    status: metadata.status ?? 200,
    headers,
  });
}

function renderHead(metadata: DocumentMetadata, env: Env): string {
  const canonical = absoluteUrl(env, metadata.canonicalPath);
  const image = absoluteUrl(env, metadata.image ?? DEFAULT_SOCIAL_IMAGE);
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const escapedCanonical = escapeHtml(canonical);
  const escapedImage = escapeHtml(image);
  const jsonLd = (metadata.jsonLd ?? [])
    .map(
      (block) =>
        `<script type="application/ld+json">${safeJsonLd(block)}</script>`,
    )
    .join("");
  return `<title>${title}</title><meta name="description" content="${description}"><meta name="robots" content="${robotsValue(metadata)}"><link rel="canonical" href="${escapedCanonical}"><meta property="og:type" content="${metadata.ogType ?? "website"}"><meta property="og:site_name" content="Tomodachi"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${escapedCanonical}"><meta property="og:image" content="${escapedImage}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${title}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${escapedImage}">${jsonLd}`;
}

function legacyCanonicalRoute(path: string): string | null {
  const canonical = LEGACY_ROUTE_ALIASES[path] ?? path;
  return LEGACY_STATIC_METADATA[canonical] ? canonical : null;
}

function rebaseLegacyHtml(html: string, site: string): string {
  return html
    .replaceAll(
      `${LEGACY_PRODUCTION_ORIGIN}/og-image.png`,
      `${site}${DEFAULT_SOCIAL_IMAGE}`,
    )
    .replaceAll(LEGACY_PRODUCTION_ORIGIN, site);
}

function siteOrigin(env: Env): string {
  return new URL(env.PUBLIC_SITE_URL).origin;
}

function absoluteUrl(env: Env, path: string): string {
  return new URL(path, `${siteOrigin(env)}/`).href;
}

function isoDate(value: number | null): string | undefined {
  if (value === null || !Number.isFinite(value)) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function safePath(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

function cacheControl(metadata: DocumentMetadata): string {
  return metadata.noindex
    ? "private, no-store"
    : "public, max-age=60, s-maxage=300";
}

function robotsValue(metadata: DocumentMetadata): string {
  return metadata.noindex ? "noindex,nofollow" : "index,follow";
}

function appendVary(headers: Headers, value: string): void {
  const existing =
    headers
      .get("Vary")
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? [];
  if (!existing.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
    existing.push(value);
  }
  headers.set("Vary", existing.join(", "));
}

function safeJsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        "&": "&amp;",
        "'": "&#39;",
        '"': "&quot;",
        "<": "&lt;",
        ">": "&gt;",
      })[character] ?? character,
  );
}

function decodeSinglePathSegment(value: string): string | null {
  if (!value || value.includes("/")) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded && !decoded.includes("/") ? decoded : null;
  } catch {
    return null;
  }
}
