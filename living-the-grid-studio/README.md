# Tomodachi

> A browser-first Mii pixel-art studio paired with practical breach-recovery guides for Tomodachi Life players.

[![Live site](https://img.shields.io/badge/live-tomodachi.pw-d94f4f?style=flat-square)](https://tomodachi.pw/)
[![Brave mirror](https://img.shields.io/badge/web3%20mirror-tomodachi.brave-fb542b?style=flat-square)](https://tomodachi.brave)
[![License: MIT](https://img.shields.io/badge/license-MIT-101016?style=flat-square)](./LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A1-d94f4f?style=flat-square)](https://tomodachi.pw/support)

<p align="center">
  <img src="https://tomodachi.pw/readme-banner.png" alt="Hero banner: colored pencils fanned across light gray engineering graph paper next to a cluster of hand-painted pixel-art tiles in coral red, dusty blue, peach, soft yellow, and sage green — the Paper Studio aesthetic of the Tomodachi project." width="100%">
</p>

Two things stacked on one site. The **Studio** is a browser-first pixel-art editor for Mii face masks. Import a face photo or character art, reduce the colors against the in-game Tomodachi Life: Living the Dream palette, and export a paint-by-numbers reference you can recreate on a real 3DS. The **recovery hub** is for visitors arriving from the Tomodachishare credential leak: free, calm, no-spam steps to rotate passwords and lock down accounts.

## Why this exists

The 3DS touch editor is fine for freehand sketching but brutal for anything reference-based. Recreating a face from a photo means picking colors one at a time from a tiny on-screen palette while squinting at a print-out next to the console. A desktop editor that snaps to the same 84-color palette and exports a paint-by-numbers reference is 10x faster, and works on phones too.

The recovery section came later. When the Tomodachishare leak hit, players started showing up to community channels looking for somewhere calm and free to learn what to do next. So this site does both: a real tool for a hobby, and a soft landing for people in a bad week.

## Features

**Studio** — [`/studio`](https://tomodachi.pw/studio)
- 16×16 or 32×32 grid editor that snaps to the 84-color Tomodachi Life: Living the Dream palette
- Every color labeled by row + column (R9C5, R10C1, etc.) for exact in-game matching
- Image import with a readability-preserving color-reduction optimizer
- AI sketch assistant that animates cell-by-cell as it paints
- Export a paint-by-numbers reference pack (PDF + JSON + palette sheet)

**Recovery hub** — [`/`](https://tomodachi.pw/)
- Browser-only password breach check using HIBP k-anonymity (only the first 5 chars of the SHA-1 hash ever leave the page)
- OpenRouter-backed AI recovery assistant on free-tier models (no signup)

**Guides** — [`/guides`](https://tomodachi.pw/guides)
- Long-form articles on Mii creation, gameplay basics (apartments / food / jobs / marriage), Tomodachishare recovery, QR codes + save backup

**Paid extras** (optional)
- [`/unlock`](https://tomodachi.pw/unlock) — $9 detailed recovery checklist, $49 30-minute consult
- [`/support`](https://tomodachi.pw/support) — $5 / $15 / $25 tip jar

## Tech stack

- **Frontend:** Vite, React 18, TypeScript 5, Tailwind CSS v4 (OKLCH color space), shadcn/ui, wouter
- **Edge runtime:** Cloudflare Pages Functions (TypeScript)
- **Edge cache:** Cloudflare KV (1-hour TTL on the OpenRouter model list)
- **Payments:** Stripe Checkout with HMAC-SHA256 webhook verification at the edge
- **AI:** OpenRouter with free-tier model rotation (DeepSeek V4 Flash, GPT-OSS 120B, GLM 4.5 Air, Nemotron 3 Super 120B)
- **Secrets:** Doppler → Cloudflare Pages integration
- **Analytics:** Cloudflare Web Analytics (cookieless, no PII)

## Edge pre-render for search crawlers

Most SPAs are invisible to Bing / DuckDuckGo because they don't execute JavaScript at index time. The standard fixes are prerender.io (extra runtime cost) or full SSR (extra framework cost). This project takes a third route:

```mermaid
flowchart LR
    REQ([Incoming request]) --> EDGE{Cloudflare edge<br/>functions/_middleware.ts}
    EDGE -- User-Agent matches<br/>Googlebot, Bingbot,<br/>DuckDuckBot, Applebot,<br/>Slurp, Baidu, Yandex,<br/>Mojeek, Ahrefs --> SHELL[Pre-rendered HTML shell<br/>+ per-route JSON-LD]
    EDGE -- Real browser --> SPA[React SPA<br/>index.html]
    SHELL --> CRAWL([Search index])
    SPA --> USER([User])

    classDef edge fill:#fff7e8,stroke:#d94f4f,color:#101016,stroke-width:2px
    classDef shell fill:#e8f1ff,stroke:#3b82f6,color:#101016
    classDef spa fill:#fef3e8,stroke:#f59e0b,color:#101016
    classDef terminal fill:#f5f5f5,stroke:#888,color:#101016
    class EDGE edge
    class SHELL shell
    class SPA spa
    class REQ,CRAWL,USER terminal
```

One TypeScript file at the edge UA-sniffs known search crawlers and serves route-appropriate JSON-LD: `WebApplication` on `/`, `SoftwareApplication` + `BreadcrumbList` on `/studio`, `CollectionPage` with embedded `HowTo` + `Article` on `/guides`, `FAQPage` on `/faq`, `AboutPage` + `Organization` on `/about`, `Article` on `/help`, `ItemList` of `Product` + `Offer` on `/unlock`, `WebPage` on `/support`. Real browsers continue to get the React app. No build-step prerender, no separate SSR runtime, no Next.js — just one edge function and a `ROUTES` map.

See [`functions/_middleware.ts`](./functions/_middleware.ts) for the implementation.

## Studio workflow

```mermaid
flowchart LR
    IMG[Drop image<br/>photo / character art /<br/>logo / meme] --> QUANT[Color reduction<br/>snap to 84-color<br/>Living the Dream palette]
    QUANT --> GRID[Editable grid<br/>16×16 or 32×32<br/>cell labels: R9C5, R10C1]
    GRID --> AI{Need a sketch?}
    AI -- yes --> SKETCH[AI sketch helper<br/>OpenRouter free tier<br/>cell-by-cell paint anim]
    SKETCH --> GRID
    AI -- no --> EXPORT[Reference pack export<br/>PDF + JSON + palette sheet]
    GRID --> EXPORT
    EXPORT --> COPY([Copy on 3DS])

    classDef io fill:#fff7e8,stroke:#d94f4f,color:#101016,stroke-width:2px
    classDef step fill:#f5f5f5,stroke:#666,color:#101016
    classDef ai fill:#e8f1ff,stroke:#3b82f6,color:#101016
    classDef terminal fill:#f5f5f5,stroke:#888,color:#101016
    class IMG,EXPORT io
    class QUANT,GRID step
    class AI,SKETCH ai
    class COPY terminal
```

## Quick start

```bash
pnpm install
pnpm dev          # Vite dev server on http://localhost:3000
pnpm check        # TypeScript type check
pnpm verify       # Full verification suite (LTG import, image import, templates, AI sketch, residents)
```

To run the Cloudflare Pages Functions locally:

```bash
pnpm build
pnpm wrangler pages dev dist/public --compatibility-date=2025-05-01
```

Required environment variables (set via `.env.local` for dev, via Doppler → Cloudflare Pages for prod):

| Variable | Required for | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | AI sketch + recovery assistant | Free-tier key works |
| `STRIPE_SECRET_KEY` | Paywall + tip jar | Live or test key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification | Per-endpoint secret from Stripe dashboard |
| `PUBLIC_SITE_URL` | Sitemap canonical URLs | Defaults to `https://tomodachi.pw` |
| `VITE_ADSENSE_PUBLISHER_ID` | Optional, AdSense | Only loaded after cookie consent |
| `VITE_ADSENSE_HOMEPAGE_SLOT_ID` | Optional, AdSense | Homepage slot ID |

## Project structure

```
client/                  Vite + React SPA
  src/
    pages/               Route components (Home, Studio, Unlock, Guides, FAQ, About, Help, Support, legal)
    components/
      studio/            AI panel, palette grid, import panel, etc.
      ui/                shadcn/ui primitives
    hooks/               useDocumentTitle, useStructuredData, useGridDocument
    lib/                 engine (JSON import/export, palette ops), breadcrumb, consent, stripeUrl
  public/                Static assets (sitemap.xml, og-image.png, robots.txt, _headers, manifest)
functions/               Cloudflare Pages Functions
  _middleware.ts         Search-crawler pre-render + per-route JSON-LD
  api/
    ai/[[path]].ts       OpenRouter chat + KV-cached model list
    stripe/[[path]].ts   Checkout + session verification + products
    webhooks/stripe.ts   Stripe webhook with HMAC verification
server/                  Shared TS modules imported by Functions + dev middleware
shared/                  Types shared between client + functions (ai, products, residents, const)
fixtures/                Real-world JSON fixtures for the verify scripts
scripts/                 Verification scripts run by `pnpm verify`
```

## Contributing

PRs welcome. Small focused changes get reviewed faster than large refactors.

The codebase is intentionally small and readable. The design philosophy (Paper Studio: Japanese stationery minimalism, off-white paper surface, graphite text, pale blue grid accents, warm red as the sole accent color, OKLCH color space throughout) is documented inline in [`client/src/index.css`](./client/src/index.css).

Before opening a PR:

```bash
pnpm check        # tsc --noEmit
pnpm verify       # Full verification suite
```

## Support and sponsorship

If the studio or the guides have helped, a few ways to support the project:

- **Tip jar:** [tomodachi.pw/support](https://tomodachi.pw/support) — $5 / $15 / $25 via Stripe
- **Paid products:** [tomodachi.pw/unlock](https://tomodachi.pw/unlock) — $9 recovery checklist or $49 30-min consult
- **GitHub Sponsors:** the [`Sponsor`](https://github.com/sponsors/RazonIn4K) button at the top of this repo (once GitHub Sponsors approval clears)
- **Brave Creator:** [tomodachi.brave](https://tomodachi.brave) is verified for Brave Rewards if you tip with BAT

## License

[MIT](./LICENSE). This is an unofficial fan tool. Tomodachi Life is a trademark of Nintendo Co., Ltd. — this project is not affiliated with, endorsed by, or sponsored by Nintendo.

## Acknowledgements

- The Tomodachi Life community for keeping the game alive a decade after launch
- [HIBP](https://haveibeenpwned.com/) for the k-anonymity password-breach API
- [shadcn/ui](https://ui.shadcn.com/) for the component primitives
- [OpenRouter](https://openrouter.ai/) for free-tier access to multiple LLMs without per-provider sign-up
- Every player who showed up after the Tomodachishare leak and made the recovery hub feel necessary
