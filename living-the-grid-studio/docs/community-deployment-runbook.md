# Worker community deployment and rollback runbook

**Status:** Implementation runbook; remote execution is not authorized by this
document.
**Last checked against Cloudflare documentation:** 2026-07-13

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

## Launch blockers outside infrastructure

- Operator David Ortiz and Illinois, United States governing law are recorded
  in the public legal pages. Before launch, provide and approve a mail-ready
  postal address with city, state, ZIP code, and country, and confirm that each
  published contact address is deliverable. Do not infer missing address
  components or publish a partial residential address.
- David Ortiz is the accountable admin and final human moderation reviewer; a
  separate moderator is optional. Assign his internal user ID after the first
  approved sign-in and confirm who actively monitors `legal@`, `privacy@`,
  `security@`, `help@`, and the abuse/report queue. Follow
  `docs/adr/0003-human-in-loop-moderation.md`; AI assistance is advisory and
  has no enforcement authority.
- Confirm 13+ policy, seven-day deletion grace, 90-day report-text cleanup, and
  two-year minimal moderation retention with the legal operator.
- Confirm that Stripe is configured for the intended merchant account and tax
  jurisdictions. Stripe Tax calculation does not replace the operator's
  registration, filing, collection, or remittance duties.
- Recheck current Workers, D1, R2, and Images pricing and approve any paid Images
  transformation usage.

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

4. Apply `migrations/0001_community.sql` to a disposable local D1 database and
   run `PRAGMA foreign_key_check` and `PRAGMA integrity_check`.
5. Exercise the Worker locally with local-only D1/R2/KV bindings. Use fake OIDC
   fixtures for automated tests; use a dedicated localhost Google client only
   for an explicitly approved manual sign-in test.
6. Verify anonymous Studio import/edit/export without cookies or API calls.
7. Verify all legacy AI/Stripe/webhook/crawler parity tests.
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

Required bindings are `DB`, `PROJECTS`, `EDGE_CACHE`, `IMAGES`,
`AUTH_RATE_LIMITER`, `SAVE_RATE_LIMITER`, `COMMENT_RATE_LIMITER`,
`SOCIAL_RATE_LIMITER`, `DISCOVERY_RATE_LIMITER`, `AI_RATE_LIMITER`, and
`STRIPE_RATE_LIMITER`. The dedicated comment binding is 10 requests per minute
per user; do not merge it into the 60-per-minute social lane. The AI and Stripe
bindings independently limit AI chat and Stripe checkout/session to 10 requests
per minute per privacy-preserving client key.

`pnpm test:preflight` and every target-specific Worker dry run validate all
seven rate-limit binding names, limits, periods, and environment-isolated
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
- Existing `OPENROUTER_API_KEY`, `STRIPE_SECRET_KEY`, and
  `STRIPE_WEBHOOK_SECRET`

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
cancellation, the existing AI/Stripe routes, and Stripe webhooks remain
available. Local development is enabled; the tracked staging and production
configurations are deliberately read-only until a reviewed deployment artifact
sets the flag to `true`.

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
- Each remote environment declares exactly one Worker Custom Domain:
  `staging.tomodachi.pw` for staging and `tomodachi.pw` for production. The
  release wrapper rejects a missing, additional, cross-target, or non-custom
  route in both the source and Vite-generated configurations before Wrangler
  can deploy. Local development declares no public route.
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
admin/moderator/inbox, consult-fulfillment, Stripe/tax, rollback, and migration
owners or decisions. The wrapper validates these fields without logging their
values. Inspect the flattened output config before every deploy.

Readiness schema version 2 requires an explicit `deploymentPhase`. Use
`standard` for every writable deploy and every deploy after the first
privileged account has been assigned. Two target-specific bootstrap phases,
`staging-read-only-bootstrap` and `production-read-only-bootstrap`, break the
first-account dependency. Both require
`COMMUNITY_MUTATIONS_ENABLED=false`, null admin/moderator IDs,
`adminModeratorAssigned=false`, an explicit
`bootstrapReadOnlyApproved=true`, and no existing privileged users in the
selected remote D1 database. Production bootstrap additionally requires passed
staging acceptance and explicit production cutover approval. The wrapper
verifies the empty role state before it builds. Missing, legacy, cross-target,
or contradictory phase fields fail closed. Every `standard` deploy
requires one real internal UUID already assigned the exact `admin` role. The
moderator UUID may be null because admins have moderator authority; when a
separate moderator UUID is supplied, it must be distinct and already assigned
the exact `moderator` role. The wrapper verifies every supplied assignment in
remote D1.

## Staging gate and procedure

After explicit approval for resources and staging deployment:

1. Record the approved Cloudflare account, zone, Worker name, resource names,
   Google project, owners, and expected cost in the change ticket.
2. Create isolated staging resources. Copy only synthetic fixtures; never clone
   production identity, project, report, or session data.
