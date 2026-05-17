/**
 * Privacy Policy page.
 *
 * This is general-purpose template language tuned for the actual data flows
 * Tomodachi runs. It is NOT legal advice. Before going to production with
 * paid services, have a lawyer review it for your jurisdiction and
 * substitute the placeholder contact details for your real mailing address
 * and operator entity.
 */

import LegalLayout from "@/components/LegalLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useStructuredData } from "@/hooks/useStructuredData";
import { breadcrumbFor } from "@/lib/breadcrumb";

export default function Privacy() {
  useDocumentTitle("Privacy");
  useStructuredData([breadcrumbFor([{ name: "Home", href: "/" }, { name: "Privacy", href: "/privacy" }])]);

  return (
    <LegalLayout
      title="Privacy Policy"
      lastUpdated="May 14, 2026"
      intro="Tomodachi is a browser-first Mii pixel-art studio paired with practical breach-recovery guides. We try to collect as little personal data as possible, and we tell you exactly what we do collect, why, and how to control it."
    >
      <h2>1. Who we are</h2>
      <p>
        Tomodachi (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;)
        operates the websites at <code>tomodachi.pw</code> and{" "}
        <code>tomodachi.brave</code> (collectively, the &quot;Site&quot;). You
        can reach us by email at{" "}
        <code>privacy@tomodachi.pw</code>.
      </p>

      <h2>2. What we collect</h2>
      <p>The Site only collects the categories of data described below.</p>

      <h3>2.1 Information you give us</h3>
      <ul>
        <li>
          Text prompts, password fragments (as SHA-1 prefixes only), or grid
          images you submit to the AI assistant or breach-check tools.
        </li>
        <li>
          Newsletter email address, if you choose to subscribe.
        </li>
        <li>
          Payment details (handled entirely by Stripe; we never see your full
          card number).
        </li>
      </ul>

      <h3>2.2 Information we collect automatically</h3>
      <ul>
        <li>
          Approximate location derived from IP at the Cloudflare edge, used
          only to serve the site from a nearby data center.
        </li>
        <li>
          Standard server logs (request path, status, user-agent, timestamp)
          retained for up to 30 days for security and abuse prevention.
        </li>
        <li>
          Aggregate usage events from privacy-respecting analytics, but only
          if you have consented via the cookie banner.
        </li>
      </ul>

      <h3>2.3 Information we do NOT collect</h3>
      <ul>
        <li>
          We never receive full passwords. The breach-check tool hashes your
          password with SHA-1 in your browser and only sends the first five
          characters of that hash to the haveibeenpwned API.
        </li>
        <li>
          We do not sell personal information.
        </li>
      </ul>

      <h2>3. Why we use your data</h2>
      <p>
        Each category of data is processed for a specific purpose:
      </p>
      <ul>
        <li>
          <strong>Operate the Site.</strong> Serving pages, routing AI
          requests, returning password-breach results, processing payments.
        </li>
        <li>
          <strong>Improve the Site.</strong> Diagnosing errors and measuring
          which features get used (only with analytics consent).
        </li>
        <li>
          <strong>Communicate.</strong> Sending newsletter updates only to
          people who subscribed and a way to unsubscribe in every email.
        </li>
        <li>
          <strong>Comply with the law.</strong> Responding to lawful requests
          and enforcing our Terms.
        </li>
      </ul>

      <h2>4. Service providers</h2>
      <p>
        We share the minimum data needed with the following providers:
      </p>
      <ul>
        <li>
          <strong>Cloudflare</strong> for hosting, DNS, CDN, and Pages
          Functions.
        </li>
        <li>
          <strong>OpenRouter</strong> for routing AI chat requests to language
          models. Prompts you send to the assistant transit OpenRouter and the
          underlying model provider.
        </li>
        <li>
          <strong>Stripe</strong> for processing paid recovery guides and
          consult bookings.
        </li>
        <li>
          <strong>Google AdSense</strong> for advertising, if you have
          accepted marketing cookies.
        </li>
        <li>
          <strong>haveibeenpwned</strong> for the password-breach prefix
          lookup. Only the first five characters of your password hash are
          ever sent.
        </li>
      </ul>

      <h2>5. Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access,
        correct, delete, port, or object to the processing of your personal
        data. To exercise these rights, contact{" "}
        <code>privacy@tomodachi.pw</code>. We respond within 30 days. You can
        also withdraw consent at any time by clearing the cookie consent
        banner choices in your browser&apos;s site data.
      </p>

      <h2>6. Children</h2>
      <p>
        The Site is not directed to children under 13 (or the equivalent
        minimum age in your jurisdiction). We do not knowingly collect
        personal information from children.
      </p>

      <h2>7. Changes</h2>
      <p>
        We will post any changes here and update the &quot;Last updated&quot;
        date at the top of this page. If a change materially expands what we
        collect or how we use it, we will surface a banner on the Site for at
        least 30 days before the change takes effect.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions or requests:{" "}
        <a href="mailto:privacy@tomodachi.pw">privacy@tomodachi.pw</a>.
      </p>
    </LegalLayout>
  );
}
