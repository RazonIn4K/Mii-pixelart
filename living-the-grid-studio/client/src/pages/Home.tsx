/**
 * Home.tsx — Landing page
 *
 * DESIGN: "Paper Studio" — Japanese Stationery Minimalism
 * Off-white paper surface, graphite text, pale blue grid accents,
 * warm red as the sole accent color. The interface recedes so the art speaks.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import {
  OPENROUTER_MODEL_PRESETS,
  type AiModelPreset,
} from "@shared/ai";
import {
  getConsent,
  onConsentChange,
  type ConsentState,
} from "@/lib/consent";
import {
  AlertTriangle,
  BotMessageSquare,
  CheckCircle2,
  Search,
  ShieldCheck,
  Upload,
  FileJson,
  Grid3X3,
  Palette,
  Sparkles,
  Download,
} from "lucide-react";

const HERO_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/87446053/Wg3eEm5BszEjq4QnLj49VR/hero-graph-paper-C4Z7n83FomAaML8Mv4EUY5.webp";
const CANVAS_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/87446053/Wg3eEm5BszEjq4QnLj49VR/canvas-demo-ibSTXcy8TWc4nv3PR5GSCG.webp";
const PALETTE_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/87446053/Wg3eEm5BszEjq4QnLj49VR/palette-swatches-6suMjKFXCiPMd2P6Khydf7.webp";
const BREACH_NOTICE_URL = "https://tomodachishare.com/breach-notice";
const HIBP_PASSWORD_API = "https://api.pwnedpasswords.com/range/";

const features = [
  {
    icon: Upload,
    title: "Import Characters, Logos, Memes",
    description:
      "Drop in a character reference, face photo, logo, brand-style mark, meme, or Living The Grid JSON file. The studio turns it into a paintable grid.",
  },
  {
    icon: Sparkles,
    title: "Character Presets",
    description:
      "Mii Mask, Character 64, Face 96, Character 128, Sprite 32, Logo 64, Sticker 64, Icon 16, Full 64, and Pixel 256 presets tune framing, sampling, color count, contrast, and background cleanup for different repaint goals.",
  },
  {
    icon: Grid3X3,
    title: "Create and Touch Up",
    description:
      "Start from original face, mascot, space-crew, horror, schoolhouse, creature, hero, robot, badge, icon, kart, snack, and brand-mark templates or a blank canvas, then paint, erase, pick colors, and fill regions directly on the grid.",
  },
  {
    icon: Palette,
    title: "84-Color Game Palette",
    description:
      "Every base shade and saturated extra in the Tomodachi Life: Living the Dream palette, labeled by row and column for exact in-game matching.",
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

const domainMonetizationUseCases = [
  {
    domain: "tomodachi.pw",
    role: "Canonical Public Site",
    note: "Use this as the primary landing and monetization surface for SEO, ads, email capture, guides, and paid packs.",
    monetization: [
      "Offer a free trust-first /help route plus security guides and recovery paths.",
      "Enable display ads on secondary creator/helpful pages after trust signals are in place.",
      "Layer email capture around guides, packs, and template launches.",
      "Run privacy/cyber affiliate placements aligned to user pain.",
      "Launch $5-$9 packs and $19-$49 workflow bundles.",
    ],
  },
  {
    domain: "tomodachi.brave",
    role: "Brave-native creator promo",
    note: "Use as a short memorable referral domain in Brave/Web3 communities that points to the canonical experience on tomodachi.pw.",
    monetization: [
      "Point users to creator workflow pages on the canonical site.",
      "Promote launch posts, studio demos, and social proof.",
      "Use community messaging and vanity links to improve discovery.",
    ],
  },
];

type PasswordBreachStatus = "idle" | "checking" | "safe" | "found" | "error";

type PasswordBreachResult = {
  status: PasswordBreachStatus;
  message: string;
  count?: number;
};
// ModelPresetWithAvailability removed — the `available?: boolean` field now
// lives on the canonical AiModelPreset type in shared/ai.ts so both client +
// server agree on the wire shape and type-drift errors surface at compile time.

// `adsbygoogle` is the global command queue Google's AdSense script consumes.
// You push command objects onto it; the script eventually replaces it with a
// real implementation. Typing it as a plain array of command objects is
// closer to reality than typing each entry as something that itself has a
// `push` method.
type WindowWithAds = Window & {
  adsbygoogle?: Array<Record<string, unknown>>;
};

const defaultErrorMessage = "Something went wrong while running this check.";
// Source the default model from the shared preset list so we can never ship a
// dead OpenRouter ID. If the preset list changes, this follows automatically.
const BREACH_RECOVERY_DEFAULT_MODEL =
  OPENROUTER_MODEL_PRESETS[0]?.id ?? "deepseek/deepseek-v4-flash:free";

// All current presets are free ($0 prompt + $0 completion), so the previous
// "sort by total cost" logic was a no-op that always returned index 0.
// Reduced to: first preset that the server hasn't marked unavailable.
// Treats `available === undefined` as "unknown, try it" — only an explicit
// `available === false` filters a preset out.
function pickFirstAvailableModel(presets: AiModelPreset[]): string {
  const candidate = presets.find((preset) => preset.available !== false);
  return (
    candidate?.id ??
    presets[0]?.id ??
    OPENROUTER_MODEL_PRESETS[0]?.id ??
    "deepseek/deepseek-v4-flash:free"
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function sha1Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", encoded);
  return bytesToHex(new Uint8Array(hash));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function Home() {
  const [incidentPrompt, setIncidentPrompt] = useState("");
  const [incidentPlan, setIncidentPlan] = useState("");
  const [incidentModel, setIncidentModel] = useState(BREACH_RECOVERY_DEFAULT_MODEL);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordCheck, setPasswordCheck] = useState<PasswordBreachResult>({
    status: "idle",
    message: "",
  });
  const adsPublisherId = import.meta.env.VITE_ADSENSE_PUBLISHER_ID;
  const adsSlotId = import.meta.env.VITE_ADSENSE_HOMEPAGE_SLOT_ID;
  const adsConfigured = Boolean(adsPublisherId && adsSlotId);
  useEffect(() => {
    let canceled = false;
    const loadCheapestModel = async () => {
      try {
        const response = await fetch("/api/ai/models");
        if (!response.ok) return;
        const data = (await response.json()) as {
          presets?: AiModelPreset[];
        };
        if (canceled || !Array.isArray(data.presets) || data.presets.length === 0)
          return;
        setIncidentModel(pickFirstAvailableModel(data.presets));
      } catch {
        /* Keep default model if the model catalog endpoint is unavailable. */
      }
    };

    loadCheapestModel();
    return () => {
      canceled = true;
    };
  }, []);

  // Track consent so we only inject ad scripts after the visitor opts in.
  const [consent, setConsentState] = useState<ConsentState | null>(null);
  useEffect(() => {
    setConsentState(getConsent());
    return onConsentChange(setConsentState);
  }, []);
  const marketingOk = Boolean(consent?.marketing);
  const adsEnabled = adsConfigured && marketingOk;

  useEffect(() => {
    if (!adsEnabled) return;
    const scriptId = "ltg-adsense-js";
    if (document.getElementById(scriptId)) return;

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
      String(adsPublisherId).trim(),
    )}`;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [adsEnabled, adsPublisherId]);

  useEffect(() => {
    if (!adsEnabled) return;

    const timeoutId = window.setTimeout(() => {
      try {
        const adWindow = window as WindowWithAds;
        adWindow.adsbygoogle ??= [];
        adWindow.adsbygoogle.push({});
      } catch (error) {
        console.error("Failed to initialize adsbygoogle:", error);
      }
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [adsEnabled]);

  const checkPasswordForBreaches = async () => {
    if (!passwordInput) {
      setPasswordCheck({
        status: "error",
        message: "Type a password first.",
      });
      return;
    }

    setPasswordCheck({
      status: "checking",
      message: "Checking hash ranges against open breach indexes.",
    });

    try {
      const hash = await sha1Hex(passwordInput);
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);

      const response = await fetch(`${HIBP_PASSWORD_API}${prefix}`, {
        headers: {
          "Add-Padding": "true",
          Accept: "text/plain",
        },
      });
      if (!response.ok) {
        throw new Error(`Breach check service returned ${response.status}.`);
      }

      const payload = await response.text();
      const found = payload
        .split("\n")
        .map((row) => row.trim())
        .find((row) => row.startsWith(`${suffix}:`));

      if (!found) {
        setPasswordCheck({
          status: "safe",
          message:
            "No matches found in available breach lists. Keep using unique long passphrases.",
        });
        return;
      }

      const [, countText] = found.split(":");
      const count = Number.parseInt(countText ?? "0", 10);
      setPasswordCheck({
        status: "found",
        count,
        message:
          count > 0
            ? `This password appears in ${formatNumber(count)} public breach record${count === 1 ? "" : "s"} — rotate it immediately and clear any reuse across accounts.`
            : `Exposure lookup returned an invalid count. Try again with a different value.`,
      });
    } catch (error) {
      setPasswordCheck({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : defaultErrorMessage,
      });
    }
  };

  const createBreachRecoveryPlan = async () => {
    const trimmedPrompt = incidentPrompt.trim();
    if (!trimmedPrompt) return;

    setIncidentError(null);
    setIncidentLoading(true);
    setIncidentPlan("");
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentDocument: null,
          currentGridImage: null,
          messages: [
            {
              role: "user",
              content: `You are a plain-language security assistant. Given this situation: ${trimmedPrompt}. Respond with:
