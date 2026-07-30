/**
 * Home.tsx — Tomodachi public landing page
 *
 * DESIGN: "Island Workshop"
 * Community discovery from TomodachiShare + the focused, local-first utility
 * of Living the Grid, expressed through an original editorial/pixel-workshop
 * system rather than copying either site's interface.
 */

import { preload } from "react-dom";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import HomeBelowFold from "@/components/home/HomeBelowFold";
import { IslandHeader } from "@/components/layout/IslandHeader";
import { IslandFooter } from "@/components/layout/IslandFooter";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  ArrowRight,
  Grid3X3,
  Heart,
  LockKeyhole,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

const HERO_IMG = "/hero.webp";

const creationTypes = [
  { label: "Mii faces", color: "var(--island-coral)" },
  { label: "Characters", color: "var(--island-blue)" },
  { label: "Logos", color: "var(--island-yellow)" },
  { label: "Clothing", color: "var(--island-mint)" },
  { label: "Sprites", color: "var(--island-lilac)" },
];

export default function Home() {
  preload(HERO_IMG, { as: "image", fetchPriority: "high" });
  useDocumentTitle(
    "",
    "Turn faces, characters, logos, and sketches into clear, paintable pixel guides with an unofficial browser-first creator studio for Tomodachi fans.",
    {
      canonicalPath: "/",
      fullTitle: "Tomodachi.pw · Turn Ideas Into Paintable Pixel Guides",
      noindex: false,
      ogType: "website",
    },
  );
  return (
    <div className="min-h-screen bg-background">
      <IslandHeader fixed />

      <main id="main-content">
        <section className="island-hero relative pt-16">
          <div className="island-orbit island-orbit-one" aria-hidden="true" />
          <div className="island-orbit island-orbit-two" aria-hidden="true" />
          <div className="container relative grid min-h-[760px] items-center gap-12 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:py-24">
            <div className="relative z-10 max-w-2xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--island-ink)]/12 bg-white/75 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--island-muted-ink)] shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Fan-made creator toolkit
              </div>

              <h1
                aria-label="Your island. Your style. Pixel by pixel."
                className="max-w-[740px] text-[clamp(3.35rem,8vw,7.25rem)] font-black leading-[0.84] tracking-[-0.075em] text-[var(--island-ink)]"
              >
                Your island.
                <span className="relative mt-2 block w-fit text-primary">
                  Your style.
                  <svg
                    className="absolute -bottom-4 left-0 h-4 w-full overflow-visible"
                    viewBox="0 0 500 20"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 12 C95 2 178 19 274 9 C350 1 425 14 496 5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="mt-5 block">Pixel by pixel.</span>
              </h1>

              <p className="mt-9 max-w-xl text-base font-medium leading-7 text-[var(--island-muted-ink)] sm:text-lg">
                Turn faces, characters, logos, memes, and sketches into clear,
                paintable guides—then refine every square in a private,
                browser-first studio.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="island-button h-13 w-full rounded-full px-7 font-bold sm:w-auto"
                >
                  <Link href="/studio">
                    Start creating
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="island-outline-button h-13 w-full rounded-full px-7 font-bold sm:w-auto"
                >
                  <Link href="/guides">Browse guides</Link>
                </Button>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[var(--island-muted-ink)]">
                <span className="flex items-center gap-1.5">
                  <LockKeyhole className="h-3.5 w-3.5 text-[var(--island-mint-dark)]" />{" "}
                  No account required
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-[var(--island-yellow-dark)]" />{" "}
                  Runs in your browser
                </span>
                <span className="flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5 text-primary" /> Made for fans
                </span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[640px] lg:translate-x-5">
              <div className="island-window rotate-[1.25deg]">
                <div className="island-window-bar">
                  <div className="flex gap-1.5" aria-hidden="true">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--island-coral)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--island-yellow)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--island-mint)]" />
                  </div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--island-muted-ink)]">
                    New project / Face paint
                  </span>
                  <Grid3X3 className="h-4 w-4 text-[var(--island-ink)]/40" />
                </div>
                <div className="relative overflow-hidden bg-[var(--island-paper)] p-3 sm:p-5">
                  <img
                    src={HERO_IMG}
                    alt="A Mii face reference on grid paper beside colored pencils"
                    className="aspect-[16/10] w-full rounded-[1.1rem] object-cover"
                    width={1920}
                    height={1072}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                  />
                  <div className="absolute bottom-7 left-7 flex items-center gap-2 rounded-full border border-white/70 bg-white/90 px-3 py-2 text-[11px] font-bold text-[var(--island-ink)] shadow-lg backdrop-blur">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--island-mint-dark)]" />
                    Ready to repaint
                  </div>
                </div>
              </div>

              <div className="island-float-card -left-5 top-16 hidden -rotate-6 sm:block">
                <span className="text-2xl font-black text-[var(--island-ink)]">
                  84
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--island-muted-ink)]">
                  palette colors
                </span>
              </div>

              <div className="island-float-card -bottom-7 right-1 rotate-3">
                <div className="mb-2 flex gap-1">
                  {["#f36b5f", "#69b7ef", "#f7cd57", "#6cc5a1", "#9f88d8"].map(
                    (color) => (
                      <span
                        key={color}
                        className="h-5 w-5 rounded-md border-2 border-white shadow-sm"
                        style={{ backgroundColor: color }}
                      />
                    ),
                  )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--island-muted-ink)]">
                  your working palette
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          id="discover"
          className="border-y border-[var(--island-ink)]/10 bg-white/72 py-5"
        >
          <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <p className="text-sm font-bold text-[var(--island-ink)]">
                Made for every kind of island creator
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {creationTypes.map((type) => (
                <span
                  key={type.label}
                  className="rounded-full border border-[var(--island-ink)]/10 bg-white px-3 py-1.5 text-[11px] font-bold text-[var(--island-ink)]/70 shadow-sm"
                >
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: type.color }}
                  />
                  {type.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <HomeBelowFold />
      </main>

      <IslandFooter />
    </div>
  );
}
