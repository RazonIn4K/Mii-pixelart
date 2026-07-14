# Changelog

All notable user-visible changes to Tomodachi are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project loosely uses semantic versioning for public releases. Date-only entries under "Unreleased" are operational / SEO / infrastructure changes prepared for the Cloudflare release pipeline serving [tomodachi.pw](https://tomodachi.pw/).

## Unreleased

### 2026-07-14

- **AI sketch reliability follow-up:** replaced the abbreviated five-row
  example that contradicted the 16×16 AI schema with a complete,
  validator-approved mushroom grid and an explicit non-empty-cell requirement.
  Text-only sketch creation now gets at most one validator-guided correction
  inside the original 90-second deadline without replaying raw model output;
  advice, canvas refinements, provider errors, and timeouts never retry. The
  hostile-output validator and strict no-data provider policy remain unchanged.
  A protected provider probe exercised the correction and returned a validated
  16×16 sketch after the first stochastic response failed validation. The
  exact writable-staging result is recorded in
  [`docs/release-evidence/2026-07-14-writable-staging-profile-ai-061cef1.md`](./docs/release-evidence/2026-07-14-writable-staging-profile-ai-061cef1.md).
- **Writable-staging account acceptance candidate:** exposed the fail-closed
  community-write capability through the session contract, added truthful
  read-only profile/setup affordances, made phone sign-in visible without
  opening navigation, and clarified incomplete-profile account actions. The
  staging candidate enables community mutations for controlled authenticated
  acceptance; production mutations and consult sales remain disabled. Local
  Worker, contract, release-preflight, accessibility, responsive, full browser,
  build, bundle, audit, and secret-diff checks pass. Hosted authenticated
  acceptance remains required before this candidate is considered accepted.
- **Final-head Worker staging acceptance:** deployed and accepted exact source
  `520d0f287d390ba14b0fef179a6394893a5ab92d` on the isolated staging Worker with
  community mutations and consult sales disabled. Exact-source type, preflight,
  Worker, schema, packaging, bundle-budget, API/security/crawler,
  accessibility, responsive, Studio-input, D1 zero-write, production-isolation,
  and mobile performance gates passed. The completion record is
  [`docs/release-evidence/2026-07-14-staging-gate-final-head-520d0f28.md`](./docs/release-evidence/2026-07-14-staging-gate-final-head-520d0f28.md).
  Production remains on Pages; writable staging, cross-user acceptance, merge,
  cutover, rollback drill, and soak remain separately gated.
- **Studio count and ARIA follow-up:** corrected singular color and
  cell labels across the Studio and exports, preserved literal spacing in the
  canvas coordinate readout, moved slider labels to the actual slider thumbs,
  and gave named avatar and quick-color collections supported group semantics.
  New unit, Axe incomplete-finding, slider-name, stroke/coordinate, and direct
  Chromium 200 percent page-scale regressions pass locally and on the accepted
  final-head staging source above.
- **Earlier read-only staging closeout:** deployed and accepted exact source
  `4d905038d755cf4ffd0860bee02037f647ddfc0a` on the isolated staging Worker with
  community mutations and consult sales disabled. The guarded 571-assertion
  API/security/crawler run, 20-scenario cross-engine browser matrix, focused
  CSP/font checks, zero-write D1 comparison, and retained rollback evidence are
  recorded in
  [`docs/release-evidence/2026-07-14-staging-gate-3a-follow-up.md`](./docs/release-evidence/2026-07-14-staging-gate-3a-follow-up.md).
  Production, DNS, OAuth settings, migrations, secrets, roles, and application
  data were unchanged. This remains historical evidence for that exact source;
  the final-head record above is authoritative for the active staging Worker.

### 2026-07-13

- **Read-only staging evidence and acceptance fixes:** deployed the approved
  immutable staging candidate with both community mutations and consult sales
  disabled, then recorded the guarded release, 594-check API/security matrix,
  seven-width Chromium plus mobile WebKit functional audit, unchanged D1
  aggregates, rollback version, and exact mobile performance trace in
  [`docs/release-evidence/2026-07-13-staging-gate-3a-replacement.md`](./docs/release-evidence/2026-07-13-staging-gate-3a-replacement.md).
  The hosted audit exposed low-contrast secondary text, a blocked Google Fonts
  preconnect, an orphaned Trusted Types report-only policy, and staging crawler
  files that advertised production URLs. A later exact-SHA follow-up fixed and
  accepted those findings with AA-safe semantic inks, exact-origin CSP rules,
  an agent-safe `llms.txt`, and staging-only noindex crawler responses. This
  entry remains the historical record for the earlier deployed source; the
  2026-07-14 record above is authoritative for the accepted follow-up.
- **Fast, accessible mobile navigation:** replaced the header's scroll-locking
  drawer with a native modal dialog that keeps the background inert, traps
  keyboard focus, closes by Escape, backdrop, navigation, or desktop resize,
  and returns focus to a visible header control. Automated coverage now checks
  focus, dismissal, navigation, scroll locking, responsive closure, and an
  open-dialog Axe scan at 360- and 320-pixel Chromium viewports plus a
  390-pixel mobile WebKit viewport. Under the agreed 390-pixel Slow 4G / 4x CPU
  lab profile, the exact local production candidate improved the menu
  interaction from 293 ms to 83 ms INP while the homepage measured 0.52 s LCP
  and 0.00 CLS.
- **Account polish and legal-contact correction:** added safe owner-requested
  avatar regeneration without image uploads or client-selected seeds, made
  concurrent avatar/profile/setup responses mutation-scoped, made session
  loading failures recoverable, prevented anonymous report requests, corrected
  accessible control names and password-check keyboard submission, and kept
  canonical, social, and indexing metadata synchronized during SPA navigation.
  Delayed comments, likes, comment edits, and follow failures can no longer
  write an earlier creation or profile into the next client-side route.
  The operator-confirmed postal address is also corrected consistently across
  Terms, Privacy, and Copyright. This same-day postal correction is
  administrative, keeps the Terms version at `2026-07-13`, and does not alter
  the policies or user obligations.
- **Mobile canvas clarity:** when dense cell lines are intentionally suppressed,
  the canvas now explains that it is a preview and points to Edit zoom; the
  canvas also exposes a stable visible/suppressed/hidden grid state for browser
  automation and associates the guidance with the canvas for assistive tools.
- **Release-evidence sync:** reconciled the legal, Google, Stripe, migration,
  and read-only staging checklist with completed gates. Chrome DevTools tracing
  is now operational and saved cold-load and representative interaction traces
  cover the local production candidate; the same measurements on the immutable
  hosted revision remain required before launch.
- **Staging CPU guardrail:** activated Workers Paid with owner approval and configured a staging-only 2-second CPU limit, enforced exactly in both source and generated release configuration; community writes and production remain unchanged pending live staging acceptance.
- **Consult-sales containment:** consult checkout now fails closed in both the unified Worker and retained Pages path, stays out of the public catalog while disabled, and cannot be enabled by the release wrapper until an end-to-end fulfillment test is recorded. Recovery and support products remain available.
- **Staging control-plane readiness:** completed the approved Google OAuth branding, isolated Stripe test-key/webhook setup, and forward-only `0006_align_game_taxonomy.sql` migration without deploying the Worker or changing DNS.
- **Legal and release-mode hardening:** published the operator-approved postal contact on Terms, Privacy, and Copyright; recorded operational channel ownership; and made bootstrap validation accept restricted Stripe keys while rejecting test/live key mismatches by target.
- **Webhook privacy and replay coverage:** removed Stripe event identifiers and types from both the unified Worker and retained Pages logs, then added signed valid, tampered, stale, missing-secret, oversized-body, and duplicate-delivery tests.
- **Release artifact hardening:** deployment approvals and bootstrap secret bundles must be ignored regular files with owner-only `0600` permissions on POSIX systems; the local release checklist now verifies the complete forward-only migration chain.

### 2026-07-12

- **Studio canvas overhaul:** removed the competing graph-paper layer and duplicate tool/palette panels, added one high-contrast editable grid, consolidated touch/pen/mouse controls, kept phone quick colors visible, and suppresses grid lines when they would obscure 256×256 cells.
- **AI safety and reliability:** scoped consent/history per account, bounded live messages, enforced capability- and output-aware refinement, added visual review and one-step apply, blocked destructive truncated refinements, and live-probed Gemma 4 text-to-grid and image refinement through the strict provider policy.
- **Legacy rollback safety:** Pages advertises AI as unavailable and fails chat closed; authenticated, rate-limited AI remains on the unified community Worker.

### 2026-05-20

- **Image crop framing:** image import now has a draggable source crop rectangle with Full, Square, and Head shortcuts. Crop settings are applied before cover/contain/stretch placement, preserved in image-import metadata, and verified in both focused import tests and the Studio browser smoke test.
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

- Studio: import → quantize to the Studio's 84-color working palette → grid editor → JSON/PNG/palette reference export
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
