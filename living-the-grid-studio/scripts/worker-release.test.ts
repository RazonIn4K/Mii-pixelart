import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  parseCliArgs,
  parseJsonc,
  ReleaseError,
  runRelease,
  type CommandOptions,
  type CommandResult,
  type ReleaseDependencies,
  type ReleaseTarget,
} from "./worker-release";

const CWD = path.resolve("/repo");
const SOURCE_PATH = path.join(CWD, "wrangler.jsonc");
const GENERATED_PATH = path.join(
  CWD,
  "dist",
  "tomodachi_studio",
  "wrangler.json",
);
const NOW = Date.parse("2026-07-11T18:00:00.000Z");
const COMMIT = "8f584fe038f7bb99c76bb349c7279e53b10ee113";
const MIGRATIONS_DIRECTORY = path.join(CWD, "migrations");
const migrationNames = [
  "0001_community.sql",
  "0002_comment_locks.sql",
  "0003_atomic_quota_reservations.sql",
  "0004_preserve_moderation_state.sql",
  "0005_creation_showcase_images.sql",
] as const;
const PRIVILEGED_ROLE_COUNT_QUERY =
  "SELECT COUNT(*) AS count FROM users WHERE role IN ('admin', 'moderator')";
const PRIVILEGED_ROLE_LIST_QUERY =
  "SELECT id, role FROM users WHERE role IN ('admin', 'moderator') ORDER BY id";
const ADMIN_INTERNAL_ID = "e1a76c08-42a2-4bc2-8abb-7d74f14ed818";
const MODERATOR_INTERNAL_ID = "c3f97912-8bba-40d5-916d-c771f1cd49af";

function migrationLedgerResult(
  names: readonly string[] = migrationNames,
): CommandResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify([
      { success: true, results: names.map((name) => ({ name })) },
    ]),
    stderr: "",
  };
}

function privilegedRoleResult(
  rows: readonly Record<string, unknown>[] = [
    { id: MODERATOR_INTERNAL_ID, role: "moderator" },
    { id: ADMIN_INTERNAL_ID, role: "admin" },
  ],
): CommandResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify([{ success: true, results: rows }]),
    stderr: "",
  };
}

const assetRoutes = [
  "/api/*",
  "/",
  "/studio",
  "/guides",
  "/faq",
  "/about",
  "/help",
  "/unlock",
  "/support",
  "/donate",
  "/privacy",
  "/terms",
  "/cookies",
  "/affiliate-disclosure",
  "/disclosure",
  "/community-guidelines",
  "/copyright",
  "/security",
  "/u/*",
  "/creation/*",
  "/discover",
  "/search",
  "/moderation",
  "/me",
  "/me/*",
];

const requiredSecrets = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "OIDC_COOKIE_KEY",
  "SESSION_PEPPER",
  "PSEUDONYM_KEY",
  "OPENROUTER_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

const targetValues = {
  local: {
    name: "tomodachi-studio",
    site: "http://localhost:3000",
    redirect: "http://localhost:3000/api/auth/google/callback",
    d1Name: "tomodachi-studio-local",
    d1Id: "00000000-0000-0000-0000-000000000000",
    r2Name: "tomodachi-studio-projects-local",
    kvId: "5129b5ce8d2d435cb704b398a437f355",
    ratePrefix: "10",
    mutations: "true",
  },
  staging: {
    name: "tomodachi-studio-staging",
    site: "https://staging.tomodachi.pw",
    redirect: "https://staging.tomodachi.pw/api/auth/google/callback",
    d1Name: "tomodachi-studio-staging",
    d1Id: "4ad58d24-8874-4f20-8a68-1f37a9311d7e",
    r2Name: "tomodachi-studio-projects-staging",
    kvId: "b42ee2a0900f4bc78fcfed5aacb199ad",
    ratePrefix: "11",
    mutations: "false",
  },
  production: {
    name: "tomodachi-studio-production",
    site: "https://tomodachi.pw",
    redirect: "https://tomodachi.pw/api/auth/google/callback",
    d1Name: "tomodachi-studio-production",
    d1Id: "f31935cc-acde-4fba-8e41-b02a979f1337",
    r2Name: "tomodachi-studio-projects-production",
    kvId: "a73890f6d13048c4a66b75f2ff824930",
    ratePrefix: "12",
    mutations: "false",
  },
} as const;

