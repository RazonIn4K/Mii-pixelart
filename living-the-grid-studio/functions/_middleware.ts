/**
 * Edge middleware for tomodachi.pw on Cloudflare Pages.
 *
 * Two crawler audiences, two different responses:
 *
 *   1) SOCIAL crawlers (Facebook, Twitter, LinkedIn, Slack, Discord, Telegram,
 *      WhatsApp) only care about OpenGraph/Twitter meta on the homepage. We
 *      serve a compact shell with just those tags so the link preview renders
 *      cleanly without making the crawler execute the SPA JS.
 *
 *   2) SEARCH crawlers (Googlebot, Bingbot, DuckDuckBot, Baiduspider,
 *      YandexBot, etc.) need to see actual page content in the initial HTML.
 *      Google does run JS in a second-pass renderer but that's slow and
 *      unreliable; serving real text in the first response gets pages
 *      indexed in days instead of weeks. We map each /route to a curated
 *      pre-rendered shell with title + description + visible <h1>/<p> +
 *      internal links + JSON-LD where appropriate.
 *
 * Both shells set Vary: User-Agent so any upstream cache that doesn't key on
 * UA can't accidentally serve a crawler-only shell to a regular browser.
 */

const SOCIAL_CRAWLERS = [
  "facebookexternalhit",
  "Facebot",
  "facebookcatalog",
  "FacebookBot",
  "Twitterbot",
  "LinkedInBot",
  "WhatsApp",
  "Slackbot",
  "TelegramBot",
  "Discordbot",
];

const SEARCH_CRAWLERS = [
  "Googlebot",
  "Bingbot",
  "BingPreview",
  "DuckDuckBot",
  "DuckDuckGo-Favicons-Bot",
  "Baiduspider",
  "YandexBot",
  "Slurp", // Yahoo
  "Sogou",
  "Mojeekbot",
  "AhrefsBot",
];

interface RouteShell {
  title: string;
  description: string;
  h1: string;
  body: string;
  // jsonLd accepts a single block or an array of blocks. The shell renderer
  // emits one <script type="application/ld+json"> per block so the markup
  // matches what Google's Rich Results Test expects.
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

const BREADCRUMB_HOME = {
  "@type": "ListItem",
  position: 1,
  name: "Home",
  item: "https://tomodachi.pw/",
};

function breadcrumbFor(name: string, route: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      BREADCRUMB_HOME,
      {
        "@type": "ListItem",
        position: 2,
        name,
        item: `https://tomodachi.pw${route}`,
      },
    ],
  };
}

const PUBLISHER_ORG = {
  "@type": "Organization",
  name: "Tomodachi",
  url: "https://tomodachi.pw/",
  logo: { "@type": "ImageObject", url: "https://tomodachi.pw/icon-512.png" },
};

const COMMON_HEAD = `
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#101016" />
  <meta name="robots" content="index,follow" />
  <link rel="icon" href="/icon-192.png" />`;

function shellFor(route: string, shell: RouteShell): string {
  const url = `https://tomodachi.pw${route}`;
  const blocks = shell.jsonLd
    ? Array.isArray(shell.jsonLd)
      ? shell.jsonLd
      : [shell.jsonLd]
    : [];
  const jsonLdTag = blocks
    .map(
      (block) =>
        `<script type="application/ld+json">${JSON.stringify(block)}</script>`,
    )
    .join("\n  ");
  return `<!DOCTYPE html>
<html lang="en">
<head>${COMMON_HEAD}
  <title>${shell.title}</title>
  <meta name="description" content="${shell.description}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Tomodachi" />
  <meta property="og:title" content="${shell.title}" />
  <meta property="og:description" content="${shell.description}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="https://tomodachi.pw/community-og.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${shell.title}" />
  <meta name="twitter:description" content="${shell.description}" />
  <meta name="twitter:image" content="https://tomodachi.pw/community-og.jpg" />
  ${jsonLdTag}
</head>
<body>
  <header><a href="/">Tomodachi</a></header>
  <main>
    <h1>${shell.h1}</h1>
    ${shell.body}
  </main>
  <footer>
    <nav>
      <a href="/">Home</a> ·
      <a href="/studio">Studio</a> ·
      <a href="/guides">Guides</a> ·
      <a href="/faq">FAQ</a> ·
      <a href="/about">About</a> ·
      <a href="/help">Help</a> ·
      <a href="/ai-plan">AI Action Plan</a> ·
      <a href="/support">Support</a>
    </nav>
  </footer>
</body>
</html>`;
}

