# Cloudflare Pages + Unstoppable Domains deployment guide

This is the operational runbook for getting `tomodachi.pw` (ICANN ccTLD) and `tomodachi.brave` (Web3 / alt-root) live on Cloudflare Pages. It assumes the repo state at or after the breach recovery hub work.

> Important context on the two domains
>
> `tomodachi.pw` is a real ICANN ccTLD (Palau). It resolves through the public DNS root, so standard A/AAAA/CNAME records on Cloudflare DNS work normally.
>
> `tomodachi.brave` is NOT in the public ICANN root. It is a Web3 / alt-root name. Standard browsers (Safari, Edge, mobile Chrome) will not resolve it without one of: the Brave browser with Web3 resolution enabled, the Unstoppable Domains browser extension, Opera, or a custom resolver. You cannot point it at Cloudflare with a normal A record. Treat it as a secondary creative-domain redirect, not your primary traffic surface.

## 1. One-time Cloudflare setup

1. Sign in at <https://dash.cloudflare.com>. If you do not already have an account, create one with the same email you use for billing.
2. In the left sidebar, go to **Workers & Pages → Create application → Pages → Connect to Git**.
3. Authorize Cloudflare to read your GitHub account, then pick the repository for this project.
4. Configure the build:
   - **Project name:** `tomodachi-studio` (matches `wrangler.toml`)
   - **Production branch:** `main`
   - **Framework preset:** None (custom)
   - **Build command:** `pnpm install --frozen-lockfile && pnpm vite build`
   - **Build output directory:** `dist/public`
   - **Root directory:** leave blank
   - **Environment variables** (build-time): leave empty for now; we add runtime vars next.
5. Click **Save and Deploy**. The first deploy will fail at the API but the SPA itself will come up at `<project>.pages.dev`.

## 2. Environment variables and secrets

Pages distinguishes between two scopes: **Production** and **Preview**. Set both.

### Required

| Variable                | Type    | Scope               | Notes                                                                                  |
|-------------------------|---------|---------------------|----------------------------------------------------------------------------------------|
| `OPENROUTER_API_KEY`    | Secret  | Production, Preview | The key the AI chat route uses. Create at <https://openrouter.ai/keys>.                |
| `PUBLIC_SITE_URL`       | Plain   | Production, Preview | `https://tomodachi.pw` in prod, your preview origin in preview.                        |

### Optional (used by client-side AdSense block in `Home.tsx`)

| Variable                            | Type  | Scope               | Notes                                                                              |
|-------------------------------------|-------|---------------------|------------------------------------------------------------------------------------|
| `VITE_ADSENSE_PUBLISHER_ID`         | Plain | Production          | Your AdSense publisher ID (e.g. `ca-pub-1234567890123456`). Build-time only.       |
| `VITE_ADSENSE_HOMEPAGE_SLOT_ID`     | Plain | Production          | The ad unit slot ID for the homepage.                                              |

> Vite inlines anything prefixed with `VITE_` at build time. If you only want ads in production, leave them unset in Preview so previews stay ad-free.

Set them in the dashboard or with `wrangler`:

```bash
wrangler pages secret put OPENROUTER_API_KEY --project-name=tomodachi-studio
wrangler pages secret put OPENROUTER_API_KEY --project-name=tomodachi-studio --env=preview
```

## 3. Pages Functions: how the API is served at the edge

The repo now ships a Pages Functions catch-all at `functions/api/ai/[[path]].ts`. When deployed:

- `GET  /api/ai/status` returns whether `OPENROUTER_API_KEY` is set.
- `GET  /api/ai/models` returns the OpenRouter model list with availability flags.
- `POST /api/ai/chat` runs the model with the same shared system prompt used by the local Express server.

Local emulation of Functions + the static build:

```bash
pnpm vite build
npx wrangler pages dev dist/public --compatibility-flag=nodejs_compat
```

You can keep using `pnpm dev` for normal day-to-day work (the Vite middleware in `vite.config.ts` proxies `/api/ai/*` for the dev server). Wrangler is only needed when you want to test the edge runtime locally.

## 4. Custom domain: tomodachi.pw (standard DNS)

`.pw` is a normal ICANN TLD. Whether you bought it through Unstoppable Domains' marketplace or somewhere else, the underlying registry record needs nameservers and DNS records the public internet can see.

### 4a. Add the domain to Cloudflare DNS

There are two patterns. Choose one.

**Pattern A: Use Cloudflare as DNS + proxy (recommended).**

1. In the Cloudflare dashboard, click **+ Add a site**, enter `tomodachi.pw`, choose the Free plan.
2. Cloudflare will scan existing records (if any) and assign you a pair of nameservers like `liz.ns.cloudflare.com` and `walt.ns.cloudflare.com`.
3. In Unstoppable Domains → **My Domains → tomodachi.pw → Manage → DNS**, switch the nameservers to the Cloudflare pair. Save. Propagation is usually 10–60 minutes; DNSSEC may take longer.
4. Once Cloudflare shows the zone as **Active**, go to **Workers & Pages → tomodachi-studio → Custom domains → Set up a custom domain** and enter `tomodachi.pw` (apex) and `www.tomodachi.pw`. Cloudflare auto-creates the right CNAME-flattened records and a managed TLS cert.