3. Add staging binding IDs to the staging Wrangler environment. For the first
   deployment, prepare an ignored JSON object at
   `.deployment-readiness/staging.secrets.json` containing exactly the eight
   allowlisted secret names. Never print, commit, or place the values in shell
   arguments. The release wrapper validates the exact allowlist, rejects known
   placeholders and malformed provider credentials, and passes the file to
   `wrangler deploy --secrets-file` so secrets and code are installed in the
   same approved deployment. Do not run `wrangler secret put` before the Worker
   exists: that command creates and deploys a Worker version. After bootstrap,
   use a separately approved Wrangler versions workflow for rotations.
   `secrets.required` in Wrangler must list the same eight names in every
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
   - For the first deployment only, use readiness schema 2 with
     `deploymentPhase=staging-read-only-bootstrap`. Keep both privileged IDs
     null, `adminModeratorAssigned=false`,
     `writableCommunityDeployApproved=false`, and
     `bootstrapReadOnlyApproved=true`. Do not use this phase if any admin or
     moderator already exists.
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
   HTML SPA shell is a routing failure, not a successful API smoke test.
7. Run contract/integration/browser/security/accessibility/performance tests,
   including two-user authorization, OAuth, R2 failure injection, cleanup, and
   crawler metadata.
8. Observe structured logs/traces for at least one complete cleanup schedule.
   Request logs must contain only `requestId`, `routeGroup`, `method`, `status`,
   `duration`, and `environment`. Confirm they contain no raw path, query,
   identity or pseudonym, cookie, OAuth value, email, IP, request body, report
   text, or project content.

Staging acceptance requires zero high/critical security findings, zero failed
foreign-key/integrity checks, no console errors, complete legacy API parity, and
documented rollback evidence.

## Production gate and cutover

After separate explicit approvals for production migration, deployment, and
domain cutover:

1. Freeze schema-changing writes for the migration window.
2. Record the current Pages deployment, Worker version, binding IDs, migration
   list, DNS/routes, OAuth redirect configuration, and rollback owner.
3. List and apply only reviewed unapplied D1 migrations by production database
   name. Never re-run SQL manually or edit the migration ledger.
4. Prepare `.deployment-readiness/production.secrets.json` with exactly the
   eight production secret names using the same non-logging process as staging.
   Run `pnpm worker:dry-run:production` and inspect the generated output.
5. The first production deployment uses
   `deploymentPhase=production-read-only-bootstrap`. It is part of the explicit
   production cutover: keep `COMMUNITY_MUTATIONS_ENABLED=false`, require passed
   staging acceptance and rollback readiness, and verify the generated config
   contains exactly `{ "pattern": "tomodachi.pw", "custom_domain": true }`.
   Immediately before the approved deploy, detach `tomodachi.pw` from the Pages
   project through the audited Cloudflare control plane; a Worker Custom Domain
   cannot take over a hostname with a conflicting record or product attachment.
   Deploy the reviewed artifact to atomically install the production secrets and
   attach the Worker Custom Domain, which creates its DNS record and certificate.
   Keep the recorded Pages deployment available at its immutable `pages.dev`
   URL. Verify TLS, assets, SPA fallback, dynamic documents, API headers, Stripe
   webhook, AI routes, robots/sitemap, and no Pages/Worker route overlap before
   continuing. If this read-only cutover fails, remove the partial Worker Custom
   Domain and immediately restore `tomodachi.pw` to the recorded Pages deployment.
6. The named production admin signs in through the production Google client,
   reads only the internal UUID from `/api/auth/session`, and is promoted with
   the same narrowly scoped, exactly-one-row D1 procedure used in staging.
   Replace the bootstrap readiness file with a fresh `standard` approval bound
   to the clean commit and verified admin role. A later reviewed artifact may
   set `COMMUNITY_MUTATIONS_ENABLED=true`; bootstrap itself never permits
   community writes.
7. Run anonymous edit/export, Google sign-in/onboarding, explicit private save,
   autosave/conflict, publish/unpublish, unlisted noindex, search, social,
   moderation, export, deletion cancellation, and cross-account denial tests.
8. Monitor error rate, D1/R2 failures, OAuth errors, rate-limit counts, cleanup
   failures, and abuse queue during the soak. Keep Pages intact.

## Rollback

Use rollback for a material auth, authorization, data-integrity, payment,
availability, or privacy regression.

1. Deploy the validated read-only Worker version (or set
   `COMMUNITY_MUTATIONS_ENABLED=false` in a reviewed build and deploy it) to
   disable community mutations while preserving anonymous Studio and the
   documented operational routes.
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
   incident demands. Keep Stripe webhook idempotency intact.
6. Record request IDs, Worker versions, migration versions, affected object IDs,
   and actions without copying sensitive content into the incident record.

Pages may be decommissioned only after the agreed soak, a successful rollback
drill, current backups/recovery evidence, and a new explicit approval.
