/** Privacy Policy describing Tomodachi's current data flows. */

import LegalLayout from "@/components/LegalLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useStructuredData } from "@/hooks/useStructuredData";
import { breadcrumbFor } from "@/lib/breadcrumb";

export default function Privacy() {
  useDocumentTitle("Privacy");
  useStructuredData([
    breadcrumbFor([
      { name: "Home", href: "/" },
      { name: "Privacy", href: "/privacy" },
    ]),
  ]);

  return (
    <LegalLayout
      title="Privacy Policy"
      lastUpdated="July 16, 2026"
      intro="Tomodachi is a local-first pixel-art workshop with an optional account and community layer. Local editing and export do not require an account; cloud saving and publishing are deliberate choices."
    >
      <h2>1. Who we are</h2>
      <p>
        David Ortiz operates Tomodachi (&quot;we,&quot; &quot;us,&quot;
        &quot;our&quot;) and the websites at <code>tomodachi.pw</code> and{" "}
        <code>tomodachi.brave</code> (collectively, the &quot;Site&quot;). You
        can reach us by email at <code>privacy@tomodachi.pw</code>.
      </p>

      <h2>2. What we collect</h2>
      <p>The Site only collects the categories of data described below.</p>

      <h3>2.1 Information you give us</h3>
      <ul>
        <li>
          If you sign in, Google provides a stable account identifier, verified
          email address, and basic profile fields. We do not retain Google
          access, refresh, or ID tokens after account provisioning.
        </li>
        <li>
          Your username, display name, bio, optional profile image, private
          cloud projects, publication choices, optional showcase images and
          their descriptions, comments, likes, follows, and reports.
        </li>
        <li>
          Text prompts and grid JSON you deliberately send through an AI feature
          transit our Worker to OpenRouter and the selected model provider. They
          are not treated as community projects unless you separately choose to
          save the resulting project.
        </li>
      </ul>

      <h3>2.2 Information we collect automatically</h3>
      <ul>
        <li>
          Approximate location derived from IP at the Cloudflare edge, used only
          to serve the site from a nearby data center.
        </li>
        <li>
          Redacted operational metadata: request ID, coarse route group, method,
          status, duration, and environment. Application logs do not contain raw
          paths or queries, IP addresses, user identity, cookies, tokens,
          request bodies, prompts, or project content.
        </li>
        <li>
          Aggregate usage events from privacy-respecting analytics, but only if
          you have consented via the cookie banner.
        </li>
      </ul>

      <h3>2.3 Information we do NOT collect</h3>
      <ul>
        <li>
          Source images used for imports stay in your browser and are not sent
          to Tomodachi or included in cloud saves automatically. If you
          separately choose a photo or screenshot as a showcase image, we remove
          its filename and metadata, retain only optimized WebP/JPEG variants,
          and associate them with that cloud creation. If you separately choose
          a profile image in Settings, we retain one normalized square WebP and
          use it wherever your public identity is shown. We never copy your
          Google profile photo automatically.
        </li>
        <li>
          Tomodachi never receives your password, its hash, or its prefix. The
          breach-check tool hashes the password with SHA-1 in your browser and
          sends only the first five hash characters directly from your browser
          to the haveibeenpwned API.
        </li>
        <li>We do not sell personal information.</li>
      </ul>

      <h2>3. Why we use your data</h2>
      <p>Each category of data is processed for a specific purpose:</p>
      <ul>
        <li>
          <strong>Operate the Site.</strong> Serving pages, routing AI requests,
          returning password-breach results, and providing account and community
          features.
        </li>
        <li>
          <strong>Improve the Site.</strong> Diagnosing errors and measuring
          which features get used (only with analytics consent).
        </li>
        <li>
          <strong>Communicate.</strong> Responding when you contact a published
          support, privacy, security, legal, abuse, or copyright address.
        </li>
        <li>
          <strong>Comply with the law.</strong> Responding to lawful requests
          and enforcing our Terms.
        </li>
      </ul>

      <h2>4. Service providers</h2>
      <p>We share the minimum data needed with the following providers:</p>
      <ul>
        <li>
          <strong>Cloudflare</strong> for Workers hosting, DNS/CDN, D1 account
          and community records, private R2 project/media objects, and image
          transformations for generated previews and optional profile or
          showcase images.
        </li>
        <li>
          <strong>Google</strong> for optional OpenID Connect sign-in. We ask
          only for openid, email, and profile scopes.
        </li>
        <li>
          <strong>OpenRouter</strong> for routing AI chat requests to language
          models. Prompts you send to the assistant transit OpenRouter and the
          underlying model provider.
        </li>
        <li>
          <strong>Google AdSense</strong> for advertising, if you have accepted
          marketing cookies.
        </li>
        <li>
          <strong>haveibeenpwned</strong> for the password-breach prefix lookup.
          Your browser sends the five-character prefix directly to
          haveibeenpwned; it does not pass through Tomodachi servers.
        </li>
      </ul>

      <h2>5. Visibility and retention</h2>
      <p>
        Cloud saves begin private. Public creations appear in discovery, search,
        and profiles. Unlisted creations stay out of those surfaces but can be
        viewed by anyone with the link. Session records expire after 30 days. An
        optional profile image is publicly visible with your active profile
        until you remove or replace it; suspension makes it unavailable.
        Optional showcase variants follow the visibility and deletion of their
        parent creation. Normalized profile and showcase images count toward the
        account storage quota, while raw uploads are discarded after
        transformation. Account deletion hides content and revokes sessions
        immediately, provides a seven-day cancellation window, and then removes
        account and project data. Resolved report free-text is purged after 90
        days; minimal pseudonymized moderation records are retained for two
        years and then deleted.
      </p>

      <h2>6. Your rights and controls</h2>
      <p>
        Depending on where you live, you may have the right to access, correct,
        delete, port, or object to the processing of your personal data. To
        exercise these rights, contact <code>privacy@tomodachi.pw</code>. We
        respond within 30 days. You can also stream an account-data export from
        Settings, revoke all sessions, delete your account, or withdraw consent
        by clearing the cookie banner choices in your browser&apos;s site data.
      </p>

      <h2>7. Children</h2>
      <p>
        The Site is not directed to children under 13 (or the equivalent minimum
        age in your jurisdiction). We do not knowingly collect personal
        information from children.
      </p>

      <h2>8. Changes</h2>
      <p>
        We will post any changes here and update the &quot;Last updated&quot;
        date at the top of this page. If a change materially expands what we
        collect or how we use it, we will surface a banner on the Site for at
        least 30 days before the change takes effect.
      </p>

      <h2>9. Contact</h2>
      <p>
        The operator is David Ortiz, 122 W Taylor St, DeKalb, Illinois 60115,
        United States. Questions, requests, and postal privacy notices:{" "}
        <a href="mailto:privacy@tomodachi.pw">privacy@tomodachi.pw</a>.
      </p>
    </LegalLayout>
  );
}
