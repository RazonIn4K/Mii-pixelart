import LegalLayout from "@/components/LegalLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function Security() {
  useDocumentTitle("Security");
  return (
    <LegalLayout
      title="Security"
      lastUpdated="July 12, 2026"
      intro="Tomodachi keeps anonymous editing local, treats cloud publishing as an explicit action, and uses narrowly scoped account and storage controls."
    >
      <h2>Account protection</h2>
      <ul>
        <li>Google sign-in uses authorization code, state, nonce, and S256 PKCE validation with only openid, email, and profile scopes.</li>
        <li>Session cookies are Secure, HttpOnly, SameSite=Lax, and fixed at 30 days. The database stores only a peppered SHA-256 token hash.</li>
        <li>Unsafe requests require the exact site Origin, JSON bodies are bounded and schema validated, and every mutation performs object-level authorization.</li>
      </ul>
      <h2>Projects and media</h2>
      <p>Cloud projects are private by default. Studio import sources remain local unless you separately choose one as a showcase image. Project JSON is validated and generated previews contain only server-selected shapes and palette colors. Showcase uploads use a short-lived one-use ticket without account cookies, strict byte and dimension limits, and mandatory image decoding. We discard the raw file, filename, and metadata and retain only normalized WebP/JPEG variants in private R2 behind authorization-aware Worker routes.</p>
      <h2>Breach-check privacy</h2>
      <p>The password checker hashes input in your browser and sends only the first five SHA-1 characters to the Have I Been Pwned range API. Full passwords are never sent to Tomodachi.</p>
      <h2>Report a vulnerability</h2>
      <p>Email <a href="mailto:security@tomodachi.pw">security@tomodachi.pw</a> with reproduction steps and impact. Do not access other users&apos; data, disrupt service, or publish sensitive details before we have had a reasonable opportunity to respond.</p>
    </LegalLayout>
  );
}
