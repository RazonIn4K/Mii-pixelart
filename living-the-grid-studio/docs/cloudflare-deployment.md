# Cloudflare Pages + Unstoppable Domains deployment guide

This is the operational runbook for getting `tomodachi.pw` (ICANN ccTLD) and `tomodachi.brave` (Web3 / alt-root) live on Cloudflare Pages. It assumes the repo state at or after the breach recovery hub work.

## Cloudflare Pages build settings (canonical)

These values assume the Git repository root is the monorepo root and the app lives under `living-the-grid-studio/`:

| Setting | Value |
| --- | --- |
| **Root directory** | `living-the-grid-studio` |
| **Build command** | `pnpm install --frozen-lockfile && pnpm vite build` |
| **Build output directory** | `dist/public` |
| **Production branch** | `main` |

If Cloudflare’s UI complains about paths, keep this **root + output** pair together: root `living-the-grid-studio`, output `dist/public` (relative to that root).

### If the deploy “succeeds” but the app is wrong

Check the **build log**. These lines mean Pages is still using **repo root** (`/`) instead of **`living-the-grid-studio`**, and/or has **no build command**:

| Log line | Meaning |
| --- | --- |
| `No Wrangler configuration file found` | `wrangler.toml` lives under `living-the-grid-studio/`; Cloudflare never entered that directory. |
| `No build command specified. Skipping build step` | **Build command** is empty in project settings. |
| `No functions dir at /functions found` | Pages looked for `/functions` at repo root; this app’s Functions are at `living-the-grid-studio/functions`. |

**Fix:** **Workers & Pages** → your project → **Settings** → **Builds** → set **Root directory** to `living-the-grid-studio`, **Build command** to `pnpm install --frozen-lockfile && pnpm vite build`, **Build output directory** to `dist/public`, then **Retry deployment** on the latest commit. After a correct build, the log should show install + `vite build`, and Functions should be discovered from the subfolder.

**Project name:** Your URL uses **`mii-pixelart`**. That is fine, but then in **Doppler → Cloudflare Pages** pick this **Pages project name** exactly. Our `wrangler.toml` uses `name = "tomodachi-studio"` for CLI deploys; either rename the Pages project to match later or pass `--project-name=mii-pixelart` when using Wrangler against this deployment.

## Workers Routes (zone) vs Workers & Pages (account)

In the Cloudflare dashboard for **tomodachi.pw** (a **zone**), the sidebar may show **Workers Routes**. That screen maps URL patterns on the domain to a **Worker**. It is **not** where you create or manage **Cloudflare Pages** projects, Git builds, or **Doppler → Cloudflare Pages** secret sync—an empty routes table there is normal.

For this app: use **Workers & Pages** from the **account** navigation (click the Cloudflare logo / account switcher if you are stuck inside the zone), open your **Pages** project (`tomodachi-studio`), and manage builds and domains there. Wire secrets through **Doppler** ([`docs/doppler-secrets-setup.md`](doppler-secrets-setup.md)) → **Integrations → Cloudflare Pages**; that flow runs in Doppler’s UI, not on the zone Workers Routes page.

> Important context on the two domains
>
> `tomodachi.pw` is a real ICANN ccTLD (Palau). It resolves through the public DNS root, so standard A/AAAA/CNAME records on Cloudflare DNS work normally.
>
> `tomodachi.brave` is NOT in the public ICANN root. It is a Web3 / alt-root name. Standard browsers (Safari, Edge, mobile Chrome) will not resolve it without one of: the Brave browser with Web3 resolution enabled, the Unstoppable Domains browser extension, Opera, or a custom resolver. You cannot point it at Cloudflare with a normal A record. Treat it as a secondary creative-domain redirect, not your primary traffic surface.

## 1. One-time Cloudflare setup

