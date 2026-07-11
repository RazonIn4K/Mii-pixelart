# ADR 0001: Run the opt-in community platform on Cloudflare Workers

- **Status:** Accepted
- **Date:** 2026-07-10
- **Decision owners:** Tomodachi Studio maintainers
- **Scope:** Compute, routing, and storage for accounts and community features

## Context

Tomodachi Studio is currently a React/Vite single-page application deployed on
Cloudflare Pages. Pages Functions provide the AI, Stripe, webhook, and crawler
routes. The anonymous editor is deliberately local-first and must remain usable
without an account.

The community expansion adds Google OIDC, server-owned sessions, private cloud
projects, public and unlisted publishing, D1 relationships, private R2 objects,
scheduled cleanup, and moderation. Implementing those features in parallel
Pages Functions and Node/Vite shims would create two runtime implementations
with different routing, bindings, and failure behavior.

Cloudflare's current migration guidance notes that Workers serves matching
static assets before Worker code by default, while Pages Functions run before
assets. That routing inversion must be addressed explicitly. See Cloudflare's
[Pages-to-Workers migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
and [Vite static-assets reference](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/).

## Decision

Use one Cloudflare Worker, Hono router, and the Cloudflare Vite plugin for the
application runtime. Deploy the Vite SPA as Worker Static Assets and bind it as
`ASSETS`.

- Preserve compatibility date `2025-05-01` for the parity cutover. Upgrade it
  in a separate, tested change.
- Use `nodejs_compat`; generate binding types from Wrangler configuration.
- Configure `not_found_handling = "single-page-application"`.
- Configure `run_worker_first` only for `/api/*` and dynamic document routes
  that need canonical/Open Graph/index metadata. Ordinary hashed assets remain
  asset-first.
- Port existing AI, Stripe, webhook, and crawler behavior before enabling any
  community feature.
- Use in-process bindings: D1 for relational state, private R2 for canonical
  project/media objects, KV for the existing bounded caches, Images for
  deterministic preview conversion, and Workers Rate Limiting for coarse edge
  controls. Comments use a dedicated 10-per-minute binding rather than sharing
  the 60-per-minute likes/follows lane.
- Derive privacy-preserving client and moderation identifiers with an
  environment-specific `PSEUDONYM_KEY` HMAC. Do not use reversible/raw IP or
  account identifiers as rate-limit keys, and do not emit derived identifiers
  in request logs.
- Keep local, staging, and production bindings and OAuth clients isolated.
- Keep the existing Pages deployment available during staging and production
  soak. A Worker code rollback does not roll back D1 migrations or R2 writes.

## Options considered

| Option | Advantages | Rejected because |
| --- | --- | --- |
| Extend Pages Functions | Small initial routing change; existing deploy remains | Duplicates Node development shims, weaker scheduled-job/observability story, and preserves split handler conventions |
| Worker with Static Assets **(chosen)** | One runtime and deploy unit; direct D1/R2/KV/Images bindings; scheduled handler; stronger staging parity | Requires deliberate asset routing and a controlled domain cutover |
| Separate SPA and API Worker | Independent scaling and releases | Adds CORS, cookie-domain, deployment-order, and rollback complexity without a current need |
| Conventional regional server/database | Familiar relational tooling | Broadens operations, secrets, networking, and cost scope beyond the approved Cloudflare stack |

## Consequences

### Positive

- Browser development and deployed code execute in the Workers runtime through
  the Vite plugin instead of a hand-maintained Express approximation.
- Auth, authorization, session cookies, API envelopes, and response headers can
  be enforced once at the Worker boundary.
- Scheduled cleanup can use the same D1/R2 bindings as request handlers.
- Static assets remain globally cached without invoking the Worker unless a
  route explicitly needs dynamic behavior.

### Costs and risks

- Pages middleware and `_routes.json` semantics do not transfer automatically.
- Worker responses need their own security-header middleware; `_headers` only
  governs static-asset responses.
- Development HTML still passes through Vite's transform pipeline. Keep
  `react()` before `cloudflare()` so the React Refresh preamble is injected,
  and keep the Worker fallback CSP aligned with `_headers`; either a missing
  preamble or a CSP-blocked inline preamble produces a blank development page.
- Preview deployments must never share production OAuth credentials, D1, or R2.
- D1 schema migrations are forward-only. Rollback means deploying compatible
  code or applying a new corrective migration, not reverting the database.
- `run_worker_first` patterns invoke Worker code and therefore affect request
  billing. Keep the list narrow.

## Invariants

1. Anonymous editing, local JSON/PNG/ZIP export, and local import do not require
   an account or send a project to the server.
2. Authentication never saves or publishes a local document automatically.
3. The first cloud save is explicit and private.
4. Private R2 buckets have no public listing or direct public URL.
5. Every mutation checks the authenticated user and the target object.
6. Request logs contain only `requestId`, `routeGroup`, `method`, `status`,
   `duration`, and `environment`, never raw paths, queries, identities,
   pseudonyms, IPs, cookies, bodies, or project/report content.
7. No remote resource, secret, migration, deploy, domain, or OAuth change is
   made without the approval gates in `docs/community-deployment-runbook.md`.
8. Remote builds default to read-only community mode. A target-explicit release
   preflight must bind any writable deployment to a fresh approval and the
   exact clean Git commit before Wrangler can run.

## Validation

- Parity tests cover every existing Pages Function route before cutover.
- Worker integration tests run against local D1/R2/KV bindings.
- Security tests cover HMAC-derived privacy keys, the dedicated comment rate
  lane, owner comment toggles versus moderator locks, and the exact request-log
  allowlist.
- Staging verifies asset-first/static and Worker-first/dynamic route behavior.
- Production cutover requires the complete checklist in the deployment
  runbook and retains the Pages rollback surface through the soak period.
