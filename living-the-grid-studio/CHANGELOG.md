# Changelog

All notable user-visible changes to Tomodachi are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project loosely uses semantic versioning for public releases. Date-only entries under "Unreleased" are operational / SEO / infrastructure changes that ship continuously to [tomodachi.pw](https://tomodachi.pw/) via Cloudflare Pages.

## Unreleased

### 2026-05-20

- **Reference-pack ZIP:** `Export Reference Pack` now downloads a single ZIP bundle instead of firing separate downloads. The archive contains `project.json`, `guide-labeled.png`, `guide-clean.png`, `palette-sheet.png`, `paint-order.csv`, `source-notes.txt`, `manifest.json`, and `reference.html`.
- **Documentation atlas:** added [`PROJECT_STACK_AND_IMPLEMENTATION.md`](./PROJECT_STACK_AND_IMPLEMENTATION.md), a detailed code-facing implementation map covering the stack, data model, studio flow, image import, LTG JSON support, palette engine, optimizer, AI/OpenRouter path, exports, Cloudflare/security, Stripe, verification scripts, fixtures, and known gaps.
- **Obsidian project atlas:** mirrored the project into the professional active-project vault under `1200-PROFESSIONAL/Upwork/Active Projects/Tomodachi_Studio/` with `Project_Implementation_Atlas.md` and `00-Command-Center.md`.
- **Docs drift cleanup:** updated README/AI context wording so exports are described as JSON + PNG guide + clean PNG + palette sheet PNG + HTML/ZIP reference output, not PDF; updated stack wording to React 19 and current studio import/edit capabilities.

### 2026-05-17

- **Public-repo prep:** added MIT [`LICENSE`](./LICENSE), [`SECURITY.md`](./SECURITY.md) (responsible-disclosure policy), and a comprehensive [`.gitignore`](./.gitignore) covering env files, build output, dev session captures, and IDE noise. Rewrote [`README.md`](./README.md) with an architecture diagram, badges, and the edge-prerender engineering story.
- **Pre-public security sweep:** audited `functions/api/*` (AI proxy, Stripe checkout / session, Stripe webhook). Stripe webhook verified to use HMAC-SHA256 with constant-time compare, 5-min replay window, KV idempotency. `server/*` modules return structured `ApiResult` objects rather than throwing — error-message leakage through 500 handlers is bounded.
- **Legal page brand correction:** Privacy, Terms, and Disclosure pages updated to reference "Tomodachi" instead of the legacy "Living The Grid Studio" name. User-facing brand mentions now consistent across all routes.
- **Dead code identified:** `client/src/components/Map.tsx` (Google Maps wrapper, zero imports) and `client/src/components/ManusDialog.tsx` (legacy branding, zero imports) flagged for deletion.
- **Distribution drafts:** added `docs/distribution/` with Reddit, Hacker News Show, and X thread drafts plus a launch checklist.

### 2026-05-16

- **Edge pre-render for search crawlers:** Cloudflare Pages middleware (`functions/_middleware.ts`) now serves pre-rendered HTML shells to 9 known search-crawler User-Agents (Googlebot, Bingbot, DuckDuckBot, Applebot, etc.) while real browsers continue to receive the React SPA. Each shell embeds route-appropriate JSON-LD: WebApplication on `/`, SoftwareApplication + BreadcrumbList on `/studio`, CollectionPage + HowTo + Article on `/guides`, FAQPage on `/faq`, AboutPage + Organization on `/about`, Article on `/help`, ItemList + Product + Offer on `/unlock`, WebPage on `/support`. Total 15 JSON-LD blocks, ~9 KB, all validated client-side and live-validated post-deploy.
- **Sitemap:** added `lastmod` to every entry in `sitemap.xml` and `sitemap-images.xml`. Total 12 URLs.
- **CSP / beacon fix:** added `static.cloudflareinsights.com` to `script-src` and `cloudflareinsights.com` + `*.cloudflareinsights.com` to `connect-src` so the Cloudflare Web Analytics beacon no longer trips CSP.

### 2026-05-15

- **Studio AI sketch fix:** OpenRouter sketch endpoint reliability — `max_tokens` raised to 16000 (was 3000, which truncated 32×32 grids), temperature lowered to 0.2, system prompt updated with explicit "do NOT fill the entire grid with a single color ID" clause plus a multi-color example. Added `trySalvagePartialSketch()` helper that depth-tracks braces to recover complete rows from truncated JSON.
- **Studio paint animation:** `applySketch()` rewritten to paint cell-by-cell via `requestAnimationFrame`. ~60 ticks over ~1 second, with the Apply button showing "Painting…" and disabled during animation.

### 2026-05-14

- **Visual polish:** redesigned `/404` page to match Paper Studio brand with helpful suggestions and runtime `noindex` meta injection.
- **Accessibility:** added skip-to-main-content link and proper PWA manifest with maskable 192/512 icons.
- **About page:** new `/about` route with Organization schema and `sameAs` links to GitHub + the Brave Creator-verified mirror.

### 2026-05-13

- **FAQ page:** new `/faq` route with 8 questions answered + FAQPage JSON-LD. Linked from the footer and sitemap.
- **Breadcrumbs:** every non-home page now ships BreadcrumbList structured data via the shared `breadcrumbFor()` helper.

### 2026-05-12

- **Structured data for guides:** HowTo and Article JSON-LD added to long-form guide content under `/guides`.

### 2026-05-11

- **CSP tightening:** Content Security Policy refined per Google CSP Evaluator. Trusted Types deployed in report-only mode.
- **Dev tooling removed from production HTML:** the Manus debug runtime (~366 KB) is now dev-only via `NODE_ENV` gating in `vite.config.ts`. Production bundles only ship the React app + the Cloudflare Web Analytics beacon.

## 0.1.0 — 2026-05-04 (first production deploy)

Initial production release of tomodachi.pw on Cloudflare Pages.

- Studio: import → quantize to 84-color Tomodachi Life palette → grid editor → JSON/PNG/palette reference export
- AI sketch assistant via OpenRouter (free-tier model rotation)
- Recovery hub: browser-only HIBP k-anonymity password breach check + recovery-assistant chat
- Stripe-backed paywall ($9 recovery checklist, $49 30-min consult)
- Stripe-backed tip jar ($5 / $15 / $25)
- Cloudflare KV cache for OpenRouter model list (1-hour TTL)
- Cloudflare Web Analytics with cookie-consent gating
- Cookie banner with granular consent (necessary + analytics + advertising)
- Legal pages: Privacy, Terms, Cookies, Affiliate Disclosure
- Footer + sitemap + robots.txt

---

For the full audit trail of every operational pass behind each line above, see the conversation history with the maintainer. For security-disclosure history (once any qualifying report has been published), see [`SECURITY.md`](./SECURITY.md).