const ROUTES: Record<string, RouteShell> = {
  "/": {
    title: "Tomodachi · Mii Studio & Recovery Guides",
    description:
      "A browser-first Mii pixel-art studio paired with practical Tomodachishare breach-recovery guides for Tomodachi Life players.",
    h1: "Tomodachi · Mii Studio & Recovery Guides",
    body: `
      <p>Tomodachi is two things stacked on one site. The <a href="/studio">Studio</a> is a browser-first pixel-art editor for planning Mii-inspired face art — import a face photo or character art, reduce the colors against the Studio's 84-color working palette, and export a paint-by-numbers Copy Guide for manual recreation. It does not transfer game files or connect directly to a Nintendo title.</p>
      <p>The <a href="/guides">guides</a> and the free <a href="/help">recovery help</a> page are for visitors arriving from the Tomodachishare credential leak — calm, free, no-spam steps to rotate passwords and lock down accounts.</p>
      <h2>What's inside</h2>
      <ul>
        <li><a href="/studio">Studio</a> — import → reduce colors → export reference pack.</li>
        <li><a href="/">Home recovery hub</a> — browser-only k-anonymity password breach check + AI recovery assistant.</li>
        <li><a href="/guides">Long-form guides</a> — Mii creation, Tomodachi Life gameplay basics, post-breach recovery, QR codes + save backup.</li>
        <li><a href="/faq">FAQ</a> — common questions answered.</li>
        <li><a href="/ai-plan">AI Action Plan</a> — a free beta for practical, reviewable next steps.</li>
        <li><a href="/support">Support</a> — test the Studio, share original work, and report useful feedback.</li>
      </ul>`,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Tomodachi",
        url: "https://tomodachi.pw/",
        description:
          "Browser-first Mii pixel-art studio paired with practical breach-recovery guides for Tomodachi Life players.",
        applicationCategory: "DesignApplication",
        operatingSystem: "Any",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        image: "https://tomodachi.pw/community-og.jpg",
        publisher: PUBLISHER_ORG,
      },
    ],
  },
  "/studio": {
    title: "Studio · Tomodachi",
    description:
      "Browser-first Mii pixel-art editor. Import a face photo, reduce colors to the Studio working palette, and export a manual Copy Guide.",
    h1: "Tomodachi Studio",
    body: `
      <p>A browser-first pixel-art editor for planning Mii-inspired face art. Import a face photo, character art, or JSON file; reduce noise against the Studio's 84-color working palette; export editable JSON, guide PNGs, and a ZIP Copy Guide with a palette sheet, paint order, and reference HTML. The palette and grid dimensions are Studio conventions, not verified proprietary game data.</p>
      <h2>Features</h2>
      <ul>
        <li>Import any image or LTG JSON file.</li>
        <li>Studio 84-color working palette labeled by row and column for consistent manual matching.</li>
        <li>Color-reduction optimizer that preserves facial readability.</li>
        <li>AI assistant for sketch drafts (OpenRouter, free tier).</li>
        <li>Reference pack export — ZIP with JSON, guide PNGs, palette sheet, paint order, and reference HTML.</li>
      </ul>
      <p>See the <a href="/guides">guides</a> for step-by-step walkthroughs and the <a href="/faq">FAQ</a> for common questions.</p>`,
    jsonLd: [
      breadcrumbFor("Studio", "/studio"),
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Tomodachi Studio",
        url: "https://tomodachi.pw/studio",
        description:
          "Browser-first Mii pixel-art editor. Import a face photo, reduce colors to the Studio 84-color working palette, and export a manual Copy Guide.",
        applicationCategory: "DesignApplication",
        applicationSubCategory: "Pixel Art Editor",
        operatingSystem: "Any",
        browserRequirements: "Modern browser with JavaScript enabled.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        image: "https://tomodachi.pw/community-og.jpg",
        publisher: PUBLISHER_ORG,
      },
    ],
  },
  "/guides": {
    title: "Guides · Tomodachi",
    description:
      "Free walkthroughs on Mii creation, legacy 3DS Tomodachi Life basics, Tomodachishare breach recovery, and QR codes + save backup.",
    h1: "Guides",
    body: `
      <p>Practical walkthroughs for Tomodachi Life players turning faces and characters into Mii repaint plans, and visitors arriving from the Tomodachishare breach notice.</p>
      <h2>Tomodachi Life player guides</h2>
      <h3 id="mii-creation"><a href="/guides#mii-creation">How to make custom Miis for Tomodachi Life</a></h3>
      <p>Mii Maker tricks, face presets, hair, eyes, eyebrows. Start with the Look-Alike Mii camera tool, dial in eyes and mouth before hair, save Mii Maker variants before importing to Tomodachi Life.</p>
      <h3 id="gameplay-basics"><a href="/guides#gameplay-basics">Legacy 3DS Tomodachi Life: daily-play basics</a></h3>
      <p>A clearly labeled orientation for the original Nintendo 3DS/2DS game, with cautious request, reaction, relationship, and preservation guidance. It is not a guide to Living the Dream on Switch.</p>
      <h3 id="breach-recovery"><a href="/guides#breach-recovery">After the Tomodachishare breach</a></h3>
      <p>Step-by-step recovery: change your email password first, turn on 2FA, work through financial / cloud / identity / social accounts in priority order. 30-day monitoring rhythm.</p>
      <h3 id="qr-and-backup"><a href="/guides#qr-and-backup">QR codes, Mii sharing, save backup</a></h3>
      <p>How to export Miis as QR codes from 3DS or Wii U, scan QR codes from the community, and back up your Tomodachi Life save before the hardware dies.</p>
      <h2>Recovery + studio teasers</h2>
      <ul>
        <li><a href="/help">Tomodachi breach recovery checklist</a> — free 24-hour actions.</li>
        <li><a href="/studio">Turn a photo into a custom Face Paint Copy Guide</a>.</li>
        <li><a href="/studio">Reduce colors for repaintable pixel art</a>.</li>
        <li><a href="/">Password reuse cleanup after a community breach</a>.</li>
      </ul>`,
    jsonLd: [
      breadcrumbFor("Guides", "/guides"),
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Tomodachi Guides",
        url: "https://tomodachi.pw/guides",
        description:
          "Long-form Tomodachi Life player guides plus shorter recovery and studio guides.",
        inLanguage: "en",
        publisher: PUBLISHER_ORG,
        hasPart: [
          {
            "@type": "HowTo",
            name: "How to make custom Miis for Tomodachi Life",
            url: "https://tomodachi.pw/guides#mii-creation",
          },
          {
            "@type": "Article",
            headline: "Legacy 3DS Tomodachi Life: daily-play basics",
            url: "https://tomodachi.pw/guides#gameplay-basics",
          },
          {
            "@type": "Article",
            headline: "After the Tomodachishare breach",
            url: "https://tomodachi.pw/guides#breach-recovery",
          },
          {
            "@type": "HowTo",
            name: "QR codes, Mii sharing, save backup",
            url: "https://tomodachi.pw/guides#qr-and-backup",
          },
        ],
      },
    ],
  },
  "/faq": {
    title: "FAQ · Tomodachi",
    description:
      "Common questions about Tomodachi Life in 2026, the Tomodachishare breach recovery process, the Face Paint Copy Guide, and how this site is funded.",
    h1: "Frequently asked questions",
    body: `
      <h2>Tomodachi Life releases</h2>
      <h3>Is Tomodachi Life still playable in 2026?</h3>
      <p>Yes, but there are two different releases. Tomodachi Life: Living the Dream is a separate Nintendo Switch title released on April 16, 2026. The original Tomodachi Life remains playable on 3DS or 2DS hardware if you already own it. Tomodachi Studio does not transfer game files or provide an online bridge to either game.</p>
      <h3>Can I make my Mii look like a real person?</h3>
      <p>Yes. The legacy 3DS Mii Maker has a Look-Alike Mii tool for a rough camera-based starting point. Living the Dream on Nintendo Switch has separate Get Help and From Scratch creation paths. The <a href="/guides#mii-creation">Mii creation guide</a> clearly labels the legacy workflow.</p>
      <h3>What is the Studio's Face Paint Copy Guide?</h3>
      <p>The <a href="/studio">Studio</a> converts a photo or character image into a paint-by-numbers Copy Guide for manual recreation. It does not edit a save, upload directly to a Nintendo title, or claim exact proprietary palette or canvas dimensions.</p>
      <h2>The Tomodachishare breach</h2>
      <h3>What was the Tomodachishare breach?</h3>
      <p>A credential dump from the Tomodachishare community site exposed email addresses and password hashes. Reused passwords elsewhere are now at elevated risk.</p>
      <h3>Was my password leaked?</h3>
      <p>Use the browser-only password breach check on the <a href="/">home page</a>. It sends only the first 5 hex chars of a SHA-1 hash to the Have I Been Pwned API and compares locally; your full password never leaves the page.</p>
      <h3>What should I do first?</h3>
      <p>Change your email password before anything else (because email controls every other password reset). Then turn on 2FA on that email, then rotate other accounts. <a href="/help">Free 24-hour action plan here</a>.</p>
      <h2>The site</h2>
      <h3>Is the Studio free?</h3>
      <p>Yes. Import, reduce, export, password breach check, and AI assistant are free. Tomodachi currently accepts no payments, tips, or consultation bookings.</p>
      <h3>Do you store my photos or my password?</h3>
      <p>Local reference imports stay in your browser unless you deliberately choose a separate showcase upload for a cloud creation. Showcase files are normalized, metadata-stripped, and the raw upload is discarded. The password check uses k-anonymity, so only a 5-character SHA-1 prefix is sent.</p>`,
    jsonLd: [
      breadcrumbFor("FAQ", "/faq"),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        url: "https://tomodachi.pw/faq",
        inLanguage: "en",
        mainEntity: [
          {
            "@type": "Question",
            name: "Is Tomodachi Life still playable in 2026?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes, but there are two different releases. Tomodachi Life: Living the Dream is a separate Nintendo Switch title released on April 16, 2026. The original Tomodachi Life remains playable on 3DS or 2DS hardware if you already own it. Tomodachi Studio does not transfer game files or provide an online bridge to either game.",
            },
          },
          {
            "@type": "Question",
            name: "Can I make my Mii look like a real person?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. The legacy 3DS Mii Maker has a Look-Alike Mii tool for a rough camera-based starting point. Tomodachi Life: Living the Dream on Nintendo Switch has separate Get Help and From Scratch creation paths. Tomodachi Studio only provides a manual Copy Guide.",
            },
          },
          {
            "@type": "Question",
            name: "What is the Studio Face Paint Copy Guide?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Tomodachi Studio converts a photo or character image into a paint-by-numbers Copy Guide for manual recreation. It does not edit a save, upload directly to a Nintendo title, or claim exact proprietary palette or canvas dimensions.",
            },
          },
          {
            "@type": "Question",
            name: "What was the Tomodachishare breach?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "A credential dump from the Tomodachishare community site exposed email addresses and password hashes. Reused passwords elsewhere are now at elevated risk.",
            },
          },
          {
            "@type": "Question",
            name: "Was my password leaked?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Use the browser-only password breach check on the home page. It sends only the first 5 hex chars of a SHA-1 hash to the Have I Been Pwned API and compares locally; your full password never leaves the page.",
            },
          },
          {
            "@type": "Question",
            name: "What should I do first if my password was leaked?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Change your email password before anything else because email controls every other password reset. Then turn on 2FA on that email, then rotate other accounts.",
            },
          },
          {
            "@type": "Question",
            name: "Is the Studio free?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. Import, reduce, export, password breach check, and AI assistant are free. Tomodachi currently accepts no payments, tips, or consultation bookings.",
            },
          },
          {
            "@type": "Question",
            name: "Do you store my photos or my password?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No. The Studio runs entirely in your browser; uploads never leave the page. The password check is k-anonymity, so only a 5-character SHA-1 prefix is sent.",
            },
          },
        ],
      },
    ],
  },
  "/about": {
    title: "About · Tomodachi",
    description:
      "Why Tomodachi exists, what is in it, who is behind it, and how to reach the project for press or partnership.",
    h1: "About Tomodachi",
    body: `
      <p>Tomodachi is a Mii-inspired pixel-art studio paired with practical breach recovery. The <a href="/studio">Studio</a> is a browser-first editor for original pixel art and manual Face Paint Copy Guides; the <a href="/guides">Guides</a> and <a href="/help">recovery help</a> page serve visitors arriving from the Tomodachishare breach notice.</p>
      <h2>Free, useful, and honest about what exists</h2>
      <p>The editor, the password check, the AI assistant, and every guide are free. Tomodachi does not currently accept payments or consultation bookings. See the <a href="/ai-plan">AI Action Plan</a> for the free beta and future product direction.</p>
      <h2>Privacy on principle</h2>
      <p>Local reference imports stay in the browser unless you deliberately choose a separate, normalized showcase upload. Google accounts and private cloud projects are optional; anonymous editing and export remain available. The password check uses k-anonymity against Have I Been Pwned, and optional tracking waits for cookie consent.</p>
      <h2>How to reach the project</h2>
      <ul>
        <li>Source code &amp; issues: <a href="https://github.com/RazonIn4K/Mii-pixelart">github.com/RazonIn4K/Mii-pixelart</a></li>
        <li>Project support: test the Studio, share original work, or report useful feedback through <a href="/support">/support</a>.</li>
        <li>Brave Creators: tomodachi.pw is a verified Brave Creator.</li>
      </ul>`,
    jsonLd: [
      breadcrumbFor("About", "/about"),
      {
        "@context": "https://schema.org",
        "@type": "AboutPage",
        url: "https://tomodachi.pw/about",
        inLanguage: "en",
        name: "About Tomodachi",
        mainEntity: {
          "@type": "Organization",
          "@id": "https://tomodachi.pw/#org",
          name: "Tomodachi",
          url: "https://tomodachi.pw/",
          logo: "https://tomodachi.pw/icon-512.png",
          description:
            "Browser-first Mii pixel-art studio paired with practical Tomodachishare breach-recovery guides.",
          sameAs: ["https://github.com/RazonIn4K", "https://tomodachi.brave"],
          knowsAbout: [
            "Tomodachi Life",
            "Mii pixel art",
            "custom Face Paint reference",
            "Tomodachishare breach recovery",
            "k-anonymity password breach lookup",
          ],
        },
      },
    ],
  },
  "/help": {
    title: "Help · Tomodachi",
    description:
      "Free 24-hour action plan and ongoing checklist for anyone affected by the Tomodachishare breach.",
    h1: "Tomodachi incident support",
    body: `
      <p>A calm, practical path for users coming from breach notices or trust alerts. This route is intentionally light on promotions.</p>
      <h2>First 24 hours</h2>
      <ol>
        <li>Change the password on your <strong>primary email</strong> first — email controls every other password reset.</li>
        <li>Turn on <strong>two-factor authentication</strong> on that email. Prefer an authenticator app or hardware key over SMS.</li>
        <li>Run the <a href="/">browser-only password breach check</a> to see whether your old password is in any known breach datasets.</li>
        <li>Don't change the password on Tomodachishare itself — it's shut down, that fixes nothing.</li>
      </ol>
      <h2>Next 24 hours</h2>
      <p>Rotate passwords on accounts in priority order: financial (banks, brokerage, PayPal, crypto), cloud (Google Drive, iCloud, Dropbox), identity (Apple ID, Microsoft, Google), social (X, Instagram, Discord, Reddit), everything else. A password manager makes this an evening of work rather than a month-long fight.</p>
      <p>For personalized next steps, try the free <a href="/ai-plan">AI Action Plan beta</a>. Review every suggestion before acting and never include passwords, recovery codes, payment details, or other secrets.</p>`,
    jsonLd: [
      breadcrumbFor("Help", "/help"),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Tomodachi incident support — free 24-hour action plan",
        description:
          "Free 24-hour action plan and ongoing checklist for anyone affected by the Tomodachishare breach.",
        url: "https://tomodachi.pw/help",
        inLanguage: "en",
        author: PUBLISHER_ORG,
        publisher: PUBLISHER_ORG,
        image: "https://tomodachi.pw/community-og.jpg",
      },
    ],
  },
  "/ai-plan": {
    title: "AI Action Plan · Tomodachi",
    description:
      "Try Tomodachi's free AI action-plan beta for practical, reviewable next steps. No payment or checkout is required.",
    h1: "AI Action Plan",
    body: `
      <p>Tell Tomodachi what you are trying to make or fix and get a short, reviewable checklist covering what to do first, what can wait, and the quickest useful next action.</p>
      <h2>Free beta available now</h2>
      <p>Recovery planning is available from the home page, and creative advice is available inside the Studio. AI suggestions never change a project automatically.</p>
      <h2>Expanded $5 creator plan is only a direction</h2>
      <p>A one-time expanded plan is being explored, but it is not for sale. Tomodachi currently accepts no payments and has no checkout. A paid version will launch only after account entitlements, refunds, usage limits, privacy controls, and fulfillment are tested end to end.</p>
      <p>Do not include passwords, payment details, recovery codes, government IDs, or other secrets in an AI prompt. <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>.</p>`,
    jsonLd: [
      breadcrumbFor("AI Action Plan", "/ai-plan"),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        url: "https://tomodachi.pw/ai-plan",
        name: "Tomodachi AI Action Plan",
        description:
          "A free AI action-plan beta for practical, reviewable next steps.",
        inLanguage: "en",
        isPartOf: { "@id": "https://tomodachi.pw/#website" },
      },
    ],
  },
  "/support": {
    title: "Support · Tomodachi",
    description:
      "Help improve Tomodachi by testing the Studio, sharing original work, and reporting useful feedback. No payments or tips are accepted.",
    h1: "Support the workshop by using it",
    body: `
      <p>Tomodachi does not currently accept payments, tips, donations, or consultation bookings.</p>
      <p>Help by testing the Studio with a real workflow, sharing original work when community publishing opens, reporting reproducible bugs, or sending product feedback to help@tomodachi.pw.</p>
      <p>Security reports belong at security@tomodachi.pw and should never contain passwords, session cookies, or private project files.</p>`,
    jsonLd: [
      breadcrumbFor("Support", "/support"),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        url: "https://tomodachi.pw/support",
        name: "Support the Tomodachi project",
        description:
          "Help improve Tomodachi by testing the Studio, sharing original work, and reporting useful feedback.",
        inLanguage: "en",
        about: PUBLISHER_ORG,
        publisher: PUBLISHER_ORG,
      },
    ],
  },
};