function rateLimits(prefix: string) {
  return [
    {
      name: "AUTH_RATE_LIMITER",
      namespace_id: `${prefix}01`,
      simple: { limit: 10, period: 60 },
    },
    {
      name: "SAVE_RATE_LIMITER",
      namespace_id: `${prefix}02`,
      simple: { limit: 30, period: 60 },
    },
    {
      name: "SOCIAL_RATE_LIMITER",
      namespace_id: `${prefix}03`,
      simple: { limit: 60, period: 60 },
    },
    {
      name: "DISCOVERY_RATE_LIMITER",
      namespace_id: `${prefix}04`,
      simple: { limit: 120, period: 60 },
    },
    {
      name: "COMMENT_RATE_LIMITER",
      namespace_id: `${prefix}05`,
      simple: { limit: 10, period: 60 },
    },
    {
      name: "AI_RATE_LIMITER",
      namespace_id: `${prefix}06`,
      simple: { limit: 10, period: 60 },
    },
    {
      name: "STRIPE_RATE_LIMITER",
      namespace_id: `${prefix}07`,
      simple: { limit: 10, period: 60 },
    },
  ];
}

function environmentConfig(
  target: ReleaseTarget,
  sentinel = false,
  remoteWritable = false,
) {
  const values = targetValues[target];
  return {
    ...(target === "local" ? {} : { name: values.name }),
    vars: {
      ENVIRONMENT: target,
      PUBLIC_SITE_URL: values.site,
      GOOGLE_OIDC_REDIRECT_URI: values.redirect,
      TERMS_VERSION: "2026-07-12",
      COMMUNITY_MUTATIONS_ENABLED:
        target === "local" || remoteWritable ? "true" : "false",
    },
    secrets: { required: requiredSecrets },
    d1_databases: [
      {
        binding: "DB",
        database_name: values.d1Name,
        database_id:
          sentinel && target !== "local"
            ? target === "staging"
              ? "11111111-1111-1111-1111-111111111111"
              : "22222222-2222-2222-2222-222222222222"
            : values.d1Id,
        migrations_dir: "./migrations",
      },
    ],
    r2_buckets: [{ binding: "PROJECTS", bucket_name: values.r2Name }],
    kv_namespaces: [
      {
        binding: "EDGE_CACHE",
        id:
          sentinel && target !== "local"
            ? target === "staging"
              ? "11111111111111111111111111111111"
              : "22222222222222222222222222222222"
            : values.kvId,
      },
    ],
    images: { binding: "IMAGES", remote: false },
    ratelimits: rateLimits(values.ratePrefix),
  };
}

function sourceConfig(
  sentinelTarget?: "staging" | "production",
  writableTarget?: "staging" | "production",
) {
  return {
    name: "tomodachi-studio",
    main: "./worker/index.ts",
    compatibility_date: "2025-05-01",
    compatibility_flags: ["nodejs_compat"],
    assets: {
      binding: "ASSETS",
      not_found_handling: "single-page-application",
      run_worker_first: assetRoutes,
    },
    ...environmentConfig("local"),
    triggers: { crons: ["0 * * * *"] },
    env: {
      staging: environmentConfig(
        "staging",
        sentinelTarget === "staging",
        writableTarget === "staging",
      ),
      production: environmentConfig(
        "production",
        sentinelTarget === "production",
        writableTarget === "production",
      ),
    },
  };
}

function generatedConfig(target: ReleaseTarget, source = sourceConfig()) {
  const selected = target === "local" ? source : source.env[target];
  const generated = {
    configPath: SOURCE_PATH,
    userConfigPath: SOURCE_PATH,
    topLevelName: source.name,
    definedEnvironments: ["staging", "production"],
    targetEnvironment: target === "local" ? "" : target,
    name: targetValues[target].name,
    compatibility_date: source.compatibility_date,
    compatibility_flags: source.compatibility_flags,
    triggers: source.triggers,
    assets: { ...source.assets, directory: "../client" },
    vars: selected.vars,
    d1_databases: selected.d1_databases,
    r2_buckets: selected.r2_buckets,
    kv_namespaces: selected.kv_namespaces,
    images: selected.images,
    ratelimits: selected.ratelimits,
  };
  return generated;
}

