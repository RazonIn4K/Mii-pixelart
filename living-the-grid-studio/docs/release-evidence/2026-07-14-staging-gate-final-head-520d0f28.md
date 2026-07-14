# Final-head staging gate `520d0f28` completion evidence

**Date:** 2026-07-14 (America/Chicago)

**Target:** `tomodachi-studio-staging`

**Approved source:** `520d0f287d390ba14b0fef179a6394893a5ab92d`

**Mode:** standard read-only

This is the sanitized completion record for the exact-source gate. It contains
no secret values, cookies, identity values, internal user IDs, email or postal
addresses, request bodies, project content, or raw IP data. Earlier staging
records remain historical evidence for their own immutable sources; this file
supersedes only their current-deployment status statements.

## Exact deployment

The guarded staging release wrapper deployed the approved source from a clean,
detached exact-SHA worktree after the release-readiness, source identity,
privileged-role, binding, migration-ledger, and packaging checks passed.

- Cloudflare deployment: `f8c1389b-4304-4056-a0bb-37bfef3218a1`
- Active Worker version: `9cdfc4d0-2d3e-44b3-8251-f57d2c555829`
- Traffic allocation: 100 percent
- Immediate rollback version: `b3ca8571-815b-4111-8787-9a98f43d0140`
- `COMMUNITY_MUTATIONS_ENABLED=false`
- `CONSULT_SALES_ENABLED=false`
- Staging CPU limit: 2,000 ms
- Runtime handlers: `fetch` and `scheduled`

The expected D1, private R2, KV, Images, Static Assets, and rate-limit bindings
are present. The same eight expected staging secret binding names remained
present before and after deployment; no secret value was read, printed, or
changed.

The active Worker assets are byte-identical to immutable Pages preview
`a444ecce-301b-4155-85d0-60a38da7001b` for the approved source:

- `/assets/index-BgNJyTTh.js` — SHA-256
  `854919bb3b053e3296ccc16d788675572a06c942a989477286fba74fd6932c01`
- `/assets/index-7lniQH3-.css` — SHA-256
  `368169f59a7d545c990a560999ff20aa74d6ec18f7058fb81134bf6f3b66e6b6`

## Exact-source verification

The following passed in the detached approved-source worktree:

- `pnpm check`
- release preflight: 73 tests across two files
- Worker integration: 241 tests across 30 files
- OpenAPI-to-route parity: 61 operations and 65 routes
- six forward-only migration and 19-table schema/integrity checks
- Living The Grid, image-import, template, AI-sketch, and resident verifiers
- staging release dry run and generated-release-output verification
- bundle budgets: 91.5 KiB gzip initial JavaScript; 91.5 KiB gzip largest
  chunk

## Worker-hosted acceptance

The anonymous HTTP/security/crawler harness passed 280 of 280 assertions over
29 requests. It covered document and API envelopes, request IDs, CSP and
security headers, staging-wide `noindex,nofollow`, deny-all `robots.txt`, empty
sitemaps, safe public and social crawler shells, discovery/search/tag reads,
and hidden consult products. A representative same-origin community mutation
failed closed with the standard `503 SERVICE_UNAVAILABLE` envelope; the same
request with the wrong origin returned `403`.

The hosted Playwright subsets passed:

- accessibility: 17 passed and 18 intentionally non-applicable scenarios
  skipped, including Axe WCAG 2.2 A/AA, landmarks, keyboard focus, reduced
  motion, and direct 200 percent page scale;
- public console/overflow/navigation: 42 passed and four intentionally
  non-applicable scenarios skipped across desktop, 390-pixel mobile,
  320-pixel reflow, and mobile WebKit;
- Studio input: two passed and two intentionally non-applicable scenarios
  skipped for local-only pointer/touch, keyboard, paint, pan, and bounds
  behavior.

A separate 390-pixel live Studio inspection started a local 64 by 64 canvas,
focused the application canvas, switched to edit zoom, moved the keyboard
cursor, and painted a cell with Space. The live region reported the activated
cell, the color count changed from zero to one, and Undo became available.
There was no application mutation request, runtime console warning/error,
failed request, HTTP error, or horizontal overflow in the acceptance runs.

