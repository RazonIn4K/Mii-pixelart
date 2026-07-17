# Local release-tooling evidence — 2026-07-16

**Scope:** Runtime implementation checkpoint
`7f0b74f47897c1136ac3996d6332389384720d74`, assembled from pushed checkpoint
`b34f821373657ccf8e5d38401af6c4ff255fc65c` on
`codex/island-workshop-community`. A documentation-only closeout follows that
runtime checkpoint; the provider-reported PR/MR head is authoritative for the
next exact-SHA gate.

**Authority boundary:** Local implementation and local validation only. This
record does not authorize or claim a staging deployment, live writable fixture
run, OAuth change, data/role change, migration, secret write, production
resource creation, DNS change, merge, or production cutover.

## Implemented

- Client-generated UUIDv4 first-save idempotency, with a per-user pending key
  persisted in IndexedDB before the request and exact safe replay on the
  Worker.
- Non-secret Worker response identity for exact source commit, environment,
  and community-mutation mode; the source commit is excluded from public
  static assets.
- Fail-closed P2 writable staging harness with fixed route, request, mutation,
  body, object, and byte ceilings; standard-envelope checks; stale-ETag proof;
  normal-API cleanup; and before/after D1/R2 reconciliation.
- Secret-free P3 live-auth runner using two distinct ephemeral browser
  contexts, browser-memory cookies, exact deployment checks, and logout plus
  revocation verification.
- Integrated `verify:hosted-staging-writable` CLI using one gitignored `0600`
  approval file, read-only Wrangler manifest queries, and streamed R2 byte
  counts. The approval file is never committed and the command accepts no
  identity or approval values on its command line. A unique run ID is consumed
  atomically before mutation, so one approval cannot be replayed.
- Post-sign-in deployment revalidation and release-identity checks on every
  writable response prevent a redeploy or flag change from crossing the gate.
  Cleanup retries through a bounded quiescence window and fails closed unless
  it actually observes deletion.
- A dirty source tree receives an unbound all-zero runtime source identity;
  release-output verification refuses dirty trees and deploy builds require a
  clean source tree.

## Local verification

- `pnpm audit --audit-level high`: no known vulnerabilities.
- `pnpm check`: passed.
- `pnpm test:preflight`: 8 files and 135 tests passed.
- `pnpm verify`: license baseline, 67 OpenAPI operations against 71 Worker
  routes, eight local migrations, required tables/indexes, import/template/AI
  sketch, and resident checks passed.
- `pnpm verify:migrations`: eight migrations; foreign keys and integrity passed.
- `pnpm test:worker`: 38 files and 345 tests passed.
- `pnpm test:e2e`: 410 passed and 396 intentionally skipped across 806 planned
  project/test combinations.
- `pnpm build`: passed.
- `pnpm verify:bundle`: initial JavaScript 92.3 KiB gzip; largest initial chunk
  92.3 KiB gzip, below the release budgets.
- `pnpm worker:dry-run`, `pnpm worker:dry-run:staging`, and
  `pnpm worker:dry-run:production`: passed serially without deployment.
- `pnpm verify:release-output`: secret-filename and exact Worker source-identity
  audits passed.
- `git diff --check`: passed.

Worker packaging commands share generated output and therefore must run
serially; concurrent dry-run output is not release evidence.

## Still open

- Push this documentation closeout and rerun exact-head GitHub CI. At the
  runtime checkpoint, all five owned GitHub checks passed; the external
  `code/snyk` context was blocked by its service quota rather than a finding.
- Complete the documented exact-head GitLab security-tag scan only after the
  GitHub-check prerequisite in `docs/gitlab-security-lab.md` is satisfied.
- Deploy that exact candidate to staging only after an exact-SHA gate.
- Capture exact-head Worker-hosted P1 performance and functional evidence.
- Obtain a distinct approved second Google staging identity and a fresh
  private approval before the first P2/P3 live run.
- Complete P4/P5 two-user authorization, social/moderation, deletion,
  cancellation, retention, and scheduled-cleanup acceptance under their own
  data-change gates.
- Complete P6 contact-channel, provider-cost, licensing, and legal sign-off.
- Keep production on its existing Pages deployment until P1–P9 are complete
  and the separate production resource/cutover gates are explicitly approved.