function approval(
  target: "staging" | "production",
  communityMutationsEnabled = false,
  overrides: Record<string, unknown> = {},
  deploymentPhase: "standard" | "staging-read-only-bootstrap" = "standard",
) {
  const bootstrap = deploymentPhase === "staging-read-only-bootstrap";
  return {
    schemaVersion: 2,
    target,
    intent: "deploy",
    deploymentPhase,
    gitCommit: COMMIT,
    approvedAt: new Date(NOW).toISOString(),
    approvedBy: "Release Owner",
    changeTicket: "release-2026-07-11",
    infrastructure: {
      cloudflareAccount: "Tomodachi production account",
      googleProject: "tomodachi-community-2026",
      domainControlConfirmation: "DNS ownership reviewed 2026-07-11",
      cloudflarePricingDecision: "Workers D1 R2 pricing approved 2026-07-11",
      imagesUsageDecision: "approved",
    },
    legal: {
      operatorIdentity: "Tomodachi Studio LLC",
      jurisdiction: "Illinois, United States",
      postalAddress: "500 Lake Shore Drive, Chicago, IL 60611",
      contactEmail: "legal@tomodachi.pw",
      copyrightProcess: "Copyright intake and takedown runbook approved",
      retentionConfirmation: "Retention schedule reviewed and approved",
    },
    owners: {
      adminInternalId: bootstrap ? null : ADMIN_INTERNAL_ID,
      moderatorInternalId: bootstrap ? null : MODERATOR_INTERNAL_ID,
      legalOwner: "Legal Operations Owner",
      privacyOwner: "Privacy Operations Owner",
      securityOwner: "Security Operations Owner",
      helpOwner: "Customer Help Owner",
      abuseOwner: "Trust and Safety Owner",
      consult30FulfillmentOwner: "Consultation Fulfillment Owner",
      consult30FulfillmentProcess:
        "Paid consultation scheduling and refund runbook",
    },
    stripe: {
      mode: target === "staging" ? "staging-test" : "production-live",
      taxConfirmation: "Stripe tax configuration reviewed and approved",
    },
    confirmations: {
      targetIsolationConfirmed: true,
      bindingsVerified: true,
      secretsConfigured: true,
      migrationsApproved: true,
      legalPlaceholdersReplaced: true,
      adminModeratorAssigned: !bootstrap,
      pricingApproved: true,
      rollbackReady: true,
      deployApproved: true,
      stagingDeployApproved: true,
      stagingAcceptancePassed: !bootstrap,
      productionCutoverApproved: !bootstrap,
      communityMutationsEnabled,
      writableCommunityDeployApproved: communityMutationsEnabled,
      bootstrapReadOnlyApproved: bootstrap,
    },
    ...overrides,
  };
}

type Call = {
  command: string;
  args: readonly string[];
  options: CommandOptions;
};

interface Harness {
  dependencies: ReleaseDependencies;
  files: Map<string, string>;
  calls: Call[];
  logs: string[];
  setCommandResult(result: CommandResult): void;
  setMigrationCommandResult(result: CommandResult): void;
  setRoleCommandResult(result: CommandResult): void;
  setGitState(state: { commit: string; dirty: boolean }): void;
  setIgnored(value: boolean): void;
}

