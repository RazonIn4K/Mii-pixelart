# Community platform threat model

**Version:** 1.1
**Reviewed:** 2026-07-12
**Applies to:** Google sign-in, sessions, cloud projects, publishing, social
features, moderation, scheduled cleanup, and dynamic public documents

## Security objectives

1. Preserve the anonymous editor's local-first boundary.
2. Prevent one account from reading or mutating another account's private data.
3. Never turn sign-in, save, or autosave into an implicit publish action.
4. Validate project data before D1/R2 persistence or image transformation.
5. Keep OAuth codes/tokens, session tokens, project contents, emails, and raw IP
   addresses out of logs.
6. Give moderators bounded, auditable powers without granting application or
   infrastructure administration.
7. Make deletion/export behavior predictable and testable.

## Assets and trust boundaries

| Asset | Sensitivity | Authoritative store |
| --- | --- | --- |
| Google provider subject and verified email | Private identity data | D1 `external_identities` |
| Raw session token | Secret | Secure HttpOnly browser cookie only |
| Session-token SHA-256 hash | Sensitive credential verifier | D1 `sessions` |
| Canonical project JSON | Private by default | Private R2 plus D1 manifest |
| Preview, thumbnail, social image | Private until authorized publication | Private R2 plus D1 manifest |
| Optional normalized showcase images | Private until parent publication | Private R2 plus D1 showcase manifest |
| Visibility, ownership, current revision | Authorization-critical | D1 |
| Public profile, title, description, comments | User-generated public text | D1 |
| Reports and moderator notes | Highly sensitive abuse data | D1 |
| OAuth transaction state/nonce/verifier | Short-lived secret | Encrypted HttpOnly cookie |
| HMAC key for privacy-preserving identifiers | Secret | Cloudflare `PSEUDONYM_KEY` secret binding only |
| Worker and OAuth secrets | Secret | Cloudflare secret bindings only |

Trust boundaries are the browser/Worker request boundary, Google/Worker OIDC
boundary, Worker/D1 binding, Worker/R2 binding, Worker/Images binding, and the
moderator/user authorization boundary. D1 is the authority for access even when
an R2 key is known.

## Threats and required controls

| Threat | Category | Required controls and verification |
| --- | --- | --- |
| Forged OAuth callback, login CSRF, or cross-account reauthentication | Spoofing | Authorization code flow; S256 PKCE; cryptographic state and nonce; ten-minute encrypted transaction cookie; exact issuer/audience/expiry/nonce validation; single-use callback; explicit login/reauth intent; reauth bound to the current internal user, session, and Google subject; auth throttling keyed by an environment-scoped `PSEUDONYM_KEY` HMAC rather than a stored/logged raw IP |
| Open redirect through `returnTo` | Spoofing | Accept only a relative path beginning with one `/`; reject schemes, hosts, backslashes, and `//`; use a safe default |
| Session theft or fixation | Spoofing | Generate 32 random bytes after callback; rotate on login; store only SHA-256 hash; Secure/HttpOnly/SameSite=Lax/Path=/ cookie; fixed 30-day expiry; revoke on status/role/deletion changes |
| CSRF on cookie-authenticated mutations | Tampering | Require exact configured `Origin`; require JSON; reject form/simple-content requests; SameSite=Lax; OAuth callback is the only state-changing GET. Raw showcase bytes use a random one-use Bearer ticket with `credentials: omit`, exact Origin, no Cookie, declared length/type, and ten-minute expiry. |
| Cross-account object access | Information disclosure / tampering | Load ownership/visibility from D1 for every read and write; never authorize from URL opacity or R2 key; integration-test two-user matrices |
| Revision overwrite race | Tampering | Require `If-Match`; compare in the D1 commit batch; return `409 REVISION_CONFLICT`; offer explicit copy or cloud-version recovery |
| D1 commit succeeds but R2 is incomplete, or vice versa | Tampering / availability | Reserve uploading revision; write immutable generated keys; batch manifest/pointer commit; immediate best-effort cleanup; hourly stale-upload cleanup; never point to a non-ready revision |
| Malicious or oversized project JSON | Denial of service | Limit body before parsing; strict Zod schema; 2 MiB, 8–256 dimensions, exact cell count, known palette IDs, unique locks; canonicalize and recompute derived colors |
| SVG/script/polyglot payload reaches public media | Elevation / XSS | Generated previews use grid-only server SVG. Optional showcase input is bounded to JPEG/PNG/WebP/HEIC/HEIF, verified by declared type plus decoder, capped at 8 MiB/8192 per side/25 MP, transformed with animation disabled, and discarded after normalized WebP/JPEG outputs are written. Reject SVG/GIF/AVIF/BMP, use fixed response content types, and set `nosniff`. |
| Image decompression bomb or transformation abuse | Denial of service / cost | Enforce byte and decoded-dimension caps before persistence, maximum four ready images, one in-flight ticket per request, account storage quota including generated variants, per-owner save throttling, and staging verification for HEIC/HEIF decoder/plan support. |
| Stolen or replayed image upload ticket | Spoofing / tampering | Store only a token hash; bind the ticket to owner, creation, content type, byte length, alt text, and expiry; consume atomically before transform; reject reuse and Cookie-bearing requests; generated R2 keys never derive from client input. |
| Stored XSS through profile/content fields | XSS | Normalize and length-limit plain text; never interpret Markdown/HTML; render as text; escape dynamic metadata; CSP without user-controlled script/style fragments |
| Search leaks private/unlisted content | Information disclosure | Insert only `published + public` rows into FTS; delete on unpublish/hide/delete/public-to-unlisted; test username/tag changes and scheduled consistency audit |
| Guessing an unlisted share URL | Information disclosure | Cryptographically random stable 18-character base64url slug; no discovery/search/profile listing; `noindex`; explain that possession of the link grants view access |
| Abuse through comments, follows, likes, or reports | Abuse / DoS | Dedicated comment limit of 10/minute/user, social limit of 60/minute/user, and D1 uniqueness/cooldowns; one open report per reporter/target; five reports per rolling 24 hours; owner comment toggle plus moderator lock; suspend and hide controls |
| Moderator overreach or erased audit trail | Elevation / repudiation | Role check on every moderation route; append-only `moderation_actions`; record target, reason, report, timestamp, and an environment-scoped `PSEUDONYM_KEY` HMAC actor pseudonym; lock/unlock actions are explicit and reversible; no UI route grants role |
| Sensitive data in logs | Information disclosure | Emit only the structured allowlist `requestId`, `routeGroup`, `method`, `status`, `duration`, and `environment`; never log a raw path, query, identity/pseudonym, IP, authorization/cookie/OAuth value, request body, project content, report text, or R2 content |
| Deletion bypass or partial deletion | Information disclosure | Immediately revoke sessions/hide content; seven-day cancel window with fresh Google auth; scheduled erasure is idempotent; verify D1 cascades and delete manifested R2 keys; retain only defined pseudonymized moderation records |
| SSR/crawler metadata injection | XSS / spoofing | Fetch only public/unlisted D1 records; HTML-escape title/description/username; set canonical route from configured origin; unlisted `noindex`; do not proxy arbitrary URLs |
| Resource or secret mix-up between environments | Information disclosure | Separate D1/R2/KV/Images/OAuth clients/secrets; explicit Wrangler environments; production resource IDs reviewed in approval gate; random preview auth disabled |

