# Doppler secrets setup

Runbook for **`tomodachi-platform`** in Doppler. Secrets stay in Doppler (or your password manager backup)—not in git. The repo only has [`living-the-grid-studio/doppler.yaml`](../doppler.yaml) (`project` + default `config: dev`).

## Before you start: domain and MX

**You do not need a custom domain or MX records first** to set up Doppler, fill `dev` / `stg` / `prd`, or connect **Doppler → Cloudflare Pages**. Cloudflare Pages serves the site on **`https://<project>.pages.dev`** as soon as the Git build succeeds; that HTTPS origin is enough for early Stripe and webhook testing if your URLs point there.

| Concern | Needs custom domain first? | Needs MX / email DNS first? |
| --- | --- | --- |
| Doppler project configs + secrets | No | No |
| Pages Git build + deploy | No | No |
| Doppler **Integrations → Cloudflare Pages** sync | No — needs a **Pages project** + scoped API token only | No |
| Canonical `PUBLIC_SITE_URL` | Ideally matches the URL users see; can use `pages.dev` first, then switch `prd` to `https://tomodachi.pw` after DNS | No |
| Stripe Checkout return URLs + webhooks | Needs a **stable public HTTPS** URL Stripe can reach (`pages.dev` or your domain) | No |
| Receiving mail at `@tomodachi.pw` (Email Routing) | You attach the zone / domain in Cloudflare | **Yes** — MX (and later SPF/DMARC) when you want inboxes live |

**Practical order**

