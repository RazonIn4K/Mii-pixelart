# Staging canvas game-match gate `f03b428`

**Date:** 2026-07-15 (America/Chicago)

**Target:** `tomodachi-studio-staging`

**Approved source:** `f03b428cb696baee4b7794aa74fea14b1db5e4d2`

**Mode:** authenticated writable staging; community mutations enabled; consult
sales disabled

This is the sanitized completion record for the exact-source canvas game-match
gate. It contains no secret values, cookies, OAuth subjects, email or postal
addresses, internal user or creation IDs, object keys, project contents,
request bodies, or raw IP data.

## Exact deployment

The clean local branch and both configured remote mirrors resolved to the
approved source. The guarded staging wrapper passed its target, source,
configuration, role, binding, migration-ledger, and release-output checks,
then deployed only that source.

- Cloudflare deployment: `79412eca-886e-408d-86ee-5027c65b4070`
- Active Worker version: `2ceda6b0-ab07-4380-829f-169cadd9ec68`
- Active version number: 14
- Traffic allocation: 100 percent
- Immediate code rollback version: `d025b531-055f-46bf-be25-2089bedeef58`
- Immediate rollback version number: 13
- `COMMUNITY_MUTATIONS_ENABLED=true`
- `CONSULT_SALES_ENABLED=false`
- Compatibility flags: `nodejs_compat` and `enable_request_signal`

The isolated staging D1, private R2, KV, Images, Static Assets, and rate-limit
bindings remain attached. Exactly the eight expected staging secret binding
names remain present. No secret value was read, printed, or changed. The D1
migration ledger remains exactly `0001` through `0008`, and
`PRAGMA foreign_key_check` returned no rows. No migration was applied by this
gate. Remote `PRAGMA integrity_check` is not reported as passing because D1
rejects that operation with `SQLITE_AUTH`; the supported local migration
verifier and remote ledger/foreign-key checks passed.

## Hosted functional acceptance

A writable-safe 24-request probe passed across 13 HTML documents, six public
JSON APIs, three crawler controls, and two non-mutating blocked POST cases.
The unauthenticated same-origin creation request returned 401 and the
wrong-origin request returned 403. Documents carried the expected CSP, HSTS,
frame denial, `nosniff`, and staging `noindex,nofollow` headers. `robots.txt`
denied crawlers and both staging sitemaps were empty.

The generic `verify:hosted-read-only` command is intentionally not a valid
writable-staging gate: it requires same-origin creation to fail with 503 when
community mutations are disabled. Its GET/header/crawler checks completed,
then that configuration assertion failed as expected. It created no data and
was replaced by the writable-safe probe above.

Worker-hosted Playwright acceptance completed with 21 passes, 30
viewport-inapplicable skips, and zero failures across desktop, mobile, and
minimum-phone projects. It covered public-route accessibility, strict CSP and
form metadata, canvas pointer/touch/keyboard/pinch input, Copy Guide, mobile
layout, and horizontal-overflow checks. No application console warning or
error was observed in the hosted browser acceptance.

## Authenticated acceptance and test-data note

The explicitly approved Google staging identity completed sign-in. The account
menu exposed Profile, Projects, Settings, Moderation, and Sign out for the
existing staging administrator. Studio showed its cloud-save state and the
Share action opened the three-step review dialog; no creation was published and
no profile, social, report, moderation, role, OAuth, secret, DNS, migration, or
production setting was changed.

The sign-in resume path did create exactly one new private test draft, one ready
revision, and four ready objects. Those identifiers remain only in a private
mode-0600 temporary cleanup record and are not included here. Cleanup is not
performed under this gate because the approval prohibited other data changes;
it requires a narrowly scoped owner-delete authorization. The pre-existing
staging creation and all unrelated data remain untouched.

## Mobile performance result

The Worker-hosted mobile trace used a 390 by 844 viewport, cold-cache
navigation from `about:blank`, Slow 4G network emulation, and 4x CPU slowdown.

| Surface | LCP | CLS | INP |
| --- | ---: | ---: | ---: |
| Homepage | 288 ms | 0.0008 | not exercised |
| Restored Studio draft | 3,244 ms | 0.0673 | 168 ms |

Homepage LCP and CLS passed. Studio CLS and INP passed, but Studio LCP exceeded
the 2.5-second gate by 744 ms. Exact source `f03b428` is therefore functionally
accepted but is **not performance-accepted for production cutover**.

## Visual comparison result

Comparison against the supplied game screenshots confirmed that the deployed
implementation does not yet model the drawing surface one-for-one:

- the authoritative game surface is 256 by 256, while the default Studio draft
  is 64 by 64 and merely maps one project cell to a 4px game stamp;
- the 1px cursor becomes visually indiscernible in Fit view;
- the fine mesh is suppressed and the brush grid disappears on dense canvases;
- center axes and section guides are mutually exclusive instead of layered;
- opaque white starter backgrounds hide the checkerboard and reference;
- reference comparison is less useful than the persistent source board and
  layered/split views shown by the game workflow.

These are confirmed product defects, not deployment-cache drift. Their fix must
land in a new source commit and receive a new exact-SHA staging approval.

## Gate status and isolation

Exact source `f03b428cb696baee4b7794aa74fea14b1db5e4d2` is live on the
isolated staging Worker with the approved feature flags. Production, DNS,
secrets, roles, OAuth settings, migrations, and unrelated application data were
not changed. Production remains on its existing deployment.

Production cutover remains blocked on:

1. the corrected true-256 canvas/reference/starter source and a new exact-SHA
   staging deployment;
2. a passing Worker-hosted Studio LCP trace;
3. narrowly approved cleanup of the single acceptance-created private draft;
4. cross-user authorization and destructive-lifecycle acceptance with a
   distinct second staging identity;
5. the independent production resource, migration, OAuth, secret,
   admin-bootstrap, cutover, rollback-drill, and soak approvals.
