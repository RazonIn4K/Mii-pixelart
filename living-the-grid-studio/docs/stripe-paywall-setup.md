# Payment setup retired

Status: retired on 2026-07-16.

Tomodachi no longer offers a paywall, checkout, tip jar, paid recovery
checklist, or consultation booking. Do not create or restore payment provider
keys, webhooks, products, prices, links, or client redirects from this document.

Historic payment API paths remain as provider-free `410 Gone` tombstones with
`Cache-Control: no-store` so old clients receive an explicit terminal response.
They must not call a payment provider or reveal content.

The current product direction is:

- a free AI action-plan beta;
- no checkout and no collection of payment details;
- a possible future one-time $5 creator plan that is not for sale.

Any future paid plan requires a new ADR, account-bound entitlements, refund and
fulfillment behavior, privacy and retention controls, usage limits, abuse
controls, provider review, end-to-end tests, and a separate production approval.

See `docs/adr/0005-retire-payments-and-scope-ai-plan.md`.
