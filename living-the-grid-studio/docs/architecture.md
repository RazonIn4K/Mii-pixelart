# Technical Architecture — Living The Grid Repaint Studio

**Version:** 1.0  
**Last Updated:** 2026-04-26

---

## Overview

The studio is a **client-side single-page application** built with React 19 and TypeScript. All processing happens in the browser — no server, no uploads, no accounts. This architecture was chosen to match the privacy-first approach of the original Living The Grid tool and to ensure zero-latency interaction with the pixel grid.

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | React 19 + TypeScript | Type safety for complex grid operations |
| Build | Vite 7 | Fast HMR, native ESM |
| Styling | Tailwind CSS 4 + shadcn/ui | Utility-first with accessible components |
| Routing | Wouter | Lightweight client-side routing |
| State | React hooks (useState, useCallback) | No external state library needed |
| Canvas | HTML5 Canvas API | Direct pixel rendering for grid display |
| Color Science | Custom CIELAB + Delta E (CIE76) | Perceptual color matching |

## Module Architecture

The engine is organized as a set of pure TypeScript modules with no React dependencies, making them testable and reusable outside the UI:

```
client/src/lib/engine/
├── palette.ts          # 84-color Tomodachi Life palette data
├── color.ts            # RGB ↔ HSL ↔ CIELAB conversion, Delta E matching
├── grid.ts             # GridDocument type system, cell access, analysis
├── components.ts       # Connected-component detection (flood fill)
├── optimizer.ts        # Deterministic repaint optimization passes
├── json-io.ts          # JSON import/export, LTG native format adapter
├── canvas-renderer.ts  # Canvas rendering with grid lines, labels, zoom
├── image-import.ts     # Image loading, sampling, palette quantization
└── index.ts            # Barrel export
```

## Data Model

The central data structure is the **GridDocument**, a serializable representation of a pixel grid project:

```typescript
interface GridDocument {
  version: 1;
  meta: {
    name: string;
    createdAt: string;
    modifiedAt: string;
    sourceImage?: string;
    sourceJson?: string;
  };
  width: number;
  height: number;
  cells: (string | null)[];    // Row-major, palette color IDs
  usedColors: string[];         // Derived from cells
  lockedColors: string[];       // Protected from optimizer
}
```

The `cells` array uses palette color IDs (e.g., `"R1C3"` for Row 1, Column 3) rather than raw hex values. This ensures every color in the document maps directly to a swatch the user can find in the game's Palette House.

## Optimization Pipeline

The optimizer runs four deterministic passes in sequence. Each pass is a pure function that takes a GridDocument and returns a new GridDocument:

1. **Color Merging** — Finds pairs of used colors with Delta E below a threshold and merges the less-used color into the more-used one.
2. **Island Removal** — Uses connected-component detection to find small isolated regions (configurable max size) and replaces them with the dominant neighboring color.
3. **Single-Cell Cleanup** — Identifies lone pixels surrounded by different colors and replaces them with the most common neighbor.
4. **Palette Limiting** — Iteratively merges the two most similar remaining colors until the total count reaches the target maximum.

All passes respect the `lockedColors` list, ensuring user-protected colors are never modified.

## UI Architecture

The UI follows an asymmetric two-column layout:

- **Left (65%):** Canvas workspace with graph-paper background, zoom/pan controls, and grid overlay.
- **Right (35%):** Tabbed control panel with four sections: Import, Palette, Optimize, Export.

State flows unidirectionally from the `useGridDocument` hook through the component tree. The hook manages the document, undo/redo history, and all mutation operations.

## File I/O

All file operations use browser-native APIs:

- **Image import:** `FileReader` → `HTMLCanvasElement` → pixel sampling → palette matching.
- **JSON import:** `FileReader` → `JSON.parse` → validation → `GridDocument`.
- **Export:** `Blob` → `URL.createObjectURL` → programmatic `<a>` click download.

No files ever leave the user's browser.

## Future Considerations

- **Web Workers:** For grids larger than 128×128, the optimizer passes could be moved to a Web Worker to avoid blocking the main thread.
- **IndexedDB:** Project auto-save and recovery using browser storage.
- **WASM:** If Delta E calculations become a bottleneck at 256×256, a Rust/WASM module could accelerate the inner loop.
