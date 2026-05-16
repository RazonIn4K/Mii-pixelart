/**
 * Bottom-of-page consent banner. Renders only while the visitor has not yet
 * made a choice. Choices are stored in `localStorage` via `lib/consent`.
 *
 * Defaults are conservative: nothing tracks until the visitor opts in. We
 * intentionally avoid pre-checking analytics so EU + California visitors stay
 * compliant out of the box.
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  STORAGE_KEY,
  getConsent,
  onConsentChange,
  setConsent,
  type ConsentState,
} from "@/lib/consent";

export function CookieConsent() {
  const [state, setState] = useState<ConsentState | null>(null);

  useEffect(() => {
    const sync = () => setState(getConsent());

    sync();
    const unsubscribe = onConsentChange(sync);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      sync();
    };

    window.addEventListener("storage", onStorage);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (!state || state.decision !== "unset") {
    return null;
  }

  function acceptAll() {
    const next = setConsent({
      marketing: true,
      analytics: true,
      decision: "accepted",
    });
    setState(next);
  }

  function rejectAll() {
    const next = setConsent({
      marketing: false,
      analytics: false,
      decision: "rejected",
    });
    setState(next);
  }

  function essentialOnly() {
    const next = setConsent({
      marketing: false,
      analytics: false,
      decision: "rejected",
    });
    setState(next);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      // Pinned to bottom across all viewports. Edge-to-edge gutter on mobile,
      // a small breathing margin on sm+.
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 pt-2 sm:px-4 sm:pt-4"
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0.5rem))",
      }}
    >
      <Card
        className={[
          // Capped so the card doesn't span an entire 1440px desktop.
          "w-full max-w-2xl lg:max-w-3xl",
          "border-foreground/15 bg-background/95 shadow-xl backdrop-blur",
          "p-3 sm:p-4 md:p-5",
        ].join(" ")}
      >
        {/* Column on mobile / sm (text on top, buttons full-width below),
            row on md+ (text left, buttons right). Tablet portrait (768px+)
            is the right break — three buttons + a paragraph don't fit on sm. */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="text-sm leading-relaxed text-foreground/85">
            <p className="font-medium">We use cookies to keep this site useful.</p>
            <p className="mt-1 text-xs sm:text-sm text-foreground/70">
              Essential cookies keep the studio working. We only load ads,
              affiliate tracking, and analytics if you opt in. See our{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy Policy
              </Link>
              ,{" "}
              <Link href="/cookies" className="underline underline-offset-2">
                Cookie Notice
              </Link>
              , and{" "}
              <Link
                href="/affiliate-disclosure"
                className="underline underline-offset-2"
              >
                Affiliate Disclosure
              </Link>
              .
            </p>
          </div>
          {/* Mobile: 3 equal-width buttons in a grid row so they never wrap
              awkwardly. md+: shrink-to-fit row pinned next to the text. */}
          <div className="grid grid-cols-3 gap-2 md:flex md:shrink-0 md:flex-row md:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={essentialOnly}
              aria-label="Essential cookies only"
              className="w-full whitespace-nowrap md:w-auto"
            >
              Essential only
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={rejectAll}
              className="w-full whitespace-nowrap md:w-auto"
            >
              Reject all
            </Button>
            <Button
              size="sm"
              onClick={acceptAll}
              className="w-full whitespace-nowrap md:w-auto"
            >
              Accept all
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default CookieConsent;
