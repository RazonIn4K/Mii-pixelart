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
  "0006_align_game_taxonomy.sql",
  "0007_profile_images.sql",
  "0008_retain_deleting_showcase_quota.sql",
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
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap-images.xml",
  "/",
  "/studio",
  "/guides",
  "/faq",
  "/about",
  "/help",
  "/ai-plan",
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
];

const targetValues = {
  local: {
    name: "tomodachi-studio",
    site: "http://localhost:3000",
    redirect: "http://localhost:3000/api/auth/google/callback",
    customDomain: null,
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
    customDomain: "staging.tomodachi.pw",
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
    customDomain: "tomodachi.pw",
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
    workers_dev: false,
    preview_urls: false,
    ...(target === "staging" ? { limits: { cpu_ms: 2_000 } } : {}),
    ...(target !== "local"
      ? {
          assets: {
            binding: "ASSETS",
            not_found_handling: "single-page-application",
            run_worker_first: true,
          },
        }
      : {}),
    ...(values.customDomain === null
      ? {}
      : {
          routes: [
            { pattern: values.customDomain, custom_domain: true },
            ...(target === "production"
              ? [
                  {
                    pattern: `www.${values.customDomain}`,
                    custom_domain: true,
                  },
                ]
              : []),
          ],
        }),
    vars: {
      ENVIRONMENT: target,
      PUBLIC_SITE_URL: values.site,
      GOOGLE_OIDC_REDIRECT_URI: values.redirect,
      TERMS_VERSION: "2026-07-16",
      COMMUNITY_MUTATIONS_ENABLED:
        target === "local" || remoteWritable ? "true" : "false",
      ...(target === "production"
        ? {
            AI_IMAGE_GENERATION_ENABLED: "false",
            AI_IMAGE_DAILY_BUDGET_MICRO_USD: "0",
            AI_IMAGE_USER_DAILY_LIMIT: "0",
          }
        : {
            AI_IMAGE_GENERATION_ENABLED: "true",
            AI_IMAGE_DAILY_BUDGET_MICRO_USD: "2000000",
            AI_IMAGE_USER_DAILY_LIMIT: "3",
          }),
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
    version_metadata: { binding: "CF_VERSION_METADATA" },
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
    compatibility_flags: ["nodejs_compat", "enable_request_signal"],
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
    workers_dev: selected.workers_dev,
    preview_urls: selected.preview_urls,
    ...(selected.limits === undefined ? {} : { limits: selected.limits }),
    compatibility_date: source.compatibility_date,
    compatibility_flags: source.compatibility_flags,
    triggers: source.triggers,
    assets: {
      ...(selected.assets ?? source.assets),
      directory: "../client",
    },
    vars: selected.vars,
    d1_databases: selected.d1_databases,
    r2_buckets: selected.r2_buckets,
    kv_namespaces: selected.kv_namespaces,
    images: selected.images,
    version_metadata: selected.version_metadata,
    ratelimits: selected.ratelimits,
    ...(target === "local" ? {} : { routes: selected.routes }),
  };
  return generated;
}

function approval(
  target: "staging" | "production",
  communityMutationsEnabled = false,
  overrides: Record<string, unknown> = {},
  deploymentPhase:
    | "standard"
    | "staging-read-only-bootstrap"
    | "production-read-only-bootstrap"
    | "production-triggerless-bootstrap" = "standard",
) {
  const bootstrap = deploymentPhase !== "standard";
  return {
    schemaVersion: 5,
    target,
    intent: "deploy",
    deploymentPhase,
    gitCommit: COMMIT,
    approvedAt: new Date(NOW).toISOString(),
    approvedBy: "Release Owner",
    changeTicket: "release-2026-07-11",
    infrastructure: {
      cloudflareAccount: "Tomodachi production account",
      googleProjectId:
        target === "production"
          ? "tomodachi-studio-production"
          : "tomodachi-studio-staging",
      domainControlConfirmation: "DNS ownership reviewed 2026-07-11",
      cloudflarePricingDecision: "Workers D1 R2 pricing approved 2026-07-11",
      imagesUsageDecision: "approved",
      ...(target === "production"
        ? {
            domainCutover:
              deploymentPhase === "production-triggerless-bootstrap"
                ? { apex: "defer", www: "defer" }
                : { apex: "attach", www: "redirect-to-apex" },
          }
        : {}),
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
    },
    confirmations: {
      targetIsolationConfirmed: true,
      bindingsVerified: true,
      secretsConfigured: true,
      migrationsApproved: true,
      legalPlaceholdersReplaced: true,
      scheduledMaintenanceWritesApproved:
        deploymentPhase !== "production-triggerless-bootstrap",
      adminModeratorAssigned: !bootstrap,
      pricingApproved: true,
      rollbackReady: true,
      deployApproved: true,
      stagingDeployApproved: true,
      stagingAcceptancePassed: target === "production" || !bootstrap,
      productionCutoverApproved:
        deploymentPhase === "production-read-only-bootstrap" ||
        deploymentPhase === "standard",
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
  setFileSecurity(
    filePath: string,
    security: { isRegularFile: boolean; permissions?: number },
  ): void;
}

function makeHarness(
  target: ReleaseTarget,
  options: {
    sentinel?: boolean;
    legalMarker?: boolean;
    approval?: boolean;
    remoteWritable?: boolean;
    bootstrap?: boolean;
    productionBootstrap?: boolean;
  } = {},
): Harness {
  const bootstrap =
    options.bootstrap === true || options.productionBootstrap === true;
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
          options.productionBootstrap
            ? "production-read-only-bootstrap"
            : options.bootstrap
              ? "staging-read-only-bootstrap"
              : "standard",
        ),
      ),
    );
  }
  if (target !== "local" && bootstrap) {
    files.set(
      path.join(CWD, ".deployment-readiness", `${target}.secrets.json`),
      JSON.stringify({
        GOOGLE_CLIENT_ID:
          "1020760650950-eqv69pk6cbq6bh7k91r56ogmjn35506t.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: `GOC${"SPX"}-a1b2c3d4e5f6g7h8i9j0k1l2`,
        OIDC_COOKIE_KEY: "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA",
        SESSION_PEPPER: "session-pepper-a1b2c3d4e5f6g7h8i9j0k1l2",
        PSEUDONYM_KEY: "pseudonym-key-a1b2c3d4e5f6g7h8i9j0k1l2",
        OPENROUTER_API_KEY: `sk-${"or-v1"}-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0`,
      }),
    );
  }

  const calls: Call[] = [];
  const logs: string[] = [];
  let commandResult: CommandResult = { exitCode: 0, stdout: "", stderr: "" };
  let migrationCommandResult = migrationLedgerResult();
  let roleCommandResult = privilegedRoleResult(
    bootstrap ? [{ count: 0 }] : undefined,
  );
  let gitState = { commit: COMMIT, dirty: false };
  let ignored = true;
  const fileSecurity = new Map<
    string,
    { isRegularFile: boolean; permissions?: number }
  >();
  const dependencies: ReleaseDependencies = {
    async readText(filePath) {
      const value = files.get(filePath);
      if (value === undefined) throw new Error("ENOENT");
      return value;
    },
    async writeText(filePath, contents) {
      files.set(filePath, contents);
    },
    async readDirectory(directoryPath) {
      if (directoryPath !== MIGRATIONS_DIRECTORY) throw new Error("ENOENT");
      return migrationNames;
    },
    async statFile(filePath) {
      if (!files.has(filePath)) throw new Error("ENOENT");
      return { mtimeMs: NOW };
    },
    async inspectFileSecurity(filePath) {
      if (!files.has(filePath)) throw new Error("ENOENT");
      return (
        fileSecurity.get(filePath) ?? {
          isRegularFile: true,
          permissions: 0o600,
        }
      );
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
    setFileSecurity(filePath, security) {
      fileSecurity.set(filePath, security);
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
  it.each([
    "AUTH_RATE_LIMITER",
    "SAVE_RATE_LIMITER",
    "SOCIAL_RATE_LIMITER",
    "DISCOVERY_RATE_LIMITER",
    "COMMENT_RATE_LIMITER",
    "AI_RATE_LIMITER",
  ])("rejects a missing %s binding before build", async (bindingName) => {
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
  });

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

  it("rejects a staging hostname that is not the approved custom domain", async () => {
    const harness = makeHarness("staging");
    const source = JSON.parse(harness.files.get(SOURCE_PATH)!);
    source.env.staging.routes[0].pattern = "tomodachi.pw";
    harness.files.set(SOURCE_PATH, JSON.stringify(source));

    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "dry-run" },
        harness.dependencies,
      ),
    ).rejects.toThrow("Custom-domain routes");
    expect(harness.calls).toHaveLength(0);
  });

  it("rejects an alternate workers.dev origin for staging", async () => {
    const harness = makeHarness("staging");
    const source = JSON.parse(harness.files.get(SOURCE_PATH)!);
    source.env.staging.workers_dev = true;
    harness.files.set(SOURCE_PATH, JSON.stringify(source));

    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "dry-run" },
        harness.dependencies,
      ),
    ).rejects.toThrow("Workers.dev public-origin policy");
    expect(harness.calls).toHaveLength(0);
  });

  it("permits the bounded production AI image mode only with writable community mutations", async () => {
    const harness = makeHarness("production", { remoteWritable: true });
    for (const configPath of [SOURCE_PATH, GENERATED_PATH]) {
      const config = JSON.parse(harness.files.get(configPath)!);
      const selected =
        configPath === SOURCE_PATH ? config.env.production : config;
      selected.vars.AI_IMAGE_GENERATION_ENABLED = "true";
      selected.vars.AI_IMAGE_DAILY_BUDGET_MICRO_USD = "2000000";
      selected.vars.AI_IMAGE_USER_DAILY_LIMIT = "3";
      harness.files.set(configPath, JSON.stringify(config));
    }

    await runRelease(
      { cwd: CWD, target: "production", intent: "dry-run" },
      harness.dependencies,
    );

    expect(harness.calls.at(-1)?.args.at(-1)).toBe("--dry-run");
  });

  it("rejects production AI image generation outside the bounded release budget", async () => {
    const harness = makeHarness("production", { remoteWritable: true });
    const source = JSON.parse(harness.files.get(SOURCE_PATH)!);
    source.env.production.vars.AI_IMAGE_GENERATION_ENABLED = "true";
    source.env.production.vars.AI_IMAGE_DAILY_BUDGET_MICRO_USD = "2000001";
    source.env.production.vars.AI_IMAGE_USER_DAILY_LIMIT = "3";
    harness.files.set(SOURCE_PATH, JSON.stringify(source));

    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "dry-run" },
        harness.dependencies,
      ),
    ).rejects.toThrow("Production AI daily budget");
    expect(harness.calls).toHaveLength(0);
  });

  it("rejects a generated config that drops the custom-domain route", async () => {
    const harness = makeHarness("staging");
    const generated = JSON.parse(harness.files.get(GENERATED_PATH)!);
    delete generated.routes;
    harness.files.set(GENERATED_PATH, JSON.stringify(generated));

    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "dry-run" },
        harness.dependencies,
      ),
    ).rejects.toThrow("Custom-domain routes");
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0].args).toEqual(["build"]);
  });

  it("rejects a generated config that enables version preview URLs", async () => {
    const harness = makeHarness("staging");
    const generated = JSON.parse(harness.files.get(GENERATED_PATH)!);
    generated.preview_urls = true;
    harness.files.set(GENERATED_PATH, JSON.stringify(generated));

    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "dry-run" },
        harness.dependencies,
      ),
    ).rejects.toThrow("Worker preview-URL public-origin policy");
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0].args).toEqual(["build"]);
  });

  it.each([
    ["drops", undefined],
    ["widens", { cpu_ms: 30_000 }],
  ])(
    "rejects a generated config that %s the staging CPU limit",
    async (_label, limits) => {
      const harness = makeHarness("staging");
      const generated = JSON.parse(harness.files.get(GENERATED_PATH)!);
      if (limits === undefined) delete generated.limits;
      else generated.limits = limits;
      harness.files.set(GENERATED_PATH, JSON.stringify(generated));

      await expect(
        runRelease(
          { cwd: CWD, target: "staging", intent: "dry-run" },
          harness.dependencies,
        ),
      ).rejects.toThrow("Staging-only Worker CPU limit");
      expect(harness.calls).toHaveLength(1);
      expect(harness.calls[0].args).toEqual(["build"]);
    },
  );

  it.each(["local", "production"] as const)(
    "rejects a generated %s config that inherits the staging CPU limit",
    async (target) => {
      const harness = makeHarness(target);
      const generated = JSON.parse(harness.files.get(GENERATED_PATH)!);
      generated.limits = { cpu_ms: 2_000 };
      harness.files.set(GENERATED_PATH, JSON.stringify(generated));

      await expect(
        runRelease(
          { cwd: CWD, target, intent: "dry-run" },
          harness.dependencies,
        ),
      ).rejects.toThrow("Staging-only Worker CPU limit");
      expect(harness.calls).toHaveLength(1);
      expect(harness.calls[0].args).toEqual(["build"]);
    },
  );

  it.each([
    ["removes the staging cap", "staging", undefined],
    ["widens the staging cap", "staging", { cpu_ms: 30_000 }],
    ["adds a production cap", "production", { cpu_ms: 2_000 }],
  ] as const)(
    "rejects source configuration that %s",
    async (_label, target, limits) => {
      const harness = makeHarness("staging");
      const source = JSON.parse(harness.files.get(SOURCE_PATH)!);
      if (limits === undefined) delete source.env[target].limits;
      else source.env[target].limits = limits;
      harness.files.set(SOURCE_PATH, JSON.stringify(source));

      await expect(
        runRelease(
          { cwd: CWD, target: "staging", intent: "dry-run" },
          harness.dependencies,
        ),
      ).rejects.toThrow("Staging-only Worker CPU limit");
      expect(harness.calls).toHaveLength(0);
    },
  );

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

  it("rejects missing audited owner inputs before commands", async () => {
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
  });
  it("rejects missing scheduled maintenance write approval before commands", async () => {
    const harness = makeHarness("staging");
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "staging.json",
    );
    const body = JSON.parse(harness.files.get(approvalPath)!);
    body.confirmations.scheduledMaintenanceWritesApproved = false;
    harness.files.set(approvalPath, JSON.stringify(body));
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("missing one or more required confirmations");
    expect(harness.calls).toHaveLength(0);
  });
  it("rejects a production approval bound to the staging Google project", async () => {
    const harness = makeHarness("production", { productionBootstrap: true });
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "production.json",
    );
    const body = JSON.parse(harness.files.get(approvalPath)!);
    body.infrastructure.googleProjectId = "tomodachi-studio-staging";
    harness.files.set(approvalPath, JSON.stringify(body));
    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("does not match the audited target project");
    expect(harness.calls).toHaveLength(0);
  });
  it("rejects a production cutover approval that defers the www disposition", async () => {
    const harness = makeHarness("production", { productionBootstrap: true });
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "production.json",
    );
    const body = JSON.parse(harness.files.get(approvalPath)!);
    body.infrastructure.domainCutover = { apex: "attach", www: "defer" };
    harness.files.set(approvalPath, JSON.stringify(body));
    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("attached apex and a www redirect to the apex");
    expect(harness.calls).toHaveLength(0);
  });
  it("rejects unknown production domain cutover dispositions", async () => {
    const harness = makeHarness("production", { productionBootstrap: true });
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "production.json",
    );
    const body = JSON.parse(harness.files.get(approvalPath)!);
    body.infrastructure.domainCutover = { apex: "attach", www: "park" };
    harness.files.set(approvalPath, JSON.stringify(body));
    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("Production domain cutover inputs are invalid");
    expect(harness.calls).toHaveLength(0);
  });
  it("rejects the removed www attach disposition", async () => {
    const harness = makeHarness("production", { productionBootstrap: true });
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "production.json",
    );
    const body = JSON.parse(harness.files.get(approvalPath)!);
    body.infrastructure.domainCutover = { apex: "attach", www: "attach" };
    harness.files.set(approvalPath, JSON.stringify(body));
    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("Production domain cutover inputs are invalid");
    expect(harness.calls).toHaveLength(0);
  });
  it("rejects triggerless bootstrap when scheduled maintenance writes are pre-approved", async () => {
    const harness = makeHarness("production");
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "production.json",
    );
    const body = JSON.parse(
      JSON.stringify(
        approval("production", false, {}, "production-triggerless-bootstrap"),
      ),
    );
    body.confirmations.scheduledMaintenanceWritesApproved = true;
    harness.files.set(approvalPath, JSON.stringify(body));
    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("Triggerless bootstrap scheduled-maintenance approval");
    expect(harness.calls).toHaveLength(0);
  });
  it("rejects staging approvals that declare production domain cutover inputs", async () => {
    const harness = makeHarness("staging");
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "staging.json",
    );
    const body = JSON.parse(harness.files.get(approvalPath)!);
    body.infrastructure.domainCutover = { apex: "defer", www: "defer" };
    harness.files.set(approvalPath, JSON.stringify(body));
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("must not declare production domain cutover inputs");
    expect(harness.calls).toHaveLength(0);
  });
  it("rejects triggerless bootstrap approvals that attach the apex domain", async () => {
    const harness = makeHarness("production");
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "production.json",
    );
    const body = JSON.parse(
      JSON.stringify(
        approval("production", false, {}, "production-triggerless-bootstrap"),
      ),
    );
    body.infrastructure.domainCutover = { apex: "attach", www: "defer" };
    harness.files.set(approvalPath, JSON.stringify(body));
    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("deferred apex and www dispositions");
    expect(harness.calls).toHaveLength(0);
  });
  it("rejects schema version 4 approvals", async () => {
    const harness = makeHarness("staging");
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "staging.json",
    );
    const body = JSON.parse(harness.files.get(approvalPath)!);
    body.schemaVersion = 4;
    harness.files.set(approvalPath, JSON.stringify(body));
    await expect(
      runRelease(
        { cwd: CWD, target: "staging", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("Deployment approval schema");
    expect(harness.calls).toHaveLength(0);
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
      "--secrets-file",
      path.join(CWD, ".deployment-readiness", "staging.secrets.json"),
    ]);
  });

  it("permits an explicit read-only production bootstrap only after staging acceptance and cutover approval", async () => {
    const harness = makeHarness("production", { productionBootstrap: true });

    await runRelease(
      { cwd: CWD, target: "production", intent: "deploy" },
      harness.dependencies,
    );

    expect(harness.calls).toHaveLength(4);
    expect(harness.calls[1].args).toContain(PRIVILEGED_ROLE_COUNT_QUERY);
    expect(harness.calls[3].args).toEqual([
      "exec",
      "wrangler",
      "deploy",
      "--config",
      GENERATED_PATH,
      "--secrets-file",
      path.join(CWD, ".deployment-readiness", "production.secrets.json"),
    ]);
  });

  it("rejects missing, extra, placeholder, or malformed bootstrap secrets before any remote command", async () => {
    const secretPath = path.join(
      CWD,
      ".deployment-readiness",
      "staging.secrets.json",
    );
    const cases = [
      (secrets: Record<string, string>) => {
        delete secrets.OPENROUTER_API_KEY;
      },
      (secrets: Record<string, string>) => {
        secrets.EXTRA_SECRET = "not-allowed";
      },
      (secrets: Record<string, string>) => {
        secrets.OPENROUTER_API_KEY = "sk-or-v1-REPLACE_ME";
      },
      (secrets: Record<string, string>) => {
        secrets.OIDC_COOKIE_KEY = "too-short";
      },
    ];

    for (const mutate of cases) {
      const harness = makeHarness("staging", { bootstrap: true });
      const secrets = JSON.parse(harness.files.get(secretPath)!);
      mutate(secrets);
      harness.files.set(secretPath, JSON.stringify(secrets));
      await expect(
        runRelease(
          { cwd: CWD, target: "staging", intent: "deploy" },
          harness.dependencies,
        ),
      ).rejects.toBeInstanceOf(ReleaseError);
      expect(harness.calls).toHaveLength(0);
    }
  });

  it.each([
    { label: "a directory", isRegularFile: false, permissions: 0o600 },
    {
      label: "group-readable permissions",
      isRegularFile: true,
      permissions: 0o640,
    },
    {
      label: "world-readable permissions",
      isRegularFile: true,
      permissions: 0o604,
    },
    {
      label: "owner-executable permissions",
      isRegularFile: true,
      permissions: 0o700,
    },
    {
      label: "owner-read-only permissions",
      isRegularFile: true,
      permissions: 0o400,
    },
  ])(
    "rejects a bootstrap secrets file that is $label",
    async ({ isRegularFile, permissions }) => {
      const harness = makeHarness("staging", { bootstrap: true });
      const secretPath = path.join(
        CWD,
        ".deployment-readiness",
        "staging.secrets.json",
      );
      harness.setFileSecurity(secretPath, { isRegularFile, permissions });

      await expect(
        runRelease(
          { cwd: CWD, target: "staging", intent: "deploy" },
          harness.dependencies,
        ),
      ).rejects.toThrow("private regular file with permissions 0600");
      expect(harness.calls).toHaveLength(0);
    },
  );

  it("accepts private bootstrap secret files when permission metadata is unavailable", async () => {
    const harness = makeHarness("staging", { bootstrap: true });
    const secretPath = path.join(
      CWD,
      ".deployment-readiness",
      "staging.secrets.json",
    );
    harness.setFileSecurity(secretPath, { isRegularFile: true });

    await runRelease(
      { cwd: CWD, target: "staging", intent: "deploy" },
      harness.dependencies,
    );

    expect(harness.calls).toHaveLength(4);
  });

  it.each([
    {
      label: "a symlink or non-regular file",
      isRegularFile: false,
      permissions: 0o600,
    },
    {
      label: "group-readable permissions",
      isRegularFile: true,
      permissions: 0o640,
    },
  ])(
    "rejects a deployment approval file that is $label",
    async ({ isRegularFile, permissions }) => {
      const harness = makeHarness("staging", { bootstrap: true });
      const approvalPath = path.join(
        CWD,
        ".deployment-readiness",
        "staging.json",
      );
      harness.setFileSecurity(approvalPath, { isRegularFile, permissions });

      await expect(
        runRelease(
          { cwd: CWD, target: "staging", intent: "deploy" },
          harness.dependencies,
        ),
      ).rejects.toThrow("private regular file with permissions 0600");
      expect(harness.calls).toHaveLength(0);
    },
  );

  it("rejects bootstrap intent outside a first read-only staging deployment", async () => {
    const production = makeHarness("production", { bootstrap: true });
    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "deploy" },
        production.dependencies,
      ),
    ).rejects.toThrow("must match its read-only release target");
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
    ).rejects.toThrow("must match its read-only release target");
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

