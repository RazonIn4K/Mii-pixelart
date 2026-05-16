# Product Specification — Living The Grid Repaint Studio

**Version:** 1.0 MVP  
**Last Updated:** 2026-04-27

---

## Vision

Living The Grid Repaint Studio is a **browser-first repaint studio** for _Tomodachi Life: Living the Dream_ Mii face masks and creative pixel builds. It bridges Living The Grid-style image conversion with in-game repaint recipes for user-supplied character references, face photos, logos, brand-style marks, memes, clothing graphics, books, vinyl items, decor, and other fun player-made designs. The core insight is that existing tools convert images into pixel grids, but they do not optimize those grids for the actual task of hand-painting them in-game. This studio closes that gap.

The strongest product angle: **not just "turn image into pixels," but "make this actually repaintable by hand."**

## Target User

Creative gamers who play _Tomodachi Life: Living the Dream_ on Nintendo Switch and want to create face-mask guides for Mii characters, character-inspired fan builds from their own references, custom logos or brand-style marks, memes, vinyl items, books, clothing, food, decor, and house exteriors in the Palette House. These users range from casual players who want a funny face mask, mascot-style character, or recognizable logo to dedicated artists who build elaborate Mii portraits.

## Core Workflow

The studio follows a linear pipeline that the user controls at every step:

1. **Import** a character reference, face photo, logo/mark, meme, image file, or a Living The Grid JSON file, or **create** a blank starter canvas.
2. **Choose a use-case preset** such as Mii Mask, Character 64, Face 96, Character 128, Sprite 32, Logo 64, Sticker 64, Icon 16, Full 64, or Pixel 256.
3. **Adjust framing and source type** with Fill/Fit/Stretch, focus controls, and Photo vs Pixel/Logo sampling so the face, logo, or subject lands where the repaint needs it.
4. **Preview** the palette-limited grid before replacing the active project.
5. **Commit or cancel** the image preview.
6. **Create or touch up** by painting cells, erasing, picking colors, filling connected regions, using an accepted AI sketch, or resampling the canvas to a higher pixel count.
7. **Edit** the palette: view usage counts, lock colors, manually merge similar colors.
8. **Optimize** with deterministic passes: color merging, island removal, single-cell cleanup, palette limiting.
9. **Export** a repaint reference pack: labeled PNG guide, palette sheet, and project JSON.

## MVP Feature Set

| Feature            | Description                                                                                                                                                                                                                                 | Priority |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Image import       | Upload PNG/JPG/GIF/WebP/AVIF, resize to grid, map to palette                                                                                                                                                                                | P0       |
| Use-case presets   | Mii face mask, character, high-detail face/character, sprite, logo/mark, sticker, icon, full-image, and 256px pixel-art import settings                                                                                                     | P0       |
| Face/subject focus | Nudge crop position with sliders or a draggable subject target before quantization                                                                                                                                                          | P0       |
| Import preview     | Review generated image grids before committing them to history                                                                                                                                                                              | P0       |
| Creation tools     | 28 original starter templates, saved JSON fixtures, blank starters, canvas detail resampling, inspect, pencil, eraser, eyedropper, and fill bucket tools                                                                                    | P0       |
| AI sketch chat     | Optional OpenRouter chat tab with 25 model presets, local saved sessions, model-comparison script, optional visual grid snapshots for vision models, and applyable palette-ID sketch JSON accepted by the user before replacing the project | P1       |
| JSON import/export | Load and save GridDocument format                                                                                                                                                                                                           | P0       |
| Canvas viewer      | Render grid with zoom, pan, grid lines, labels                                                                                                                                                                                              | P0       |
| Palette panel      | Show used colors, usage counts, lock/unlock                                                                                                                                                                                                 | P0       |
| Color merging      | Manual merge of one color into another                                                                                                                                                                                                      | P0       |
| Repaint optimizer  | Deterministic multi-pass optimization                                                                                                                                                                                                       | P1       |
| Paint-by-numbers   | Number labels on each cell, color highlighting                                                                                                                                                                                              | P1       |
| PNG export         | Download labeled guide image                                                                                                                                                                                                                | P1       |
| Reference pack     | Download JSON + PNG + HTML reference                                                                                                                                                                                                        | P2       |
| Undo/redo          | Full history with Ctrl+Z / Ctrl+Shift+Z                                                                                                                                                                                                     | P0       |

## Advanced Features (Post-MVP)

| Feature                            | Description                                                                               | Phase     |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| Living The Grid native JSON import | Parse the actual LTG save format                                                          | Phase 0-1 |
| Crop and region selection          | Select a sub-region of the imported image                                                 | Phase 4   |
| Brightness/contrast adjustment     | Pre-processing before palette mapping                                                     | Phase 4   |
| OpenRouter AI chat/sketch          | Chat with model presets, optional visual grid context, and apply generated pixel sketches | Phase 6   |
| AI color suggestions               | Suggest optimal merges (suggestion layer only)                                            | Phase 6   |
| Collaborative sharing              | Share project links with other players                                                    | Future    |

## Non-Goals

The studio intentionally does **not** attempt to:

- Export directly to the game (_Tomodachi Life: Living the Dream_ has no import API).
- Replace the in-game painting experience (that is the charm).
- Bundle official game, brand, or character artwork.
- Apply AI edits automatically without user consent.
- Require server-side processing for the core image import, editing, optimization, or export workflow.

## Success Metrics

The studio succeeds when a user can take any image and, within five minutes, produce a reference pack that they can follow square-by-square in the Palette House without confusion about which color goes where.
