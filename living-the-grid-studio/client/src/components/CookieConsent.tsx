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
import { getConsent, setConsent, type ConsentState } from "@/lib/consent";

export function CookieConsent() {
  const [state, setState] = useState<ConsentState | null>(null);

  useEffect(() => {
    setState(getConsent());
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
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3 sm:px-6 sm:pb-6"
    >
      <Card className="w-full max-w-3xl border-foreground/15 bg-background/95 p-4 shadow-xl backdrop-blur sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-sm leading-relaxed text-foreground/85">
            <p className="font-medium">We use cookies to keep this site useful.</p>
            <p className="mt-1 text-foreground/70">
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
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={essentialOnly}
              aria-label="Essential cookies only"
            >
              Essential only
            </Button>
            <Button variant="outline" size="sm" onClick={rejectAll}>
              Reject all
            </Button>
            <Button size="sm" onClick={acceptAll}>
              Accept all
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default CookieConsent;
