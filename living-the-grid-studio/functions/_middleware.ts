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
  'facebookexternalhit',
  'Facebot',
  'facebookcatalog',
  'meta-externalagent',
  'FacebookBot',
  'Twitterbot',
  'LinkedInBot',
  'WhatsApp',
  'Slackbot',
  'TelegramBot',
  'Discordbot',
];

const SEARCH_CRAWLERS = [
  'Googlebot',
  'Bingbot',
  'BingPreview',
  'DuckDuckBot',
  'DuckDuckGo-Favicons-Bot',
  'Baiduspider',
  'YandexBot',
  'Slurp', // Yahoo
  'Sogou',
  'Applebot',
  'Mojeekbot',
  'AhrefsBot',
];

interface RouteShell {
  title: string;
  description: string;
  h1: string;
  body: string;
  jsonLd?: Record<string, unknown>;
}

const COMMON_HEAD = `
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#101016" />
  <meta name="robots" content="index,follow" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='4' fill='%23d94f4f'/%3E%3C/svg%3E" />`;

function shellFor(route: string, shell: RouteShell): string {
  const url = `https://tomodachi.pw${route}`;
  const jsonLdTag = shell.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(shell.jsonLd)}</script>`
    : '';
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
  <meta property="og:image" content="https://tomodachi.pw/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${shell.title}" />
  <meta name="twitter:description" content="${shell.description}" />
  <meta name="twitter:image" content="https://tomodachi.pw/og-image.png" />
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
      <a href="/unlock">Unlock</a> ·
      <a href="/support">Support</a>
    </nav>
  </footer>
</body>
</html>`;
}

