# AI Context Document — Mii-pixelart / Living The Grid Repaint Studio

> **Purpose:** Drop this entire document into any AI assistant's context window to give it complete, working knowledge of this repository. It covers the product vision, every module's purpose and API, the data model, the design system, the UI architecture, the file I/O model, the roadmap, and every open engineering task.

---

## 1. Repository Overview

**Repo:** `RazonIn4K/Mii-pixelart` (private)  
**Local path:** `/Users/davidortiz/Git-Projects/Mii-pixelart/`  
**Live web app:** Deployed via Manus at `https://living-the-grid-studio.manus.space` (checkpoint `686de1c7`)

The repository contains a single sub-project:

```
Mii-pixelart/
├── README.md
└── living-the-grid-studio/        ← the entire application lives here
    ├── client/                    ← React SPA (Vite + TypeScript + Tailwind 4)
    ├── server/                    ← Thin Express static-file server (do not touch)
    ├── shared/                    ← Template compatibility stubs (do not touch)
    ├── docs/                      ← Six documentation files
    ├── fixtures/                  ← Test data and JSON schema discovery
    ├── reference-pack-template/   ← Template for exported reference packs
    └── ideas.md                   ← Design brainstorm (Paper Studio chosen)
```

---

## 2. Product Vision

**Living The Grid Repaint Studio** is a browser-first pixel art repaint tool for *Tomodachi Life: Living the Dream* (Nintendo Switch). Its core insight is that existing image-to-pixel-grid converters do not optimize grids for the actual task of hand-painting them inside the game's Palette House. This studio closes that gap.

**The strongest product angle: not just "turn image into pixels," but "make this actually repaintable by hand."**

The target user is a creative gamer who wants to recreate a meme, portrait, or design as a vinyl item, book cover, clothing pattern, or house exterior in the game. The studio handles the tedious conversion and cleanup work so the user can focus on painting.

**Non-goals (intentional):**
- No direct export to the game (Tomodachi Life has no import API).
- No server-side processing — all work happens in the browser.
- No accounts or logins.
- No AI edits without explicit user consent.

**Success metric:** A user can take any image and, within five minutes, produce a reference pack they can follow square-by-square in the Palette House without confusion about which color goes where.

---

## 3. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | React 19 + TypeScript | Type safety for complex grid operations |
| Build | Vite 7 + esbuild | Fast HMR, native ESM |
| Styling | Tailwind CSS 4 + shadcn/ui (New York style) | Utility-first with accessible Radix primitives |
| Routing | Wouter | Lightweight client-side routing; two routes: `/` and `/studio` |
| State | React hooks only (`useState`, `useCallback`) | No Redux, no Zustand, no external state library |
| Canvas | HTML5 Canvas API | Direct pixel rendering for the grid display |
| Color science | Custom CIELAB + Delta E CIE76 | Perceptual color matching to the game palette |
| Package manager | pnpm | Required; do not use npm or yarn |
| Fonts | Noto Sans JP (UI) + Noto Sans Mono (data/coords) | Loaded via Google Fonts CDN in `client/index.html` |

**Key scripts** (run from `living-the-grid-studio/`):

```bash
pnpm dev          # Start Vite dev server on port 3000
pnpm build        # Production build (Vite frontend + esbuild server bundle)
pnpm check        # TypeScript type-check (tsc --noEmit)
pnpm format       # Prettier
```

---

## 4. Design System — "Paper Studio"

The chosen design philosophy is **Japanese Stationery Minimalism**. The interface is deliberately quiet so the pixel art is always the most visually prominent thing on screen.

### Color Palette (OKLCH)

| Token | OKLCH | Purpose |
|-------|-------|---------|
| `--background` | `oklch(0.98 0.005 90)` | Off-white paper surface |
| `--foreground` | `oklch(0.35 0.01 60)` | Graphite text |
| `--primary` | `oklch(0.58 0.2 25)` | Warm red — the sole accent color |
| `--border` | `oklch(0.9 0.005 90)` | Subtle warm gray |
| `--muted-foreground` | `oklch(0.55 0.01 60)` | Secondary text |
| `--color-grid-line` | `oklch(0.84 0.03 230)` | Pale blue engineering paper lines |

