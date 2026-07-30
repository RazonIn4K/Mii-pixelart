# Payment retirement completion record

**Date:** 2026-07-16 (America/Chicago)

**Scope:** Tomodachi payment-provider containment, application retirement
deployments, secret-name cleanup, and documentation. No secret value, customer
email, payment method, session token, OAuth identifier, or private project data
is recorded here.

## Provider inventory and containment

The Stripe account is shared with other projects. The retirement therefore
targeted only objects whose metadata, name, or endpoint URL identified
Tomodachi; unrelated Payment Links, products, credentials, transactions, and
webhooks were not changed.

- Live Payment Link `plink_1TXD...K4e`, labeled `Tomodachi.pw Support Tip` and
  tagged `source=tomodachi.pw`, had two historical Checkout Sessions. Both
  were expired and unpaid; there were no completed purchases or open sessions
  requiring fulfillment or expiration. The link is now deactivated.
- Production webhook `we_1TXG...Zaw`, whose URL was exactly
  `https://tomodachi.pw/api/webhooks/stripe`, is disabled.
- Test-mode staging webhook `we_1Tsq...xjC`, whose URL was exactly
  `https://staging.tomodachi.pw/api/webhooks/stripe`, is disabled.
- Test mode contained no Payment Link identified as Tomodachi.
- A read-only Stripe CLI credential could inventory the objects but correctly
  refused live mutations. The signed-in dashboard performed the two live-mode
  changes; the Stripe API then independently reported `active=false` for the
  link and `status=disabled` for the production webhook. The staging update
  succeeded through the test-mode API and returned `status=disabled`.

No provider credential was revoked. The available Stripe credential belongs to
the shared account and was not proven exclusive to Tomodachi.

## Secret and binding cleanup

- Removed `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
  `VITE_STRIPE_DONATION_LINK` where present from the `dev`, `stg`, and `prd`
  configs in the `tomodachi-platform` Doppler project. A names-only follow-up
  found none of those names and no `CONSULT_SALES_ENABLED` value.
- Removed `VITE_STRIPE_DONATION_LINK` from the production `mii-pixelart`
  Cloudflare Pages project. A names-only follow-up found no Stripe secret.
- Removed `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from the
  `tomodachi-studio-staging` Worker. A names-only follow-up found no Stripe
  secret.
- A separate `tomodachi-studio-production` Worker does not yet exist; the live
  site remains the Pages deployment until the approved production cutover.

## Application retirement release

The released source removes checkout, session verification, product catalog,
tip, consultation, webhook, redirect-allowlist, and product-definition code.
It removes payment bindings and CSP origins, updates the deployment contract to
six secrets and six rate-limit bindings, and replaces the paid surfaces with:

- `/ai-plan`: free AI action-plan beta plus a clearly gated possible one-time
  $5 Creator Action Plan that is not for sale;
- `/support`: non-payment testing, sharing, issue-reporting, and feedback;
- `/unlock` and `/donate`: legacy aliases to the new canonical surfaces; and
- `/api/stripe/*` plus `/api/webhooks/stripe`: temporary provider-free
  `410 Gone`/`no-store` tombstones so stale clients never receive the SPA.

### Production Pages release

- GitHub PR #9 was squash-merged into `main` as
  `c044134ec4ecd33e0ab00437e1a6e9283bd9ae91`; the GitHub and GitLab `main`
  refs were verified at that exact commit.
- Cloudflare Pages production deployment
  `b73cc5ba-c91f-4896-90e5-b7f22d4af80b` serves that source at
  `https://b73cc5ba.mii-pixelart.pages.dev` and on `tomodachi.pw`.
- Hosted acceptance verified the homepage and AI status endpoint, the
  canonical `/ai-plan` and `/support` surfaces, legacy aliases, payment
  tombstones, payment-free crawler documents, and a CSP without Stripe
  origins. The live JavaScript bundle contains no provider checkout host,
  payment helper, or paid-consultation offer.

### Staging Worker release

- Staging was deployed from exact community commit
  `80fdcd5da432b88d06d84bfd084e9f0993edc363` as deployment
  `9803bbba-4ee5-45fc-9027-7afd4e902089`, Worker version
  `c56f580f-2238-4775-846d-3d2c08f17c78` (version 19), at 100% traffic.
- The release kept community mutations enabled and did not alter migrations,
  D1 data, roles, OAuth settings, secrets, DNS, or production resources.
- Read-only hosted acceptance verified `noindex,nofollow`, crawler blocking,
  empty staging sitemaps, AI availability, canonical aliases, and a CSP with
  no Stripe origin. Same-origin requests reaching each retired payment handler
  returned provider-free `410 Gone`, `Cache-Control: no-store`, and
  `error.code=payments_retired`. Unsafe mutations can be rejected earlier by
  the Worker's Origin/JSON guard; those responses remain `no-store` and
  provider-free.

The first edge response during propagation briefly exposed the prior CSP. All
fresh root, index, page, crawler, and API probes after the new version reached
100% traffic returned the release CSP without Stripe origins.

## Future $5 plan boundary

A paid Creator Action Plan requires a new approved ADR, threat-model and API
contract update, account-bound entitlement and payment ledger, idempotent
fulfillment, bounded AI usage, refund and revocation behavior, privacy and
retention rules, tax and merchant review, and full test-mode and production
acceptance. Existing recovery help and Studio AI advice remain free.
