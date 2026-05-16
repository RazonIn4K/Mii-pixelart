import { useEffect } from "react";

/**
 * Inject one or more JSON-LD structured-data blocks into <head> on mount,
 * then remove them on unmount. Each block becomes its own `<script
 * type="application/ld+json" data-injected="hook">` so we can clean up
 * without disturbing the static JSON-LD already in index.html.
 *
 * Modern Googlebot reads JSON-LD from anywhere in the document, but other
 * search engines and link-preview scrapers historically only parsed
 * `<head>`. Putting it there is the safe default.
 *
 * Usage:
 *   useStructuredData([
 *     { "@context": "https://schema.org", "@type": "Article", ... },
 *     { "@context": "https://schema.org", "@type": "HowTo",   ... },
 *   ]);
 *
 * Pass the same array reference (or a memoized one) to avoid re-injection
 * on every render — the effect's dependency is JSON.stringify(blocks), so
 * structurally-identical re-renders are no-ops.
 */
export function useStructuredData(blocks: ReadonlyArray<unknown>): void {
  const serialized = JSON.stringify(blocks);

  useEffect(() => {
    const parsed = JSON.parse(serialized) as unknown[];
    const nodes = parsed.map((block) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.injected = "hook";
      script.textContent = JSON.stringify(block);
      document.head.appendChild(script);
      return script;
    });

    return () => {
      for (const node of nodes) {
        node.parentNode?.removeChild(node);
      }
    };
  }, [serialized]);
}
