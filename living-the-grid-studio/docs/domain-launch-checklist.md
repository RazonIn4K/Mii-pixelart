# Tomodachi Domain Launch Checklist

Updated: 2026-05-14
Repo: RazonIn4K/Mii-pixelart
Baseline commit verified: 4c2c90ca7a420c1997180c47126ed43f2fab9ad1

## Purpose

This checklist turns `tomodachi.brave` and `tomodachi.pw` into a launchable two-domain setup for the Living The Grid Studio project.

## Domain roles

### tomodachi.pw

Use this as the canonical public site.

Recommended routes:

- `/` - main landing page.
- `/studio` - Living The Grid Studio.
- `/help` - trust and account-safety guidance.
- `/guides` - SEO articles and creator tutorials.
- `/ai-plan` - free AI action-plan beta and future product direction.
- `/privacy` - privacy policy.
- `/affiliate-disclosure` - affiliate and sponsored content disclosure.

Operational note: prior account context says `tomodachi.pw` contact verification is pending at Unstoppable Domains and should be verified before 2026-05-30.

### tomodachi.brave

Use this as the memorable Brave-native and creator-facing brand.

Recommended uses:

- Point to the studio.
- Use as a novelty link in Brave and Web3 communities.
- Keep `tomodachi.pw` as the canonical URL for normal search, ads, email capture, and broader browser compatibility.

## Hosting setup

### Vercel

1. Import or select `RazonIn4K/Mii-pixelart`.
2. Set root directory to `living-the-grid-studio`.
3. Build command: `pnpm build`.
4. Output directory: confirm in the project settings after the build. For this app, start by checking `dist/public`.
5. Add `tomodachi.pw` and `www.tomodachi.pw` under Project Settings, then Domains.
6. Use the exact DNS records Vercel displays.
7. Add public env vars only when ready:
   - `VITE_ADSENSE_PUBLISHER_ID`
   - `VITE_ADSENSE_HOMEPAGE_SLOT_ID`

### Netlify

1. Create or select a Netlify project from the same repo.
2. Base directory: `living-the-grid-studio`.
3. Build command: `pnpm build`.
4. Publish directory: confirm after the first build. Start by checking `dist/public`.
5. Add custom domains in Netlify domain settings.
6. Use the exact DNS records Netlify displays.

## Product ladder

Keep the current product free and trust-first:

1. Free studio usage and free guides.
2. Free AI action-plan beta with explicit consent and reviewable output.
3. Free exports, guides, templates, and community discovery.
4. Explore one account-bound, one-time $5 creator plan only after entitlement,
   refund, privacy, usage-limit, and fulfillment requirements are approved and
   tested end to end.

Tomodachi currently accepts no payments and offers no checkout or consultation
booking. Do not publish a paid offer until a new ADR and launch gate explicitly
approve the provider and complete fulfillment path.

## Disclosure copy

### Footer

> Unofficial fan utility. Not affiliated with Nintendo, TomodachiShare, Brave, or Unstoppable Domains. No official game assets are bundled.

### Affiliate disclosure

> Some links may be affiliate links. I may earn a commission if you purchase through them, at no extra cost to you.

### Privacy policy opening

> This site is designed to minimize data collection. The studio is browser-first. Optional features may contact third-party services such as ad providers, analytics providers, AI providers, or public lookup APIs.

## Repo follow-up issues

1. Add `/privacy` route.
2. Add `/affiliate-disclosure` route.
3. Move the current trust section into a dedicated `/help` route.
4. Add `robots.txt` and `sitemap.xml` after the canonical domain is chosen.
5. Add `ads.txt` after ad approval.
6. Add privacy-safe analytics events for:
   - `studio_opened`
   - `guide_viewed`
   - `pack_download_clicked`
   - `affiliate_card_clicked`
7. Keep analytics event payloads generic and non-personal.

## Source links for future reference

- Brave `.brave` announcement: https://brave.com/blog/brave-tld/
- Google Publisher Policies: https://support.google.com/adsense/answer/10502938
- FTC disclosure guidance: https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers
- Vercel custom domain docs: https://vercel.com/docs/domains/working-with-domains/add-a-domain
