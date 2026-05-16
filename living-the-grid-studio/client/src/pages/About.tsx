/**
 * /about — Project origin, identity, and what's actually inside.
 *
 * The site has been operating without a stable identity page, which leaves
 * three audiences guessing:
 *   1. Visitors arriving from a Tomodachishare breach notice want to know
 *      who they're handing their email address to in the AI assistant.
 *   2. Journalists and bloggers covering the breach need a citable
 *      description of the project + a single contact surface.
 *   3. Potential sponsors (GitHub Sponsors, Patreon, Brave Creators) want a
 *      stable "About" they can quote from when describing the project.
 *
 * This page is also the natural home for Organization-level JSON-LD —
 * sameAs links to GitHub, the .brave mirror, and the Brave Creator-verified
 * domain so Google can resolve the entity graph.
 */

import { Link } from "wouter";
import { Github, Heart, ShieldCheck, Sparkles } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useStructuredData } from "@/hooks/useStructuredData";
import { breadcrumbFor } from "@/lib/breadcrumb";

const ABOUT_STRUCTURED_DATA = [
  breadcrumbFor([
    { name: "Home", href: "/" },
    { name: "About", href: "/about" },
  ]),
  {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    inLanguage: "en",
    name: "About Tomodachi",
    url: "https://tomodachi.pw/about",
    mainEntity: {
      "@type": "Organization",
      "@id": "https://tomodachi.pw/#org",
      name: "Tomodachi",
      url: "https://tomodachi.pw/",
      logo: "https://tomodachi.pw/og-image.png",
      description:
        "Browser-first Mii pixel-art studio paired with practical Tomodachishare breach-recovery guides.",
      sameAs: [
        "https://github.com/RazonIn4K",
        "https://tomodachi.brave",
        "https://tomodachi.pw/",
      ],
      knowsAbout: [
        "Tomodachi Life",
        "Mii pixel art",
        "Mii face mask",
        "Tomodachishare breach recovery",
        "k-anonymity password breach lookup",
      ],
    },
  },
];

