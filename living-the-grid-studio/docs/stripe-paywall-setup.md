# Stripe paywall setup

This guide covers wiring up the `/unlock` paywall page to a real Stripe account.

## 1. Required environment variables

Set these as secrets or environment values on each Cloudflare Worker environment:

| Variable                | Type   | Notes                                                                                    |
|-------------------------|--------|------------------------------------------------------------------------------------------|
| `STRIPE_SECRET_KEY`     | Secret | `sk_test_…` outside production, `sk_live_…` in Production.                               |
| `STRIPE_WEBHOOK_SECRET` | Secret | Required when Stripe sends events to `/api/webhooks/stripe`; the route returns 503 if it is absent. |
| `PUBLIC_SITE_URL`       | Plain  | Used to build Stripe `success_url` / `cancel_url`. `https://tomodachi.pw` in production. |

Locally:

```bash
cp .dev.vars.example .dev.vars
# Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the untracked .dev.vars.
pnpm dev
```

## 2. How the flow works

1. `/unlock` calls `GET /api/stripe/products` on mount and renders one card per item from `shared/products.ts`.
2. The "Buy" button POSTs `{ productId, customerEmail }` to `/api/stripe/checkout`. The endpoint creates a Stripe Checkout Session via the REST API and returns `{ url }`.
3. The browser redirects to Stripe-hosted checkout.
4. After payment Stripe redirects to `<PUBLIC_SITE_URL>/unlock?product=…&session_id={CHECKOUT_SESSION_ID}` (success) or `<PUBLIC_SITE_URL>/unlock?canceled=1` (cancel).
5. On return, the page calls `GET /api/stripe/session?session_id=…` to confirm `payment_status === "paid"` and reveals the gated content.

This is intentionally session-id gated rather than user-account gated. Checkout
does not require a login, which keeps the path to unlocked content short during
breach-spike traffic.

## 3. Production hardening

Before promoting from test to live:

- Approve a complete, mail-ready public service address (city, state, ZIP code,
  and country) or a safer PO box/registered-agent address before launch. The
  legal pages contain no template tokens, but they intentionally do not publish
  an incomplete residential address.
- Decide on a fulfillment plan for `consult-30`. The Unlock page tells buyers they will receive a Google Meet link within one business day; the workflow needs to actually deliver that. The simplest pattern is to enable Stripe's "Receipt email" template with a Calendly link in the body.
- Configure Stripe to send the events you need to `POST /api/webhooks/stripe`.
  The unified Worker already verifies the signature and five-minute timestamp
  window, rejects bodies over 1 MB, and deduplicates event IDs in `EDGE_CACHE`
  for 24 hours. It currently logs the event ID and type, then acknowledges the
  delivery; it does not sync orders or fulfill products. Add and test idempotent
  fulfillment before relying on the webhook for delivery.
- Enable Stripe's tax calculator in Production. The Worker already passes
  `automatic_tax: { enabled: true }` to Checkout; you must also register the
  relevant tax jurisdictions in the Stripe dashboard.
- If you sell internationally, enable `customer_creation: "always"` so each purchase is associated with a Stripe Customer record for future tax filing.
- Test the "canceled" branch end-to-end. Many users abort checkout at the email field; make sure the cancel CTA is visible.

## 4. Adding a new product

1. Append an entry to `PAID_PRODUCTS` in `shared/products.ts`.
2. If the new product needs a unique unlocked-content block, add a new `unlockedProductId === "your-id"` branch in `client/src/pages/Unlock.tsx`.
3. Smoke-test in Stripe test mode using card `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.

## 5. Refunds and disputes

Refunds are issued from the Stripe dashboard. The /unlock page does not auto-revoke access; that is intentional. If you want to revoke access after refund, plumb webhook events into a small KV-backed allow-list at the edge.
