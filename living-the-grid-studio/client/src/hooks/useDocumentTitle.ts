import { useEffect } from "react";

interface DocumentMetadataOptions {
  canonicalPath?: string;
  fullTitle?: string;
  image?: string | null;
  noindex?: boolean | null;
  ogType?: "article" | "profile" | "website";
}

const DEFAULT_DESCRIPTION =
  "Create, refine, and share paintable pixel guides with Tomodachi's browser-first Island Workshop.";

/**
 * Keep the hydrated SPA's title, description, canonical, social card, and
 * indexing state synchronized with the current route.
 *
 * The Worker injects complete metadata for direct requests. Client-side
 * navigation has no new document response, so this hook must also establish a
 * complete destination state instead of inheriting the route the app left.
 * When the current document was already injected for this exact route, its
 * route-specific description and image are preserved unless the page supplies
 * newer values.
 */
export function useDocumentTitle(
  pageName: string,
  description?: string,
  options: DocumentMetadataOptions = {},
): void {
  const {
    canonicalPath,
    fullTitle: explicitTitle,
    image,
    noindex,
    ogType,
  } = options;

  useEffect(() => {
    const descriptionEl = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const ogTitleEl = document.querySelector<HTMLMetaElement>(
      'meta[property="og:title"]',
    );
    const twitterTitleEl = document.querySelector<HTMLMetaElement>(
      'meta[name="twitter:title"]',
    );
    const ogDescriptionEl = document.querySelector<HTMLMetaElement>(
      'meta[property="og:description"]',
    );
    const twitterDescriptionEl = document.querySelector<HTMLMetaElement>(
      'meta[name="twitter:description"]',
    );
    const canonicalEl = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const ogUrlEl = document.querySelector<HTMLMetaElement>(
      'meta[property="og:url"]',
    );
    const ogTypeEl = document.querySelector<HTMLMetaElement>(
      'meta[property="og:type"]',
    );
    const ogImageEl = document.querySelector<HTMLMetaElement>(
      'meta[property="og:image"]',
    );
    const ogImageAltEl = document.querySelector<HTMLMetaElement>(
      'meta[property="og:image:alt"]',
    );
    const twitterImageEl = document.querySelector<HTMLMetaElement>(
      'meta[name="twitter:image"]',
    );
    const robotsEl = document.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );

    const previous = {
      canonical: canonicalEl?.href ?? null,
      description: descriptionEl?.content ?? null,
      ogDescription: ogDescriptionEl?.content ?? null,
      ogImage: ogImageEl?.content ?? null,
      ogImageAlt: ogImageAltEl?.content ?? null,
      ogTitle: ogTitleEl?.content ?? null,
      ogType: ogTypeEl?.content ?? null,
      ogUrl: ogUrlEl?.content ?? null,
      robots: robotsEl?.content ?? null,
      title: document.title,
      twitterDescription: twitterDescriptionEl?.content ?? null,
      twitterImage: twitterImageEl?.content ?? null,
      twitterTitle: twitterTitleEl?.content ?? null,
    };

    const requestedPath = canonicalPath ?? window.location.pathname;
    const routePath = `/${requestedPath.replace(/^\/+/, "")}`;
    const canonicalBase = previous.canonical ?? window.location.origin;
    const canonical = new URL(canonicalBase);
    canonical.pathname = routePath;
    canonical.search = "";
    canonical.hash = "";
    const canonicalUrl = canonical.href;
    const serverMetadataMatchesRoute = previous.canonical
      ? new URL(previous.canonical).pathname === routePath
      : false;
    const fullTitle =
      explicitTitle ?? (pageName ? `${pageName} · Tomodachi` : "Tomodachi");
    const routeDescription =
      description ??
      (serverMetadataMatchesRoute ? previous.description : null) ??
      DEFAULT_DESCRIPTION;
    const requestedImage = image ? new URL(image, canonicalBase) : null;
    const routeImage =
      requestedImage?.origin === canonical.origin
        ? requestedImage.href
        : serverMetadataMatchesRoute && previous.ogImage
          ? previous.ogImage
          : new URL("/community-og.jpg", canonical.origin).href;

    document.title = fullTitle;
    if (descriptionEl) descriptionEl.content = routeDescription;
    if (ogTitleEl) ogTitleEl.content = fullTitle;
    if (twitterTitleEl) twitterTitleEl.content = fullTitle;
    if (ogDescriptionEl) ogDescriptionEl.content = routeDescription;
    if (twitterDescriptionEl) twitterDescriptionEl.content = routeDescription;
    if (canonicalEl) canonicalEl.href = canonicalUrl;
    if (ogUrlEl) ogUrlEl.content = canonicalUrl;
    if (ogTypeEl) {
      ogTypeEl.content =
        ogType ??
        (serverMetadataMatchesRoute ? previous.ogType : null) ??
        "website";
    }
    if (ogImageEl) ogImageEl.content = routeImage;
    if (ogImageAltEl) ogImageAltEl.content = fullTitle;
    if (twitterImageEl) twitterImageEl.content = routeImage;
    if (robotsEl && noindex !== null) {
      if (typeof noindex === "boolean") {
        robotsEl.content = noindex ? "noindex,nofollow" : "index,follow";
      } else if (!serverMetadataMatchesRoute) {
        robotsEl.content = "index,follow";
      }
    }

    return () => {
      document.title = previous.title;
      if (descriptionEl && previous.description !== null)
        descriptionEl.content = previous.description;
      if (ogTitleEl && previous.ogTitle !== null)
        ogTitleEl.content = previous.ogTitle;
      if (twitterTitleEl && previous.twitterTitle !== null)
        twitterTitleEl.content = previous.twitterTitle;
      if (ogDescriptionEl && previous.ogDescription !== null)
        ogDescriptionEl.content = previous.ogDescription;
      if (twitterDescriptionEl && previous.twitterDescription !== null)
        twitterDescriptionEl.content = previous.twitterDescription;
      if (canonicalEl && previous.canonical !== null)
        canonicalEl.href = previous.canonical;
      if (ogUrlEl && previous.ogUrl !== null) ogUrlEl.content = previous.ogUrl;
      if (ogTypeEl && previous.ogType !== null)
        ogTypeEl.content = previous.ogType;
      if (ogImageEl && previous.ogImage !== null)
        ogImageEl.content = previous.ogImage;
      if (ogImageAltEl && previous.ogImageAlt !== null)
        ogImageAltEl.content = previous.ogImageAlt;
      if (twitterImageEl && previous.twitterImage !== null)
        twitterImageEl.content = previous.twitterImage;
      if (robotsEl && previous.robots !== null)
        robotsEl.content = previous.robots;
    };
  }, [
    canonicalPath,
    description,
    explicitTitle,
    image,
    noindex,
    ogType,
    pageName,
  ]);
}
