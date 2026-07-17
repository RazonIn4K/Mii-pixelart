# Tomodachi Studio production-readiness plan

**Status:** Execution plan; it grants no remote, data, credential, migration,
DNS, merge, or production authority

**Plan owner and final go/no-go authority:** David Ortiz

**Last updated:** 2026-07-16

**Runtime boundary:** Production remains on Cloudflare Pages until the separate
production cutover gate in this plan is explicitly approved and completed.

This document turns the all-phase community plan into a sequence of small,
auditable release gates. An approval applies only to the named gate, exact Git
commit, target, flags, and data operations in that gate. Passing a local or
staging check does not authorize the next gate.

## Current checkpoint

- The community branch checkpoint is
  `b34f821373657ccf8e5d38401af6c4ff255fc65c`. GitHub and GitLab carry that
  exact branch ref, its owned PR checks are green, and its exact Pages preview
  is `https://02e85e33.mii-pixelart.pages.dev`. This is repository and preview
  evidence, not a staging-exit or production approval.
- The next candidate now adds retry-safe first-cloud-save idempotency, exact
  Worker source-identity headers, the fail-closed P2 writable harness, and the
  secret-free P3 two-session runner. Those local changes alter runtime code;
  they must be committed, pushed, scanned, and deployed as one new exact SHA
  before any earlier hosted evidence can be reused. No P2/P3 remote run,
  staging mutation, or production change was performed while building them.
- Staging is serving exact runtime source
  `80fdcd5da432b88d06d84bfd084e9f0993edc363` as Cloudflare deployment
  `9803bbba-4ee5-45fc-9027-7afd4e902089`, active Worker version
  `c56f580f-2238-4775-846d-3d2c08f17c78` (version 19) at 100 percent traffic.
  The changes from `80fdcd5` through `b34f821` are documentation and test
  configuration only, so the deployed application runtime is equivalent, but
  that equivalence does **not** replace the required exact-head hosted P1
  evidence.
- The deployed staging flag is `COMMUNITY_MUTATIONS_ENABLED=true`. Payments and
  consultations are retired; the staging D1 migration ledger contains `0001`
  through `0008`. That deployment did not apply a migration, rotate a
  secret, change OAuth, DNS, a role, production, or application data.
- Anonymous routes, crawler controls, CSP/security headers, the authenticated
  account menu, one authoritative true-256 Studio canvas, isolated drawing,
  import/reference/Copy Guide, export-failure recovery, real AI advice, and the
  publish-review dialog passed the completed functional checks. No project was
  published and no existing cloud draft was changed during that gate.
- The performance and AI corrections are present in the deployed runtime, but
  P1 remains open because the final branch head has not completed the required
  immutable exact-head cold, restored-draft, cloud-load, interaction, and
  mobile performance record. Earlier hosted results remain supporting evidence
  only and may not be promoted to final exact-head acceptance.
- The assembled local release candidate passes both TypeScript projects,
  8 preflight files/135 tests, 38 Worker files/345 tests, and the complete
  Playwright matrix with 410 executed passes plus 396 intentional
  viewport/project skips. The isolated reruns for the two earlier
  concurrency-timeout cases also pass. The production bundle remains within
  budget at 92.3 KiB initial/largest gzip, all three target-explicit Worker
  dry-runs pass without deployment, and `pnpm audit --audit-level high` reports
  no known vulnerabilities. These are local candidate checks, not hosted P1-P5
  evidence.
- Production remains Cloudflare Pages at exact source
  `c044134ec4ecd33e0ab00437e1a6e9283bd9ae91`, deployment
  `b73cc5ba-c91f-4896-90e5-b7f22d4af80b`. A production Worker and isolated
  production resources do not exist yet; the checked-in production IDs are
  placeholders. Nothing in this document authorizes a merge, production
  deployment, DNS change, migration, resource creation, secret write, OAuth
  change, or new staging data.

## Authority and evidence rules