const ROUTES: Record<string, RouteShell> = {
  '/': {
    title: 'Tomodachi · Mii Studio & Recovery Guides',
    description:
      'A browser-first Mii pixel-art studio paired with practical Tomodachishare breach-recovery guides for Tomodachi Life players.',
    h1: 'Tomodachi · Mii Studio & Recovery Guides',
    body: `
      <p>Tomodachi is two things stacked on one site. The <a href="/studio">Studio</a> is a browser-first pixel-art editor for Mii face masks — import a face photo or character art, reduce the colors against the in-game Tomodachi Life: Living the Dream palette, and export a paint-by-numbers reference you can recreate on a real 3DS.</p>
      <p>The <a href="/guides">guides</a> and the free <a href="/help">recovery help</a> page are for visitors arriving from the Tomodachishare credential leak — calm, free, no-spam steps to rotate passwords and lock down accounts.</p>
      <h2>What's inside</h2>
      <ul>
        <li><a href="/studio">Studio</a> — import → reduce colors → export reference pack.</li>
        <li><a href="/">Home recovery hub</a> — browser-only k-anonymity password breach check + AI recovery assistant.</li>
        <li><a href="/guides">Long-form guides</a> — Mii creation, Tomodachi Life gameplay basics, post-breach recovery, QR codes + save backup.</li>
        <li><a href="/faq">FAQ</a> — common questions answered.</li>
        <li><a href="/unlock">Unlock</a> — paid $9 recovery checklist + $49 30-min consult.</li>
        <li><a href="/support">Support</a> — $5 / $15 / $25 Stripe tips.</li>
      </ul>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Tomodachi',
      url: 'https://tomodachi.pw/',
      description:
        'Browser-first Mii pixel-art studio paired with practical breach-recovery guides for Tomodachi Life players.',
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      image: 'https://tomodachi.pw/og-image.png',
    },
  },
  '/studio': {
    title: 'Studio · Tomodachi',
    description:
      'Browser-first Mii pixel-art editor. Import a face photo, reduce colors to the in-game palette, export a paint-by-numbers reference pack.',
    h1: 'Tomodachi Studio',
    body: `
      <p>A browser-first pixel-art editor for designing custom Mii face masks square-by-square. Import a face photo, character art, or JSON file; reduce noise against the 84-color Tomodachi Life: Living the Dream palette; export a paint-by-numbers reference pack (PDF + palette sheet + JSON).</p>
      <h2>Features</h2>
      <ul>
        <li>Import any image or LTG JSON file.</li>
        <li>84-color in-game palette labeled by row and column for exact matching.</li>
        <li>Color-reduction optimizer that preserves facial readability.</li>
        <li>AI assistant for sketch drafts (OpenRouter, free tier).</li>
        <li>Reference pack export — PDF + JSON + palette sheet.</li>
      </ul>
      <p>See the <a href="/guides">guides</a> for step-by-step walkthroughs and the <a href="/faq">FAQ</a> for common questions.</p>`,
  },
  '/guides': {
    title: 'Guides · Tomodachi',
    description:
      'Free walkthroughs on Mii creation, Tomodachi Life gameplay basics, Tomodachishare breach recovery, and QR codes + save backup.',
    h1: 'Guides',
    body: `
      <p>Practical walkthroughs for Tomodachi Life players turning faces and characters into Mii repaint plans, and visitors arriving from the Tomodachishare breach notice.</p>
      <h2>Tomodachi Life player guides</h2>
      <h3 id="mii-creation"><a href="/guides#mii-creation">How to make custom Miis for Tomodachi Life</a></h3>
      <p>Mii Maker tricks, face presets, hair, eyes, eyebrows. Start with the Look-Alike Mii camera tool, dial in eyes and mouth before hair, save Mii Maker variants before importing to Tomodachi Life.</p>
      <h3 id="gameplay-basics"><a href="/guides#gameplay-basics">Tomodachi Life gameplay basics</a></h3>
      <p>Apartments, food, jobs, friendship, marriage. The four daily checks, why neutral food reactions waste money, how crush gating actually works, and the mid-game-slump reset moves.</p>
      <h3 id="breach-recovery"><a href="/guides#breach-recovery">After the Tomodachishare breach</a></h3>
      <p>Step-by-step recovery: change your email password first, turn on 2FA, work through financial / cloud / identity / social accounts in priority order. 30-day monitoring rhythm.</p>
      <h3 id="qr-and-backup"><a href="/guides#qr-and-backup">QR codes, Mii sharing, save backup</a></h3>
      <p>How to export Miis as QR codes from 3DS or Wii U, scan QR codes from the community, and back up your Tomodachi Life save before the hardware dies.</p>
      <h2>Recovery + studio teasers</h2>
      <ul>
        <li><a href="/help">Tomodachi breach recovery checklist</a> — free 24-hour actions.</li>
        <li><a href="/studio">Turn a photo into a repaintable Mii face mask</a>.</li>
        <li><a href="/studio">Reduce colors for repaintable pixel art</a>.</li>
        <li><a href="/">Password reuse cleanup after a community breach</a>.</li>
      </ul>`,
  },
  '/faq': {
    title: 'FAQ · Tomodachi',
    description:
      'Common questions about Tomodachi Life in 2026, the Tomodachishare breach recovery process, the pixel-art Mii face mask studio, and how this site is funded.',
    h1: 'Frequently asked questions',
    body: `
      <h2>Tomodachi Life as a game</h2>
      <h3>Is Tomodachi Life still playable in 2026?</h3>
      <p>Yes. Tomodachi Life: Living the Dream still runs on any working 3DS or 2DS. The eShop is closed so you can't buy it digitally anymore, but cartridges and previously-downloaded copies work fine.</p>
      <h3>Can I make my Mii look like a real person?</h3>
      <p>Yes. The 3DS Mii Maker has a Look-Alike Mii tool that generates a rough Mii from a front-camera photo. The <a href="/guides#mii-creation">Mii creation guide</a> walks through the fine-tuning.</p>
      <h3>What's a Mii face mask?</h3>
      <p>A wearable in-game item that lets a Mii put on a custom face painted square-by-square. The <a href="/studio">Studio</a> converts a photo or character image into a paint-by-numbers reference.</p>
      <h2>The Tomodachishare breach</h2>
      <h3>What was the Tomodachishare breach?</h3>
      <p>A credential dump from the Tomodachishare community site exposed email addresses and password hashes. Reused passwords elsewhere are now at elevated risk.</p>
      <h3>Was my password leaked?</h3>
      <p>Use the browser-only password breach check on the <a href="/">home page</a>. It sends only the first 5 hex chars of a SHA-1 hash to the Have I Been Pwned API and compares locally; your full password never leaves the page.</p>
      <h3>What should I do first?</h3>
      <p>Change your email password before anything else (because email controls every other password reset). Then turn on 2FA on that email, then rotate other accounts. <a href="/help">Free 24-hour action plan here</a>.</p>
      <h2>The site</h2>
      <h3>Is the Studio free?</h3>
      <p>Yes. Import, reduce, export, password breach check, AI assistant — all free. Optional paid extras on <a href="/unlock">/unlock</a> and tips on <a href="/support">/support</a>.</p>
      <h3>Do you store my photos or my password?</h3>
      <p>No. The Studio runs entirely in your browser; uploads never leave the page. The password check is k-anonymity, so only a 5-character SHA-1 prefix is sent.</p>`,
  },
  '/about': {
    title: 'About · Tomodachi',
    description:
      'Why Tomodachi exists, what is in it, who is behind it, and how to reach the project for press or partnership.',
    h1: 'About Tomodachi',
    body: `
      <p>Tomodachi is a Mii pixel-art studio paired with practical breach recovery. The <a href="/studio">Studio</a> is a browser-first pixel-art editor for Mii face masks; the <a href="/guides">Guides</a> and <a href="/help">recovery help</a> page serve visitors arriving from the Tomodachishare breach notice.</p>
      <h2>Free first, sponsor-supported</h2>
      <p>The editor, the password check, the AI assistant, and every guide stay free. Optional paid extras live on <a href="/unlock">/unlock</a>; tips on <a href="/support">/support</a>.</p>
      <h2>Privacy on principle</h2>
      <p>Photos never leave the browser. The password check uses k-anonymity against Have I Been Pwned. No accounts, no tracking until you opt in via the cookie banner.</p>
      <h2>How to reach the project</h2>
      <ul>
        <li>Source code &amp; issues: <a href="https://github.com/RazonIn4K/Mii-pixelart">github.com/RazonIn4K/Mii-pixelart</a></li>
        <li>Sponsorship: Stripe-backed tips and a paid recovery checklist via <a href="/support">/support</a> and <a href="/unlock">/unlock</a>.</li>
        <li>Brave Creators: tomodachi.pw is a verified Brave Creator.</li>
      </ul>`,
  },
  '/help': {
    title: 'Help · Tomodachi',
    description:
      'Free 24-hour action plan and ongoing checklist for anyone affected by the Tomodachishare breach.',
    h1: 'Tomodachi incident support',
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
      <p>For a longer printable checklist + 30-day monitoring plan, the paid <a href="/unlock">recovery checklist ($9)</a> covers the same flow in a printable PDF + Markdown.</p>`,
  },
  '/unlock': {
    title: 'Unlock · Tomodachi',
    description:
      'Paid recovery checklist ($9) and 30-minute one-on-one consult ($49) for the Tomodachishare breach.',
    h1: 'Unlock',
    body: `
      <p>Free guidance stays free. These are deeper deliverables for people who want a printable written plan or a real human to walk it through with them.</p>
      <h2>Breach Recovery Checklist — $9</h2>
      <p>A printable 12-step recovery flow for the Tomodachishare breach. PDF + Markdown formats. Sample email templates for contacting services that reused your password. Lifetime updates as the breach disclosure evolves.</p>
      <h2>30-min Recovery Consult — $49</h2>
      <p>One scheduled call with a security-aware operator. We walk through your specific exposure and leave you with a written action plan. Google Meet link delivered after checkout. Written follow-up summary within 24 hours.</p>
      <p>Not legal or law-enforcement advice. For active criminal incidents contact the appropriate authorities. Payments are processed by Stripe. <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>.</p>`,
  },
  '/support': {
    title: 'Support · Tomodachi',
    description:
      'Tip jar for the Tomodachi project. Drop $5, $15, or $25 to fund the next free guide.',
    h1: 'Help keep the tools free',
    body: `
      <p>The studio, the AI assistant, the breach recovery guides, and the password check are all free to use. Tips help cover hosting, API credits, and time to write the next free guide.</p>
      <p>Three fixed tip amounts via Stripe Checkout: $5, $15, $25.</p>
      <p>Not a registered nonprofit. Tips are not tax-deductible. <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>.</p>
      <p>Brave Rewards: tomodachi.pw is a verified Brave Creator. Brave browser users see the Rewards icon in the address bar.</p>`,
  },
};

// Routes that should resolve to identical SEO shells via aliasing.
const ROUTE_ALIASES: Record<string, string> = {
  '/donate': '/support',
  '/disclosure': '/about', // /affiliate-disclosure is a separate static legal page
  '': '/',
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
  const ua = request.headers.get('user-agent') || '';

  const url = new URL(request.url);
  const path = ROUTE_ALIASES[url.pathname] ?? url.pathname;

  // Only intercept GET. Everything else falls through.
  if (request.method !== 'GET') return next();

  // Search crawlers: serve a full pre-rendered shell with real content for any
  // mapped route. Unmapped routes fall through to the SPA.
  if (isCrawler(ua, SEARCH_CRAWLERS)) {
    const shell = ROUTES[path];
    if (shell) {
      return new Response(shellFor(path, shell), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'Vary': 'User-Agent',
          'X-Robots-Tag': 'index, follow',
          'X-Crawler-Render': 'search',
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
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'Vary': 'User-Agent',
          'X-Robots-Tag': 'index, follow',
          'X-Crawler-Render': 'social',
        },
      });
    }
  }

  return next();
}
