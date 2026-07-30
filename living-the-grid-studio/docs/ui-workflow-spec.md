# UI Workflow Specification — Living The Grid Repaint Studio

**Version:** 1.0  
**Last Updated:** 2026-07-14

---

## Layout

The studio uses an asymmetric two-column layout optimized for the primary task of inspecting and editing a pixel grid:

| Zone | Width | Content |
|------|-------|---------|
| Canvas workspace | ~65% | Grid rendering with zoom, pan, grid lines, and labels |
| Control panel | ~35% (320-384px) | Task-oriented sidebar with Import, Create, Palette, Optimize, AI, Copy Guide, and Export |
| Top bar | Full width, 44px | Project name, view toggles, undo/redo |

## Navigation

The application has two routes:

- `/` — Landing page with project overview, features, and roadmap.
- `/studio` — Main editor workspace.

The top bar provides a home button to return to the landing page from the studio.

## Tab Workflow

The control panel uses seven keyboard-operable tabs grouped into Start, Edit,
Improve, and Finish:

### Tab 1: Import

**Purpose:** Load a project from an image or JSON file.

**Controls:**
- Drag-and-drop zone accepting images (PNG, JPG, GIF, WebP, AVIF, and BMP) and JSON files.
- Separate buttons for "Image" and "JSON" file pickers.
- Grid size sliders (width and height, 8-256, step 8) for image imports.
- Loading spinner during conversion.

**Behavior:**
- Dropping an image triggers palette quantization at the configured grid size.
- Dropping a JSON file attempts native format parsing, then falls back to LTG format.
- On success, the canvas displays the grid and the Palette tab populates.
- On error, a toast notification explains the issue.

### Tab 2: Create

**Purpose:** Paint and inspect the current grid with the same canvas used by the
rest of the Studio workflow.

**Controls:**
- Pencil, eraser, eyedropper, fill, and inspect tools.
- Smooth 1/3/7/13/19/27px and snapped 4/8/16/32px brush footprints.
- Mirror, independent cell/stamp/section/center guides, zoom, fit, and hand-pan controls.
- Quick colors plus access to the complete Studio palette.
- Undo and redo for bounded document edits.

**Behavior:**
- New work starts on one transparent 256×256 reference surface. Older/custom
  documents remain editable but are never labeled one-for-one until explicitly
  converted.
- Pointer, pen, touch, mouse, and keyboard input edit one authoritative canvas.
- The cursor outlines the exact cells a smooth or snapped footprint will mutate.
- A browser-local source can remain beside the canvas or appear Under, Over, or
  in a Split comparison without entering project data.
- A completed stroke is one undoable operation.
- Switching tools safely closes any active stroke.

### Tab 3: Palette

**Purpose:** Inspect and manage the colors used in the current grid.

**Sections:**
1. **Header:** Color count and total cell count.
2. **Used Colors List:** Sorted by usage (descending). Each entry shows:
   - Color swatch
   - Color name and ID (e.g., "Coral R3C2")
   - Cell count and percentage
   - Usage bar (proportional width)
   - Lock/unlock toggle
   - Merge button
3. **Studio Palette Reference:** 11×7 grid of all 77 base colors plus a row of 7 saturated extras. Colors in use get a visible border.

**Interactions:**
- Hovering a swatch highlights all cells of that color on the canvas.
- Clicking a swatch selects it (persistent highlight).
- Clicking the merge button enters "merge mode": the next color clicked becomes the merge target.
- Clicking the lock button protects the color from optimizer passes.

### Tab 4: Optimize

**Purpose:** Run deterministic optimization passes to simplify the grid.

**Controls:**
- **Merge Similar Colors:** Slider for Delta E threshold (1-30, default 10).
- **Remove Islands:** Slider for max island size (1-10, default 3).
- **Single-Cell Cleanup:** Toggle switch (default on).
- **Limit Palette:** Toggle switch + slider for max color count (2-84).
- **Run Optimizer** button to execute all enabled passes.

**Behavior:**
- Running the optimizer pushes a new entry to the undo history.
- A toast notification summarizes the results (colors removed, cells changed).
- The palette tab updates to reflect the new color distribution.

### Tab 5: AI

**Purpose:** Request a bounded, validated pixel sketch or refinement without
giving a model direct control of the canvas.

**Controls:**
- Curated model and creation-mode choices.
- Prompt input and explicit current-grid snapshot consent.
- Review, apply, and discard actions for a returned sketch.

**Behavior:**
- AI use requires an onboarded account and explicit third-party-processing
  consent.
- Only validated palette IDs and bounded dimensions can reach the review step.
- Applying an accepted sketch creates one undoable document revision.

### Tab 6: Copy Guide

**Purpose:** Recreate the current artwork manually, row by row, without
mutating it.

**Controls:**
- Previous, complete-and-next, next, and reset progress actions.
- Deterministic one-based row runs with palette identifiers and highlighted
  cells on the existing canvas.
- Direct access to the browser-local reference image when one is available.

**Behavior:**
- Copy Guide keeps the canvas read-only and never creates a project revision.
- Progress stays in local browser storage for the current project.

### Tab 7: Export

**Purpose:** Download the finished project in various formats.

**Options:**
- **Export JSON:** Downloads the GridDocument as a `.json` file.
- **Export Guide (with labels):** Downloads a PNG with grid lines and paint-by-numbers labels.
- **Export Clean Image:** Downloads a PNG without grid lines or labels.
- **Export Reference Pack:** Downloads a ZIP containing project JSON, labeled
  and clean PNG guides, a palette sheet, paint-order CSV, notes, a manifest,
  and an HTML reference page.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Mouse wheel | Zoom in/out on canvas |
| Alt+drag | Pan the canvas |
| Middle-click+drag | Pan the canvas |

## Empty State

When no project is loaded, the canvas area displays a centered illustration with the text "No project open" and a prompt to import a file from the right panel.

## Merge Mode

Merge mode is a temporary state activated by clicking the merge button on a color:

1. A banner appears at the top of the control panel: "Merge mode: Click a target color to merge [source] into it."
2. The user clicks any other color (in the palette list, the Studio palette grid, or directly on the canvas).
3. All cells of the source color are replaced with the target color.
4. A toast confirms the merge.
5. Merge mode exits automatically. The user can also cancel by clicking "Cancel" in the banner.

## Responsive Behavior

The studio is designed for desktop use (1024px+ viewport). On smaller screens:

- The control panel collapses to a bottom sheet.
- The canvas fills the full width.
- Touch zoom and pan are supported.

For the MVP, the primary target is desktop browsers.