| Action | Required authority | Executor | Durable evidence |
| --- | --- | --- | --- |
| Local implementation and tests | Maintainer scope | Release engineer | Git diff, test output, bundle report |
| Commit, push, PR or MR update | Explicit owner request when not already in scope | Repository maintainer | Full SHA and remote checks |
| Staging deploy | Exact-SHA staging approval | Cloudflare release engineer | Readiness record, version/deployment IDs, bindings and rollback version |
| Staging identity or fixture writes | Named data-change approval | Test operator and release engineer | Sanitized before/after manifests and fixture IDs |
| D1 migration | Target- and file-specific migration approval | Cloudflare/D1 operator | Ledger, integrity and foreign-key results |
| Secret or OAuth change | Target- and credential-specific approval | Account owner | Secret **names** and provider/config audit record; never values |
| Role change | Exact internal UUID and target approval | D1 operator | Exactly-one-row result and `id, role` read-back |
| Production deploy or DNS cutover | Separate production cutover approval | Cloudflare account owner and release engineer | Old/new runtime IDs, TLS/routing checks, rollback record |
| Legal, policy, licensing, and provider-cost go/no-go | David Ortiz, with professional review where he chooses it | Operator | Dated decision record; automated scans are supporting evidence only |

Store public, secret-free evidence under `docs/release-evidence/`. Do not
duplicate the approved public-service address outside the legal pages merely
for release evidence. Store internal UUIDs, provider account identifiers,
scanner reports, and other non-public evidence only in the private change
record. Never store OAuth subjects, emails, session cookies, tokens, raw IPs,
project contents, or report free-text in release logs.

## Gate map

| Gate | Outcome | Depends on | Current state |
| --- | --- | --- | --- |
| P1 | Exact-head Studio performance and functional closeout | Current staging checkpoint | Runtime correction is deployed through `80fdcd5`; the new runtime candidate still needs exact-head hosted evidence |
| P2 | Fail-closed writable hosted harness | P1 source candidate | Local implementation and injected tests complete; no remote writable run is approved or complete |
| P3 | Secret-free live-auth runner | P2 safety primitives | Local implementation and injected tests complete; no two-session live-auth run is approved or complete |
| P4 | Two-user authorization, social, report, moderation, and conflict acceptance | P2-P3 | Not complete on live staging |
| P5 | Deletion, cancellation, retention, and scheduled cleanup acceptance | P2-P4 | Not complete on live staging |
| P6 | Legal, operator, contact-channel, provider-cost, and licensing sign-off | Can run beside P1-P5 | Partially recorded; live checks remain |
| P7 | Payments-retired proof | Every release candidate | Retired; compatibility tombstones must remain fail-closed |
| P8 | Exact-head GitHub and GitLab security/CI evidence | P1-P7 | Must be rerun on the final SHA |
| P9 | Final staging exit review | P1-P8 | Blocked by preceding gates |
| P10 | Isolated production resources, schema, OAuth, secrets, and bootstrap readiness | P9 | Not authorized by this plan |
| P11 | Read-only Worker production cutover and admin bootstrap | P10 | Production remains Pages |
| P12 | Production community-write enablement | P11 read-only acceptance | Not authorized |
| P13 | Soak, rollback drill, and Pages-retention decision | P12 | Not started |
| P14 | Post-launch operations and deliberately deferred features | P13 | Not started |

P1 is the active engineering gate. P2-P5 are required even without organic
users: a second synthetic identity is what proves object-level authorization,
and disposable data is what proves irreversible cleanup safely.

## P1 - Close exact-head Studio performance and functional evidence

**Owner/authority:** The maintainer may implement and test locally. David Ortiz
must approve the final 40-character SHA before another staging deploy. That
approval must explicitly preserve the reviewed `COMMUNITY_MUTATIONS_ENABLED`
mode.

**Prerequisites**

- Remove the measured long task and excessive render work rather than hiding
  it with a loading animation.
- Preserve one authoritative drawing canvas, exact pointer coordinates,
  keyboard/touch/pen behavior, draft recovery, Copy Guide, AI consent and undo,
  and anonymous JSON/PNG/ZIP exports.
- Keep the working tree clean at the candidate commit and do not mix unrelated
  schema, secret, OAuth, DNS, legal, or production changes into this gate.

**Commands and evidence**

```bash
cd living-the-grid-studio
pnpm install --frozen-lockfile
pnpm audit --audit-level high
pnpm check
pnpm db:migrate:local
pnpm test:worker
pnpm test:preflight
pnpm verify
pnpm test:e2e
pnpm build
pnpm verify:bundle
pnpm worker:dry-run
pnpm worker:dry-run:staging
pnpm verify:release-output
git diff --check
```

