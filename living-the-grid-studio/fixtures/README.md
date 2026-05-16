# Fixtures

This directory contains test fixtures for the Living The Grid Repaint Studio.

## Files

| File                              | Description                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `sample-grid-document.json`       | A minimal 4×4 test grid using 4 Tomodachi Life palette colors                             |
| `ltg-indexed-palette-sample.json` | Synthetic indexed-palette import sample for adapter smoke tests                           |
| `living-the-grid-real.json`       | ✅ **Real Living The Grid v2 export** (64×64, 15-color palette, from living-the-grid.com) |
| `creative-templates/`             | 28 generated original starter designs saved as native `GridDocument` JSON                 |

## Real Fixture Details

The production fixture `living-the-grid-real.json` was exported from [living-the-grid.com](https://living-the-grid.com/) and confirmed as version 2 format:

- **Dimensions:** 64×64 (4,096 cells)
- **Palette:** 15 colors with `{hex, rgb, press}` structure
- **Format:** Indexed-palette with `pixels` 2D array
- **Metadata:** `source`, `version`, `brush`, `canvas`

See `docs/json-format-notes.md` for full schema documentation and `test-round-trip.md` for validation results.

Run the executable verification from the project root with:

```bash
npx --yes -p tsx tsx scripts/verify-ltg-import.ts
```

Regenerate the saved creative template fixtures with:

```bash
pnpm save:templates
```
