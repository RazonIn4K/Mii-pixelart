import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const LICENSE_BASELINE_STATUS = "observed-not-legally-approved" as const;

export interface ObservedLicense {
  expression: string;
  packageId: string;
}

interface LicenseBaselineEntry {
  expression: string;
  status: typeof LICENSE_BASELINE_STATUS;
}

export interface LicenseBaseline {
  packages: Record<string, LicenseBaselineEntry>;
  purpose: string;
  schemaVersion: 1;
  scope: "production";
  sourceCommand: "pnpm licenses list --prod --json";
  sourceLockfile: "pnpm-lock.yaml";
}

export type LicenseDriftKind =
  "added" | "blocked-metadata" | "changed" | "removed";

export interface LicenseDrift {
  actual?: string;
  expected?: string;
  kind: LicenseDriftKind;
  packageId: string;
}

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_BASELINE_PATH = path.join(
  APP_ROOT,
  "config",
  "license-baseline.json",
);
const execFileAsync = promisify(execFile);
const BLOCKED_METADATA_EXPRESSIONS = new Set([
  "NOASSERTION",
  "UNKNOWN",
  "UNLICENSED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function sortedRecordEntries<T>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

export function parsePnpmLicenseReport(report: unknown): ObservedLicense[] {
  if (!isRecord(report)) {
    throw new Error("pnpm license report must be a JSON object.");
  }

  const observedByPackage = new Map<string, string>();

  for (const [rawExpression, rawPackages] of sortedRecordEntries(report)) {
    const expression = requireNonEmptyString(
      rawExpression,
      "License expression",
    );
    if (!Array.isArray(rawPackages)) {
      throw new Error(`License group ${expression} must be an array.`);
    }

    for (const rawPackage of rawPackages) {
      if (!isRecord(rawPackage)) {
        throw new Error(
          `License group ${expression} contains an invalid entry.`,
        );
      }

      const name = requireNonEmptyString(rawPackage.name, "Package name");
      if (
        rawPackage.license !== undefined &&
        requireNonEmptyString(rawPackage.license, `License for ${name}`) !==
          expression
      ) {
        throw new Error(
          `Package ${name} disagrees with its license-group expression.`,
        );
      }
      if (
        !Array.isArray(rawPackage.versions) ||
        rawPackage.versions.length === 0
      ) {
        throw new Error(`Package ${name} must report at least one version.`);
      }

      for (const rawVersion of rawPackage.versions) {
        const version = requireNonEmptyString(
          rawVersion,
          `Version for ${name}`,
        );
        const packageId = `${name}@${version}`;
        const existingExpression = observedByPackage.get(packageId);
        if (
          existingExpression !== undefined &&
          existingExpression !== expression
        ) {
          throw new Error(
            `Package ${packageId} reports conflicting license expressions.`,
          );
        }
        observedByPackage.set(packageId, expression);
      }
    }
  }

  return [...observedByPackage.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([packageId, expression]) => ({ packageId, expression }));
}

export function parseLicenseBaseline(value: unknown): LicenseBaseline {
  if (!isRecord(value)) {
    throw new Error("License baseline must be a JSON object.");
  }
  if (value.schemaVersion !== 1) {
    throw new Error("License baseline schemaVersion must be 1.");
  }
  if (value.scope !== "production") {
    throw new Error("License baseline scope must be production.");
  }
  if (value.sourceCommand !== "pnpm licenses list --prod --json") {
    throw new Error("License baseline sourceCommand is invalid.");
  }
  if (value.sourceLockfile !== "pnpm-lock.yaml") {
    throw new Error("License baseline sourceLockfile is invalid.");
  }
  const purpose = requireNonEmptyString(value.purpose, "Baseline purpose");
  if (!isRecord(value.packages) || Object.keys(value.packages).length === 0) {
    throw new Error("License baseline packages must be a non-empty object.");
  }

  const packageIds = Object.keys(value.packages);
  const sortedPackageIds = [...packageIds].sort((left, right) =>
    left.localeCompare(right),
  );
  if (
    packageIds.some((packageId, index) => packageId !== sortedPackageIds[index])
  ) {
    throw new Error("License baseline package entries must be sorted.");
  }

  const packages: Record<string, LicenseBaselineEntry> = {};
  for (const packageId of packageIds) {
    const rawEntry = value.packages[packageId];
    if (!isRecord(rawEntry)) {
      throw new Error(`Baseline entry ${packageId} must be an object.`);
    }
    const expression = requireNonEmptyString(
      rawEntry.expression,
      `Baseline expression for ${packageId}`,
    );
    if (rawEntry.status !== LICENSE_BASELINE_STATUS) {
      throw new Error(
        `Baseline entry ${packageId} must remain ${LICENSE_BASELINE_STATUS}.`,
      );
    }
    packages[packageId] = {
      expression,
      status: LICENSE_BASELINE_STATUS,
    };
  }

  return {
    schemaVersion: 1,
    scope: "production",
    sourceCommand: "pnpm licenses list --prod --json",
    sourceLockfile: "pnpm-lock.yaml",
    purpose,
    packages,
  };
}

function isBlockedMetadataExpression(expression: string): boolean {
  return BLOCKED_METADATA_EXPRESSIONS.has(expression.trim().toUpperCase());
}

const DRIFT_KIND_ORDER: Record<LicenseDriftKind, number> = {
  "blocked-metadata": 0,
  added: 1,
  changed: 2,
  removed: 3,
};

export function compareLicenseBaseline(
  baseline: LicenseBaseline,
  observed: readonly ObservedLicense[],
): LicenseDrift[] {
  const observedByPackage = new Map(
    observed.map(({ packageId, expression }) => [packageId, expression]),
  );
  const drift: LicenseDrift[] = [];

  for (const { packageId, expression } of observed) {
    if (isBlockedMetadataExpression(expression)) {
      drift.push({
        kind: "blocked-metadata",
        packageId,
        actual: expression,
      });
    }

    const baselineEntry = baseline.packages[packageId];
    if (baselineEntry === undefined) {
      drift.push({ kind: "added", packageId, actual: expression });
    } else if (baselineEntry.expression !== expression) {
      drift.push({
        kind: "changed",
        packageId,
        expected: baselineEntry.expression,
        actual: expression,
      });
    }
  }

  for (const [packageId, entry] of sortedRecordEntries(baseline.packages)) {
    if (!observedByPackage.has(packageId)) {
      drift.push({
        kind: "removed",
        packageId,
        expected: entry.expression,
      });
    }
  }

  return drift.sort((left, right) => {
    const packageComparison = left.packageId.localeCompare(right.packageId);
    return packageComparison === 0
      ? DRIFT_KIND_ORDER[left.kind] - DRIFT_KIND_ORDER[right.kind]
      : packageComparison;
  });
}

export function formatLicenseDrift(drift: readonly LicenseDrift[]): string {
  return drift
    .map((entry) => {
      switch (entry.kind) {
        case "added":
          return `added ${entry.packageId} (${entry.actual})`;
        case "blocked-metadata":
          return `blocked metadata ${entry.packageId} (${entry.actual})`;
        case "changed":
          return `changed ${entry.packageId} (${entry.expected} -> ${entry.actual})`;
        case "removed":
          return `removed ${entry.packageId} (${entry.expected})`;
      }
    })
    .join("\n");
}

export async function verifyProductionLicenses(options?: {
  baselinePath?: string;
  cwd?: string;
}): Promise<{ expressionCount: number; packageCount: number }> {
  const cwd = options?.cwd ?? APP_ROOT;
  const baselinePath = options?.baselinePath ?? DEFAULT_BASELINE_PATH;
  const [baselineText, commandResult] = await Promise.all([
    readFile(baselinePath, "utf8"),
    execFileAsync("pnpm", ["licenses", "list", "--prod", "--json"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }),
  ]);
  const baseline = parseLicenseBaseline(JSON.parse(baselineText));
  const observed = parsePnpmLicenseReport(JSON.parse(commandResult.stdout));
  const drift = compareLicenseBaseline(baseline, observed);

  if (drift.length > 0) {
    throw new Error(
      `Production license baseline drifted:\n${formatLicenseDrift(drift)}\nReview the dependency change; updating the baseline does not constitute legal approval.`,
    );
  }

  return {
    packageCount: observed.length,
    expressionCount: new Set(observed.map(({ expression }) => expression)).size,
  };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  verifyProductionLicenses()
    .then(({ expressionCount, packageCount }) => {
      console.log(
        `Production license baseline verified: ${packageCount} packages, ${expressionCount} observed expressions, legal status ${LICENSE_BASELINE_STATUS}.`,
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`License verification failed: ${message}`);
      process.exitCode = 1;
    });
}
