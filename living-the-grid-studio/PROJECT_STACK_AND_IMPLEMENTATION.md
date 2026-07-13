# Tomodachi Studio - Stack And Implementation Map

Generated: 2026-05-20

Last reconciled with the Worker branch: 2026-07-11

This document is the single source-of-truth overview for what the current project uses, how the code is organized, how the pixel-art studio works internally, which visuals are included, and how the local/deployed app connects to AI, exports, security, and payments.

> **Runtime status:** `codex/island-workshop-community` targets one Cloudflare
> Worker (Hono) with Worker Static Assets, D1, private R2, KV, Images, rate-limit
> bindings, and scheduled cleanup. Production `tomodachi.pw` still serves the
> rollback-safe Cloudflare Pages deployment from commit `654df95`. Pages
> Functions and Express references in this map are retained only where they
> explain that production rollback surface or shared legacy helpers. The
> authoritative decision is [ADR 0001](docs/adr/0001-workers-community-platform.md),
> and deployment, migration, cutover, and rollback steps live in the
> [community deployment runbook](docs/community-deployment-runbook.md).

The project is a browser-first React/TypeScript studio for turning images, JSON files, AI sketches, and starter templates into repaintable Tomodachi Life: Living the Dream style pixel guides. The important product idea is not only "make pixels"; it is "make a grid a person can repaint square by square without guessing."

Obsidian project atlas mirror:

```text
/Users/davidortiz/Main-Learning-Vault/Neuronal-Connections/1200-PROFESSIONAL/Upwork/Active Projects/Tomodachi_Studio/Project_Implementation_Atlas.md
```

The repo document is the code-facing implementation map. The Obsidian atlas is the professional proof/project-context note for the user's vault.

## 1. Current Purpose

Tomodachi Studio currently combines five product lanes:

1. **Pixel-art repaint studio**
   - Import photos, character art, logos, memes, or JSON.
   - Convert them into a grid backed by Studio working-palette color IDs.
   - Preview before commit.
   - Touch up with paint tools.
   - Optimize colors/noise for hand repainting.
   - Export JSON, PNG guides, palette sheets, paint-order notes, and reference packs.

2. **Tomodachi Life Face Paint and workshop reference workflow**
   - Face-oriented import presets.
   - Subject focus controls.
   - Background flattening.
   - 64x64, 96x96, 128x128, and 256x256 detail paths.
   - Starter canvases and original face, portrait, character, and object templates.

3. **AI-assisted pixel sketching**
   - Local browser chat sessions.
   - OpenRouter model picker.
   - Optional current-grid summary and PNG snapshot.
   - Strict applyable sketch JSON path.
   - Palette-ID validation before an AI sketch is converted into a `GridDocument`.

4. **Public website support**
   - Home, studio, guides, FAQ, help, legal, unlock, and support pages.
   - Stripe checkout for support/recovery products.
   - Current production Pages rollback plus the branch's Worker parity routes.
   - Security headers, robots policy, crawler controls, and Cloudflare security helper scripts.

5. **Opt-in account and community platform**
   - Google OIDC, onboarding, private cloud projects, revision-aware autosave,
     publishing, discovery, profiles, and generated media.
   - Likes, comments, follows, reports, account export/deletion, and role-gated
     moderation.
   - D1 is authoritative for identity and access; immutable project/media
     objects live in private R2. Anonymous Studio use remains local-first.

## 2. High-Level Architecture

```mermaid
flowchart TD
  User["User in browser"] --> Routes["React app routes (wouter)"]
  Routes --> Studio["/studio workspace"]
  Routes --> SitePages["Home, Guides, FAQ, Help, Legal, Unlock, Support"]

  Studio --> Import["ImportPanel"]
  Studio --> Create["CreationPanel"]
  Studio --> Canvas["CanvasViewer"]
  Studio --> Palette["PalettePanel"]
  Studio --> Optimize["OptimizerPanel"]
  Studio --> AI["AiPanel"]
  Studio --> Export["ExportPanel"]

  Import --> Engine["Pure TypeScript engine"]
  Create --> Engine
  Canvas --> Engine
  Palette --> Engine
  Optimize --> Engine
  AI --> AiSketch["AI sketch validator"]
  AiSketch --> Engine
  Export --> Engine

  Engine --> GridDoc["GridDocument"]
  GridDoc --> Canvas
  GridDoc --> Export

  AI --> ApiAI["/api/ai/*"]
  ApiAI --> OpenRouter["OpenRouter"]

  SitePages --> ApiStripe["/api/stripe/*"]
  ApiStripe --> Stripe["Stripe Checkout"]

  BrowserBuild["Cloudflare Vite build"] --> Worker["Unified Worker + Static Assets"]
  Worker --> ApiAI
  Worker --> ApiStripe
  Worker --> Community["Auth + projects + discovery + social + moderation"]
  Community --> D1["D1 relational authority"]
  Community --> R2["Private R2 projects/media"]
  Worker --> Headers["Dynamic + static security headers"]

  LegacyPages["Current production rollback\nPages commit 654df95"] --> Live["tomodachi.pw until approved cutover"]
```

## 3. Layer Model For This Project

This is how the user's abstraction-layer thinking maps onto the actual codebase.

| Layer                        | What It Means Here                                                                                           | Concrete Project Pieces                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| L0 Domain/game context       | Tomodachi Life: Living the Dream Face Paint options, Palette House workshop creations, and manual Copy Guides | Product copy, guide pages, import presets, palette naming, starter templates                                                               |
| L1 Source inputs             | Raw files and source ideas                                                                                   | Image files, AVIF/JPG/PNG/WebP/BMP/GIF, LTG JSON, starter templates, AI chat prompts                                                       |
| L2 Core data model           | The normalized repaintable representation                                                                    | `GridDocument`, palette IDs, row-major `cells`, metadata, locked colors                                                                    |
| L3 Engine logic              | Pure transformations that do not depend on React                                                             | `grid.ts`, `image-import.ts`, `json-io.ts`, `optimizer.ts`, `canvas-renderer.ts`, `color.ts`, `palette.ts`, `templates.ts`, `ai-sketch.ts` |
| L4 UI state and interactions | How the user edits the document                                                                              | `useGridDocument`, `Studio.tsx`, panels, undo/redo, preview/commit, paint tools                                                            |
| L5 Persistence               | Local state plus explicit opt-in cloud state                                                                 | IndexedDB/local storage for drafts and AI sessions; cloud project bytes only after an explicit account save                                 |
| L6 API/runtime services      | Server or edge endpoints                                                                                     | Unified Hono Worker for local/deployed APIs, dynamic documents, and scheduled jobs; legacy Pages/Express helpers retained for rollback parity |
| L7 External integrations     | Services outside the app                                                                                     | OpenRouter, Stripe, Cloudflare KV, Have I Been Pwned password range API                                                                    |
| L8 Deployment/security/ops   | How it runs publicly and stays controlled                                                                    | Worker Static Assets, `wrangler.jsonc`, isolated D1/R2/KV bindings, `_headers`, Worker security middleware, Doppler-managed secrets, and gated cutover |