On a production build and again on the deployed exact SHA, capture at least
five fresh-profile runs for the homepage, first **Start blank**, and restored
draft. Use 390 by 844, device scale factor 3, Slow 4G, 4-times CPU, cold cache,
and cleared IndexedDB/local storage before each applicable run. Record the
p75 LCP, CLS, and interaction EventTiming, not only screenshots or a warm-load
diagnostic. Also test 320, 360, 390, 430, 768, 1024, and 1440 pixel layouts,
200% zoom, reduced motion, console/network failures, and horizontal overflow.

**Go/no-go:** Go only if p75 LCP is below 2.5 seconds, CLS below 0.1, INP below
200 ms, initial JavaScript below 200 KiB gzip, every lazy route chunk below
250 KiB gzip, and all functional/accessibility tests pass on the same SHA.
Any threshold miss, stale trace, console error, failed expected request,
duplicate interactive grid, or changed provider data-collection mode is no-go.

**Rollback:** Before deployment, query and record the then-active version and
its immediate reviewed rollback version; do not reuse an obsolete version ID
from an earlier gate. If the new version regresses behavior, return staging to
that recorded functional version; if the issue affects authorization, privacy,
or data integrity, deploy the validated read-only artifact instead. Do not
reverse D1 migrations or delete R2 data as a code rollback.

## P2 - Build a fail-closed writable hosted harness

**Owner/authority:** Local implementation is maintainer work. Its first remote
run requires an explicit staging-fixture approval naming allowed users, routes,
object prefixes, maximum writes, and cleanup plan.

**Prerequisites**

- Keep `verify:hosted-read-only` unchanged as the credentialless read gate.
- Use the tracked `verify:hosted-staging-writable` script. Ad hoc shell
  collections do not count as writable acceptance.
- Require exact `https://staging.tomodachi.pw`, expected source SHA/Worker
  version, and `COMMUNITY_MUTATIONS_ENABLED=true`. Refuse production,
  redirects, arbitrary hosts, unexpected cookies/headers, unlisted routes, and
  non-fixture object IDs.

**Commands and evidence**

The integrated command reads only the gitignored
`.deployment-readiness/staging-writable.json` file. It refuses any other path,
requires mode `0600`, and accepts no CLI-supplied identity or approval values.
The private file must bind a fresh 30-minute-or-shorter window to the exact
source SHA, active Worker version, owner internal UUID, distinct second-user
internal UUID, unique UUIDv4 `runId`, fixed ceilings, and the four required
safety confirmations. Immediately before the first mutation the runner
atomically creates a `0600` consumption marker and removes the approval file;
the same `runId` cannot authorize another run. Never commit either file.

```bash
pnpm verify:hosted-staging-writable
```

- Unit-test the complete request allowlist, byte/object ceilings, first-failure
  stop, redaction, idempotent cleanup, and production-host refusal with injected
  fetch; those tests must not contact a remote service.
- Capture sanitized pre/post D1 row counts and R2 manifest counts. Use generated
  fixture IDs and an explicit test prefix; never infer ownership from a title or
  username. The tracked runner starts a loopback-only, non-deployable audit
  Worker with the staging R2 binding in remote-development mode, independently
  lists the one generated creation prefix, HMAC-attests the response, and
  compares every key, byte size, streamed byte count, and SHA-256 digest against
  D1. Listings, responses, objects, process output, and process lifetime are all
  bounded; any orphan, missing object, digest mismatch, or cleanup failure stops
  the run.
- Require every write response to have the standard envelope and request ID.
  Record created IDs only in the private run record and delete fixtures through
  normal APIs. A narrowly scoped cleanup script is a separately approved
  fallback, not the default path.

**Go/no-go:** Go when a deliberately interrupted local fixture run cleans up,
production and unknown targets fail before network access, and the approved
staging run leaves only the declared retained fixtures. Any unexplained D1/R2
delta, token in output, cross-origin response, or cleanup failure is no-go.

**Rollback:** Abort further writes, revoke the disposable sessions, run only
the pre-approved idempotent fixture cleanup, and preserve manifests for
reconciliation. A code defect rolls back the Worker; it never justifies manual
schema reversal.

## P3 - Add a secret-free live-auth runner

**Owner/authority:** David Ortiz approves each Google staging identity used.
The identity owner performs the interactive Google step. The runner may manage
only browser-memory session state.

**Prerequisites and implementation**

- Add a staging-only Playwright/Chrome runner that verifies the expected host,
  source SHA, and flags before opening Google sign-in.