The warm red accent (`oklch(0.58 0.2 25)`) is used for: the brand dot, the primary button, active/selected states, the canvas highlight ring, and the "actually repaintable" hero text.

### Custom CSS Classes

```css
.graph-paper          /* 20px grid, pale blue lines */
.graph-paper-fine     /* 10px minor + 50px major grid (engineering paper look) */
.red-dot              /* 8px warm red circle — brand indicator */
.red-dot-sm           /* 6px variant */
.swatch-label         /* Monospace pill for palette IDs */
.section-header       /* Small-caps uppercase tracking-widest label */
```

### Typography

- **UI text:** Noto Sans JP, `font-feature-settings: "palt"`, `letter-spacing: 0.01em`
- **Data/coordinates:** Noto Sans Mono (palette IDs like `R1C3`, cell labels, step numbers)

---

## 5. Data Model

The central data structure is the **`GridDocument`**, defined in `client/src/lib/engine/grid.ts`. It is the single source of truth for every project and is fully serializable to JSON.

```typescript
interface GridDocument {
  version: 1;                       // Schema version for forward compatibility
  meta: {
    name: string;                   // Human-readable project name
    createdAt: string;              // ISO 8601
    modifiedAt: string;             // ISO 8601
    sourceImage?: string;           // Original filename if imported from image
    sourceJson?: string;            // Original filename if imported from JSON
    notes?: string;
  };
  width: number;                    // Grid width in cells
  height: number;                   // Grid height in cells
  cells: (string | null)[];         // Flat row-major array of palette color IDs
  usedColors: string[];             // Derived from cells (recomputed after every mutation)
  lockedColors: string[];           // Color IDs the optimizer must never touch
}
```

**Critical design decision:** `cells` stores **palette color IDs** (e.g., `"R1C3"`, `"S4"`) — never raw hex values. This ensures every color in the document maps directly to a physical swatch the user can find in the game's Palette House. The only exception is the placeholder LTG native import adapter, which temporarily stores hex strings until the real fixture is inspected.

**Cell indexing:** `cells[y * width + x]` — row-major order, 0-based.

---

## 6. Engine Modules

All engine modules live in `client/src/lib/engine/` and are **pure TypeScript with zero React dependencies**. They can be tested and used outside the UI.

### 6.1 `palette.ts` — Game Palette Data

Exports the complete 84-color Tomodachi Life palette as `TOMODACHI_PALETTE: PaletteColor[]`.

```typescript
interface PaletteColor {
  id: string;                       // e.g. "R1C3" (Row 1, Col 3) or "S4" (saturated)
  name: string;                     // e.g. "Bright Red"
  hex: string;                      // e.g. "#FF0000"
  rgb: [number, number, number];    // e.g. [255, 0, 0]
  row: number;                      // 1-based row in game palette grid
  col: number;                      // 1-based column
  isSaturated: boolean;             // true for the 7 fully saturated extras (Row 12)
}
```

**Structure:** 11 rows × 7 columns = 77 base colors + 7 saturated extras (Row 12, IDs `S1`–`S7`). Rows are: Reds, Oranges, Yellows, Greens, Cyans, Blues, Purples, Pinks, Browns/Skin tones, Grays, Warm Grays.

**Helper functions:** `getPaletteColor(id)`, `getBasePalette()`, `getSaturatedExtras()`, `getPaletteByRow()`.

**Important note:** The palette values are community-documented approximations. They may not be pixel-perfect matches to the actual game values. Once the real LTG JSON fixture is inspected (Phase 0), the hex values should be cross-referenced.

### 6.2 `color.ts` — Color Science

Provides conversions between RGB, HSL, and CIELAB color spaces, plus CIE76 Delta E distance for perceptual color matching.

**Exported types:** `RGB { r, g, b }`, `HSL { h, s, l }`, `Lab { L, a, b }`

**Key functions:**