**Pattern B: Leave nameservers at Unstoppable, point records manually.**

If you do not want to delegate the entire zone to Cloudflare, you can keep Unstoppable as the DNS host and point only the necessary records. In Unstoppable Domains → DNS, add:

| Type   | Name             | Value                                   | TTL | Notes                                                            |
|--------|------------------|-----------------------------------------|-----|------------------------------------------------------------------|
| CNAME  | `www`            | `tomodachi-studio.pages.dev`            | 300 | Points the `www` subdomain at the Pages project.                 |
| ALIAS / ANAME | `@` (apex) | `tomodachi-studio.pages.dev`            | 300 | Required because CNAME at the apex is illegal in classic DNS.    |
| TXT    | `_cf-pages`      | (value shown in Cloudflare dashboard)   | 300 | Domain verification record Cloudflare prompts you for.           |

Then in Cloudflare Pages → **Custom domains**, enter `tomodachi.pw` and `www.tomodachi.pw` and follow the on-screen verification.

> Pattern A is operationally simpler and gives you Cloudflare's WAF, bot management, and analytics for free. Pattern B is fine if you want to keep DNS at Unstoppable.

### 4b. Email and other records

If you plan to use email at `tomodachi.pw`, set MX records before going live so welcome emails to subscribers do not bounce. Also add an SPF TXT record and DMARC policy when you wire up the newsletter.

## 5. Custom domain: tomodachi.brave (Web3 / alt-root)

`.brave` is not part of the ICANN root. Standard DNS does not apply. You have three options, in order of practicality:

### Option 1: Browser-resolved redirect to tomodachi.pw (recommended starting point)

The cheapest pattern is to use Unstoppable's "Browser Resolver" feature to set up a redirect. In Unstoppable Domains → `tomodachi.brave` → **Manage → Records**:

- Set the `browser.redirect_url` record to `https://tomodachi.pw`.

When a Brave / Opera / Unstoppable-extension user types `tomodachi.brave`, they get bounced to your ICANN domain on Cloudflare. This means:

- One canonical site to maintain.
- All Cloudflare analytics, Pages Functions, and TLS apply.
- You lose Web3 native-content benefits (decentralized hosting, censorship resistance), but you gain simplicity.

### Option 2: IPFS-hosted static mirror

If you want `tomodachi.brave` to serve content directly via Web3 without depending on Cloudflare:

1. Build the SPA: `pnpm vite build` produces `dist/public/`.
2. Upload `dist/public/` to IPFS (Pinata, Fleek, or `ipfs-cluster-ctl`). Record the CID.
3. In Unstoppable Domains → `tomodachi.brave` → **Records**, set:
   - `dweb.ipfs.hash` = the CID from step 2.
   - `browser.redirect_url` = empty.
4. Optional: pin the CID on multiple gateways so it stays available.

> The IPFS mirror has no server-side: `/api/ai/*` will not work because Pages Functions only run on Cloudflare's edge. If you go this route, treat the IPFS site as a read-only mirror of marketing content and keep the interactive features behind `tomodachi.pw`.

### Option 3: Hybrid (link out for interactive features)

Mirror the static breach-recovery content over IPFS (option 2) and add an obvious link from the IPFS site to `tomodachi.pw` for the AI assistant, paid checklists, and anything that needs server-side compute.

## 6. Caching strategy

`client/public/_headers` already encodes the defaults we want:

- `/assets/*` — `max-age=31536000, immutable` (hashed Vite output, safe to cache forever).
- `/index.html` — `no-cache` (so users always get the freshest asset references after a deploy).
- `/api/*` — `no-store` (AI responses are dynamic and personalized).

For breach-page traffic spikes you can additionally enable Cloudflare's **Always Online** feature in the dashboard. It serves a cached snapshot if your origin is unreachable, which is exactly what you want during a viral incident.

## 7. Deploy verification checklist

After your first successful Cloudflare deploy:

1. `https://tomodachi-studio.pages.dev/` loads the SPA.
2. `https://tomodachi-studio.pages.dev/api/ai/status` returns JSON with `"configured": true`.
3. The homepage breach hub's "Run AI recovery plan" button gets a real response.
4. After custom domain attach, `https://tomodachi.pw/` works and has a valid TLS cert.
5. `curl -I https://tomodachi.pw/assets/<any-hashed-file>` shows the long-cache header.
6. `curl -I https://tomodachi.pw/index.html` shows `Cache-Control: no-cache`.
7. In Brave with Web3 resolution enabled, typing `tomodachi.brave` either redirects to `tomodachi.pw` (option 1) or loads the IPFS mirror (option 2).

## 8. Rollback

Cloudflare Pages keeps every deploy. To roll back: **Workers & Pages → tomodachi-studio → Deployments → ⋯ → Rollback to this deployment**. DNS does not change; only the active build pointer flips.