- Keep Google credentials, OAuth codes, subjects, session tokens, and cookies
  out of source, shell arguments, environment dumps, screenshots, videos,
  traces, Playwright storage-state files, CI artifacts, and logs.
- Use an ephemeral browser profile and keep the `__Host-tomodachi.sid` cookie
  in browser memory. Persist only the internal UUID in the private approval
  record when a role or fixture needs it.
- Reuse the current owner account only for owner/admin checks. Add a distinct
  approved Google staging test user for cross-account checks; do not create a
  fake D1 identity that bypasses OIDC.
- The tracked `verify:staging-live-auth` command performs the standalone
  two-context lifecycle check. The integrated P2 command invokes the same
  runner and binds both in-memory sessions to the private approval record. It
  keeps session IDs private in memory, signs out both contexts, then requires a
  sanitized read-only staging D1 query to prove both exact session rows are
  present and revoked; cookie clearing alone does not count as revocation.

**Evidence:** Show verified-email onboarding, Terms attestation, session
creation/revocation, ten-session eviction, fresh-auth enforcement, sign-out,
and a post-run scan proving no auth material was written. Provider credentials
must not be changed for this gate.

**Go/no-go:** Go only when two independent staging sessions can be supplied to
P4 without serialization to disk and revocation invalidates each as expected.
A Google challenge that requires unsafe credential capture is no-go; complete
the interactive step manually instead.

**Rollback:** Revoke the disposable sessions through the product endpoint and
close the ephemeral profiles. Do not delete an external identity merely to
hide a runner defect.

## P4 - Run two-user, social, moderation, media, and conflict acceptance

**Owner/authority:** A separate staging-data approval must name the owner/admin
and second-user UUIDs and allow only synthetic creations, comments, follows,
likes, reports, profile/showcase images, and reversible moderation actions.
David Ortiz remains the human moderation decision-maker; AI may summarize but
may not execute an action.

**Required scenarios**

1. User B creates a private project, saves/autosaves, retries offline, and
   resolves an `If-Match` conflict by both supported choices. User A receives
   denial for every private read/write/object route.
2. Publish public and unlisted variants. Confirm unlisted direct access plus
   `noindex`, and exclusion from profiles/search/discovery/tag feeds. Confirm
   unpublish and download/remix permission behavior.
3. Like/unlike, follow/unfollow, comment create/edit/delete, disabled comments,
   owner toggle, moderator lock, duplicate actions, cursor pagination, and
   authoritative rate/uniqueness constraints.
4. Submit each report target type needed by the UI, prove duplicate-open and
   five-per-day limits, then have the authenticated human admin hide/restore,
   lock/unlock, suspend/restore, resolve/dismiss, and verify immutable audit
   rows plus cross-role denial.
5. Upload, replace, report, moderate, remove, and fall back from a normalized
   profile image; regenerate the code avatar independently. Repeat for a
   creation showcase image. Test signature/type/dimension/size/focal-point,
   quota, replay, wrong-origin, Cookie-bearing upload, Images/R2/D1 failure,
   evidence hold, replacement race, and metadata removal.
6. Prove the 100-creation and 50-MiB account limits, including `deleting`
   normalized objects, with bounded fixtures rather than wasteful large uploads.
7. Export the account as streaming NDJSON and verify projects, media manifests,
   comments, likes, follows, and moderation-visible data without buffering the
   quota.

**Evidence:** Save the test-case/result matrix, request IDs, before/after
sanitized D1/R2 manifests, foreign-key/integrity results, and cleanup result.
Do not retain uploaded originals or moderation text in release evidence.

**Go/no-go:** Zero cross-user disclosure or unauthorized mutation, zero
unexplained objects, and zero non-reversible moderator action are mandatory.
Any private/unlisted leak, newer-image removal race, quota bypass, orphaned
object, or audit mismatch is no-go.

**Rollback:** Restore every reversible moderation state, delete fixtures via
owner APIs, release report evidence holds through normal disposition, revoke
test sessions, and reconcile R2 from D1 manifests. Preserve audit rows required
by retention; do not rewrite history.

## P5 - Prove deletion, cancellation, retention, and scheduled cleanup

**Owner/authority:** Use dedicated non-admin disposable staging identities.
Advancing synthetic timestamps or triggering a scheduled run is a separate,
narrowly scoped staging-data approval. Never run these cases against the owner
admin or production.

**Required scenarios and evidence**

