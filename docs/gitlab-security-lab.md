# GitLab security lab

GitHub is the canonical source for Tomodachi Studio. GitLab is a private,
downstream continuity mirror and an independent security lab. Cloudflare remains
the only deployment platform.

## What runs

The root `.gitlab-ci.yml` includes only GitLab security analyzers:

- standard SAST plus GitLab Advanced SAST while Ultimate is available;
- pipeline secret detection; and
- SBOM-based dependency scanning.

Normal mirror pushes do not create GitLab pipelines. A pipeline must be started
from **Build > Pipelines > New pipeline** or from an explicit GitLab schedule.
This prevents GitLab from duplicating GitHub typecheck, unit, browser, build,
packaging, preview, and deployment jobs.

Secret Push Protection is enabled in the GitLab project UI. It is an additional
pre-receive boundary for newly pushed high-confidence credentials; GitHub remains
the place where a blocked mirror is fixed.

## One-time baseline

Run one manual pipeline on `main` with:

```text
SECRET_DETECTION_HISTORIC_SCAN=true
```

Historic secret scanning is intentionally a one-time operation because it scans
the repository history. Triage findings without copying any detected value into
an issue, log, chat, or pull request. Remediation is made through a GitHub branch
and pull request, then mirrored back to GitLab.

Download the SAST, secret-detection, dependency, and CycloneDX artifacts after
the baseline. Confirmed work belongs in GitHub issues or pull requests, not a
parallel GitLab backlog.

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
4. Set `GITLAB_ADVANCED_SAST_ENABLED` to `"false"` and remove or disable any
   other Ultimate-only jobs or schedules.
5. Run the remaining manual pipeline and verify standard SAST and pipeline secret
   detection complete on the post-trial configuration.
6. Verify the GitHub-to-GitLab deploy-key mirror still matches `main` and tags.

Do not add GitLab Pages, Worker deployments, releases, or a second issue/merge
request workflow. This lane exists to improve independent detection without
splitting project ownership.
