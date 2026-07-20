# AI image-generation prototype gate

**Status:** Local prototype candidate; not deployed to staging or production
**Last updated:** 2026-07-19

## Why this path is changing

Studio's existing **Create** path asks a free chat model to return palette-cell
JSON. In live staging acceptance, the model returned prose plus a malformed
16-by-16 payload instead of a valid sketch. Validation correctly rejected it,
but the user received no artwork to review. A text-chat model that can describe
an image is not an image-generation model, and `openrouter/free` does not
provide image output.

The prototype therefore keeps written advice and the legacy structured-grid
experiment separate from a new, explicit **Generate artwork** action. Generated
artwork uses OpenRouter's dedicated Images API and then enters the existing
local image-import review flow.

The local, unreleased Worker contract is:

- `GET /api/ai/images/status` — standard JSON-envelope capability status.
- `POST /api/ai/images` — authenticated generation request; on success it
  returns verified raw image bytes with bounded metadata headers rather than a
  provider URL or data URL.

## Safety and product contract

The prototype must preserve these invariants:

1. The server accepts only these exact model IDs:
   - Default: `google/gemini-3.1-flash-lite-image`
   - Explicit higher-detail fallback: `google/gemini-3.1-flash-image`
2. The fallback is never automatic. A retry or model change requires a new user
   action because either request can incur cost.
3. The Worker accepts only a bounded prompt and one generated raster. It rejects
   provider URLs, unknown media types, malformed base64, mismatched file
   signatures, oversized bodies, timeouts, and unreported or invalid usage
   cost.
4. Verified PNG, JPEG, or WebP bytes become a temporary browser `Blob`/`File`.
   The existing local importer decodes them, preserves transparency, converts
   them to the canonical 256-by-256 palette grid, and opens the normal import
   preview.
5. Generation never applies, saves, uploads, or publishes anything. The user
   must review framing, transparency, sampling, and palette limits and then
   explicitly commit or cancel the preview.
6. The provider response, generated raster, and prompt text are not written to
   D1, R2, logs, analytics, local chat history, or community media. A later
   explicit project save may persist the validated canonical grid through the
   normal private-project flow; it does not persist the provider image.
7. Prompts are for original, user-directed artwork. Product copy and presets
   must not request or bundle Nintendo characters, logos, interfaces, or other
   official assets and must not promise native game compatibility.

## Request, budget, and privacy controls

The Worker route is authenticated, onboarding-complete, same-origin, JSON-only,
and fail-closed behind a dedicated environment flag. It combines:

- an approximate edge rate-limit binding;
- an authoritative per-user daily D1 reservation before provider contact;
- an environment-scoped daily cost ceiling;
- a user-scoped idempotency key so replaying the same request cannot create a
  second charge;
- an exact two-model allowlist, one-image output, byte ceilings, and timeout;
- a completion/failure ledger that records model, timestamps, reserved and
  actual micro-USD, error code, and a prompt SHA-256 only.

The ledger stores neither prompt text nor image bytes. Failed and stale
reservations must be reconciled without retrying the provider automatically.
Structured logs continue to omit identities, prompts, images, tokens, and raw
IP addresses.

Production remains disabled. Enabling staging requires a separate exact-head
deployment and migration approval after local verification. Enabling production
requires its own later approval and cost review; staging evidence is not
production authorization.

## Benchmark boundary

The approved local benchmark has a **hard aggregate spend cap of $2.00**. It
uses a small set of original, Nintendo-independent square-art prompts against
only the two allowlisted models, records provider-reported cost and timing, and
stops before the next request when its conservative per-request reservation
could exceed the cap. Benchmark images stay in ignored local scratch storage
and must not be committed, uploaded, or published.

The benchmark is quality and cost evidence, not permission to deploy or enable
the feature. If a provider omits trustworthy `usage.cost`, the run fails closed.

### Local benchmark and acceptance record — 2026-07-19

- The reviewed Flash Lite model produced two 1024-by-1024 JPEGs in 2.7 to 2.8
  seconds at approximately $0.0336 each.
