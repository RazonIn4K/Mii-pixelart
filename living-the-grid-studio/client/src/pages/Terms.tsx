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
  useStructuredData([breadcrumbFor([{ name: "Home", href: "/" }, { name: "Terms", href: "/terms" }])]);

  return (
    <LegalLayout
      title="Terms of Service"
      lastUpdated="July 12, 2026"
      intro="These Terms govern your use of Tomodachi. By using the Site you agree to them."
    >
      <h2>1. The service</h2>
      <p>
        Tomodachi is a browser-based Mii pixel-art studio paired with
        breach-recovery tools and guides. We provide free tools (the studio,
        the AI assistant, the password breach-check) and may also sell paid
        digital products and consult bookings through the Site.
      </p>

      <h2>2. Acceptable use</h2>
      <p>You must be at least 13 years old to create an account or use community features.</p>
      <p>You agree not to:</p>
      <ul>
        <li>
          Use the AI assistant to generate sexual content involving minors,
          violent threats, or other content that violates applicable law.
        </li>
        <li>
          Attempt to bypass rate limits, scrape paid content, or interfere with
          the Site&apos;s normal operation.
        </li>
        <li>
          Submit information about people other than yourself to the
          breach-check tool without their permission.
        </li>
        <li>
          Use the Site to misrepresent yourself or impersonate someone else.
        </li>
      </ul>

      <h2>3. Accounts, projects, and publishing</h2>
      <p>
        Editing and export remain available without an account. Signing in
        does not upload or publish your local work. The first cloud save is an
        explicit private action, and publishing requires a separate review of
        the title, description, tags, visibility, comments, and download
        permission. You may separately attach up to four showcase images to a
        cloud creation; doing so is an explicit upload and is never inferred
        from a local Studio import. Unlisted links are not secret access
        controls.
      </p>

      <h2>4. Community content and moderation</h2>
      <p>
        You keep ownership of content you create. You grant us a limited,
        non-exclusive license to store, transform into previews, display, and
        distribute project content and selected showcase images only as needed
        to operate the visibility and sharing choices you make. You represent
        that you have permission to share every person and work depicted. We
        may hide content, lock comments, or suspend
        accounts to enforce these Terms and the Community Guidelines. Reports
        and copyright notices must be made in good faith.
      </p>

      <h2>5. No professional advice</h2>
      <p>
        The breach recovery guidance and AI assistant output is informational
        only. It is not legal, security, medical, or financial advice. For an
        incident affecting your business or personal safety, consult a
        qualified professional.
      </p>

      <h2>6. AI output</h2>
      <p>
        AI-generated text and sketches are produced by third-party language
        models. They may be incorrect, biased, or out of date. You are
        responsible for reviewing AI output before relying on it. Prompts and
        related grid JSON transit OpenRouter and the selected model provider;
        review their applicable terms and privacy practices before submitting
        sensitive material. We do not claim ownership over the AI output you
        generate.
      </p>

      <h2>7. Paid services</h2>
      <p>
        Where the Site offers paid downloads, paid guides, or consult bookings,
        the price, scope, and refund policy will be displayed at checkout.
        Unless stated otherwise, digital downloads are non-refundable once the
        download link has been delivered, and consult bookings can be
        rescheduled with at least 24 hours&apos; notice.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        The Site, including code, design, and original written content, is
        owned by Tomodachi and protected by intellectual-property
        laws. The Tomodachi Life palette and references are used under fair
        use for an unofficial fan tool. We do not bundle official game assets.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        The Site is provided &quot;as is&quot; without warranties of any kind,
        either express or implied. We do not warrant that the Site will be
        uninterrupted, error-free, or secure.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Tomodachi is not
        liable for indirect, incidental, special, consequential, or punitive
        damages, or any loss of data or profits, arising from your use of the
        Site. Our total liability for any claim related to the Site will not
        exceed the amount you paid us in the twelve months preceding the
        claim, or USD 50 if you paid us nothing.
      </p>

      <h2>11. Termination and deletion</h2>
      <p>
        We may suspend or terminate access to the Site for users who violate
        these Terms or whose use poses a risk to other users. User-requested
        deletion immediately hides content and allows cancellation for seven
        days before erasure; canceled accounts return with creations private.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These Terms are governed by the laws of your principal jurisdiction
        unless otherwise required by mandatory consumer-protection law.
        Substitute this section before launch with the operator&apos;s actual
        chosen jurisdiction.
      </p>

      <h2>13. Changes</h2>
      <p>
        We may update these Terms occasionally. Material changes will be
        announced on the Site at least 30 days before they take effect.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions:{" "}
        <a href="mailto:legal@tomodachi.pw">legal@tomodachi.pw</a>.
      </p>
    </LegalLayout>
  );
}