function makeHarness(
  target: ReleaseTarget,
  options: {
    sentinel?: boolean;
    legalMarker?: boolean;
    approval?: boolean;
    remoteWritable?: boolean;
    bootstrap?: boolean;
  } = {},
): Harness {
  const source = sourceConfig(
    options.sentinel && target !== "local" ? target : undefined,
    options.remoteWritable && target !== "local" ? target : undefined,
  );
  const files = new Map<string, string>([
    [SOURCE_PATH, JSON.stringify(source)],
    [GENERATED_PATH, JSON.stringify(generatedConfig(target, source))],
  ]);
  for (const legalFile of [
    "client/src/pages/Terms.tsx",
    "client/src/pages/Privacy.tsx",
    "client/src/pages/Cookies.tsx",
    "client/src/pages/community/CommunityGuidelines.tsx",
    "client/src/pages/community/Copyright.tsx",
  ]) {
    files.set(
      path.join(CWD, legalFile),
      options.legalMarker
        ? "Substitute this section before launch"
        : "Final legal copy",
    );
  }
  if (options.approval !== false && target !== "local") {
    files.set(
      path.join(CWD, ".deployment-readiness", `${target}.json`),
      JSON.stringify(
        approval(
          target,
          options.remoteWritable === true,
          {},
          options.bootstrap ? "staging-read-only-bootstrap" : "standard",
        ),
      ),
    );
  }

  const calls: Call[] = [];
  const logs: string[] = [];
  let commandResult: CommandResult = { exitCode: 0, stdout: "", stderr: "" };
  let migrationCommandResult = migrationLedgerResult();
  let roleCommandResult = privilegedRoleResult(
    options.bootstrap ? [{ count: 0 }] : undefined,
  );
  let gitState = { commit: COMMIT, dirty: false };
  let ignored = true;
  const dependencies: ReleaseDependencies = {
    async readText(filePath) {
      const value = files.get(filePath);
      if (value === undefined) throw new Error("ENOENT");
      return value;
    },
    async readDirectory(directoryPath) {
      if (directoryPath !== MIGRATIONS_DIRECTORY) throw new Error("ENOENT");
      return migrationNames;
    },
    async statFile(filePath) {
      if (!files.has(filePath)) throw new Error("ENOENT");
      return { mtimeMs: NOW };
    },
    async runCommand(command, args, commandOptions) {
      calls.push({ command, args: [...args], options: commandOptions });
      if (args.includes("d1") && args.includes("execute")) {
        const query = args[args.indexOf("--command") + 1];
        return query === "SELECT name FROM d1_migrations ORDER BY id"
          ? migrationCommandResult
          : roleCommandResult;
      }
      return commandResult;
    },
    async getGitState() {
      return gitState;
    },
    async isPathIgnored() {
      return ignored;
    },
    now: () => NOW,
    log(level, message) {
      logs.push(`${level}:${message}`);
    },
  };

  return {
    dependencies,
    files,
    calls,
    logs,
    setCommandResult(result) {
      commandResult = result;
    },
    setMigrationCommandResult(result) {
      migrationCommandResult = result;
    },
    setRoleCommandResult(result) {
      roleCommandResult = result;
    },
    setGitState(state) {
      gitState = state;
    },
    setIgnored(value) {
      ignored = value;
    },
  };
}

describe("parseCliArgs", () => {
  it("requires an explicit target and intent without defaults", () => {
    expect(() => parseCliArgs([])).toThrow(ReleaseError);
    expect(() => parseCliArgs(["--target", "staging"])).toThrow(ReleaseError);
    expect(() => parseCliArgs(["--intent", "dry-run"])).toThrow(ReleaseError);
  });

  it("rejects unknown values, unknown flags, and duplicates", () => {
    expect(() =>
      parseCliArgs(["--target", "preview", "--intent", "dry-run"]),
    ).toThrow();
    expect(() =>
      parseCliArgs(["--target", "local", "--intent", "ship"]),
    ).toThrow();
    expect(() =>
      parseCliArgs(["--target", "local", "--intent", "dry-run", "--force"]),
    ).toThrow();
    expect(() =>
      parseCliArgs([
        "--target",
        "local",
        "--target",
        "staging",
        "--intent",
        "dry-run",
      ]),
    ).toThrow();
  });

  it("accepts either explicit flag order", () => {
    expect(
      parseCliArgs(["--intent", "deploy", "--target", "production"]),
    ).toEqual({
      target: "production",
      intent: "deploy",
    });
  });
});

describe("parseJsonc", () => {
  it("preserves URL text while removing comments and trailing commas", () => {
    expect(
      parseJsonc(`{
        // comment
        "site": "https://tomodachi.pw/a//b",
        "literal": "/* not a comment */",
      }`),
    ).toEqual({
      site: "https://tomodachi.pw/a//b",
      literal: "/* not a comment */",
    });
  });
});

