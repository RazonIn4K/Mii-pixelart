# Worker community deployment and rollback runbook

**Status:** Implementation runbook; remote execution is not authorized by this
document.
**Last checked against Cloudflare documentation:** 2026-07-10

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

- Replace every operator identity, jurisdiction, address/contact, and legal
  placeholder in Terms, Privacy, Cookies, Community Guidelines, and Copyright.
- Assign at least one accountable admin and moderator. Confirm who monitors
  `legal@`, `privacy@`, `security@`, `help@`, and the abuse/report queue.
- Confirm 13+ policy, seven-day deletion grace, 90-day report-text cleanup, and
  two-year minimal moderation retention with the legal operator.
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

| Environment | Host | D1 | R2 | KV | Google client | Authentication |
| --- | --- | --- | --- | --- | --- | --- |
| Local | `http://localhost:3000` | Local emulator | Local emulator | Local emulator | Localhost-only client | Allowed only on fixed localhost origin |
| Staging | `https://staging.tomodachi.pw` | Staging database | Staging private bucket | Staging namespace | Staging client | Allowed only on staging host |
| Production | `https://tomodachi.pw` | Production database | Production private bucket | Production namespace | Production client | Allowed only on canonical host |
| Random branch preview | Variable | Isolated preview/emulator | Isolated preview/emulator | Isolated preview | None | Disabled |

Required bindings are `DB`, `PROJECTS`, `EDGE_CACHE`, `IMAGES`, `AUTH_RATE_LIMITER`,
`SAVE_RATE_LIMITER`, `COMMENT_RATE_LIMITER`, `SOCIAL_RATE_LIMITER`, and
`DISCOVERY_RATE_LIMITER`. The dedicated comment binding is 10 requests per
minute per user; do not merge it into the 60-per-minute social lane. Use the
generated Wrangler `Env` type; do not hand-maintain a parallel binding type.

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

## Staging gate and procedure

After explicit approval for resources and staging deployment:

1. Record the approved Cloudflare account, zone, Worker name, resource names,
   Google project, owners, and expected cost in the change ticket.
2. Create isolated staging resources. Copy only synthetic fixtures; never clone
   production identity, project, report, or session data.
3. Add staging binding IDs to the staging Wrangler environment and write only
   the eight allowlisted secrets with an explicit target through the approved
   secret manager/CLI flow, never a tracked file. The obsolete bulk-Doppler
   helper was removed because it selected neither an environment nor an
   allowlist. `secrets.required` in Wrangler must list the same eight names in
   every environment.
4. List unapplied migrations against the **database name**, review the output,
   then apply them only after the migration approval gate.
5. Run `pnpm worker:dry-run:staging`, inspect the generated output
   configuration, then deploy that exact output Worker to its staging hostname
   after the separate deployment approval. The first deployment remains
   read-only; enable community mutations only in a later reviewed artifact used
   for authenticated write acceptance. Do not attach the production hostname or
   route.
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
4. Run `pnpm worker:dry-run:production`, inspect the generated output
   configuration, and deploy the production Worker in read-only mode without
   changing the canonical domain. Smoke test its workers.dev/controlled route
   with authentication disabled unless that exact host exists in the production
   OAuth client.
5. After the read-only smoke test, create and verify the exact production
   artifact with `COMMUNITY_MUTATIONS_ENABLED=true` under the cutover approval,
   then attach `tomodachi.pw` to that Worker. Verify TLS, assets, SPA fallback, dynamic
   documents, API headers, Stripe webhook, AI routes, robots/sitemap, and no
   Pages/Worker route overlap.
6. Run anonymous edit/export, Google sign-in/onboarding, explicit private save,
   autosave/conflict, publish/unpublish, unlisted noindex, search, social,
   moderation, export, deletion cancellation, and cross-account denial tests.
7. Monitor error rate, D1/R2 failures, OAuth errors, rate-limit counts, cleanup
   failures, and abuse queue during the soak. Keep Pages intact.

## Rollback

Use rollback for a material auth, authorization, data-integrity, payment,
availability, or privacy regression.

1. Deploy the validated read-only Worker version (or set
   `COMMUNITY_MUTATIONS_ENABLED=false` in a reviewed build and deploy it) to
   disable community mutations while preserving anonymous Studio and the
   documented operational routes.
2. Route `tomodachi.pw` back to the recorded Pages deployment or last known-good
   Worker version.
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
