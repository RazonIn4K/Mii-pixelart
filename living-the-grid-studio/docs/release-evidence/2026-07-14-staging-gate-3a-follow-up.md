# Staging gate 3A follow-up evidence

**Date:** 2026-07-14 (America/Chicago)

**Target:** `tomodachi-studio-staging`

**Approved source:** `4d905038d755cf4ffd0860bee02037f647ddfc0a`

**Mode:** standard read-only

This record contains no secret values, cookies, identity values, internal user
IDs, email addresses, request bodies, project content, or legal address data.
It is the completion record for the follow-up deployment and does not replace
the historical
[`2026-07-13-staging-gate-3a-replacement.md`](2026-07-13-staging-gate-3a-replacement.md)
record for source `782b5791c16fa46dc69b126071f73962581b5995`.
Later worktree or branch changes are not part of this accepted deployment unless
they receive their own exact-SHA release record.

## Deployment result

The guarded release wrapper deployed the exact approved source from a clean
detached worktree after its exact-SHA, type, preflight, packaging,
migration-ledger, privileged-role, and binding checks passed.

- Cloudflare deployment: `11066f7b-5249-4bbc-af1a-093b049534b8`
- Active Worker version: `862b8979-40a2-4753-8cc8-b516c82ae7ff`
- Traffic allocation: 100 percent
- `COMMUNITY_MUTATIONS_ENABLED=false`
- `CONSULT_SALES_ENABLED=false`
- Staging CPU limit: 2,000 ms
- Immediate rollback version: `cb7e4aa7-c5f3-4025-ba09-be20984c09fe`
- Normalized new and rollback binding manifests: identical, SHA-256
  `3c33c5369d4d8cf13ff996ff1a14f806f35313599da364be88a897a90eb539b4`

The eight expected staging secret binding names remained present. No secret
value was read, printed, or changed. The migration ledger remained exactly
`0001` through `0006`.

## Read-only acceptance

- The API, security, and crawler harness passed 571 of 571 assertions across
  29 requests.
- Five representative community mutations failed closed with the standard
  `503 SERVICE_UNAVAILABLE` envelope. A wrong-origin mutation returned
  `403 FORBIDDEN`.
- Staging-wide `X-Robots-Tag: noindex,nofollow`, deny-all `robots.txt`, empty
  sitemaps, request IDs, cache controls, and hardened security headers passed.
- Twelve of twelve focused HTTP, CSP, font, and metadata probes passed.
- Twenty of twenty responsive route scenarios passed across Chromium desktop,
  Chromium mobile and 320-pixel reflow, and mobile WebKit.
- The modal mobile navigation passed focus containment, Escape close, scroll
  locking, and focus restoration in both tested browser engines.
- Axe reported zero violations. The run recorded zero application console
  warnings or errors, page errors, failed requests, HTTP errors, or horizontal
  overflow.
- Mobile Lighthouse scored 100 for Accessibility and 100 for Best Practices.
  Its SEO deduction was expected because staging is intentionally unindexable.
- A local-only Studio pointer stroke changed the active canvas and enabled
  Undo. Undo restored the sampled pixel exactly and enabled Redo.
- Browser zoom remains permitted and 320-pixel reflow passed. A direct 200
  percent Chrome page-scale assertion was not run and remains a launch check.

## Data and production isolation

Aggregate-only D1 snapshots before deployment, after deployment, and after
acceptance were identical: one active admin, one external identity, two
sessions, and zero project, community, social, or moderation records. The final
read-only query reported `changes=0`, `changed_db=false`, and `rows_written=0`.

Production remained on the existing Cloudflare Pages deployment. Its root and
AI-status responses continued to match the immutable Pages surface, production
discovery continued to return the Pages SPA response rather than the staging
Worker JSON response, and DNS answers remained unchanged. No production, DNS,
role, OAuth, migration, secret, or application-data change occurred.

## Findings and remaining gates

The prior candidate's contrast, Google Fonts CSP, orphaned report-only policy,
and staging crawler findings are fixed and accepted on this exact deployed
source.

The deployed exact source contains one non-blocking Studio copy issue: the
canvas counter can render `1 colors· x:4 y:4` instead of
`1 color · x:4 y:4`. It was correctly recorded rather than changed under the
exact-SHA deployment approval. A subsequent branch-only patch fixes that copy,
related count labels, and the unsupported-ARIA manual-review findings, and adds
a direct local Chromium 200 percent page-scale regression. Those later changes
are not part of this deployment record and require a new exact-SHA gate before
they can be described as hosted.

The following work remains separately gated:

- authenticated writable staging acceptance for private save, autosave,
  conflicts, R2/Images derivatives, publishing, quotas, cleanup, and account
  lifecycle behavior;
- a distinct second staging identity for cross-user authorization, social,
  report, moderation, and destructive account-lifecycle testing;
- live provider and payment test operations that create external state;
- PR merge, production resources and migrations, production OAuth and secrets,
  Worker/domain cutover, rollback drill, and production soak.

Consult sales remains disabled and is not required to complete the community
platform launch. Production must remain on Pages until the independent writable
staging and production gates pass.
