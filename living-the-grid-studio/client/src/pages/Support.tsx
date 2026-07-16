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
      "Use the free AI beta and tell us which recommendations were useful, unclear, or missing.",
    href: "/ai-plan",
    icon: Share2,
    label: "Test the AI plan",
  },
  {
    description:
      "Report reproducible bugs or accessibility problems without including private account data.",
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
    "Help improve Tomodachi by testing the Studio and reporting useful feedback. No payments or tips are accepted.",
  );
  useStructuredData([
    breadcrumbFor([
      { name: "Home", href: "/" },
      { name: "Support", href: "/support" },
    ]),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="text-sm font-medium hover:underline">
            ← Tomodachi
          </Link>
          <Heart className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
      </header>

      <main id="main-content" className="container max-w-5xl py-12 sm:py-16">
        <section className="mx-auto max-w-3xl text-center">
          <p className="section-header">Support the workshop</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
            The most useful support is using it.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Tomodachi does not currently accept payments, tips, donations, or
            consultation bookings. Testing the real workflow and sharing clear
            feedback helps more than a checkout ever could.
          </p>
        </section>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {SUPPORT_ACTIONS.map(
            ({ description, external, href, icon: Icon, label }) => (
              <Card key={label} className="border-border bg-card p-6">
                <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                <h2 className="mt-4 text-xl font-semibold">{label}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
                {external ? (
                  <a
                    href={href}
                    className="mt-5 inline-flex min-h-10 items-center rounded-sm border border-border bg-background px-4 text-sm font-medium hover:bg-accent"
                    {...(href.startsWith("http")
                      ? { rel: "noopener noreferrer", target: "_blank" }
                      : {})}
                  >
                    {label}
                  </a>
                ) : (
                  <Link
                    href={href}
                    className="mt-5 inline-flex min-h-10 items-center rounded-sm border border-border bg-background px-4 text-sm font-medium hover:bg-accent"
                  >
                    {label}
                  </Link>
                )}
              </Card>
            ),
          )}
        </div>
      </main>
    </div>
  );
}
