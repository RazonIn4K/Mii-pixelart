import LegalLayout from "@/components/LegalLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function Copyright() {
  useDocumentTitle("Copyright and takedowns");
  return (
    <LegalLayout title="Copyright and Takedowns" lastUpdated="July 13, 2026" intro="Tomodachi respects creators and responds to specific, good-faith reports about material shared through the community platform.">
      <h2>Before submitting a notice</h2><p>Consider whether the use is authorized, licensed, public domain, or protected by an applicable copyright exception. Misrepresenting a claim may carry legal consequences.</p>
      <h2>What to include</h2><ul><li>Your legal name and a reliable way to contact you.</li><li>Identification of the copyrighted work and the exact Tomodachi URL at issue.</li><li>A statement that you have a good-faith belief the use is not authorized.</li><li>A statement, under penalty of perjury, that the notice is accurate and you are authorized to act.</li><li>Your physical or electronic signature.</li></ul>
      <p>Send complete notices to David Ortiz, the operator, at <code>legal@tomodachi.pw</code> or by mail to 1110 S 9th st, DeKalb, Illinois 60115, United States. General moderation concerns should use the in-product Report control instead.</p>
      <h2>Counter-notices</h2><p>If your content was removed in error, reply to the removal notice with identification of the material, your contact information, consent to the appropriate legal jurisdiction, a statement under penalty of perjury that removal was a mistake, and your signature.</p>
      <h2>Unofficial project</h2><p>Tomodachi is an unofficial fan-made creative tool. It does not bundle official game or character assets and does not claim affiliation with Nintendo or other rights holders.</p>
    </LegalLayout>
  );
}
