/**
 * Affiliate Disclosure. Required for FTC compliance in the United States
 * (16 CFR Part 255) and aligned with EU/UK consumer-protection guidance.
 */

import LegalLayout from "@/components/LegalLayout";

export default function Disclosure() {
  return (
    <LegalLayout
      title="Affiliate Disclosure"
      lastUpdated="May 14, 2026"
      intro="We sometimes earn a commission when you buy a recommended product through a link on this site. Here is exactly how that works."
    >
      <h2>Plain-language summary</h2>
      <p>
        Some outbound links on Living The Grid Studio are affiliate links.
        When you click one and make a purchase, the merchant may pay us a
        small commission at no extra cost to you. This helps fund the free
        tools on the Site.
      </p>

      <h2>What we recommend</h2>
      <p>We only recommend products and services that we have:</p>
      <ul>
        <li>used ourselves, or</li>
        <li>
          verified meet a published bar (for example, password managers must
          support open standards, allow export, and have a public security
          audit).
        </li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>
          We do not accept payment to soften critical reviews or hide problems
          with a recommended product.
        </li>
        <li>
          We do not bury affiliate links in the breach-recovery flow when free
          alternatives exist. We point to free tools first.
        </li>
        <li>
          We do not let advertisers influence the breach-check tool, the AI
          assistant, or our incident-response guidance.
        </li>
      </ul>

      <h2>How to spot an affiliate link</h2>
      <p>
        Sections that contain affiliate links carry a label like &quot;This
        section may include affiliate links&quot;. The cookie banner also lets
        you opt out of affiliate tracking cookies entirely; see the{" "}
        <a href="/cookies">Cookie Notice</a> for details.
      </p>

      <h2>FTC compliance</h2>
      <p>
        This disclosure is provided in compliance with the U.S. Federal Trade
        Commission&apos;s 16 CFR Part 255 endorsement guides. If you have
        questions about a specific recommendation or believe a piece of
        content does not comply with these guides, email{" "}
        <a href="mailto:legal@tomodachi.pw">legal@tomodachi.pw</a>.
      </p>
    </LegalLayout>
  );
}
