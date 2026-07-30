# True-256 Studio canvas local candidate

**Date:** 2026-07-16 (America/Chicago)

**Branch:** `codex/island-workshop-community`

**Parent deployed source:** `f03b428cb696baee4b7794aa74fea14b1db5e4d2`

**Candidate source:** the Git commit containing this record; its exact SHA must
be named in a separate staging approval before deployment

**Remote state:** not deployed by this work; staging remains on the approved
`f03b428` deployment and production remains unchanged

This is a sanitized local-candidate record. It contains no secrets, cookies,
OAuth identifiers, email or postal addresses, internal user or creation IDs,
object keys, project contents, request bodies, or raw IP data.

## Candidate behavior

- New blank defaults, image/AI conversion presets, and starters target one
  authoritative 256 by 256 project surface. Explicit custom 8–256 imports and
  legacy 8, 16, 32, and 64 documents remain supported without being mislabeled
  as exact game-sized projects.
- Smooth mode offers true centered 1, 3, 7, 13, 19, and 27 pixel footprints.
  Pixel-perfect mode offers origin-snapped 4, 8, 16, and 32 pixel stamps.
  The 1px footprint stays exact while a separate high-contrast cursor aid
  keeps it discoverable at Fit scale.
- Fine cell lines, brush boundaries, the 8 by 8 game guide, and center axes are
  independent layers. Dense brush boundaries are suppressed at Fit scale and
  become visible in Cell view, avoiding the duplicated/noisy-grid appearance.
- Transparent cells use a checkerboard rather than an opaque white fill.
  Connected white image backgrounds become transparent while enclosed white
  artwork remains intact.
- A persistent reference dock supports Side, Under, Over, and Split comparison.
  Reference paint is ordered below editing guides, and mobile puts the source
  before the canvas workflow.
- Manual pencil and eraser strokes render an imperative draft immediately,
  then commit once as a single history entry. Document replacement cannot
  receive a stale stroke, tool changes do not hide an active draft, and entering
  Copy Guide commits a still-held pointer before switching to read-only mode.
- Imported and AI grids are centered with nearest-neighbor containment rather
  than stretched. AI output remains bounded by the existing validated
  document contract and Undo removes it as one revision.
- All 28 starter cards expand to canonical 256 documents. Nine ambiguous
  franchise-like patterns were replaced with original bubble-pod, pocket
  drake, celestial moth, coach-bot, festival-mask, carnival-mask, courier, owl,
  and courier-bot motifs. Card names wrap and transparent previews retain the
  checkerboard.
- Clean PNG export is bounded to 2048 by 2048 and labeled guide export to
  3072 by 3072. JSON, PNG, and reference-pack failures produce a safe,
  actionable browser message; a failed pack re-enables its button.

## Validation

The final candidate passed:

- `pnpm check`;
- 39 Vitest files and 343 tests;
- four preflight files and 90 tests;
- license, OpenAPI route, eight-migration/foreign-key/integrity, LTG import,
  image import, starter, AI-sketch, and resident verifiers;
- production Vite/Worker build;
- bundle budgets at 91.7 KiB gzip initial JavaScript and 91.7 KiB gzip largest
  initial chunk, with the lazy Studio route at 54.80 KiB gzip;
- release-output secret-filename audit;
- local and staging Worker release dry-runs, run sequentially to avoid their
  shared generated-output directory;
- the full Playwright matrix: 395 applicable passes, 390 intentional
  project/viewport skips, and zero failures across desktop, laptop, tablet,
  430, 390, 360, and 320 pixel Chromium projects plus the selected mobile
  WebKit navigation check;
- `git diff --check` and a changed-file credential-format scan.

The first full browser pass exposed one deferred-stroke/Copy Guide lifecycle
regression. The transition was changed to verify the immediate bitmap draft and
synchronously preserve it as one history entry before read-only mode. The
focused test and the complete matrix above then passed.

## Focused local mobile audit

A final read-only browser audit checked the exact candidate at 390 and 320
pixels. Fit view suppressed the dense 4px stamp boundaries; Cell view revealed
them; the checkerboard, 8 by 8 game guide, center axes, and exactly one editable
canvas remained present without horizontal overflow. At 320 pixels, an imported
reference remained visibly available in the source dock and Under mode reported
an active reference layer while the editing guides stayed active.

With 6x CPU throttling, a blank 17-point 4px drag showed its imperative draft in
72 ms, completed the pointer gesture in 216.4 ms, and reconciled the document
344.4 ms after pointer-up. The interaction window contained 51, 157, 178, and
132 ms long tasks. The final document mutation was present. The audit observed
no console warnings/errors and no HTTP response at 400 or above across the
navigation and 123 resource entries. CPU throttling and the isolated local
server were stopped after the audit.

These local, throttled interaction numbers are diagnostic rather than the
Worker-hosted launch gate. They retain a performance risk for reconciliation
and do not override the required hosted LCP/INP trace below.

## Remaining staging gate

This local evidence does not replace hosted acceptance. Before production, a
new exact-SHA staging approval must deploy only this candidate with the intended
community/consult flags and rerun authenticated Studio drawing, AI, import,
reference, starter, Copy Guide, export-failure, accessibility, CSP/console,
crawler, and mobile performance acceptance. In particular, the Worker-hosted
Studio LCP must pass the 2.5-second launch gate; the earlier exact `f03b428`
hosted trace was 3,244 ms.

No deployment, DNS, secret, role, OAuth, migration, production, or unrelated
data change is authorized or performed by this local-candidate record.
