# Worker community deployment and rollback runbook

**Status:** Implementation runbook; remote execution is not authorized by this
document.
**Last checked against Cloudflare documentation:** 2026-07-13
**Operational state refreshed:** 2026-07-29

This runbook supersedes the compute portion of `cloudflare-deployment.md` only
after the Worker cutover. Until then, the existing Pages project remains the
production runtime and rollback surface.

## Non-negotiable approval boundary

Stop and obtain explicit owner approval before each of these independent gates:

1. Creating or changing Cloudflare/Google remote resources or billing plans.
2. Writing staging secrets or applying a staging D1 migration.
3. Deploying a staging Worker or attaching `staging.tomodachi.pw`.
4. Writing production secrets or applying a production D1 migration.
5. Deploying production, changing `tomodachi.pw`, or disabling Pages.

Approval for one gate does not authorize a later gate. Never commit, push,
deploy, provision, or modify DNS/OAuth from an implementation-only request.

## Current environment truth

This snapshot is operational context, not deployment authority:

- GitHub PR #2 and GitLab MR !2 review exact head
  `151447b91f6c0e2f07632cac5ddc555f839a2034`. Owned GitHub CI and immutable
  exact-head GitLab SAST, secret-detection, and dependency-scanning evidence
  passed. The reviews remain Draft / HOLD, and this exact head is not deployed
  to staging or production.
- Staging serves `6796f563847f1fa71d2d3cdca5df422ded528cc1` as deployment
  `62c4d58f-b3c0-464e-9f7e-acbe5ade4ff0`, Worker version
  `0e2159c4-62b0-4912-b4dc-f873483ed842`, with community mutations and AI image
  generation enabled, payment surfaces retired, and migrations `0001`-`0009`.
  Its anonymous and bounded P2/P3 evidence is partial launch evidence;
  `stagingAcceptancePassed` remains false. The review-head cleanup removes only
  unreachable modules and unused dependencies, but it still requires a fresh
  exact-head staging deployment and acceptance evidence.
- Production traffic remains on Pages. A hidden triggerless production Worker
  exists at deployment `fa682161-be1c-4211-8559-01e14896f4cc`, version
  `f4e8c796-6e18-4fc9-9e35-2aec0f57391a`, from source `9a4026f`. It has no
  hostname, route, cron, workers.dev, or preview exposure. Production resources,
  OAuth, secrets, and migrations `0001`-`0009` exist, but the triggerless
  approval/evidence is not a cutover record.
- No current readiness file authorizes deploying `151447b`, writing new staging
  fixtures, merging the reviews, attaching a production hostname, changing a
  role, or enabling production writes. Every historical evidence file remains
  immutable.

## Launch blockers outside infrastructure

- Operator David Ortiz and Illinois, United States governing law are recorded
  in the public legal pages. On 2026-07-13, the operator confirmed the complete
  public legal and service address; Terms, Privacy, and Copyright publish it
  verbatim. Confirm the address against the intended public legal/service
  records and that each published email address is deliverable before launch.
- David Ortiz is the accountable admin and final human moderation reviewer; a
  separate moderator is optional. Assign his internal user ID after the first
  approved sign-in. On 2026-07-13, he confirmed that he actively monitors
  `legal@`, `privacy@`, `security@`, `help@`, and the abuse/report queue.
  Verify delivery and escalation for each channel before launch. Follow
  `docs/adr/0003-human-in-loop-moderation.md`; AI assistance is advisory and
  has no enforcement authority.
- Confirm 13+ policy, seven-day deletion grace, 90-day report-text cleanup, and
  two-year minimal moderation retention with the legal operator.
- Payments and consultations are retired. Confirm public pages contain no
  checkout, tip, purchase, donation, or consultation control; retired payment
  API paths return provider-free `410 Gone`; and any old provider links,
  endpoints, and Tomodachi-exclusive credentials are deactivated under the
  audited retirement checklist in `stripe-paywall-setup.md`.
