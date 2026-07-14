# Staging gate 3A `e5d49d13` completion evidence

**Date:** 2026-07-14 (America/Chicago)

**Target:** `tomodachi-studio-staging`

**Approved source:** `e5d49d13c5ee07cfd0640e989c48aeb796d5d412`

**Mode:** standard read-only

This record contains no secret values, cookies, identity values, internal user
IDs, email addresses, request bodies, project content, or legal address data.
It supersedes the deployment-status statements in the earlier follow-up record;
that record remains historical evidence for source `4d905038`. Later branch or
preview changes are not part of this accepted Worker deployment.

## Deployment result

The guarded release wrapper deployed the exact approved source from a clean
detached worktree after its exact-SHA, type, preflight, packaging,
migration-ledger, privileged-role, and binding checks passed.

- Cloudflare deployment: `961f2f4b-1ef0-4ffb-9328-cf7a9beef634`
- Active Worker version: `b3ca8571-815b-4111-8787-9a98f43d0140`
- Traffic allocation: 100 percent
- Immediate rollback version: `862b8979-40a2-4753-8cc8-b516c82ae7ff`
- `COMMUNITY_MUTATIONS_ENABLED=false`
- `CONSULT_SALES_ENABLED=false`
- Staging CPU limit: 2,000 ms
- Runtime handlers: `fetch` and `scheduled`

The expected D1, private R2, KV, Images, Static Assets, and rate-limit bindings
were present. The eight expected staging secret binding names remained present;
no secret value was read, printed, or changed.

The active Worker assets are byte-identical to the exact source's immutable
Pages preview `c32197ef-e6fb-48eb-9a16-aba2669980e2`:

- `/assets/index-IBAQrOZ7.js` — SHA-256
  `5fbe7ff75c635016c36d445f590b5337e7ae8c6ad4c409f4d1274811694e7954`
- `/assets/index-rJphodbm.css` — SHA-256
  `b673f1318eca2a91b0be6c6af3fcf7648ca4eaa29e616f0285847b9f0d473318`

## Read-only acceptance

The exact-source acceptance reran the anonymous API/security/crawler and
responsive browser matrices. Public discovery returned the standard
`{ data, meta, requestId }` envelope, staging remained globally
`noindex,nofollow`, and community mutations plus consult sales remained closed.
The accessibility, CSP/console, crawler, responsive overflow, and local-only
Studio pointer workflow checks passed. No OAuth setting, secret, role,
migration, DNS record, production deployment, or application record changed.

The final aggregate-only D1 verification reported:

- one active user, exactly one active admin, one external identity, and two
  sessions;
- 12 governed tags;
- zero creations, revisions, project/showcase objects, likes, comments,
  follows, reports, moderation actions, and quota reservations;
- migrations exactly `0001` through `0006` and zero foreign-key violations;
- `changes=0`, `changed_db=false`, and `rows_written=0` for both verification
  queries.

## Production isolation

Production remained on Cloudflare Pages deployment
`2f6e20cf-7ccd-47db-9c01-45aec3af7dca`, source `288bc5b` from protected
`main`. Production `tomodachi.pw` and DNS were not changed. The approved
staging Worker remains the only Worker-hosted public environment.

## Subsequent branch-only closeout

Code candidate `ab6a62e1855bcd77465e9dc560914d8c87ff7184` is available only on
immutable Pages preview `0468e3f2-7c45-40a0-8f43-0858a9bdce80` at
`https://0468e3f2.mii-pixelart.pages.dev`. It was not deployed to the staging
Worker or production.

That candidate removes render-blocking web fonts, defers noncritical homepage
and notification work, preserves below-fold geometry, and adds resilient SPA
scroll restoration for Back/Forward, fragments, rapid traversals, blocked
storage, user interruption, and delayed API-driven document height. Validation
on the exact candidate passed:

- 369 browser scenarios passed and 248 intentionally non-applicable scenarios
  were skipped across the configured desktop, tablet, phone, and WebKit matrix;
- 241 Worker tests and 73 release-preflight tests passed;
- OpenAPI-to-route, six-migration/19-table integrity, game-format, image-import,
  template, AI-sketch, resident, release-output, and staging dry-run checks
  passed;
- initial JavaScript measured 91.5 KiB gzip; the largest initial chunk was
  91.5 KiB gzip and the deferred toast runtime remained a separate 10.11 KiB
  gzip chunk.

Three isolated 390 by 844, DPR 3, Slow 4G, 4x CPU cold traces measured LCP at
2,505 ms, 2,334 ms, and 2,315 ms: median 2,334 ms. CLS was 0.00 in all three.
Neither `RuntimeToaster` nor `RecoveryHub` was requested during any initial
trace. Mobile Lighthouse scored 100 Accessibility, 100 Best Practices, and 100
Agentic Browsing. Its SEO score of 69 reflects the intentional preview
`noindex` response.

The sanitized raw artifacts remain outside the repository:

- `tomodachi-pages-ab6a62e-cold-1.json.json.gz` — SHA-256
  `8ed097586ea88952dd422f838f3a77b1e240292b4b4028f351af81335578880d`
- `tomodachi-pages-ab6a62e-cold-2.json.json.gz` — SHA-256
  `fdae7cbbc130d2c5fa168248f741e794ff4ac79f38633396c73496a63efe45a4`
- `tomodachi-pages-ab6a62e-cold-3.json.json.gz` — SHA-256
  `3aeb3eaf350f785f65418899c490efc31334c1ad313d64cd0d884b6b57744814`
- `tomodachi-lighthouse-ab6a62e/report.json` — SHA-256
  `fd6aca321cbc2cc0b18fe68826af9b3a0443f72e6b84a3eb7baab49d2aec4c8b`

An evidence-only follow-up commit may change the branch SHA without changing
the measured JS/CSS bytes. Those bytes must be rechecked on its immutable Pages
preview before treating this as final-head evidence.

## Remaining approval gates

- Deploying any post-`e5d49d13` source to the staging Worker requires a new
  explicit exact-SHA approval.
- Authenticated writable staging still requires separate acceptance for cloud
  save/autosave/conflicts, R2/Images media, publishing, quotas, cleanup, and
  account lifecycle behavior.
- Cross-user authorization, social/report/moderation, and destructive lifecycle
  acceptance require a distinct second staging identity.
- PR merge, production resources/migrations/OAuth/secrets, Worker/domain
  cutover, admin bootstrap, writable enablement, rollback drill, and production
  soak remain independently gated.

Consult sales and all community mutations remain disabled on staging.
