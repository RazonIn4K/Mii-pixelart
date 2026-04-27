# JSON Format Notes

This project has two JSON paths:

- `GridDocument` v1, the studio's native format.
- Living The Grid indexed-palette imports, used only as an interoperability adapter.

## Native `GridDocument` v1

Required top-level fields:

```json
{
  "version": 1,
  "meta": {
    "name": "Sample",
    "createdAt": "2026-04-26T00:00:00.000Z",
    "modifiedAt": "2026-04-26T00:00:00.000Z"
  },
  "width": 4,
  "height": 4,
  "cells": ["R1C1", null],
  "usedColors": ["R1C1"],
  "lockedColors": []
}
```

`cells` is always a flat row-major array of internal palette color IDs or `null`.
It must never store raw hex values.

## Living The Grid Production Format (Confirmed)

**Source:** living-the-grid.com production exports (fixture: `fixtures/living-the-grid-real.json`)

The actual Living The Grid export format follows this structure:

```json
{
  "source": "living-the-grid.com",
  "version": 2,
  "width": 64,
  "height": 64,
  "brush": {
    "mode": "pixel",
    "px": 4
  },
  "canvas": {
    "preset": "square",
    "w": 256,
    "h": 256
  },
  "palette": [
    {
      "hex": "#F5FAF0",
      "rgb": [245, 250, 240],
      "press": {"h": 141, "s": 49, "b": 106}
    }
  ],
  "pixels": [
    [0, 0, 1, 1],
    [0, 0, 1, 1]
  ]
}
```

Adapter support:

- ✅ `width`, `height` — Required, positive integers
- ✅ `palette` — Array of objects with `hex`, `rgb`, `press` properties (only `hex` is used)
- ✅ `pixels` — 2D row-major array of palette indices (also accepts `grid` alias)
- ✅ `source`, `version`, `brush`, `canvas` — Preserved in `meta.sourceMetadata`
- ✅ Palette entries can be strings (`"#RRGGBB"`) or objects with `hex`/`color` property
- ✅ `null`, `undefined`, or `-1` grid values as empty cells
- ✅ Flat row-major index array also supported (in addition to 2D)

Import behavior:

- `width` and `height` must be positive integers.
- Grid dimensions must exactly match `width * height`.
- Palette entries must resolve to `#RRGGBB`.
- Exact palette matches are converted to internal IDs such as `R1C1`.
- Non-exact colors are mapped to the nearest internal palette color by Delta E.
- Non-fatal mapping issues are stored in `meta.importWarnings`.
- Source metadata except pixel grid and palette data is preserved in
  `meta.sourceMetadata`.
- Per-source-palette mappings are preserved in `meta.sourcePaletteMappings`.
- When present, each mapping preserves the source `rgb` tuple and in-game
  H/S/B `press` counts as `sourceRgb` and `sourcePress`.

## Reference Fixture

The production export fixture is available at `fixtures/living-the-grid-real.json` (64×64 grid, 15-color palette).

A minimal synthetic test fixture is available at `fixtures/ltg-indexed-palette-sample.json`.

Run the import verification script with:

```bash
npx --yes -p tsx tsx scripts/verify-ltg-import.ts
```