## 4. Repository Layout

```text
living-the-grid-studio/
  client/
    public/
      _headers
      _redirects
      robots.txt
      sitemap.xml
      sitemap-images.xml
      manifest.webmanifest
      hero.webp
      canvas-demo-v2.webp
      island-creator-collective.webp
      community-empty-state.webp
      community-search-empty.webp
      community-og.jpg
      empty-state.webp
      palette-swatches.webp
      brand-mark.svg
      icon-192.png
      icon-512.png
      icon-maskable.png
    src/
      App.tsx
      main.tsx
      index.css
      pages/
      components/
        studio/
        ui/
      hooks/
      lib/
        engine/
      contexts/
  functions/                  # Legacy Pages rollback Functions
    _middleware.ts
    api/
      ai/[[path]].ts
      stripe/[[path]].ts
      webhooks/stripe.ts
  server/                     # Shared AI/Stripe helpers retained for parity
    index.ts
    openrouter.ts
    stripe.ts
  shared/
    ai.ts
    community.ts
    products.ts
    residents.ts
  worker/                     # Unified branch runtime
    index.ts
    auth.ts
    accounts.ts
    creations.ts
    discovery.ts
    social.ts
    moderation.ts
    scheduled.ts
  migrations/                 # Forward-only D1 schema
    0001_community.sql
    0002_comment_locks.sql
    0003_atomic_quota_reservations.sql
    0004_preserve_moderation_state.sql
  config/
    deployment-readiness.example.json
  fixtures/
    living-the-grid-real.json
    ltg-indexed-palette-sample.json
    sample-grid-document.json
    creative-templates/
  scripts/
    verify-openapi-routes.ts
    verify-migrations.ts
    verify-ltg-import.ts
    verify-image-import.ts
    verify-creative-templates.ts
    verify-ai-sketch.ts
    verify-residents.ts
    verify-studio-browser.ts
    compare-openrouter-models.ts
    cloudflare-security-insights.ts
    save-creative-template-fixtures.ts
    verify-bundle-budgets.ts
    worker-release.ts
  package.json
  vite.config.ts
  vitest.config.ts
  vitest.preflight.config.ts
  tsconfig.json
  wrangler.jsonc
```

## 5. Main Technologies Being Used

| Area             | Tooling                         | How It Is Used                                                                        |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| Language         | TypeScript                      | Shared across client, engine, Worker, compatibility helpers, and scripts               |
| Frontend         | React 19                        | Studio UI, pages, panels, editor state display                                        |
| Routing          | `wouter`                        | Lightweight route map in `client/src/App.tsx`                                         |
| Build/dev server | Vite 7 + Cloudflare Vite plugin | React development through the Worker runtime; emits Static Assets and a Worker bundle |
| Styling          | Tailwind CSS v4                 | Global styles in `client/src/index.css`; utility styling throughout components        |
| UI primitives    | Radix UI family                 | Buttons, tabs, sliders, selects, tooltips, scroll areas, switches, checkboxes         |
| Icons            | `lucide-react`                  | Studio toolbar icons, panel actions, import/export affordances                        |
| Canvas           | HTML Canvas 2D                  | Grid renderer, image sampling, PNG export, palette sheet generation                   |
| Image import     | Browser canvas APIs             | Decode images, crop/frame/focus, filter brightness/contrast/saturation, sample pixels |
| Color matching   | CIELAB + CIE76 Delta E          | Match source pixels to the closest Studio working-palette color                        |
| State            | React state + `useGridDocument` | Holds `GridDocument`, image preview, undo/redo history, stroke transactions           |
| AI               | OpenRouter Chat Completions     | Model picker, chat, optional image snapshot, applyable sketch JSON                    |
| Payments         | Stripe REST API                 | Checkout sessions and checkout verification without Stripe Node SDK                   |
| ZIP export       | JSZip                           | Bundles reference-pack assets into one downloadable archive                           |
| Target hosting   | Cloudflare Workers + Static Assets | SPA, dynamic documents, APIs, and scheduled jobs in one deployment unit             |
| Production rollback | Cloudflare Pages commit `654df95` | Current `tomodachi.pw` surface retained through approved cutover and soak            |
| Edge runtime     | Hono Worker                     | Legacy AI/Stripe parity plus auth, account, project, discovery, social, and moderation APIs |
| Data/storage     | D1 + private R2                 | Relational authorization state plus immutable validated projects and generated media |
| Edge cache/media | Cloudflare KV + Images          | Bounded OpenRouter cache and deterministic generated preview transformation           |
| Security         | Cloudflare + response headers   | CSP, HSTS, robots, bot/crawler policies, AI crawler blocking helper                   |
| Secrets          | Doppler / env vars              | OpenRouter, Stripe, Cloudflare tokens are expected from environment, not committed    |
| Verification     | `pnpm verify` scripts           | Type-checking and fixture-based verification                                          |

## 6. App Entry And Routing

The app starts in `client/src/main.tsx`, then renders `client/src/App.tsx`.

`App.tsx` wraps all routes with:

- `ErrorBoundary`
- `ThemeProvider`
- keyboard skip link
- `TooltipProvider`
- `Toaster`
- `CookieConsent`

Routes are declared with `wouter`:

