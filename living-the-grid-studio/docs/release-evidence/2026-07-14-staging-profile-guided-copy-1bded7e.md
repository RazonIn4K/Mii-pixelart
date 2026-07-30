# Staging profile and Guided Copy gate `1bded7e`

**Date:** 2026-07-14 (America/Chicago)

**Target:** `tomodachi-studio-staging`

**Approved source:** `1bded7eda46f9be9f9a184656e535256467919d4`

**Mode:** authenticated writable staging acceptance

This is the sanitized completion record for the approved profile-image and
Guided Copy gate. It contains no secret values, cookies, OAuth subjects, email
or postal addresses, internal user or creation IDs, object keys, project
contents, request bodies, or raw IP data.

## Exact migration and deployment

Before the release, the clean local branch and both configured remote mirrors
resolved to the approved source. The release preflight found exactly one
pending staging migration: `0007_profile_images.sql`, with SHA-256
`fbb373c010284cc2566da0097e7562b87d907687456383f4e5aff29d639bad6e`.

Only that migration was applied. Wrangler executed 41 statements successfully.
The remote ledger now contains exactly `0001` through `0007`; the required
profile-image tables, indexes, quota and authorization triggers are present;
and `PRAGMA foreign_key_check` returned no rows. D1 restore bookmarks were
captured before migration and after final acceptance.

The guarded staging release wrapper then deployed only the approved source:

- Cloudflare deployment: `90677cbf-160d-4a9e-9c5e-f3b91f7583ee`
- Active Worker version: `babeddc7-4e9b-489f-bd00-a59c18bf656e`
- Traffic allocation: 100 percent
- Immediate code rollback version: `68f0ef81-c03f-44b9-a253-ceeb74eb4bc2`
- `COMMUNITY_MUTATIONS_ENABLED=true`
- `CONSULT_SALES_ENABLED=false`
- Staging CPU limit: 2,000 ms
- Runtime handlers: `fetch` and `scheduled`

The expected isolated staging D1, private R2, KV, Images, Static Assets, and
rate-limit bindings remain attached. The same eight expected secret binding
names remain present. No secret value was read, printed, or changed.

## Exact-source verification

The following passed from the approved source before deployment:

- TypeScript and Worker type checks
- 67 OpenAPI operations checked against 71 Worker routes
- seven forward-only migrations, 23 required tables, and 11 required indexes
- Living The Grid, image-import, template, AI-sketch, and resident verifiers
- 32 Worker test files with 267 passing tests
- three release-preflight files with 84 passing tests
- staging Worker dry run and generated release-output verification
- bundle budgets: 91.7 KiB gzip initial JavaScript and 91.7 KiB gzip largest
  lazy chunk
- Git whitespace and exact-source checks

After the live acceptance, 37 focused profile-image, showcase-image, quota,
and moderation-transition tests passed across four Worker test files. Five
focused browser checks also passed: WCAG 2.2 A/AA Axe scans on representative
routes, direct 200 percent page scale, visible keyboard focus with reduced
motion, touch and keyboard canvas editing, and the browser-local Guided Copy
reference lifecycle.

## Authenticated profile-image acceptance

The existing staging administrator accepted the current staging Terms version
without changing username, display name, identity, or role. Account Settings
then exercised genuine PNG, JPEG, WebP, and HEIC profile-photo inputs through
the public UI.

For each format, staging:

- accepted the source only through a short-lived upload reservation;
- generated a square 256 by 256 WebP profile derivative;
- served the active photo through the Worker with `Cache-Control: no-store`;
- updated the account menu and public profile consistently; and
- returned 404 for the replaced media URL immediately after replacement.

The photo focus controls were exercised. The final custom photo was removed
through **Use generated avatar**, the custom media URL then returned 404, and
the deterministic generated-avatar controls returned. Final D1 and R2-linked
metadata contain no ready, deleting, orphaned, or evidence-held profile image
record. Four rate-limit attempt records remain by design.

## Authenticated showcase acceptance

The private draft's three-step review accepted genuine PNG, JPEG, WebP, and
HEIC showcase inputs with meaningful alt text. The UI enforced the four-image
limit, hid the upload control at the limit, displayed the selected cover, and
promoted the next ordered image after the cover was removed.

All four images were removed before the review closed. The creation remained a
private draft and was never published. Final D1 and R2-linked metadata contain
no ready, deleting, or orphaned showcase image or object record. Four
rate-limit attempt records remain by design.

## Studio and Guided Copy acceptance

The authenticated Studio restored the private 64 by 64 revision with its
`Saved · v2` state. It rendered exactly one application canvas and one paint
toolbar. The acceptance exercised pencil, eraser, fill, eyedropper, undo, redo, quick and
full palettes, Off/Coarse/Medium/Cell grid views, center guide, mirror mode,
edit zoom, zoom in/out, fit, and hand-tool panning.