describe("runRelease dry-run", () => {
  it.each(["AI_RATE_LIMITER", "STRIPE_RATE_LIMITER"])(
    "rejects a missing %s binding before build",
    async (bindingName) => {
      const harness = makeHarness("local");
      const source = JSON.parse(harness.files.get(SOURCE_PATH)!);
      source.ratelimits = source.ratelimits.filter(
        (binding: { name: string }) => binding.name !== bindingName,
      );
      harness.files.set(SOURCE_PATH, JSON.stringify(source));

      await expect(
        runRelease(
          { cwd: CWD, target: "local", intent: "dry-run" },
          harness.dependencies,
        ),
      ).rejects.toThrow("Rate-limit bindings");
      expect(harness.calls).toHaveLength(0);
    },
  );

  it("builds the explicit local selection and always invokes Wrangler with --dry-run", async () => {
    const harness = makeHarness("local");
    const result = await runRelease(
      { cwd: CWD, target: "local", intent: "dry-run" },
      harness.dependencies,
    );

    expect(harness.calls).toHaveLength(2);
    expect(harness.calls[0]).toMatchObject({
      command: "pnpm",
      args: ["build"],
    });
    expect(harness.calls[0].options.env.CLOUDFLARE_ENV).toBe("");
    expect(harness.calls[1].args).toEqual([
      "exec",
      "wrangler",
      "deploy",
      "--config",
      GENERATED_PATH,
      "--dry-run",
    ]);
    expect(harness.calls[1].args).not.toContain("--env");
    expect(result.warnings).toHaveLength(1);
    expect(harness.logs.join("\n")).not.toContain(targetValues.local.d1Id);
  });

  it("permits remote sentinel IDs only in dry-run mode and emits a generic warning", async () => {
    const harness = makeHarness("staging", { sentinel: true });
    const result = await runRelease(
      { cwd: CWD, target: "staging", intent: "dry-run" },
      harness.dependencies,
    );
    expect(harness.calls[0].options.env.CLOUDFLARE_ENV).toBe("staging");
    expect(harness.calls[1].args.at(-1)).toBe("--dry-run");
    expect(result.warnings).toHaveLength(1);
    expect(harness.logs.join("\n")).not.toMatch(/11111111/);
  });

  it("allows legal launch markers only as a non-deploying warning", async () => {
    const harness = makeHarness("production", { legalMarker: true });
    const result = await runRelease(
      { cwd: CWD, target: "production", intent: "dry-run" },
      harness.dependencies,
    );
    expect(result.warnings).toContain(
      "Legal launch markers remain; dry-run mode remains non-deploying.",
    );
    expect(harness.calls).toHaveLength(2);
  });

  it("warns prominently when a remote dry-run selects writable community mode", async () => {
    const harness = makeHarness("staging", { remoteWritable: true });
    const result = await runRelease(
      { cwd: CWD, target: "staging", intent: "dry-run" },
      harness.dependencies,
    );
    expect(result.warnings).toContain(
      "Selected remote target has community mutations enabled; dry-run mode remains non-deploying.",
    );
    expect(harness.calls).toHaveLength(2);
  });

  it("does not invoke Wrangler when the generated config disagrees with the selected source", async () => {
    const harness = makeHarness("staging");
    const generated = JSON.parse(harness.files.get(GENERATED_PATH)!);
    generated.name = "tomodachi-studio-production";
    harness.files.set(GENERATED_PATH, JSON.stringify(generated));

    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "dry-run" },
        harness.dependencies,
      ),
    ).rejects.toThrow("Generated Worker name");
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0].args).toEqual(["build"]);
  });
});

