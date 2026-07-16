# Guides, support, and AI Action Plan roadmap

**Status:** Current product boundary as of 2026-07-16.

```text
Homepage
   |-- /guides   -> free tools and learning paths
   |-- /ai-plan  -> free AI Action Plan beta
   |-- /support  -> testing, sharing, issue reporting, and email feedback
   `-- /unlock   -> redirect to /ai-plan (legacy bookmark compatibility)
```

## Current public surfaces

### `/guides`

Guide cards connect people to existing free Studio, recovery, safety, and
community workflows. They must not contain paid upgrades or checkout calls.

### `/ai-plan`

The AI Action Plan is a free beta. It can turn the visitor's stated goal and
current context into suggested next steps, but it is not professional, legal,
medical, financial, or game-authoritative advice. The UI should explain what is
sent to the AI provider and discourage sensitive information.

The planned one-time **$5 Creator Action Plan** is not for sale. Its intended
value is a saved, canvas-aware plan with milestones, bounded regeneration, and
export. It must not ship as a renamed checkout link. Product, entitlement,
payment, refund, privacy, tax, usage-limit, and fulfillment work listed in
`stripe-paywall-setup.md` must pass a separate future gate first.

### `/support`

Support is non-monetary. It asks visitors to test the Studio, share public
creations, report reproducible issues, or send feedback through the published
help channel. `/donate` redirects here for legacy bookmark compatibility. The
page must not present tips, donations, Payment Links, or consultations.

## Implementation contract

| Surface | Current behavior |
| --- | --- |
| `client/src/pages/AiPlan.tsx` | Free beta explanation and links to available free tools |
| `client/src/pages/Support.tsx` | Non-payment contribution and contact paths |
| `/unlock` | Redirects to `/ai-plan` |
| `/donate` | Redirects to `/support` |
| `/api/stripe/*` | Provider-free `410 Gone` tombstone |
| `/api/webhooks/stripe` | Provider-free `410 Gone` tombstone |

The client build has no payment-link environment variable. The Worker has six
required secrets and six rate-limit bindings; neither set includes a payment
provider.

## Acceptance

- No public page renders a buy, checkout, pay, tip, donation, or consultation
  control.
- Loading `/ai-plan`, `/guides`, `/support`, `/unlock`, or `/donate` makes no
  request to a payment provider or retired payment API.
- Legacy payment API paths return `410`, JSON, and `Cache-Control: no-store`.
- AI guidance remains usable without payment and is covered by consent,
  redaction, rate-limit, failure, and accessibility tests.
- Crawler documents use canonical `/ai-plan` and `/support` URLs and contain no
  Product, Offer, price, or availability schema.
- Historical evidence stays unchanged and is clearly separated from current
  operational instructions.

## Deferred work

Do not add subscriptions, a waitlist that implies an offer is purchasable, or
autonomous AI moderation as part of this roadmap. Revisit a paid creator plan
only after real use of the free beta demonstrates a need and the separate
product/security gate is approved.