| Function | Description |
|----------|-------------|
| `hexToRgb(hex)` | `"#FF0000"` → `{r:255, g:0, b:0}` |
| `rgbToHex(rgb)` | `{r:255, g:0, b:0}` → `"#FF0000"` |
| `rgbToHsl(rgb)` | RGB → HSL |
| `rgbToLab(rgb)` | RGB → CIELAB (D65 illuminant, sRGB linearization) |
| `deltaE(lab1, lab2)` | CIE76 Delta E — lower = more similar |
| `deltaERgb(c1, c2)` | Delta E directly from two RGB values |
| `findClosestPaletteColor(rgb)` | Returns `{ color: PaletteColor, distance: number }` — the nearest game palette color |
| `findClosestPaletteColors(rgb, n)` | Returns the N nearest palette colors sorted by distance |

The palette Lab values are pre-computed lazily on first call and cached as a module-level singleton (`_paletteLab`).

### 6.3 `grid.ts` — Grid Document Model

All mutations return **new documents** (immutable pattern). The `modifiedAt` timestamp is updated on every mutation.

**Key functions:**

| Function | Description |
|----------|-------------|
| `createGridDocument(w, h, name?)` | Factory — creates an empty grid |
| `getCell(doc, x, y)` | Returns color ID at (x, y) or null |
| `setCell(doc, x, y, colorId)` | Immutable cell setter |
| `getColorUsageCounts(doc)` | Returns `Map<colorId, count>` |
| `recomputeUsedColors(doc)` | Rebuilds `usedColors` from `cells` — call after any bulk mutation |
| `replaceColor(doc, fromId, toId)` | Replace all cells of one color with another |
| `toGrid2D(doc)` | Convert to `(string|null)[][]` 2D array |
| `fromGrid2D(grid, name?)` | Create GridDocument from 2D array |
| `resizeGrid(doc, newW, newH)` | Resize, filling new cells with null |

### 6.4 `components.ts` — Connected-Component Detection

Finds contiguous regions of the same color using BFS flood fill (4-connected).

```typescript
interface Component {
  colorId: string;
  cells: [number, number][];        // (x, y) pairs
  size: number;
  bounds: [minX, minY, maxX, maxY];
}
```

**Key functions:**

| Function | Description |
|----------|-------------|
| `findComponents(doc)` | All connected components in the grid |
| `findIslands(doc, maxSize?)` | Components with `size <= maxSize` (default 3) |
| `findDominantNeighborColor(doc, component)` | Most common color adjacent to a component |
| `countComponents(doc)` | Total component count (lower = easier to repaint) |

### 6.5 `optimizer.ts` — Repaint Optimizer

Runs four deterministic passes in sequence. Each pass is a pure function returning a new `GridDocument`. All passes respect `lockedColors`.

```typescript
interface OptimizerConfig {
  mergeThreshold: number;           // Delta E threshold for color merging (default: 10)
  maxIslandSize: number;            // Max island size to remove (default: 3)
  cleanupSingleCells: boolean;      // Remove lone pixels (default: true)
  maxColors: number;                // Palette limit, 0 = no limit (default: 0)
  lockedColors: string[];           // Color IDs to never modify
}
```

**The four passes:**

1. **`passMergeColors`** — Sorts colors by usage count (ascending), then for each rare color finds any other color within `mergeThreshold` Delta E and replaces the rare one with the common one. Prevents visual degradation by always merging into the more-used color.

2. **`passRemoveIslands`** — Uses `findIslands()` to find all components ≤ `maxIslandSize` cells, then replaces each island with `findDominantNeighborColor()`. Eliminates speckle noise that would require constant brush changes.

3. **`passCleanupSingleCells`** — Scans every cell; if ≥3 of its 4 neighbors are a different color, replaces it with the most common neighbor. Targets single-pixel outliers that survive island removal.

4. **`passLimitPalette`** — Iteratively finds the two most similar unlocked colors and merges the less-used into the more-used, until `usedColors.length <= maxColors`. Used when the game imposes a color count limit.

**Main entry point:** `optimizeGrid(doc, config?)` — runs all four passes and returns `{ doc, log: OptimizationResult[] }`. Each `OptimizationResult` includes `description`, `cellsChanged`, `colorsBefore`, `colorsAfter`.

### 6.6 `json-io.ts` — JSON Import/Export

**Native GridDocument format:**
- `exportGridJson(doc)` → JSON string (pretty-printed)
- `importGridJson(json)` → GridDocument (validates version, dimensions, cell count)
- `downloadGridDocument(doc)` → triggers browser download as `{name}-{timestamp}.json`
- `downloadJson(json, filename)` → generic browser download helper