1. Sign in at <https://dash.cloudflare.com>. If you do not already have an account, create one with the same email you use for billing.
2. In the left sidebar, go to **Workers & Pages → Create application → Pages → Connect to Git**.
3. Authorize Cloudflare to read your GitHub account, then pick the repository for this project.
4. Configure the build (same as [Cloudflare Pages build settings](#cloudflare-pages-build-settings-canonical) above):
   - **Project name:** `tomodachi-studio` (matches `wrangler.toml`)
   - **Production branch:** `main`
   - **Framework preset:** None (custom)
   - **Build command:** `pnpm install --frozen-lockfile && pnpm vite build`
   - **Build output directory:** `dist/public`
   - **Root directory:** `living-the-grid-studio` (required so installs and `vite build` run against `living-the-grid-studio/package.json` and `pnpm-lock.yaml`)
   - **Environment variables** (build-time): prefer [Doppler’s Cloudflare Pages integration](https://docs.doppler.com/docs/cloudflare-pages) so secrets sync from Doppler into Pages (**e.g.** `prd` → **Production** and `stg` → **Preview**, or `prod` / `preview` if you use those config names). Avoid duplicating secrets manually in the Pages UI once sync is on.
5. Click **Save and Deploy**. The first deploy will fail at the API but the SPA itself will come up at `<project>.pages.dev`.

## 2. Environment variables and secrets

Pages distinguishes between two scopes: **Production** and **Preview**. If [Doppler → Cloudflare Pages](https://docs.doppler.com/docs/cloudflare-pages) is connected (for example **`prd` → Production** and **`stg` → Preview**), manage values in Doppler instead of duplicating them here. Otherwise, set both scopes in the dashboard or with Wrangler as below.

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

### 4b. Email Routing for inbound email at tomodachi.pw

Cloudflare Email Routing is the free path for receiving mail at `help@tomodachi.pw`, `privacy@tomodachi.pw`, `legal@tomodachi.pw`, etc. It only handles inbound; for outbound you still need an SMTP provider later (Gmail "Send As", Workspace, Proton, etc.).

Prereq: `tomodachi.pw` must already be a Cloudflare zone (Pattern A above, or the domain added separately to Cloudflare DNS).

Per the [Email Routing get-started docs](https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/):

1. In the Cloudflare dashboard, go to **Email Routing** (the zone-level page for `tomodachi.pw`).
2. Review the records Cloudflare proposes. It will add three `MX` records pointing at `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net`, plus an SPF `TXT` record (`v=spf1 include:_spf.mx.cloudflare.net ~all`) and a DKIM `TXT` record under the `cf2024-1._domainkey` selector.
3. Select **Add records and enable**. If you already added MX records by hand for any other provider, Cloudflare will ask to delete them first; Email Routing will refuse to enable while conflicting MX records exist.
4. Under **Routing rules → Custom addresses → Create address**, add one custom address at a time:
   - `help@tomodachi.pw` → your real inbox
   - `privacy@tomodachi.pw` → your real inbox (referenced by `Privacy.tsx`)
   - `legal@tomodachi.pw` → your real inbox (referenced by `Terms.tsx`)
   - `support@tomodachi.pw` → your real inbox
   - `creator@tomodachi.pw` → your real inbox (used later for Brave Creator verification correspondence)
5. Cloudflare emails the destination address a verification link the first time you use it. Click it.
6. Verify the destination is **Verified** in the dashboard.

> One destination per custom address. If you need to forward `help@` to two humans, set up a Workers Email script later; the basic Routing UI is 1:1.

For outbound (sending FROM `help@tomodachi.pw`) you'll need to configure Gmail "Send As" with an app password, or move to a paid mailbox host. Email Routing alone does not let you send.

### 4c. DMARC policy

After Email Routing is live, add a DMARC `TXT` record at `_dmarc.tomodachi.pw` to lock down spoofing. A safe starting policy:

```
v=DMARC1; p=none; rua=mailto:postmaster@tomodachi.pw; ruf=mailto:postmaster@tomodachi.pw; pct=100; adkim=s; aspf=s
```

`p=none` is monitor-only. After a week of reports without seeing legit mail blocked, ratchet to `p=quarantine`, then `p=reject`.

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

## 7. Security insights: skip rules and AI crawlers

Cloudflare currently reports three relevant security suggestions for `tomodachi.pw`:

- Reduce skip rules for improved protection.
- Review and block AI bots from accessing your assets.
- Review unwanted AI crawlers with AI Labyrinth.

Repo-side policy lives in `client/public/robots.txt`. It allows social preview crawlers, allows normal search indexing, reserves AI model input/training with `Content-signal: search=yes, ai-input=no, ai-train=no`, and explicitly disallows known AI crawlers. The Pages middleware also avoids treating `Meta-ExternalAgent` and `Applebot` as normal preview/search crawlers.

Cloudflare dashboard settings are not stored in the repo. Use the helper script to audit and optionally apply the bot controls once you have a token with zone read/write permissions:

```bash
cd living-the-grid-studio
doppler run --project local-mac-work --config dev_personal -- pnpm cloudflare:security-insights
doppler run --project local-mac-work --config dev_personal -- pnpm cloudflare:security-insights --apply
```

Optional:

```bash
CLOUDFLARE_ZONE_NAME=tomodachi.pw
CLOUDFLARE_ZONE_ID=...
```

The script can discover the `tomodachi.pw` zone tag from the Cloudflare Pages custom-domain object when the token can read the Pages project. Applying the Security Insights fixes still requires a Cloudflare token with zone-level access to Bot Management settings and Rulesets/WAF read access.

Apply mode sets:

```json
{
  "ai_bots_protection": "block",
  "crawler_protection": "enabled",
  "is_robots_txt_managed": true,
  "cf_robots_variant": "policy_only"
}
```

That maps to **Block AI bots**, **AI Labyrinth**, and Cloudflare-managed `robots.txt` policy. The script also lists skip rules across the main security phases, but it does not delete them automatically. For each skip rule, confirm the owner/reason, narrow broad expressions to exact paths, methods, hosts, or trusted IPs, and avoid skipping Super Bot Fight Mode unless the source is known and necessary.

After applying the dashboard/API settings:

```bash
curl -s https://tomodachi.pw/robots.txt | sed -n '1,120p'
curl -I -A "GPTBot" https://tomodachi.pw/
curl -I -A "Meta-ExternalAgent" https://tomodachi.pw/
```

Expected: `robots.txt` includes Cloudflare's managed AI crawler block plus the origin-maintained policy, known AI crawlers are blocked/challenged/mitigated according to the active plan, and normal social preview crawlers still receive OpenGraph metadata.

## 8. Deploy verification checklist

After your first successful Cloudflare deploy:

1. `https://tomodachi-studio.pages.dev/` loads the SPA.
2. `https://tomodachi-studio.pages.dev/api/ai/status` returns JSON with `"configured": true`.
3. The homepage breach hub's "Run AI recovery plan" button gets a real response.
4. After custom domain attach, `https://tomodachi.pw/` works and has a valid TLS cert.
5. `curl -I https://tomodachi.pw/assets/<any-hashed-file>` shows the long-cache header.
6. `curl -I https://tomodachi.pw/index.html` shows `Cache-Control: no-cache`.
7. In Brave with Web3 resolution enabled, typing `tomodachi.brave` either redirects to `tomodachi.pw` (option 1) or loads the IPFS mirror (option 2).

## 9. Rollback

Cloudflare Pages keeps every deploy. To roll back: **Workers & Pages → tomodachi-studio → Deployments → ⋯ → Rollback to this deployment**. DNS does not change; only the active build pointer flips.

## 10. Pre-provisioned Cloudflare resources

These were created against account `d45bbb1a6d3f779af15c93a9f2603bc9` (`Davidinfosec07@gmail.com`):

| Resource           | ID                                       | Purpose                                                                                                |
|--------------------|------------------------------------------|--------------------------------------------------------------------------------------------------------|
| KV namespace       | `5129b5ce8d2d435cb704b398a437f355`        | `tomodachi-edge-cache`. Reserved for edge caching (OpenRouter models list, rate-limit counters, Brave Rewards verification token, etc.). |

The binding lives commented out in `wrangler.toml`. To activate:

1. Uncomment the `[[kv_namespaces]]` block in `wrangler.toml`.
2. In any Pages Function you can now read/write through `context.env.EDGE_CACHE`:

   ```ts
   export const onRequest = async (context) => {
     const cached = await context.env.EDGE_CACHE.get("openrouter:models");
     if (cached) return new Response(cached, { headers: { "Cache-Control": "no-store" } });
     const fresh = await fetch("https://openrouter.ai/api/v1/models");
     const body = await fresh.text();
     await context.env.EDGE_CACHE.put("openrouter:models", body, { expirationTtl: 3600 });
     return new Response(body);
   };
   ```

3. If the build runs but the binding is missing at runtime, also add a manual KV binding in the Pages dashboard under **Settings → Functions → KV namespace bindings**. The wrangler.toml binding takes effect on `wrangler pages deploy` from CI; the dashboard binding takes effect on Git-triggered builds. Set both for now.

> Free tier KV gives us 100k reads, 1k writes, and 1k deletes per day. Plenty for caching the OpenRouter models list and basic rate limiting; the moment we approach those limits the answer is Workers Cache API at the request layer, not more KV.

R2 (object storage, ideal for serving the paid recovery checklist PDF after Stripe verification) is gated behind a one-click **Enable R2** in the dashboard. Do that when you're ready to upload the first paid asset; this runbook gets a §10 R2 section the day you flip it on.
