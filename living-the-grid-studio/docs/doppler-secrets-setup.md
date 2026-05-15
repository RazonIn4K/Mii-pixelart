# Doppler secrets setup

This is the setup runbook for moving the project's environment variables out of `.env` files and the Cloudflare Pages dashboard and into Doppler. The repo already has `doppler.yaml` checked in.

## Why Doppler

The project's secret list is small today (7 env vars) but it grows the moment we add Cloudflare Email Routing, Sentry, a newsletter provider, an affiliate API key, or Brave Creator tokens. Doppler gives us:

1. One source of truth for `dev`, `preview`, and `production`. Edit a secret once, it shows up everywhere.
2. Audit log of every secret read/write. Important for the security-positioning of `tomodachi.pw`.
3. Local dev parity. `doppler run -- pnpm dev` injects the exact same env the deployed site sees, with no `.env.local` to forget about.
4. Push-on-change to Cloudflare Pages via Doppler's native Pages integration. No redeploy needed to refresh a rotated key.
5. Free tier covers what we need today: up to 5 projects, CLI, audit log, native integrations.

The trade-off is one extra service in the loop. If Doppler goes down, secrets cached in Cloudflare's env still serve traffic; only the propagation of changes is affected.

## One-time project setup

1. Sign in at <https://dashboard.doppler.com> (free tier is fine; pick the "Developer" plan).
2. Click **Projects → New Project**. Name it `tomodachi-pw`. Doppler will pre-create three configs: `dev`, `stg`, and `prd`. Rename `stg` to `preview` and `prd` to `production` for consistency with Cloudflare Pages.
3. Add the secrets below into the `production` config.

### Secrets to add

| Key                              | Required for       | Source                                                                  |
|----------------------------------|--------------------|-------------------------------------------------------------------------|
| `OPENROUTER_API_KEY`             | AI chat            | <https://openrouter.ai/keys>                                            |
| `STRIPE_SECRET_KEY`              | Stripe checkout    | Stripe dashboard → Developers → API keys (use the live secret key)      |
| `STRIPE_WEBHOOK_SECRET`          | Future webhooks    | Reserve. Generated when you add a webhook endpoint.                     |
| `PUBLIC_SITE_URL`                | Stripe success URL | `https://tomodachi.pw` in production; matching previews in `preview`.   |
| `VITE_ADSENSE_PUBLISHER_ID`      | AdSense slot       | AdSense dashboard. Optional until you turn ads on.                      |
| `VITE_ADSENSE_HOMEPAGE_SLOT_ID`  | AdSense slot       | AdSense dashboard. Optional until you turn ads on.                      |
| `VITE_STRIPE_DONATION_LINK`      | Custom-amount tip  | `https://buy.stripe.com/bJe00laUWaRs9CK0F04ZG17` (already provisioned). |

Use **Branch Configs** in Doppler if you ever want per-developer overrides; keep `dev` clean for the default local experience.

## Connect Cloudflare Pages

1. In Doppler, open the `tomodachi-pw` project → click **Integrations → Cloudflare Pages**.
2. Authenticate with a Cloudflare API token that has the scoped permission **Pages → Edit**. Doppler walks you through generating it.
3. Pick the Cloudflare account, then the Pages project (e.g. `tomodachi-studio`), then map:
   - Doppler `production` config → Cloudflare **Production** environment
   - Doppler `preview` config → Cloudflare **Preview** environment
4. Click **Setup Integration**. Doppler does an initial sync and then watches for changes.

After this is wired, you do NOT edit env vars in the Cloudflare Pages UI anymore. The Doppler sync owns those values; manual edits in Cloudflare get overwritten on the next sync.

## Local development

Once the project is set up and `doppler.yaml` is committed:

```bash
brew install dopplerhq/cli/doppler   # or: curl -Ls https://cli.doppler.com/install.sh | sh
doppler login                         # authenticates the CLI once
doppler setup                         # uses doppler.yaml: tomodachi-pw / dev
doppler run -- pnpm dev               # injects secrets and starts Vite
```

Common variants:

```bash
doppler run --config preview -- pnpm build      # build with preview env
doppler run -- npx wrangler pages dev dist/public --compatibility-flag=nodejs_compat
doppler secrets                                 # list all current secrets
doppler secrets get OPENROUTER_API_KEY --plain  # print one value (audited)
```

## What stays out of Doppler

- `wrangler.toml` non-secret values like `compatibility_date` and the `name` field. Those are config, not secrets, and live in source.
- Anything you actually want to commit (build flags, feature toggles you're fine making public). Doppler is for things that should not be on GitHub.

## Rotation playbook

When you rotate a secret (Stripe key compromise, OpenRouter quota change, etc.):

1. Generate the new value in the upstream service.
2. Paste it into Doppler under the same key. Doppler versions the change.
3. Doppler's Cloudflare integration pushes the new value within seconds. No redeploy required.
4. Optional: revoke the old value in the upstream service after confirming the new value is live.

## What I would still keep separate from Doppler

The Stripe webhook signing secret (`STRIPE_WEBHOOK_SECRET`) is the one variable I would also store in a password manager you personally hold, just to have an offline copy. If Doppler ever loses access, you can re-attach a webhook endpoint without losing payment-event idempotency.
