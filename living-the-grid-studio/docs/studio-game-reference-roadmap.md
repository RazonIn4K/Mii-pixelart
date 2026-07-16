# Studio game-reference roadmap

**Status:** Product direction for the Studio overhaul
**Scope:** Local creation, manual reference workflows, AI-assisted editing, and community reuse
**Last updated:** 2026-07-15

## Purpose

Tomodachi Studio should help people plan, refine, and share original artwork that they can manually recreate in drawing tools. It is an independent fan-made companion, not a Nintendo editor, game-data converter, or connection to a Nintendo Switch.

The roadmap keeps the existing pixel-art workflow while adding a freeform sketch workflow modeled on broad usability lessons from Nintendo's public product material. The resulting interface and artwork must remain visually original.

## Official research basis

Nintendo's public material shows a few useful interaction principles:

- Mii creation separates a guided **Get Help** path from a detailed **From Scratch** path.
- The character editor keeps a live preview visible while presenting large feature choices and focused position, scale, and rotation controls.
- Face Paint and Palette House use a freeform drawing surface with persistent undo, drawing tools, a palette, a preview, and clear completion actions.
- Palette House lets a player begin with a blank base, a prepared template, or a prior creation.
- Creations include single-surface artwork, repeating surfaces, and items with multiple drawable panels.
- Nintendo documents local-wireless exchange of Mii characters and Palette House creations; Tomodachi Studio must not present its web community as in-game online exchange.

Sources:

