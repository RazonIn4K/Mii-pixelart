import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Compass } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * /404 — soft 404 page rendered by the SPA when wouter's <Switch> falls
 * through to its final route. Cloudflare Pages serves index.html with HTTP
 * 200 for unmatched paths (SPA fallback), so the actual HTTP status is 200.
 * We compensate with a runtime `<meta name="robots" content="noindex">`
 * injection so Googlebot (which runs JS) skips indexing 404 hits.
 */
const SUGGESTIONS: Array<{
  href: string;
  title: string;
  description: string;
}> = [
  {
    href: "/studio",
    title: "Open the Studio",
    description: "Browser-first pixel-art editor — import a face photo, get a paint-by-numbers Mii.",
  },
  {
    href: "/guides",
    title: "Read the free guides",
    description: "Mii creation, gameplay basics, Tomodachishare breach recovery, QR codes + save backup.",
  },
  {
    href: "/help",
    title: "Breach recovery first steps",
    description: "Free 24-hour action plan if you got a Tomodachishare breach notice.",
  },
  {
    href: "/unlock",
    title: "Paid recovery checklist + consult",
    description: "$9 printable 12-step checklist or $49 30-minute one-on-one call.",
  },
];

export default function NotFound() {
  const [path] = useLocation();
  useDocumentTitle("Page not found", "The page you're looking for doesn't exist. Try the studio, the free guides, or the recovery checklist.");

  // SPA returns HTTP 200 for unmatched routes; inject a noindex hint so
  // Googlebot doesn't accidentally index 404 URLs as real pages.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, follow";
    document.head.appendChild(meta);
    return () => {
      meta.parentNode?.removeChild(meta);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="text-sm font-medium hover:underline">
            ← Tomodachi
          </Link>
          <span className="text-xs text-muted-foreground">Page not found</span>
        </div>
      </header>

      <main id="main-content" className="container max-w-3xl py-12 sm:py-16 space-y-8">
        <section className="space-y-3">
          <p className="section-header">404</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            We couldn't find that page.
          </h1>
          {path ? (
            <p className="text-sm text-muted-foreground font-mono break-all">
              Requested: <span className="text-foreground">{path}</span>
            </p>
          ) : null}
          <p className="text-base text-muted-foreground leading-relaxed max-w-prose">
            That URL doesn't exist on the site. It may have been moved, or the
            link you followed might have a typo. Try one of the routes below
            instead — they cover everything Tomodachi does today.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          {SUGGESTIONS.map((entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              className="group flex items-start gap-3 rounded-sm border border-border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-accent"
            >
              <Compass className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-sm font-semibold">
                  {entry.title}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.description}
                </p>
              </div>
            </Link>
          ))}
        </section>

        <section className="border-t border-border pt-6 text-xs text-muted-foreground">
          <p>
            Still stuck?{" "}
            <Link href="/" className="underline">
              Head home
            </Link>{" "}
            and start from the password breach check or the AI recovery
            assistant.
          </p>
        </section>
      </main>

      <footer className="py-8 border-t border-border">
        <div className="container flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="red-dot-sm" />
            <span className="text-xs text-muted-foreground">Tomodachi</span>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </footer>
    </div>
  );
}