export default function About() {
  useDocumentTitle(
    "About",
    "Why Tomodachi exists, what's in it, who's behind it, and how to reach the project for press or partnership.",
  );
  useStructuredData(ABOUT_STRUCTURED_DATA);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="text-sm font-medium hover:underline">
            ← Tomodachi
          </Link>
          <span className="text-xs text-muted-foreground">About</span>
        </div>
      </header>

      <main className="container max-w-3xl py-10 sm:py-12 space-y-10">
        <section className="space-y-4">
          <p className="section-header">About</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            A Mii pixel-art studio paired with practical breach recovery.
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed max-w-prose">
            Tomodachi is two things stacked on one site. The{" "}
            <Link href="/studio" className="underline">
              Studio
            </Link>{" "}
            is a browser-first pixel-art editor for Mii face masks — import a
            photo or character art, reduce its colors against the in-game
            Tomodachi Life: Living the Dream palette, and export a paint-by-
            numbers reference you can recreate on a real 3DS. The{" "}
            <Link href="/guides" className="underline">
              Guides
            </Link>{" "}
            and the{" "}
            <Link href="/help" className="underline">
              recovery help
            </Link>{" "}
            are for the second audience: people who landed here after the
            Tomodachishare credential leak and need a calm, free, no-spam path
            to a working recovery checklist.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-sm border border-border bg-card p-4">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-sm font-semibold">Free first</h2>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              The editor, the password check, the AI assistant, and every guide
              stay free. Optional paid extras live on /unlock; tips live on
              /support.
            </p>
          </div>
          <div className="rounded-sm border border-border bg-card p-4">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-sm font-semibold">Privacy on principle</h2>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Photos never leave the browser. The password check uses k-anonymity
              against Have I Been Pwned. No accounts, no tracking until you opt
              in via the cookie banner.
            </p>
          </div>
          <div className="rounded-sm border border-border bg-card p-4">
            <Heart className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-sm font-semibold">Solo-built, sponsor-supported</h2>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              One developer, open source, supported by Stripe tips and a small
              paid recovery pack. GitHub Sponsors application in flight.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
            Origin
          </h2>
          <p className="text-sm leading-relaxed text-foreground/85">
            The project started as a single-purpose pixel-art tool for
            recreating real faces inside Tomodachi Life — the kind of thing
            you'd usually piece together from a Reddit post and a graph-paper
            scan. When the Tomodachishare breach happened, it became clear that
            the same Tomodachi audience was also being told to "rotate
            passwords" without much practical help. So the studio grew a second
            wing: a calm browser-only password checker, an OpenRouter-backed
            recovery assistant, and a free 24-hour action plan.
          </p>
          <p className="text-sm leading-relaxed text-foreground/85">
            The site is hosted on Cloudflare Pages with Pages Functions for the
            API surface, a small KV namespace for caching the model catalog,
            Stripe Checkout for the paid items, and the Have I Been Pwned API
            for the password check. The full stack is documented in the repo
            README.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
            What's actually inside
          </h2>
          <ul className="space-y-2 text-sm leading-relaxed text-foreground/85 list-disc pl-5">
            <li>
              <Link href="/studio" className="underline">
                Studio
              </Link>
              : import → reduce colors → export a paint-by-numbers reference
              pack (PDF + JSON + palette sheet). 84-color in-game palette with
              row/column labels for exact matching.
            </li>
            <li>
              <Link href="/" className="underline">
                Home recovery hub
              </Link>
              : a browser-only password breach check (k-anonymity SHA-1 prefix)
              and an OpenRouter-backed AI recovery assistant with four free
              model options.
            </li>
            <li>
              <Link href="/guides" className="underline">
                Long-form guides
              </Link>
              : Mii creation, Tomodachi Life gameplay basics, post-breach
              recovery, QR codes + save backup.
            </li>
            <li>
              <Link href="/faq" className="underline">
                FAQ
              </Link>
              : the questions people actually ask, with FAQPage rich-result
              schema.
            </li>
            <li>
              <Link href="/unlock" className="underline">
                Unlock
              </Link>
              : a $9 printable 12-step recovery checklist and a $49 30-minute
              one-on-one consult.
            </li>
            <li>
              <Link href="/support" className="underline">
                Support / tip jar
              </Link>
              : fixed $5 / $15 / $25 Stripe tips, plus Brave Rewards for the
              .brave-verified audience.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
            How to reach the project
          </h2>
          <ul className="space-y-2 text-sm leading-relaxed text-foreground/85">
            <li>
              <strong>Source code &amp; issues:</strong>{" "}
              <a
                href="https://github.com/RazonIn4K/Mii-pixelart"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/RazonIn4K/Mii-pixelart <Github className="inline h-3.5 w-3.5" />
              </a>
            </li>
            <li>
              <strong>Press / partnership:</strong> open a GitHub issue tagged
              <code className="ml-1 rounded bg-accent px-1.5 py-0.5 text-xs">press</code>
              {" "}— it's the most reliable channel. We'll respond with whatever
              short bio, hero image, or numbers you need for the story.
            </li>
            <li>
              <strong>Sponsorship:</strong> Stripe-backed tips and paid checklist
              via the{" "}
              <Link href="/support" className="underline">
                support page
              </Link>
              ; GitHub Sponsors via the repo's Sponsor button once approved.
            </li>
            <li>
              <strong>Brave Rewards:</strong> the domain is a verified Brave
              Creator. The Rewards icon in the Brave address bar will recognize
              it.
            </li>
          </ul>
        </section>

        <section className="border-t border-border pt-6 text-sm text-muted-foreground">
          <p>
            For the legal entity, see{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>
            ,{" "}
            <Link href="/privacy" className="underline">
              Privacy
            </Link>
            , and the{" "}
            <Link href="/affiliate-disclosure" className="underline">
              Affiliate Disclosure
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
