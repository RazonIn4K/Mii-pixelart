# Staging gate 3A replacement evidence

**Date:** 2026-07-13 (America/Chicago)

**Target:** `tomodachi-studio-staging`

**Approved source:** `782b5791c16fa46dc69b126071f73962581b5995`

**Mode:** standard read-only

This record contains no secret values, cookies, identity values, internal user
IDs, request bodies, or project content.

## Deployment result

The guarded release wrapper deployed the approved source from a clean detached
worktree after the exact-SHA, type, preflight, packaging, migration-ledger, and
privileged-role checks passed.

- Cloudflare deployment: `d4031751-e38e-4567-a7b9-a79bcf4a4d0a`
- Active Worker version: `cb7e4aa7-c5f3-4025-ba09-be20984c09fe`
- Traffic allocation: 100 percent
- `COMMUNITY_MUTATIONS_ENABLED=false`
- `CONSULT_SALES_ENABLED=false`
- Immediate rollback version: `9ea84b17-6660-440e-912d-52613a20e995`
- Earlier retained version: `180343e7-a799-4cdd-b0ca-010a4c17fbe2`

The staging migration ledger had nothing pending. The eight expected staging
secret names were unchanged; no value was read or printed. Aggregate-only D1
checks before deployment, after deployment, and after acceptance were
identical. The final query reported `changes=0`, `rows_written=0`, and
`changed_db=false`.

Production, DNS, OAuth settings, migrations, secrets, roles, and application
data were not changed. Production continued to return its existing Pages HTML
responses during the post-deploy check.

## Read-only acceptance

The API and security matrix passed 594 of 594 assertions without an
authenticated session. It covered anonymous discovery and tag reads,
authentication boundaries, request-ID envelopes, cache controls, security
headers, canonical and crawler documents, legal routes, aliases, and a missing
creation. Five representative community mutations failed closed with
`503 SERVICE_UNAVAILABLE`; a wrong-origin mutation failed with `403 FORBIDDEN`.
No OAuth start, logout, session revocation, account deletion, provider request,
checkout, webhook, scheduled handler, or raw upload was invoked.

Responsive functional checks passed in Chromium at 1440, 1024, 768, 430, 390,
360, and 320 CSS pixels across Home, Discover, Search, Terms, and Studio. The
same five routes passed at 390 pixels in WebKit. There was no horizontal
overflow, browser zoom remained enabled, the modal mobile menu contained and
restored focus correctly, and Studio completed a local-only pencil stroke and
undo against one bounded canvas. The published legal address appeared on
Terms.

Under the agreed 390 by 844, DPR 2, Slow 4G, 4x CPU lab profile, Chrome
DevTools measured:

- LCP: 523 ms
- CLS: 0.00
- representative mobile-menu INP: 77 ms

The raw traces and browser artifacts were retained outside the repository for
the local release session. Sanitized trace identities are:

- `tomodachi-staging-782b579-mobile-trace.json.json.gz` — SHA-256
  `9c3514bf03504b6aaef6bf2066079a89e106c0306c03ed48d1e2b572c747fe9d`
- `tomodachi-staging-782b579-mobile-interaction-trace.json.json.gz` — SHA-256
  `26eccadfb763f30f53f0864bbcf8ae7bff121794eec1eb2594fc65c4e9b96454`

## Acceptance findings and disposition

The deployed SHA is functionally healthy and its read-only security controls
passed, but strict WCAG/no-console acceptance did not pass:

1. Axe and Lighthouse found low-contrast secondary text on Home and community
   routes. Lighthouse accessibility scored 96 on the mobile Home audit.
2. the intended Google Fonts preconnect was blocked because the exact font
   origins were absent from `connect-src`; WebKit also reported a nonfunctional
   Trusted Types report-only policy with no reporting destination;
3. staging's static crawler files invited indexing and advertised production
   sitemap URLs even though dynamic documents used staging canonicals.

The pull-request branch contains a code-only follow-up that replaces low-alpha
copy with AA-safe semantic text colors, adds a concise `llms.txt`, narrows the
font CSP exception to the two exact Google origins, removes only the orphaned
report-only policy, and makes staging crawler controls environment-aware.
Local Chromium and WebKit Axe runs, Studio drawing-state scans, Worker tests,
release dry runs, type checks, and builds pass for that follow-up. It was not
deployed under this exact-SHA approval and requires a new deployment gate after
hosted checks complete.

## Gate status

- Exact approved read-only deployment: complete.
- API/security and responsive functional acceptance: pass.
- Strict WCAG/no-console acceptance of the deployed SHA: incomplete; defects
  reproduced and fixed in the undeployed follow-up.
- Writable community acceptance, cross-user authorization/moderation testing,
  PR merge, and production cutover: still separately gated.
