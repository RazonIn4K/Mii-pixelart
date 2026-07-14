# ADR 0002: Normalize optional showcase images for grid creations

- **Status:** Accepted for implementation; production enablement remains gated
- **Date:** 2026-07-12
- **Decision owners:** Tomodachi Studio maintainers
- **Scope:** User-supplied photos/screenshots attached to an existing cloud creation

## Context

Creators need a simple way to show how a finished grid looks in context. The
generated pixel preview remains accurate, safe, and sufficient for every
creation, but it cannot show a photographed console, a hand-made result, or a
different presentation crop. A community gallery also makes discovery easier
to scan.

Sending raw images through the normal cookie-authenticated JSON request path
would weaken the existing CSRF/content-type boundary. Retaining original files
would also preserve unnecessary filenames, metadata, and risky encodings.

## Decision

Allow an owner to attach up to four optional showcase images to an existing
private cloud creation during publishing review.

- A showcase image never creates an image-only post and never replaces the
  canonical `GridDocumentV1` project.
- Local Studio imports remain browser-only. An imported source is not uploaded
  unless the owner separately chooses it in the showcase-image control.
- The cookie-authenticated JSON route issues a random, one-use upload ticket
  that expires after ten minutes. The browser then sends raw bytes with a
  Bearer ticket, `credentials: omit`, and the exact configured Origin.
- Accept JPEG, PNG, WebP, and HEIC input only. Limit each request to 8 MiB,
  8192 pixels per side, and 25 megapixels. HEIC remains a staging acceptance
  gate because decoder support must be verified on the bound Images plan.
  Generic HEIF is no longer advertised because the provider contract names
  HEIC specifically.
- Decode through the Cloudflare Images binding, disable animation, and retain
  only normalized `display.webp`, `thumb.webp`, and `social.jpg` outputs in
  private R2. Never retain raw bytes, EXIF, filenames, embedded profiles,
  arbitrary paths, SVG, or user markup.
- Require 1–200 characters of plain-text alt text. Owners may reorder images,
  choose one cover, or delete them. The cover becomes the card/detail/social
  image; deterministic grid media remains the fallback.
- D1 owns authorization, order, cover selection, state, hashes, sizes, and
  generated R2 keys. Showcase bytes count toward the existing 50 MiB account
  quota and disappear with creation/account deletion.
- Public/unlisted visibility follows the parent creation. Reports and moderator
  actions apply to the entire creation; no private image is exposed to a
  moderator through the ordinary community API.

## Consequences

The product gains a TomodachiShare-style visual gallery without copying its
design or turning Tomodachi into a general-purpose image host. Upload and image
transformation failures cannot corrupt the project revision. The feature adds
Images usage, moderation surface, storage, and tests, so production remains
blocked until pricing, staging format support, legal disclosures, and moderator
coverage are approved.

## Validation

- Reject missing/expired/reused tickets, Cookie-bearing raw uploads, wrong
  Origin, wrong length/type/magic bytes, unsupported input, decompression
  bombs, dimensions over either cap, and a fifth image. Animated raster input
  is deliberately flattened to a still by `anim: false` output.
- Test cross-account list/upload/reorder/delete access and private/unlisted/
  public reads.
- Inject Images, R2, and D1 failures and prove raw input is not retained and
  partial generated objects are cleaned.
- Browser-test keyboard upload, required alt text, cover/reorder/delete,
  responsive gallery layout, and publishing with no showcase images.
