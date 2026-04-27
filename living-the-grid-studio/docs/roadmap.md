# Roadmap — Living The Grid Repaint Studio

**Last Updated:** 2026-04-26

---

## Phase Overview

| Phase | Title | Status | Description |
|-------|-------|--------|-------------|
| 0 | JSON Fixture Inspection | Next | Inspect the real Living The Grid JSON and finalize the import adapter |
| 1 | JSON Round-Trip | Current | Import JSON → normalize to GridDocument → render canvas → export JSON |
| 2 | Palette Panel | In Progress | Usage counts, color locking, manual merges, palette editing |
| 3 | One-Click Optimizer | In Progress | Deterministic color merging, island removal, cleanup passes |
| 4 | Image Upload | In Progress | Crop, resize, and palette quantization from any uploaded image |
| 5 | Reference Pack Export | Planned | Download complete reference packs with guide, palette sheet, and JSON |
| 6 | AI Suggestions | Future | AI as a suggestion layer only — never a hidden automatic editor |

---

## Phase 0: JSON Fixture Inspection

**Goal:** Obtain and document the real Living The Grid JSON format.

**Tasks:**
- [ ] Place the `living-the-grid-*.json` fixture file in `fixtures/`
- [ ] Pretty-print and inspect the JSON structure
- [ ] Document the schema in `docs/json-format-notes.md`
- [ ] Update `json-io.ts` with the real format adapter
- [ ] Write test cases for import/export round-trip

**Blocked on:** The actual JSON fixture file from a Living The Grid save.

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
- [x] 84-color Tomodachi Life palette data (`palette.ts`)
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

**Goal:** Convert any uploaded image into a palette-limited grid.

**Completed:**
- [x] Image loading and canvas sampling
- [x] Resize to configurable grid dimensions
- [x] Nearest-palette-color matching using CIELAB Delta E
- [x] Grid size controls (8-256, step 8)

**Remaining:**
- [ ] Crop tool (select a region before quantization)
- [ ] Brightness/contrast pre-processing
- [ ] Preview before committing the import

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

## Phase 6: AI Suggestions (Future)

**Goal:** Optional AI-powered suggestions that the user explicitly accepts or rejects.

**Principles:**
- AI is a **suggestion layer only** — never a hidden automatic editor.
- Every AI suggestion is presented as a preview that the user can accept, modify, or dismiss.
- The user always has the final say.

**Potential features:**
- Suggest optimal merge pairs based on visual impact analysis.
- Suggest color replacements that improve contrast.
- Generate a "painting order" that minimizes brush changes.
- Auto-detect and suggest removal of compression artifacts.

---

## Contributing

To contribute to any phase:

1. Check the task list above for unchecked items.
2. Create a branch named `phase-{N}/{feature-name}`.
3. Implement the feature with tests.
4. Open a PR referencing this roadmap.
