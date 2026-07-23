import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEV_SECURITY_WAIVER = {
  advisoryId: "GHSA-f88m-g3jw-g9cj",
  expiresAt: "2026-07-30T00:00:00.000Z",
  moduleName: "sharp",
  owner: "David Ortiz (@RazonIn4K)",
  version: "0.34.5",
} as const;

export const ALLOWED_DEV_SECURITY_WAIVER_PATHS = [
  ".>@cloudflare/vite-plugin>miniflare>sharp",
  ".>@cloudflare/vite-plugin>wrangler>miniflare>sharp",
  ".>@cloudflare/vitest-pool-workers>miniflare>sharp",
  ".>@cloudflare/vitest-pool-workers>wrangler>miniflare>sharp",
  ".>wrangler>miniflare>sharp",
] as const;

interface VerifiedSecurityAudit {
  advisoryId: typeof DEV_SECURITY_WAIVER.advisoryId;
  expiresAt: typeof DEV_SECURITY_WAIVER.expiresAt;
  owner: typeof DEV_SECURITY_WAIVER.owner;
  paths: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHighOrCritical(value: unknown): boolean {
  return value === "high" || value === "critical";
}

const AUDIT_SEVERITIES = [
  "info",
  "low",
  "moderate",
  "high",
  "critical",
] as const;

function auditAdvisories(
  report: unknown,
  label: string,
): Record<string, unknown> {
  if (
    !isRecord(report) ||
    !isRecord(report.advisories) ||
    !isRecord(report.metadata) ||
    !isRecord(report.metadata.vulnerabilities)
  ) {
    throw new Error(`${label} did not return a complete audit report.`);
  }
  const values = Object.values(report.advisories);
  for (const value of values) {
    if (
      !isRecord(value) ||
      !AUDIT_SEVERITIES.includes(
        value.severity as (typeof AUDIT_SEVERITIES)[number],
      )
    ) {
      throw new Error(`${label} contains a malformed advisory.`);
    }
  }
  for (const severity of ["high", "critical"] as const) {
    const summaryCount = report.metadata.vulnerabilities[severity];
    const observedCount = values.filter(
      (value) => (value as Record<string, unknown>).severity === severity,
    ).length;
    if (
      !Number.isInteger(summaryCount) ||
      (summaryCount as number) < 0 ||
      summaryCount !== observedCount
    ) {
      throw new Error(
        `${label} vulnerability summary does not match its advisories.`,
      );
    }
  }
  return report.advisories;
}

function highOrCriticalAdvisories(
  advisories: Record<string, unknown>,
): Record<string, unknown>[] {
  return Object.values(advisories).filter(
    (value): value is Record<string, unknown> =>
      isRecord(value) && isHighOrCritical(value.severity),
  );
}

function sorted(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function verifySecurityAuditReports(
  productionReport: unknown,
  developmentReport: unknown,
  now = new Date(),
): VerifiedSecurityAudit {
  const productionAdvisories = auditAdvisories(
    productionReport,
    "Production dependency audit",
  );
  if (highOrCriticalAdvisories(productionAdvisories).length !== 0) {
    throw new Error(
      "Production dependency audit contains a high or critical finding; the development exception cannot apply.",
    );
  }

  const expiresAt = Date.parse(DEV_SECURITY_WAIVER.expiresAt);
  if (!Number.isFinite(now.getTime()) || now.getTime() >= expiresAt) {
    throw new Error(
      `Temporary ${DEV_SECURITY_WAIVER.advisoryId} waiver expired on 2026-07-29 UTC.`,
    );
  }

  const developmentAdvisories = auditAdvisories(
    developmentReport,
    "Development dependency audit",
  );
  const highOrCritical = highOrCriticalAdvisories(developmentAdvisories);
  if (highOrCritical.length !== 1) {
    throw new Error(
      "Development audit must contain exactly the one approved high advisory; remove a stale waiver or review new findings.",
    );
  }

  const advisory = highOrCritical[0];
  if (
    advisory.github_advisory_id !== DEV_SECURITY_WAIVER.advisoryId ||
    advisory.module_name !== DEV_SECURITY_WAIVER.moduleName ||
    advisory.severity !== "high" ||
    !Array.isArray(advisory.findings) ||
    advisory.findings.length === 0
  ) {
    throw new Error(
      "Development audit high-severity finding does not match the approved waiver.",
    );
  }

  const observedPaths: string[] = [];
  for (const finding of advisory.findings) {
    if (
      !isRecord(finding) ||
      finding.dev !== true ||
      finding.version !== DEV_SECURITY_WAIVER.version ||
      !Array.isArray(finding.paths) ||
      finding.paths.length === 0 ||
      finding.paths.some((value) => typeof value !== "string")
    ) {
      throw new Error(
        "Approved Sharp advisory must remain development-only at the reviewed version with explicit dependency paths.",
      );
    }
    observedPaths.push(...(finding.paths as string[]));
  }

  if (new Set(observedPaths).size !== observedPaths.length) {
    throw new Error(
      "Approved Sharp advisory dependency paths contain duplicates or ambiguous findings.",
    );
  }
  const paths = sorted(observedPaths);
  const allowedPaths = sorted([...ALLOWED_DEV_SECURITY_WAIVER_PATHS]);
  if (JSON.stringify(paths) !== JSON.stringify(allowedPaths)) {
    throw new Error(
      "Approved Sharp advisory dependency paths drifted outside the allowlisted Cloudflare development toolchain.",
    );
  }

  return {
    advisoryId: DEV_SECURITY_WAIVER.advisoryId,
    expiresAt: DEV_SECURITY_WAIVER.expiresAt,
    owner: DEV_SECURITY_WAIVER.owner,
    paths,
  };
}

function runPnpmAudit(args: string[]): {
  status: number | null;
  stderr: string;
  stdout: string;
} {
  const result = spawnSync("pnpm", ["audit", ...args], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`pnpm audit could not start: ${result.error.message}`);
  }
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function parseAuditOutput(
  output: string,
  label: string,
): Record<string, unknown> {
  if (!output.trim()) {
    throw new Error(`${label} returned no JSON report.`);
  }
  try {
    const parsed: unknown = JSON.parse(output);
    if (!isRecord(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new Error(`${label} returned malformed JSON.`);
  }
}

export function verifyCurrentSecurityAudit(
  now = new Date(),
): VerifiedSecurityAudit {
  const production = runPnpmAudit([
    "--prod",
    "--audit-level",
    "high",
    "--json",
  ]);
  if (production.status !== 0) {
    throw new Error(
      `Production dependency audit failed; the development exception cannot apply.${production.stderr ? ` ${production.stderr.trim()}` : ""}`,
    );
  }

  const development = runPnpmAudit(["--audit-level", "high", "--json"]);
  if (development.status !== 1) {
    throw new Error(
      "Development dependency audit did not return the expected single-finding status; remove a stale waiver or investigate the audit failure.",
    );
  }

  return verifySecurityAuditReports(
    parseAuditOutput(production.stdout, "Production dependency audit"),
    parseAuditOutput(development.stdout, "Development dependency audit"),
    now,
  );
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const verified = verifyCurrentSecurityAudit();
    console.log(
      `Verified temporary ${verified.advisoryId} development-only exception owned by ${verified.owner}; expires after 2026-07-29 UTC; production audit clean; ${verified.paths.length} allowlisted paths.`,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Security audit verification failed: ${message}`);
    process.exitCode = 1;
  }
}
