import { useEffect } from "react";

/**
 * Set <title> + the matching og:title and twitter:title meta tags for the
 * current route, then restore the previous values on unmount.
 *
 * Why this exists: the SPA shell ships a single static <title> in index.html.
 * Without per-page overrides, every Google result for tomodachi.pw/studio,
 * tomodachi.pw/guides, etc. uses the same homepage title. That's a real SEO
 * cost — Google's title-link heuristic falls back to the h1 in those cases,
 * which can be misleading or truncated. Setting page-specific titles via JS
 * is enough for modern crawlers (Googlebot + Bingbot both execute JS now).
 *
 * Usage:
 *   useDocumentTitle("Studio", "Browser-first Mii pixel-art editor.");
 *   //   → <title>Studio · Tomodachi</title>
 *
 * Pass an explicit second arg to also update the meta description for that
 * route. Skipping it leaves the description from index.html in place.
 */
export function useDocumentTitle(pageName: string, description?: string): void {
  useEffect(() => {
    const previousTitle = document.title;
    const previousDescriptionEl = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDescription = previousDescriptionEl?.content ?? null;

    const fullTitle = pageName ? `${pageName} · Tomodachi` : "Tomodachi";
    document.title = fullTitle;

    // Update og:title + twitter:title in tandem so crawlers (and link
    // unfurlers like Slack/Discord) that re-scrape the SPA see the route-
    // specific value rather than the homepage default.
    const ogTitleEl = document.querySelector<HTMLMetaElement>(
      'meta[property="og:title"]',
    );
    const twitterTitleEl = document.querySelector<HTMLMetaElement>(
      'meta[name="twitter:title"]',
    );
    const previousOgTitle = ogTitleEl?.content ?? null;
    const previousTwitterTitle = twitterTitleEl?.content ?? null;
    if (ogTitleEl) ogTitleEl.content = fullTitle;
    if (twitterTitleEl) twitterTitleEl.content = fullTitle;

    if (description && previousDescriptionEl) {
      previousDescriptionEl.content = description;
    }

    return () => {
      document.title = previousTitle;
      if (previousDescriptionEl && previousDescription !== null) {
        previousDescriptionEl.content = previousDescription;
      }
      if (ogTitleEl && previousOgTitle !== null) {
        ogTitleEl.content = previousOgTitle;
      }
      if (twitterTitleEl && previousTwitterTitle !== null) {
        twitterTitleEl.content = previousTwitterTitle;
      }
    };
  }, [pageName, description]);
}
