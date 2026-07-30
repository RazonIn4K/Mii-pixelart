# Staging canvas and AI gate `18e36da`

**Date:** 2026-07-15 (America/Chicago)

**Target:** `tomodachi-studio-staging`

**Approved source:** `18e36dac9eb88ac862c2292471125f58199550b9`

**Mode:** authenticated writable staging; community mutations enabled; consult
sales disabled

This is the sanitized completion record for the exact-source canvas and AI
gate. It contains no secret values, cookies, OAuth subjects, email or postal
addresses, internal user or creation IDs, object keys, project contents,
request bodies, or raw IP data.

## Exact deployment

The clean local branch and both configured remote mirrors resolved to the
approved source. The guarded staging wrapper passed its target, source,
configuration, role, binding, migration-ledger, and release-output checks,
then deployed only that source.

- Cloudflare deployment: `4bb2e58c-5cdb-441a-aa95-2e92d3d69d6c`
- Active Worker version: `d025b531-055f-46bf-be25-2089bedeef58`
- Active version number: 13
- Traffic allocation: 100 percent
- Immediate code rollback version: `ce30c9d9-1801-46ae-8485-ac029b08f54b`
- Immediate rollback version number: 12
- `COMMUNITY_MUTATIONS_ENABLED=true`
- `CONSULT_SALES_ENABLED=false`
- Compatibility flags: `nodejs_compat` and `enable_request_signal`

The isolated staging D1, private R2, KV, Images, Static Assets, and rate-limit
bindings remain attached. Exactly the eight expected staging secret binding
names remain present. No secret value was read, printed, or changed. The D1
migration ledger remains exactly `0001` through `0008`, and
`PRAGMA foreign_key_check` returned no rows. No migration was applied by this
gate.

## Hosted functional acceptance

The Worker returned 200 HTML documents for Home, Studio, Discover, Search, and
the public legal/community routes. The anonymous session endpoint returned its
standard success envelope with `user: null` and advertised community mutations
as enabled. Unknown API routes returned the standard 404 JSON envelope;
unauthenticated account access returned 401; and a wrong-origin creation write
failed with 403.

The AI status endpoint returned `configured: true` and provider data
collection `deny`. The live model catalog returned four checked-in presets:
three free models were available and one was reported unavailable without an
authentication failure.

Worker-hosted Playwright acceptance used mocked mutation endpoints and caused
no staging writes:

- accessibility, canvas, and Copy Guide: 18 passed; 14 viewport-inapplicable
  cases skipped;
- focused Studio AI: six passed;
- focused recovery behavior: three passed;
- public routes and navigation: 28 passed; two inapplicable cases skipped.

The responsive runs reported no application runtime errors or horizontal
overflow.

## Authenticated browser acceptance

The existing staging administrator session was used without changing identity,
role, profile, OAuth settings, or account data. The account icon opened the
expected Profile, Projects, Settings, Moderation, and Sign out destinations.

Studio rendered exactly one editable 64 by 64 application canvas and one paint
toolbar. The AI tab opened successfully. The **Get advice only** path required
the explicit provider disclosure, preserved provider data collection `deny`,
and returned a genuine OpenRouter response. It did not change the canvas. The
Share action opened the three-step **Review before publishing** dialog, which
was closed without publishing. No cloud save, project revision, profile write,
social action, moderation action, or destructive account action was performed.

The authenticated browser reported no console warnings or errors.

## Security, crawler, and accessibility evidence

Staging documents returned CSP, HSTS, frame denial, `nosniff`, and global
`noindex,nofollow`. `robots.txt` denied all crawlers, and both staging sitemaps
were empty. Lighthouse scored 100 Accessibility, 100 Best Practices, and 100
Agentic Browsing on the mobile staging homepage. The SEO score of 69 is the
expected staging result caused by the intentional indexing prohibition.

## Exact-source performance result

The homepage passed the agreed mobile lab profile at 390 by 844, DPR 3, Slow
4G, and 4x CPU throttling:

| Trace | LCP | CLS |
| --- | ---: | ---: |
| 1 | 2,317 ms | 0.00 |
| 2 | 2,185 ms | 0.00 |
| 3 | 2,180 ms | 0.00 |

Median homepage LCP was 2,185 ms. A normal Studio grid-density interaction
measured 110 ms INP.

Two separate Studio paths did not pass the full performance gate on the
deployed source:

- **Start blank** measured approximately 544 to 553 ms INP. The trace isolated
  15,808 starter-preview elements mounted by the same interaction, rather than
  a duplicate drawing canvas, as the dominant cost.
- Three returning-draft Studio navigations measured 3,053 ms, 3,146 ms, and
  3,067 ms LCP (3,067 ms median) with 0.17 CLS.

The exact deployed source is therefore functionally accepted for this gate,
but it is **not performance-accepted for production cutover**.

## Follow-up source fix, not deployed by this gate

A follow-up worktree change replaces the 15,808 preview elements with 28
low-resolution pixel canvases, keeps the Create panel below 500 descendants,
caps the editable canvas backing store at a crisp 2x DPR, stabilizes the
pre-draft canvas-area height, and acknowledges **Start blank** before mounting
the complete editor and starter library.

Five fresh production-build interaction traces under the same 390 by 844,
DPR 3, Slow 4G, and 4x CPU profile measured 80, 87, 77, 72, and 86 ms. Trace
p75 was 86 ms; the corresponding quantized Event Timing samples had an 88 ms
p75. Focused desktop and minimum-phone workflow coverage verifies all 28
painted previews, one authoritative editable canvas, one paint toolbar, real
painting/undo behavior, and no overflow or console errors.

These follow-up changes are not part of approved source `18e36da` and were not
deployed. A new exact-source staging approval, deployment, and Worker-hosted
cold-load trace are required before they can close the hosted performance gate.

## Data and production isolation

Sanitized D1 aggregates were identical before and after the deployment:

- one user and one administrator; zero moderators;
- one external identity and one active session;
- one private draft and zero published creations;
- one ready revision and four ready creation objects;
- zero uploading revisions, retained profile images, retained showcase images,
  open reports, or moderation actions.

The final D1 query reported `changes=0`, `changed_db=false`, and
`rows_written=0`. Production root and AI-status response hashes matched their
pre-gate baselines, and production continued to return 200 from Cloudflare
Pages. No production deployment, DNS change, migration, secret change, role
change, OAuth change, or production/staging application-data mutation occurred.

## Gate status

Exact source `18e36dac9eb88ac862c2292471125f58199550b9` is deployed and
functionally accepted on the isolated staging Worker for the approved canvas,
real AI-advice, account-menu, share-review, accessibility, CSP, crawler, and
isolation scope. Community mutations remain enabled only on staging, and
consult sales remains disabled.

Production remains blocked on:

1. a new exact-source staging gate for the follow-up Studio performance fix and
   Worker-hosted cold/interaction acceptance;
2. a distinct second staging identity for cross-user authorization, social,
   report, moderation, conflict, and destructive lifecycle coverage;
3. production resource, migration, OAuth, secret, admin-bootstrap, read-only
   cutover, writable-enable, rollback-drill, and soak approvals.

Production must remain on Pages until those independent gates pass.