| Route                   | Component    | Purpose                            |
| ----------------------- | ------------ | ---------------------------------- |
| `/`                     | `Home`       | Public landing/recovery/studio hub |
| `/studio`               | `Studio`     | Main pixel-art editor              |
| `/privacy`              | `Privacy`    | Legal page                         |
| `/terms`                | `Terms`      | Legal page                         |
| `/cookies`              | `Cookies`    | Cookie policy                      |
| `/disclosure`           | `Disclosure` | Disclosure page                    |
| `/affiliate-disclosure` | `Disclosure` | Alias route                        |
| `/help`                 | `Help`       | Recovery/help page                 |
| `/guides`               | `Guides`     | Guide content                      |
| `/faq`                  | `Faq`        | FAQ                                |
| `/about`                | `About`      | About                              |
| `/unlock`               | `Unlock`     | Paid recovery/consult products     |
| `/support`              | `Support`    | Tip/support products               |
| `/donate`               | `Support`    | Alias route                        |
| `/404`                  | `NotFound`   | Explicit 404                       |
| fallback                | `NotFound`   | Unknown route                      |

## 7. The Central Data Model: `GridDocument`

The core model lives in `client/src/lib/engine/grid.ts`.

```ts
interface GridDocument {
  version: 1;
  width: number;
  height: number;
  cells: (string | null)[];
  palette: PaletteColor[];
  usedColors: string[];
  lockedColors: string[];
  meta: GridMeta;
}
```

Important implementation rules:

- `cells` is a flat row-major array, not a nested 2D grid.
- Each painted cell stores a palette color ID such as `R10C1`, not a raw hex value.
- `null` means empty/transparent/unpainted.
- `palette` is the Studio's original 84-color working palette.
- `usedColors` is derived from current cells.
- `lockedColors` protects colors from optimizer passes.
- `meta.sourceMetadata` is used to preserve imported information, including Living The Grid metadata and optional resident specs.

### Grid Indexing

```text
index = y * width + x
```

```mermaid
flowchart LR
  XY["x,y coordinate"] --> Index["row-major index"]
  Index --> Cell["cells[index]"]
  Cell --> PaletteID["palette ID or null"]
  PaletteID --> Swatch["Studio palette swatch"]
```

### Core Grid Helpers

| Function              | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `createGridDocument`  | Creates a new empty or filled grid                                   |
| `getCell`             | Reads one cell at x/y                                                |
| `setCell`             | Returns an immutable copy with one edited cell                       |
| `setCells`            | Returns an immutable copy with a batch edit                          |
| `bresenhamLine`       | Produces drag interpolation points so fast strokes do not leave gaps |
| `replaceColor`        | Merges or replaces one color ID with another                         |
| `resizeGrid`          | Resizes by preserving existing cell positions                        |
| `resampleGridNearest` | Nearest-neighbor resampling for detail upscaling                     |
| `recomputeUsedColors` | Rebuilds the used-color list after mutations                         |

## 8. Studio Workspace Implementation

The main editor is `client/src/pages/Studio.tsx`.

It wires together:

- `CanvasViewer`
- `ImportPanel`
- `CreationPanel`
- `PalettePanel`
- `OptimizerPanel`
- `AiPanel`
- `ExportPanel`
- `useGridDocument`

```mermaid
flowchart TD
  Studio["Studio.tsx"] --> Hook["useGridDocument"]
  Studio --> CanvasViewer["CanvasViewer"]
  Studio --> ImportPanel["ImportPanel"]
  Studio --> CreationPanel["CreationPanel"]
  Studio --> PalettePanel["PalettePanel"]
  Studio --> OptimizerPanel["OptimizerPanel"]
  Studio --> AiPanel["AiPanel"]
  Studio --> ExportPanel["ExportPanel"]

  Hook --> Doc["doc"]
  Hook --> Preview["imagePreview"]
  Hook --> History["undo/redo history"]

  Studio --> VisibleDoc["visibleDoc = imagePreview ?? doc"]
  VisibleDoc --> CanvasViewer
  VisibleDoc --> PalettePanel
  VisibleDoc --> ExportPanel
```

Key behavior:

- If an image preview exists, the canvas shows `imagePreview` instead of overwriting the real document.
- Export is disabled until the preview is committed or canceled.
- Paint tools are disabled against preview-only state so the user does not accidentally edit a not-yet-committed image conversion.
- Undo/redo comes from `useGridDocument`.
- The current selected color is controlled in `Studio.tsx`.

### Paint Tools

`CreationPanel.tsx` exposes the active tool:

```ts
type PaintTool = "inspect" | "pencil" | "eraser" | "eyedropper" | "fill";
```

Tool behavior:

| Tool       | Behavior                                          |
| ---------- | ------------------------------------------------- |
| Inspect    | Lets the user inspect cells without changing them |
| Pencil     | Paints selected palette ID                        |
| Eraser     | Sets cells to `null`                              |
| Eyedropper | Reads the clicked cell color and selects it       |
| Fill       | Flood-fills a contiguous region using BFS         |

Drag painting uses `CanvasViewer` plus `bresenhamLine` so quick mouse movement still paints a continuous stroke.

## 9. Document State, History, And Preview Flow

`client/src/hooks/useGridDocument.ts` is the state layer.

It owns:

- `doc`
- `imagePreview`
- `history`
- `historyIndex`
- `isLoading`
- `error`

### Undo/Redo

History is append-only from the user's perspective, capped at 50 entries. When a new edit happens after undoing, future history is discarded before adding the new entry.

### Stroke Transactions

Paint strokes are grouped:

1. `beginStroke()` captures the starting document.
2. Drag batches use `paintCells()`.
3. `endStroke()` appends only the final state to history.

This prevents one long drag from becoming dozens or hundreds of undo entries.

### Image Preview

Image import can run as a preview:

1. `previewFromImage(file, options)` converts the image into a temporary `GridDocument`.
2. `imagePreview` is shown on canvas.
3. User can adjust import settings.
4. `Commit Preview` moves the preview into `doc` and history.
5. `Cancel` discards it.

This directly fixes the old problem where changing grid size or import settings required uploading the image again.

## 10. Image Import Pipeline

The import pipeline lives in:

- `client/src/components/studio/ImportPanel.tsx`
- `client/src/lib/engine/image-import.ts`

### User-Facing Import Controls

`ImportPanel` supports:

- Drag and drop.
- Image picker.
- JSON picker.
- Same-file reprocessing.
- Draggable source crop rectangle.
- Full, Square, and Head crop shortcuts.
- Subject-position focus target.
- Grid width/height controls.
- Use-case presets.
- Brightness, contrast, saturation.
- Frame mode.
- Sampling mode.
- Background handling.
- Preview/commit/cancel.

### Supported File Types

Images:

- PNG
- JPG/JPEG
- GIF
- WebP
- AVIF
- BMP

Data:

- JSON

### Use-Case Presets

| Preset        |    Size | Important Settings                                   |
| ------------- | ------: | ---------------------------------------------------- |
| Face Paint    |   64x64 | face focus high, background flatten, moderate colors |
| Character 64  |   64x64 | crisp sampling, stronger contrast/saturation         |
| Face 96       |   96x96 | more facial detail, background flatten               |
| Character 128 | 128x128 | higher detail, more colors                           |
| Sprite 32     |   32x32 | contain mode, high contrast, crisp sampling          |
| Logo 64       |   64x64 | contain mode, limited colors                         |
| Sticker 64    |   64x64 | contain mode, bold colors                            |
| Icon 16       |   16x16 | strong contrast, very limited colors                 |
| Full Image    |   64x64 | contain mode, keeps background                       |
| Pixel Detail  | 256x256 | max detail path, no color limit by default           |

### ImageImportOptions

```ts
interface ImageImportOptions {
  gridWidth: number;
  gridHeight: number;
  maxColors: number;
  useGamePalette: boolean;
  frameMode: "cover" | "contain" | "stretch";
  focusX: number;
  focusY: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  brightness: number;
  contrast: number;
  saturation: number;
  backgroundMode: "keep" | "flatten";
  backgroundTolerance: number;
  backgroundColor: RGB;
  samplingMode: "smooth" | "crisp";
}
```

### Conversion Flow

```mermaid
flowchart TD
  File["Image file"] --> Decode["loadImage()"]
  Decode --> Crop["normalize source crop"]
  Crop --> Placement["computeImagePlacement()"]
  Placement --> Canvas["Draw to offscreen canvas"]
  Canvas --> Filter["ctx.filter = brightness/contrast/saturation"]
  Filter --> Sample["sampleImage()"]
  Sample --> BG{"backgroundMode"}
  BG -->|keep| Match["findClosestPaletteColor()"]
  BG -->|flatten| Flatten["edge-connected background flattening"]
  Flatten --> Match
  Match --> Cells["palette ID cells"]
  Cells --> Limit{"maxColors > 0?"}
  Limit -->|yes| PaletteLimit["passLimitPalette()"]
  Limit -->|no| Doc["GridDocument"]
  PaletteLimit --> Doc
```

### Background Flattening

The background flattener estimates an edge background color and removes edge-connected pixels within a tolerance. This matters for portraits because the app should prioritize face/mask readability instead of wasting palette slots on a wall, mugshot backdrop, or screenshot background.

### Palette Matching

Color matching uses:

- RGB to CIELAB conversion.
- CIE76 Delta E distance.
- `findClosestPaletteColor()`.

This is better than direct RGB distance because it is closer to perceptual color difference.

## 11. JSON And Living The Grid Import

JSON handling lives in `client/src/lib/engine/json-io.ts`.

Supported import paths:

1. Native project JSON exported by this app.
2. Living The Grid JSON v2 style format with:
   - `width`
   - `height`
   - `palette`
   - `pixels` or `grid`
   - metadata such as `source`, `version`, `brush`, `canvas`

### LTG Conversion Flow

```mermaid
flowchart TD
  Json["LTG JSON"] --> Validate["Validate width/height/pixels"]
  Validate --> Palette["Normalize palette entries"]
  Palette --> Exact["Try exact hex match"]
  Exact --> Approx["Fallback to nearest Delta E palette color"]
  Approx --> Cells["Convert indexed pixels to palette IDs"]
  Cells --> Meta["Preserve unknown metadata"]
  Meta --> Warnings["Attach import warnings"]
  Warnings --> Doc["GridDocument"]
```

Important behavior:

- Palette entries can be strings or objects such as `{ hex, rgb, press }`.
- Original H/S/B press metadata is preserved in source metadata where present.
- Exact palette matches are preferred.
- Approximate mappings produce import warnings.
- Unknown LTG metadata is kept instead of being discarded.

## 12. Palette System

The palette is defined in `client/src/lib/engine/palette.ts`.

It includes:

- 77 base colors arranged as 11 rows x 7 columns.
- 7 saturated extras.
- 84 total entries.

Each color has:

```ts
interface PaletteColor {
  id: string;
  name: string;
  hex: string;
  rgb: [number, number, number];
  row: number;
  col: number;
  isSaturated: boolean;
}
```

Examples:

| ID           | Meaning          |
| ------------ | ---------------- |
| `R10C1`      | Black            |
| `R10C7`      | White            |
| `R9C5`       | Beige            |
| `R11C1`      | Charcoal         |
| `R1C2`       | Red              |
| `R6C3`       | Bright Blue      |
| `S1` to `S7` | Saturated extras |

Current caveat:

- The palette has row/column, hex, RGB, and display names.
- It does not claim or include verified in-game color recipes; row and column IDs are Studio planning conventions.

## 13. Canvas Rendering And Coordinate Mapping

Canvas code lives in `client/src/lib/engine/canvas-renderer.ts` and `client/src/components/studio/CanvasViewer.tsx`.

### Renderer Responsibilities

`canvas-renderer.ts` handles:

- Drawing each cell.
- Drawing grid lines.
- Drawing labels.
- Highlighting a selected/hovered color.
- Converting canvas coordinates to grid cells.
- Exporting grid PNGs.
- Exporting palette-sheet PNGs.

### Viewer Responsibilities

`CanvasViewer.tsx` handles:

- Device pixel ratio scaling.
- Resize observation.
- Fit-to-container cell sizing.
- Zoom with mouse wheel.
- Alt/middle-button panning.
- Hover readout.
- Mouse stroke lifecycle.
- Bresenham interpolation between sampled mouse positions.

```mermaid
sequenceDiagram
  participant User
  participant CanvasViewer
  participant Studio
  participant Hook as useGridDocument
  participant Engine as grid.ts

  User->>CanvasViewer: mouse down + drag
  CanvasViewer->>Studio: onStrokeBegin()
  CanvasViewer->>CanvasViewer: sample cells
  CanvasViewer->>Engine: bresenhamLine()
  CanvasViewer->>Studio: onCellDragSegment(cells)
  Studio->>Hook: paintCells(cells, selectedColor)
  Hook->>Engine: setCells()
  User->>CanvasViewer: mouse up
  CanvasViewer->>Studio: onStrokeEnd()
  Studio->>Hook: append one history entry
```

