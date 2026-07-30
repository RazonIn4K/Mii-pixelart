# ADR 0005: Retire payments and scope a future AI creator plan

- Status: Accepted
- Date: 2026-07-16
- Supersedes: the payment-parity portion of ADR 0001

## Context

Tomodachi exposed a Stripe-backed recovery checklist, tip products, and a
disabled consultation product. The checkout-session return page was the only
access check; the application had no account-bound purchase ledger,
entitlement, refund/revocation workflow, or authoritative AI-use allowance.
The webhook verified and acknowledged events but did not fulfill an account
product. The operator no longer intends to sell consultations or the historic
products.

Tomodachi already provides two useful AI experiences without payment: recovery
next steps on the home page and design advice inside Studio. Charging $5 for the
same generic output would duplicate the free product and create an entitlement
claim the current data model cannot enforce.

## Decision

1. Retire all active checkout, session-verification, product-catalog, tip,
   consultation, and payment-webhook behavior.
2. Keep provider-free `410 Gone` tombstones at the historic payment API paths
   during the Pages-to-Worker transition so old clients cannot fall through to
   a misleading SPA `200` or stale deployment.
3. Remove Stripe secrets, rate-limit bindings, runtime variables, CSP origins,
   release-approval inputs, paid structured data, and public purchase claims.
4. Keep `/support` as a non-payment page for testing, sharing, and issue reports.
   Redirect the historic `/donate` alias there.
5. Replace `/unlock` with a canonical `/ai-plan` experience. The current AI
   action plan is a free beta. A possible one-time $5 expanded creator plan may
   be described only as product direction and must have no buy or waitlist CTA.
6. Preserve historical payment ADR, changelog, and release evidence as audit
   history. Do not edit applied D1 migrations; no payment schema exists to
   remove.

## Future paid-plan gate

A paid creator plan requires a new ADR and forward-only schema covering an
account-bound entitlement, idempotent fulfillment, authoritative usage and cost
limits, refunds/revocation, export and deletion, privacy and Terms changes,
provider failure handling, and full staging acceptance. It must add a distinct
deliverable such as saved milestones, canvas-aware analysis, a bounded
regeneration, and export. Ordinary AI chat, recovery-crisis help, and existing
Studio advice remain free.

## Provider decommission

After confirming whether historic completed purchases exist, deactivate public
Payment Links, expire practical open Checkout Sessions, disable webhook
endpoints, deploy the retirement behavior to Pages and Worker environments,
remove environment secrets, and revoke only credentials proven exclusive to
Tomodachi. Historical transaction records needed for refunds, accounting, or
legal retention remain at the provider.

## Consequences

- Visitors cannot purchase an outdated product or unsupported consultation.
- The deployment contract uses six secrets and six rate-limit bindings.
- Payment-specific attack surface and third-party CSP permissions are removed.
- Monetization is intentionally deferred until the product can fulfill and
  enforce what it sells.
