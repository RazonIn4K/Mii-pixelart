/**
 * /unlock — Paid recovery content.
 *
 * Three states:
 *   1. Browsing:     Shows the product list with "Buy" buttons that POST to
 *                    /api/stripe/checkout and redirect to Stripe.
 *   2. Returning:    URL has ?session_id=…; we verify with /api/stripe/session
 *                    and reveal gated content if payment_status === "paid".
 *   3. Canceled:     URL has ?canceled=1; we surface a friendly retry CTA.
 *
 * The gated content is intentionally inlined here so the page works without a
 * CMS. As the catalog grows, hoist the unlocked content into per-product
 * files and look them up by `product.id`.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

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
  product: { id: string; name: string; priceLabel: string } | null;
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

export default function Unlock() {
  useDocumentTitle("Unlock", "Paid recovery checklist ($9) and 30-minute one-on-one consult ($49) for the Tomodachishare breach.");

  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");

  const sessionId = useQueryParam("session_id");
  const canceled = useQueryParam("canceled");
  const productQuery = useQueryParam("product");

  const [verification, setVerification] = useState<SessionStatus | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Unlock only sells gated recovery + consult products.
    // Tip-jar items live on /support so they don't muddy the conversion path.
    fetch("/api/stripe/products")
      .then((response) => response.json())
      .then((payload: { products?: PublicProduct[] }) => {
        if (cancelled) return;
        const visible = (payload.products ?? []).filter(
          (product) => product.category !== "support",
        );
        setProducts(visible);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load product list.",
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
              : "Could not verify your purchase.",
        });
      })
      .finally(() => {
        if (!cancelled) setVerifying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const unlockedProductId = useMemo(() => {
    if (verification?.paid && verification.product) {
      return verification.product.id;
    }
    return null;
  }, [verification]);

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
            Paid recovery content
          </span>
        </div>
      </header>

      <main className="container max-w-5xl py-10 sm:py-12 space-y-8">
        <section>
          <h1 className="text-3xl font-semibold">Unlock</h1>
          <p className="mt-2 text-muted-foreground">
            Free guidance stays free. These are deeper deliverables for people
            who want a written plan or a real human to walk it through with
            them.
          </p>
        </section>

        {canceled ? (
          <Card className="border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            Checkout was canceled. No charge was made. You can pick a different
            option below or come back later.
          </Card>
        ) : null}

        {sessionId ? (
          <Card className="p-5">
            <h2 className="text-lg font-semibold">Your purchase</h2>
            {verifying ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Verifying your payment with Stripe…
              </p>
            ) : verification?.error ? (
              <p className="mt-2 text-sm text-destructive">
                {verification.error}
              </p>
            ) : verification?.paid && verification.product ? (
              <div className="mt-2 space-y-3 text-sm">
                <p>
                  <strong>{verification.product.name}</strong> unlocked. Receipt
                  sent to{" "}
                  <code>{verification.email ?? "the email you entered"}</code>.
                </p>
                <p className="text-muted-foreground">
                  Bookmark this page; you can return here any time using the
                  same Stripe receipt link.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                We could not confirm payment for this session. If you completed
                checkout, refresh in a minute or email{" "}
                <a href="mailto:help@tomodachi.pw">help@tomodachi.pw</a>.
              </p>
            )}
          </Card>
        ) : null}

        {unlockedProductId === "breach-recovery-checklist" ? (
          <Card className="p-5 space-y-3">
            <h2 className="text-lg font-semibold">
              Breach Recovery Checklist (unlocked)
            </h2>
            <ol className="list-decimal pl-5 text-sm space-y-2">
              <li>
                Lock down email first. Rotate the password, enable a hardware
                key, audit forwarding rules, and revoke active sessions.
              </li>
              <li>
                Inventory every account that reused the breached password. Use
                your password manager export plus the Have I Been Pwned domain
                check.
              </li>
              <li>
                Rotate passwords in order of blast radius: financial &gt; cloud
                &gt; identity &gt; social &gt; everything else.
              </li>
              <li>
                Enable 2FA everywhere it is supported. Prefer hardware keys or
                TOTP over SMS.
              </li>
              <li>
                Revoke active sessions and refresh tokens. Most services have
                a &quot;sign out everywhere&quot; control buried in security
                settings.
              </li>
              <li>
                Set up free credit monitoring (US) or your country&apos;s
                equivalent.
              </li>
              <li>
                Email service-account holders that share infrastructure with
                you so they can rotate proactively.
              </li>
              <li>
                Document everything. Even a private text file with timestamps
                is valuable if you later need to file a police report or
                cyber-insurance claim.
              </li>
              <li>
                Schedule a 7-day, 14-day, and 30-day review. Most reuse
                surfaces in week two.
              </li>
              <li>
                Subscribe to breach notifications for the email addresses you
                actually use.
              </li>
              <li>
                Move from passwords to passkeys on services that support it.
              </li>
              <li>
                Run the AI assistant on the homepage with your specific
                situation; it will tailor the rest of the plan.
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Download links and Markdown export coming soon to this page.
            </p>
          </Card>
        ) : null}

        {unlockedProductId === "consult-30" ? (
          <Card className="p-5 space-y-3">
            <h2 className="text-lg font-semibold">30-min Recovery Consult</h2>
            <p className="text-sm">
              Thank you. We will email you a Google Meet link and a short
              intake form within one business day at{" "}
              <code>{verification?.email ?? "the email you entered"}</code>.
            </p>
            <p className="text-sm text-muted-foreground">
              If you do not hear back within 24 hours, email{" "}
              <a href="mailto:help@tomodachi.pw">help@tomodachi.pw</a> and we
              will sort it.
            </p>
          </Card>
        ) : null}

        {!unlockedProductId ? (
          <section className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="unlock-email" className="text-xs">
                Email for receipts (optional, pre-fills Stripe)
              </Label>
              <Input
                id="unlock-email"
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

            <div className="grid gap-4 sm:grid-cols-2">
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
                  {product.perks.length > 0 ? (
                    <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                      {product.perks.map((perk) => (
                        <li key={perk}>{perk}</li>
                      ))}
                    </ul>
                  ) : null}
                  {product.caveat ? (
                    <p className="text-[11px] text-muted-foreground italic">
                      {product.caveat}
                    </p>
                  ) : null}
                  <Button
                    onClick={() => startCheckout(product.id)}
                    disabled={checkoutBusy === product.id}
                    className="w-full"
                  >
                    {checkoutBusy === product.id
                      ? "Opening Stripe…"
                      : `Buy for ${product.priceLabel}`}
                  </Button>
                </Card>
              ))}
            </div>

            {productQuery ? (
              <p className="text-xs text-muted-foreground">
                Looking for &quot;{productQuery}&quot;? Pick it above and we will
                hand you off to Stripe.
              </p>
            ) : null}
          </section>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Payments are processed by Stripe. We do not see your card details.
          See our{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