1) Next 24-hour actions,
2) Browser-safe account cleanup checklist,
3) Password reset playbook,
4) Suggested short user message, and
5) A concise list of what not to do.
Keep it practical and concise.`,
            },
          ],
          model: incidentModel,
          requestSketch: false,
          sessionId: "breach-recovery-session",
        }),
      });

      const data = (await response.json()) as {
        configured?: boolean;
        model?: string;
        reply?: string;
        warning?: string;
      };
      if (!response.ok || !data.reply) {
        throw new Error(
          data.warning ??
            data.reply ??
            `AI assistant returned ${response.status}.`,
        );
      }
      setIncidentPlan(data.reply);
    } catch (error) {
      setIncidentError(
        error instanceof Error ? error.message : defaultErrorMessage,
      );
    } finally {
      setIncidentLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="red-dot" />
            <span className="font-medium text-sm tracking-wide">
              Tomodachi
            </span>
          </div>
          <Link href="/studio">
            <Button size="sm" className="text-xs tracking-wide">
              Open Studio
            </Button>
          </Link>
        </div>
      </nav>

      <main id="main-content">
      {/* Hero Section */}
      <section className="pt-14">
        <div className="relative overflow-hidden">
          <div className="graph-paper-fine">
            <div className="container py-12 sm:py-16 lg:py-24 xl:py-28">
              <div className="grid gap-8 lg:gap-12 md:grid-cols-2 items-center">
                <div className="space-y-5 sm:space-y-6">
                  <p className="section-header">
                    Mii Face Mask + Pixel Art Tool
                  </p>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-semibold leading-tight tracking-tight text-foreground">
                    Make Mii masks
                    <br />
                    <span style={{ color: "oklch(0.58 0.2 25)" }}>
                      and pixel art
                    </span>
                    <br />
                    repaintable by hand.
                  </h1>
                  <p className="text-base text-muted-foreground leading-relaxed max-w-md">
                    A browser-first repaint studio for Tomodachi Life: Living
                    the Dream Mii face masks, user-supplied character
                    references, brand-style logos, memes, clothing marks, book
                    covers, and other creative pixel builds.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-2">
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
                      <Button
                        variant="outline"
                        size="lg"
                        className="tracking-wide"
                      >
                        View on GitHub
                      </Button>
                    </a>
                  </div>
                </div>
                <div className="relative">
                  <div className="rounded-sm overflow-hidden shadow-sm border border-border">
                    <img
                      src={HERO_IMG}
                      alt="Hand-drawn Mii face on engineering grid paper next to colored pencils, illustrating the studio's paint-by-numbers workflow."
                      className="w-full h-auto"
                      width={1920}
                      height={1072}
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Breach Recovery and Trust Section */}
      <section className="py-12 sm:py-16 lg:py-20 border-t border-border">
        <div className="container">
          <p className="section-header mb-3">
            Tomodachishare Breach Recovery Hub
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
            Help users coming from breach-notice traffic with useful, browser-first
            tools.
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-8">
            If people land here from the{" "}
            <a
              className="underline underline-offset-2"
              href={BREACH_NOTICE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              public notice
            </a>
            , give them immediate value: a leak-aware checklist, password risk
            test, and AI recovery guidance. For a structured written plan or a
            short consult, see{" "}
            <Link href="/unlock" className="underline underline-offset-2">
              paid recovery guides
            </Link>
            .
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <article className="p-5 rounded-sm border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Password breach check</h3>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Browser-only + k-anonymity
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                Paste a password to check if it appears in known breach datasets.
                Your full password never leaves the page; only a SHA-1 prefix is
                sent.
              </p>
              <div className="mt-4 space-y-2">
                <Label htmlFor="password-leak-check" className="text-xs">
                  Password candidate
                </Label>
                <Input
                  id="password-leak-check"
                  type="password"
                  placeholder="Type a sample password (never paste credentials)"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                />
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={checkPasswordForBreaches}
                  disabled={passwordCheck.status === "checking"}
                >
                  <Search className="h-4 w-4 mr-1" />
                  {passwordCheck.status === "checking"
                    ? "Checking..."
                    : "Check password exposure"}
                </Button>
                <p
                  className={`text-xs leading-relaxed ${
                    passwordCheck.status === "found"
                      ? "text-destructive"
                      : passwordCheck.status === "safe"
                        ? "text-green-700"
                        : "text-muted-foreground"
                  }`}
                >
                  {passwordCheck.message || "Run a check to see results."}
                </p>
              </div>
            </article>

            <article className="p-5 rounded-sm border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  AI recovery assistant
                </h3>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <BotMessageSquare className="h-4 w-4 text-primary" />
                  OpenRouter-backed
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                Paste what happened in plain language. The assistant returns a
                practical sequence you can hand to friends, family, or forum
                users.
              </p>
              <div className="mt-4 space-y-2">
                <Label htmlFor="breach-situation" className="text-xs">
                  Situation details
                </Label>
                <Textarea
                  id="breach-situation"
                  rows={5}
                  placeholder="Example: I saw my email in a leaked list, and I used that password in multiple places."
                  value={incidentPrompt}
                  onChange={(event) => setIncidentPrompt(event.target.value)}
                />
                <Button
                  className="w-full"
                  onClick={createBreachRecoveryPlan}
                  disabled={incidentLoading}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  {incidentLoading
                    ? "Generating plan..."
                    : "Generate 24-hour recovery plan"}
                </Button>
                {(incidentError || incidentPlan) && (
                  <div className="mt-3 p-3 rounded-sm border border-border bg-background text-xs text-muted-foreground whitespace-pre-wrap">
                    {incidentError ?? incidentPlan}
                  </div>
                  )}
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="py-12 sm:py-16 lg:py-20 border-t border-border">
        <div className="container">
          <div className="max-w-2xl mb-14">
            <p className="section-header mb-3">How It Works</p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
              From image to repaint guide in four steps
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              The studio handles the tedious conversion work so you can focus on
              the creative part — actually painting your design in the Palette
              House.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: "01",
                label: "Import",
                desc: "Upload a character, face, logo, meme, or JSON file",
              },
              {
                step: "02",
                label: "Preset",
                desc: "Choose Mii mask, character, sprite, logo, or full-image framing",
              },
              {
                step: "03",
                label: "Optimize",
                desc: "Merge colors, remove noise, simplify",
              },
              {
                step: "04",
                label: "Export",
                desc: "Download your reference pack",
              },
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
                <h3 className="text-sm font-semibold mt-2 mb-1">
                  {item.label}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-12 sm:py-16 lg:py-20 border-t border-border bg-card">
        <div className="container">
          <div className="grid gap-8 md:gap-12 lg:gap-16 lg:grid-cols-2 items-start">
            <div>
              <p className="section-header mb-3">Features</p>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-6 sm:mb-8">
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
                  alt="Hand-painted pixel-art mushroom on graph paper — example output from the studio's color-reduction optimizer."
                  className="w-full h-auto"
                  width={1920}
                  height={1920}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="rounded-sm overflow-hidden border border-border shadow-sm">
                <img
                  src={PALETTE_IMG}
                  alt="Reference swatches of the 84-color Tomodachi Life: Living the Dream palette, labeled by row and column for exact in-game matching."
                  className="w-full h-auto"
                  width={1920}
                  height={1434}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Roadmap Section */}
      <section className="py-12 sm:py-16 lg:py-20 border-t border-border">
        <div className="container">
          <div className="max-w-2xl mx-auto">
            <p className="section-header mb-3">Roadmap</p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-8">
              What comes next
            </h2>
            <div className="space-y-4">
              {[
                {
                  phase: "0",
                  title: "JSON Fixture Inspection",
                  status: "done",
                  desc: "Real LTG v2 format confirmed. Adapter handles indexed-palette exports with RGB/H/S/B press metadata.",
                },
                {
                  phase: "1",
                  title: "JSON Round-Trip",
                  status: "done",
                  desc: "Import JSON → normalize to GridDocument → render canvas → export JSON. Complete.",
                },
                {
                  phase: "2",
                  title: "Palette Panel",
                  status: "done",
                  desc: "Usage counts, color locking, manual merges, and full 84-color game reference grid.",
                },
                {
                  phase: "3",
                  title: "One-Click Optimizer",
                  status: "done",
                  desc: "Deterministic color merging, island removal, single-cell cleanup, and palette limiting.",
                },
                {
                  phase: "4",
                  title: "Image Upload (remaining)",
                  status: "current",
                  desc: "Face-focused framing, cleanup, tone controls, and import preview are in. Remaining: drag crop/pan controls.",
                },
                {
                  phase: "5",
                  title: "Reference Pack Export (remaining)",
                  status: "next",
                  desc: "Palette sheet image, painting order suggestion, and ZIP bundle download.",
                },
                {
                  phase: "6",
                  title: "AI Suggestions",
                  status: "current",
                  desc: "OpenRouter chat, saved local sessions, 25 model presets, visual grid snapshots, and applyable sketch drafts are available; deeper cleanup suggestions are next.",
                },
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

      {/* Monetization Section */}
      <section className="py-12 sm:py-16 lg:py-20 border-t border-border bg-card">
        <div className="container">
          <p className="section-header mb-3">Monetization strategy</p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
            Turn Tomodachi domain traffic into recurring income
          </h2>
          <p className="text-muted-foreground leading-relaxed max-w-3xl mb-8">
            Use the breach moment as a traffic catalyst for a two-domain setup:
            one domain for creative conversion, one for trust and crisis support.
            Keep ad content clearly separated from sensitive security guidance.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            {domainMonetizationUseCases.map((entry) => (
              <article
                key={entry.domain}
                className="rounded-sm border border-border bg-background p-5"
              >
                <h3 className="text-sm font-semibold">{entry.domain}</h3>
                <p className="text-xs text-muted-foreground mt-1">{entry.role}</p>
                <p className="text-xs leading-relaxed mt-4 text-muted-foreground">
                  {entry.note}
                </p>
                <ul className="mt-4 space-y-2">
                  {entry.monetization.map((item) => (
                    <li
                      key={item}
                      className="text-xs flex items-start gap-2 text-muted-foreground"
                    >
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="mt-8 space-y-3">
            {adsEnabled ? (
              <div className="rounded-sm border border-border bg-background p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                  Monetization slot (AdSense)
                </p>
                <ins
                  className="adsbygoogle"
                  style={{ display: "block" }}
                  data-ad-client={adsPublisherId as string}
                  data-ad-slot={adsSlotId as string}
                  data-ad-format="auto"
                  data-full-width-responsive="true"
                />
              </div>
            ) : (
              <div className="rounded-sm border border-dashed border-border bg-background p-4">
                <p className="text-xs text-muted-foreground">
                  {adsConfigured && !marketingOk
                    ? "Ad slot held until the visitor accepts marketing cookies."
                    : (
                      <>
                        Add environment vars{" "}
                        <code>VITE_ADSENSE_PUBLISHER_ID</code> and{" "}
                        <code>VITE_ADSENSE_HOMEPAGE_SLOT_ID</code> to enable ad
                        slots on production.
                      </>
                    )}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  This page may include affiliate links. See our{" "}
                  <Link
                    href="/affiliate-disclosure"
                    className="underline underline-offset-2"
                  >
                    Affiliate Disclosure
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="red-dot-sm" />
            <span className="text-xs text-muted-foreground">
              Tomodachi
            </span>
          </div>
          <nav
            aria-label="Site"
            className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
          >
            <Link href="/guides" className="hover:underline">
              Guides
            </Link>
            <Link href="/faq" className="hover:underline">
              FAQ
            </Link>
            <Link href="/about" className="hover:underline">
              About
            </Link>
            <Link href="/unlock" className="hover:underline">
              Unlock
            </Link>
            <Link href="/support" className="hover:underline">
              Support
            </Link>
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <Link href="/cookies" className="hover:underline">
              Cookies
            </Link>
            <Link href="/affiliate-disclosure" className="hover:underline">
              Affiliate disclosure
            </Link>
          </nav>
          <p className="text-xs text-muted-foreground">
            Unofficial fan tool. No official game or character assets are
            bundled.
          </p>
        </div>
      </footer>
    </div>
  );
}
