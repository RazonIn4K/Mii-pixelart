# Roadmap — Tomodachi Studio

**Last Updated:** 2026-08-25

---

## Phase Overview

| Phase | Title                      | Status                  | Description                                                                                                  |
| ----- | -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| 0     | JSON Fixture Inspection    | ✅ Complete             | Inspect the real Living The Grid JSON and finalize the import adapter                                        |
| 1     | JSON Round-Trip            | ✅ Complete             | Import JSON → normalize to GridDocument → render canvas → export JSON                                        |
| 2     | Palette Panel              | ✅ Complete             | Usage counts, color locking, manual merges, and palette reference                                            |
| 3     | One-Click Optimizer        | ✅ Complete             | Deterministic color merging, island removal, cleanup passes, and palette limiting                            |
| 4     | Image Import               | Implemented; refining   | Crop/framing, subject focus, cleanup, tone controls, color limits, preview, and palette quantization          |
| 5     | Reference Pack Export      | ✅ Complete             | ZIP plus JSON, labeled/clean guide images, palette sheet, paint order, notes, manifest, and HTML              |
| 6     | AI Suggestions             | Chat implemented; image prototype gated | Account-gated advice/sketch review remains; a dedicated generated-artwork import path is local-only and not deployed |
| 7     | Island Workshop Community  | Writable staging; operator deploy pending | GitHub `main` is `7dd9c5a` (PR #11); live staging still runs `57beeaf` until an operator deploy; exact-head P1–P5 hosted acceptance remains incomplete |

---

## Phase 0: JSON Fixture Inspection ✅

**Goal:** Obtain and document the real Living The Grid JSON format.

**Status:** COMPLETE (2026-04-26)

**Completed tasks:**

- [x] Place the `living-the-grid-*.json` fixture file in `fixtures/living-the-grid-real.json`
- [x] Pretty-print and inspect the JSON structure (64×64, 15-color palette, v2 format)
- [x] Document the production indexed-palette schema in `docs/json-format-notes.md`
- [x] Update `json-io.ts` so indexed-palette imports map to internal palette IDs
- [x] Verify `json-io.ts` handles the real fixture's exact schema
- [x] Preserve source RGB and H/S/B press counts in palette mapping metadata
- [x] Add executable validation and round-trip coverage (`scripts/verify-ltg-import.ts`)
- [x] Write validation and round-trip documentation (`test-round-trip.md`)

**Outcome:** Living The Grid production format (v2) confirmed and supported by the adapter.

---

## Phase 1: JSON Round-Trip

**Goal:** Full import → edit → export cycle using the native GridDocument format.

**Completed:**

- [x] GridDocument type system (`grid.ts`)
- [x] JSON serialization/deserialization (`json-io.ts`)
- [x] Canvas rendering with grid lines and labels (`canvas-renderer.ts`)
- [x] Studio page with canvas viewer
- [x] Import panel with drag-and-drop
- [x] Export panel with JSON and PNG download
- [x] Undo/redo history

---

## Phase 2: Palette Panel

**Goal:** Full palette management with usage analysis and manual editing.

**Completed:**

- [x] Original 84-color Studio working-palette data (`palette.ts`)
- [x] Color usage counts and percentage display
- [x] Color lock/unlock toggle
- [x] Manual merge mode (click source → click target)
- [x] Studio palette reference grid (11×7 + saturated row)
- [x] Hover-to-highlight on canvas

---

## Phase 3: One-Click Optimizer

**Goal:** Deterministic optimization passes with user-configurable parameters.

**Completed:**

- [x] Color merging pass (Delta E threshold)
- [x] Island removal pass (connected-component detection)
- [x] Single-cell cleanup pass
- [x] Palette limiting pass
- [x] Optimizer UI with sliders and toggles
- [x] Locked colors respected by all passes

---

## Phase 4: Image Import

**Goal:** Convert character references, face photos, logos/marks, memes, and other uploaded images into palette-limited grids.

**Completed:**

- [x] Image loading and canvas sampling
- [x] Resize to configurable grid dimensions
- [x] Nearest-palette-color matching using CIELAB Delta E
- [x] Grid size controls (8-256, step 8)
- [x] AVIF and WebP accepted by image picker
- [x] Aspect-preserving framing modes: fill, fit, stretch
- [x] Focus X/Y controls for face and subject positioning
- [x] Draggable source-image subject target for faster face positioning
- [x] Face Paint, Character 64, Face 96, Character 128, Sprite 32, Logo 64, Sticker 64, Icon 16, Full 64, and Pixel 256 import presets
- [x] Photo vs Pixel/Logo sampling modes for smoother portraits and sharper local character/logo assets
- [x] Retain the last uploaded source image for settings changes
- [x] Reprocess retained images without reopening the file picker
- [x] Edge-connected background cleanup for portrait imports
- [x] Brightness, contrast, and saturation pre-processing
- [x] Max-color limiting is applied during image import
- [x] Non-destructive image preview with commit/cancel controls
- [x] 28 original starter templates for face guides, mascot heads, space-crew suits, tiny dinos, cute monsters, horror mascots, bald schoolhouse teachers, masked villains, pumpkin ghouls, sheet ghosts, vampires, zombies, spooky clowns, heart stickers, star badges, compact icons, portrait busts, cap heroes, adventurers, speed mascots, arcade fighters, space helmets, robot faces, letter marks, controller icons, racing karts, pizza slices, and sword badges
- [x] Saved native JSON fixtures for all creative templates (`fixtures/creative-templates/`, regenerated with `pnpm save:templates`)
- [x] Blank starter canvases for Face Paint, character, sprite, sticker, icon, and full-image work
- [x] Inspect, pencil, eraser, eyedropper, and fill bucket tools for manual creation/touch-up
- [x] Canvas detail controls to resample current grids to 64, 96, 128, 256, or 2x dimensions without overflowing the workspace
- [x] Pure placement and background-cleanup coverage (`scripts/verify-image-import.ts`)
- [x] Browser smoke coverage for creation tools, local character assets, generated mascot/sprite/emblem/sticker/icon fixtures, JPG, AVIF, LTG JSON, unsupported files, preview commit, and export downloads (`scripts/verify-studio-browser.ts`)

**Optional refinement:**

- [ ] Add finer pan-and-zoom controls inside the implemented draggable crop
      rectangle when user testing shows the current crop and focus controls are
      insufficient.

---

## Phase 5: Reference Pack Export

**Goal:** One-click download of everything needed to repaint in-game.

**Completed:**

- [x] JSON export
- [x] PNG guide export (with grid lines and labels)
- [x] Clean PNG export (without overlays)
- [x] HTML reference page export
- [x] Palette sheet PNG with labels and working-palette IDs
- [x] Paint-order CSV sorted by usage
- [x] ZIP reference pack with guides, project JSON, palette sheet, paint order,
      source notes, manifest, and HTML reference

---

## Phase 6: AI Suggestions

**Goal:** Optional AI-powered suggestions that the user explicitly accepts or rejects.

**Existing chat path:**

- [x] Server-side OpenRouter proxy routes (`/api/ai/status`, `/api/ai/models`, `/api/ai/chat`) so API keys stay out of the browser bundle
- [x] Account-gated AI tab with four curated free presets, per-user bounded local history, sketch/advice modes, explicit current-grid consent, and model-capability/output-budget gates
- [x] Optional visual grid snapshot context so image-capable models can inspect the current canvas before proposing a sketch
- [x] Reviewable AI sketch JSON path that validates palette-ID rows and applies one normal, undoable `GridDocument` revision
- [x] Fenced/loose JSON recovery for models that wrap valid sketch JSON in Markdown
- [x] AI sketch validation coverage (`scripts/verify-ai-sketch.ts`) and browser smoke coverage for the AI tab
- [x] Per-account session persistence in browser `localStorage`; no database is required for single-device private chat history
- [x] OpenRouter model-comparison script (`pnpm compare:models`) that saves ranked-model outputs to `reports/` when `OPENROUTER_API_KEY` is configured

**Why the image path is separate:**

- [x] Live staging diagnosis reproduced the failure: a free chat model returned
      prose plus malformed 16-by-16 sketch JSON, which validation rejected.
- [x] Confirmed that `openrouter/free` is a text-output router, not an image
      generator.
- [x] Complete the local dedicated Images API candidate with exact allowlist
      default `google/gemini-3.1-flash-lite-image` and explicit fallback
      `google/gemini-3.1-flash-image`, exposed only through the unreleased
      `GET /api/ai/images/status` and `POST /api/ai/images` Worker routes.
- [x] Prove bounded provider bytes feed the existing alpha-aware canonical
      256-by-256 import review without mutating, saving, uploading, or publishing
      before explicit commit.
- [x] Prove authentication, same-Origin JSON, edge throttling, D1 idempotency,
      per-user daily reservation, environment budget, timeout, MIME/signature,
      and stale-reservation behavior.
- [x] Run the original-art two-model benchmark with a hard aggregate spend cap
      of $2.00 and no committed or uploaded benchmark images.
- [x] Pass local Worker, browser, accessibility, CSP/console, privacy/log,
      build, and migration verification.
- [ ] Request a separate immutable exact-head staging deployment and acceptance
      gate. Production remains disabled and requires a later independent gate.

See
[AI image-generation prototype gate](ai-image-generation-gate.md) for the
complete contract and acceptance matrix.

**Principles:**

- AI is a **suggestion layer only** — never a hidden automatic editor.
- Every AI suggestion is presented as a preview that the user can accept, modify, or dismiss.
- The user always has the final say.
- Generated artwork is also an import source, not a special save or publish
  path; provider bytes are discarded when review ends.

**Potential features:**

- Suggest optimal merge pairs based on visual impact analysis.
- Suggest color replacements that improve contrast.
- Generate a "painting order" that minimizes brush changes.
- Auto-detect and suggest removal of compression artifacts.
- Let models propose localized edits to the current grid instead of replacing the full document.
- Keep AI chat history browser-local unless a later privacy review explicitly
  approves opt-in cloud sync; account-backed project sync and public galleries
  use the separate Island Workshop data model.

---

## Phase 7: Island Workshop Community

**Goal:** Preserve anonymous local Studio use while adding explicit opt-in
accounts, private cloud projects, publishing, discovery, social tools, and
human-authorized moderation.

**Implemented and locally/CI tested:**

- [x] Unified Hono Worker with Static Assets, D1, private R2, KV, Images, rate
      limits, scheduled maintenance, dynamic documents, AI compatibility, and
      provider-free `410 Gone` tombstones for retired payment routes
- [x] Google authorization-code OIDC, onboarding, hashed opaque sessions,
      generated avatars, avatar regeneration, optional normalized profile
      images, profile/settings, export, and deletion lifecycle
- [x] Explicit first private save, IndexedDB resume/sync metadata, autosave,
      offline/conflict states, immutable project revisions, quotas, and media
      generation
- [x] Review-before-publish flow, public/unlisted visibility, project-download
      control, profiles, search, tags, recent/popular discovery, sharing, and
      normalized showcase images
- [x] Likes, comments, follows, reports, reversible moderation, legal/community
      documents, structured redacted logs, and retention jobs
- [x] ADRs, threat model, data-flow documentation, OpenAPI contract, forward-only
      migrations `0001` through `0008`, release guards, Worker integration
      tests, and responsive/accessibility coverage
- [x] Direct local Chromium 200 percent page-scale regression with keyboard
      focus and no document-level overflow
- [x] Retire checkout, tips, paid recovery, and consultations; keep the AI
      Action Plan beta free and mark the possible one-time $5 creator plan as
      gated product direction, not an offer for sale

**Accepted on isolated staging:**

- [x] Exact runtime source
      `80fdcd5da432b88d06d84bfd084e9f0993edc363` deployed as Cloudflare
      deployment `9803bbba-4ee5-45fc-9027-7afd4e902089`, Worker version
      `c56f580f-2238-4775-846d-3d2c08f17c78`, with community mutations enabled
      only on isolated staging; authenticated Studio, account navigation, share
      review, security, crawler, accessibility, CSP, and isolation checks pass
- [x] Authenticated single-account profile setup and Terms reacceptance,
      generated/custom avatar lifecycle, private cloud restore, showcase-image
      lifecycle, generated-avatar fallback, and empty moderation workspace
- [x] Studio single-canvas painting plus browser-local Guided Copy reference
      lifecycle without an unintended cloud revision
- [x] Anonymous API/security/crawler, CSP/font, responsive browser,
      accessibility, local-only Studio stroke/undo, zero-write D1, and rollback
      checks
- [x] Last unchanged-homepage acceptance: 2,185 ms median LCP, 0.00 CLS, and
      100 Accessibility/Best Practices Lighthouse scores
- [ ] Final exact-head Studio performance closeout: branch checkpoint
      `b34f821373657ccf8e5d38401af6c4ff255fc65c` differs from deployed
      `80fdcd5` only by documentation and test configuration, but the release
      rule still requires fresh immutable exact-head cold, restored-draft,
      cloud-load, interaction, and mobile evidence. Earlier hosted records are
      supporting evidence only.

**Remaining approval gates:**

- [ ] Complete P1 on one final exact-head staging deployment with Worker-hosted
      cold, restored-draft, authenticated cloud-load, live Create,
      accessibility, CSP/console, crawler, and mobile-performance acceptance
- [x] Implement and locally prove the fail-closed writable hosted harness and
      secret-free live-auth runner with production-host refusal, fixed
      route/write/byte ceilings, private `0600` approval binding, exact D1/R2
      key/size/SHA-256 reconciliation, HMAC-attested loopback enumeration, two
      ephemeral browser contexts, and D1-confirmed session revocation
- [ ] Run those tools on the next exact staging SHA with a fresh private
      approval and a distinct approved second Google identity; no remote
      writable/two-session run is approved or complete yet
- [ ] Distinct second-user cross-account, social, report, moderation, and
      destructive account-lifecycle acceptance
- [x] Exact branch preview
      `https://02e85e33.mii-pixelart.pages.dev` and green owned PR checks for
      checkpoint `b34f821`; this does not substitute for exact-head Worker
      acceptance
- [ ] PR merge, production resources/OAuth/secrets/migrations, read-only Worker
      cutover, admin bootstrap, writable enablement, rollback drill, and soak

Production `tomodachi.pw` remains on Cloudflare Pages. GitHub `main` is
`7dd9c5aa87271981cde1b89e67083f71366ad2e8` (PR #11). Live staging still runs
`57beeafbdb9e177f9fc51e0ce212e2ff9e7f6bdb` as Worker version
`1a90ac21-57a9-4903-a36c-8ed6b0d38269` until an operator deploys the current
`origin/main` SHA. Run `pnpm verify:staging-deploy-preflight` to confirm
deploy-required drift and `pnpm print:hosted-release-identity` before filling
writable approval files. The checked-in production Worker config names writable
community and AI image generation as the target state; it does not authorize
skipping the read-only cutover in `docs/production-readiness-plan.md` gate P11.

---

## Contributing

To contribute to any phase:

1. Check the task list above for unchecked items.
2. Create a branch named `phase-{N}/{feature-name}`.
3. Implement the feature with tests.
4. Open a PR referencing this roadmap.
