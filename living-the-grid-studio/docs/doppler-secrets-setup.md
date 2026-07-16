# Doppler secrets setup

Runbook for **`tomodachi-platform`** in Doppler. Secret values stay in Doppler
or an approved password-manager backup, never in git. The repository contains
only [`doppler.yaml`](../doppler.yaml), which selects project
`tomodachi-platform` and local config `dev`.

Payments are retired. Do not add a Stripe key, webhook secret, Payment Link, or
payment-related `VITE_*` variable to any Tomodachi config. The current Worker
contract has exactly **six required secrets** and **six rate-limit bindings**.

## Before you start: domain and MX

A custom domain and MX records are not prerequisites for Doppler, Pages
preview deployments, or local development.

| Concern | Needs custom domain first? | Needs mail DNS first? |
| --- | --- | --- |
| Doppler project/configs | No | No |
| Pages Git build and preview | No | No |
| Doppler to Cloudflare Pages sync | No; it needs a Pages project and scoped API token | No |
| Canonical `PUBLIC_SITE_URL` | Use the actual reviewed origin for each environment | No |
| Google OIDC | Needs the exact stable origin and callback registered before sign-in | No |
| Receiving `@tomodachi.pw` mail | Needs the Cloudflare zone | Yes |

Practical order:

1. Build and verify the project locally.
2. Configure `dev`, `stg`, and `prd` in Doppler without copying unrelated
   credentials.
3. Map `stg` to Pages Preview and `prd` to Pages Production while Pages remains
   the rollback runtime.
4. Configure the standalone Worker separately through the approval-gated flow
   in `community-deployment-runbook.md`.
5. Register exact Google origins/callbacks only for the environment being
   approved.
6. Configure Cloudflare Email Routing when the public contact channels need to
   receive mail.

## 1. Project mapping

| Item | Value |
| --- | --- |
| Doppler project | `tomodachi-platform` |
| Configs | `dev`, `dev_personal`, `stg`, `prd` |
| Repo-local default | `dev` |
| Pages mapping | `stg` to Preview, `prd` to Production |
| Worker mapping | Separate target-specific secret deployment; Pages sync does not populate Worker secrets |

Use `dev_personal` only for local overrides. Confirm it is a branch of `dev`
before assuming inheritance; otherwise set required values explicitly.

## 2. Token policy

| Token | Use |
| --- | --- |
| `dp.pt...` personal token | Local interactive `doppler login` only |
| `dp.st...` service token | One config, read-only where possible, for a named CI/host consumer |
| Cloudflare API token | Doppler Pages integration UI only, with Pages edit and account read scope |

