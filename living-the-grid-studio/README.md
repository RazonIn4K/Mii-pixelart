# Tomodachi

> A browser-first Mii pixel-art studio paired with practical breach-recovery guides for Tomodachi Life players.

[![Live site](https://img.shields.io/badge/live-tomodachi.pw-d94f4f?style=flat-square)](https://tomodachi.pw/)
[![Brave mirror](https://img.shields.io/badge/web3%20mirror-tomodachi.brave-fb542b?style=flat-square)](https://tomodachi.brave)
[![License: MIT](https://img.shields.io/badge/license-MIT-101016?style=flat-square)](./LICENSE)
[![Support](https://img.shields.io/badge/support-%E2%99%A1-d94f4f?style=flat-square)](https://tomodachi.pw/support)

<p align="center">
  <img src="https://tomodachi.pw/readme-banner.png" alt="Hero banner: colored pencils fanned across light gray engineering graph paper next to a cluster of hand-painted pixel-art tiles in coral red, dusty blue, peach, soft yellow, and sage green — the Paper Studio aesthetic of the Tomodachi project." width="100%">
</p>

> **Deployment status (2026-07-30):** GitHub `main` is exact source
> `0e2da5ab571b58c4f407125b9f912b8febe50ece` (PR #10). Tomodachi Studio CI
> passed on that SHA. Staging still runs the prior exact head
> `6fab02622996b2aafac16f221e0e78aeb4867458` as deployment
> `e9059345-9504-4588-9e2b-cffd77a20357` until a separately approved
> exact-new-head deploy is completed. Production [`tomodachi.pw`](https://tomodachi.pw/)
> remains on Cloudflare Pages; the checked-in production Worker config names
> writable community and AI image generation as the target state but does not
> authorize skipping the read-only cutover in
> [production-readiness plan](docs/production-readiness-plan.md) gate P11.
> The active staging-exit lane is: disable Cloudflare automatic browser RUM,
> deploy `0e2da5a` to staging, refresh P1–P3 evidence, complete P4–P5, then
> proceed through P9–P13.

Two things stacked on one site. The **Studio** is a browser-first pixel-art editor for planning Mii-inspired face art. Import a face photo or character art, reduce the colors against the Studio's 84-color working palette, and export a paint-by-numbers Copy Guide for manual recreation in a game's drawing tools. It does not transfer game files or connect to a Nintendo title. The **recovery hub** is for visitors arriving from the Tomodachishare credential leak: free, calm, no-spam steps to rotate passwords and lock down accounts.

## Why this exists

Freeform console editors are fine for sketching but difficult for reference-based work. Recreating a face from a photo means choosing colors manually while comparing the source on another screen. A browser editor that reduces the image to a consistent 84-color working palette and exports a paint-by-numbers Copy Guide makes that planning easier, and it works on phones too. The palette and grid dimensions are Studio conventions rather than verified proprietary game data.

The recovery section came later. When the Tomodachishare leak hit, players started showing up to community channels looking for somewhere calm and free to learn what to do next. So this site does both: a real tool for a hobby, and a soft landing for people in a bad week.

## Features

**Studio** — [`/studio`](https://tomodachi.pw/studio)

- Canonical 256×256 game-reference surface plus explicitly labeled 8–256 custom/legacy imports
- Observed smooth 1/3/7/13/19/27px footprints and snapped 4/8/16/32px planning stamps, with exact cursor previews
- Independent cell, snapped-stamp, 2×2/4×4/8×8 section, and center-axis guides without a doubled grid
- Browser-local source board with Side, Under, Over, and Split comparison modes
- Every color labeled by row + column (R9C5, R10C1, etc.) for consistent manual matching in the Copy Guide
- Image import with preview-before-commit, same-file reprocessing, subject focus, background flattening, brightness/contrast/saturation, and readability-preserving color reduction
- Manual pencil, eraser, eyedropper, fill, inspect, undo/redo, and detail-upscale tools
- Interactive read-only Copy Guide with exact one-based row runs, highlighted cells, browser-local progress, and a direct reference-image entry point
- Account-gated AI sketch assistant with local per-user chat sessions, explicit grid-snapshot consent, validation, visual review, and one-step undoable apply
- Export individual repaint assets or a ZIP reference pack with JSON, labeled PNG guide, clean PNG, palette sheet PNG, paint-order CSV, notes, manifest, and HTML reference

**Recovery hub** — [`/`](https://tomodachi.pw/)

- Browser-only password breach check using HIBP k-anonymity (only the first 5 chars of the SHA-1 hash ever leave the page)
- OpenRouter-backed AI recovery assistant on curated free-tier models after Google sign-in

**Guides** — [`/guides`](https://tomodachi.pw/guides)

- Long-form articles on Mii creation, clearly labeled legacy 3DS daily-play basics, Tomodachishare recovery, QR codes + save backup

**Island Workshop community** — opt-in only; single-account writable-staging
acceptance is complete, while cross-user acceptance remains gated and the
community is not enabled on production

- Google OIDC accounts with generated avatars and private cloud projects
- Explicit review before public or unlisted publishing; authentication never publishes work
- Discovery, search, profiles, likes, comments, follows, reports, and role-gated moderation
- Anonymous editing plus JSON, PNG, CSV, HTML, and ZIP exports remain available without an account

**AI Action Plan** — [`/ai-plan`](https://tomodachi.pw/ai-plan)

- The free beta turns a visitor's situation into a practical next-step plan.
- A possible one-time $5 creator plan is product direction only. It is not for sale and will not launch until account entitlements, fulfillment, refunds, usage limits, privacy disclosures, and acceptance tests exist.
- [`/support`](https://tomodachi.pw/support) lists no-payment ways to test the Studio, share creations, report bugs, and give feedback.

## Tech stack

- **Frontend:** Vite, React 19, TypeScript 5, Tailwind CSS v4 (OKLCH color space), shadcn/ui/Radix primitives, wouter
- **Target/staging edge runtime:** One Cloudflare Worker with Static Assets, built through the Cloudflare Vite plugin
- **Current production runtime:** Cloudflare Pages, retained as the rollback surface through the approved Worker soak
- **Community data:** D1 for relational state and FTS5; private R2 for immutable project revisions and generated media
- **Edge cache:** Cloudflare KV (1-hour TTL on the OpenRouter model list)
- **Authentication:** Google authorization-code OIDC, encrypted transaction cookies, and hashed opaque sessions
- **Payments:** Retired. Legacy checkout and webhook paths return provider-free `410 Gone` tombstones so stale clients cannot fall through to the SPA.
- **AI:** OpenRouter with capability-checked free-tier rotation (Gemma 4 vision, GPT-OSS 120B, Nemotron 3 Super 120B)
- **Secrets:** Environment-scoped Wrangler secrets, optionally sourced from Doppler after deployment approval
- **Analytics:** Cloudflare Web Analytics (cookieless, no PII)

For the detailed implementation atlas, see [`PROJECT_STACK_AND_IMPLEMENTATION.md`](./PROJECT_STACK_AND_IMPLEMENTATION.md).

## Edge pre-render for search crawlers

Most SPAs are invisible to Bing / DuckDuckGo because they don't execute JavaScript at index time. The standard fixes are prerender.io (extra runtime cost) or full SSR (extra framework cost). This project takes a third route:

```mermaid
flowchart LR
    REQ([Incoming request]) --> EDGE{Cloudflare Worker<br/>worker/documents.ts}
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

On the target Worker, known search crawlers receive route-appropriate JSON-LD
for legacy routes plus safe canonical/Open Graph documents for public profiles
and creations. Private account pages and unlisted work receive `noindex`. Real
browsers receive the React app through Static Assets with SPA fallback; there
is no separate SSR runtime. Until cutover, production Pages continues to use
the retained `functions/_middleware.ts` compatibility path.

See [`worker/documents.ts`](./worker/documents.ts) for the implementation.

## Studio workflow

```mermaid
flowchart LR
    IMG[Drop image<br/>photo / character art /<br/>logo / meme] --> FRAME[Crop + frame source<br/>face / head / full image]
    FRAME --> QUANT[Color reduction<br/>Studio 84-color<br/>working palette]
    QUANT --> PREVIEW[Preview before commit<br/>adjust same source image<br/>without re-uploading]
    PREVIEW --> GRID[Editable 256×256 reference surface<br/>optional custom/legacy import<br/>cell labels: R9C5, R10C1]
    GRID --> AI{Need a sketch?}
    AI -- yes --> SKETCH[AI sketch helper<br/>vision-capability gate<br/>review then apply once]
    SKETCH --> GRID
    AI -- no --> EXPORT[Reference export<br/>ZIP pack or individual assets<br/>JSON + guide PNGs<br/>palette sheet + HTML]
    GRID --> EXPORT
    EXPORT --> COPY([Recreate manually<br/>with Copy Guide])

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
pnpm test:worker  # Worker + local D1/R2 integration and security tests
pnpm test:e2e     # Browser routes at all required responsive widths
```

To run the unified Cloudflare Worker locally, apply the forward-only D1
migrations once and start Vite. To validate the deployable Worker bundle without
contacting Cloudflare:

```bash
pnpm db:migrate:local
pnpm dev
pnpm worker:dry-run
```

Worker secrets use an untracked `.dev.vars` locally and Cloudflare secrets after
an explicit deployment approval. Vite-only `VITE_*` values may use `.env.local`:

| Variable                        | Required for                   | Notes                                               |
| ------------------------------- | ------------------------------ | --------------------------------------------------- |
| `GOOGLE_CLIENT_ID`              | Google sign-in                 | Separate localhost, staging, and production clients |
| `GOOGLE_CLIENT_SECRET`          | Google sign-in                 | Secret; never expose to Vite                        |
| `OIDC_COOKIE_KEY`               | OAuth transaction cookie       | 32 random bytes                                     |
| `SESSION_PEPPER`                | Session-token hashing          | Independent random secret                           |
| `PSEUDONYM_KEY`                 | Privacy-safe abuse identifiers | Independent HMAC secret                             |
| `OPENROUTER_API_KEY`            | AI sketch + recovery assistant | Free-tier key works                                 |
| `PUBLIC_SITE_URL`               | Sitemap canonical URLs         | Defaults to `https://tomodachi.pw`                  |
| `VITE_ADSENSE_PUBLISHER_ID`     | Optional, AdSense              | Only loaded after cookie consent                    |
| `VITE_ADSENSE_HOMEPAGE_SLOT_ID` | Optional, AdSense              | Homepage slot ID                                    |

## Project structure

```
client/                  Vite + React SPA
  src/
    pages/               Route components (Home, Studio, AI Plan, Guides, FAQ, About, Help, Support, legal)
    components/
      studio/            AI panel, palette grid, import panel, etc.
      ui/                shadcn/ui primitives
    hooks/               useDocumentTitle, useStructuredData, useGridDocument
    lib/                 engine (JSON import/export, palette ops), breadcrumb, consent
  public/                Static assets (original WebP artwork, community social card, PWA icons, sitemap, robots, headers)
worker/                  Unified staging/target Worker (API, auth, documents, jobs)
migrations/              Forward-only D1 migrations
shared/                  Shared validation and legacy contracts
functions/               Current production Pages and retained rollback compatibility
  api/
    ai/[[path]].ts       KV-cached model list; chat fails closed without Worker auth/rate limits
    stripe/[[path]].ts   Provider-free 410 tombstone for retired payment clients
    webhooks/stripe.ts   Provider-free 410 tombstone for retired webhook deliveries
server/                  Portable OpenRouter helper shared by legacy parity code and the Worker
fixtures/                Real-world JSON fixtures for the verify scripts
scripts/                 Verification scripts run by `pnpm verify`
```

Visual artwork, deterministic avatars, and Cloudflare media boundaries are documented in [`docs/visual-assets.md`](docs/visual-assets.md).

## Contributing

PRs welcome. Small focused changes get reviewed faster than large refactors.

The codebase is intentionally small and readable. The design philosophy (Paper Studio: Japanese stationery minimalism, off-white paper surface, graphite text, pale blue grid accents, warm red as the sole accent color, OKLCH color space throughout) is documented inline in [`client/src/index.css`](./client/src/index.css).

Before opening a PR:

```bash
pnpm check        # tsc --noEmit
pnpm verify       # Full verification suite
```

## Support and sponsorship

If the studio or the guides have helped, a few no-payment ways to support the project:

- Test a Studio workflow and report anything confusing through [GitHub issues](https://github.com/RazonIn4K/Mii-pixelart/issues).
- Share a creation or compare a Copy Guide with the in-game drawing tools.
- Send product and accessibility feedback through [tomodachi.pw/support](https://tomodachi.pw/support).

Payments are not accepted. The free AI Action Plan beta lives at
[tomodachi.pw/ai-plan](https://tomodachi.pw/ai-plan); a possible one-time $5
creator plan remains gated product direction and is not for sale.

## License

[MIT](./LICENSE). This is an unofficial fan tool. Tomodachi Life is a trademark of Nintendo Co., Ltd. — this project is not affiliated with, endorsed by, or sponsored by Nintendo.

## Acknowledgements

- The Tomodachi Life community for keeping the game alive a decade after launch
- [HIBP](https://haveibeenpwned.com/) for the k-anonymity password-breach API
- [shadcn/ui](https://ui.shadcn.com/) for the component primitives
- [OpenRouter](https://openrouter.ai/) for free-tier access to multiple LLMs without per-provider sign-up
- Every player who showed up after the Tomodachishare leak and made the recovery hub feel necessary