1. **Cloudflare:** Create/link the **Pages** project and get a successful deploy (often on `*.pages.dev` first). Details: `docs/cloudflare-deployment.md`.
2. **Cloudflare API token** with **Account → Cloudflare Pages → Edit** and **Account → Account Settings → Read** (per [Doppler’s Pages doc](https://docs.doppler.com/docs/cloudflare-pages)).
3. **Doppler:** Set secrets in **`dev`**, **`stg`**, **`prd`** (OpenRouter, Stripe, `PUBLIC_SITE_URL` per env, optional `VITE_*`).
4. **Doppler → Integrations → Cloudflare Pages:** connect account + project; map **`stg` → Preview**, **`prd` → Production**.
5. **Custom domain** (`tomodachi.pw` / `www`) when nameservers/DNS are ready; then align **`PUBLIC_SITE_URL`** (and Stripe Dashboard URLs if you hard-coded origins) with the real site.
6. **MX + Email Routing** when you want `help@`, `support@`, etc. — independent of Doppler secret sync.

Sidebar map (your workspace): **Integrations** (Cloudflare Pages), **Tokens** (service tokens), **Projects → tomodachi-platform** (configs `dev` / `stg` / `prd` / `dev_personal`).

---

## 1. How this repo maps to Doppler

| Item | Value |
| --- | --- |
| **Doppler project** | `tomodachi-platform` |
| **Configs you already have** | `dev`, `dev_personal`, `stg`, `prd` |
| **Local default (repo file)** | `dev` — see `doppler.yaml` |
| **Cloudflare Pages (recommended mapping)** | Doppler **`prd`** → Pages **Production** · Doppler **`stg`** → **Preview** |
| **Optional extra configs** | Add `github`, `gpu`, `automation` (or `preview` / `prod`) later if you want more isolation; not required to ship. |

**`dev_personal`:** Use only for overrides (e.g. your own `PUBLIC_SITE_URL`). Only assume inheritance if Doppler shows it as a **branch config** of `dev`; otherwise set secrets there explicitly.

---

## 2. Token policy (short)

| Token | Use |
| --- | --- |
| `dp.pt…` personal | **Local + `doppler login` only** — not CI, not Cloudflare, not shared servers |
| `dp.st…` service | One config, read-only when possible → GitHub Secrets / hosts as `DOPPLER_TOKEN` |
| Cloudflare API token | Only in **Doppler → Cloudflare Pages** integration UI |

Details: [Service tokens](https://docs.doppler.com/docs/service-tokens).

---

## 3. Complete setup (do in order)

Work from the app directory:

```bash
cd living-the-grid-studio   # from repo root
```

| Step | Action |
| --- | --- |
| 1 | `brew install dopplerhq/cli/doppler` (if needed) |
| 2 | `doppler login` |
| 3 | `doppler setup` → **Yes** to use `doppler.yaml` → you get **`tomodachi-platform` / `dev`** scoped to this folder |
| 4 | **Do not bulk-copy shared keys.** Move a value from another project only after the current Tomodachi source contains an executable consumer and the credential owner approves that exact environment (see [§4](#4-cli-copy-from-local-mac-work-into-tomodachi-platform)) |
| 5 | **Set Tomodachi core secrets** on `dev`, then `stg`, then `prd` — see **[§6](#6-which-values-does-this-repo-actually-need)** for the full list; use the dashboard or bulk CLI in [§5](#5-bulk-set-dev-stg-prd) |
| 6 | **Verify:** `doppler secrets -p tomodachi-platform -c dev` (and `stg` / `prd` as needed) |
| 7 | **Doppler → Cloudflare Pages:** Integration → map **`prd` → Production**, **`stg` → Preview** for project `mii-pixelart` ([docs](https://docs.doppler.com/docs/cloudflare-pages)). A settings sync does not update an existing Functions deployment; create and validate a new deployment before revoking the old credential. |
| 8 | **Cloudflare Pages** build: root `living-the-grid-studio`, command `pnpm install --frozen-lockfile && pnpm vite build`, output `dist/public`, branch `main` — see `docs/cloudflare-deployment.md` |
| 9 | **Smoke test:** `doppler run -- pnpm check` · `doppler run -- pnpm vite build` · `doppler run -- pnpm dev` |
| 10 | Later: service tokens for automation ([§9](#9-service-tokens-and-github-ci)) |

---

## 4. CLI: copy from `local-mac-work` into `tomodachi-platform`

There was no rule against CLI copy. The earlier emphasis on **one-key `get` → `set`** was about:

1. **Not pasting long secrets into the terminal** (they land in **shell history** and in scrollback).
2. **Not bulk-copying unrelated keys** (Airtable, GHL, etc.) into Tomodachi by mistake.
3. **Tomodachi-specific values** (`PUBLIC_SITE_URL`, Stripe objects for this site, OpenRouter keys you want for this product) often **do not exist** on `local-mac-work` anyway—you still set those on `tomodachi-platform`.

**Copy only when:** the current Tomodachi source has an executable consumer,
the source and destination are owned by the same provider account, and the
credential owner has approved that exact environment. Prefer a distinct key
per environment even when the provider account is shared.

**Do not copy:** unrelated product keys (Airtable, GHL, …), credentials owned by
another stack, or keys that should be Tomodachi-specific. In particular,
`RUNPOD_API_KEY` and `N8N_LEAD_PIXEL_WEBHOOK_URL` belong to the separate
`ai-actor-platform` stack and are not Tomodachi secrets. OpenRouter keys must be
environment-specific, and Stripe webhook secrets must match the exact Stripe
endpoint for that environment.

List key names in source (no values):

```bash
doppler secrets -p local-mac-work -c dev --json | jq -r 'keys[]'
```

**One approved key (nothing typed by hand).** Pipe the value through standard
input so it is not placed in a process argument. Append **`--silent`** so
Doppler does not print the new value to the terminal:

```bash
KEY=<APPROVED_SHARED_KEY>
doppler secrets get "$KEY" -p <SOURCE_PROJECT> -c <SOURCE_CONFIG> --plain |
  doppler secrets set "$KEY" -p tomodachi-platform -c dev --silent
```

Never loop over a generic list of "shared" keys. Repeat the one-key operation
only after recording the owner, consumer, source config, destination config,
and revocation plan for that individual value. A value approved for `dev` is
not implicitly approved for `stg` or `prd`.

---

## 5. Bulk-set dev, stg, prd

Replace placeholders with real values. **Warning:** pasting secrets into a terminal can store them in **shell history**; for `prd`, the Doppler dashboard is often safer.

These examples cover the provider values used by the retained Pages rollback
deployment. They do not configure the standalone Worker's complete eight-secret
allowlist; use §6.1 and §11 for the Worker path.

This app’s dev server uses **`http://localhost:3000`** (`vite.config.ts`).

**`dev` — test Stripe, local URL**

```bash
doppler secrets set \
  OPENROUTER_API_KEY="REPLACE" \
  STRIPE_SECRET_KEY="sk_test_REPLACE" \
  STRIPE_WEBHOOK_SECRET="whsec_REPLACE" \
  PUBLIC_SITE_URL="http://localhost:3000" \
  VITE_STRIPE_DONATION_LINK="https://buy.stripe.com/REPLACE" \
  --project tomodachi-platform --config dev --silent
```

Add AdSense when needed (omit lines you do not use):

```bash
doppler secrets set \
  VITE_ADSENSE_PUBLISHER_ID="ca-pub-REPLACE" \
  VITE_ADSENSE_HOMEPAGE_SLOT_ID="REPLACE" \
  --project tomodachi-platform --config dev --silent
```

**`stg` — preview / staging (test Stripe, no ads in UI if you leave `VITE_ADSENSE_*` unset)**

```bash
doppler secrets set \
  OPENROUTER_API_KEY="REPLACE" \
  STRIPE_SECRET_KEY="sk_test_REPLACE" \
  STRIPE_WEBHOOK_SECRET="whsec_REPLACE" \
  PUBLIC_SITE_URL="https://staging.tomodachi.pw" \
  VITE_STRIPE_DONATION_LINK="https://buy.stripe.com/REPLACE" \
  --project tomodachi-platform --config stg --silent
```

**`prd` — production**

```bash
doppler secrets set \
  OPENROUTER_API_KEY="REPLACE" \
  STRIPE_SECRET_KEY="sk_live_REPLACE" \
  STRIPE_WEBHOOK_SECRET="whsec_REPLACE" \
  PUBLIC_SITE_URL="https://tomodachi.pw" \
  VITE_ADSENSE_PUBLISHER_ID="ca-pub-REPLACE" \
  VITE_ADSENSE_HOMEPAGE_SLOT_ID="REPLACE" \
  VITE_STRIPE_DONATION_LINK="https://buy.stripe.com/REPLACE" \
  --project tomodachi-platform --config prd --silent
```

**Stripe:** `dev` + `stg` → `sk_test_…` + test webhook secret · `prd` → `sk_live_…` + **live** webhook secret. Mixing modes breaks webhook verification.

**Vite:** Any `VITE_*` value is public in the browser build. Never put private API keys behind `VITE_`.

---

## 6. Which values does this repo actually need?

Doppler (or Cloudflare) only needs variables that **this codebase, the Worker,
or the retained Pages rollback Functions read**. Below is an inventory traced
from source, not an aspirational list.

### 6.1 Required Worker secrets

The standalone Worker declares exactly these eight secret names in
`wrangler.jsonc`. Keep every value environment-specific and configure the
Worker secret surface separately from the Doppler-to-Pages integration.

| Secret | Used for | Worker requirement |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Google OIDC discovery, authorization, and callback validation | Required |
| `GOOGLE_CLIENT_SECRET` | Confidential Google OIDC client authentication | Required |
| `OIDC_COOKIE_KEY` | AES-GCM protection for the short-lived OIDC transaction cookie; exactly 32 base64url-encoded random bytes | Required |
| `SESSION_PEPPER` | Independent secret mixed into session-token hashes before D1 persistence | Required |
| `PSEUDONYM_KEY` | HMAC key for privacy-preserving client, reporter, and moderator pseudonyms | Required |
| `OPENROUTER_API_KEY` | Curated-free-model `/api/ai/*` routes and `pnpm compare:models` | Required |
| `STRIPE_SECRET_KEY` | Stripe Checkout creation and session verification | Required |
| `STRIPE_WEBHOOK_SECRET` | Signature verification for the active `/api/webhooks/stripe` endpoint; must match the exact environment, endpoint, and Stripe mode | Required |

Sources: `wrangler.jsonc`, `worker/auth.ts`, `worker/crypto.ts`,
`worker/legacy.ts`, `functions/api/ai/[[path]].ts`,
`functions/api/stripe/[[path]].ts`, `functions/api/webhooks/stripe.ts`,
`server/openrouter.ts`, and `server/stripe.ts`.

`PUBLIC_SITE_URL`, `GOOGLE_OIDC_REDIRECT_URI`, `TERMS_VERSION`,
`COMMUNITY_MUTATIONS_ENABLED`, and `ENVIRONMENT` are runtime configuration,
not secrets. The Worker keeps them in the selected `wrangler.jsonc`
environment. The retained Pages deployment may continue receiving
`PUBLIC_SITE_URL` through its Pages environment mapping during the rollback
soak.

### 6.2 Build-time (`VITE_*`) — set in Doppler for the **same** config Cloudflare builds with, so they are inlined at `pnpm vite build`

All are **public in the client bundle**. Never put private keys behind `VITE_`.

| Variable | Where |
| --- | --- |
| `VITE_ADSENSE_PUBLISHER_ID` | `client/src/pages/Home.tsx` |
| `VITE_ADSENSE_HOMEPAGE_SLOT_ID` | `Home.tsx` |
| `VITE_STRIPE_DONATION_LINK` | `client/src/pages/Support.tsx` |
| `VITE_OAUTH_PORTAL_URL` | `client/src/const.ts` |
| `VITE_APP_ID` | `const.ts` |
| `VITE_ANALYTICS_ENDPOINT` | `client/index.html` |
| `VITE_ANALYTICS_WEBSITE_ID` | `client/index.html` |
| `VITE_FRONTEND_FORGE_API_KEY` | `client/src/components/Map.tsx` |
| `VITE_FRONTEND_FORGE_API_URL` | `Map.tsx` |

### 6.3 Local / tooling only (usually **not** in Doppler for Cloudflare)

| Variable | Where |
| --- | --- |
| `LTG_COMPARE_*`, `LTG_STUDIO_URL`, `LTG_SMOKE_*`, `CHROME_PATH` | `scripts/*` |

### 6.4 Credentials owned by other stacks

Do not copy `RUNPOD_API_KEY` or `N8N_LEAD_PIXEL_WEBHOOK_URL` into
`tomodachi-platform`. They remain owned by their source stack, and the current
Tomodachi application has no executable consumer for either value. Revisit
ownership only if application code is added and the credential owner approves
the exact environment mapping described in [§4](#4-cli-copy-from-local-mac-work-into-tomodachi-platform).

### 6.5 Doppler configs for *extra* isolation (optional)

| Config | Purpose |
| --- | --- |
| `github` | Values for GitHub Actions **only if** you add deploy workflows (current [CI](../../.github/workflows/ci.yml) needs no secrets) |
| `gpu` | RunPod / GPU endpoints when wired in code |
| `automation` | n8n, email, newsletter APIs when wired in code |

---

## 7. Doppler Team plan — what to leverage

There is **no Doppler MCP** in this Cursor workspace; official behavior below is from [Doppler docs](https://docs.doppler.com/docs/start) (and Context7 lookup on `/websites/doppler`).

| Capability | What to do |
| --- | --- |
| **Integrations** | **Cloudflare Pages** (secrets sync to Preview/Production), **GitHub** (optional: sync selected secrets to Actions/Codespaces). Configure under Project → **Integrations**. |
| **Service tokens** | Per-config, read-only tokens for CI, servers, or `DOPPLER_TOKEN` in automation — not personal `dp.pt` tokens. [Service tokens](https://docs.doppler.com/docs/service-tokens). |
| **Branch configs** | e.g. `dev_personal` branched from `dev` for overrides; `doppler.yaml` can target `dev_personal` for solo machines. [Branch configs](https://docs.doppler.com/docs/branch-configs). |
| **Workplace / Team** | Roles (Owner / default project roles), SSO if you use it — **Team → Roles** for SAML defaults per [AWS SAML SSO doc pattern](https://docs.doppler.com/docs/aws-saml-sso) (same Team UI idea). |
| **Activity** | Use the dashboard **Activity** / audit views and the CLI’s operational logging where enabled — good for proving who read or changed secrets after you connect Cloudflare/GitHub. |

**Practical stack for you:** `doppler login` locally → **Doppler ↔ Cloudflare Pages** for `stg`/`prd` → optional **GitHub** integration only if Actions needs secrets → **service tokens** for any headless host.

---

## 8. Cloudflare Pages integration

1. Doppler → **`tomodachi-platform`** → **Integrations** → **Cloudflare Pages**.
2. Cloudflare API token: **Pages → Edit** and **Account Settings → Read** (paste only in Doppler).
3. Map **`prd` → Production** and **`stg` → Preview** (or create `prod` / `preview` configs and map those instead—pick one model and stick to it).

After sync, edit secrets in **Doppler**, not in the Cloudflare env UI (sync overwrites drift).

---

## 9. Service tokens and GitHub CI

- **GitHub:** Default is Cloudflare Pages building from Git; no Doppler in [CI](../../.github/workflows/ci.yml).
- **If** you add a deploy job that needs secrets from Doppler: create a **service token** for the right config, add `DOPPLER_TOKEN` in GitHub Secrets, never a personal token.

```bash
doppler configs tokens create --project tomodachi-platform --config github github-ci --plain
```

(`github` config must exist first, or use another config name you created.)

---

## 10. Local commands (daily)

```bash
doppler run -- pnpm dev
doppler run -- pnpm check
doppler run -- pnpm vite build
```

Other configs without changing `doppler.yaml`:

```bash
doppler run --config stg -- pnpm vite build
```

---

## 11. Workers (not Pages)

The standalone Worker has a separate, approval-gated secret and deployment
surface. A Doppler-to-Cloudflare Pages integration updates Pages settings only;
it does not populate Worker secrets or deploy a Worker version.

Follow [`community-deployment-runbook.md`](community-deployment-runbook.md)
and treat `secrets.required` in `wrangler.jsonc` as the eight-name allowlist. The
release wrapper validates configuration and packaging but does not write secret
values. Secret writes remain their own explicitly approved, target-specific
step through the selected Worker secret manager or Wrangler flow.

Use the current target-specific release paths:

```bash
pnpm worker:dry-run:staging
pnpm worker:dry-run:production

# Only after the matching deployment gate is explicitly approved:
pnpm worker:deploy:staging
pnpm worker:deploy:production
```

Before deployment acceptance, list the target Worker's secret names and verify
that they match the eight-name allowlist without printing values. Never treat a
Pages secret sync as proof that a Worker version has those bindings.

---

## 12. Rotation

1. New value in upstream (Stripe, OpenRouter, …).
2. Update same key in Doppler (`dev` / `stg` / `prd` as appropriate).
3. Cloudflare sync picks up changes for mapped configs.
4. Revoke old upstream credential after confirming traffic is good.

Keep a **copy of `STRIPE_WEBHOOK_SECRET`** in a personal password manager if you want an offline recovery path.

---

## 13. Links

| Topic | URL |
| --- | --- |
| This project in Doppler (example workplace) | [tomodachi-platform](https://dashboard.doppler.com/workplace/fa80a7d1def10e53c1ad/projects/tomodachi-platform) |
| Branch configs | <https://docs.doppler.com/docs/branch-configs> |
| Service tokens | <https://docs.doppler.com/docs/service-tokens> |
| Cloudflare Pages | <https://docs.doppler.com/docs/cloudflare-pages> |
| GitHub Actions | <https://docs.doppler.com/docs/github-actions> |
| Cloudflare Workers | <https://docs.doppler.com/docs/cloudflare-workers> |
| Doppler start / integrations overview | <https://docs.doppler.com/docs/start> |
