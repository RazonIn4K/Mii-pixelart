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
  useStructuredData([
    breadcrumbFor([
      { name: "Home", href: "/" },
      { name: "Cookies", href: "/cookies" },
    ]),
  ]);

  const [reset, setReset] = useState(false);

  return (
    <LegalLayout
      title="Cookie Notice"
      lastUpdated="July 25, 2026"
      intro="This page explains what we store in your browser and why. You can change your mind any time."
    >
      <h2>What we use</h2>
      <h3>Essential</h3>
      <ul>
        <li>
          <code>__Host-tomodachi.oidc</code> — an encrypted, HttpOnly,
          ten-minute Google sign-in transaction containing state, nonce, PKCE,
          and a safe return path.
        </li>
        <li>
          <code>__Host-tomodachi.sid</code> — an opaque, HttpOnly account
          session token. Only its SHA-256 hash is stored server-side; sessions
          expire after 30 days without silent extension.
        </li>
        <li>
          <code>ltg.consent.v1</code> — your cookie preferences. Without this
          entry the banner would appear every visit.
        </li>
      </ul>

      <h3>Local project storage</h3>
      <p>
        IndexedDB keeps local drafts, cloud revision metadata, offline retry
        state, and an OAuth resume marker. This is first-party browser storage,
        is not used for cross-site tracking, and can be removed through your
        browser&apos;s site-data controls. Local drafts are not uploaded until
        you choose Save to account.
      </p>
      <p>
        Local storage also keeps your AI consent choice and saved Studio AI chat
        sessions, scoped to the current browser account. Those sessions may
        contain prompts and model replies. You can delete them in the Studio or
        clear the Site&apos;s browser data; they are not advertising cookies.
      </p>

      <h3>Analytics (opt-in)</h3>
      <p>
        We do not currently load an optional browser analytics script.
        Cloudflare browser analytics/RUM is disabled. If optional analytics is
        introduced later, this notice will name the provider and disclosed data,
        and the provider will load only after you accept analytics in the cookie
        banner. Cloudflare&apos;s hosting/CDN still processes ordinary request
        and network-error metadata as described in the Privacy Policy.
      </p>

      <h3>Marketing (opt-in)</h3>
      <ul>
        <li>
          Google AdSense cookies for ad measurement and frequency capping. Only
          loaded after you accept marketing cookies. AdSense&apos;s own{" "}
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
        essential cookies may break sign-in, account sessions, and authenticated
        AI features. We recommend using the banner controls above instead.
      </p>
    </LegalLayout>
  );
}