- [Tomodachi Life: Living the Dream product page](https://www.nintendo.com/us/store/products/tomodachi-life-living-the-dream-switch/)
- [Official creative-feature overview](https://www.nintendo.com/us/whatsnew/its-time-to-get-creative-in-the-latest-trailer-for-tomodachi-life-living-the-dream/)
- [Official Direct summary](https://www.nintendo.com/us/whatsnew/tomodachi-life-living-the-dream-direct-spotlights-quirky-fun-with-player-made-mii-characters-game-launches-on-nintendo-switch-april-16/)
- [Ask the Developer, Part 1](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-21-tomodachi-life-living-the-dream-part-1/)
- [Ask the Developer, Part 2](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-21-tomodachi-life-living-the-dream-part-2/)
- [Ask the Developer, Part 3](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-21-tomodachi-life-living-the-dream-part-3/)

These sources were used for research only. No Nintendo screenshots, logos, character models, interface icons, music, or other official assets belong in the application or repository. Nintendo has not published exact proprietary texture dimensions or palettes in these sources, so the Studio must not claim or imply exact values.

## Independent workflow comparison

On 2026-07-15, the public editor at [living-the-grid.com](https://living-the-grid.com/) was inspected as an independent third-party usability reference. The comparison was limited to observable workflow behavior; no code, copy, branding, screenshots, icons, palette data, or other assets were copied.

The useful interaction pattern is specific:

- upload or resume is the first obvious action;
- project resolution, pixel-perfect brush guidance, palette controls, and display controls remain visible while drawing;
- the editable cell mesh is distinct from the in-game 2×2, 4×4, or 8×8 reference overlay;
- zoom, project statistics, and the manual recreation recipe stay beside the single canvas;
- the 256×256 drawing surface stays distinct from the selected observed smooth
  or snapped brush footprint instead of disguising a brush stamp as one larger
  project cell;
- paint-by-numbers and the step-by-step recipe are completion aids, not separate drawing surfaces.

That site is not authoritative Nintendo documentation. Tomodachi Studio may adopt the general usability model while retaining original visuals and clearly labeling observed/custom geometry and the Studio-defined palette.

## Product principles

1. **One authoritative canvas.** There is one interactive drawing surface, one coordinate system, and one undo history. The project-cell mesh and one optional game-reference section overlay may coexist, but each is rendered once and neither creates a second canvas or second document. Read-only previews must be visually distinct and cannot capture drawing input.
2. **Two creation modes, one workflow.** Pixel and Sketch modes share project setup, tools where appropriate, persistence states, review, exports, and community publishing.
3. **Easy first, depth on demand.** A guided start should create a useful result without exposing every control. Advanced controls remain available without forcing a second editor.
4. **Reference, not game export.** Every compatibility-facing feature produces ordinary images, project data, or manual copy guides.
5. **Local-first and reversible.** Import, conversion, editing, and draft recovery work without an account. Every material edit, including AI-assisted edits, is previewable and undoable.
6. **Original by design.** The Island Workshop design language may feel playful and welcoming but must not reproduce Nintendo's layouts, art, icons, characters, or trade dress.

## Dual-mode editor

### Pixel mode

Pixel mode continues to use `GridDocumentV1` as the canonical project format:

- crisp cell painting with anti-aliasing disabled;
- optional grid, labels, symmetry, palette locking, fill, picker, and selection tools;
- zoom that preserves exact cell boundaries;
- deterministic optimization and palette reduction;
- existing JSON, PNG, and ZIP/reference exports.

The grid is an editing aid, not a claim about an official game texture. Presets must use neutral names and display their actual custom width and height.
Any bundled palette is a Studio reference palette, not a verified official game palette.

### Sketch mode

Sketch mode adds freeform drawing for artwork that is awkward to create as coarse pixel art:

- pressure-optional brush with size and opacity;
- eraser, fill, picker, line, shape, selection, move, flip, rotate, and scale;
- optional stroke stabilization and symmetry;
- transparency checkerboard and optional coarse composition guides;
- a small read-only final-size preview;
- explicit conversion to `GridDocumentV1` before cloud save or publishing.

The first implementation can keep Sketch projects local as a raster working surface and commit a bounded, palette-valid `GridDocumentV1` when the user chooses **Convert to pixels**, **Save to account**, or **Publish**. This preserves the shared cloud contract while the team evaluates whether a versioned sketch schema is justified.

### Shared command layer

UI controls, keyboard shortcuts, touch/pen input, imports, and AI must dispatch the same validated commands. A minimum command vocabulary is:

- `setTool`, `setColor`, and `setViewport`;
- `drawCells` and `drawStroke`;
- `fillRegion`, `eraseRegion`, and `replaceColor`;
- `setSelection`, `moveSelection`, and `transformSelection`;
- `setPalette` and `replaceDocument`.

Commands validate bounds, colors, sizes, and document version before mutation. A pointer drag is grouped as one history entry. No assistant or automation may manipulate the DOM, synthesize mouse events, or bypass the command validator.

## Project start and completion flow

### 1. Choose a study surface

Use original, generic categories:

- character detail;
- wearable surface;
- pet or object;
- food or drink;
- repeating tile;
- scene or building panel;
- custom dimensions.

Multi-panel surfaces are separate named panels within one project, not overlapping canvases. Changing panels swaps the authoritative document shown in the single canvas host.

### 2. Choose how to begin

- **Guided start:** a short question flow that recommends a neutral canvas, mode, and palette size.
- **Blank canvas:** direct access for experienced creators.
- **Import reference:** local image conversion with a preview before commit.
- **Use my prior work:** duplicate an owned project without changing the original.
- **Remix:** create an attributed copy only when the publisher enabled project downloads/remixing.

A reference image can be pinned beside the canvas, cropped, flipped, rotated, scaled, dimmed, or removed. It is never a second paint surface.

### 3. Create

Desktop layout uses a collapsible reference/preview dock, the single central canvas, a palette panel, and a labeled tool rail. Mobile uses a full-width canvas, a compact bottom tool bar, and palette/reference drawers. Primary targets are at least 44 by 44 CSS pixels and expose text labels or accessible names.

### 4. Review

The review step shows:

- the clean final preview and a small viewing-distance preview;
- mode, dimensions, panel count, and palette summary;
- copy-guide preview;
- title, description, tags, visibility, comments, and download/remix permission;
- an originality and rights attestation.

Authentication and saving never publish automatically.

## Copy Guide

**Copy Guide** is the interoperability feature. It helps a person manually reproduce art elsewhere; it is not a native game-file export.

Pixel guides include:

- an enlarged numbered grid;
- row and column coordinates;
- a numbered palette legend;
- optional quadrant pages for dense artwork;
- one page per panel for multi-panel projects.

Sketch guides include:

- a clean full reference;
- enlarged quadrants;
- optional center lines and safe-area guides;
- color swatches and panel labels.

Guides export as ordinary PNG and printable HTML inside the existing reference pack. Every guide and related help page must say **manual recreation guide** and must not say **game export**, **native format**, or **Nintendo compatible**.

## Local-only safe image import

Studio reference import remains browser-local:

1. Accept bounded PNG, JPEG, GIF, WebP, AVIF, and BMP inputs; animated formats use a documented still frame. Reject SVG and unsupported container formats.
2. Verify file signatures before decode, enforce byte, dimension, and total-pixel limits, and correct decoded orientation.
3. Let the user crop, fit, scale, and preview conversion without mutating the current project.
4. Rasterize into a fresh buffer, discard filenames and metadata, and convert into palette-valid canonical project data.
5. Commit the result as one undoable action, revoke temporary object URLs, and never persist or upload the original source automatically.

Only transformed project data and server-generated previews enter the private cloud-project pipeline. A local reference import does not create an image-only community post and is separate from the reviewed showcase-image attachment feature.

## Reversible AI contract

AI is an optional assistant over the command layer, not an autonomous painter:

- model output is parsed into the bounded command schema and validated before preview;
- the user sees an affected-cell or affected-region preview before apply;
- applying a response creates one undoable history entry;
- failures leave the document unchanged;
- existing consent, provider-retention controls, model allowlist, timeouts, and request limits remain mandatory;
- original reference images are not sent to a provider without a separate, explicit disclosure and consent step;
- AI may suggest palette reduction, trace edges, identify isolated regions, build a copy guide, or propose original decorative motifs;
- AI must not generate Nintendo characters, logos, official interface elements, or claims of native compatibility.

Community moderation AI may prioritize and summarize reports, but hiding content, suspending accounts, resolving reports, or deleting data requires an authenticated human moderator action with an audit record.

## Original visual direction

Extend Island Workshop rather than reproducing the game interface:

- warm cream and sunrise surfaces with coral, seafoam, sky, and dark-ink accents;
- rounded tool chips, paper-cut shapes, subtle handmade textures, and strong selected states;
- labeled original icons instead of copies of Nintendo's tool symbols;
- deterministic code-generated Island Pal avatars instead of Mii likenesses;
- original empty-state and social artwork with no franchise characters, logos, costumes, buildings, or recognizable official props;
- restrained motion with a complete reduced-motion mode.

The application may accurately describe itself as an independent fan-made planner and sharing community. It may not imply endorsement, affiliation, or ownership by Nintendo.

## Claim and asset boundaries

Do not claim or ship:

- direct import into or export from Tomodachi Life;
- Switch save data, Mii files, QR codes, local-wireless bridges, or proprietary game formats;
- exact official canvas dimensions, safe areas, palettes, color names, or rendering behavior;
- automatic online exchange with the game;
- official screenshots, logos, fonts, music, icons, Mii models, or other Nintendo assets;
- biometric likeness detection or an assertion that a generated character will match a person or Mii.

Use copy such as: **An independent fan-made art planner and sharing community. Recreate designs manually using the Copy Guide; no game-file export.**

## Acceptance criteria

### Canvas and editing

- Exactly one focusable interactive canvas exists in the workspace. Project-cell lines and the optional game-reference section overlay are independently labeled, never mutate the project, and each renders only once.
- Pixel output stays crisp at every supported zoom and device-pixel ratio; Sketch strokes remain visually continuous.
- Pointer coordinates remain correct after zoom, pan, resize, and browser zoom.
- Pinch and two-finger pan never paint; mouse, keyboard, touch, and pen workflows are covered by browser tests.
- Undo and redo cover strokes, fills, transforms, imports, palette changes, mode conversion, and AI applies.
- Read-only previews are labeled as previews and never intercept canvas input.

### Import and persistence

- Supported signatures, size limits, orientation handling, metadata removal, conversion, cancel, commit, and undo have automated tests.
- The original imported file and filename never enter IndexedDB, D1, R2, logs, or analytics through the Studio reference-import path.
- Converted cloud projects pass the shared `GridDocumentV1` schema and canonical JSON size limit.
- Offline editing and draft recovery remain available without authentication.

### Copy Guide and publishing

- Pixel and Sketch guides match their clean exported preview and identify every panel.
- Copy Guide language says manual recreation and never implies native compatibility.
- Publishing always opens review and respects private, unlisted, and public visibility.
- Remix preserves attribution and requires the owner's explicit download/remix permission.

### Accessibility and quality

- Tools have visible focus, accessible names, status announcements, and minimum 44-pixel targets.
- The editor works at 200% browser zoom and at the supported 320-1440 pixel viewport matrix without horizontal overflow.
- Reduced-motion mode removes nonessential transitions.
- Canvas input, imports, AI operations, exports, and route navigation produce no console errors or failed expected requests.
- Performance and bundle gates from the community delivery plan remain mandatory.

## Delivery order

1. **Implemented:** consolidate the current Pixel workspace around one authoritative canvas and remove duplicate-grid/input paths.
2. **In progress:** add the shared command layer and expand pointer, keyboard, touch, pen, exact exported-cell, transform, and undo/redo tests. Exact row-major export coverage now proves that a known visual target mutates the intended canonical cell.
3. **In progress:** ship the new-project chooser, browser-local reference dock, prior-work/remix start, and review step. The current slice includes the persistent read-only reference, independently labeled project-cell lines, observed 2×2/4×4/8×8 game-reference overlays, one-click Easy Draw setup, pointer-anchored wheel zoom, one-based coordinates, mobile-reflowing controls, a touch-sized palette sheet, and an 11-by-7 desktop shade matrix with a separate vivid rail.
4. **Implemented:** Copy Guide v1 turns a validated Pixel project into exact
   one-based contiguous row runs, highlights only the current run on the same
   authoritative read-only canvas, and keeps completion progress browser-local.
5. Add local Sketch mode and explicit conversion to `GridDocumentV1`.
6. Add Sketch copy guides and multi-panel project navigation.
7. Route AI suggestions through validated, previewable commands.
8. Complete community publishing, attribution, moderation, accessibility, and performance acceptance before production cutover.

## Specific implementation checkpoints

### Checkpoint A — game-matched easy drawing

Status: corrected locally after the `f03b428` hosted audit; requires a new
exact-SHA staging gate.

- Keep one 256×256 coordinate surface so one Studio cell can represent one
  reported game-surface pixel without conflating document resolution and brush
  size.
- Offer the independently observed smooth 1/3/7/13/19/27px footprints and
  snapped pixel-perfect 4/8/16/32px footprints. The on-canvas cursor must show
  the exact mutation rectangle, including its snapped origin.
- Keep the fine cell mesh, snapped-stamp cadence, Off/2×2/4×4/8×8 section
  overlay, and center axes independent. Coincident lines render once.
- Keep custom and legacy 8–256 documents editable/exportable, but never label
  them one-for-one until the user explicitly converts to 256×256.
- Make **Match game** select Pencil, a snapped 4px footprint, the 8×8 section
  guide, visible center axes, non-mirrored painting, and Cell view.
- New blank work and starters use transparent 256×256 surfaces. Starter art
  expands from small original source fixtures with nearest-neighbor blocks;
  previews retain alpha without allocating all full documents at panel load.
- Character starters use original silhouettes and role-driven names such as
  Bubble Explorer, Midnight Mascot, Trail Courier, Forest Scout, and Comet
  Runner. Older source IDs remain internal provenance keys so existing local
  projects and exported JSON keep their traceability; cards and public-facing
  metadata use the original catalog names.
- Keep a visible browser-local source board plus Side, Under, Over, and Split
  comparison modes that never enter the saved document.
- Keep wheel zoom anchored to the cell beneath the pointer.
- Keep a high-contrast cursor aid visible when the exact footprint is smaller
  than eight CSS pixels, anchored to the footprint rather than the raw pointer.

Exit evidence:

- geometry unit tests covering every mode and the snapped 4×4 mutation block;
- canonical JSON export proves smooth 1px changes one row-major cell and the
  snapped 4px footprint changes exactly the expected 16 cells;
- desktop and 320px browser acceptance;
- visible source controls and a usable canvas at 320/390px with no clipping;
- no second interactive canvas, doubled guide, opaque fake background,
  horizontal page overflow, console errors, or failed expected requests;
- hosted mobile performance remains under the agreed INP budget.

### Checkpoint B — mobile drawing dock and precise touch targeting

Status: next.

- Pin the active Pencil/Eraser/Fill/Picker, selected color, and undo/redo within thumb reach.
- Add a touch loupe or press-preview crosshair for single-cell tools.
- Bound pan so at least one recoverable portion of the artboard remains visible.
- Confirm the intended cell before Fill, Picker, or Inspect commits on touch release.
- Add iPhone WebKit/DPR-3 Studio coverage rather than relying only on touch-enabled desktop Chromium.

Exit evidence:

- real 320, 360, 390, and 430px drawing tests;
- second-finger rollback leaves no partial stroke and no undo entry;
- first/last-cell targeting works after Fit, Cell view, wheel zoom, hand pan, and pinch;
- all primary targets meet 44×44 CSS pixels.

### Checkpoint C — verified recipes and sectioned Copy Guide

Status: blocked on a provenance-reviewed dataset.

- Version surface profiles and palette recipes with provenance.
- Preserve the selected recipe through import, local draft, cloud save, Copy Guide, and export.
- Add row, eight-cell section, quadrant, and color-group copy orders.
- Provide game-facing color directions only when values have been verified; keep the current 84-color set labeled as a Studio working palette until then.

Exit evidence:

- every cell appears exactly once in every copy order;
- palette conversion fixtures round-trip;
- visible guide, exported guide, and project revision agree;
- no unverified value is described as official or exact.

### Checkpoint D — advanced creation and AI-safe commands

Status: planned.

- Wire line and rectangle commands, then selection, move, ellipse, and transforms with non-mutating previews.
- Add reference pan, scale, rotation, crop, overlay/underlay, and edge modes without saving the source image.
- Route AI through bounded cell/shape commands with an affected-cell diff and explicit apply/cancel.
- Buffer sustained pointer events so long 256×256 pen strokes commit as one history entry without full-document work per sample.

Exit evidence:

- malformed or out-of-bounds commands never mutate the document;
- cancel leaves history unchanged and apply creates one undo entry;
- provider failure cannot change project cells;
- 120Hz sustained-stroke p95 processing stays below 16ms and INP below 200ms.

## Local acceptance record — 2026-07-15

This record applies to the game-matched drawing slice based on
`d3ec2f9f889677a5859972c2e21935619e032f90`. It is local evidence, not a hosted
staging approval or production result.

- TypeScript client and Worker checks passed.
- Worker tests passed: 37 files and 318 tests.
- Preflight tests passed: 4 files and 90 tests.
- The complete Playwright matrix passed: 392 executed cases with 372 intentional
  project skips across the configured desktop, tablet, 430, 390, 360, and 320px
  projects.
- The exact mobile failures discovered by the full matrix were fixed: the
  palette sheet now respects Radix's available viewport height, and destructive
  alert content no longer fades through an inaccessible low-contrast state.
- The production build and bundle budget passed: 91.7 KiB gzip initial
  JavaScript, with the largest chunk also 91.7 KiB gzip.
- `pnpm audit --audit-level high` reported no known vulnerabilities.
- Local, staging, and production Worker dry-run packaging passed without a
  deployment; the release-output secret-filename audit also passed.
- A production-build Chrome trace at 390×844, DPR 3, Slow 4G, and 4× CPU measured
  326ms LCP and 0.02 CLS for a cold Studio load. The Start blank interaction
  measured 74ms INP and 0.00 CLS. No console errors or failed network requests
  appeared in the traced workflow.

### Remaining release gates

1. Commit the reviewed slice and push the same commit to GitHub and GitLab.
2. Require the remote CI and security checks to pass at that exact commit.
3. Request a new exact-SHA staging approval; the prior approval for `18e36dac`
   does not authorize this newer commit.
4. After approval only, deploy that exact commit to staging with the already
   approved feature flags and no unrelated DNS, secret, migration, OAuth, role,
   or production changes.
5. Repeat authenticated Studio, profile, accessibility, CSP/console, crawler,
   and mobile performance acceptance on the immutable hosted deployment URL.
6. Keep production unchanged until staging evidence is reviewed and a separate
   production cutover gate is explicitly approved.
