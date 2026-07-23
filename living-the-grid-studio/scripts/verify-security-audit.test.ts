import { describe, expect, it } from "vitest";

import {
  ALLOWED_DEV_SECURITY_WAIVER_PATHS,
  DEV_SECURITY_WAIVER,
  verifySecurityAuditReports,
} from "./verify-security-audit";

const NOW = new Date("2026-07-29T23:59:59.999Z");
const CLEAN_PRODUCTION_REPORT = {
  advisories: {},
  metadata: {
    vulnerabilities: { critical: 0, high: 0, info: 0, low: 0, moderate: 0 },
  },
};

function developmentReport(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const severity =
    typeof overrides.severity === "string" ? overrides.severity : "high";
  return {
    advisories: {
      "1124066": {
        findings: [
          {
            dev: true,
            paths: [...ALLOWED_DEV_SECURITY_WAIVER_PATHS],
            version: DEV_SECURITY_WAIVER.version,
          },
        ],
        github_advisory_id: DEV_SECURITY_WAIVER.advisoryId,
        module_name: DEV_SECURITY_WAIVER.moduleName,
        severity: "high",
        ...overrides,
      },
    },
    metadata: {
      vulnerabilities: {
        critical: severity === "critical" ? 1 : 0,
        high: severity === "high" ? 1 : 0,
        info: severity === "info" ? 1 : 0,
        low: severity === "low" ? 1 : 0,
        moderate: severity === "moderate" ? 1 : 0,
      },
    },
  };
}

describe("temporary development security exception", () => {
  it("accepts only the exact reviewed Sharp advisory through July 29 UTC", () => {
    expect(
      verifySecurityAuditReports(
        CLEAN_PRODUCTION_REPORT,
        developmentReport(),
        NOW,
      ),
    ).toEqual({
      advisoryId: DEV_SECURITY_WAIVER.advisoryId,
      expiresAt: DEV_SECURITY_WAIVER.expiresAt,
      owner: DEV_SECURITY_WAIVER.owner,
      paths: [...ALLOWED_DEV_SECURITY_WAIVER_PATHS].sort(),
    });
  });

  it("fails closed at the start of July 30 UTC", () => {
    expect(() =>
      verifySecurityAuditReports(
        CLEAN_PRODUCTION_REPORT,
        developmentReport(),
        new Date(DEV_SECURITY_WAIVER.expiresAt),
      ),
    ).toThrow("waiver expired");
  });

  it("rejects any production high or critical finding", () => {
    expect(() =>
      verifySecurityAuditReports(
        {
          advisories: {
            runtime: { severity: "high" },
          },
          metadata: {
            vulnerabilities: {
              critical: 0,
              high: 1,
              info: 0,
              low: 0,
              moderate: 0,
            },
          },
        },
        developmentReport(),
        NOW,
      ),
    ).toThrow("Production dependency audit contains");
  });

  it("rejects malformed audit advisory output", () => {
    expect(() =>
      verifySecurityAuditReports(
        {
          advisories: { malformed: "not-an-advisory" },
          metadata: {
            vulnerabilities: {
              critical: 0,
              high: 0,
              info: 0,
              low: 0,
              moderate: 0,
            },
          },
        },
        developmentReport(),
        NOW,
      ),
    ).toThrow("malformed advisory");
  });

  it("rejects audit summaries that contradict their advisory entries", () => {
    const value = developmentReport();
    (
      (value.metadata as Record<string, unknown>).vulnerabilities as Record<
        string,
        unknown
      >
    ).high = 0;
    expect(() =>
      verifySecurityAuditReports(CLEAN_PRODUCTION_REPORT, value, NOW),
    ).toThrow("summary does not match");
  });

  it("rejects production or otherwise non-development Sharp findings", () => {
    expect(() =>
      verifySecurityAuditReports(
        CLEAN_PRODUCTION_REPORT,
        developmentReport({
          findings: [
            {
              dev: false,
              paths: [...ALLOWED_DEV_SECURITY_WAIVER_PATHS],
              version: DEV_SECURITY_WAIVER.version,
            },
          ],
        }),
        NOW,
      ),
    ).toThrow("must remain development-only");
  });

  it("rejects dependency paths outside the reviewed Cloudflare toolchain", () => {
    expect(() =>
      verifySecurityAuditReports(
        CLEAN_PRODUCTION_REPORT,
        developmentReport({
          findings: [
            {
              dev: true,
              paths: [
                ...ALLOWED_DEV_SECURITY_WAIVER_PATHS,
                ".>runtime-image-library>sharp",
              ],
              version: DEV_SECURITY_WAIVER.version,
            },
          ],
        }),
        NOW,
      ),
    ).toThrow("dependency paths drifted");
  });

  it("rejects missing or duplicate dependency paths", () => {
    const missing = ALLOWED_DEV_SECURITY_WAIVER_PATHS.slice(1);
    expect(() =>
      verifySecurityAuditReports(
        CLEAN_PRODUCTION_REPORT,
        developmentReport({
          findings: [
            {
              dev: true,
              paths: missing,
              version: DEV_SECURITY_WAIVER.version,
            },
          ],
        }),
        NOW,
      ),
    ).toThrow("dependency paths drifted");

    expect(() =>
      verifySecurityAuditReports(
        CLEAN_PRODUCTION_REPORT,
        developmentReport({
          findings: [
            {
              dev: true,
              paths: [
                ...ALLOWED_DEV_SECURITY_WAIVER_PATHS,
                ALLOWED_DEV_SECURITY_WAIVER_PATHS[0],
              ],
              version: DEV_SECURITY_WAIVER.version,
            },
          ],
        }),
        NOW,
      ),
    ).toThrow("duplicates");
  });

  it.each([
    ["github_advisory_id", "GHSA-xxxx-yyyy-zzzz"],
    ["module_name", "other-package"],
    ["severity", "critical"],
  ])("rejects a mismatched %s", (field, value) => {
    expect(() =>
      verifySecurityAuditReports(
        CLEAN_PRODUCTION_REPORT,
        developmentReport({ [field]: value }),
        NOW,
      ),
    ).toThrow("does not match the approved waiver");
  });

  it("rejects a different vulnerable Sharp version", () => {
    expect(() =>
      verifySecurityAuditReports(
        CLEAN_PRODUCTION_REPORT,
        developmentReport({
          findings: [
            {
              dev: true,
              paths: [...ALLOWED_DEV_SECURITY_WAIVER_PATHS],
              version: "0.34.6",
            },
          ],
        }),
        NOW,
      ),
    ).toThrow("reviewed version");
  });

  it("rejects additional high or critical development advisories", () => {
    const value = developmentReport();
    (value.advisories as Record<string, unknown>)["9999999"] = {
      findings: [],
      github_advisory_id: "GHSA-xxxx-yyyy-zzzz",
      module_name: "other-package",
      severity: "critical",
    };
    (
      (value.metadata as Record<string, unknown>).vulnerabilities as Record<
        string,
        unknown
      >
    ).critical = 1;
    expect(() =>
      verifySecurityAuditReports(CLEAN_PRODUCTION_REPORT, value, NOW),
    ).toThrow("exactly the one approved high advisory");
  });

  it("rejects a stale exception after the reviewed advisory disappears", () => {
    expect(() =>
      verifySecurityAuditReports(
        CLEAN_PRODUCTION_REPORT,
        {
          advisories: {},
          metadata: {
            vulnerabilities: {
              critical: 0,
              high: 0,
              info: 0,
              low: 0,
              moderate: 0,
            },
          },
        },
        NOW,
      ),
    ).toThrow("exactly the one approved high advisory");
  });
});
