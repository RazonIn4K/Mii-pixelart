/**
 * /support (alias: /donate) — Tip jar.
 *
 * Three rails:
 *   1. Stripe-managed fixed tips ($5 / $15 / $25) via the existing
 *      /api/stripe/checkout endpoint.
 *   2. Optional Stripe Payment Link for custom amounts. Activated when
 *      `VITE_STRIPE_DONATION_LINK` is set at build time. Use this for "tip
 *      whatever you want" support.
 *   3. Brave Rewards messaging. We don't fetch anything; we just point
 *      verified-Brave-Creator users to the address-bar Rewards icon once the
 *      domain has been verified upstream.
 *
 * Wording is intentionally "support" rather than "donate" because the project
 * is not a registered nonprofit. See docs/guides-and-support-roadmap.md.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useStructuredData } from "@/hooks/useStructuredData";
import { breadcrumbFor } from "@/lib/breadcrumb";

interface PublicProduct {
  id: string;
  name: string;
  description: string;
  priceLabel: string;
  perks: string[];
  caveat: string | null;
  category: "recovery" | "consult" | "support";
}

interface SessionStatus {
  configured: boolean;
  paid: boolean;
  paymentStatus: string;
  email: string | null;
  product: {
    id: string;
    name: string;
    priceLabel: string;
    category: "recovery" | "consult" | "support";
  } | null;
  error?: string;
}

function useQueryParam(name: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setValue(params.get(name));
  }, [name]);
  return value;
}

export default function Support() {
  useDocumentTitle("Support", "Tip jar for the Tomodachi project. Drop $5, $15, or $25 to fund the next free guide.");
  useStructuredData([breadcrumbFor([{ name: "Home", href: "/" }, { name: "Support", href: "/support" }])]);

  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");

  const sessionId = useQueryParam("session_id");
  const thanks = useQueryParam("thanks");
  const canceled = useQueryParam("canceled");

  const [verification, setVerification] = useState<SessionStatus | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Optional custom-amount Stripe Payment Link, configured via env at build time.
  const customAmountLink = import.meta.env.VITE_STRIPE_DONATION_LINK as
    | string
    | undefined;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stripe/products?category=support")
      .then((response) => response.json())
      .then((payload: { products?: PublicProduct[] }) => {
        if (cancelled) return;
        setProducts(payload.products ?? []);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "Could not load tip jar.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setVerifying(true);
    fetch(`/api/stripe/session?session_id=${encodeURIComponent(sessionId)}`)
      .then((response) => response.json())
      .then((payload: SessionStatus) => {
        if (cancelled) return;
        setVerification(payload);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setVerification({
          configured: true,
          paid: false,
          paymentStatus: "error",
          email: null,
          product: null,
          error:
            error instanceof Error
              ? error.message
              : "Could not verify your tip.",
        });
      })
      .finally(() => {
        if (!cancelled) setVerifying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const isPaidTip = useMemo(
    () => verification?.paid && verification.product?.category === "support",
    [verification],
  );

  async function startCheckout(productId: string) {
    setCheckoutBusy(productId);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          customerEmail: emailInput.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Could not start Stripe checkout.");
      }
      window.location.assign(payload.url);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not start Stripe checkout.",
      );
    } finally {
      setCheckoutBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="text-sm font-medium hover:underline">
            ← Tomodachi
          </Link>
          <span className="text-xs text-muted-foreground">
            Support the project
          </span>
        </div>
      </header>

      <main id="main-content" className="container max-w-3xl py-12 space-y-8">
        <section>
          <h1 className="text-3xl font-semibold">Help keep the tools free</h1>
          <p className="mt-2 text-muted-foreground">
            The studio, the AI assistant, the breach recovery guides, and the
            password check are all free to use. Tips help cover hosting, API
            credits, and time to write the next free guide.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            We are not a registered nonprofit. Tips are not tax-deductible. See
            our{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        {canceled ? (
          <Card className="border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            Checkout canceled. No charge was made. Pick a different amount any
            time.
          </Card>
        ) : null}

        {sessionId ? (
          <Card className="p-5">
            <h2 className="text-lg font-semibold">Tip received</h2>
            {verifying ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Verifying with Stripe…
              </p>
            ) : verification?.error ? (
              <p className="mt-2 text-sm text-destructive">
                {verification.error}
              </p>
            ) : isPaidTip && verification?.product ? (
              <div className="mt-2 flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p>
                    Thank you. <strong>{verification.product.name}</strong>{" "}
                    landed. Receipt sent to{" "}
                    <code>
                      {verification.email ?? "the email you entered"}
                    </code>
                    .
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    This funds hosting and the next free guide. If you have a
                    topic request, reply to the receipt email.
                  </p>
                </div>
              </div>
            ) : thanks ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Thanks for the tip. Receipts and confirmation may take a few
                seconds to refresh.
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                We could not confirm your tip for this session. If the charge
                cleared but this page does not refresh, email{" "}
                <a href="mailto:help@tomodachi.pw">help@tomodachi.pw</a>.
              </p>
            )}
          </Card>
        ) : null}

        <section className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="support-email" className="text-xs">
              Email for receipt (optional, pre-fills Stripe)
            </Label>
            <Input
              id="support-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder="you@example.com"
            />
          </div>

          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            {products.map((product) => (
              <Card key={product.id} className="p-5 space-y-3">
                <header>
                  <h3 className="text-base font-semibold">{product.name}</h3>
                  <p className="text-sm font-medium text-foreground/80">
                    {product.priceLabel}
                  </p>
                </header>
                <p className="text-sm text-muted-foreground">
                  {product.description}
                </p>
                <Button
                  onClick={() => startCheckout(product.id)}
                  disabled={checkoutBusy === product.id}
                  className="w-full"
                  variant={product.id === "support-jar-15" ? "default" : "outline"}
                >
                  {checkoutBusy === product.id
                    ? "Opening Stripe…"
                    : `Tip ${product.priceLabel}`}
                </Button>
              </Card>
            ))}
          </div>

          {customAmountLink ? (
            <Card className="p-5 space-y-2">
              <h3 className="text-base font-semibold">Custom amount</h3>
              <p className="text-sm text-muted-foreground">
                Tip whatever you want via Stripe&apos;s hosted checkout. You set
                the amount on the next page.
              </p>
              <Button asChild variant="ghost" size="sm" className="w-full">
                <a
                  href={customAmountLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open custom-amount tip jar →
                </a>
              </Button>
            </Card>
          ) : null}
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Tip in BAT with Brave</h2>
          <p className="text-sm text-muted-foreground">
            If you are using the Brave browser with Brave Rewards enabled and
            this site has been verified as a Brave Creator, you can tip in BAT
            directly from the Brave address bar. Look for the triangular
            Rewards icon near the URL.
          </p>
          <p className="text-xs text-muted-foreground">
            Crypto wallet receive addresses for{" "}
            <code>tomodachi.brave</code> will be published here once they are
            configured in Unstoppable Domains.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">
          Need a recovery checklist or a paid consult instead of a tip? See{" "}
          <Link href="/unlock" className="underline">
            paid recovery guides
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
