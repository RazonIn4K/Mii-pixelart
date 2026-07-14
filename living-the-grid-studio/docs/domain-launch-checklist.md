# Tomodachi Domain Launch Checklist

Updated: 2026-07-13
Repo: RazonIn4K/Mii-pixelart
Release evidence: record the exact reviewed commit and immutable deployment URL
at each approved gate; do not reuse this checklist as proof for a later commit.

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
- `/packs` - paid or email-gated template packs.
- `/privacy` - privacy policy.
- `/affiliate-disclosure` - affiliate and sponsored content disclosure.

Operational note: `tomodachi.pw` currently resolves to the existing Cloudflare
Pages production app. The target Worker cutover is governed by
`community-deployment-runbook.md`; do not change registrar or DNS records merely
to make an undeployed branch visible.

### tomodachi.brave

Use this as the memorable Brave-native and creator-facing brand.

Recommended uses:

- Point to the studio.
- Use as a novelty link in Brave and Web3 communities.
- Keep `tomodachi.pw` as the canonical URL for normal search, ads, email capture, and broader browser compatibility.

## Hosting setup

1. Keep the existing Cloudflare Pages project `mii-pixelart` intact as the
   production runtime and rollback surface until the approved Worker soak ends.
2. Build and validate the unified Worker from `living-the-grid-studio/` with the
   target-explicit commands in `community-deployment-runbook.md`.
3. Deploy `staging.tomodachi.pw` only after its separate resource, secret,
   migration, and deployment approvals are complete.
4. Attach `tomodachi.pw` to the production Worker only after staging acceptance
   and explicit cutover approval. The Worker configuration permits no public
   `workers.dev` or version-preview origin.
5. Do not add Vercel, Netlify, GitLab Pages, or a second production host. GitHub
   remains canonical, GitLab remains a private security mirror, and Cloudflare
   remains the only runtime platform.

## Monetization ladder

Start low-friction and trust-first:

1. Free studio usage and free guides.
2. Display ads on guide pages and secondary creator pages.
3. Affiliate links for creator tools and account-safety tools.
4. Email capture for new template drops and status updates.
5. Paid downloadable packs at $5 to $9.
6. Premium creator workflow bundles at $19 to $49.
7. Optional consult calls at $49 to $149 once the site has traffic.

Do not overload the trust pages with ads. Put heavier monetization on guides, packs, and creative workflow pages.

## Disclosure copy

### Footer

> Unofficial fan utility. Not affiliated with Nintendo, TomodachiShare, Brave, or Unstoppable Domains. No official game assets are bundled.

### Affiliate disclosure

> Some links may be affiliate links. I may earn a commission if you purchase through them, at no extra cost to you.

### Privacy policy opening

> This site is designed to minimize data collection. The studio is browser-first. Optional features may contact third-party services such as ad providers, analytics providers, AI providers, or public lookup APIs.

## Launch follow-up gates

1. Staging resources, the eight-secret bootstrap, migrations `0001` through
   `0006`, and the read-only Worker are complete. Redeploy the exact reviewed
   head and run the authenticated writable acceptance suite under its separate
   approvals.
2. The complete public service address is approved and published, and David
   Ortiz confirmed ownership of the legal, privacy, security, help, abuse, and
   consult channels. Verify live delivery and escalation for each channel.
3. Google staging consent branding and the isolated Stripe test key/webhook are
   complete. Run the real staging Google sign-in and signed Stripe acceptance
   probes without altering production.
4. Capture the mandatory real Chrome performance trace; fallback Lighthouse
   measurements are diagnostic evidence, not the launch gate.
5. Add `ads.txt` only after ad approval.
6. Keep privacy-safe analytics event payloads generic and non-personal for:
   - `studio_opened`
   - `guide_viewed`
   - `pack_download_clicked`
   - `affiliate_card_clicked`

## Source links for future reference

- Brave `.brave` announcement: https://brave.com/blog/brave-tld/
- Google Publisher Policies: https://support.google.com/adsense/answer/10502938
- FTC disclosure guidance: https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers
- Cloudflare Worker custom domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Cloudflare Pages-to-Workers migration: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