- `/ai-plan` is a free beta. A possible one-time $5 Creator Action Plan is
  product direction only and is not for sale. It requires a separate future
  architecture, entitlement, payment, refund, privacy, tax, fulfillment, and
  acceptance gate before any payment provider is reintroduced.
- Recheck current Workers, D1, R2, and Images pricing and approve any paid Images
  transformation usage.
- Workers Paid was activated with owner approval on 2026-07-13. The tracked
  staging candidate configures a 2,000 ms CPU limit, deliberately well below
  the Paid plan's 30-second default. The release validator requires that exact
  configuration in both source and generated staging artifacts and rejects it
  in local or production configuration. Cloudflare may allow occasional CPU
  overruns, so treat this as a cost and runaway-work guardrail rather than a
  hard wall. This resolves the plan-level 10 ms blocker only. Staging is now
  writable for approved acceptance on `6796f563`, but the complete image,
  quota, retention, scheduled-cleanup, cost, and exact-review-head acceptance
  remains open. See
  [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- A real Chrome 150 diagnostic on 2026-07-13 exercised the live read-only
  staging homepage at 390×844 with cache disabled, 4× CPU slowdown, 150 ms
  latency, 1.6 Mbps downstream, and 750 Kbps upstream. The measured cold-load
  FCP was 1.62 s, LCP was 1.62 s, CLS was 0.003, and the mobile-menu interaction
  measured 72 ms with no console warnings, errors, or horizontal overflow.
  The observed diagnostic values are within the plan's numerical thresholds,
  but one menu timing is not a finalized INP result. Chrome DevTools tracing is
  now available: a saved 390×844 Slow 4G / 4× CPU trace of prior head `8f43aae`
  measured LCP 1.055 s and CLS 0.0018. That trace included cache hits and no
  EventTiming/INP sample, so it is diagnostic evidence only. After every source
  change, capture a cold trace from the new immutable exact-head preview and a
  representative interaction trace before treating the launch performance gate
  as complete.
  See [Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)
  and [Chrome performance traces](https://developer.chrome.com/docs/devtools/performance/reference/).

## Local preflight (no remote side effects)

1. Confirm the worktree and inspect all changes.
2. Ensure no secret is present in tracked files, build output, or logs.
3. Run:

   ```bash
   pnpm install --frozen-lockfile
   pnpm check
   pnpm test:worker
   pnpm test:preflight
   pnpm verify
   pnpm test:e2e
   pnpm worker:dry-run
   pnpm verify:bundle
   ```

4. Run `pnpm verify:migrations`. The verifier applies every tracked migration
   in order to a disposable local SQLite database and requires both
   `PRAGMA foreign_key_check` and `PRAGMA integrity_check` to pass.
5. Exercise the Worker locally with local-only D1/R2/KV bindings. Use fake OIDC
   fixtures for automated tests; use a dedicated localhost Google client only
   for an explicitly approved manual sign-in test.
6. Verify anonymous Studio import/edit/export without cookies or API calls.
7. Verify legacy AI/crawler parity and the retired-payment `410` tombstone
   tests.
8. Load a fresh development tab through the Worker fallback and confirm both
   parts of the Vite/React contract: `react()` precedes `cloudflare()` so
   `transformIndexHtml` injects the React Refresh preamble, and the Worker CSP
   matches the audited `_headers` script policy closely enough to permit that
   development-time inline module. A preamble without the aligned CSP still
   produces a blank page.

Cloudflare records sequential `.sql` migrations in its D1 migrations table;
do not edit an applied migration. Add a new numbered corrective migration.
See [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

## Required environment isolation

| Environment           | Host                           | D1                        | R2                        | KV                   | Google client         | Authentication                         |
| --------------------- | ------------------------------ | ------------------------- | ------------------------- | -------------------- | --------------------- | -------------------------------------- |
| Local                 | `http://localhost:3000`        | Local emulator            | Local emulator            | Local emulator       | Localhost-only client | Allowed only on fixed localhost origin |
| Staging               | `https://staging.tomodachi.pw` | Staging database          | Staging private bucket    | Staging namespace    | Staging client        | Allowed only on staging host           |
| Production            | `https://tomodachi.pw`         | Production database       | Production private bucket | Production namespace | Production client     | Allowed only on canonical host         |
| Random branch preview | Variable                       | Isolated preview/emulator | Isolated preview/emulator | Isolated preview     | None                  | Disabled                               |

Required bindings are `DB`, `PROJECTS`, `EDGE_CACHE`, `IMAGES`, plus exactly
six rate-limit bindings: `AUTH_RATE_LIMITER`, `SAVE_RATE_LIMITER`,
`COMMENT_RATE_LIMITER`, `SOCIAL_RATE_LIMITER`, `DISCOVERY_RATE_LIMITER`, and
`AI_RATE_LIMITER`. The dedicated comment binding is 10 requests per minute per
user; do not merge it into the 60-per-minute social lane. AI chat uses its own
privacy-preserving client-key limit. Retired payment paths require no provider,
KV receipt, or dedicated limiter.

`pnpm test:preflight` and every target-specific Worker dry run validate all six
rate-limit binding names, limits, periods, and environment-isolated
namespace IDs in both the source and generated Wrangler configurations. Use
the generated Wrangler `Env` type; do not hand-maintain a parallel binding
type.

Required secrets are:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `OIDC_COOKIE_KEY` (exactly 32 random bytes, base64url encoded)
- `SESSION_PEPPER` (at least 32 independent random bytes used before hashing
  session tokens)
- `PSEUDONYM_KEY` (at least 32 independent random bytes used as the HMAC key
  for privacy-preserving rate-limit keys and persisted report/moderation
  pseudonyms; never emitted to logs)
- `OPENROUTER_API_KEY`

Outside local development the Worker rejects short values and known
placeholder prefixes for Google credentials, session pepper, and pseudonym
keys. It also rejects an OIDC cookie key that does not decode to exactly 32
bytes. Generate values with a cryptographically secure tool; do not reuse a
value between purposes or environments.

Non-secret environment values include `PUBLIC_SITE_URL`, `GOOGLE_OIDC_REDIRECT_URI`,
`TERMS_VERSION`, `COMMUNITY_MUTATIONS_ENABLED`, and environment name. Google
redirect URIs must be exact:

- `http://localhost:3000/api/auth/google/callback`
- `https://staging.tomodachi.pw/api/auth/google/callback`
- `https://tomodachi.pw/api/auth/google/callback`

`COMMUNITY_MUTATIONS_ENABLED` is fail-closed: only the exact string `true`
allows profile, project, publishing, social, report, or moderation writes.
Missing, malformed, and `false` values return the standard `503
SERVICE_UNAVAILABLE` envelope before a route handler can mutate D1 or R2. Reads,
anonymous Studio operation, OAuth/session controls, account deletion and
cancellation, existing AI routes, and provider-free retired-payment `410`
tombstones remain available. Local development is enabled. The tracked staging
configuration is writable only for the approved authenticated acceptance gate;
production stays read-only until its own reviewed deployment artifact and
approval set the flag to `true`.

Because a Wrangler environment variable changes only through deployment, keep
a validated read-only Worker version ready for rollback. Do not describe this
flag as a no-deploy control-plane switch.

Do not copy production D1/R2/KV identifiers or OAuth secrets into staging or
preview. Bind private R2 through the Worker rather than creating a public bucket;
Cloudflare documents this direct binding model in the
[R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

## Worker routing review

- Static hashed assets are asset-first.
- `not_found_handling` is `single-page-application`.
- `run_worker_first` selectively covers the API and document routes that need
  Worker-generated responses, headers, or metadata. Treat the route patterns in
  `wrangler.jsonc` as the source of truth and review the flattened output config
  before deployment.
- Staging declares exactly one Worker Custom Domain:
  `staging.tomodachi.pw`. Production declares exactly the apex and canonical
  redirect domains: `tomodachi.pw` and `www.tomodachi.pw`. The release wrapper
  rejects a missing, additional, cross-target, or non-custom route in both the
  source and Vite-generated configurations before Wrangler can deploy. Local
  development declares no public route.
- Every target explicitly sets `workers_dev` and `preview_urls` to `false`.
  The release wrapper validates both source and generated configurations so an
  unreviewed `*.workers.dev` or version-preview origin cannot bypass the exact
  hostname, cookie, CSP, OAuth, or canonical-URL contract.
- Dynamic Worker responses receive CSP and all security headers in middleware.
  Static responses continue to receive the audited `_headers` policy. Keep the
  two script policies aligned; local Worker fallback must not block Vite's
  transformed React Refresh preamble.
- `/creation/:slug` and `/u/:username` escape metadata and produce canonical
  URLs from `PUBLIC_SITE_URL`; unlisted creations receive `noindex`.

Cloudflare's migration guide highlights the Pages/Workers asset-routing
inversion; verify it rather than assuming Pages middleware behavior carries
over: [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/).

## Vite build output and environment selection

`wrangler.jsonc` is the input configuration. `vite build` produces the deployable
client in `dist/client` and the bundled Worker plus flattened output configuration
in `dist/tomodachi_studio`. Preview, dry-run, and any later deployment must use
`dist/tomodachi_studio/wrangler.json`; do not point Static Assets at a stale
top-level build directory.

Use the target-explicit release wrapper. It selects the Cloudflare environment
at build time, validates the flattened configuration against the selected
source environment, and never adds `wrangler deploy --env`:

```bash
pnpm worker:dry-run
pnpm worker:dry-run:staging
pnpm worker:dry-run:production
```

Dry-run mode always passes `--dry-run`; it permits placeholder remote IDs only
with a warning. There is no generic deploy command. The only non-dry-run entry
points are `pnpm worker:deploy:staging` and
`pnpm worker:deploy:production`, and both fail before the build or Wrangler
spawn unless every deploy gate below is satisfied.

For an approved deployment, copy
`config/deployment-readiness.example.json` to the ignored
`.deployment-readiness/<target>.json`, replace every placeholder, and bind it
to the exact clean Git commit. The approval expires after 30 minutes and records
the intended read-only/writable mutation mode. It must also confirm the exact
Cloudflare/Google/domain, pricing/Images, legal/contact/retention,
admin/moderator/inbox, payment-retirement, rollback, and migration
owners or decisions. Create it under `umask 077`, retain mode `0600`, and never
commit it because it can contain a public-service address and internal account
IDs. The wrapper requires a private regular file and validates its fields
without logging their values. Inspect the flattened output config before every
deploy.

Readiness schema version 5 requires an explicit `deploymentPhase` and current
target-specific ownership/confirmation fields. It contains no payment or
consultation-enable field. Use
`standard` for every writable deploy and every deploy after the first
privileged account has been assigned. Three target-specific bootstrap phases,
`staging-read-only-bootstrap`, `production-read-only-bootstrap`, and
`production-triggerless-bootstrap`, break the first-account dependency. All
require
`COMMUNITY_MUTATIONS_ENABLED=false`, null admin/moderator IDs,
`adminModeratorAssigned=false`, an explicit
`bootstrapReadOnlyApproved=true`, and no existing privileged users in the
selected remote D1 database. Production bootstrap additionally requires passed
staging acceptance; explicit production cutover approval is required exactly
for `production-read-only-bootstrap` and must remain false for the
triggerless phase, which also packages without hostname, route, or cron. The wrapper
verifies the empty role state before it builds. Missing, legacy, cross-target,
or contradictory phase fields fail closed. Every `standard` deploy
requires one real internal UUID already assigned the exact `admin` role. The
moderator UUID may be null because admins have moderator authority; when a
separate moderator UUID is supplied, it must be distinct and already assigned
the exact `moderator` role. The wrapper verifies every supplied assignment in
remote D1. Every deploy approval must also explicitly acknowledge scheduled
maintenance writes with `scheduledMaintenanceWritesApproved=true` because the
hourly cleanup path can mutate D1/R2 even while community writes remain
fail-closed. The triggerless production bootstrap is the exception: its
packaging removes every cron schedule, so its approval must set
`scheduledMaintenanceWritesApproved=false`.

## Staging gate and procedure

After explicit approval for resources and staging deployment:

1. Record the approved Cloudflare account, zone, Worker name, resource names,
   Google project, owners, and expected cost in the change ticket.
2. Create isolated staging resources. Copy only synthetic fixtures; never clone
   production identity, project, report, or session data.
3. Add staging binding IDs to the staging Wrangler environment. For the first
   deployment, prepare an ignored JSON object at
   `.deployment-readiness/staging.secrets.json` containing exactly the six
   allowlisted secret names. Never print, commit, or place the values in shell
   arguments. Create the directory and file with a restrictive umask, and
   retain owner-only permissions after the approved secret-manager workflow
   populates it:

   ```bash
   umask 077
   mkdir -p .deployment-readiness
   # Populate the JSON through the approved non-logging secret-manager flow.
   chmod 600 .deployment-readiness/staging.secrets.json
   ```

   The release wrapper requires a regular file, enforces POSIX mode `0600`
   where permission metadata is available, validates the exact allowlist,
   rejects known placeholders and malformed provider credentials, and passes
   the file to `wrangler deploy --secrets-file` so secrets and code are
   installed in the same approved deployment. Do not run `wrangler secret put`
   before the Worker exists: that command creates and deploys a Worker version.
   After bootstrap, use a separately approved Wrangler versions workflow for
   rotations.
   `secrets.required` in Wrangler must list the same six names in every
   environment.

4. List unapplied migrations against the **database name**, review the output,
   then apply them only after the migration approval gate.
5. Confirm `staging.tomodachi.pw` has no conflicting DNS record or Custom
   Domain, run `pnpm worker:dry-run:staging`, and inspect the generated output
   configuration. It must contain exactly
   `{ "pattern": "staging.tomodachi.pw", "custom_domain": true }`.
   After the separate deployment-and-domain approval, deploy that exact output;
   Wrangler will attach the declared Custom Domain and Cloudflare will create
   its DNS record and certificate. The first deployment remains read-only;
   enable community mutations only in a later reviewed artifact used for
   authenticated write acceptance. Stop if the generated artifact contains the
   production hostname or if the staging hostname is already claimed.
   - For the first deployment only, use readiness schema 5 with
     `deploymentPhase=staging-read-only-bootstrap`. Keep both privileged IDs
     null, `adminModeratorAssigned=false`,
     `writableCommunityDeployApproved=false`, and
     `bootstrapReadOnlyApproved=true`. Do not use this phase if any admin or
     moderator already exists.
   - Schema v5 approvals are structured: `infrastructure.googleProjectId`
     must exactly equal the audited project for the target
     (`tomodachi-studio-production` for production, `tomodachi-studio-staging`
     for staging), and production approvals must declare
     `infrastructure.domainCutover` with explicit `apex` (`defer` or `attach`)
     and `www` (`defer` or `redirect-to-apex`) dispositions. Triggerless
     bootstrap requires both dispositions deferred and
     `scheduledMaintenanceWritesApproved=false`. Cutover and standard
     production require an attached apex plus `www=redirect-to-apex`, which
     the release gate binds to the generated routes: the packaged artifact
     must attach both `tomodachi.pw` and `www.tomodachi.pw` Custom Domains,
     and the Worker permanently redirects www requests to the apex preserving
     path and query. Staging approvals must omit `domainCutover`. Free-text
     fields such as `changeTicket` and `domainControlConfirmation` remain
     audit prose and are never parsed for gating decisions.
   - Deployment evidence must hash immutable, timestamped snapshots: before
     each deploy, copy the approval file to
     `.deployment-readiness/evidence/<target>.json.<UTC-timestamp>` (0600)
     and record hashes against that snapshot. Never re-hash a mutated
     approval file; later schema migrations must add a dated attestation
     beside the original evidence instead of rewriting recorded hashes.
   - After the read-only Worker and staging hostname are available, the named
     admin signs in with the approved Google account. A separately staffed
     moderator signs in too when one will be assigned. OAuth provisioning
     remains available in read-only mode; onboarding and all community writes
     remain blocked. Each person reads their own internal user ID from the
     authenticated `/api/auth/session` response. Do not copy Google subjects,
     email addresses, session cookies, or tokens into the change ticket or
     application logs.
   - Under a separate, recorded data-change approval, assign the admin ID with a
     narrowly scoped D1 update that only changes a current `user` role. Assign a
     distinct moderator ID only when a separate moderator is being staffed:

     ```sql
     UPDATE users SET role = 'admin', updated_at = <UNIX_MILLISECONDS>
       WHERE id = '<ADMIN_INTERNAL_UUID>' AND role = 'user';
     -- Optional: omit this statement when the admin covers moderation.
     UPDATE users SET role = 'moderator', updated_at = <UNIX_MILLISECONDS>
       WHERE id = '<MODERATOR_INTERNAL_UUID>' AND role = 'user';
     ```

     Require exactly one changed row for every statement used, then read back
     only `id` and `role` for the supplied IDs. Stop if an ID is missing,
     already privileged, duplicated, or assigned the wrong role.

   - Replace the bootstrap readiness file with a fresh `standard` approval bound
     to the current clean commit. Record the real admin ID and either the real
     distinct moderator ID or null, set
     `adminModeratorAssigned=true` and `bootstrapReadOnlyApproved=false`, keep
     writable mode false, and redeploy. The wrapper independently verifies the
     exact remote role assignments. Only a later reviewed artifact and fresh
     approval may set community mutations and
     `writableCommunityDeployApproved` to true.

6. Before treating the deployment as backend acceptance, request
   `/api/discover/recent?limit=1` with `Accept: application/json` and require a
   JSON content type plus the standard `{ data, requestId }` envelope. A `200`
   HTML SPA shell is a routing failure, not a successful API smoke test. Run
   the tracked, fail-closed anonymous hosted gate rather than reconstructing an
   ad hoc request list:

   ```bash
   pnpm verify:hosted-read-only -- --base-url https://staging.tomodachi.pw
   ```

   The command refuses production and arbitrary remote hosts, omits
   credentials, never follows redirects, and never calls OAuth, account, AI,
   retired-payment compatibility, moderation, scheduled, or destructive
   routes. See
   [`hosted-read-only-acceptance.md`](hosted-read-only-acceptance.md) for its
   exact allowlist and local fixture tests. Separately require Worker and Pages
   integration tests to prove the retired payment paths return `410`, do not
   use credentials, and make no upstream request.

7. Run contract/integration/browser/security/accessibility/performance tests.
   Run the complete Worker-hosted browser matrix through the tracked,
   fail-closed command:

   ```bash
   pnpm test:e2e:staging
   ```

   That command binds the run to the exact
   `https://staging.tomodachi.pw` origin and explicitly declares that the
   current final edge-transformed document has no analytics provider
   configured. A hosted run with a missing or invalid
   `PLAYWRIGHT_ANALYTICS_MODE` fails during configuration, as does any
   production, preview, arbitrary-host, credential, port, path, query, or
   fragment target. Hosted `configured-provider` mode is intentionally rejected
   because runner environment variables cannot change a prebuilt remote bundle.
   Supporting it later requires a separately reviewed contract for the expected
   public endpoint, website ID, and permitted analytics egress. Ordinary
   local/CI `pnpm test:e2e` runs keep the intercepted synthetic
   configured-provider fixture and contact no external analytics service.

   The no-provider claim applies to the final edge-transformed document, not
   only the source bundle. Cloudflare Web Analytics automatic setup/browser RUM
   must be disabled through the audited control plane before this gate can pass.
   Before and after every consent choice, require zero
   `static.cloudflareinsights.com/beacon.min.js` scripts, zero
   `data-cf-beacon` attributes, and zero `/cdn-cgi/rum` requests. Any Cloudflare
   control-plane change requires its own narrow approval and evidence; a source
   or legal-copy change does not disable edge injection. The observed shared
   site configuration affects staging, the apex, and `www`; scope the approval
   and post-change verification to every affected hostname even when only
   staging receives a source deployment.

   The exact-head staging exit set is cumulative and must include:
   - P1 anonymous hosted, Studio, CSP/console/crawler, responsive/accessibility,
     cold/restored/cloud mobile performance, and rollback checks;
   - P2/P3 with two approved sessions held only in one runner-created `0700`
     temporary profile tree, removal of that complete tree on every exit path,
     D1-proven revocation, the bounded writable create/save/conflict/delete
     flow, D1/R2 reconciliation, and deterministic `SIGINT`/`SIGTERM` proof
     that no new mutation starts after interruption and cleanup finishes before
     the conventional `130`/`143` exit;
   - every P4 cross-user/private, publish/unlisted, social, human moderation,
     media/failure/race, quota, export, cleanup, and audit row;
   - every P5 deletion/cancellation/final-claim, retention, failure-isolation,
     cron, redacted-log, integrity, and reconciliation scenario;
   - P6 public-channel delivery/escalation, operator/legal/policy, provider
     cost, human license disposition, and shipped-asset rights evidence;
   - P7 source and hosted proof that payment UI/bindings are absent and every
     compatibility route remains provider-free `410 Gone`; and
   - P8 exact-head GitHub/GitLab evidence plus the post-P2-P5 staging security
     work required by the production-readiness plan.

   The earlier 25-assertion writable run is P2/P3 foundation only. It is not a
   substitute for P4 or P5. A new source commit invalidates every SHA-bound
   result and requires a fresh immutable candidate.

8. Observe structured logs/traces for at least one complete cleanup schedule.
   Request logs must contain only `requestId`, `routeGroup`, `method`, `status`,
   `duration`, and `environment`. Confirm they contain no raw path, query,
   identity or pseudonym, cookie, OAuth value, email, IP, request body, report
   text, or project content.
9. Complete the P9 staging-exit review on one exact commit and one active Worker
   version. Store a new immutable approval/evidence snapshot, account for every
   synthetic row/object, and set `stagingAcceptancePassed=true` only after the
   owner signs the complete P1-P8 evidence. Never change an older readiness or
   evidence file to make it appear current.

Staging acceptance requires zero high/critical security findings, zero failed
foreign-key/integrity checks, no console errors, complete legacy API parity,
and documented rollback evidence.

Require both `pnpm audit --prod --audit-level high` and
`pnpm audit --audit-level high` to complete with zero high or critical findings.
No dependency security exception is active; either audit failing blocks staging
acceptance and production release.

## Production gate and cutover

After separate explicit approvals for production migration, deployment, and
domain cutover:

1. After P9, squash-merge the canonical GitHub PR, mirror the resulting exact
   `main` commit to GitLab, repeat immutable merged-main security evidence, and
   run an exact-merged-commit staging smoke. Do not create a second divergent
   GitLab merge. Any corrective commit returns to exact-head staging evidence.
2. Freeze schema-changing writes for the migration window.
3. Record the current Pages deployment, triggerless Worker version, binding
   IDs, migration list, DNS/routes, OAuth redirect configuration, and rollback
   owner.
4. Verify production migrations `0001`-`0009` in the ledger and do not re-run
   them. List and apply only a later reviewed unapplied migration by production
   database name under its own approval. Never re-run SQL manually or edit the
   migration ledger.
5. Re-validate `.deployment-readiness/production.secrets.json` contains exactly
   the six production secret names and mode `0600` without printing values.
   Install or rotate a value only through a separately approved non-logging
   flow. Run `pnpm worker:dry-run:production` and inspect the generated output.
6. The first **domain-attaching** production deployment uses a fresh readiness
   file with `deploymentPhase=production-read-only-bootstrap`, the exact merged
   `main` SHA, `domainCutover.apex=attach`,
   `domainCutover.www=redirect-to-apex`,
   `scheduledMaintenanceWritesApproved=true`, and community/writable flags
   false. The existing triggerless `9a4026f` approval has deferred domains and
   must not be reused. This is the explicit production cutover: require passed
   staging acceptance and rollback readiness, and verify the generated config
   contains exactly the two approved Custom Domains for `tomodachi.pw` and
   `www.tomodachi.pw`. Immediately before the approved deploy, detach both
   hostnames from the Pages project through the audited Cloudflare control
   plane; a Worker Custom Domain cannot take over a hostname with a conflicting
   record or product attachment. Deploy the reviewed artifact to attach both
   Worker Custom Domains. Keep the recorded Pages deployment available at its
   immutable `pages.dev` URL. Verify TLS, assets, SPA fallback, dynamic
   documents, API headers, AI routes, retired-payment `410` responses,
   robots/sitemap, the method-preserving www-to-apex redirect, and no
   Pages/Worker route overlap before continuing. If this read-only cutover
   fails, remove the partial Worker Custom Domains and immediately restore both
   hostnames to the recorded Pages deployment.
7. The named production admin signs in through the production Google client,
   reads only the internal UUID from `/api/auth/session`, and is promoted with
   the same narrowly scoped, exactly-one-row D1 procedure used in staging.
   Replace the bootstrap readiness file with a fresh `standard` approval bound
   to the clean commit and verified admin role. A later reviewed artifact may
   set `COMMUNITY_MUTATIONS_ENABLED=true`; bootstrap itself never permits
   community writes.
8. Run anonymous edit/export, Google sign-in/onboarding, explicit private save,
   autosave/conflict, publish/unpublish, unlisted noindex, search, social,
   moderation, export, deletion cancellation, and cross-account denial tests.
9. Under a separate exact-SHA writable approval, deploy the standard artifact
   with community mutations enabled and payment surfaces still retired. Use
   only bounded operator-owned smoke fixtures and remove them.
10. Monitor error rate, D1/R2 failures, OAuth errors, rate-limit counts, cleanup
    failures, and abuse queue during the soak. Keep Pages intact.

## Rollback

Use rollback for a material auth, authorization, data-integrity, availability,
privacy, or unexpected payment-surface regression.

1. Deploy the validated read-only Worker version (or set
   `COMMUNITY_MUTATIONS_ENABLED=false` in a reviewed build and deploy it) to
   disable community mutations while preserving anonymous Studio and the
   documented operational routes. A Pages rollback must not silently re-enable
   checkout, consultation, tip, donation, or purchase UI/API behavior.
2. For a Worker-code rollback, deploy the last known-good Worker version without
   changing the Custom Domain. For a Pages rollback, remove the Worker Custom
   Domain through the audited Cloudflare control plane, reattach
   `tomodachi.pw` to the recorded Pages deployment, and verify DNS/TLS plus the
   immutable Pages URL before reopening traffic. Never leave both products
   claiming the hostname.
3. Do **not** roll back D1 by deleting tables or reversing an applied migration.
   Deploy code compatible with the current schema; repair data only through a
   reviewed forward migration/script.
4. Preserve R2 objects and manifests unless they are proven orphaned. Run the
   idempotent reconciliation/cleanup job after the incident scope is known.
5. Revoke affected sessions/secrets, pause OAuth, or pause publishing as the
   incident demands. Keep retired payment endpoints fail-closed at `410`.
6. Record request IDs, Worker versions, migration versions, affected object IDs,
   and actions without copying sensitive content into the incident record.

Pages may be decommissioned only after the agreed soak, a successful rollback
drill, current backups/recovery evidence, and a new explicit approval.
