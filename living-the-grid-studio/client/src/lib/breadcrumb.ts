/**
 * Build a Schema.org BreadcrumbList JSON-LD block for a single page.
 *
 * Google's BreadcrumbList rich result replaces the URL slug in the SERP with
 * a Home › Section › Page trail, which is both prettier and slightly higher-
 * CTR. The schema isn't tied to a visual breadcrumb on the page — Google
 * will use it even when the page itself doesn't render one — so this is a
 * pure "add JSON-LD, get prettier SERP" win.
 *
 * Usage:
 *   useStructuredData([breadcrumbFor([
 *     { name: "Home", href: "/" },
 *     { name: "Guides", href: "/guides" },
 *   ])]);
 */

export interface BreadcrumbStep {
  name: string;
  href: string;
}

const ORIGIN = "https://tomodachi.pw";

export function breadcrumbFor(steps: BreadcrumbStep[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: steps.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: `${ORIGIN}${step.href}`,
    })),
  };
}
