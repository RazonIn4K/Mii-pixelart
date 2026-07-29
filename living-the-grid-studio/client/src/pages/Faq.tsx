/**
 * /faq — answers to the questions that actually drive search traffic.
 *
 * Why this page exists:
 *   1. Each Q&A pair gets indexed independently by Google. Long-tail queries
 *      like "is tomodachi life still playable" or "what is the tomodachishare
 *      breach" land here before they land on the homepage.
 *   2. The FAQPage JSON-LD schema makes us eligible for the FAQ rich result
 *      (expanded SERP card with up to 3 questions visible). That doubles the
 *      visible SERP real-estate for the same ranking.
 *   3. It's a low-effort content type that compounds: every new question
 *      added is one more long-tail target with almost no marginal cost.
 */

import { Link } from "wouter";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useStructuredData } from "@/hooks/useStructuredData";
import { breadcrumbFor } from "@/lib/breadcrumb";

interface FaqItem {
  question: string;
  answer: string;
  links?: Array<{ label: string; href: string }>;
}

const FAQ_GROUPS: Array<{ heading: string; items: FaqItem[] }> = [
  {
    heading: "Tomodachi Life releases",
    items: [
      {
        question: "Is Tomodachi Life still playable in 2026?",
        answer:
          "Yes, but there are two different releases. Tomodachi Life: Living the Dream is a separate Nintendo Switch title released on April 16, 2026. The original Tomodachi Life remains playable on 3DS or 2DS hardware if you already own it. Tomodachi Studio is an unofficial planning tool: it does not transfer game files or provide an online bridge to either game.",
      },
      {
        question: "Can I make my Mii look like a real person?",
        answer:
          "Yes. In the legacy 3DS Mii Maker workflow, the Look-Alike Mii tool can generate a rough starting point from a camera photo. Tomodachi Life: Living the Dream on Nintendo Switch has separate Get Help and From Scratch creation paths. Tomodachi Studio can prepare a manual Copy Guide, but it does not import a project into either game. The Guides page explains the legacy 3DS workflow.",
        links: [{ label: "Mii creation guide", href: "/guides#mii-creation" }],
      },
      {
        question: "What is the Studio's Face Paint Copy Guide?",
        answer:
          "Tomodachi Studio converts a photo or character image into a paint-by-numbers Copy Guide for planning custom face art. You manually recreate the reference with the drawing tools available in your game; the Studio does not edit a save, upload directly to a Nintendo title, or claim exact proprietary palette or canvas dimensions.",
        links: [{ label: "Try the Studio", href: "/studio" }],
      },
      {
        question:
          "Why can't I edit a Mii's face after it moves into Tomodachi Life?",
        answer:
          "This question describes the original Tomodachi Life on 3DS, where a resident's underlying Mii face has legacy editing restrictions after import. Tomodachi Life: Living the Dream is a separate Switch title with its own creation tools. Tomodachi Studio only helps plan art for manual recreation; it does not modify a resident or save file.",
      },
      {
        question: "How do I back up my Tomodachi Life save?",
        answer:
          "For the original 3DS release, the relevant legacy options are Nintendo's system transfer, any supported System Settings data-management path, and third-party save managers on homebrew-enabled hardware. Verify compatibility before changing or deleting anything. This is separate from Tomodachi Life: Living the Dream on Switch, and Tomodachi Studio does not read or back up game saves. The QR & save backup guide covers the legacy workflow.",
        links: [
          { label: "QR + save backup guide", href: "/guides#qr-and-backup" },
        ],
      },
    ],
  },
  {
    heading: "The Tomodachishare breach",
    items: [
      {
        question: "What was the Tomodachishare breach?",
        answer:
          "Tomodachishare was a community site for sharing Tomodachi Life content (Mii QR codes, island showcases, music tracks). A credential dump exposed email addresses and password hashes from its user database. If you used Tomodachishare and reused that password anywhere else — especially on your Nintendo Network ID, email, or bank — those accounts are now at elevated risk.",
      },
      {
        question: "Was my password leaked?",
        answer:
          "Open the home page and use the browser-only password breach check. Paste the password you used on Tomodachishare. The check sends only the first five characters of a SHA-1 hash to the Have I Been Pwned API (k-anonymity model) and compares the rest locally in your browser. Your full password never leaves the page.",
        links: [
          { label: "Run the breach check", href: "/" },
          { label: "How the check works", href: "/help" },
        ],
      },
      {
        question: "What should I do first if my password was leaked?",
        answer:
          "Don't change the Tomodachishare password first — that site is shut down, fixing it there protects nothing. Change your primary email password first (because email controls every password reset), turn on two-factor authentication on that email, then work through other accounts in priority order: banks, cloud storage, identity (Apple/Google/Microsoft), social, everything else.",
        links: [
          { label: "Free 24-hour action plan", href: "/help" },
          { label: "Try the free AI Action Plan", href: "/ai-plan" },
        ],
      },
    ],
  },
  {
    heading: "The Studio + the site",
    items: [
      {
        question: "Is the Studio free to use?",
        answer:
          "Yes. Importing a photo, generating a paint-by-numbers reference, and exporting the reference pack are available without an account. An account is required only for cloud and community features or AI image generation.",
      },
      {
        question: "Do you store my photos or my password?",
        answer:
          "Studio image imports stay in your browser and are never included in a cloud save automatically. If you separately attach a photo or screenshot as a showcase image, we discard the raw file and metadata after creating optimized display copies for that creation. We never receive your password: the breach check uses k-anonymity, so only a five-character SHA-1 prefix goes directly to Have I Been Pwned. The AI assistant sends prompts to OpenRouter only when you use it.",
        links: [{ label: "Privacy Policy", href: "/privacy" }],
      },
      {
        question: "Which AI models does the assistant use?",
        answer:
          "The image generator uses allowlisted Gemini Flash Lite Image and Gemini Flash Image models through OpenRouter. Advice and refinement use curated compatible models. The server checks model capability and availability before use and rejects arbitrary model IDs.",
      },
      {
        question: "How can I support the project?",
        answer:
          "Test a real drawing workflow, publish original work when community sharing opens, report reproducible bugs, or send product feedback.",
        links: [
          { label: "Support the workshop", href: "/support" },
          { label: "AI Action Plan", href: "/ai-plan" },
        ],
      },
    ],
  },
];

function buildFaqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "en",
    url: "https://tomodachi.pw/faq",
    mainEntity: FAQ_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    ),
  };
}

export default function Faq() {
  useDocumentTitle(
    "FAQ",
    "Common questions about Tomodachi Life in 2026, the Tomodachishare breach recovery process, the Face Paint Copy Guide, and the site's AI and privacy boundaries.",
  );
  useStructuredData([
    breadcrumbFor([
      { name: "Home", href: "/" },
      { name: "FAQ", href: "/faq" },
    ]),
    buildFaqJsonLd(),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="text-sm font-medium hover:underline">
            ← Tomodachi
          </Link>
          <span className="text-xs text-muted-foreground">
            Frequently asked questions
          </span>
        </div>
      </header>

      <main
        id="main-content"
        className="container max-w-3xl py-10 sm:py-12 space-y-10"
      >
        <section className="space-y-3">
          <p className="section-header">FAQ</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Common questions about Tomodachi, the breach, and the Studio.
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed max-w-prose">
            Quick answers to the things people ask most often. Each section
            links to a longer guide or a free tool when there's one. If your
            question isn't here, the long-form guides cover most of what's not
            covered below.
          </p>
        </section>

        {FAQ_GROUPS.map((group) => (
          <section key={group.heading} className="space-y-5">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
              {group.heading}
            </h2>
            <div className="space-y-4">
              {group.items.map((item) => (
                <details
                  key={item.question}
                  className="group rounded-sm border border-border bg-card p-4 open:bg-accent/40"
                >
                  <summary className="cursor-pointer list-none text-sm font-semibold leading-snug marker:hidden">
                    <span className="inline-block w-4 text-primary group-open:rotate-90 transition-transform">
                      ›
                    </span>{" "}
                    {item.question}
                  </summary>
                  <div className="mt-3 pl-5 text-sm leading-relaxed text-foreground/85">
                    <p>{item.answer}</p>
                    {item.links && item.links.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-xs">
                        {item.links.map((link) => (
                          <li key={link.href}>
                            <Link
                              href={link.href}
                              className="underline underline-offset-2"
                            >
                              {link.label} →
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}

        <section className="border-t border-border pt-6 space-y-2 text-sm text-muted-foreground">
          <p>
            Question not covered? The long-form{" "}
            <Link href="/guides" className="underline">
              guides
            </Link>{" "}
            go deeper, and the free{" "}
            <Link href="/help" className="underline">
              breach recovery help
            </Link>{" "}
            page covers the first 24 hours after a leak notice.
          </p>
        </section>
      </main>
    </div>
  );
}
