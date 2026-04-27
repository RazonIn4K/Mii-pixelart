/**
 * Home.tsx — Landing page
 *
 * DESIGN: "Paper Studio" — Japanese Stationery Minimalism
 * Off-white paper surface, graphite text, pale blue grid accents,
 * warm red as the sole accent color. The interface recedes so the art speaks.
 */

import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Upload, FileJson, Grid3X3, Palette, Sparkles, Download } from "lucide-react";

const HERO_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/87446053/Wg3eEm5BszEjq4QnLj49VR/hero-graph-paper-C4Z7n83FomAaML8Mv4EUY5.webp";
const CANVAS_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/87446053/Wg3eEm5BszEjq4QnLj49VR/canvas-demo-ibSTXcy8TWc4nv3PR5GSCG.webp";
const PALETTE_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/87446053/Wg3eEm5BszEjq4QnLj49VR/palette-swatches-6suMjKFXCiPMd2P6Khydf7.webp";

const features = [
  {
    icon: Upload,
    title: "Import Anything",
    description:
      "Drop in an image (PNG, JPG, GIF) or a Living The Grid JSON file. The studio converts it to a palette-limited grid instantly.",
  },
  {
    icon: Palette,
    title: "84-Color Game Palette",
    description:
      "Every one of Tomodachi Life's 77 base shades plus 7 saturated extras, labeled by row and column for exact in-game matching.",
  },
  {
    icon: Grid3X3,
    title: "Paint-by-Numbers Guide",
    description:
      "Each cell gets a number. Hover any swatch to highlight every square that uses it. Copy the design square by square.",
  },
  {
    icon: Sparkles,
    title: "One-Click Optimizer",
    description:
      "Merge similar colors, remove tiny islands, clean up lone pixels, and limit the palette — all deterministic, all reversible.",
  },
  {
    icon: FileJson,
    title: "JSON Round-Trip",
    description:
      "Import and export the full grid document as JSON. Every project is reproducible and shareable.",
  },
  {
    icon: Download,
    title: "Reference Pack Export",
    description:
      "Download a complete reference pack: the pixel guide image, the palette sheet, and the project JSON — everything needed to repaint.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="red-dot" />
            <span className="font-medium text-sm tracking-wide">
              Living The Grid Studio
            </span>
          </div>
          <Link href="/studio">
            <Button size="sm" className="text-xs tracking-wide">
              Open Studio
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-14">
        <div className="relative overflow-hidden">
          <div className="graph-paper-fine">
            <div className="container py-20 lg:py-28">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div className="space-y-6">
                  <p className="section-header">Tomodachi Life Pixel Art Tool</p>
                  <h1 className="text-3xl lg:text-4xl font-semibold leading-tight tracking-tight text-foreground">
                    Make pixel art
                    <br />
                    <span style={{ color: "oklch(0.58 0.2 25)" }}>
                      actually repaintable
                    </span>
                    <br />
                    by hand.
                  </h1>
                  <p className="text-base text-muted-foreground leading-relaxed max-w-md">
                    A browser-first repaint studio that converts images into
                    palette-limited grids, merges colors, cleans up noise, and
                    exports step-by-step reference packs for Tomodachi Life.
                  </p>
                  <div className="flex items-center gap-3 pt-2">
                    <Link href="/studio">
                      <Button size="lg" className="tracking-wide">
                        Open Studio
                      </Button>
                    </Link>
                    <a
                      href="https://github.com/RazonIn4K/Mii-pixelart"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="lg" className="tracking-wide">
                        View on GitHub
                      </Button>
                    </a>
                  </div>
                </div>
                <div className="relative">
                  <div className="rounded-sm overflow-hidden shadow-sm border border-border">
                    <img
                      src={HERO_IMG}
                      alt="Pixel art on graph paper with colored pencils"
                      className="w-full h-auto"
                      loading="eager"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="py-20 border-t border-border">
        <div className="container">
          <div className="max-w-2xl mb-14">
            <p className="section-header mb-3">How It Works</p>
            <h2 className="text-2xl font-semibold tracking-tight mb-4">
              From image to repaint guide in four steps
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              The studio handles the tedious conversion work so you can focus on
              the creative part — actually painting your design in the Palette House.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: "01", label: "Import", desc: "Upload an image or drop a JSON file" },
              { step: "02", label: "Convert", desc: "Auto-map to the 84-color game palette" },
              { step: "03", label: "Optimize", desc: "Merge colors, remove noise, simplify" },
              { step: "04", label: "Export", desc: "Download your reference pack" },
            ].map((item) => (
              <div
                key={item.step}
                className="p-5 rounded-sm border border-border bg-card"
              >
                <span
                  className="font-mono text-xs font-medium"
                  style={{ color: "oklch(0.58 0.2 25)" }}
                >
                  {item.step}
                </span>
                <h3 className="text-sm font-semibold mt-2 mb-1">{item.label}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 border-t border-border bg-card">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <p className="section-header mb-3">Features</p>
              <h2 className="text-2xl font-semibold tracking-tight mb-8">
                Built for hand-painting precision
              </h2>
              <div className="space-y-6">
                {features.map((f) => (
                  <div key={f.title} className="flex gap-4">
                    <div
                      className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: "oklch(0.95 0.02 25)" }}
                    >
                      <f.icon
                        className="w-4 h-4"
                        style={{ color: "oklch(0.58 0.2 25)" }}
                      />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-1">{f.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {f.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-6">
              <div className="rounded-sm overflow-hidden border border-border shadow-sm">
                <img
                  src={CANVAS_IMG}
                  alt="Pixel art mushroom on graph paper"
                  className="w-full h-auto"
                  loading="lazy"
                />
              </div>
              <div className="rounded-sm overflow-hidden border border-border shadow-sm">
                <img
                  src={PALETTE_IMG}
                  alt="Game color palette swatches"
                  className="w-full h-auto"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Roadmap Section */}
      <section className="py-20 border-t border-border">
        <div className="container">
          <div className="max-w-2xl mx-auto">
            <p className="section-header mb-3">Roadmap</p>
            <h2 className="text-2xl font-semibold tracking-tight mb-8">
              What comes next
            </h2>
            <div className="space-y-4">
              {[
                { phase: "0", title: "JSON Fixture Inspection", status: "done", desc: "Real LTG v2 format confirmed. Adapter handles indexed-palette exports with RGB/H/S/B press metadata." },
                { phase: "1", title: "JSON Round-Trip", status: "done", desc: "Import JSON → normalize to GridDocument → render canvas → export JSON. Complete." },
                { phase: "2", title: "Palette Panel", status: "done", desc: "Usage counts, color locking, manual merges, and full 84-color game reference grid." },
                { phase: "3", title: "One-Click Optimizer", status: "done", desc: "Deterministic color merging, island removal, single-cell cleanup, and palette limiting." },
                { phase: "4", title: "Image Upload (remaining)", status: "current", desc: "Crop tool, brightness/contrast pre-processing, and preview before committing import." },
                { phase: "5", title: "Reference Pack Export (remaining)", status: "next", desc: "Palette sheet image, painting order suggestion, and ZIP bundle download." },
                { phase: "6", title: "AI Suggestions", status: "future", desc: "AI as a suggestion layer only — never a hidden automatic editor." },
              ].map((item) => (
                <div
                  key={item.phase}
                  className="flex gap-4 p-4 rounded-sm border border-border bg-card"
                >
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <span className="font-mono text-xs text-muted-foreground">
                      P{item.phase}
                    </span>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        item.status === "done"
                          ? "bg-green-500"
                          : item.status === "current"
                            ? "bg-primary"
                            : item.status === "next"
                              ? "bg-primary/50"
                              : "bg-border"
                      }`}
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="red-dot-sm" />
            <span className="text-xs text-muted-foreground">
              Living The Grid Studio
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Not affiliated with Nintendo or Tomodachi Life.
          </p>
        </div>
      </footer>
    </div>
  );
}