Chrome DevTools also surfaced two non-blocking advisory classes during the
manual Studio inspection. The strict CSP correctly blocked and the app caught
Zod's `Function`-based JIT capability probe; `unsafe-eval` was not added. Chrome
also recommended native label/id metadata for several named controls for its
autofill heuristic. Those controls retained accessible names, and both Axe and
Lighthouse accessibility passed. These advisories are recorded for a future
source gate rather than changing the approved SHA or weakening security.

No OAuth flow, cloud save, AI completion, Stripe checkout or webhook, scheduled
handler, account lifecycle action, or destructive operation ran during this
read-only gate.

## Performance acceptance

Three isolated cold Worker-hosted traces used a 390 by 844 viewport at DPR 3,
Slow 4G, and 4x CPU throttling:

| Trace | LCP | CLS |
| --- | ---: | ---: |
| 1 | 2,395 ms | 0.00 |
| 2 | 2,355 ms | 0.00 |
| 3 | 2,459 ms | 0.00 |

Median LCP was 2,395 ms. A separate mobile-menu trace measured 129 ms INP and
0.00 CLS. These results pass the agreed LCP below 2.5 seconds, CLS below 0.1,
and INP below 200 ms gates. The final clean traces did not request the deferred
`RuntimeToaster` or `RecoveryHub` chunks during the measured initial window.

The largest remaining observed load cost is the single render-blocking app CSS
request; the final trace estimated up to 160 ms of LCP savings. The measured
gate still passes, so any CSS delivery change belongs to a later exact-source
gate.

Mobile Lighthouse scored 100 Accessibility, 100 Best Practices, and 100
Agentic Browsing. Its SEO score of 69 is the intentional staging result: the
only weighted SEO failure was that the page is blocked from indexing. The
audited navigation had zero console messages and 19 of 19 successful network
requests.

Sanitized raw artifacts remain outside the repository:

- cold trace 1 — SHA-256
  `939b00f480e1debe2134da4f1b0101de34428b2050e5624a814a7a06e58da752`
- cold trace 2 — SHA-256
  `f7c0a2dd9c66af6efe0695d35da481b5fa09286f51c0cc1e3a5e7c37f8638b53`
- cold trace 3 — SHA-256
  `e21c6eecbc43962eca4d439c7988eb78cfecdb0ce09688d60aff993fc50b74b3`
- interaction trace — SHA-256
  `f0e678a50cbd42dd7ec3f81c270f2003b3325c275ead4ae0745a6de49c74bd22`
- Lighthouse JSON — SHA-256
  `24d414beb40cd42f21a0674f87f56608b536db37b33ec2cd665d8266cdc58b6e`

## Data and production isolation

The aggregate D1 snapshot remained one active user and admin, zero moderators,
one external identity, two sessions, 12 governed tags, and zero project,
showcase-image, quota, social, report, or moderation records. Its final query
reported `changes=0`, `changed_db=false`, and `rows_written=0`. The migration
ledger remains exactly `0001` through `0006`, and `PRAGMA foreign_key_check`
returned no rows.

Production remained on Cloudflare Pages deployment
`2f6e20cf-7ccd-47db-9c01-45aec3af7dca` from protected `main` source `288bc5b`.
Production root and AI-status response hashes and both production/staging DNS
answers matched the pre-deployment baseline. No production, DNS, application
data, role, OAuth, migration, or secret change occurred.

## Gate status

Exact source `520d0f287d390ba14b0fef179a6394893a5ab92d` is accepted on the isolated
staging Worker in standard read-only mode. Community mutations and consult
sales remain disabled.

The following remain independently gated:

- authenticated single-user writable staging for private cloud projects,
  autosave/conflicts, R2/Images derivatives, publishing, quotas, cleanup, and
  account lifecycle;
- a distinct second staging identity for cross-user authorization, social,
  reports, moderation, and destructive lifecycle acceptance;
- PR merge, production resources/migrations/OAuth/secrets, Worker/domain
  cutover, writable enablement, rollback drill, and production soak.

Production must remain on Pages until those separate gates are approved and
completed.