**Living The Grid native format adapter (PLACEHOLDER — needs real fixture):**
- `importLtgNative(json)` → tries native GridDocument first, then the LTG placeholder adapter
- `LtgNativeFormat` interface is a best-guess: `{ width, height, grid: number[][], palette: string[], name? }`
- `convertLtgToGrid()` currently maps palette indices to hex strings — this needs to be updated to map to `TOMODACHI_PALETTE` IDs once the real format is known

**⚠️ Phase 0 blocker:** The real `living-the-grid-*.json` fixture has not been inspected. The LTG adapter is a placeholder. See `docs/json-schema-discovery.md` for the discovery plan.

### 6.7 `canvas-renderer.ts` — Canvas Rendering

Renders a `GridDocument` onto an `HTMLCanvasElement` as a paint-by-numbers pixel guide.

```typescript
interface RenderOptions {
  cellSize: number;                 // Pixels per cell (default: 16)
  showGrid: boolean;                // Grid line overlay (default: true)
  showLabels: boolean;              // Paint-by-numbers numbers (default: false)
  highlightColorId: string | null;  // Highlight all cells of this color
  zoom: number;                     // Zoom level (default: 1.0)
  panX: number; panY: number;       // Pan offset in pixels
  gridColor: string;                // Grid line color (default: pale blue)
  gridWidth: number;                // Grid line width (default: 0.5)
  labelFontSize: number;            // 0 = auto-scale
}
```

**Key functions:**

| Function | Description |
|----------|-------------|
| `renderGrid(ctx, doc, options?)` | Main render function — clears, draws cells, grid, highlight, labels |
| `canvasToCell(canvasX, canvasY, options?)` | Hit-test: canvas pixel → grid cell (x, y) |
| `exportGridAsPng(doc, options?)` | Returns PNG data URL (off-screen canvas, no pan) |
| `downloadGridAsPng(doc, options?)` | Triggers browser download as `{name}-guide.png` |

**Label numbering:** Colors are assigned numbers 1–N sorted by descending usage count (most-used color = label 1). Labels use Noto Sans Mono font and auto-contrast (dark text on light cells, white text on dark cells).

### 6.8 `image-import.ts` — Image Import

Converts an uploaded image file into a `GridDocument` via canvas sampling and palette quantization.

```typescript
interface ImageImportOptions {
  gridWidth: number;                // Target grid width (default: 32)
  gridHeight: number;               // Target grid height (default: 32)
  maxColors: number;                // 0 = no limit
  useGamePalette: boolean;          // true = map to TOMODACHI_PALETTE (default: true)
}
```

**Pipeline:**
1. `loadImage(file)` — creates `HTMLImageElement` from `File` via `URL.createObjectURL`
2. `sampleImage(img, gridWidth, gridHeight)` — draws image scaled to grid size on an off-screen canvas, reads pixel data
3. For each pixel: `findClosestPaletteColor(rgb)` → palette color ID
4. Returns `GridDocument` with `meta.sourceImage = file.name`

**Remaining work (Phase 4):** Crop tool, brightness/contrast pre-processing, preview before committing.

### 6.9 `index.ts` — Barrel Export

Re-exports everything from all engine modules for convenient import:
```typescript
export * from "./palette";
export * from "./color";
export * from "./grid";
export * from "./components";
export * from "./optimizer";
export * from "./json-io";
export * from "./canvas-renderer";
export * from "./image-import";
```

---

## 7. React Layer

### 7.1 `useGridDocument` Hook

The central state management hook. Lives in `client/src/hooks/useGridDocument.ts`. All UI components interact with the grid exclusively through this hook.

**State shape:**
```typescript
interface GridDocumentState {
  doc: GridDocument | null;
  history: GridDocument[];          // Undo stack (max 50 entries)
  historyIndex: number;
  isLoading: boolean;
  error: string | null;
}
```

**Returned API:**

