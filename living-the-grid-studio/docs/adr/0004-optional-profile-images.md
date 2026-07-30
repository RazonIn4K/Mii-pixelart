# ADR 0004: Add optional normalized profile images

- **Status:** Accepted for implementation; staging and production remain gated
- **Date:** 2026-07-14
- **Decision owners:** Tomodachi Studio maintainers
- **Scope:** A user-selected profile image that may replace the generated avatar

## Context

Every account already receives a deterministic Island Workshop avatar and may
regenerate it. Creators also asked for an optional personal image so community
profiles, cards, and comments can be easier to recognize. The earlier
generated-only default avoided an image moderation surface, but it is no longer
the approved product scope.

A profile image is public wherever that account identity appears. It therefore
cannot reuse the browser-local Studio import path, retain the original upload,
or become an unbounded general-purpose image object.

## Decision

Keep generated avatars as the default and permanent fallback, and allow an
onboarded active user to explicitly upload one custom profile image from
Settings.

- Never copy a Google profile image automatically.
- Accept JPEG, PNG, WebP, and HEIC inputs only. Limit input to 8 MiB,
  8,192 pixels per side, and 25 megapixels. Reject SVG, GIF, AVIF, BMP, user
  markup, and mismatches between the declared and decoded format.
- A cookie-authenticated JSON request reserves quota and returns a random,
  one-use, ten-minute upload ticket. Raw bytes then use a Bearer ticket with
  `credentials: omit`, the exact configured Origin, and no Cookie header.
- Decode and inspect through the Cloudflare Images binding. Apply only a
  bounded user-selected focal point, crop to 256 by 256, disable animation,
  and retain one metadata-free WebP object in private R2. Never retain the raw
  file, filename, EXIF/GPS data, arbitrary paths, or import metadata.
- D1 owns the current-image pointer, lifecycle state, generated object key,
  hash, size, decoded dimensions, ticket hash, and authorization. R2 never
  decides access. A stable image ID is included in the public media URL.
- Replacing or removing a custom image atomically switches the account back to
  the new image or generated fallback before old objects are deleted. Failed
  writes and stale reservations are cleaned idempotently. Objects in the
  `deleting` state still count toward quota until their R2 deletion succeeds.
- Count every physically present normalized object toward the existing 50 MiB
  account quota, including replaced objects awaiting cleanup or report release. Limit
  reservation attempts to ten per rolling day in D1 in addition to the
  approximate edge save limiter.
- Public reads require an active, previously onboarded account and its current
  image pointer. A later Terms version does not break already-public profile
  icons; current Terms acceptance remains required for account mutations.
  Suspension or account deletion removes the image from the public identity
  surface.
- A user report snapshots the exact normalized image manifest in the same D1
  transaction as the report. While the report is open or under review, cleanup
  cannot delete the private evidence bytes. Moderators can review them only
  through a private `no-store` route and can remove the live image with an
  immutable, report-linked `remove_profile_image` action only while the live
  pointer still equals that report's evidence image. A replacement makes the
  action conflict instead of removing newer content. Restoring a suspended
  account never restores a moderator-removed pointer. Report resolution
  releases the hold; final account erasure first atomically claims the account
  before R2 cleanup and explicitly removes held image evidence.
- Account export includes the normalized image manifest and bytes as a bounded
  streamed record. Account deletion removes every profile-image row and R2
  object.

## Consequences

Profiles gain an optional personal identity surface without changing anonymous
Studio use or importing a third-party account photo. The generated avatar
still works without storage and immediately resumes after removal or an image
error. The service gains transformation cost, public personal-data handling,
moderation exposure, and additional deletion/export tests.

The Nintendo screenshots and Tomodachi Share implementation used during
product research are references only. No third-party code, branding, interface
assets, game screenshots, or character art is copied into this feature.

## Validation

- Reject missing, expired, replayed, cross-account, Cookie-bearing, wrong
  Origin, wrong length, wrong type, invalid decoder output, oversized, and
  quota-exceeding uploads.
- Inject Images, R2, and D1 failures and prove that the current profile pointer
  stays valid and unreachable objects are removed.
- Test replacement races, remove idempotency, suspension, deletion, export,
scheduled stale-upload cleanup, report-time evidence retention and release,
audited moderator removal with safe restore behavior, stale-Terms public reads,
replacement-versus-report removal conflicts, cancellation-versus-final-deletion
claim races, per-item R2 cleanup failure isolation, and a second user's public
read.
- Browser-test keyboard file selection, focal-point controls, HEIC preview
  fallback copy, replace/remove behavior, generated fallback, compact header
  sizing, responsive layout, and accessible names.
