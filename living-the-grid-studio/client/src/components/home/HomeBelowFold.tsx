import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Brush,
  Download,
  Grid3X3,
  Image as ImageIcon,
  Palette,
  ShieldCheck,
  Sparkles,
  Upload,
  WandSparkles,
} from "lucide-react";

const CANVAS_IMG = "/canvas-demo-v2.webp";
const PALETTE_IMG = "/palette-swatches.webp";
const RecoveryHub = lazy(() => import("@/components/home/RecoveryHub"));

const featureCards = [
  {
    icon: Upload,
    eyebrow: "Bring anything",
    title: "Import images or JSON",
    description:
      "Start with a face, character reference, logo, meme, or a compatible indexed-palette project.",
    className: "md:col-span-2 bg-[var(--island-blue-soft)]",
  },
  {
    icon: Palette,
    eyebrow: "Stay accurate",
    title: "84-color working palette",
    description:
      "Every swatch has a stable row-and-column ID, so your guide stays reproducible.",
    className: "bg-[var(--island-yellow-soft)]",
  },
  {
    icon: Brush,
    eyebrow: "Make it yours",
    title: "Paint and refine",
    description:
      "Pencil, erase, fill, sample colors, undo, and touch up directly on the grid.",
    className: "bg-[var(--island-mint-soft)]",
  },
  {
    icon: WandSparkles,
    eyebrow: "Remove the busywork",
    title: "Optimize without guessing",
    description:
      "Merge close colors, remove tiny islands, clean lone pixels, and cap the palette.",
    className: "md:col-span-2 bg-[var(--island-coral-soft)]",
  },
];

const workflow = [
  {
    number: "01",
    icon: ImageIcon,
    title: "Choose your reference",
    text: "Upload an image, open a template, or import an existing grid project.",
  },
  {
    number: "02",
    icon: Grid3X3,
    title: "Fit it to the grid",
    text: "Pick a preset for a face, character, sprite, logo, sticker, or full image.",
  },
  {
    number: "03",
    icon: Sparkles,
    title: "Clean the design",
    text: "Tune framing and color, then simplify anything that is hard to repaint.",
  },
  {
    number: "04",
    icon: Download,
    title: "Take your recipe",
    text: "Export the labeled guide, clean image, palette sheet, JSON, or full pack.",
  },
];

function RecoveryHubFallback() {
  return (
    <section
      id="recovery"
      className="island-recovery min-h-[108rem] py-20 sm:py-28 lg:min-h-[68rem]"
      aria-busy="true"
      aria-label="Recovery tools"
    >
      <div className="container flex min-h-80 items-center justify-center">
        <p className="rounded-full border border-[var(--island-ink)]/10 bg-white/70 px-5 py-3 text-sm font-bold text-[var(--island-muted-ink)]">
          Opening recovery tools…
        </p>
      </div>
    </section>
  );
}

function DeferredRecoveryHub() {
  const boundaryRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(
    () => typeof window !== "undefined" && window.location.hash === "#recovery",
  );

  useEffect(() => {
    if (shouldLoad) return;

    const reveal = () => setShouldLoad(true);
    const revealForHash = () => {
      if (window.location.hash === "#recovery") reveal();
    };
    const boundary = boundaryRef.current;
    const observer =
      boundary && "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) reveal();
            },
            { rootMargin: "800px 0px" },
          )
        : null;

    if (observer && boundary) observer.observe(boundary);
    if (!observer) reveal();
    window.addEventListener("hashchange", revealForHash);
    const eventualLoad = window.setTimeout(reveal, 8_000);

    return () => {
      observer?.disconnect();
      window.clearTimeout(eventualLoad);
      window.removeEventListener("hashchange", revealForHash);
    };
  }, [shouldLoad]);

  return (
    <div ref={boundaryRef}>
      {shouldLoad ? (
        <Suspense fallback={<RecoveryHubFallback />}>
          <RecoveryHub />
        </Suspense>
      ) : (
        <RecoveryHubFallback />
      )}
    </div>
  );
}