| Property/Method | Type | Description |
|----------------|------|-------------|
| `doc` | `GridDocument \| null` | Current document |
| `isLoading` | `boolean` | True during async image import |
| `error` | `string \| null` | Last error message |
| `canUndo` / `canRedo` | `boolean` | History navigation state |
| `colorCounts` | `Map<string, number>` | Usage counts for current doc |
| `setDoc(doc)` | function | Replace document (pushes to history) |
| `createNew(w, h, name?)` | function | Create empty grid |
| `importFromImage(file, options?)` | async function | Image → GridDocument |
| `importFromJson(jsonString)` | function | JSON string → GridDocument (tries native then LTG) |
| `mergeColors(fromId, toId)` | function | Replace all `fromId` cells with `toId` |
| `toggleColorLock(colorId)` | function | Add/remove from `lockedColors` |
| `runOptimizer(config?)` | function | Run all optimizer passes |
| `exportJson()` | function | Returns JSON string or null |
| `undo()` / `redo()` | function | History navigation |

### 7.2 Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Home.tsx` | Landing page — product overview, features, roadmap |
| `/studio` | `Studio.tsx` | Main editor workspace |
| `*` | `NotFound.tsx` | 404 fallback |

### 7.3 `Studio.tsx` — Editor Workspace

The main editor page. Composes all studio components around `useGridDocument`.

**Layout:** Full-screen `h-screen flex flex-col`
- **Top bar (44px):** Home link, project name with red dot, view toggles (grid lines, labels), undo/redo buttons
- **Main area:** `flex-1 flex overflow-hidden`
  - **Left — Canvas area (flex-1, ~65%):** `CanvasViewer` when doc exists, graph-paper empty state when not
  - **Right — Control panel (w-80 lg:w-96, ~35%):** Four-tab sidebar: Import / Palette / Optimize / Export

**Merge mode:** When `mergeSource` is set, a banner appears above the tabs. Clicking any color (in palette or on canvas) completes the merge. Clicking the same color cancels.

**Keyboard shortcuts:** `Ctrl/Cmd+Z` = undo, `Ctrl/Cmd+Shift+Z` = redo.

**Error handling:** `useEffect` watches `error` from the hook and calls `toast.error()` via Sonner.

### 7.4 Studio Components

#### `CanvasViewer.tsx`
Manages the interactive canvas viewport. Handles zoom (mouse wheel), pan (middle-click drag or Alt+drag), hover hit-testing, and click hit-testing.

**Props:** `doc`, `highlightColorId`, `showGrid`, `showLabels`, `onCellClick(x, y, colorId)`, `onCellHover(x, y, colorId)`

**Internal state:** `zoom` (0.25–8.0), `pan {x, y}`, `isPanning`, `panStart`. Cell size is computed from container bounds to fit the grid.

**Overlays:** Zoom percentage pill (bottom-right), grid summary `{width}×{height} · {N} colors` (bottom-left).

#### `PalettePanel.tsx`
Shows used colors sorted by descending usage count, plus the full 84-color game reference grid.

**Props:** `usedColors`, `colorCounts`, `lockedColors`, `highlightColorId`, `onColorHover`, `onColorClick`, `onToggleLock`, `onMergeRequest`

**Used colors list:** Each row shows swatch, name, palette ID (`R1C3`), absolute count, percentage, usage bar, lock button, and merge button. Clicking a swatch sets `highlightColorId` (or completes a merge if merge mode is active).

**Game reference grid:** Full 84-color grid (11×7 base + 7 saturated) with tooltips showing name, ID, and hex.

#### `OptimizerPanel.tsx`
Controls for the four optimizer passes. Holds local UI state for all config values.

**Controls:** Merge threshold slider (1–30, default 10), island size slider (1–10, default 3), single-cell cleanup switch, palette limit switch + max colors slider.

**Run button:** Calls `onRunOptimizer(config)` with the current settings.

#### `ImportPanel.tsx`
Drag-and-drop import for images and JSON files.

**Controls:** Drop zone (distinguishes JSON from image by file extension), grid width/height sliders (8–256, step 8, default 32×32), hidden file inputs for image and JSON.

**File handling:** JSON files are read with `FileReader` and forwarded as strings. Image files are forwarded as `File` objects with grid size options.

#### `ExportPanel.tsx`
Four export actions:

| Button | Action |
|--------|--------|
| Export JSON | `downloadGridDocument(doc)` |
| Export PNG (labeled) | `downloadGridAsPng(doc, { showGrid: true, showLabels: true })` |
| Export PNG (clean) | `downloadGridAsPng(doc, { showGrid: false, showLabels: false })` |
| Export Reference Pack | Downloads JSON + labeled PNG + HTML reference page |

The HTML reference page is generated inline: it includes project metadata, palette swatches with labels, and the full project JSON in a `<pre>` block.

---

## 8. File I/O Model

All file operations use browser-native APIs. **No files ever leave the user's browser.**

| Operation | Mechanism |
|-----------|-----------|
| Image import | `FileReader` → `HTMLImageElement` → off-screen `<canvas>` → pixel sampling |
| JSON import | `FileReader` → `JSON.parse` → validation → `GridDocument` |
| PNG export | Off-screen `<canvas>` → `canvas.toDataURL("image/png")` → `<a>` click |
| JSON export | `JSON.stringify` → `Blob` → `URL.createObjectURL` → `<a>` click |
| HTML export | Template string → `Blob` → `URL.createObjectURL` → `<a>` click |

---

## 9. Documentation Files

All docs live in `living-the-grid-studio/docs/`:

| File | Purpose |
|------|---------|
| `product-spec.md` | Vision, target user, core workflow, MVP feature set, non-goals, success metrics |
| `architecture.md` | Stack rationale, module breakdown, data model, optimization pipeline, UI architecture, file I/O, future considerations |
| `roadmap.md` | Phase-by-phase task lists with completion status checkboxes |
| `json-schema-discovery.md` | Step-by-step plan for inspecting the real LTG JSON fixture and updating the import adapter |
| `repaint-optimizer-plan.md` | Optimizer design principles, pass descriptions, config table, quality metrics, future enhancements |
| `ui-workflow-spec.md` | Detailed interaction spec: layout, tab behaviors, merge mode sequence, keyboard shortcuts, empty state, responsive expectations |

---

## 10. Fixtures

`living-the-grid-studio/fixtures/`:

| File | Description |
|------|-------------|
| `sample-grid-document.json` | Minimal 4×4 test grid using 4 palette colors (R1C3, R4C3, R6C3, R10C2) — use for testing import/export round-trips |
| `living-the-grid-*.json` | **MISSING — place the real LTG export here** |

---

## 11. Roadmap and Open Tasks

### Phase 0 — JSON Fixture Inspection (NEXT — BLOCKED)
- [ ] Place `living-the-grid-1777253291337.json` (or any LTG export) in `fixtures/`
- [ ] Inspect the JSON structure and answer the questions in `docs/json-schema-discovery.md`
- [ ] Create `docs/json-format-notes.md` with the real schema
- [ ] Update `LtgNativeFormat` interface in `json-io.ts`
- [ ] Update `convertLtgToGrid()` to map real color representations to `TOMODACHI_PALETTE` IDs
- [ ] Write round-trip test cases

### Phase 4 — Image Upload (Remaining)
- [ ] Crop tool — select a sub-region before quantization
- [ ] Brightness/contrast pre-processing sliders
- [ ] Preview before committing the import

### Phase 5 — Reference Pack Export (Remaining)
- [ ] Palette sheet image (swatches with labels and game IDs)
- [ ] Step-by-step painting order suggestion (fewest brush changes)
- [ ] ZIP bundle of all export files

### Phase 6 — AI Suggestions (Future)
- AI is a **suggestion layer only** — never automatic
- Every suggestion is a preview the user explicitly accepts or dismisses
- Ideas: optimal merge pairs, contrast improvements, painting order, artifact detection

### Home Page Fix
- The "View on GitHub" button in `Home.tsx` currently links to `RazonIn4K/Upwork-Workbook` — update to `RazonIn4K/Mii-pixelart`

---

## 12. Key Conventions and Constraints

**Immutability:** All engine functions return new objects. Never mutate `GridDocument` in place.

**Color IDs vs hex:** The `cells` array always stores palette color IDs (`"R1C3"`, `"S4"`), never raw hex. The only place hex appears is in the placeholder LTG adapter and in `useGamePalette: false` mode of the image importer.