- Deletion immediately hides content, revokes all sessions, and enters the
  seven-day grace state. Cancellation requires fresh Google authentication and
  restores the account with creations private.
- A second disposable account passes the final-deletion claim race. Verify
  identities, sessions, projects, media, comments, likes, follows, and held
  image evidence are erased while only approved pseudonymized moderation
  metadata remains.
- Exercise one-hour stale revision/profile/showcase reservations, expired
  sessions, 24-hour obsolete revisions, deleted creations, failed/deleting
  image retries, 90-day report-text purge, two-year moderation retention, and
  popularity recalculation. Inject a per-item R2 failure and prove later items
  and retention work still run.
- Observe at least one actual staging cron completion with structured redacted
  logs. Confirm logs contain no raw path/query, IP, email, UUID/pseudonym,
  cookie, body, report text, or project content.
- Re-run the migration ledger, `PRAGMA foreign_key_check`, integrity checks,
  and D1/R2 reconciliation after cleanup.

**Go/no-go:** Go only when cancellation wins safely before the atomic final
claim, final erasure is complete and idempotent after the claim, retention is
exact, failure isolation is proven, and no orphan remains. Waiting seven real
days is unnecessary only when the approved test changes timestamps for the
named fixtures; that permission does not extend to other rows.

**Rollback:** Final deletion is intentionally irreversible, so safety comes
from disposable identities and pre-run manifests, not restoration. Stop the
cron fixture lane, preserve failure evidence, and roll back code only after the
current schema and object state are understood.

## P6 - Close legal, operator, channel, provider-cost, and licensing checks

**Owner/authority:** David Ortiz is the operator and final business go/no-go.
Automated checks do not substitute for legal, copyright, privacy, or tax
advice.

**Checklist and evidence**

- Verify the public operator name is David Ortiz and the operator-approved
  service address beginning `122 W Taylor St, DeKalb, Illinois` is published in
  complete mail-ready form, including any required postal data, consistently
  in Terms, Privacy, Copyright, and the private launch record. Do not infer
  missing address fields.
- Send controlled delivery tests and document ownership, review cadence,
  escalation, and backup coverage for `legal@`, `privacy@`, `security@`,
  `help@`, and abuse/report intake. David Ortiz's statement that
  he monitors them is the owner declaration; delivery and escalation still
  need live proof.
- Confirm 13+ attestation, current Terms version, seven-day deletion grace,
  90-day report-text purge, two-year minimal moderation retention, data export,
  Google identity disclosure, public-content licensing, appeal/report process,
  copyright notice/counter-notice routing, and cookie behavior.
- Confirm payments, tips, donations, and consultations are not offered. Recheck
  current Workers, D1, R2, and Images pricing and approve the expected
  generated-image transformation/storage cost.
- Run `pnpm verify:licenses`, review every changed production dependency and
  required notice, and record an explicit human disposition. The checked-in
  baseline means `observed-not-legally-approved`; making it green is not legal
  approval.
- Inventory shipped visual assets and generated artwork. Record source and
  rights, and prove no Nintendo screenshot, logo, font, music, interface icon,
  character model, Mii likeness, or Tomodachi Share asset/code ships. Keep the
  independent fan-made, manual Copy Guide, and no-game-file-export language.

**Go/no-go:** No placeholder, bounced public channel, unowned escalation,
unreviewed dependency/license drift, unexpected payment claim/control, or
third-party asset of uncertain rights may remain.

**Rollback:** Keep launch blocked. Revert or replace the affected copy/asset,
preserve the prior legal version for records, and require renewed operator
acceptance when policy terms change.

## P7 - Keep payments retired

**Owner/authority:** Retirement is the production-launch default. Reintroducing
any payment provider or paid offer requires a separate product, architecture,
security, legal, tax, fulfillment, and release approval.

**Evidence:** For every staging and production candidate, inspect source,
client output, and flattened Wrangler output. Require no payment secret,
payment build variable, payment rate limiter, product catalog, checkout UI, or
consultation offer. `/api/stripe/*` and `/api/webhooks/stripe` are temporary,
provider-free compatibility tombstones: every method returns `410 Gone`, JSON,
and `Cache-Control: no-store` without a credential or upstream call. The public
`/ai-plan` is a free beta; the possible one-time $5 Creator Action Plan is
clearly marked as future direction and not for sale. The current Pages
production release `c044134`/`b73cc5ba` and staging Worker release
`80fdcd5`/`9803bbba` passed this proof; retain it on every later candidate.

