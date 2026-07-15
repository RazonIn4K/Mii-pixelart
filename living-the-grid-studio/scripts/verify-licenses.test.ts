import { describe, expect, it } from "vitest";

import {
  compareLicenseBaseline,
  formatLicenseDrift,
  LICENSE_BASELINE_STATUS,
  parseLicenseBaseline,
  parsePnpmLicenseReport,
  type LicenseBaseline,
  type ObservedLicense,
} from "./verify-licenses";

function makeBaseline(packages: LicenseBaseline["packages"]): LicenseBaseline {
  return parseLicenseBaseline({
    schemaVersion: 1,
    scope: "production",
    sourceCommand: "pnpm licenses list --prod --json",
    sourceLockfile: "pnpm-lock.yaml",
    purpose: "Dependency-license drift detection only; not legal approval.",
    packages,
  });
}

function entry(expression: string) {
  return { expression, status: LICENSE_BASELINE_STATUS } as const;
}

describe("production license verification", () => {
  it("preserves composite expressions and sorts scoped packages", () => {
    expect(
      parsePnpmLicenseReport({
        "(MIT OR GPL-3.0-or-later)": [
          {
            name: "jszip",
            versions: ["3.10.1"],
            license: "(MIT OR GPL-3.0-or-later)",
          },
        ],
        MIT: [
          {
            name: "@scope/widget",
            versions: ["2.0.0", "1.0.0"],
            license: "MIT",
          },
        ],
      }),
    ).toEqual([
      { packageId: "@scope/widget@1.0.0", expression: "MIT" },
      { packageId: "@scope/widget@2.0.0", expression: "MIT" },
      {
        packageId: "jszip@3.10.1",
        expression: "(MIT OR GPL-3.0-or-later)",
      },
    ]);
  });

  it("rejects malformed or conflicting pnpm metadata", () => {
    expect(() =>
      parsePnpmLicenseReport({ MIT: [{ name: "missing-version" }] }),
    ).toThrow("must report at least one version");
    expect(() =>
      parsePnpmLicenseReport({
        MIT: [{ name: "widget", versions: ["1.0.0"] }],
        ISC: [{ name: "widget", versions: ["1.0.0"] }],
      }),
    ).toThrow("conflicting license expressions");
  });

  it("requires every baseline entry to remain observational", () => {
    expect(() =>
      parseLicenseBaseline({
        schemaVersion: 1,
        scope: "production",
        sourceCommand: "pnpm licenses list --prod --json",
        sourceLockfile: "pnpm-lock.yaml",
        purpose: "Not legal approval.",
        packages: {
          "widget@1.0.0": { expression: "MIT", status: "approved" },
        },
      }),
    ).toThrow(LICENSE_BASELINE_STATUS);
  });

  it("accepts an exact package, version, and expression match", () => {
    const baseline = makeBaseline({
      "jszip@3.10.1": entry("(MIT OR GPL-3.0-or-later)"),
    });
    const observed: ObservedLicense[] = [
      {
        packageId: "jszip@3.10.1",
        expression: "(MIT OR GPL-3.0-or-later)",
      },
    ];

    expect(compareLicenseBaseline(baseline, observed)).toEqual([]);
  });

  it("reports added, removed, changed, and blocked metadata deterministically", () => {
    const baseline = makeBaseline({
      "alpha@1.0.0": entry("MIT"),
      "beta@1.0.0": entry("ISC"),
    });
    const observed: ObservedLicense[] = [
      { packageId: "beta@1.0.0", expression: "Apache-2.0" },
      { packageId: "gamma@1.0.0", expression: "unknown" },
    ];
    const drift = compareLicenseBaseline(baseline, observed);

    expect(drift).toEqual([
      {
        kind: "removed",
        packageId: "alpha@1.0.0",
        expected: "MIT",
      },
      {
        kind: "changed",
        packageId: "beta@1.0.0",
        expected: "ISC",
        actual: "Apache-2.0",
      },
      {
        kind: "blocked-metadata",
        packageId: "gamma@1.0.0",
        actual: "unknown",
      },
      {
        kind: "added",
        packageId: "gamma@1.0.0",
        actual: "unknown",
      },
    ]);
    expect(formatLicenseDrift(drift)).toBe(
      [
        "removed alpha@1.0.0 (MIT)",
        "changed beta@1.0.0 (ISC -> Apache-2.0)",
        "blocked metadata gamma@1.0.0 (unknown)",
        "added gamma@1.0.0 (unknown)",
      ].join("\n"),
    );
  });

  it("requires baseline entries to be sorted for reviewable diffs", () => {
    expect(() =>
      makeBaseline({
        "zeta@1.0.0": entry("MIT"),
        "alpha@1.0.0": entry("MIT"),
      }),
    ).toThrow("must be sorted");
  });
});
