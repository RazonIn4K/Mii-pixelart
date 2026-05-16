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
    heading: "Tomodachi Life as a game",
    items: [
      {
        question: "Is Tomodachi Life still playable in 2026?",
        answer:
          "Yes. Tomodachi Life: Living the Dream still runs on any working 3DS or 2DS. The 3DS eShop is closed, so you can no longer buy the game digitally, but if you already own it (cartridge or downloaded), it works exactly as it always did. The online \"Tomodachi Life Travel\" service and StreetPass Plaza shutdowns affected QR-code-based Mii sharing very little; the local QR-code import/export still works. There's no Switch port.",
      },
      {
        question: "Can I make my Mii look like a real person?",
        answer:
          "Yes — the 3DS Mii Maker has a built-in \"Look-Alike Mii\" tool that generates a rough Mii from a front-camera photo. The output is almost always wrong on details, but it's faster to correct a wrong Mii than to build one from a blank canvas. The Guides page has a step-by-step walkthrough.",
        links: [
          { label: "Mii creation guide", href: "/guides#mii-creation" },
        ],
      },
      {
        question: "What's a Mii face mask?",
        answer:
          "In Tomodachi Life, a Mii face mask is a wearable item that lets a Mii put on a custom face painted square-by-square in-game. The Studio on this site converts a photo or character image into a paint-by-numbers reference so you can repaint that face cell-by-cell without guessing the colors.",
        links: [{ label: "Try the Studio", href: "/studio" }],
      },
      {
        question: "Why can't I edit a Mii's face after it moves into Tomodachi Life?",
        answer:
          "Mii face data is locked at the moment the Mii enters a Tomodachi Life apartment. After that, only personality, clothing, and voice are editable in-game. To change the face, you either re-import a fresh version of the Mii from Mii Maker (which replaces the old one and may lose relationships), or accept the existing face. The Studio's pixel-art face-mask path is the workaround — you can change the wearable face mask any time without touching the underlying Mii.",
      },
      {
        question: "How do I back up my Tomodachi Life save?",
        answer:
          "Three real options on the 3DS: (1) Nintendo's official system transfer moves saves between 3DS units; (2) some games support save export from System Settings → Data Management to SD card; (3) on a homebrew-enabled 3DS, tools like Checkpoint can copy saves off the system for true off-device backup. The QR & save backup guide covers each in detail.",
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
          { label: "Paid 12-step recovery checklist ($9)", href: "/unlock" },
        ],
      },
      {
        question: "Is the breach recovery checklist worth $9?",
        answer:
          "Only if you'd rather follow a printable structured plan than improvise from the free 24-hour actions on /help. The free guidance already covers the four highest-value moves. The paid checklist is a longer printable PDF + Markdown for people who want to share a plan with less-technical family members, or who want a 30-day monitoring rhythm spelled out step by step.",
      },
    ],
  },
  {
    heading: "The Studio + the site",
    items: [
      {
        question: "Is the Studio free to use?",
        answer:
          "Yes. Importing a photo, generating a paint-by-numbers reference, exporting the reference pack — all free. No account needed. The optional paid extras live on /unlock and /support and have nothing to do with the editor itself.",
      },
      {
        question: "Do you store my photos or my password?",
        answer:
          "No. The Studio runs entirely in your browser; uploaded images never leave the page. The password breach check uses k-anonymity, so we only see a five-character SHA-1 prefix that can't be reversed. The AI recovery assistant does send your typed prompt to OpenRouter, which we tell you in the UI — that's the one feature that talks to a remote model.",
        links: [{ label: "Privacy Policy", href: "/privacy" }],
      },
      {
        question: "Which AI models does the assistant use?",
        answer:
          "Free OpenRouter models only. The default is DeepSeek V4 Flash; the picker also offers GPT-OSS 120B, GLM 4.5 Air, and Nemotron 3 Super 120B. You can also type any OpenRouter model ID directly if you want a paid model — that uses your OpenRouter key, not ours.",
      },
      {
        question: "How can I support the project?",
        answer:
          "Three ways: drop a tip on /support ($5, $15, or $25 via Stripe), pick up the paid recovery checklist or 30-min consult on /unlock, or watch the GitHub repo for the Sponsor button once the application is approved.",
        links: [
          { label: "Tip jar", href: "/support" },
          { label: "Paid recovery content", href: "/unlock" },
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
    "Common questions about Tomodachi Life in 2026, the Tomodachishare breach recovery process, the pixel-art Mii face mask studio, and how this site is funded.",
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
          <span className="text-xs text-muted-foreground">Frequently asked questions</span>
        </div>
      </header>

      <main className="container max-w-3xl py-10 sm:py-12 space-y-10">
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
