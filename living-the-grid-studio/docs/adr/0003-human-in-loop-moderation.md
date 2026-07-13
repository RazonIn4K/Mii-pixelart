# ADR 0003: Keep community moderation under human authority

- **Status:** Accepted for implementation; production enablement remains gated
- **Date:** 2026-07-13
- **Decision owner:** David Ortiz
- **Scope:** Reports, enforcement decisions, appeals, and AI-assisted triage

## Context

Tomodachi needs consistent report triage without delegating consequential
account or publishing decisions to an opaque model. AI can reduce review work,
but it can be wrong, biased, manipulated by reported content, or missing
important context. Enforcement also needs an accountable operator and a stable
audit trail.

## Decision

David Ortiz is the accountable administrator and final human reviewer. Assign
his internal user ID the `admin` role only after the approved staging sign-in
and bootstrap procedure. A separate `moderator` is optional.

An AI assistant may work from the minimum necessary, redacted report context to:

- classify and prioritize an incoming report;
- summarize the reported content and conversation context;
- identify the relevant Community Guidelines sections;
- suggest questions, a proposed disposition, or a draft user-facing notice.

AI output is an untrusted recommendation. It must identify uncertainty and the
policy basis for a suggestion. Do not send session tokens, raw IPs, OAuth data,
unrelated private projects, or more report free-text than necessary to a model
provider.

An AI assistant must never autonomously hide or restore content, lock or unlock
comments, suspend or restore a user, resolve or dismiss a report, publish or
unpublish a creation, or send a final moderation notice. It receives no session
cookie, admin or moderator credential, signing key, or direct access to
mutation routes. A human with the appropriate role must inspect the source
context and approve every action.

The operating workflow is:

1. Receive the private report and apply the authoritative D1 duplicate and
   rate-limit controls.
2. Optionally obtain advisory AI triage without granting mutation access.
3. A human checks the target, surrounding context, relevant abuse history, and
   cited policy.
4. The human chooses no action, a reversible restriction, or escalation and
   records a concise reason. Uncertainty favors reversible action and a second
   human review when available.
5. The human resolves or dismisses the report only after the target action is
   confirmed. Appeals receive a fresh human review.

Every enforcement mutation remains object-authorized and produces an immutable
moderation action record. Reversible actions use the documented restore path
rather than deleting audit history.

## Consequences and launch checks

- Confirm the `legal@`, `privacy@`, `security@`, `help@`, and abuse/report inbox
  owners, delivery, coverage cadence, and escalation path.
- Verify the accountable admin's internal UUID and role in the target D1
  database before a standard writable deployment.
- Exercise hide/restore, suspend/restore, report disposition, audit logging,
  and cross-role denial in staging with synthetic data.
- Purge resolved report free-text after 90 days and retain only the approved
  minimal pseudonymized moderation metadata for two years.
- Keep production community mutations disabled if no accountable human is
  available to monitor reports and appeals.

The operator name and governing jurisdiction are recorded. Production still
requires a confirmed mail-ready postal address containing city, state, ZIP
code, and country, plus confirmation that every public contact inbox is
monitored. Do not infer missing address fields or publish an incomplete home
address.