Provider-side retirement is recorded in
`docs/release-evidence/2026-07-16-payment-retirement.md`: identified Tomodachi
links/endpoints are inactive, Tomodachi payment values are absent from Doppler
and Cloudflare, and no shared-account credential was revoked without exclusive
ownership proof. Recheck that state before release; do not send a test or live
payment event merely to prove retirement.

**Go/no-go:** Any environment that presents a buy/checkout/tip/donation/
consultation control, accepts payment, makes a payment-provider request, or lets
a legacy API path fall through to SPA HTML is no-go.

**Rollback:** Deploy the last reviewed artifact that keeps public payment UI
absent and tombstones at `410`. Do not use credential rotation as a feature
switch. Preserve historical fulfillment/refund/audit records as required.

## P8 - Produce exact-head GitHub and GitLab security/CI evidence

**Owner/authority:** GitHub is canonical. A maintainer prepares the candidate;
David Ortiz approves merge only after exact-head evidence. GitLab is a private
security lab, not a second deployment or issue-management source.

**Commands and evidence**

```bash
cd living-the-grid-studio
pnpm install --frozen-lockfile
pnpm audit --audit-level high
pnpm db:migrate:local
pnpm verify
pnpm test:worker
pnpm test:preflight
pnpm test:e2e
pnpm worker:dry-run
pnpm worker:dry-run:staging
pnpm worker:dry-run:production
pnpm verify:release-output
pnpm verify:bundle
gh pr checks <PR_NUMBER>
```

- Require the GitHub PR head to equal the tested full SHA, a clean trial merge,
  all owned CI/browser/security checks green, no unresolved actionable review,
  and no secret/log finding. A branch changing after a scan invalidates it.
- Create the immutable GitLab security tag
  `security/github-pr-<number>-<first-12-sha>` only after verifying the mirror
  workflow at that commit is byte-for-byte identical to canonical `main`.
  Manually dispatch the trusted `main` mirror workflow, then retain the GitLab
  SAST, secret-detection, dependency, license, and CycloneDX evidence with
  pipeline ID, analyzer versions, counts/dispositions, timestamps, and SHA-256
  artifact hashes. Never commit raw reports.
- Run GitLab DAST/API security only after P2-P5, against staging, with the
  OpenAPI contract, disposable identities/data, a mutation budget, and cleanup
  approval. Never target production.
- Complete the GitLab Ultimate trial-exit checklist at least four days before
  expiration, then prove Semgrep and pipeline secret detection still work in
  the post-trial configuration.

**Go/no-go:** Zero unresolved high/critical finding, exact SHA parity across
GitHub/GitLab evidence, green license drift gate plus human dispositions, and
successful secret scan are required. Opaque findings must be triaged; they are
not ignored because a different check is green.

**Rollback:** Do not merge. Fix findings in a new GitHub commit and repeat all
SHA-bound checks with a new tag. Do not move or reuse the old security tag.

## P9 - Final staging exit review

**Owner/authority:** David Ortiz signs the staging exit record. This is not
production approval.

**Prerequisites and evidence:** P1-P8 must be green on one clean commit and one
active staging Worker version. Re-run the complete local suite, exact release
dry run, hosted anonymous gate, writable/live-auth matrices, accessibility,
CSP/console/crawler, mobile performance, D1 ledger/integrity/foreign keys,
R2 reconciliation, provider `data_collection=deny`, flags, binding names,
redacted logs, and rollback drill. Observe a complete cleanup schedule. Record
the remaining synthetic rows/objects and remove or explicitly retain each.

**Go/no-go:** Sign only a single immutable candidate with no evidence borrowed
from an older SHA. A waived numerical security, authorization, privacy, data
integrity, or performance failure is no-go.

**Rollback:** Keep production on Pages, return staging to its recorded
known-good version if necessary, and open a corrective candidate. Staging exit
may be repeated; it cannot be retroactively edited to cover a new commit.

## P10 - Prepare isolated production resources and bootstrap inputs

**Owner/authority:** Each of resource creation, paid Images use, Google OAuth,
secret writes, D1 migration, and production deployment needs its own explicit
production approval. P9 does not authorize any of them.

**Prerequisites and procedure**

1. Confirm the exact Cloudflare account/zone, Google project, domain control,
   owners, cost/budget alerts, and incident contacts.
