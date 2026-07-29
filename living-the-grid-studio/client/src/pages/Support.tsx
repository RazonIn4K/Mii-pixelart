import { Bug, Heart, MessageCircle, Share2, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useStructuredData } from "@/hooks/useStructuredData";
import { breadcrumbFor } from "@/lib/breadcrumb";

const SUPPORT_ACTIONS = [
  {
    description:
      "Try drawing, importing, exporting, and copying a real design. Specific feedback is the fastest way to improve the workshop.",
    href: "/studio",
    icon: Sparkles,
    label: "Test the Studio",
  },
  {
    description:
      "Publish original work when community sharing opens and help other creators learn from a clear reference.",
    href: "/discover",
    icon: Share2,
    label: "Share a creation",
  },
  {
    description:
      "Report reproducible bugs or accessibility problems in the public repository without including private account data.",
    href: "https://github.com/RazonIn4K/Mii-pixelart/issues",
    icon: Bug,
    label: "Report an issue",
    external: true,
  },
  {
    description:
      "Send product questions to help@tomodachi.pw. Security reports belong at security@tomodachi.pw.",
    href: "mailto:help@tomodachi.pw",
    icon: MessageCircle,
    label: "Send feedback",
    external: true,
  },
];

export default function Support() {
  useDocumentTitle(
    "Support Tomodachi",
    "Help improve Tomodachi by testing the Studio, sharing original creations, and reporting useful feedback.",
    { canonicalPath: "/support" },
  );
  useStructuredData([
    breadcrumbFor([
      { name: "Home", href: "/" },
      { name: "Support", href: "/support" },
    ]),
  ]);

  return (
    <div className="min-h-screen bg-[var(--island-paper)] text-[var(--island-ink)]">
      <header className="border-b border-[var(--island-ink)]/10 bg-white/75">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="text-sm font-extrabold hover:underline">
            ← Tomodachi
          </Link>
          <Heart
            className="h-5 w-5 text-[var(--island-coral)]"
            aria-hidden="true"
          />
        </div>
      </header>

      <main id="main-content" className="container max-w-5xl py-12 sm:py-16">
        <section className="mx-auto max-w-3xl text-center">
          <p className="island-kicker">Support the workshop</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] sm:text-6xl">
            The most useful support is using it.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-[var(--island-muted-ink)]">
            Test a real drawing workflow, share original creations, and send
            clear feedback. Specific examples help turn rough edges into a
            workshop that is easier for everyone to use.
          </p>
        </section>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {SUPPORT_ACTIONS.map(
            ({ description, external, href, icon: Icon, label }) => {
              const className =
                "mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-[var(--island-ink)]/15 bg-white px-4 text-sm font-black hover:border-[var(--island-ink)]/40";
              return (
                <Card
                  key={label}
                  className="rounded-3xl border border-[var(--island-ink)]/15 bg-white/85 p-6"
                >
                  <Icon
                    className="h-7 w-7 text-[var(--island-ink)]/75"
                    aria-hidden="true"
                  />
                  <h2 className="mt-4 text-xl font-black">{label}</h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-[var(--island-muted-ink)]">
                    {description}
                  </p>
                  {external ? (
                    <a
                      href={href}
                      className={className}
                      {...(href.startsWith("http")
                        ? { rel: "noopener noreferrer", target: "_blank" }
                        : {})}
                    >
                      {label}
                    </a>
                  ) : (
                    <Link href={href} className={className}>
                      {label}
                    </Link>
                  )}
                </Card>
              );
            },
          )}
        </div>

        <Card className="mt-8 rounded-3xl border-2 border-[var(--island-ink)] bg-[var(--island-yellow)] p-6 shadow-[7px_7px_0_var(--island-ink)] sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em]">
                Need a creative starting point?
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Try the Studio AI tools
              </h2>
              <p className="mt-2 text-sm font-semibold text-[var(--island-ink)]/70">
                Ask for reviewable advice or generate one original source image,
                then decide whether to convert it into the 256×256 canvas.
              </p>
            </div>
            <Link
              href="/studio"
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-[var(--island-ink)] px-5 text-sm font-black text-white"
            >
              Open the Studio
            </Link>
          </div>
        </Card>
      </main>
    </div>
  );
}
