# Doppler secrets setup

Updated: 2026-07-16

This runbook covers the current Pages application. Payment provider credentials
are retired and must not be added to `dev`, `stg`, `prd`, Cloudflare Pages, or
local environment files.

## Environment mapping

| Doppler config | Runtime |
| --- | --- |
| `dev` | local development |
| `stg` | Cloudflare Pages preview/staging |
| `prd` | Cloudflare Pages production |

The repo-local `doppler.yaml` selects the `tomodachi-platform` project and the
`dev` config. Use scoped service tokens for automation and a personal Doppler
session only for interactive local work.

## Current server-side values

| Variable | Purpose | Required |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | `/api/ai/*` and model comparison tooling | Only when AI is enabled |
| `PUBLIC_SITE_URL` | Canonical origin and provider attribution headers | Yes |

Other feature-specific values should be added only when current source reads
them and the owning feature has an approved threat model and deployment gate.
Any `VITE_*` value is public in the browser bundle and must never contain a
secret.

## Safe setup

From `living-the-grid-studio`:

```bash
doppler setup
doppler secrets set OPENROUTER_API_KEY --project tomodachi-platform --config dev
doppler secrets set PUBLIC_SITE_URL=http://localhost:3000 --project tomodachi-platform --config dev --silent
```

Set the corresponding staging and production values through the protected
Doppler dashboard/bootstrap flow. Do not paste secret values into documentation,
chat, shell history, commit messages, CI logs, or screenshots.

For Cloudflare Pages, map `stg` to Preview and `prd` to Production. A secret sync
changes environment configuration but does not update an already running
deployment; redeploy the intended commit and verify the live runtime afterward.

## Verification

```bash
doppler run -- pnpm check
doppler run -- pnpm build
```

Verify key names without printing values. Application logs must not contain raw
API keys, prompt contents, session tokens, or project documents.

## Rotation

1. Create the new provider credential.
2. Store it in the intended Doppler config through the protected flow.
3. Sync and redeploy the exact approved commit.
4. Run a bounded functional probe.
5. Revoke the previous credential after the new deployment is proven.

Do not reintroduce payment secrets. Any future paid plan requires a new ADR and
separate credential/provisioning approval.
