# Product Specification — Living The Grid Repaint Studio

**Version:** 1.0 MVP  
**Last Updated:** 2026-04-26

---

## Vision

Living The Grid Repaint Studio is a **browser-first repaint studio** that bridges Living The Grid-style image conversion with Mii/Tomodachi pixel recreation. The core insight is that existing tools convert images into pixel grids, but they do not optimize those grids for the actual task of hand-painting them in-game. This studio closes that gap.

The strongest product angle: **not just "turn image into pixels," but "make this actually repaintable by hand."**

## Target User

Creative gamers who play Tomodachi Life: Living the Dream on Nintendo Switch and want to create custom pixel art for vinyl items, books, clothing, food, decor, and house exteriors in the Palette House. These users range from casual players who want to recreate a meme to dedicated artists who build elaborate Mii portraits.

## Core Workflow

The studio follows a linear pipeline that the user controls at every step:

1. **Import** an image (PNG, JPG, GIF) or a Living The Grid JSON file.
2. **Convert** to a palette-limited grid using the game's 84-color palette.
3. **Edit** the palette: view usage counts, lock colors, manually merge similar colors.
4. **Optimize** with deterministic passes: color merging, island removal, single-cell cleanup, palette limiting.
5. **Export** a repaint reference pack: labeled PNG guide, palette sheet, and project JSON.

## MVP Feature Set

| Feature | Description | Priority |
|---------|-------------|----------|
| Image import | Upload PNG/JPG/GIF, resize to grid, map to palette | P0 |
| JSON import/export | Load and save GridDocument format | P0 |
| Canvas viewer | Render grid with zoom, pan, grid lines, labels | P0 |
| Palette panel | Show used colors, usage counts, lock/unlock | P0 |
| Color merging | Manual merge of one color into another | P0 |
| Repaint optimizer | Deterministic multi-pass optimization | P1 |
| Paint-by-numbers | Number labels on each cell, color highlighting | P1 |
| PNG export | Download labeled guide image | P1 |
| Reference pack | Download JSON + PNG + HTML reference | P2 |
| Undo/redo | Full history with Ctrl+Z / Ctrl+Shift+Z | P0 |

## Advanced Features (Post-MVP)

| Feature | Description | Phase |
|---------|-------------|-------|
| Living The Grid native JSON import | Parse the actual LTG save format | Phase 0-1 |
| Crop and region selection | Select a sub-region of the imported image | Phase 4 |
| Brightness/contrast adjustment | Pre-processing before palette mapping | Phase 4 |
| AI color suggestions | Suggest optimal merges (suggestion layer only) | Phase 6 |
| Collaborative sharing | Share project links with other players | Future |

## Non-Goals

The studio intentionally does **not** attempt to:

- Export directly to the game (Tomodachi Life has no import API).
- Replace the in-game painting experience (that is the charm).
- Apply AI edits automatically without user consent.
- Require accounts, logins, or server-side processing.

## Success Metrics

The studio succeeds when a user can take any image and, within five minutes, produce a reference pack that they can follow square-by-square in the Palette House without confusion about which color goes where.
