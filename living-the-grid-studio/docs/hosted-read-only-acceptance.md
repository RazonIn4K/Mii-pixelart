# Hosted read-only acceptance harness

`pnpm verify:hosted-read-only` is the repeatable anonymous HTTP, crawler, and
security-header gate for the staging Worker. It has no default destination and
must be given the target explicitly:

```bash
pnpm verify:hosted-read-only -- --base-url https://staging.tomodachi.pw
```

The default remains the fail-closed deployment contract. When a reviewed
staging deployment deliberately has `COMMUNITY_MUTATIONS_ENABLED=true`, select
the explicit expectation-only mode:

```bash
pnpm verify:hosted-read-only -- --base-url https://staging.tomodachi.pw --expect-community-mutations enabled
```

This flag does not enable mutations or send credentials. It changes only the
expected same-origin response from the fixed anonymous safety probe.

The harness is intentionally narrower than the complete browser and release
acceptance suites. It verifies:

- the SPA documents, staging canonical metadata, CSP, HSTS, anti-framing,
  noindex, and UUIDv4 request IDs;
- search/social crawler shells and safe missing-profile/missing-creation 404s;
- deny-all `robots.txt` and empty, non-cacheable staging sitemaps;
- standard discovery, search, and tag JSON envelopes; and
- `COMMUNITY_MUTATIONS_ENABLED=false` through two credentialless,
  empty-object `/api/creations` probes: same-origin must return
  `503 SERVICE_UNAVAILABLE`, and a fixed invalid Origin must return
  `403 FORBIDDEN`; or, only in the explicit enabled expectation mode, the same
  probe must reach authentication and return `401 UNAUTHENTICATED`, while the
  wrong-origin probe must still return `403 FORBIDDEN`.

On success it prints a small JSON result containing the target origin, request
and assertion counts, plus `communityMutations: "blocked"` by default or
`communityMutations: "enabled"` in the explicit mode. It stops at the first
failed invariant and exits nonzero.

## Safety contract

The safety policy is enforced in code rather than relying on operator care:

- there is no environment-variable or production fallback target;
- the CLI allows only exact `https://staging.tomodachi.pw`. Loopback origins
  are rejected by the CLI and are accepted by the library only when a test
  injects its own fetch implementation, so tests cannot accidentally reach a
  local service;
- `tomodachi.pw`, `www.tomodachi.pw`, arbitrary hosts, credentials in the URL,
  non-default staging ports, paths, queries, fragments, and redirects fail;
- requests use `credentials: "omit"`, never contain Cookie or Authorization,
  reject unexpected headers, and reject any `Set-Cookie` response;
- every GET/HEAD path is allowlisted exactly, including its query parameters;
- the only unsafe method allowed is the two hardcoded anonymous POST probes to
  `/api/creations`, with body exactly `{}` and no session. The route requires an
  onboarded session before any data operation when mutation mode is enabled,
  so the explicit mode requires `401 UNAUTHENTICATED`; any unexpected response
  fails the harness without creating data;
- OAuth, account/session, AI, retired-payment compatibility, moderation,
  private-object, scheduled, and destructive routes are never requested; and
- redirects are not followed; cross-origin response URLs are rejected; and the
  per-request deadline remains active through bounded 2 MiB body consumption,
  including a server that sends headers and then stalls its body.

The harness does not query the retired `/api/stripe/*` or
`/api/webhooks/stripe` paths. Worker and Pages integration tests verify those
provider-free compatibility tombstones separately: every method must return
`410 Gone`, JSON, and `Cache-Control: no-store` without a provider credential
or upstream request. This separation keeps the anonymous discovery/crawler gate
strictly allowlisted while still preventing a stale payment client from falling
through to the SPA.

## Local tests

The preflight suite exercises both 28-request expectations against in-memory
Worker-shaped fetch fixtures. It also proves the target/request allowlists,
credential stripping, enabled-mode authentication boundary, mode mismatch
failure, first-failure stop, redirect/`Set-Cookie`/cross-origin response
rejection, and bounded and stalled-body behavior without contacting staging or
any other remote system:

```bash
pnpm test:preflight
```

This script does not replace the Worker integration suite, hosted Playwright
accessibility/Studio checks, Chrome performance trace, read-only D1 snapshot,
or Cloudflare version/binding verification required by the deployment runbook.
