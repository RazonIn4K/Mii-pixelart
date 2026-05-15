# Guides + Support funnel roadmap

This pass adds the content-and-trust layer that turns free traffic into recurring revenue without depending on a single product.

## The funnel

```
breach notice traffic ──┐
brave / web3 referrals ─┼──► /  ──► /guides ──► free tool (/, /studio, /help)
seo / search ───────────┘                                │
                                                         ├──► /unlock   (recovery checklist, consult)
                                                         └──► /support  (tip jar, Brave/BAT)
```

Three product surfaces. Each one has a single job.

### / and /help — first contact and free value

Already in place. Browser password check, AI recovery generator, breach hub copy. The job is "earn 30 seconds of trust without asking for anything."

### /guides — soft conversion

New in this pass. Lists four guides as cards, each pointing at the existing free tool or paid product that helps the reader actually do the thing. Every card is structured: who it's for, three concrete free actions, then the paid upgrade option if relevant.

The cards intentionally avoid being full long-form articles right now. The content lives in the linked destinations (`/`, `/studio`, `/help`, `/unlock`). When traffic justifies it, lift each card into its own `/guides/[slug]` route.

### /unlock — paid digital products and consults

Already in place. Now filters out `category === "support"` so tip jars don't dilute the conversion path. Sells the $9 recovery checklist and the $49 30-min consult.

### /support — tip jar

New in this pass. Three Stripe-managed fixed tip amounts ($5, $15, $25) plus an optional custom-amount Stripe Payment Link gated on `VITE_STRIPE_DONATION_LINK`. Wording is intentionally "support" not "donate" because the project is not a registered nonprofit.

Includes a Brave Rewards section that's just messaging today. Once `tomodachi.pw` is verified as a Brave Creator, Brave users can tip in BAT from the address-bar Rewards icon with no extra code.

## Why split tips and gated content

Mixing tip-jar payments into the gated-content paywall page hurts both flows. Visitors looking for the paid checklist get distracted by the cheaper tips and pick the lower-value option. Visitors who arrived to support the project get nudged into buying gated content they didn't want.

Stripe Checkout sessions on tip products use `category: "support"` and a `successPath` that lands on `/support?thanks=1&support=…`. Stripe Checkout sessions on gated products keep `category: "recovery" | "consult"` and land on `/unlock?product=…`. The `cancelPath` field on each product is honored by `server/stripe.ts` so canceling out of a tip returns to `/support`, not `/unlock`.

## Wiring summary

| File                                         | Change                                                                  |
|---------------------------------------------|-------------------------------------------------------------------------|
| `shared/products.ts`                         | Added `category` + `cancelPath`. Added 3 support-jar products.          |
| `server/stripe.ts`                           | Respects `product.cancelPath`; exposes `category` in API responses.     |
| `server/index.ts` + `vite.config.ts`         | `/api/stripe/products` accepts `?category=` filter.                     |
| `functions/api/stripe/[[path]].ts`           | Same `?category=` filter at the edge.                                   |
| `client/src/pages/Guides.tsx`                | New: free guide index with 4 cards.                                     |
| `client/src/pages/Support.tsx`               | New: tip jar (Stripe + custom-amount link + Brave Rewards messaging).   |
| `client/src/pages/Unlock.tsx`                | Filters out `support` category so only gated products show.             |
| `client/src/App.tsx`                         | Routes `/guides`, `/support`, `/donate` (alias).                        |
| `client/src/pages/Home.tsx`                  | Footer nav links to Guides, Unlock, Support.                            |

## Environment variables for this pass

| Variable                       | Scope               | Notes                                                                          |
|--------------------------------|---------------------|--------------------------------------------------------------------------------|
| `VITE_STRIPE_DONATION_LINK`    | Build-time (Vite)   | Optional. URL of a Stripe Payment Link with custom-amount enabled.             |

No new server-side secrets. Tips use the same `STRIPE_SECRET_KEY` as gated products.

## Operator checklist before going live

1. Generate a Stripe Payment Link in the Stripe dashboard with **Customer chooses what to pay** enabled. Set the success URL to `https://tomodachi.pw/support?thanks=1&source=custom`. Paste the URL into `VITE_STRIPE_DONATION_LINK` in Cloudflare Pages.
2. Apply for Brave Creator verification at <https://publishers.basicattentiontoken.org/> using `tomodachi.pw` as the property. Upload the verification token to `client/public/.well-known/brave-rewards-verification.txt` (Brave will tell you the exact filename) and redeploy.
3. Once Brave verification clears, optionally publish ETH / SOL / BTC receive addresses for `tomodachi.brave` in Unstoppable Domains, then update the messaging block in `Support.tsx` to list them.
4. Decide on email handling for tip thank-yous. Cloudflare Email Routing on `help@tomodachi.pw` is enough for replies; Stripe sends receipts automatically.

## What this pass deliberately does NOT do

- **No subscriptions.** Recurring revenue is post-product-market-fit. Wait until the one-off tip jar + paid checklist conversion data tells us subscribers will actually stick.
- **No nonprofit framing.** Without a 501(c)(3) (or local equivalent) tips are not deductible donations.
- **No long-form guide content.** The four guide cards point at the free tools and paid products that already exist. Adding long-form content is a separate pass once traffic supports it.
- **No crypto wallet addresses in the UI yet.** The messaging tells visitors they're coming once configured. Listing wallet addresses before they're verified would be a footgun.

## Next passes after this one

1. Hook Cloudflare Email Routing for `help@`, `privacy@`, `legal@`, `support@`, `creator@`.
2. Apply for Brave Creator verification with `tomodachi.pw`.
3. Add a newsletter signup block on `/guides` and the breach hub, gated on consent.
4. Lift the four guide cards into real long-form `/guides/[slug]` pages once the funnel proves out.
5. Add affiliate placements (Bitwarden, Proton, YubiKey, SimpleLogin) into the relevant guides.

## Live Stripe resources (provisioned via MCP)

These were created against the live Stripe account `acct_1RTxsnP5UmVB5UbV` (David Ortiz). Treat these IDs as the source of truth; do not regenerate without archiving them in the dashboard first.

| Resource         | ID / URL                                                                                                                       | Notes                                                                                          |
|------------------|--------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| Product          | `prod_UWFmeWnaVGu6Tw`                                                                                                          | "Tomodachi.pw Support Tip" — used for the custom-amount tip Payment Link.                      |
| Price            | `price_1TXDHMP5UmVB5UbV6pOPgiBC`                                                                                                | `custom_unit_amount` enabled. Preset $10, min $1, max $500.                                    |
| Payment Link     | <https://buy.stripe.com/bJe00laUWaRs9CK0F04ZG17>                                                                                | After completion, redirects to `https://tomodachi.pw/support?thanks=1&source=custom-amount`.   |

To wire it into the UI, set `VITE_STRIPE_DONATION_LINK=https://buy.stripe.com/bJe00laUWaRs9CK0F04ZG17` in Cloudflare Pages (Production), then redeploy. The `Support.tsx` page reads this at build time and shows the "Custom amount" card only when present.

The fixed tip tiers ($5 / $15 / $25) are NOT separate Payment Links; they flow through the existing `/api/stripe/checkout` endpoint using the products in `shared/products.ts`, which creates a fresh Stripe Checkout Session per click. That keeps the support catalog inside the repo and avoids dashboard-side state drift.
