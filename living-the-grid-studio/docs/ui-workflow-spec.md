# UI Workflow Specification — Living The Grid Repaint Studio

**Version:** 1.0  
**Last Updated:** 2026-04-26

---

## Layout

The studio uses an asymmetric two-column layout optimized for the primary task of inspecting and editing a pixel grid:

| Zone | Width | Content |
|------|-------|---------|
| Canvas workspace | ~65% | Grid rendering with zoom, pan, grid lines, and labels |
| Control panel | ~35% (320-384px) | Tabbed sidebar with Import, Palette, Optimize, Export |
| Top bar | Full width, 44px | Project name, view toggles, undo/redo |

## Navigation

The application has two routes:

- `/` — Landing page with project overview, features, and roadmap.
- `/studio` — Main editor workspace.

The top bar provides a home button to return to the landing page from the studio.

## Tab Workflow

The control panel uses four tabs that correspond to the linear workflow:

### Tab 1: Import

**Purpose:** Load a project from an image or JSON file.

**Controls:**
- Drag-and-drop zone accepting images (PNG, JPG, GIF) and JSON files.
- Separate buttons for "Image" and "JSON" file pickers.
- Grid size sliders (width and height, 8-256, step 8) for image imports.
- Loading spinner during conversion.

**Behavior:**
- Dropping an image triggers palette quantization at the configured grid size.
- Dropping a JSON file attempts native format parsing, then falls back to LTG format.
- On success, the canvas displays the grid and the Palette tab populates.
- On error, a toast notification explains the issue.

### Tab 2: Palette

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
3. **Game Palette Reference:** 11×7 grid of all 77 base colors plus a row of 7 saturated extras. Colors in use get a visible border.

**Interactions:**
- Hovering a swatch highlights all cells of that color on the canvas.
- Clicking a swatch selects it (persistent highlight).
- Clicking the merge button enters "merge mode": the next color clicked becomes the merge target.
- Clicking the lock button protects the color from optimizer passes.

### Tab 3: Optimize

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

### Tab 4: Export

**Purpose:** Download the finished project in various formats.

**Options:**
- **Export JSON:** Downloads the GridDocument as a `.json` file.
- **Export Guide (with labels):** Downloads a PNG with grid lines and paint-by-numbers labels.
- **Export Clean Image:** Downloads a PNG without grid lines or labels.
- **Export Reference Pack:** Downloads all three files (JSON, labeled PNG, HTML reference page).

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
2. The user clicks any other color (in the palette list, the game palette grid, or directly on the canvas).
3. All cells of the source color are replaced with the target color.
4. A toast confirms the merge.
5. Merge mode exits automatically. The user can also cancel by clicking "Cancel" in the banner.

## Responsive Behavior

The studio is designed for desktop use (1024px+ viewport). On smaller screens:

- The control panel collapses to a bottom sheet.
- The canvas fills the full width.
- Touch zoom and pan are supported.

For the MVP, the primary target is desktop browsers.