describe("runRelease deploy gates", () => {
  it("rejects local deploy before any command is spawned", async () => {
    const harness = makeHarness("local");
    await expect(
      runRelease(
        { cwd: CWD, target: "local", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("only for staging or production");
    expect(harness.calls).toHaveLength(0);
  });

  it("rejects sentinel resource IDs before build or deploy", async () => {
    const harness = makeHarness("staging", { sentinel: true });
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("sentinel or invalid ID");
    expect(harness.calls).toHaveLength(0);
    expect(harness.logs.join("\n")).not.toMatch(/11111111/);
  });

  it("rejects cross-target resource reuse before any command", async () => {
    const harness = makeHarness("staging");
    const source = JSON.parse(harness.files.get(SOURCE_PATH)!);
    source.env.staging.kv_namespaces[0].id =
      source.env.production.kv_namespaces[0].id;
    harness.files.set(SOURCE_PATH, JSON.stringify(source));
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "dry-run" },
        harness.dependencies,
      ),
    ).rejects.toThrow("KV resource IDs are missing or are not isolated");
    expect(harness.calls).toHaveLength(0);
  });

  it("rejects missing approval without starting build or deploy", async () => {
    const harness = makeHarness("staging", { approval: false });
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("approval is missing or unreadable");
    expect(harness.calls).toHaveLength(0);
  });

  it("rejects legacy, missing, or unknown deployment phases before commands", async () => {
    for (const mutate of [
      (value: Record<string, unknown>) => {
        value.schemaVersion = 1;
      },
      (value: Record<string, unknown>) => {
        delete value.deploymentPhase;
      },
      (value: Record<string, unknown>) => {
        value.deploymentPhase = "bootstrap";
      },
    ]) {
      const harness = makeHarness("staging");
      const approvalPath = path.join(
        CWD,
        ".deployment-readiness",
        "staging.json",
      );
      const value = JSON.parse(harness.files.get(approvalPath)!);
      mutate(value);
      harness.files.set(approvalPath, JSON.stringify(value));

      await expect(
        runRelease(
          { cwd: CWD, target: "staging", intent: "deploy" },
          harness.dependencies,
        ),
      ).rejects.toBeInstanceOf(ReleaseError);
      expect(harness.calls).toHaveLength(0);
    }
  });

  it("rejects legal markers without echoing their source text", async () => {
    const harness = makeHarness("production", { legalMarker: true });
    const error = await runRelease(
      { cwd: CWD, target: "production", intent: "deploy" },
      harness.dependencies,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ReleaseError);
    expect((error as Error).message).toBe(
      "Legal launch markers remain in a required public document.",
    );
    expect((error as Error).message).not.toContain("Substitute this section");
    expect(harness.calls).toHaveLength(0);
  });

  it("rejects stale, wrong-commit, incomplete, unignored, and dirty approvals", async () => {
    const cases = [
      {
        mutate(harness: Harness) {
          const file = path.join(CWD, ".deployment-readiness", "staging.json");
          const value = JSON.parse(harness.files.get(file)!);
          value.approvedAt = "2026-07-11T16:00:00.000Z";
          harness.files.set(file, JSON.stringify(value));
        },
      },
      {
        mutate(harness: Harness) {
          const file = path.join(CWD, ".deployment-readiness", "staging.json");
          const value = JSON.parse(harness.files.get(file)!);
          value.gitCommit = "7b584fe038f7bb99c76bb349c7279e53b10ee112";
          harness.files.set(file, JSON.stringify(value));
        },
      },
      {
        mutate(harness: Harness) {
          const file = path.join(CWD, ".deployment-readiness", "staging.json");
          const value = JSON.parse(harness.files.get(file)!);
          value.confirmations.secretsConfigured = false;
          harness.files.set(file, JSON.stringify(value));
        },
      },
      {
        mutate(harness: Harness) {
          const file = path.join(CWD, ".deployment-readiness", "staging.json");
          const value = JSON.parse(harness.files.get(file)!);
          value.confirmations.migrationsApproved = false;
          harness.files.set(file, JSON.stringify(value));
        },
      },
      {
        mutate(harness: Harness) {
          harness.setIgnored(false);
        },
      },
      {
        mutate(harness: Harness) {
          harness.setGitState({ commit: COMMIT, dirty: true });
        },
      },
    ];

    for (const testCase of cases) {
      const harness = makeHarness("staging");
      testCase.mutate(harness);
      await expect(
        runRelease(
          { cwd: CWD, target: "staging", intent: "deploy" },
          harness.dependencies,
        ),
      ).rejects.toBeInstanceOf(ReleaseError);
      expect(harness.calls).toHaveLength(0);
    }
  });

  it("rejects missing audited owner inputs and a mismatched Stripe mode before commands", async () => {
    const auditedInputHarness = makeHarness("staging");
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "staging.json",
    );
    const missingInput = JSON.parse(
      auditedInputHarness.files.get(approvalPath)!,
    );
    delete missingInput.owners.abuseOwner;
    auditedInputHarness.files.set(approvalPath, JSON.stringify(missingInput));
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        auditedInputHarness.dependencies,
      ),
    ).rejects.toThrow("Operational owner input");
    expect(auditedInputHarness.calls).toHaveLength(0);

    const stripeHarness = makeHarness("production");
    const productionApprovalPath = path.join(
      CWD,
      ".deployment-readiness",
      "production.json",
    );
    const wrongStripeMode = JSON.parse(
      stripeHarness.files.get(productionApprovalPath)!,
    );
    wrongStripeMode.stripe.mode = "staging-test";
    stripeHarness.files.set(
      productionApprovalPath,
      JSON.stringify(wrongStripeMode),
    );
    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "deploy" },
        stripeHarness.dependencies,
      ),
    ).rejects.toThrow("Stripe release mode");
    expect(stripeHarness.calls).toHaveLength(0);
  });

  it("binds writable remote mode to explicit approval and permits it when both values are true", async () => {
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "staging.json",
    );
    const rejectedHarness = makeHarness("staging", { remoteWritable: true });
    const incomplete = JSON.parse(rejectedHarness.files.get(approvalPath)!);
    incomplete.confirmations.writableCommunityDeployApproved = false;
    rejectedHarness.files.set(approvalPath, JSON.stringify(incomplete));
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        rejectedHarness.dependencies,
      ),
    ).rejects.toThrow(
      "Writable community deployment requires explicit approval",
    );
    expect(rejectedHarness.calls).toHaveLength(0);

    const approvedHarness = makeHarness("staging", { remoteWritable: true });
    await runRelease(
      { cwd: CWD, target: "staging", intent: "deploy" },
      approvedHarness.dependencies,
    );
    expect(approvedHarness.calls).toHaveLength(4);
  });

  it("permits only an explicit first read-only staging bootstrap with no privileged users", async () => {
    const harness = makeHarness("staging", { bootstrap: true });

    await runRelease(
      { cwd: CWD, target: "staging", intent: "deploy" },
      harness.dependencies,
    );

    expect(harness.calls).toHaveLength(4);
    expect(harness.calls[0].args).toContain(
      "SELECT name FROM d1_migrations ORDER BY id",
    );
    expect(harness.calls[1].args).toContain(PRIVILEGED_ROLE_COUNT_QUERY);
    expect(harness.calls[2].args).toEqual(["build"]);
    expect(harness.calls[3].args).toEqual([
      "exec",
      "wrangler",
      "deploy",
      "--config",
      GENERATED_PATH,
    ]);
  });

  it("rejects bootstrap intent outside a first read-only staging deployment", async () => {
    const production = makeHarness("production", { bootstrap: true });
    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "deploy" },
        production.dependencies,
      ),
    ).rejects.toThrow("allowed only for read-only staging");
    expect(production.calls).toHaveLength(0);

    const writable = makeHarness("staging", {
      bootstrap: true,
      remoteWritable: true,
    });
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        writable.dependencies,
      ),
    ).rejects.toThrow("allowed only for read-only staging");
    expect(writable.calls).toHaveLength(0);

    const unapproved = makeHarness("staging", { bootstrap: true });
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "staging.json",
    );
    const unapprovedValue = JSON.parse(unapproved.files.get(approvalPath)!);
    unapprovedValue.confirmations.bootstrapReadOnlyApproved = false;
    unapproved.files.set(approvalPath, JSON.stringify(unapprovedValue));
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        unapproved.dependencies,
      ),
    ).rejects.toThrow("Bootstrap deployment approval");
    expect(unapproved.calls).toHaveLength(0);

    const alreadyAssigned = makeHarness("staging", { bootstrap: true });
    alreadyAssigned.setRoleCommandResult(privilegedRoleResult([{ count: 1 }]));
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        alreadyAssigned.dependencies,
      ),
    ).rejects.toThrow("requires an empty privileged-role state");
    expect(alreadyAssigned.calls).toHaveLength(2);
  });

  it("requires null bootstrap IDs and exact approved standard role assignments", async () => {
    const bootstrap = makeHarness("staging", { bootstrap: true });
    const bootstrapPath = path.join(
      CWD,
      ".deployment-readiness",
      "staging.json",
    );
    const bootstrapApproval = JSON.parse(bootstrap.files.get(bootstrapPath)!);
    bootstrapApproval.owners.adminInternalId = ADMIN_INTERNAL_ID;
    bootstrap.files.set(bootstrapPath, JSON.stringify(bootstrapApproval));
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        bootstrap.dependencies,
      ),
    ).rejects.toThrow("Bootstrap admin internal ID");
    expect(bootstrap.calls).toHaveLength(0);

    const standard = makeHarness("staging");
    standard.setRoleCommandResult(
      privilegedRoleResult([
        { id: ADMIN_INTERNAL_ID, role: "moderator" },
        { id: MODERATOR_INTERNAL_ID, role: "admin" },
      ]),
    );
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        standard.dependencies,
      ),
    ).rejects.toThrow("do not match the approved internal IDs");
    expect(standard.calls).toHaveLength(2);

    const adminOnly = makeHarness("staging");
    const standardApproval = JSON.parse(adminOnly.files.get(bootstrapPath)!);
    standardApproval.owners.moderatorInternalId = null;
    adminOnly.files.set(bootstrapPath, JSON.stringify(standardApproval));
    adminOnly.setRoleCommandResult(
      privilegedRoleResult([{ id: ADMIN_INTERNAL_ID, role: "admin" }]),
    );
    await runRelease(
      { cwd: CWD, target: "staging", intent: "deploy" },
      adminOnly.dependencies,
    );
    expect(adminOnly.calls).toHaveLength(4);
  });

  it("fails closed when the remote privileged-role check fails without surfacing output", async () => {
    const harness = makeHarness("staging");
    harness.setRoleCommandResult({
      exitCode: 1,
      stdout: "internal-user-id",
      stderr: "private provider detail",
    });

    const error = await runRelease(
      { cwd: CWD, target: "staging", intent: "deploy" },
      harness.dependencies,
    ).catch((caught: unknown) => caught);
    const surfaced = `${(error as Error).message}\n${harness.logs.join("\n")}`;
    expect((error as Error).message).toBe(
      "Remote privileged-role state could not be verified.",
    );
    expect(surfaced).not.toContain("internal-user-id");
    expect(surfaced).not.toContain("private provider detail");
    expect(harness.calls).toHaveLength(2);
  });

  it("rejects a pending tracked migration before build or deploy", async () => {
    const harness = makeHarness("staging");
    harness.setMigrationCommandResult(
      migrationLedgerResult(migrationNames.slice(0, -1)),
    );

    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow(
      "Remote D1 migration ledger does not match tracked migrations",
    );
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0].args).toContain(targetValues.staging.d1Name);
  });

  it("rejects an unexpected remote migration before build or deploy", async () => {
    const harness = makeHarness("production");
    harness.setMigrationCommandResult(
      migrationLedgerResult([...migrationNames, "0006_untracked.sql"]),
    );

    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow(
      "Remote D1 migration ledger does not match tracked migrations",
    );
    expect(harness.calls).toHaveLength(1);
  });

  it.each([
    {
      name: "command failure",
      result: { exitCode: 1, stdout: "", stderr: "private provider output" },
    },
    {
      name: "invalid JSON",
      result: {
        exitCode: 0,
        stdout: "not-json",
        stderr: "private malformed-response detail",
      },
    },
  ])(
    "fails closed on remote ledger $name without surfacing child output",
    async ({ result }) => {
      const harness = makeHarness("staging");
      harness.setMigrationCommandResult(result);

      const error = await runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        harness.dependencies,
      ).catch((caught: unknown) => caught);
      const surfaced = `${(error as Error).message}\n${harness.logs.join("\n")}`;
      expect((error as Error).message).toBe(
        "Remote D1 migration ledger could not be verified.",
      );
      expect(surfaced).not.toContain(result.stderr);
      expect(harness.calls).toHaveLength(1);
    },
  );

  it.each(["staging", "production"] as const)(
    "runs an approved %s deploy without --dry-run or --env",
    async (target) => {
      const harness = makeHarness(target);
      await runRelease(
        { cwd: CWD, target, intent: "deploy" },
        harness.dependencies,
      );

      expect(harness.calls).toHaveLength(4);
      expect(harness.calls[0].args).toEqual([
        "exec",
        "wrangler",
        "d1",
        "execute",
        targetValues[target].d1Name,
        "--remote",
        "--config",
        SOURCE_PATH,
        "--env",
        target,
        "--command",
        "SELECT name FROM d1_migrations ORDER BY id",
        "--json",
      ]);
      expect(harness.calls[1].args).toContain(PRIVILEGED_ROLE_LIST_QUERY);
      expect(harness.calls[2].options.env.CLOUDFLARE_ENV).toBe(target);
      expect(harness.calls[3].args).toEqual([
        "exec",
        "wrangler",
        "deploy",
        "--config",
        GENERATED_PATH,
      ]);
      expect(harness.calls[3].args).not.toContain("--dry-run");
      expect(harness.calls[3].args).not.toContain("--env");
    },
  );

  it("never includes child output, secrets, or resource IDs in surfaced failures", async () => {
    const harness = makeHarness("staging");
    const secret = "super-secret-session-pepper";
    const internalId = targetValues.staging.kvId;
    harness.setCommandResult({
      exitCode: 23,
      stdout: `token=${secret}`,
      stderr: `binding=${internalId}`,
    });

    const error = await runRelease(
      { cwd: CWD, target: "staging", intent: "deploy" },
      harness.dependencies,
    ).catch((caught: unknown) => caught);
    const surfaced = `${(error as Error).message}\n${harness.logs.join("\n")}`;
    expect(surfaced).not.toContain(secret);
    expect(surfaced).not.toContain(internalId);
    expect((error as Error).message).toBe(
      "Worker build failed with exit code 23.",
    );
    expect(harness.calls).toHaveLength(3);
  });
});
