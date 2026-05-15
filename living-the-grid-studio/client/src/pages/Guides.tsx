/**
 * /guides — Free guide index.
 *
 * The conversion funnel:
 *   free guide  →  related free tool  →  paid pack / consult / tip jar
 *
 * Each card is a teaser. The actual long-form content lives elsewhere (in
 * future, on dedicated /guides/[slug] routes or in markdown files). For now
 * the CTA points at the place where the user can actually take action.
 */

import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Palette,
  ShieldCheck,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

interface GuideCard {
  id: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  summary: string;
  audience: string;
  freePreview: string[];
  cta: { href: string; label: string };
  upsell?: { href: string; label: string };
}

const GUIDES: GuideCard[] = [
  {
    id: "tomodachi-breach-recovery",
    icon: AlertTriangle,
    title: "Tomodachi breach recovery checklist",
    summary:
      "What to do in the first 24 hours if your email was exposed in the Tomodachishare incident, plus a 30-day monitoring rhythm.",
    audience: "If you got a breach notice or reused passwords with the site.",
    freePreview: [
      "Free: the four most urgent actions to take today.",
      "Free: how to spot reuse across accounts without paying a service.",
      "Free: a printable rotation order so you do the highest-value accounts first.",
    ],
    cta: { href: "/help", label: "Read the free 24-hour actions" },
    upsell: { href: "/unlock", label: "Get the full paid checklist ($9)" },
  },
  {
    id: "mii-face-mask-from-image",
    icon: Sparkles,
    title: "Turn a photo into a repaintable Mii face mask",
    summary:
      "Walks through importing a face photo, choosing the right preset, and tuning the result so it actually paints square-by-square in-game.",
    audience: "Players who want a custom Mii based on a real face or character.",
    freePreview: [
      "Free: the import preset that works best for human faces.",
      "Free: when to drop to 16x16 vs stay at 32x32.",
      "Free: how to use the paint-by-numbers guide to avoid mistakes.",
    ],
    cta: { href: "/studio", label: "Open the studio and try it" },
  },
  {
    id: "reduce-colors-pixel-art",
    icon: Palette,
    title: "Reduce colors for repaintable pixel art",
    summary:
      "How to take a noisy image and bring it down to a tight palette that humans can repaint without losing the recognizable details.",
    audience: "Anyone moving from photos / illustrations to grid-painted art.",
    freePreview: [
      "Free: which palette IDs make the strongest outlines.",
      "Free: which one-cell details to keep and which to merge.",
      "Free: the optimizer settings that preserve facial readability.",
    ],
    cta: { href: "/studio", label: "Use the optimizer in the studio" },
  },
  {
    id: "password-reuse-cleanup",
    icon: ShieldCheck,
    title: "Password reuse cleanup after a community breach",
    summary:
      "A no-jargon guide to finding and rotating every account that shared the breached password, in priority order.",
    audience: "Anyone whose password from one service may have leaked.",
    freePreview: [
      "Free: how to check a password against breach datasets without sending it to anyone.",
      "Free: the priority order: financial, cloud, identity, social, everything else.",
      "Free: which 2FA methods to upgrade to and which to skip.",
    ],
    cta: { href: "/", label: "Run the browser-only password check" },
    upsell: {
      href: "/unlock",
      label: "Pair it with the recovery checklist or 30-min consult",
    },
  },
];

export default function Guides() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="text-sm font-medium hover:underline">
            ← Living The Grid Studio
          </Link>
          <span className="text-xs text-muted-foreground">Free guides</span>
        </div>
      </header>

      <main className="container max-w-4xl py-12 space-y-8">
        <section>
          <h1 className="text-3xl font-semibold">Guides</h1>
          <p className="mt-2 text-muted-foreground">
            Short, practical walkthroughs for the people we actually serve:
            players turning faces and characters into Mii repaint plans, and
            visitors arriving from the Tomodachishare breach notice. Every
            guide gives you the working actions for free first, then points at
            an optional paid upgrade only if you want more depth.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {GUIDES.map((guide) => {
            const Icon = guide.icon;
            return (
              <Card key={guide.id} className="p-5 space-y-3">
                <header className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <h2 className="text-base font-semibold">{guide.title}</h2>
                    <p className="text-xs text-muted-foreground">
                      {guide.audience}
                    </p>
                  </div>
                </header>
                <p className="text-sm">{guide.summary}</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {guide.freePreview.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                  <Button asChild className="sm:flex-1">
                    <Link href={guide.cta.href}>
                      {guide.cta.label}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  {guide.upsell ? (
                    <Button asChild variant="outline" className="sm:flex-1">
                      <Link href={guide.upsell.href}>{guide.upsell.label}</Link>
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </section>

        <section className="border-t border-border pt-6">
          <h2 className="text-lg font-semibold">Help keep guides free</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every guide here stays free. Tips, paid checklists, and consults
            on{" "}
            <Link href="/unlock" className="underline">
              /unlock
            </Link>{" "}
            and{" "}
            <Link href="/support" className="underline">
              /support
            </Link>{" "}
            are what fund the next one.
          </p>
        </section>
      </main>
    </div>
  );
}