## Authorization matrix

| Operation | Anonymous | Owner | Signed-in non-owner | Moderator/admin |
| --- | --- | --- | --- | --- |
| Edit/export local project | Yes | Yes | Yes | Yes |
| Read private project | No | Yes | No | No by default; incident process only |
| Read unlisted page | Link holder | Yes | Link holder | Link holder |
| Read public page | Yes | Yes | Yes | Yes |
| Save/update/unpublish project | No | Yes | No | No |
| Like/comment/follow/report | No | Yes, subject to rules and comment locks | Yes, subject to rules and comment locks | Yes, subject to rules and comment locks |
| Hide/restore/lock/unlock/suspend/resolve | No | No | No | Yes, audited |
| Change another user's role | No | No | No | Admin-only operator path; not a public API |

Moderators cannot read private project objects through the community UI/API.
An exceptional legal or incident access path requires separate operator
authorization and is outside this API.

## Retention and privacy rules

- Session lifetime is fixed at 30 days; last-seen updates are throttled to once
  per hour and do not extend expiry.
- OAuth transaction data expires after ten minutes. Google access/ID tokens are
  discarded after validation and account provisioning.
- Account deletion hides content and revokes sessions immediately, permits
  cancellation for seven days, then deletes identity/content/social rows and
  all manifested R2 objects.
- Resolved report details and resolution free text are purged after 90 days.
  Minimal pseudonymized report/action metadata expires after two years.
- Do not collect date of birth. Onboarding records the accepted Terms version,
  timestamp, and confirmation that the user is at least 13.
- Raw showcase input is never retained. Normalized showcase variants follow the
  parent creation's visibility and deletion schedule and count toward the 50 MiB
  account quota.

## Verification gates

- Unit: schema boundaries, return-path validation, cookie cryptography, token
  hashing, username/slug rules, cursor rejection, visibility transitions.
- Integration: two-user authorization matrix, CSRF/Origin rejection, session
  revocation, duplicate actions, owner toggles versus moderator locks,
  moderation role checks, rolling report limits, and the D1/R2 failure saga.
- Browser: OAuth draft resume, no implicit save/publish, private/unlisted/public
  behavior, offline/conflict recovery, deletion cancellation.
- Security: fuzz JSON/cursors/text, assert cookie/header/CSP values, verify HMAC
  separation and rotation behavior, scan logs and bundles for secrets, assert
  the exact six-field request-log allowlist, and inspect dynamic HTML escaping.

## Launch blockers

- Legal operator identity, jurisdiction, contact disclosures, and copyright
  process are still placeholders.
- At least one accountable admin and moderator must be assigned and the abuse
  inbox must be monitored.
- Production Cloudflare/Google resources and any paid Images usage require
  explicit approval; see `docs/community-deployment-runbook.md`.

## Deployment and incident safeguards

- `COMMUNITY_MUTATIONS_ENABLED` fails closed unless its value is exactly
  `true`. The Worker checks it before dispatching unsafe community routes, so a
  read-only deployment cannot reach project, publishing, social, report, or
  moderation handlers.
- Authentication/session controls, deletion controls, legacy AI and Stripe
  behavior, and Stripe webhooks are intentionally operational exemptions.
  Any new unsafe API route is blocked by default until explicitly classified.
- The tracked staging and production configurations remain read-only. Enabling
  mutations, replacing placeholder resource IDs, writing secrets, deploying,
  and attaching a domain are separate approval gates.
- Target-explicit release commands validate the selected source and generated
  Worker configurations. Non-dry-run commands reject placeholder bindings,
  legal launch markers, a dirty/wrong commit, stale or unignored approvals,
  missing named owners, and an unapproved writable mutation mode before
  spawning Wrangler.
- Required secret names are declared per Wrangler environment. Secret values
  remain out of source control and logs. Non-local session and pseudonym keys
  must contain at least 32 random bytes, and the AES-GCM OIDC cookie key must
  decode from base64url to exactly 32 bytes; weak and known-placeholder values
  fail closed.
