# Island Workshop visual asset workflow

## Product boundary

Tomodachi uses four deliberately separate image paths:

1. **Profile avatars** are deterministic inline SVG assembled from a server-generated `avatar_seed`. They require no upload, model call, storage object, or moderation queue. The seed is stable until its owner requests regeneration and is a visual identifier, not an authentication secret.
2. **Creation previews** are rendered only from validated `GridDocumentV1` data. The Worker builds safe SVG, transcodes it through Cloudflare Images, and stores immutable WebP/JPEG objects in private R2.
3. **Creation showcase images** are optional owner-selected photos/screenshots attached to an existing grid creation. The Worker retains only bounded, metadata-free WebP/JPEG variants; the local import source is never uploaded automatically.
4. **Marketing and empty-state artwork** is generated during development, reviewed for originality and franchise safety, optimized locally, and committed as a static asset.

End users cannot submit arbitrary markup, avatar files, image-only posts, or prompt-to-image requests. Showcase images are a narrow reviewed attachment surface, not a general file host.

## Deterministic avatars

`client/src/lib/community/avatar.ts` owns the versioned recipe. Version 2 combines:

- six skin tones;
- six hair colors and five hair silhouettes;
- six background palettes and five background patterns;
- six shirt colors;
- four eye treatments and four mouth treatments;
- six neutral accessory treatments.

The recipe yields millions of possible combinations while returning the same SVG for the same seed. Owners may request a new server-generated seed, which updates their avatar everywhere without uploading an image. Treat `ISLAND_AVATAR_VERSION` as a compatibility contract after public profiles launch.

## Static generated artwork

| Asset | Purpose | Source size | Delivery |
| --- | --- | ---: | --- |
| `canvas-demo-v2.webp` | Original homepage grid-guide example | 1254×1254 | lazy WebP |
| `island-creator-collective.webp` | Discover community hero | 1440×960 | lazy WebP |
| `community-search-empty.webp` | Search empty states | 1200×800 | lazy WebP |

The source prompts require original characters, no text or logos, and explicitly exclude Nintendo imagery, franchise characters, Mii likenesses, mushrooms, and recognizable game assets.

## Review checklist

- Confirm the subject is clearly original and does not resemble an official character or asset.
- Check the composition at the actual route crop and smallest supported viewport.
- Remove metadata during conversion.
- Declare intrinsic width and height in markup.
- Use meaningful alt text; keep decorative images empty-alt only when they add no information.
- Eager-load only the homepage LCP hero. Keep all new community artwork lazy.
- Keep committed WebP artwork near or below 200 KiB when visual quality allows.
- Run `pnpm check`, `pnpm test:worker`, `pnpm build`, `pnpm verify:bundle`, and the browser matrix before pushing.

## Cloudflare production path

Static illustrations ship with Worker Static Assets. Generated media and optional normalized showcase variants remain in private R2 behind authorization-aware Worker routes. Cloudflare Images is the mandatory decode/transform/transcode boundary, not a public bucket or prompt-to-image service.
