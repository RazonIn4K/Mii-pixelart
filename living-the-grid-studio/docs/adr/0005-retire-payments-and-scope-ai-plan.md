# ADR 0005: Retire payments and scope a future AI creator plan

- Status: Accepted
- Date: 2026-07-16

## Context

Tomodachi exposed a Stripe-backed recovery checklist, tip products, and a
consultation product. The return page was the only access check; there was no
account-bound purchase ledger, entitlement, refund/revocation workflow, or
authoritative AI-use allowance. The webhook acknowledged events but did not
fulfill an account product. The operator no longer intends to sell the historic
products or consultations.

Tomodachi already provides useful AI experiences without payment: recovery
next steps on the home page and design advice inside Studio. Charging $5 for
the same generic output would duplicate the free product and create an
entitlement claim the current data model cannot enforce.

## Decision

1. Retire all checkout, session-verification, product-catalog, tip,
   consultation, and payment-webhook behavior.
2. Keep provider-free `410 Gone` tombstones at historic payment paths so old
   clients cannot fall through to a misleading SPA response.
3. Remove Stripe secrets, provider CSP origins, payment UI, paid structured
   data, and public purchase claims.
4. Keep `/support` as a non-payment page for testing and issue reports.
5. Replace `/unlock` with the canonical `/ai-plan` experience. The current AI
   action plan is a free beta. A possible one-time $5 expanded creator plan may
   be described only as product direction and has no buy or waitlist action.
6. Preserve historical changelog entries as audit history.

## Future paid-plan gate

A paid creator plan requires a new ADR and account-bound entitlement/payment
ledger, idempotent fulfillment, authoritative usage and cost limits,
refund/revocation behavior, privacy and retention updates, provider-failure
handling, and complete staging acceptance. It must add a distinct deliverable
such as saved milestones, canvas-aware analysis, a bounded regeneration, and
export. Existing recovery help and Studio advice remain free.

## Consequences

- Visitors cannot buy an outdated product or unsupported consultation.
- Payment-specific attack surface and third-party CSP permissions are removed.
- Monetization is deferred until Tomodachi can fulfill and enforce what it
  sells.