## 14. Optimizer Implementation

The optimizer lives in `client/src/lib/engine/optimizer.ts`.

It is deterministic and currently runs these passes:

1. Merge similar colors.
2. Remove islands.
3. Clean single cells.
4. Limit palette.

### Optimizer Config

```ts
interface OptimizerConfig {
  mergeThreshold: number;
  maxIslandSize: number;
  cleanupSingleCells: boolean;
  maxColors: number;
  lockedColors: string[];
}
```

### Pass Details

| Pass                     | What It Does                                                                     | Why It Matters                           |
| ------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------- |
| `passMergeColors`        | Merges less-used visually similar colors under a Delta E threshold               | Reduces brush changes                    |
| `passRemoveIslands`      | Finds small connected regions and replaces them with dominant neighboring colors | Removes noisy regions                    |
| `passCleanupSingleCells` | Removes isolated single-cell artifacts                                           | Makes guides easier to repaint           |
| `passLimitPalette`       | Repeatedly merges the closest color pair until under the target color count      | Creates simpler palette-limited variants |

`lockedColors` protect important colors from being merged or changed by optimizer decisions.

## 15. Creation And Starter Template System

Starter templates live in:

- `client/src/lib/engine/templates.ts`
- `fixtures/creative-templates/*.json`

The templates are original/generic starter designs, not direct copyrighted sprite dumps. They are meant to help the user create fan-style masks, icons, horror characters, mascots, and brand-like marks from safe starting shapes.

### Current Template Categories

| Category        | Examples                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Faces & Portraits | Face Guide, Portrait Bust, Arcade Fighter, Space Helmet, Robot Face                                              |
| Characters      | Mascot Head, Space Crew, Tiny Dino, Cute Monster, Red Cap Hero, Green Adventurer, Blue Speed Mascot                 |
| Horror & Spooky | Haunted Mascot, Bald Teacher, Masked Slasher, Pumpkin Ghoul, Ghost Sheet, Vampire Count, Zombie Buddy, Creepy Clown |
| Marks & Objects | Heart Sticker, Star Badge, Smile Icon, Letter Mark, Controller Icon, Racing Kart, Pizza Slice, Sword Badge          |

### Template Flow

```mermaid
flowchart LR
  TemplateButton["Template button"] --> CreateDoc["createCreativeTemplateDocument(id)"]
  CreateDoc --> GridDoc["GridDocument"]
  GridDoc --> Canvas["CanvasViewer"]
  GridDoc --> Palette["PalettePanel"]
  GridDoc --> Export["ExportPanel"]
```

The fixture scripts can regenerate saved JSON fixtures for these templates so template output can be tested and reviewed outside the UI.

## 16. AI Sketch And Chat Implementation

AI code is split between client, shared types, and API helpers.

| File                                       | Role                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `client/src/components/studio/AiPanel.tsx` | UI for chat sessions, model selection, options, sending messages, applying sketches |
| `shared/ai.ts`                             | Shared request/response/model/sketch TypeScript types and model presets             |
| `client/src/lib/engine/ai-sketch.ts`       | Converts validated AI sketch rows into a `GridDocument`                             |
| `server/openrouter.ts`                     | Shared OpenRouter request, prompt, model list, parsing, salvage logic               |
| `worker/legacy.ts`                         | Unified Worker parity routes for `/api/ai/*`, Stripe, and the Stripe webhook         |
| `functions/api/ai/[[path]].ts`             | Legacy Pages Function retained for the production rollback deployment                |
| `vite.config.ts`                           | Cloudflare Vite plugin entry for the local Worker runtime                            |

### AI Session Storage

AI sessions are saved in browser `localStorage` under:

```text
ltg.ai.sessions.v1
```

The app keeps up to 20 AI chat sessions. This remains intentionally local-first;
the community D1 database does not store these chat transcripts. This means:

- Good: AI sessions do not require an account.
- Good: private sketches/chats stay in the browser unless sent to OpenRouter.
- Limitation: no cross-device sync.
- Limitation: clearing browser storage removes sessions.

### AI Request Options

The user can choose:

- One of the curated free OpenRouter model presets. The picker and the
  server-side allowlist reject custom, arbitrary, and paid model IDs.
- Include current grid summary.
- Include current grid PNG snapshot.
- Request applyable sketch JSON.

If `includeGridImage` is on, `AiPanel` exports the current grid to a clean PNG data URL and sends it as an image part. The receiving model must support image input for real visual critique.

### OpenRouter System Prompt Behavior

The system prompt tells the model to act as an expert pixel-art director inside Tomodachi Studio. When sketch JSON is requested, it requires:

- Valid JSON only.
- Default 16x16 unless user asks larger.
- Palette color IDs only.
- `null` for transparent/empty cells.
- Multiple colors.
- Clear shapes.
- Exact row/column counts.

### AI Sketch Validation

`createGridDocumentFromAiSketch()` enforces:

- Width and height must be integers from 8 to 64.
- `rows.length` must equal height.
- Each row length must equal width.
- Every non-null cell must be a known palette ID.

If validation passes, the result becomes a normal `GridDocument` with:

```text
meta.sourceFormat = "ai-openrouter-sketch"
meta.sourceMetadata.generatedBy = "OpenRouter"
```

### AI Response Salvage

`server/openrouter.ts` includes a best-effort parser for truncated JSON. If a model starts a valid sketch but runs out of tokens, the parser attempts to recover complete rows, pads missing rows with `null`, and returns a warning.

This is useful because free/cheap models often truncate long grids.

## 17. Resident And Abstraction-Island Data

Resident planning data lives in `shared/residents.ts`.

This file defines:

- `QuestHook`
- `MiiResidentSpec`
- `IslandDistrict`
- `IslandGrowthStage`
- `IslandFacilityPlan`
- `ResidentCreationStep`
- `CrossLayerInteraction`
- `DISTRICTS`
- `STARTER_RESIDENTS`
- validation helpers

### Districts Currently Modeled

| District            | Role                                              |
| ------------------- | ------------------------------------------------- |
| Silicon Beach       | Physical invention layer                          |
| Boolean Boardwalk   | Logic and truth-table layer                       |
| Circuit Plaza       | NAND, combinational, and sequential circuit layer |
| Architecture Atrium | CPU, stored-program, and machine model layer      |
| Assembly Avenue     | Machine language and assembler layer              |
| VM Village          | Stack VM and hardware-independence layer          |
| Compiler Grove      | Language, syntax, parsing, and compilation layer  |
| Oz Oasis            | Computation model and concurrency layer           |
| Perlis Peak         | Programming philosophy and language-thought layer |