2. Provision production-only D1, private R2, KV, Images, and six rate-limit
   namespaces. Do not reuse staging IDs, buckets, OAuth clients, limiter IDs, or
   secrets and do not clone staging identities/content.
3. Configure the production Google client with only the canonical homepage,
   Privacy/Terms URLs, authorized domain, and exact callback. Google OIDC—not
   Firebase and not Discord—is the launch identity architecture.
4. List tracked and remote migrations by the production database name. Review
   the candidate set (currently `0001`-`0008`, plus any later forward-only
   migration in the final SHA), apply only the explicitly approved files, then
   verify the ledger, integrity, foreign keys, uniqueness, triggers, and empty
   bootstrap counts. Never edit or manually re-run an applied migration.
5. Write exactly the six production secret names through the protected,
   non-logging flow with unique values for each purpose/environment. Keep the
   ignored readiness and secrets files regular, mode `0600`, current, and bound
   to the exact SHA. Do not print or diff values.
6. Run `pnpm worker:dry-run:production`, inspect the flattened artifact, and
   require `COMMUNITY_MUTATIONS_ENABLED=false`, no payment bindings or secrets,
   the production-only bindings, exactly
   `tomodachi.pw` as a Custom Domain, and no preview/workers.dev exposure.

**Go/no-go:** Zero shared staging identifier/secret, exact migration ledger,
clean empty production application state, valid rollback artifact, and a
schema-4 `production-read-only-bootstrap` readiness record are mandatory.
The admin UUID remains null before first production sign-in.

**Rollback:** Stop before domain cutover. Remove unused newly provisioned
resources only under separate approval; never delete a migrated database as a
casual rollback. Rotate any value that was exposed during setup.

## P11 - Cut production to the Worker read-only and bootstrap the admin

**Owner/authority:** Requires an exact-SHA production deployment/domain-cutover
approval. The later role update requires a second approval naming the internal
UUID. Neither authority is granted here.

**Procedure and evidence**

1. Freeze schema-changing work. Record the live Pages deployment and immutable
   `pages.dev` URL, Worker rollback version, bindings, DNS/product attachments,
   production ledger, OAuth redirect, retired-payment tombstone behavior, and
   rollback owner.
2. Detach `tomodachi.pw` from Pages through the audited Cloudflare control
   plane and deploy the reviewed `production-read-only-bootstrap` artifact.
   Attach exactly one Worker Custom Domain; never let Pages and Workers claim
   the hostname simultaneously.
3. With community mutations false, verify TLS, static assets, SPA/API
   routing, envelopes, security headers/CSP, canonical/robots/sitemaps, public
   404s, anonymous Studio/edit/export, AI status and an approved minimal AI
   probe, provider-free `410` responses for every retired payment path,
   performance, logs, and the fail-closed write response. No payment-provider
   event or credential is permitted.
4. David Ortiz signs in through the production Google client and reads only his
   internal UUID from the authenticated session response. Under the distinct
   role-data approval, change exactly that current `user` row to `admin`,
   require one changed row, and read back only `id, role`.
5. Create a fresh `standard` readiness record for the same reviewed commit,
   with the verified admin and mutations still false, redeploy, and repeat the
   read-only checks. A separate moderator remains optional because the admin
   has moderator authority.

**Go/no-go:** Any Pages/Worker route overlap, TLS/canonical error, unexpected
write, OAuth mismatch, non-exact role change, payment-provider request, AI auth
failure, secret/log leak, or regression triggers immediate no-go.

**Rollback:** Remove the partial Worker Custom Domain, reattach the canonical
hostname to the recorded Pages deployment, verify DNS/TLS and the immutable
Pages URL, and keep community mutations disabled and payment surfaces retired.
Do not reverse D1 or delete R2. Revoke new sessions or credentials only when
incident scope requires it.

## P12 - Enable production community mutations

**Owner/authority:** Requires a fresh exact-SHA production writable-deploy
approval after P11 read-only acceptance. It must explicitly set
`COMMUNITY_MUTATIONS_ENABLED=true` and keep payment surfaces retired.

**Prerequisites and evidence:** Use a clean standard-phase artifact, verified
production admin, P9 staging evidence, production binding/ledger recheck, fresh
rollback version, staffed report/contact coverage, and normal error/budget
monitoring. Deploy without schema/secret/OAuth changes. Immediately exercise a
small operator-owned private save/autosave/conflict, publish-review without
automatic publish, profile/avatar fallback, public/unlisted behavior, social
and report smoke, export, deletion cancellation, and cross-account denial. Use
only declared production smoke fixtures and remove them.

