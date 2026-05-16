# Tomodachi · Mii Studio &amp; Recovery Guides

Browser-first Mii pixel-art studio paired with practical breach-recovery guides
for Tomodachi Life players. Sketch, critique, and ship custom Mii face masks
square-by-square, or pick up a free recovery checklist after the Tomodachishare
incident.

**Live:** [https://tomodachi.pw/](https://tomodachi.pw/)
**Live (Web3 mirror):** [https://tomodachi.brave](https://tomodachi.brave) (redirects via IPFS)

![Tomodachi · Mii Studio &amp; Recovery Guides](https://tomodachi.pw/og-image.png)

## What it does

- **Studio** ([/studio](https://tomodachi.pw/studio)) — Import a face photo,
  character art, logo, or JSON file and turn it into a paint-by-numbers Mii
  face mask. Uses the full 84-color Tomodachi Life: Living the Dream palette,
  labeled by row and column for exact in-game matching.
- **Recovery hub** ([home page](https://tomodachi.pw/)) — Free browser-only
  password breach check (k-anonymity HIBP lookup, full password never leaves
  the page) plus an OpenRouter-backed AI recovery assistant.
- **Guides** ([/guides](https://tomodachi.pw/guides)) — Long-form articles on
  Mii creation, gameplay basics (apartments / food / jobs / marriage),
  post-Tomodachishare breach recovery, and QR codes + save backup.
- **Paywall** ([/unlock](https://tomodachi.pw/unlock)) — Optional $9 printable
  recovery checklist and $49 30-minute consult, via Stripe Checkout.
- **Tip jar** ([/support](https://tomodachi.pw/support)) — Optional $5 / $15 /
  $25 tips via Stripe.

## Tech stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Routing:** wouter
- **Edge runtime:** Cloudflare Pages Functions (TypeScript)
- **Edge cache:** Cloudflare KV (1-hour TTL for the OpenRouter model list)
- **Payments:** Stripe Checkout + webhook with HMAC-SHA256 signature verification
- **AI:** OpenRouter (Claude Haiku Latest by default)
- **Secrets:** Doppler → Cloudflare Pages integration

## Quick start

```bash
pnpm install
pnpm dev
```

The Vite dev server runs at `http://localhost:5173` with Express middleware
proxying `/api/*` to the same code that ships to Cloudflare Pages Functions.

To run the Cloudflare Pages Functions locally:

```bash
pnpm wrangler pages dev dist/public --compatibility-date=2025-05-01
```

Required environment variables (set in `.env.local` for dev, in
Cloudflare Pages → Settings for prod):

- `OPENROUTER_API_KEY` — for the AI recovery assistant
- `STRIPE_SECRET_KEY` — for paywall + tip-jar checkout
- `STRIPE_WEBHOOK_SECRET` — for verifying webhook signatures
- `PUBLIC_SITE_URL` — defaults to `https://tomodachi.pw`
- `VITE_ADSENSE_PUBLISHER_ID`, `VITE_ADSENSE_HOMEPAGE_SLOT_ID` — optional, AdSense

## Project structure

```
client/                Vite + React SPA
  src/
    pages/             Route components (Home, Studio, Unlock, Guides, etc.)
    components/        Reusable UI (CookieConsent, ErrorBoundary, etc.)
      ui/              shadcn/ui primitives
    hooks/             useGridDocument and friends
    lib/               consent storage, palette helpers
  public/              Static assets (sitemap.xml, og-image.png, robots.txt, _headers)
functions/             Cloudflare Pages Functions
  api/
    ai/[[path]].ts     OpenRouter chat + model list (KV-cached)
    stripe/[[path]].ts Checkout + session verification + products
    webhooks/stripe.ts Stripe webhook with HMAC verification
server/                Shared TS modules imported by Functions + dev middleware
shared/                Types shared between client + functions
```

## Support &amp; sponsorship

If the studio or the guides have helped, you can:

- Drop a one-time tip on [/support](https://tomodachi.pw/support) ($5 / $15 / $25)
- Pick up a paid recovery checklist or 30-min consult on
  [/unlock](https://tomodachi.pw/unlock)
- Watch this repo for `Sponsor` button activation once GitHub Sponsors approves
  the account

## License

See [LICENSE](./LICENSE).

## Contributing

PRs welcome — start a draft and open it; small focused changes get reviewed
faster than large refactors. The codebase is intentionally small and readable;
the design philosophy (Paper Studio · Japanese stationery minimalism, off-white
paper surface, graphite text, pale blue grid accents, warm red as the sole
accent color) is documented inline in `client/src/index.css`.