Never place personal tokens in CI, Pages, a Worker, or a shared server. See
[Doppler service tokens](https://docs.doppler.com/docs/service-tokens).

## 3. Initial setup

From the application directory:

```bash
cd living-the-grid-studio
brew install dopplerhq/cli/doppler # if needed
doppler login
doppler setup
```

Select the repository's `tomodachi-platform` / `dev` mapping. Then:

1. Set only values with a current executable consumer.
2. Verify key **names**, not values, in each target config.
3. Connect the Pages integration and map `stg` / `prd` as described above.
4. Build a new Pages deployment after a sync; updating environment settings
   does not change an already-running deployment.
5. Run `doppler run -- pnpm check` and `doppler run -- pnpm vite build`.

## 4. Copying an approved value between Doppler projects

Do not bulk-copy a generic list of shared keys. Copy one value only when:

- current Tomodachi source consumes it;
- the same owner controls the provider source and destination;
- the owner approved that specific destination environment; and
- a rotation/revocation plan exists.

List source key names without values:

```bash
doppler secrets -p local-mac-work -c dev --json | jq -r 'keys[]'
```

For one approved key, use a pipe so the value is not a process argument and
`--silent` so the destination value is not printed:

```bash
KEY=<APPROVED_KEY_NAME>
doppler secrets get "$KEY" -p <SOURCE_PROJECT> -c <SOURCE_CONFIG> --plain |
  doppler secrets set "$KEY" -p tomodachi-platform -c <DEST_CONFIG> --silent
```

Approval for `dev` is not approval for `stg` or `prd`. Do not copy
`RUNPOD_API_KEY` or `N8N_LEAD_PIXEL_WEBHOOK_URL`; those belong to the separate
AI actor stack. Use a distinct OpenRouter key per Tomodachi environment.

## 5. Pages/local values

These examples cover the retained Pages AI Functions and public runtime
configuration. Replace placeholders through a protected flow; entering a
secret directly in a shell command can leave it in shell history.

```bash
# dev
doppler secrets set \
  OPENROUTER_API_KEY="REPLACE" \
  PUBLIC_SITE_URL="http://localhost:3000" \
  --project tomodachi-platform --config dev --silent

# stg
doppler secrets set \
  OPENROUTER_API_KEY="REPLACE" \
  PUBLIC_SITE_URL="https://staging.tomodachi.pw" \
  --project tomodachi-platform --config stg --silent

# prd
doppler secrets set \
  OPENROUTER_API_KEY="REPLACE" \
  PUBLIC_SITE_URL="https://tomodachi.pw" \
  --project tomodachi-platform --config prd --silent
```

Optional public build variables may be set only when their source consumer is
enabled:

```bash
doppler secrets set \
  VITE_ADSENSE_PUBLISHER_ID="ca-pub-REPLACE" \
  VITE_ADSENSE_HOMEPAGE_SLOT_ID="REPLACE" \
  --project tomodachi-platform --config prd --silent
```

Every `VITE_*` value is embedded in the browser bundle. Never store a private
credential behind that prefix.

## 6. Current source-traced inventory

### 6.1 Required Worker secrets: exactly six

Keep every value environment-specific and configure the standalone Worker
separately from the Pages integration.

| Secret | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OIDC discovery, authorization, and callback validation |
| `GOOGLE_CLIENT_SECRET` | Confidential Google OIDC client authentication |
| `OIDC_COOKIE_KEY` | AES-GCM OIDC transaction cookie; exactly 32 base64url-encoded random bytes |
| `SESSION_PEPPER` | Independent value mixed into session-token hashes before D1 persistence |
| `PSEUDONYM_KEY` | HMAC key for privacy-preserving rate-limit and moderation pseudonyms |
| `OPENROUTER_API_KEY` | Curated `/api/ai/*` routes and model comparison tooling |

Sources include `wrangler.jsonc`, `worker/auth.ts`, `worker/crypto.ts`,
`worker/legacy.ts`, `functions/api/ai/[[path]].ts`, and
`server/openrouter.ts`.

`PUBLIC_SITE_URL`, `GOOGLE_OIDC_REDIRECT_URI`, `TERMS_VERSION`,
`COMMUNITY_MUTATIONS_ENABLED`, and `ENVIRONMENT` are non-secret runtime
configuration. The Worker environments declare exactly six rate-limit
bindings: `AUTH_RATE_LIMITER`, `SAVE_RATE_LIMITER`, `COMMENT_RATE_LIMITER`,
`SOCIAL_RATE_LIMITER`, `DISCOVERY_RATE_LIMITER`, and `AI_RATE_LIMITER`.

The retired `/api/stripe/*` and `/api/webhooks/stripe` compatibility paths are
provider-free `410 Gone` tombstones. They require no credential, KV receipt, or
dedicated rate limiter.

### 6.2 Public build-time variables

Set these only in the config used for the matching build.

| Variable | Consumer |
| --- | --- |
| `VITE_ADSENSE_PUBLISHER_ID` | Homepage ad component |
| `VITE_ADSENSE_HOMEPAGE_SLOT_ID` | Homepage ad component |
| `VITE_OAUTH_PORTAL_URL` | `client/src/const.ts` |
| `VITE_APP_ID` | `client/src/const.ts` |
| `VITE_ANALYTICS_ENDPOINT` | `client/index.html` |
| `VITE_ANALYTICS_WEBSITE_ID` | `client/index.html` |
| `VITE_FRONTEND_FORGE_API_KEY` | Map client integration; public by definition |
| `VITE_FRONTEND_FORGE_API_URL` | Map client integration |

There is no payment-link build variable.

### 6.3 Tooling-only values

`LTG_COMPARE_*`, `LTG_STUDIO_URL`, `LTG_SMOKE_*`, and `CHROME_PATH` are local
tooling inputs and normally do not belong in Cloudflare.

## 7. Pages integration

1. Open `tomodachi-platform` in Doppler, then **Integrations** and
   **Cloudflare Pages**.
2. Supply a scoped Cloudflare API token only in Doppler.
3. Map `stg` to Preview and `prd` to Production.
4. After sync, change mapped values in Doppler rather than creating drift in
   the Cloudflare environment UI.
5. Redeploy the affected Pages environment before treating a rotated value as
   active.

The integration does not deploy a standalone Worker and does not prove that a
Worker version contains its required secrets.

## 8. Service tokens and CI

The default GitHub workflow does not need Doppler. If a future job has a
reviewed secret consumer, create a service token for one config and store it as
`DOPPLER_TOKEN`; never use a personal token.

```bash
doppler configs tokens create \
  --project tomodachi-platform \
  --config github \
  github-ci --plain
```

The `github` config must exist first. Use another reviewed config name if that
is the established mapping.

## 9. Standalone Worker secret deployment

Follow `community-deployment-runbook.md`. `secrets.required` in
`wrangler.jsonc` is the six-name allowlist. The target-specific release wrapper
validates configuration and packaging but does not authorize a secret write.

```bash
pnpm worker:dry-run:staging
pnpm worker:dry-run:production

# Only after the matching gate is explicitly approved:
pnpm worker:deploy:staging
pnpm worker:deploy:production
```

Before acceptance, list only the target Worker's secret names and require an
exact match with the six-name allowlist. The ignored readiness and secret files
must be regular files, owner-only mode `0600`, and bound to the exact approved
commit. Never print or diff their values.

## 10. Rotation and retirement

For an active provider credential:

1. Create the new value at the provider.
2. Write it to one approved target config without logging it.
3. Redeploy that target and run an authorized probe.
4. Revoke the old value only after traffic succeeds on the new one.

For retired payment values, do not rotate them into the six-secret contract.
Remove them from Doppler and Cloudflare after the code returning `410` is live;
then revoke only Tomodachi-exclusive provider credentials. Preserve only the
provider records required for historical fulfillment, refund, tax, or audit
obligations.

## 11. References

- [Doppler branch configs](https://docs.doppler.com/docs/branch-configs)
- [Doppler service tokens](https://docs.doppler.com/docs/service-tokens)
- [Doppler Cloudflare Pages integration](https://docs.doppler.com/docs/cloudflare-pages)
- [Doppler Cloudflare Workers integration](https://docs.doppler.com/docs/cloudflare-workers)
- [Doppler start and integrations](https://docs.doppler.com/docs/start)