- The reviewed full Flash model produced two 1024-by-1024 PNGs in 8.2 to 9.9
  seconds at approximately $0.0672 each. It remains an explicit,
  higher-detail option and is never invoked automatically.
- `openai/gpt-image-1-mini` was evaluated as a candidate and rejected every
  request under the required fail-closed provider policy. It was removed from
  the allowlist rather than weakening no-data-collection or parameter
  enforcement.
- Successful calls reported $0.201654 total usage. Rejected diagnostic calls
  returned no usage cost; all calls remain conservatively covered by a $1.20
  cumulative theoretical ceiling, below the approved $2.00 cap.
- The sample raster was visually inspected and imported through the real local
  Studio UI as a 256-by-256, 24-color preview. Cell view exposed the true
  one-cell-per-pixel surface; cancel restored the prior canvas without
  mutation. Benchmark images and reports remain ignored local scratch
  artifacts.
- Local unit, Worker, migration, OpenAPI, production-build, bundle, browser,
  accessibility, CSP/console, crawler, overflow, and secret-shape checks passed.
  This record does not authorize a migration, deployment, secret change, or
  feature enablement in staging or production.

## Failure and rollback behavior

- Validation, authentication, rate-limit, budget, provider, decode, or import
  failure leaves the active `GridDocument` unchanged.
- The UI shows a specific recoverable error and retains the user's prompt when
  safe; it never substitutes chat prose for an image.
- A generated image remains only in the local review state until commit or
  cancel. Cancel, navigation, replacement, or unmount revokes temporary object
  URLs and discards the bytes.
- Disabling the dedicated environment flag immediately removes provider access
  without affecting written AI advice, anonymous editing, normal imports, Copy
  Guide, or exports.
- Rollback removes the image-generation UI/route and leaves the forward-only
  ledger migration in place. It does not delete or rewrite an applied
  migration.

## Acceptance matrix

| Area           | Required evidence before an exact-head staging gate                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract       | Omitted model selects the reviewed default; any non-allowlisted model, blank/oversized prompt, extra output, URL output, bad MIME/signature, oversized response, and invalid cost fail closed                                                          |
| Authentication | Anonymous, incomplete-onboarding, wrong-Origin, non-JSON, missing/replayed idempotency, suspended, and deletion-pending requests are rejected before provider contact                                                                                  |
| Cost           | Edge throttle and D1 per-user/daily reservations are exercised; duplicate and concurrent requests do not double-charge; completion/failure reconciliation is verified                                                                                  |
| Provider       | Each allowlisted model receives only its reviewed options; fallback is explicit; timeout, 402, 429, 5xx, malformed JSON, and aborted-client behavior are covered                                                                                       |
| Import         | PNG/JPEG/WebP signatures decode; alpha remains transparent; one 256-by-256 preview opens; cancel causes no mutation; commit is one undoable revision                                                                                                   |
| Studio         | Written advice, legacy grid experiment, and generated artwork are clearly distinguished; starter actions select the intended mode; a failed structured sketch is never presented as a usable result                                                    |
| Privacy        | No user-authored prompt text, generated bytes, data URL, token, or raw IP appears in D1, R2, IndexedDB, local chat history, logs, production reports, or repository artifacts; controlled benchmark samples stay only in ignored local scratch storage |
| Accessibility  | Keyboard-only generation/review/cancel/commit works; status and errors are announced; focus is restored; 200% zoom and 320-pixel layout have no horizontal overflow                                                                                    |
| Security       | CSP/console/crawler checks remain clean; generated media is never interpreted as SVG/HTML; browser object URLs are revoked                                                                                                                             |
| Benchmark      | Original-art prompt set completes or fails closed within the aggregate $2.00 cap, with model, latency, dimensions, and provider-reported cost recorded without secret values                                                                           |
| Release        | Local check, Worker tests, browser tests, build, migration verification, and secret/log scans pass; a new immutable commit is named in a separate staging-only approval                                                                                |
