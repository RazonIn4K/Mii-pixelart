# GitLab security lab

GitHub is the canonical source for Tomodachi Studio. GitLab is a private,
downstream continuity mirror and an independent security lab. Cloudflare remains
the only deployment platform.

## What runs

The root `.gitlab-ci.yml` includes only GitLab security analyzers:

- standard SAST, using GitLab Advanced SAST while Ultimate is available and
  the Semgrep analyzer as its exact-tag fallback;
- pipeline secret detection; and
- SBOM-based dependency scanning.

Normal mirror pushes do not create GitLab pipelines. A pipeline must be started
from **Build > Pipelines > New pipeline**, from an explicit GitLab schedule, or
from the exact-PR tag flow below. This prevents GitLab from duplicating GitHub
typecheck, unit, browser, build, packaging, preview, and deployment jobs.

Secret Push Protection is enabled in the GitLab project UI. It is an additional
pre-receive boundary for newly pushed high-confidence credentials; GitHub remains
the place where a blocked mirror is fixed.

The checked-in secret-detection ruleset extends GitLab's defaults with
high-confidence Tomodachi patterns for OpenRouter keys, Stripe webhook signing
secrets, and assignment-scoped Runpod and N8N credentials. Keep the expressions
synthetic in tests and never paste a real credential into repository history.

## Exact pull-request scan

GitLab must scan the reviewed GitHub pull-request commit, not merely the last
mirrored `main`. After GitHub checks pass, create an annotated tag with this
exact shape at the 40-character PR head:

```text
security/github-pr-<number>-<first-12-sha>
```

Before pushing the tag, verify that `.github/workflows/mirror-gitlab.yml` at the
tagged commit is byte-for-byte identical to `origin/main`. Push the tag to GitHub,
then manually dispatch that mirror workflow from the trusted `main` branch. The
workflow fetches and mirrors all tags without executing project code. The
slash-delimited security tag does not match the workflow's ordinary `tags: ["*"]`
event filter, so the trusted manual dispatch is required.

GitLab accepts the SHA-suffixed tag as a security-only pipeline source. Its
analyzer templates normally create jobs only for branches and merge requests,
so `.gitlab-ci.yml` defines tag-only child jobs for SAST, secret detection, and
dependency scanning. SAST uses Advanced SAST when it is enabled and entitled;
Semgrep covers supported files when Advanced SAST is unavailable or disabled.
Record both the full GitHub commit and the resulting GitLab pipeline ID so the
evidence cannot be mistaken for a scan of another revision.

Do not use this exception for arbitrary tags or branches, and do not add a
GitLab merge request. A failed or stale scan is corrected in the GitHub pull
request and repeated with a new SHA-suffixed tag.

## One-time baseline

Run one manual pipeline on `main` and turn on the `historic_secret_scan`
checkbox in GitLab's **Run pipeline** form.

The input maps to GitLab's `SECRET_DETECTION_HISTORIC_SCAN` analyzer variable.
Historic secret scanning is intentionally a one-time operation because it scans
the repository history. Leave the input at its safe `false` default for later
pipelines. Triage findings without copying any detected value into an issue,
log, chat, or pull request. Remediation is made through a GitHub branch and pull
request, then mirrored back to GitLab.

Download the SAST, secret-detection, dependency, and CycloneDX artifacts after
the baseline. Confirmed work belongs in GitHub issues or pull requests, not a
parallel GitLab backlog.

For each retained baseline or release-candidate scan, record privately:

- pipeline ID and the full commit SHA;
- analyzer versions and job names;
- finding counts and their dispositions;
- SHA-256 hashes for security reports and CycloneDX artifacts; and
- dependency and license export timestamps.

Do not commit raw scanner reports to the public GitHub repository.

## Staging-only dynamic scans

DAST and API security testing remain disabled until an isolated Worker staging
environment exists. When that gate is met, scans must use disposable staging
accounts and data, a cleanup plan, and the OpenAPI contract in
`living-the-grid-studio/docs/community-openapi.yaml`.

Never point DAST or API security testing at production. These scanners can invoke
mutating routes and may delete data.

## Trial exit checklist

Complete this at least four days before the Ultimate trial expires:

1. Rerun the security pipeline and any approved staging-only dynamic scans.
2. Export security reports, CycloneDX SBOMs, dependency/license data, and audit
   events needed for the project record.
3. Move confirmed findings into GitHub and close duplicate GitLab work items.
4. If GitLab security profiles and the checked-in templates are both scheduling
   the same analyzers, detach the profile assignments after the exact-PR scan;
   keep the checked-in templates for post-trial continuity.
5. Set `GITLAB_ADVANCED_SAST_ENABLED` to `"false"` and remove or disable any
   other Ultimate-only jobs or schedules.
6. Run the remaining manual pipeline and a fresh reviewed exact-tag pipeline;
   verify Semgrep SAST and pipeline secret detection complete on the post-trial
   configuration.
7. Verify the GitHub-to-GitLab deploy-key mirror still matches `main` and tags.

Do not add GitLab Pages, Worker deployments, releases, or a second issue/merge
request workflow. This lane exists to improve independent detection without
splitting project ownership.