// Routes that should resolve to identical SEO shells via aliasing.
const ROUTE_ALIASES: Record<string, string> = {
  "/donate": "/support",
  "/unlock": "/ai-plan",
  "/disclosure": "/about", // /affiliate-disclosure is a separate static legal page
  "": "/",
};

function isCrawler(ua: string, list: string[]): boolean {
  const lower = ua.toLowerCase();
  return list.some((bot) => lower.includes(bot.toLowerCase()));
}

interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, next } = context;
  const ua = request.headers.get("user-agent") || "";

  const url = new URL(request.url);
  const path = ROUTE_ALIASES[url.pathname] ?? url.pathname;

  // Only intercept GET. Everything else falls through.
  if (request.method !== "GET") return next();

  // Search crawlers: serve a full pre-rendered shell with real content for any
  // mapped route. Unmapped routes fall through to the SPA.
  if (isCrawler(ua, SEARCH_CRAWLERS)) {
    const shell = ROUTES[path];
    if (shell) {
      return new Response(shellFor(path, shell), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          Vary: "User-Agent",
          "X-Robots-Tag": "index, follow",
          "X-Crawler-Render": "search",
        },
      });
    }
  }

  // Social crawlers: only need OG meta on the home + key routes.
  if (isCrawler(ua, SOCIAL_CRAWLERS)) {
    const shell = ROUTES[path];
    if (shell) {
      return new Response(shellFor(path, shell), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          Vary: "User-Agent",
          "X-Robots-Tag": "index, follow",
          "X-Crawler-Render": "social",
        },
      });
    }
  }

  return next();
}