### QuestHook Shape

```ts
interface QuestHook {
  id: string;
  title: string;
  trigger:
    | "residentChat"
    | "districtBridge"
    | "relationshipConflict"
    | "studySession";
  input: string;
  artifactType:
    | "truthTable"
    | "circuit"
    | "assembly"
    | "vmTrace"
    | "program"
    | "stateTrace";
  bridgeQuestion: string;
  expectedOutput: string;
  correctionHint: string;
  retryVariant: string;
  acceptanceKeywords?: string[];
}
```

### How Resident Specs Connect To Exports

`ExportPanel.tsx` checks:

```ts
doc.meta.sourceMetadata?.miiResidentSpec;
```

If it validates with `validateMiiResidentSpec()`, the exported HTML reference page includes resident details such as:

- Resident name.
- District.
- Bridge below.
- Bridge above.
- Pixel notes.
- Source credits.

The resident feature sheet is not currently a full visible editor tab in the studio. The schema and export validation path exist, but the UI tab was removed in a later pass.

## 18. Export System

Export code lives in:

- `client/src/components/studio/ExportPanel.tsx`
- `client/src/lib/engine/json-io.ts`
- `client/src/lib/engine/canvas-renderer.ts`

### Export Buttons

| Button                     | Output                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Export JSON                | Project JSON                                                                                                                             |
| Export Guide (with labels) | Labeled PNG guide                                                                                                                        |
| Export Clean Image         | Grid PNG without labels/grid lines                                                                                                       |
| Export Reference Pack      | ZIP archive with JSON, labeled guide PNG, clean PNG, palette sheet PNG, paint-order CSV, source notes, manifest, and HTML reference page |

### Current Reference Pack Behavior

The reference pack is now a single ZIP download:

- `project.json`
- `guide-labeled.png`
- `guide-clean.png`
- `palette-sheet.png`
- `paint-order.csv`
- `source-notes.txt`
- `manifest.json`
- `reference.html`

The HTML reference includes:

- Project name.
- Grid size.
- Used color count.
- Fan-made/unaffiliated note.
- Optional validated resident feature sheet.
- Palette swatches.
- Full project JSON in a `<pre>` block.

### Export Copy Alignment

Crawler-shell and public product copy now describe the implemented ZIP reference pack: PNG, JSON, CSV, text notes, manifest JSON, and HTML. PDF export is not implemented or advertised.

## 19. Public Visual Assets

These are the raster/static assets in `client/public/`.

| Asset                   | Used For                             |
| ----------------------- | ------------------------------------ |
| `hero.webp`             | Public homepage hero/branding visual |
| `canvas-demo-v2.webp`   | Original workshop-robot grid demo    |
| `island-creator-collective.webp` | Discover community hero artwork |
| `community-empty-state.webp` | General community empty states  |
| `community-search-empty.webp` | Search-specific empty states    |
| `community-og.jpg`      | Default OpenGraph/social card image  |
| `empty-state.webp`      | Empty state illustration             |
| `palette-swatches.webp` | Palette preview visual               |
| `brand-mark.svg`        | Source artwork for installed-app icons |
| `icon-192.png`          | PWA/app icon                         |
| `icon-512.png`          | PWA/app icon                         |
| `icon-maskable.png`     | Maskable PWA icon                    |
| `manifest.webmanifest`  | PWA metadata                         |
| `ads.txt`               | Ad network declaration               |
| `robots.txt`            | Search/AI crawler policy             |
| `sitemap.xml`           | Page sitemap                         |
| `sitemap-images.xml`    | Image sitemap                        |
| `_headers`              | Static-asset headers (and Pages rollback headers) |
| `_redirects`            | Static redirects retained for Pages rollback      |

### Embedded Asset Preview Paths

These links render when the Markdown viewer supports local relative images:

![Hero image](client/public/hero.webp)

![Canvas demo](client/public/canvas-demo-v2.webp)

![Creator collective](client/public/island-creator-collective.webp)

![Palette swatches](client/public/palette-swatches.webp)

![OpenGraph image](client/public/community-og.jpg)

## 20. Cloudflare Worker, Pages Rollback, And Security

### Deployment Config

`wrangler.jsonc` is the Worker configuration source of truth. Its core shape is:

```jsonc
{
  "name": "tomodachi-studio",
  "main": "./worker/index.ts",
  "compatibility_date": "2025-05-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/creation/*", "/u/*", "..."]
  }
}
```

Local, staging, and production environments declare isolated D1, private R2,
KV, Images, rate-limit, OAuth, and secret bindings. The compatibility date is
intentionally held for parity and must be advanced in a separate verified
change.

### Unified Worker Routes

`worker/index.ts` registers one policy boundary for:

| Route group | Primary module | Purpose |
| --- | --- | --- |
| `/api/ai/*`, `/api/stripe/*`, Stripe webhook | `worker/legacy.ts` | Preserve the existing public API behavior in the Worker |
| `/api/auth/*`, `/api/me/*` | `worker/auth.ts`, `worker/accounts.ts` | OIDC, sessions, onboarding, export, deletion |
| `/api/creations/*` | `worker/creations.ts`, `worker/media.ts` | Private revisions, generated media, publishing |
| discovery/search/profile routes | `worker/discovery.ts`, `worker/documents.ts` | Public data and safe dynamic metadata |
| social/report routes | `worker/social.ts` | Likes, comments, follows, and reports |
| moderation routes | `worker/moderation.ts` | Role-gated moderation transitions |
| scheduled handler | `worker/scheduled.ts` | Cleanup, deletion, retention, and popularity work |

### Legacy Pages Rollback Compatibility

Production still serves Cloudflare Pages commit `654df95`. Its
`functions/api/*` handlers and `functions/_middleware.ts` remain in the tree so
that rollback deployment continues to provide AI, Stripe, webhook, and crawler
behavior while the Worker is staged and soaked. They are not a second target
implementation for new community features.

On the branch, `worker/documents.ts` serves safe crawler/public-profile/creation
documents and delegates ordinary SPA assets to `ASSETS`. On the Pages rollback,
`functions/_middleware.ts` serves crawler-specific HTML shells:

