/**
 * Shared layout for /privacy, /terms, /cookies, /disclosure.
 *
 * Renders a calm prose container with a back link, last-updated stamp, and
 * footer nav to the other policies. Keeps tone consistent across all four
 * pages so visitors do not feel dropped into a different site.
 */

import { Link } from "wouter";
import type { ReactNode } from "react";

interface LegalLayoutProps {
  title: string;
  intro?: string;
  lastUpdated: string;
  children: ReactNode;
}

const otherDocs: Array<{ href: string; label: string }> = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cookies", label: "Cookie Notice" },
  { href: "/affiliate-disclosure", label: "Affiliate Disclosure" },
];

export function LegalLayout({
  title,
  intro,
  lastUpdated,
  children,
}: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="text-sm font-medium hover:underline">
            ← Tomodachi
          </Link>
          <span className="text-xs text-muted-foreground">
            Last updated {lastUpdated}
          </span>
        </div>
      </header>

      <main id="main-content" className="container py-12">
        <article className="prose prose-neutral mx-auto max-w-3xl dark:prose-invert">
          <h1>{title}</h1>
          {intro ? <p className="lead">{intro}</p> : null}
          {children}
        </article>

        <nav
          aria-label="Other policies"
          className="mx-auto mt-12 flex max-w-3xl flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm text-muted-foreground"
        >
          {otherDocs
            .filter(
              (doc) =>
                doc.label.toLowerCase() !== title.toLowerCase() &&
                !title.toLowerCase().includes(doc.label.toLowerCase()),
            )
            .map((doc) => (
              <Link key={doc.href} href={doc.href} className="hover:underline">
                {doc.label}
              </Link>
            ))}
        </nav>
      </main>
    </div>
  );
}

export default LegalLayout;
