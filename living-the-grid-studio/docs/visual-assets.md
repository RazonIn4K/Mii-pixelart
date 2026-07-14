# Island Workshop visual asset workflow

## Product boundary

Tomodachi uses five deliberately separate image paths:

1. **Generated profile avatars** are deterministic inline SVG assembled from a server-generated `avatar_seed`. They require no upload or model call and remain every account's fallback.
2. **Optional profile images** are explicit owner-selected photos. The Worker retains one bounded, metadata-free 256-pixel WebP in private R2 and never copies the Google profile image automatically.
3. **Creation previews** are rendered only from validated `GridDocumentV1` data. The Worker builds safe SVG, transcodes it through Cloudflare Images, and stores immutable WebP/JPEG objects in private R2.
4. **Creation showcase images** are optional owner-selected photos/screenshots attached to an existing grid creation. The Worker retains only bounded, metadata-free WebP/JPEG variants; the local import source is never uploaded automatically.
5. **Marketing and empty-state artwork** is generated during development, reviewed for originality and franchise safety, optimized locally, and committed as a static asset.

End users cannot submit arbitrary markup, image-only posts, or prompt-to-image requests. Profile and showcase images are separate narrow reviewed surfaces, not a general file host.

## Deterministic avatars

`client/src/lib/community/avatar.ts` owns the versioned recipe. Version 2 combines:

- six skin tones;
- six hair colors and five hair silhouettes;
- six background palettes and five background patterns;
- six shirt colors;
- four eye treatments and four mouth treatments;
- six neutral accessory treatments.

The recipe yields millions of possible combinations while returning the same SVG for the same seed. Owners may request a new server-generated seed, which updates the generated fallback everywhere without uploading an image. A custom profile image takes visual precedence until the owner removes it or it becomes unavailable. Treat `ISLAND_AVATAR_VERSION` as a compatibility contract after public profiles launch.

## Optional profile images

Profile-image input is limited to JPEG, PNG, WebP, and HEIC up to 8 MiB,
8,192 pixels per side, and 25 megapixels. Cloudflare Images verifies and crops
the selected focal point to a static 256 by 256 WebP. Raw bytes, names, and
metadata are discarded. The UI must always fall back to the generated avatar
when a custom image cannot load.

## Static generated artwork

| Asset                            | Purpose                              | Source size | Delivery  |
| -------------------------------- | ------------------------------------ | ----------: | --------- |
| `canvas-demo-v2.webp`            | Original homepage grid-guide example |   1254×1254 | lazy WebP |
| `island-creator-collective.webp` | Discover community hero              |    1440×960 | lazy WebP |
| `community-search-empty.webp`    | Search empty states                  |    1200×800 | lazy WebP |

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

Static illustrations ship with Worker Static Assets. Generated media and optional normalized profile/showcase variants remain in private R2 behind authorization-aware Worker routes. Cloudflare Images is the mandatory decode/transform/transcode boundary, not a public bucket or prompt-to-image service.