export default function HomeBelowFold() {
  return (
    <>
      <section className="home-render-section home-render-paths py-20 sm:py-28">
        <div className="container">
          <div className="mb-12 grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <p className="island-kicker">Two paths, one friendly home</p>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.045em] text-[var(--island-ink)] sm:text-5xl">
                Create freely.
                <br />
                Recover safely.
              </h2>
            </div>
            <p className="max-w-2xl text-base font-medium leading-7 text-[var(--island-muted-ink)] lg:justify-self-end">
              Tomodachi combines the energy of a community discovery page with a
              focused creation workspace. The creative studio stays fun;
              security help stays clearly separated, calm, and practical.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <article className="island-path-card island-path-create">
              <div className="relative z-10 max-w-md">
                <span className="island-card-number">01 / CREATE</span>
                <h3 className="mt-8 text-3xl font-black tracking-[-0.04em] text-[var(--island-ink)]">
                  Build something unmistakably yours.
                </h3>
                <p className="mt-4 text-sm font-medium leading-6 text-[var(--island-muted-ink)]">
                  Import, draw, simplify, and export without sending your
                  working image to an account system.
                </p>
                <Link
                  href="/studio"
                  className="mt-7 inline-flex items-center gap-2 text-sm font-extrabold text-[var(--island-ink)] underline decoration-primary decoration-2 underline-offset-4"
                >
                  Enter the studio <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <Grid3X3
                className="absolute -bottom-10 -right-8 h-56 w-56 rotate-12 text-[var(--island-blue)]/18"
                aria-hidden="true"
              />
            </article>

            <article className="island-path-card island-path-help">
              <div className="relative z-10 max-w-md">
                <span className="island-card-number">02 / RECOVER</span>
                <h3 className="mt-8 text-3xl font-black tracking-[-0.04em] text-[var(--island-ink)]">
                  Get clear next steps after a breach.
                </h3>
                <p className="mt-4 text-sm font-medium leading-6 text-[var(--island-muted-ink)]">
                  Use a privacy-aware password check, a recovery plan, and
                  plain-language guides without mixing crisis help with ads.
                </p>
                <a
                  href="#recovery"
                  className="mt-7 inline-flex items-center gap-2 text-sm font-extrabold text-[var(--island-ink)] underline decoration-[var(--island-mint-dark)] decoration-2 underline-offset-4"
                >
                  Open recovery tools <ArrowRight className="h-4 w-4" />
                </a>
              </div>
              <ShieldCheck
                className="absolute -bottom-10 -right-8 h-56 w-56 -rotate-12 text-[var(--island-mint-dark)]/14"
                aria-hidden="true"
              />
            </article>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="home-render-section home-render-workflow island-section-blue py-20 sm:py-28"
      >
        <div className="container">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="island-kicker">A simple creative loop</p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.05em] text-[var(--island-ink)] sm:text-5xl">
              From idea to paintable recipe.
            </h2>
            <p className="mt-5 text-base font-medium leading-7 text-[var(--island-muted-ink)]">
              The studio handles conversion and organization. You stay in
              control of the actual design.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {workflow.map((step) => (
              <article key={step.number} className="island-step-card group">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold tracking-[0.15em] text-primary">
                    {step.number}
                  </span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--island-paper)] text-[var(--island-ink)] transition-transform group-hover:-rotate-6 group-hover:scale-110">
                    <step.icon className="h-5 w-5" />
                  </span>
                </div>
                <h3 className="mt-10 text-xl font-black tracking-[-0.025em] text-[var(--island-ink)]">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm font-medium leading-6 text-[var(--island-muted-ink)]">
                  {step.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-render-section home-render-workshop py-20 sm:py-28">
        <div className="container grid gap-12 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="island-kicker">The workshop</p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.05em] text-[var(--island-ink)] sm:text-5xl">
              Powerful tools.
              <br />
              Playful surface.
            </h2>
            <p className="mt-5 max-w-md text-base font-medium leading-7 text-[var(--island-muted-ink)]">
              A friendly interface on top, deterministic grid and palette logic
              underneath. Every project remains editable and exportable.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {[
                "Preview before commit",
                "Undoable cleanup",
                "JSON round-trip",
                "AI sketches validated",
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-[var(--island-ink)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {featureCards.map((feature) => (
              <article
                key={feature.title}
                className={`island-feature-card ${feature.className}`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/75 text-[var(--island-ink)] shadow-sm">
                  <feature.icon className="h-5 w-5" />
                </div>
                <p className="mt-8 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--island-muted-ink)]">
                  {feature.eyebrow}
                </p>
                <h3 className="mt-2 text-2xl font-black tracking-[-0.035em] text-[var(--island-ink)]">
                  {feature.title}
                </h3>
                <p className="mt-3 max-w-md text-sm font-medium leading-6 text-[var(--island-muted-ink)]">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-render-section home-render-showcase border-y border-[var(--island-ink)]/10 bg-white py-20 sm:py-28">
        <div className="container">
          <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="island-kicker">Designed to be followed by hand</p>
              <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.05em] text-[var(--island-ink)] sm:text-5xl">
                Less guessing between screen and game.
              </h2>
            </div>
            <Link
              href="/studio"
              className="inline-flex items-center gap-2 text-sm font-extrabold text-primary"
            >
              Try your own image <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <figure className="island-showcase-card">
              <img
                src={CANVAS_IMG}
                alt="An original lantern workshop robot arranged as a repaintable pixel guide on graph paper"
                className="aspect-[4/3] w-full object-cover"
                width={1254}
                height={1254}
                loading="lazy"
                decoding="async"
              />
              <figcaption className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-sm font-black text-[var(--island-ink)]">
                    Original workshop bot
                  </p>
                  <p className="mt-1 text-xs font-medium text-[var(--island-muted-ink)]">
                    Clean shapes, visible cells, repeatable result.
                  </p>
                </div>
                <Grid3X3 className="h-5 w-5 text-primary" />
              </figcaption>
            </figure>
            <figure className="island-showcase-card lg:translate-y-12">
              <img
                src={PALETTE_IMG}
                alt="A labeled reference sheet showing the available color swatches"
                className="aspect-[4/3] w-full object-cover"
                width={1920}
                height={1434}
                loading="lazy"
                decoding="async"
              />
              <figcaption className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-sm font-black text-[var(--island-ink)]">
                    Palette recipe
                  </p>
                  <p className="mt-1 text-xs font-medium text-[var(--island-muted-ink)]">
                    Stable swatch IDs for every color choice.
                  </p>
                </div>
                <Palette className="h-5 w-5 text-[var(--island-blue)]" />
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <DeferredRecoveryHub />

      <section className="home-render-section home-render-cta py-20 sm:py-28">
        <div className="container">
          <div className="island-final-cta relative overflow-hidden px-6 py-16 text-center sm:px-12 sm:py-20">
            <div className="relative z-10 mx-auto max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/60">
                Your next creation starts here
              </p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-6xl">
                Bring the idea.
                <br />
                Leave with the recipe.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-sm font-medium leading-6 text-white/65">
                No account wall. No cloud project required. Just a focused
                workspace for turning inspiration into something you can
                actually repaint.
              </p>
              <Button
                asChild
                size="lg"
                className="mt-8 h-13 rounded-full bg-white px-8 font-black text-[var(--island-ink)] hover:bg-[var(--island-yellow)]"
              >
                <Link href="/studio">
                  Open the free studio <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div
              className="absolute -left-20 -top-24 h-72 w-72 rounded-full border-[45px] border-[var(--island-coral)]/50"
              aria-hidden="true"
            />
            <div
              className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full border-[55px] border-[var(--island-blue)]/30"
              aria-hidden="true"
            />
          </div>
        </div>
      </section>
    </>
  );
}