describe("production triggerless bootstrap", () => {
  it("sanitizes the generated production artifact and deploys without domain, route, or cron", async () => {
    const harness = makeHarness("production");
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "production.json",
    );
    const secretsPath = path.join(
      CWD,
      ".deployment-readiness",
      "production.secrets.json",
    );
    harness.files.set(
      approvalPath,
      JSON.stringify(
        approval("production", false, {}, "production-triggerless-bootstrap"),
      ),
    );
    harness.files.set(
      secretsPath,
      JSON.stringify({
        GOOGLE_CLIENT_ID:
          "1020760650950-eqv69pk6cbq6bh7k91r56ogmjn35506t.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: `GOCSPX-a1b2c3d4e5f6g7h8i9j0k1l2`,
        OIDC_COOKIE_KEY: "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA",
        SESSION_PEPPER: "session-pepper-a1b2c3d4e5f6g7h8i9j0k1l2",
        PSEUDONYM_KEY: "pseudonym-key-a1b2c3d4e5f6g7h8i9j0k1l2",
        OPENROUTER_API_KEY: `sk-or-v1-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0`,
      }),
    );
    harness.setRoleCommandResult(privilegedRoleResult([{ count: 0 }]));

    await runRelease(
      { cwd: CWD, target: "production", intent: "deploy" },
      harness.dependencies,
    );

    const generated = JSON.parse(harness.files.get(GENERATED_PATH)!);
    expect(generated.routes).toBeUndefined();
    expect(generated.route).toBeUndefined();
    expect(generated.workers_dev).toBe(false);
    expect(generated.preview_urls).toBe(false);
    expect(generated.triggers).toEqual({ crons: [] });
    expect(generated.vars.COMMUNITY_MUTATIONS_ENABLED).toBe("false");
    expect(generated.vars.AI_IMAGE_GENERATION_ENABLED).toBe("false");

    const source = JSON.parse(harness.files.get(SOURCE_PATH)!);
    expect(source.env.production.routes).toEqual([
      { pattern: "tomodachi.pw", custom_domain: true },
      { pattern: "www.tomodachi.pw", custom_domain: true },
    ]);
    expect(source.triggers).toEqual({ crons: ["0 * * * *"] });

    expect(harness.calls).toHaveLength(4);
    expect(harness.calls[1].args).toContain(PRIVILEGED_ROLE_COUNT_QUERY);
    expect(harness.calls[3].args).toEqual([
      "exec",
      "wrangler",
      "deploy",
      "--config",
      GENERATED_PATH,
      "--secrets-file",
      secretsPath,
    ]);
    expect(harness.logs.join("\n")).toContain(
      "triggerless bootstrap (no domain, route, or cron)",
    );
  });

  it("rejects triggerless bootstrap when community mutations are enabled", async () => {
    const harness = makeHarness("production", { remoteWritable: true });
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "production.json",
    );
    harness.files.set(
      approvalPath,
      JSON.stringify(
        approval("production", true, {}, "production-triggerless-bootstrap"),
      ),
    );

    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow(/read-only production target|read-only release target/);
    expect(harness.calls).toHaveLength(0);
  });

  it("rejects triggerless bootstrap when production cutover is approved", async () => {
    const harness = makeHarness("production");
    const approvalPath = path.join(
      CWD,
      ".deployment-readiness",
      "production.json",
    );
    const body = approval(
      "production",
      false,
      {},
      "production-triggerless-bootstrap",
    );
    body.confirmations.productionCutoverApproved = true;
    harness.files.set(approvalPath, JSON.stringify(body));

    await expect(
      runRelease(
        { cwd: CWD, target: "production", intent: "deploy" },
        harness.dependencies,
      ),
    ).rejects.toThrow("Bootstrap production cutover state");
    expect(harness.calls).toHaveLength(0);
  });
});
