# Roadmap — Living The Grid Repaint Studio

**Last Updated:** 2026-04-27

---

## Phase Overview

| Phase | Title                   | Status      | Description                                                                                               |
| ----- | ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| 0     | JSON Fixture Inspection | ✅ Complete | Inspect the real Living The Grid JSON and finalize the import adapter                                     |
| 1     | JSON Round-Trip         | Current     | Import JSON → normalize to GridDocument → render canvas → export JSON                                     |
| 2     | Palette Panel           | In Progress | Usage counts, color locking, manual merges, palette editing                                               |
| 3     | One-Click Optimizer     | In Progress | Deterministic color merging, island removal, cleanup passes                                               |
| 4     | Image Upload            | In Progress | Framing, background cleanup, tone controls, color limiting, and palette quantization from uploaded images |
| 5     | Reference Pack Export   | Planned     | Download complete reference packs with guide, palette sheet, and JSON                                     |
| 6     | AI Suggestions          | Partial     | OpenRouter chat/sketch tab exists; future work can add merge, contrast, and paint-order suggestions       |

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

## Phase 1: JSON Round-Trip (Current)

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

- [x] 84-color Tomodachi Life: Living the Dream palette data (`palette.ts`)
- [x] Color usage counts and percentage display
- [x] Color lock/unlock toggle
- [x] Manual merge mode (click source → click target)
- [x] Game palette reference grid (11×7 + saturated row)
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

## Phase 4: Image Upload

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
- [x] Mii Mask, Character 64, Face 96, Character 128, Sprite 32, Logo 64, Sticker 64, Icon 16, Full 64, and Pixel 256 import presets
- [x] Photo vs Pixel/Logo sampling modes for smoother portraits and sharper local character/logo assets
- [x] Retain the last uploaded source image for settings changes
- [x] Reprocess retained images without reopening the file picker
- [x] Edge-connected background cleanup for portrait imports
- [x] Brightness, contrast, and saturation pre-processing
- [x] Max-color limiting is applied during image import
- [x] Non-destructive image preview with commit/cancel controls
- [x] 28 original starter templates for face guides, mascot heads, space-crew suits, tiny dinos, cute monsters, horror mascots, bald schoolhouse teachers, masked villains, pumpkin ghouls, sheet ghosts, vampires, zombies, spooky clowns, heart stickers, star badges, compact icons, portrait busts, cap heroes, adventurers, speed mascots, arcade fighters, space helmets, robot faces, letter marks, controller icons, racing karts, pizza slices, and sword badges
- [x] Saved native JSON fixtures for all creative templates (`fixtures/creative-templates/`, regenerated with `pnpm save:templates`)
- [x] Blank starter canvases for Mii mask, character, sprite, sticker, icon, and full-image work
- [x] Inspect, pencil, eraser, eyedropper, and fill bucket tools for manual creation/touch-up
- [x] Canvas detail controls to resample current grids to 64, 96, 128, 256, or 2x dimensions without overflowing the workspace
- [x] Pure placement and background-cleanup coverage (`scripts/verify-image-import.ts`)
- [x] Browser smoke coverage for creation tools, local character assets, generated mascot/sprite/emblem/sticker/icon fixtures, JPG, AVIF, LTG JSON, unsupported files, preview commit, and export downloads (`scripts/verify-studio-browser.ts`)

**Remaining:**

- [ ] Full crop rectangle / pan-and-zoom crop controls

---

## Phase 5: Reference Pack Export

**Goal:** One-click download of everything needed to repaint in-game.

**Completed:**

- [x] JSON export
- [x] PNG guide export (with grid lines and labels)
- [x] Clean PNG export (without overlays)
- [x] HTML reference page export

**Remaining:**

- [ ] Palette sheet image (swatches with labels and IDs)
- [ ] Step-by-step painting order suggestion
- [ ] ZIP bundle of all files

---

## Phase 6: AI Suggestions

**Goal:** Optional AI-powered suggestions that the user explicitly accepts or rejects.

**Completed:**

- [x] Server-side OpenRouter proxy routes (`/api/ai/status`, `/api/ai/models`, `/api/ai/chat`) so API keys stay out of the browser bundle
- [x] AI tab in Studio with 25 OpenRouter model presets, custom model entry, chat history, local saved sessions, sketch mode, and current-grid summary toggle
- [x] Optional visual grid snapshot context so image-capable models can inspect the current canvas before proposing a sketch
- [x] Applyable AI sketch JSON path that converts palette-ID rows into a normal undoable `GridDocument`
- [x] Fenced/loose JSON recovery for models that wrap valid sketch JSON in Markdown
- [x] AI sketch validation coverage (`scripts/verify-ai-sketch.ts`) and browser smoke coverage for the AI tab
- [x] Local session persistence in browser `localStorage`; no database is required for single-device private chat history
- [x] OpenRouter model-comparison script (`pnpm compare:models`) that saves ranked-model outputs to `reports/` when `OPENROUTER_API_KEY` is configured

**Principles:**

- AI is a **suggestion layer only** — never a hidden automatic editor.
- Every AI suggestion is presented as a preview that the user can accept, modify, or dismiss.
- The user always has the final say.

**Potential features:**

- Suggest optimal merge pairs based on visual impact analysis.
- Suggest color replacements that improve contrast.
- Generate a "painting order" that minimizes brush changes.
- Auto-detect and suggest removal of compression artifacts.
- Let models propose localized edits to the current grid instead of replacing the full document.
- Optional future database only if the app adds accounts, cross-device sync, shared team sessions, or public galleries.

---

## Contributing

To contribute to any phase:

1. Check the task list above for unchecked items.
2. Create a branch named `phase-{N}/{feature-name}`.
3. Implement the feature with tests.
4. Open a PR referencing this roadmap.
