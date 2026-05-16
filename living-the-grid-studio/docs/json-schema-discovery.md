# JSON Schema Discovery Plan

**Status:** Complete
**Last Updated:** 2026-04-26

---

## Purpose

The Living The Grid tool at [living-the-grid.com](https://living-the-grid.com/) allows users to save their pixel art projects as JSON files. This document records the completed discovery flow and points to the confirmed format notes.

## What We Know

Based on the tool's public behavior and community documentation:

- The tool runs entirely in the browser (no server-side processing).
- It uses the Tomodachi Life: Living the Dream 84-color palette (77 base + 7 saturated).
- The canvas is 256x256 pixels maximum.
- Users can adjust grid size, color count, brightness, and contrast.
- The tool supports both "pixel-perfect" and "smooth" brush modes.
- Saved files appear to use the naming pattern `living-the-grid-{timestamp}.json`.

## Discovery Results

The real fixture is checked in at:

```text
fixtures/living-the-grid-real.json
```

Confirmed top-level structure:

```typescript
interface LivingTheGridV2Export {
  source: "living-the-grid.com";
  version: 2;
  width: number;
  height: number;
  brush: {
    mode: string;
    px: number;
  };
  canvas: {
    preset: string;
    w: number;
    h: number;
  };
  palette: Array<{
    hex: string;
    rgb: [number, number, number];
    press: {
      h: number;
      s: number;
      b: number;
    };
  }>;
  pixels: number[][];
}
```

Detailed notes are in `docs/json-format-notes.md`.

## Questions Answered

| Question | Why It Matters |
|----------|---------------|
| How are colors represented? | Palette entries include `hex`, `rgb`, and H/S/B `press` counts. Cells reference palette indices. |
| Is the grid stored as a 2D array or flat array? | The production fixture uses `pixels` as a 2D row-major array. The adapter also accepts flat arrays and `grid` alias inputs. |
| What metadata is included? | `source`, `version`, `brush`, and `canvas` are preserved in `meta.sourceMetadata`. |
| Are there multiple layers or just one? | The fixture contains one pixel layer. |
| Is there a version field? | Yes, `version: 2`. |
| How are empty cells represented? | The real fixture uses palette indices only. The adapter accepts `null`, `undefined`, and `-1` as empty cells. |

## Verification

Run:

```bash
npx --yes -p tsx tsx scripts/verify-ltg-import.ts
```

This validates the real v2 fixture, synthetic compatibility fixture, native GridDocument round-trip, supported input variants, and invalid input rejection.

## Fixtures Directory

```
fixtures/
├── README.md                           # This discovery plan (linked)
├── living-the-grid-real.json           # Real production v2 fixture
├── ltg-indexed-palette-sample.json     # Synthetic compatibility fixture
└── sample-grid-document.json           # Example of our native format
```
