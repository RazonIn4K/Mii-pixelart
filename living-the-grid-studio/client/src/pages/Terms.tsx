/**
 * Terms of Service.
 *
 * Template language. Substitute jurisdiction and operator entity before going
 * live. NOT legal advice.
 */

import LegalLayout from "@/components/LegalLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useStructuredData } from "@/hooks/useStructuredData";
import { breadcrumbFor } from "@/lib/breadcrumb";

export default function Terms() {
  useDocumentTitle("Terms");
  useStructuredData([
    breadcrumbFor([
      { name: "Home", href: "/" },
      { name: "Terms", href: "/terms" },
    ]),
  ]);

  return (
    <LegalLayout
      title="Terms of Service"
      lastUpdated="July 16, 2026"
      intro="These Terms govern your use of Tomodachi. By using the Site you agree to them."
    >
      <h2>1. The service</h2>
      <p>
        Tomodachi is a browser-based Mii pixel-art studio paired with
        breach-recovery tools and guides. The Studio, AI assistant, password
        breach check, and current AI Action Plan beta are free. We do not accept
        payments, tips, donations, or consultation bookings through the Site.
      </p>

      <h2>2. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          Use the AI assistant to generate sexual content involving minors,
          violent threats, or other content that violates applicable law.
        </li>
        <li>
          Attempt to bypass rate limits, access controls, or interfere with the
          Site&apos;s normal operation.
        </li>
        <li>
          Submit information about people other than yourself to the
          breach-check tool without their permission.
        </li>
        <li>
          Use the Site to misrepresent yourself or impersonate someone else.
        </li>
      </ul>

      <h2>3. No professional advice</h2>
      <p>
        The breach recovery guidance and AI assistant output is informational
        only. It is not legal, security, medical, or financial advice. For an
        incident affecting your business or personal safety, consult a qualified
        professional.
      </p>

      <h2>4. AI output</h2>
      <p>
        AI-generated text and sketches are produced by third-party language
        models. They may be incorrect, biased, or out of date. You are
        responsible for reviewing AI output before relying on it. We do not
        claim ownership over the AI output you generate, but you grant us a
        non-exclusive license to operate, debug, and improve the Site using
        de-identified prompts and outputs.
      </p>

      <h2>5. Payments</h2>
      <p>
        Tomodachi currently offers no paid service and has no checkout. A
        possible one-time expanded $5 creator plan is only product direction,
        not an offer for sale. Before any paid version launches, we will publish
        its scope, pricing, fulfillment, cancellation, refund, and data-handling
        terms and test them end to end.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        The Site, including code, design, and original written content, is owned
        by Tomodachi and protected by intellectual-property laws. The Tomodachi
        Life palette and references are used under fair use for an unofficial
        fan tool. We do not bundle official game assets.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        The Site is provided &quot;as is&quot; without warranties of any kind,
        either express or implied. We do not warrant that the Site will be
        uninterrupted, error-free, or secure.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Tomodachi is not liable for
        indirect, incidental, special, consequential, or punitive damages, or
        any loss of data or profits, arising from your use of the Site. To the
        extent a monetary cap is permitted, our total liability for any claim
        related to the free Site will not exceed USD 50.
      </p>

      <h2>9. Termination</h2>
      <p>
        We may suspend or terminate access to the Site for users who violate
        these Terms or whose use poses a risk to other users.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of Illinois and the
        United States, without regard to conflict-of-law rules, except where
        mandatory consumer-protection law requires otherwise.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these Terms occasionally. Material changes will be
        announced on the Site at least 30 days before they take effect.
      </p>

      <h2>12. Contact</h2>
      <p>
        Operator: David Ortiz. Questions may be sent to{" "}
        <a href="mailto:legal@tomodachi.pw">legal@tomodachi.pw</a> or by mail to
        122 W Taylor St, DeKalb, Illinois, United States.
      </p>
    </LegalLayout>
  );
}