A PNG reference was imported into Guided Copy. The browser-only reference dock
appeared beside the same single editable canvas, its dim control was set to 55
percent, and horizontal flip was toggled. The preview was cancelled without
committing or autosaving a new revision, and the local reference was then
removed. Final D1 verification remained at two ready revisions, maximum
revision 2, eight ready creation objects, and zero uploading revisions.

## Moderation acceptance and boundary

The authenticated administrator opened the moderation workspace successfully.
It showed an empty open-report queue and no authorization error. Anonymous
report creation and report-queue access both returned the standard
`401 UNAUTHENTICATED` JSON envelope with request IDs.

A successful report-scoped removal was intentionally not manufactured. Staging
contains exactly one identity and that identity is the sole administrator;
self-moderation is blocked by design. Creating another identity, changing a
role, or inserting a synthetic report would have exceeded this gate's
boundaries. The report-scoped profile removal, evidence hold, self-moderation
guard, restoration, and transition paths are covered by the focused Worker
tests noted above. A real cross-user moderation action remains a separately
gated acceptance item.

## Accessibility, CSP, crawler, and runtime acceptance

Mobile Lighthouse navigation audits scored 100 Accessibility and 100 Best
Practices on Home, Studio, Discover, Search, and Community Guidelines. The SEO
scores of 66 to 69 are intentional staging results caused by the deployment's
global `noindex,nofollow` policy.

At a live 320-pixel viewport, each of those routes rendered one main landmark,
one H1, a skip link, browser zoom enabled, and no horizontal overflow. The
focused exact-source browser checks independently passed Axe WCAG 2.2 A/AA,
direct 200 percent scaling, visible focus, reduced motion, and Studio keyboard
and touch operation.

The audited document routes returned 200 with CSP, HSTS, frame denial,
`nosniff`, and staging-wide `noindex,nofollow`; CSP did not include
`unsafe-eval`. Staging `robots.txt` denied all crawling, both staging sitemaps
were empty, and missing public profile/creation documents returned private,
no-store 404 responses. The anonymous session and recent-discovery endpoints
returned the standard JSON envelopes and advertised community mutations as
enabled.

The isolated Chrome runs reported no application console warning, error, or
issue. The final Studio navigation completed 43 requests with only 200 and 204
terminal statuses.

## Performance acceptance

Three isolated cold Worker-hosted homepage traces used a 390 by 844 viewport at
DPR 3, Slow 4G, and 4x CPU throttling:

| Trace | LCP | CLS |
| --- | ---: | ---: |
| 1 | 2,166 ms | 0.00 |
| 2 | 2,157 ms | 0.00 |
| 3 | 2,174 ms | 0.00 |

Median homepage LCP was 2,166 ms. A separate mobile-navigation interaction
trace measured 97 ms INP and 0.00 CLS. The cold Studio trace measured 2,285 ms
LCP and 0.02 CLS. These pass the agreed LCP below 2.5 seconds, CLS below 0.1,
and INP below 200 ms gates. The initial and largest JavaScript bundles also
remain below the 200 KiB and 250 KiB gzip budgets.

## Data and production isolation

The final read-only D1 aggregate reported one user and administrator, zero
moderators, one external identity, two active sessions, one private draft, zero
published creations, two ready revisions, eight ready creation objects, zero
uploading revisions, zero retained profile/showcase images or objects, zero
open reports, and zero moderation actions. `PRAGMA foreign_key_check` returned
no rows. The only upload-related rows left by acceptance are the four profile
and four showcase daily-rate-limit attempt records.

Production remained on Cloudflare Pages deployment
`2f6e20cf-7ccd-47db-9c01-45aec3af7dca` from protected `main` source `288bc5b`.
The production AI-status response hash and both production DNS answers matched
the pre-gate baseline, and the production root remained healthy. No production
deployment, DNS, secret, role, OAuth, production migration, or production data
change occurred.

## Gate status

Exact source `1bded7eda46f9be9f9a184656e535256467919d4` is accepted on the
isolated staging Worker for the approved single-account profile photo,
showcase-image, generated-avatar fallback, Guided Copy, Studio, accessibility,
CSP, crawler, and performance scope. Community mutations remain enabled only
on staging; consult sales remains disabled.

The following remain independently gated before production:

- a distinct second staging identity for cross-user private/public access,
  social actions, reports, and successful report-scoped moderation;
- destructive account-deletion completion and scheduled cleanup acceptance;
- consult fulfillment enablement;
- PR/MR merge, production D1/R2/KV/Images/OAuth/secret approval, Worker/domain
  cutover, rollback drill, and production soak.

Production must remain on Pages until those separate gates are approved and
completed.
