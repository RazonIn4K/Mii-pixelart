# Product Specification — Tomodachi Studio

**Version:** 1.1
**Last Updated:** 2026-07-14

---

## Vision

Living The Grid Repaint Studio is a **browser-first reference studio** for _Tomodachi Life: Living the Dream_ face paint, Palette House workshop creations, and other creative pixel builds. It bridges image conversion with manual copy guides for user-supplied character references, face photos, logos, brand-style marks, memes, clothing graphics, books, decor, and other fun player-made designs. The core insight is that existing tools convert images into pixel grids, but they do not optimize those grids for the actual task of recreating them with the game's own creation tools. This studio closes that gap without modifying game files.

The strongest product angle: **not just "turn image into pixels," but "make this actually repaintable by hand."**

The local Studio workflow below is implemented and remains available without an
account. The Island Workshop account, cloud-project, publishing, discovery,
social, and moderation surfaces are also implemented and locally/CI tested.
Exact source `520d0f287d390ba14b0fef179a6394893a5ab92d` remains the last accepted
isolated staging Worker deployment in standard read-only mode. The current
branch prepares the controlled writable-staging acceptance gate; production
launch remains separately approval-gated. Production
`tomodachi.pw` remains on Cloudflare Pages.

## Target User

Creative gamers who play _Tomodachi Life: Living the Dream_ on Nintendo Switch and want to create manual Face Paint references, character-inspired fan builds from their own references, custom logos or brand-style marks, memes, books, clothing, food, decor, and house exteriors in the Palette House. These users range from casual players who want a playful Face Paint design, mascot-style character, or recognizable logo to dedicated artists who build elaborate Mii portraits.

## Core Workflow

The studio follows a linear pipeline that the user controls at every step:

1. **Import** a character reference, face photo, logo/mark, meme, image file, or a Living The Grid JSON file, or **create** a blank starter canvas.
2. **Choose a use-case preset** such as Face Paint, Character 64, Face 96, Character 128, Sprite 32, Logo 64, Sticker 64, Icon 16, Full 64, or Pixel 256.
3. **Adjust framing and source type** with Fill/Fit/Stretch, focus controls, and Photo vs Pixel/Logo sampling so the face, logo, or subject lands where the repaint needs it.
4. **Preview** the palette-limited grid before replacing the active project.
5. **Commit or cancel** the image preview.
6. **Create or touch up** by painting cells, erasing, picking colors, filling connected regions, using an accepted AI sketch, or resampling the canvas to a higher pixel count.
7. **Edit** the palette: view usage counts, lock colors, manually merge similar colors.
8. **Optimize** with deterministic passes: color merging, island removal, single-cell cleanup, palette limiting.
9. **Export** a repaint reference pack: labeled and clean PNG guides, palette
   sheet, paint-order CSV, project JSON, source notes, manifest, and HTML.
10. **Optionally save to an account** by explicitly creating the first private
    cloud copy; authentication alone never uploads the local project.
11. **Optionally publish** only after reviewing the title, description, tags,
    preview, visibility, comments, and project-download permission.

## MVP Feature Set

| Feature            | Description                                                                                                                                                                                                                                 | Priority |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Image import       | Upload PNG/JPG/GIF/WebP/AVIF, resize to grid, map to palette                                                                                                                                                                                | P0       |
| Use-case presets   | Face-paint, character, high-detail face/character, sprite, logo/mark, sticker, icon, full-image, and 256px pixel-art import settings                                                                                                                | P0       |
| Face/subject focus | Nudge crop position with sliders or a draggable subject target before quantization                                                                                                                                                          | P0       |
| Import preview     | Review generated image grids before committing them to history                                                                                                                                                                              | P0       |
| Creation tools     | 28 original starter templates, saved JSON fixtures, blank starters, canvas detail resampling, inspect, pencil, eraser, eyedropper, and fill bucket tools                                                                                    | P0       |
| AI sketch chat     | Account-gated OpenRouter tab with four curated free presets, per-user bounded sessions, model-comparison script, explicit visual-grid consent, capability/output-budget gates, and validated palette-ID sketch review before one-step apply | P1       |
| JSON import/export | Load and save GridDocument format                                                                                                                                                                                                           | P0       |
| Canvas viewer      | Render grid with zoom, pan, grid lines, labels                                                                                                                                                                                              | P0       |
| Palette panel      | Show used colors, usage counts, lock/unlock                                                                                                                                                                                                 | P0       |
| Color merging      | Manual merge of one color into another                                                                                                                                                                                                      | P0       |
| Repaint optimizer  | Deterministic multi-pass optimization                                                                                                                                                                                                       | P1       |
| Paint-by-numbers   | Number labels on each cell, color highlighting                                                                                                                                                                                              | P1       |
| PNG export         | Download labeled guide image                                                                                                                                                                                                                | P1       |
| Reference pack     | Download a ZIP with JSON, labeled/clean PNG guides, palette sheet, paint order, notes, manifest, and HTML                                                                                                                                    | P2       |
| Undo/redo          | Full history with Ctrl+Z / Ctrl+Shift+Z                                                                                                                                                                                                     | P0       |

## Advanced Features (Post-MVP)

| Feature                            | Description                                                                                             | Delivery state                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Living The Grid native JSON import | Parse the supported LTG v2 indexed-palette format                                                       | Implemented                    |
| Crop and region selection          | Draggable crop rectangle, framing shortcuts, and subject-focus controls                                 | Implemented; refinements open  |
| Brightness/contrast adjustment     | Non-destructive pre-processing before palette mapping                                                   | Implemented                    |
| OpenRouter AI chat/sketch          | Model presets, optional visual grid context, reviewed validated sketches, and one-step undoable apply   | Implemented                    |
| AI color suggestions               | Suggest optimal merges and contrast changes without applying them automatically                         | Optional refinement            |
| Collaborative sharing              | Private cloud projects, reviewed publish flow, public/unlisted links, discovery, and social interactions | Implemented; writable gated    |

## Non-Goals

The studio intentionally does **not** attempt to:

- Export directly to the game (_Tomodachi Life: Living the Dream_ has no import API).
- Replace the in-game painting experience (that is the charm).
- Bundle official game, brand, or character artwork.
- Apply AI edits automatically without user consent.
- Require server-side processing for the core image import, editing, optimization, or export workflow.

## Success Metrics

The studio succeeds when a user can take any image and, within five minutes, produce a reference pack that they can follow square-by-square in the Palette House without confusion about which color goes where.