- Social crawlers get compact OpenGraph/Twitter metadata.
- Search crawlers get static text, internal links, and JSON-LD.
- Regular users get the normal SPA.

Both paths keep crawler responses separated from normal browser assets and
escape dynamic metadata before placing it in HTML.

### HTTP Security Headers

`client/public/_headers` configures Static Asset and Pages rollback responses.
The Worker applies the aligned policy to dynamic responses in code. The policy
includes:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Strict-Transport-Security`
- `X-DNS-Prefetch-Control`
- `Content-Security-Policy`
- `Content-Security-Policy-Report-Only` for Trusted Types observation
- long immutable cache for `/assets/*`
- no-cache for `/index.html`
- no-store for `/api/*`

### Robots And AI Crawlers

`client/public/robots.txt`:

- Allows social preview bots.
- Allows normal search indexing.
- Adds content signals:
  - `search=yes`
  - `ai-input=no`
  - `ai-train=no`
- Disallows known AI/training crawlers such as GPTBot, ClaudeBot, CCBot, Bytespider, Google-Extended, PerplexityBot, and others.

Important distinction:

- `robots.txt` is advisory.
- Cloudflare Bot Management / AI bot blocking is the enforcement layer.

### Cloudflare Security Helper

`scripts/cloudflare-security-insights.ts` helps audit and apply:

- AI bots protection: `block`
- crawler protection: `enabled`
- managed robots mode: `policy_only`
- skip-rule review
- Worker route audit

It needs a Cloudflare API token with permissions such as:

- `Zone:Bot Management:Read`
- `Zone:Bot Management:Edit`
- `Zone:Zone WAF:Read`
- `Zone:Zone WAF:Edit`
- `Zone:Workers Routes:Read`
- `Zone:Workers Routes:Edit`
- `Account:Workers Scripts:Read`

Secrets are expected through env vars such as:

```text
CLOUDFLARE_API_TOKEN
CF_API_TOKEN
CLOUDFLARE_ZONE_ID
CLOUDFLARE_ZONE_NAME
```

The user has indicated these are managed through Doppler.

## 21. Stripe Product And Checkout Implementation

Stripe code is split across:

- `shared/products.ts`
- `server/stripe.ts`
- Worker parity routes in `worker/legacy.ts`
- legacy Pages rollback Function under `functions/api/stripe/[[path]].ts`

### Product Catalog

`shared/products.ts` is the source of truth for sellable products.

Current categories:

- `recovery`
- `consult`
- `support`

Current products include:

- `breach-recovery-checklist`
- `consult-30`
- `support-jar-5`
- `support-jar-15`
- `support-jar-25`

### Why The Stripe SDK Is Not Used

`server/stripe.ts` uses direct REST calls instead of the official Stripe Node SDK because Cloudflare Workers do not support every Node crypto API the SDK expects. The project manually flattens nested objects into Stripe form encoding.

## 22. Local Development Runtime

The main scripts are in `package.json`.

| Command                             | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `pnpm install`                      | Install dependencies                                      |
| `pnpm dev`                          | Start Vite dev server on port 3000 or next available port |
| `pnpm build`                        | Build Worker Static Assets and the unified Worker bundle  |
| `pnpm start` / `pnpm preview`       | Preview the Vite/Worker build locally                     |
| `pnpm check`                        | TypeScript-check client/shared code and the Worker         |
| `pnpm test:worker`                  | Run Worker integration tests with local bindings          |
| `pnpm worker:dry-run:staging`       | Build and validate the staging artifact without deploying |
| `pnpm worker:dry-run:production`    | Build and validate the production artifact without deploying |
| `pnpm verify`                       | Type-check plus contract, migration, and fixture checks    |
| `pnpm verify:studio`                | Browser-style studio verification script                  |
| `pnpm cloudflare:security-insights` | Cloudflare security audit/helper                          |
| `pnpm compare:models`               | Compare OpenRouter model behavior                         |
| `pnpm save:templates`               | Save creative template fixtures                           |

### Worker Development Runtime

`vite.config.ts` loads React before the Cloudflare Vite plugin, so local API,
dynamic-document, scheduled-handler, and Static Asset behavior uses
`worker/index.ts` rather than an Express approximation. Local bindings persist
under `.wrangler/state`.

The small `pagesRollbackAssets()` build plugin copies the client output to
`dist/public` solely so the existing Pages project can continue building a
rollback-compatible static artifact while the Worker migration is in progress.

## 23. Environment Variables And Secrets

The project expects secrets from the shell/Doppler and target-specific
Cloudflare secret bindings, not from committed files. Pages environment values
apply only to the current rollback deployment.

| Variable                                | Used By                           | Purpose                                   |
| --------------------------------------- | --------------------------------- | ----------------------------------------- |
| `OPENROUTER_API_KEY`                    | AI API                            | Authenticate OpenRouter requests          |
| `PUBLIC_SITE_URL`                       | AI/Stripe/Cloudflare              | Referer, success URLs, canonical site URL |
| `STRIPE_SECRET_KEY`                     | Stripe API                        | Create and verify checkout sessions       |
| `STRIPE_WEBHOOK_SECRET`                 | Stripe webhook                    | Verify Stripe webhook signatures          |
| `CLOUDFLARE_API_TOKEN` / `CF_API_TOKEN` | Cloudflare script                 | Bot/security config audit/apply           |
| `CLOUDFLARE_ZONE_ID`                    | Cloudflare script                 | Optional direct zone lookup               |
| `CLOUDFLARE_ZONE_NAME`                  | Cloudflare script                 | Defaults to `tomodachi.pw`                |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Worker OIDC                    | Google authorization-code login           |
| `OIDC_COOKIE_KEY` / `SESSION_PEPPER` / `PSEUDONYM_KEY` | Worker security | Encrypted OIDC transaction, session hashing, privacy-preserving keys |
| `DB`                                    | Worker D1 binding                 | Identity, authorization, creation, and community state |
| `PROJECTS`                              | Worker private R2 binding         | Immutable project and generated-media objects |
| `EDGE_CACHE`                            | Worker KV binding                 | Bounded OpenRouter and webhook cache       |
| `IMAGES`                                | Worker Images binding             | Deterministic generated preview transcoding |

## 24. Verification Coverage

Current verification scripts:

| Script                         | What It Verifies                             |
| ------------------------------ | -------------------------------------------- |
| `verify-openapi-routes.ts`     | Community OpenAPI methods/paths match registered Worker routes |
| `verify-migrations.ts`         | Migrations 0001-0004 plus SQLite foreign-key/integrity checks |
| `verify-ltg-import.ts`         | Living The Grid fixture import compatibility |
| `verify-image-import.ts`       | Image import path and options                |
| `verify-creative-templates.ts` | Starter templates produce valid grid docs    |
| `verify-ai-sketch.ts`          | AI sketch validation/conversion              |
| `verify-residents.ts`          | Resident schema/spec validity                |
| `verify-studio-browser.ts`     | Browser-style studio smoke path              |

`pnpm verify` runs:

```text
pnpm check
pnpm verify:openapi
pnpm verify:migrations
pnpm verify:ltg
pnpm verify:image-import
pnpm verify:templates
pnpm verify:ai-sketch
pnpm verify:residents
```

Worker integration, preflight, browser, and bundle suites remain separate as
`test:worker`, `test:preflight`, `test:e2e`, and `verify:bundle`.

## 25. Fixtures

Fixtures are used for repeatable testing and documentation.

| Fixture                                    | Purpose                             |
| ------------------------------------------ | ----------------------------------- |
| `fixtures/living-the-grid-real.json`       | Real Living The Grid export fixture |
| `fixtures/ltg-indexed-palette-sample.json` | Smaller indexed palette sample      |
| `fixtures/sample-grid-document.json`       | Native app grid document sample     |
| `fixtures/creative-templates/*.json`       | Saved outputs for starter designs   |
| `fixtures/creative-templates/index.json`   | Template fixture index              |

## 26. Full Studio Data Flow

```mermaid
flowchart TD
  A["User input"] --> B{"Input type"}
  B -->|Image| C["Image import options"]
  B -->|LTG JSON| D["importLtgNative"]
  B -->|Native JSON| E["importGridJson"]
  B -->|Starter design| F["createCreativeTemplateDocument"]
  B -->|AI prompt| G["OpenRouter sketch JSON"]

  C --> H["imageToGridDocument"]
  D --> I["GridDocument"]
  E --> I
  F --> I
  G --> J["createGridDocumentFromAiSketch"]
  J --> I
  H --> K["Preview GridDocument"]
  K --> L{"Commit?"}
  L -->|Yes| I
  L -->|No| A

  I --> M["Canvas render"]
  I --> N["Palette analysis"]
  I --> O["Manual edits"]
  I --> P["Optimizer"]
  O --> I
  P --> I

  I --> Q["Exports"]
  Q --> R["JSON"]
  Q --> S["Labeled PNG"]
  Q --> T["Clean PNG"]
  Q --> U["Palette sheet PNG"]
  Q --> V["HTML reference"]
```

## 27. What Was Recently Improved

Based on the current code, these improvements are already implemented:

- Image upload accepts common browser image formats including AVIF.
- Image import uses preview before commit.
- Same uploaded image can be reprocessed when grid size/options change.
- Source crop can be adjusted with a draggable crop rectangle and Full/Square/Head shortcuts.
- Subject position can be adjusted with a draggable target over the source image.
- Background flattening exists for face/character import.
- Brightness, contrast, saturation, crop, frame mode, focus, sampling mode, and color limits are part of import options.
- Detail presets include 64, 96, 128, and 256 paths.
- Manual pixel editing exists through pencil, eraser, eyedropper, fill, and inspect.
- Drag painting groups into a single undo history entry.
- Fast drag strokes use Bresenham interpolation.
- Canvas detail can be upscaled/resampled after creation.
- Starter designs include people/masks, generic characters, horror/spooky, and object/mark designs.
- AI chat sessions are saved locally.
- AI models can return applyable sketch JSON.
- AI can optionally receive a current-grid visual snapshot.
- AI sketch output is validated against palette IDs before being applied.
- Export includes individual JSON/PNG assets and a ZIP reference pack with guide PNGs, palette sheet PNG, paint-order CSV, source notes, manifest, and HTML reference.
- Resident schema and abstraction-island planning data exist in shared code.
- Cloudflare security helpers and robots policy exist for AI bot/crawler controls.

## 28. Known Gaps And Best Next Improvements

These are the most useful next engineering targets.

| Priority | Improvement                                                         | Why It Matters                                                                      |
| -------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P0       | Complete the approval-gated staging Worker acceptance and live performance trace | The branch is implemented locally, but production must remain on Pages until staging evidence and cutover approval exist |
| P1       | Add per-pass optimizer preview and change log                       | Makes optimization trustworthy instead of magical                                   |
| P1       | Add repaintability score                                            | Shows why one grid is easier to paint than another                                  |
| P2       | Validate Studio colors against documented, legally usable references | Improves manual matching without claiming proprietary game data                      |
| P2       | Add editable resident feature-sheet UI                              | Schema exists, but the studio UI tab is not currently active                        |
| P2       | Move heavy image/optimizer/export work into a Web Worker            | Prevents UI blocking at 128x128 and 256x256                                         |
| P2       | Add Playwright visual tests                                         | Pixel output and upload flows need browser-level regression checks                  |
| P3       | Decide whether AI chat histories should ever opt into cloud sync     | Project sync now exists, but AI sessions intentionally remain browser-local          |

## 29. Implementation Constraints To Preserve

These constraints keep the project coherent:

- Keep `GridDocument.cells` as palette IDs, not raw hex strings.
- Keep engine modules pure and React-free when possible.
- Keep import/optimizer/export deterministic.
- Keep AI as a suggestion/sketch layer, not an unvalidated grid mutator.
- Keep source image reprocessing non-destructive.
- Keep preview separate from committed document state.
- Keep anonymous edit/import/export local; first cloud save must remain explicit and private.
- Keep secrets out of repo files.
- Keep resident/source credits and fan-made/unaffiliated notes in exports.
- Keep starter designs original/generic and let users adapt local assets themselves.

## 30. Quick Mental Model

```text
Files, photos, templates, or AI prompts
  -> normalized into GridDocument
  -> displayed through CanvasViewer
  -> edited through useGridDocument
  -> simplified through optimizer passes
  -> exported as repaintable guide assets
```

The project works best when every new feature answers this question:

```text
Does this make the final grid easier, clearer, or more accurate to repaint in the game?
```
