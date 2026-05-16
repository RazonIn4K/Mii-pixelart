/**
 * Cookie Notice. Lists what each cookie / storage entry is for and how to
 * disable it. Pairs with `lib/consent.ts` and the cookie consent banner.
 */

import { useState } from "react";
import LegalLayout from "@/components/LegalLayout";
import { Button } from "@/components/ui/button";
import { resetConsent } from "@/lib/consent";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useStructuredData } from "@/hooks/useStructuredData";
import { breadcrumbFor } from "@/lib/breadcrumb";

export default function Cookies() {
  useDocumentTitle("Cookies");
  useStructuredData([breadcrumbFor([{ name: "Home", href: "/" }, { name: "Cookies", href: "/cookies" }])]);

  const [reset, setReset] = useState(false);

  return (
    <LegalLayout
      title="Cookie Notice"
      lastUpdated="May 14, 2026"
      intro="This page explains what we store in your browser and why. You can change your mind any time."
    >
      <h2>What we use</h2>
      <h3>Essential</h3>
      <ul>
        <li>
          <code>ltg.consent.v1</code> — your cookie preferences. Without this
          entry the banner would appear every visit.
        </li>
        <li>
          Server session cookies during a Stripe checkout flow, set by Stripe
          directly. These cookies are required to complete a purchase.
        </li>
      </ul>

      <h3>Analytics (opt-in)</h3>
      <ul>
        <li>
          Aggregate event counts (e.g. &quot;breach-check submitted&quot;,
          &quot;AI plan generated&quot;). No identifiers, no cross-site
          tracking. Only loaded after you accept analytics in the cookie
          banner.
        </li>
      </ul>

      <h3>Marketing (opt-in)</h3>
      <ul>
        <li>
          Google AdSense cookies for ad measurement and frequency capping.
          Only loaded after you accept marketing cookies. AdSense&apos;s own{" "}
          <a href="https://policies.google.com/privacy" rel="noopener">
            privacy policy
          </a>{" "}
          applies to data Google collects.
        </li>
        <li>
          Affiliate tracking cookies set when you click an outbound affiliate
          link, used by the merchant to attribute referrals. Only set if you
          accept marketing cookies and click the affiliate link.
        </li>
      </ul>

      <h2>How to change your mind</h2>
      <p>
        You can revisit your choices at any time. Press the button below to
        clear stored preferences. The cookie banner will then reappear on your
        next page load so you can pick again.
      </p>
      <p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetConsent();
            setReset(true);
          }}
        >
          Reset cookie preferences
        </Button>
      </p>
      {reset ? (
        <p>
          <strong>Preferences cleared.</strong> The cookie banner is ready again
          on this page.
        </p>
      ) : null}

      <h2>Browser-level controls</h2>
      <p>
        Most browsers let you block cookies entirely or per-site. Blocking
        essential cookies may break checkout. We recommend using the banner
        controls above instead.
      </p>
    </LegalLayout>
  );
}
