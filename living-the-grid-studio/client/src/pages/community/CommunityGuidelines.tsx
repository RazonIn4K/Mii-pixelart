import LegalLayout from "@/components/LegalLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function CommunityGuidelines() {
  useDocumentTitle("Community Guidelines");
  return (
    <LegalLayout
      title="Community Guidelines"
      lastUpdated="July 14, 2026"
      intro="Tomodachi is a fan-made workshop for original, constructive pixel art. These rules apply to public and unlisted creations, profile and showcase images, profiles, comments, and interactions."
    >
      <h2>Share work you have the right to share</h2>
      <p>
        Post original work, licensed material, or material you are otherwise
        permitted to use. Do not upload game assets, private photos, personal
        information, or copyrighted work merely because it is available online.
      </p>
      <p>
        Before adding a profile photo, creation photo, or screenshot, remove
        personal details and make sure every identifiable person has agreed to
        appear. A profile photo must represent you or an identity you have
        permission to use. Showcase images must relate to the creation, and
        neither upload path may be used as general-purpose image hosting.
      </p>
      <h2>Keep the workshop safe</h2>
      <ul>
        <li>
          No harassment, threats, hate, sexual exploitation, graphic violence,
          impersonation, spam, or malicious links.
        </li>
        <li>
          Do not expose another person&apos;s private information or use the
          service to coordinate abuse.
        </li>
        <li>
          Tomodachi is for people aged 13 and older. Content must remain
          appropriate for a general creative community.
        </li>
      </ul>
      <h2>Be constructive</h2>
      <p>
        Critique the work, not the person. Repeated unwanted contact, brigading,
        engagement manipulation, and attempts to evade moderation are
        prohibited.
      </p>
      <h2>How moderation works</h2>
      <p>
        Reports are private. Automated tools may classify, prioritize,
        summarize, and recommend a response, but they never hide content,
        suspend an account, resolve a report, or publish material on their own.
        An authorized human reviews the context and approves every enforcement
        decision. David Ortiz is the accountable administrator and final human
        reviewer. Serious or repeated violations can result in permanent
        removal, and moderation actions are recorded for accountability.
      </p>
      <h2>Questions and appeals</h2>
      <p>
        Contact <code>help@tomodachi.pw</code> with the case identifier shown in
        a moderation notice. Do not repost removed material while an appeal is
        pending.
      </p>
    </LegalLayout>
  );
}