**Go/no-go:** Zero unauthorized data access, orphan object, console/network
error, moderation gap, rate-limit failure, or material latency regression. A
single integrity, privacy, auth, unexpected payment exposure, or deletion
defect is an immediate rollback; lack of organic users does not relax this
gate.

**Rollback:** Deploy the validated read-only Worker version first so anonymous
Studio and legacy routes remain available. For a runtime-wide incident, use
the P11 Pages rollback. Reconcile objects from D1 manifests, preserve audit
records, and keep retired payment routes fail-closed.

## P13 - Soak, drill rollback, and retain Pages

**Owner/authority:** David Ortiz owns the soak exit and any Pages
decommissioning decision. Decommissioning is a new approval, not an automatic
consequence of launch.

**Evidence and thresholds:** Observe at least one complete scheduled cycle in
read-only mode and a minimum 72-hour writable soak unless the owner records a
longer window. Monitor request/error rates, D1/R2/Images failures and cost,
OAuth/session errors, rate limits, AI failures, unexpected payment-path
traffic, queue age, cleanup,
orphan counts, CSP reports, and Core Web Vitals without logging sensitive
content. Drill Worker-to-read-only rollback and, in an approved maintenance
window, prove the documented Pages restoration path and return to the Worker.

**Go/no-go:** Do not retire Pages until the soak is clean, current backups and
recovery evidence exist, the rollback drill succeeds, all scheduled retention
paths have evidence, and the operator confirms coverage. Retain the immutable
Pages deployment for at least seven days after writable enablement and longer
if the agreed soak or incident history requires it.

**Rollback:** At the first material auth, authorization, data-integrity,
unexpected payment exposure, privacy, or availability regression, disable
community writes through a reviewed deployment; restore Pages if Worker
rollback is insufficient. Keep
the incident record secret-free and prefer forward-compatible data repair.

## P14 - Operate after launch and keep deferred scope explicit

**Owner/authority:** The operator owns monitoring and moderation. Each feature
below needs its own product/security/architecture approval; none is implied by
launch.

**Post-launch operations**

- Review errors, budgets, abuse queue, contact channels, backups, cleanup and
  retention at a documented cadence. Re-run dependency, license, secret, SAST,
  browser, accessibility, and performance gates for releases.
- Keep AI moderation advisory and human-in-the-loop. Never give an agent a
  moderator session, mutation token, signing key, or autonomous enforcement
  route.
- Run deletion/export/recovery exercises and a rollback drill periodically.
  Track SLOs for OAuth, saves, media transformation, discovery, AI, scheduled
  cleanup, report response, and unexpected traffic to retired payment paths.
- Rotate credentials on provider schedule or exposure, one target at a time,
  with overlap where supported and a signed/authorized probe before revocation.

**Deferred features**

- Notifications remain out of scope. Adding email, push, or in-app
  notifications requires consent/delivery/abuse/retention design, an ADR,
  OpenAPI changes, and new acceptance tests.
- Discord authentication is not a launch requirement. Consider it only after
  measured user need. It requires a new ADR and threat-model update, provider
  review, isolated OAuth client/secrets, account-link/unlink and collision
  rules, verified-email policy, recovery/deletion/export behavior, migration,
  OpenAPI/UI work, and two-provider takeover tests. Google `sub` identities
  must never be silently merged by email.
- `/ai-plan` remains a free beta. A possible one-time $5 Creator Action Plan is
  not for sale. It requires a new ADR, threat-model/API changes, account-bound
  entitlement and ledger design, fulfillment and bounded usage, refund and
  revocation behavior, privacy/retention/tax/legal review, provider-isolated
  credentials, and complete test-mode and rollback acceptance before launch.
- Local Sketch mode, multi-panel projects, and further Copy Guide/AI command
  work follow the Studio roadmap. They must preserve the canonical validated
  command layer, original asset boundaries, and no-game-file-export claim.

**Completion definition:** The all-phase community launch is complete only
after P1-P13 are evidenced on exact commits, production has completed its soak,
rollback remains proven, legal/operations are staffed, and every deferred item
is still either explicitly out of scope or separately approved. Passing this
plan never means “deploy whatever is on the branch.”
