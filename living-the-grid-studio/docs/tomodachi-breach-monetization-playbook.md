# Tomodachi Domains: Breach-Response + Monetization Playbook

## Positioning model

- `tomodachi.brave` should stay the hero creative domain.
  - Primary use: Living The Grid Studio, pixel-repaint utility, templates, AI-powered guides.
  - Monetize with:
    - Google/Brave-compatible display ads on non-critical paths.
    - Paid print-pack bundles (PNG/PDF exports, texture packs, model presets).
    - Affiliate tie-ins (hardware/software used by creators).
- `tomodachi.pw` should be the trust surface.
  - Primary use: breach-awareness support hub, privacy check utilities, incident recovery runbooks.
  - Monetize with:
    - Lead capture (newsletter + status alerts).
    - Sponsorship/affiliate links for security tools (password managers, VPNs, 2FA hardware).
    - Conversion to digital services (security cleanup checklists, one-off consultation).

## Breach page concept (already linked from your project)

Use the breach notice as an entry point:

1. Show a calm “you are not alone” header and immediate actions.
2. Offer browser tools that do not require sign-up:
   - Password breach lookup (k-anonymity approach).
   - AI-generated recovery plan from plain-language incident text.
   - Checklist for account recovery.
3. Offer ad-safe, high-trust UX: keep security and recovery content mostly free of ad noise.
4. Offer a short paid or lead-capture CTA at the end.

## What I changed in this repo

- Added trust-first blocks to `client/src/pages/Home.tsx`:
  - breach recovery section
  - browser-only password exposure check (HIBP-style prefix API flow)
  - AI assistant using existing `/api/ai/chat` endpoint
  - domain-specific monetization strategy cards
  - optional AdSense slots behind environment flags

## Environment keys needed for ads

Set these in your hosting provider or `.env`:

- `VITE_ADSENSE_PUBLISHER_ID` (for example `ca-pub-XXXXXXXXX`)
- `VITE_ADSENSE_HOMEPAGE_SLOT_ID` (for homepage ad unit)

If not set, the page shows a placeholder and does not inject ad scripts.

## Practical launch sequence

1. Connect the two domains in DNS to your Vercel/Netlify host.
2. Keep ad scripts and affiliate placements disabled during the first trust-validation sprint.
3. Push content for 10–14 days to establish baseline behavior and conversion intent.
4. Enable ad serving after conversion events and trust flow metrics are healthy.
5. Add newsletter and paid upgrade calls to the breach section only after you have a polished follow-up flow.
