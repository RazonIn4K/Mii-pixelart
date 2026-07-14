# Writable staging profile and AI acceptance `061cef1`

**Date:** 2026-07-14 (America/Chicago)

**Target:** `tomodachi-studio-staging`

**Accepted source:** `061cef1e6bc028592eb96d7f13cc53f819c90c78`

**Mode:** standard writable staging acceptance

This is the sanitized completion record for the authenticated staging
remediation. It contains no secret values, cookies, OAuth provider subjects,
email or postal addresses, internal user or creation IDs, object keys, project
contents, request bodies, or raw IP data.

## Exact deployment

The guarded staging release wrapper verified a clean exact source, the remote
migration ledger, the configured privileged role, bindings, required secret
names, and the release build before deploying.

- Active Worker version: `68f0ef81-c03f-44b9-a253-ceeb74eb4bc2`
- Immediate rollback version: `688d0042-767f-441b-9e2e-09c3591a7de1`
- `COMMUNITY_MUTATIONS_ENABLED=true` in staging
- `CONSULT_SALES_ENABLED=false`
- Staging CPU limit: 2,000 ms
- Runtime handlers: `fetch` and `scheduled`

No migration, secret, OAuth configuration, role, DNS, or production change was
part of this deployment.

## Source verification

The following passed from the accepted branch source:

- TypeScript and Worker type checks
- 61 OpenAPI operations checked against 65 Worker routes
- six forward-only migrations and 19 required tables with foreign-key and
  integrity checks
- Living The Grid, image-import, template, AI-sketch, and resident verifiers
- 31 Vitest files with 249 passing tests
- three release-preflight files with 84 passing tests
- focused AI browser coverage: eight passed and one intentionally
  project-filtered mobile scenario skipped
- staging production build and high-severity dependency audit
- secret-pattern and Git whitespace scans

The built initial JavaScript was 94.08 KiB gzip, the Studio route was 60.01 KiB
gzip, and the AI panel was 8.18 KiB gzip. These remain below the accepted
initial and lazy-route budgets.

All six hosted GitHub checks passed on the accepted code source: typecheck,
Types/tests/build/Worker packaging, the full browser and accessibility
acceptance job, Cloudflare Pages, code analysis, and dependency/security
analysis. The private GitLab mirror contains the same source commit and has no
project pipeline configured. Its one stale imported SQL-binding review thread
was resolved after confirming the current clause order and its passing
matching-tag and wrong-tag Worker integration coverage.

## AI correction acceptance

Text-only sketch creation may make one validator-guided correction when a
successful first model response has no applyable grid. It preserves the same
allowlisted model, opaque session ID, prompt context, provider data-collection
policy, and original 90-second server deadline. It does not replay raw model
output. Advice, canvas refinements, provider failures, and first-attempt
timeouts do not retry. When a correction is attempted, usage is omitted instead
of underreporting one of two provider calls.

Unit coverage includes valid-first, invalid-then-valid, invalid twice,
advice-only, provider rejection, first-attempt timeout, refinement dimension
mismatch, same model/session/privacy policy, raw-output exclusion, and hostile
palette and row validation.

A protected staging-provider probe exercised the correction path: the first
stochastic response failed validation and the single correction returned a
validated 16 by 16 sketch with 144 painted cells. No provider key or raw model
response was printed or stored.

The deployed signed-in browser then returned a validated 16 by 16, four-color
Mushroom Badge preview with an explicit **Apply once** control. The preview was
not applied, so the existing private project remained unchanged.

## Authenticated product acceptance

The approved staging identity completed Google sign-in and onboarding before
this exact deployment. The accepted Worker preserved and rendered the completed
profile without another OAuth or data mutation:

- the account menu shows the completed display name and generated avatar;
- Account Settings exposes **Try another avatar**, display name, bio, active
  sessions, data export, fresh-authentication guidance, and guarded deletion;
- the public profile renders the generated avatar and username;
- the configured staging administrator can open the moderation workspace, which
  reports an empty open queue without an authorization error;
- the Studio reloads the private revision as `Saved · v2` with exactly one
  visible 64 by 64 editable canvas and one paint toolbar;
- there is no horizontal overflow on the checked Studio, Settings, public
  profile, or moderation pages.

The three-step sharing review was opened and closed without publishing. It
truthfully states that the cloud save remains private until the final action,
offers governed tags, accepts optional JPEG, PNG, WebP, HEIC, and HEIF showcase
files up to 8 MiB with metadata-removal guidance, and exposes visibility,
comments, and Studio JSON download controls. Project download was off by
default and summarized as private. No official game/save-file export is
claimed.

## HTTP, crawler, and runtime acceptance

The staging root and anonymous session API returned 200. The session envelope
advertised `communityMutationsEnabled: true` while retaining an anonymous null
user/session. The root retained CSP, HSTS, `X-Frame-Options: DENY`, content-type
protection, exact staging noindex headers, and browser zoom support.
`robots.txt` continued to disallow all staging crawling.

The signed-in Chrome run produced no application console warnings or errors.
The only logged entries came from a locally installed writing-assistant browser
extension. The real AI request, profile/settings, public profile, moderation,
private project, and share-review routes completed without an application error
or failed action.

## Data and production isolation

The final read-only D1 aggregate reported one account, one external identity,
two active sessions, one private draft, zero published creations, one ready
revision, zero uploading revisions, and eight ready objects. The query reported
`changes=0`, `changed_db=false`, and `rows_written=0`; `PRAGMA
foreign_key_check` returned no rows.

Production remained on the pre-community Cloudflare Pages application. A fresh
production `/api/auth/session` probe still returned the legacy SPA document
rather than the Worker session JSON contract, while the production root and AI
status remained healthy. No production deployment, binding, secret, route, DNS,
OAuth, migration, role, or application-data change occurred.

## Gate status

Exact source `061cef1e6bc028592eb96d7f13cc53f819c90c78` is accepted on the
isolated staging Worker for the approved single-account profile, generated
avatar, private-project, sharing-review, admin-route, and AI-sketch workflows.
Community mutations remain enabled only in staging; consult sales remain
disabled everywhere in the Worker configuration.

The following remain independently gated before production:

- a distinct second staging identity for cross-user private/public access,
  follows, likes, comments, reports, and moderator-target authorization;
- destructive account-deletion completion and scheduled cleanup acceptance;
- consult fulfillment enablement;
- PR/MR merge, production resource/migration/OAuth/secret approval, Worker
  cutover, rollback drill, and production soak.

Production must remain on Pages until those separate gates are approved and
completed.
