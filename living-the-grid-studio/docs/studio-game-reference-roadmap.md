# Studio game-reference roadmap

**Status:** Product direction for the Studio overhaul  
**Scope:** Local creation, manual reference workflows, AI-assisted editing, and community reuse  
**Last updated:** 2026-07-13

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

## Product principles

1. **One authoritative canvas.** There is one interactive drawing surface, one coordinate system, one undo history, and at most one optional grid overlay. Read-only previews must be visually distinct and cannot capture drawing input.
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

1. Accept bounded PNG, JPEG, WebP, and GIF inputs; animated formats use a documented still frame. Reject SVG and unsupported container formats.
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

- Exactly one focusable interactive canvas exists in the workspace; only one grid overlay can be visible.
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

1. Consolidate the current Pixel workspace around one authoritative canvas and remove duplicate-grid/input paths.
2. Add the shared command layer and expand pointer, keyboard, touch, pen, and undo tests.
3. Ship the new-project chooser, reference dock, prior-work/remix start, and review step.
4. Add Copy Guide v1 for Pixel projects.
5. Add local Sketch mode and explicit conversion to `GridDocumentV1`.
6. Add Sketch copy guides and multi-panel project navigation.
7. Route AI suggestions through validated, previewable commands.
8. Complete community publishing, attribution, moderation, accessibility, and performance acceptance before production cutover.
