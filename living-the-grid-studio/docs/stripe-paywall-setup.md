# Payments retired

**Status:** Retired on 2026-07-16. This filename remains as a stable link for
older operational notes; it is not a setup guide.

Tomodachi no longer sells recovery content, consultations, tips, or any other
offer through Stripe. The application must not create Checkout Sessions,
verify payment sessions, expose a product catalog, or process payment
webhooks.

The legacy compatibility paths remain temporarily so an old browser, bookmark,
or provider retry cannot fall through to the SPA and appear successful:

- `/api/stripe/*`
- `/api/webhooks/stripe`

Requests that reach those retired handlers return a provider-free `410 Gone`
JSON response with `Cache-Control: no-store`. The Worker's Origin and JSON
controls can reject an unsafe request earlier; those responses also fail closed
without contacting a provider. No Stripe credential, SDK, network call, KV
event receipt, or payment state is required. Remove the tombstones only after
traffic confirms that stale clients and provider retries have ended.

## Provider shutdown checklist

Provider-side work is a separate, audited operation. It must not expose secret
values in source, logs, tickets, or terminal history.

1. Verify whether any historical purchase needs fulfillment, refund, or record
   retention before disabling the integration.
2. Deactivate Tomodachi Payment Links and expire practical open Checkout
   Sessions.
3. Disable Tomodachi webhook endpoints after the code returning `410` is live.
4. Remove `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
   `VITE_STRIPE_DONATION_LINK` from Tomodachi Doppler, Pages, and Worker
   configuration.
5. Revoke a credential only when it is exclusive to Tomodachi. If it is shared,
   first inventory and migrate every remaining consumer.
6. Verify the public pages contain no buy, checkout, tip, consultation, or
   payment-link control and that legacy API probes return `410` without an
   upstream request.

Historical release evidence and the original ADR remain historical records.
Do not rewrite them to imply that payments never existed. The current decision
is recorded in `docs/adr/0005-retire-payments-and-scope-ai-plan.md`.

## AI Action Plan product boundary

`/ai-plan` is a free beta today. It gives bounded, non-authoritative next-step
guidance and must continue to disclose its AI and privacy limitations.

A one-time **$5 Creator Action Plan** is product direction only and is **not for
sale**. Before it can accept money, a separate approval must add and verify:

- an ADR, threat-model and API-contract update;
- account-bound entitlements and an authoritative payment ledger;
- clear fulfillment, regeneration/usage limits, export, refund, cancellation,
  and revocation behavior;
- privacy, retention, tax, merchant, support, and legal copy;
- provider-isolated secrets and rate limits; and
- complete test-mode authorization, fulfillment, refund, webhook replay, and
  production rollback acceptance.

Do not reactivate the retired routes or reuse session-ID-gated access for that
future feature.