**`recomputeUsedColors` contract:** Call this after any bulk mutation to `cells`. Individual helpers like `replaceColor` call it automatically, but if you directly assign `doc.cells`, you must call it manually.

**Locked colors:** The `lockedColors` array in `GridDocument` is the single source of truth for which colors the optimizer must skip. The `useGridDocument` hook passes `doc.lockedColors` into every `optimizeGrid` call automatically.

**No backend:** The `server/` directory is a thin Express static-file server for deployment only. Never add API endpoints or business logic there. All processing is client-side.

**Tailwind 4 OKLCH:** All color values in `index.css` use OKLCH format. Do not use HSL. The `@theme inline` block maps CSS variables to Tailwind tokens.

**shadcn/ui components:** Import from `@/components/ui/*`. The project uses the New York style variant. Do not install additional UI libraries.

**Toast notifications:** Use `sonner` (`import { toast } from "sonner"`). Do not use react-toastify or @radix-ui/react-toast.

**Routing:** Use `wouter` (`import { Link, useLocation } from "wouter"`). Do not use react-router-dom.

**Path aliases:** `@/` maps to `client/src/`. Use `@/lib/engine/...`, `@/components/...`, `@/hooks/...` etc.

---

## 13. Static Assets

Generated hero images are hosted on Manus CDN and referenced directly in code:

| Variable | URL | Used in |
|----------|-----|---------|
| `HERO_IMG` | `https://d2xsxph8kpxj0f.cloudfront.net/.../hero-graph-paper-*.webp` | `Home.tsx` hero section |
| `CANVAS_IMG` | `https://d2xsxph8kpxj0f.cloudfront.net/.../canvas-demo-*.webp` | `Home.tsx` features section |
| `PALETTE_IMG` | `https://d2xsxph8kpxj0f.cloudfront.net/.../palette-swatches-*.webp` | `Home.tsx` features section |
| `EMPTY_STATE_IMG` | `https://d2xsxph8kpxj0f.cloudfront.net/.../empty-state-*.webp` | `Studio.tsx` empty state |

Do not store images locally in the project directory — this causes deployment timeouts.

---

## 14. How to Run Locally

```bash
# 1. Clone
git clone https://github.com/RazonIn4K/Mii-pixelart.git
cd Mii-pixelart/living-the-grid-studio

# 2. Install dependencies
pnpm install

# 3. Start dev server
pnpm dev
# → http://localhost:3000

# 4. Type-check
pnpm check
```

---

## 15. Quick Reference: Where Things Live

| What you want to change | File |
|------------------------|------|
| Game palette colors | `client/src/lib/engine/palette.ts` |
| Color matching algorithm | `client/src/lib/engine/color.ts` |
| Grid data model | `client/src/lib/engine/grid.ts` |
| Optimizer passes | `client/src/lib/engine/optimizer.ts` |
| Connected-component detection | `client/src/lib/engine/components.ts` |
| JSON import/export + LTG adapter | `client/src/lib/engine/json-io.ts` |
| Canvas rendering | `client/src/lib/engine/canvas-renderer.ts` |
| Image import pipeline | `client/src/lib/engine/image-import.ts` |
| All state management | `client/src/hooks/useGridDocument.ts` |
| Routes | `client/src/App.tsx` |
| Landing page | `client/src/pages/Home.tsx` |
| Editor workspace | `client/src/pages/Studio.tsx` |
| Canvas viewer + zoom/pan | `client/src/components/studio/CanvasViewer.tsx` |
| Palette panel + merge mode | `client/src/components/studio/PalettePanel.tsx` |
| Optimizer controls | `client/src/components/studio/OptimizerPanel.tsx` |
| Import drag-and-drop | `client/src/components/studio/ImportPanel.tsx` |
| Export actions | `client/src/components/studio/ExportPanel.tsx` |
| Design tokens + CSS classes | `client/src/index.css` |
| Fonts | `client/index.html` |
| Product vision | `docs/product-spec.md` |
| Architecture | `docs/architecture.md` |
| Phase-by-phase tasks | `docs/roadmap.md` |
| LTG JSON format discovery | `docs/json-schema-discovery.md` |
| Test fixtures | `fixtures/` |
