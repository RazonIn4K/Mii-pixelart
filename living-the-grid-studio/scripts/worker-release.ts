import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type ReleaseTarget = "local" | "staging" | "production";
export type ReleaseIntent = "dry-run" | "deploy";

export interface ReleaseOptions {
  cwd: string;
  target: ReleaseTarget;
  intent: ReleaseIntent;
}

export interface CommandOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GitState {
  commit: string;
  dirty: boolean;
}

export interface FileStat {
  mtimeMs: number;
}

export interface ReleaseDependencies {
  readText(filePath: string): Promise<string>;
  statFile(filePath: string): Promise<FileStat>;
  runCommand(
    command: string,
    args: readonly string[],
    options: CommandOptions,
  ): Promise<CommandResult>;
  getGitState(cwd: string): Promise<GitState>;
  isPathIgnored(cwd: string, relativePath: string): Promise<boolean>;
  now(): number;
  log(level: "info" | "warn", message: string): void;
}

export interface ReleaseResult {
  target: ReleaseTarget;
  intent: ReleaseIntent;
  warnings: readonly string[];
}

export class ReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseError";
  }
}

const TARGETS: Record<
  ReleaseTarget,
  {
    workerName: string;
    environment: ReleaseTarget;
    siteUrl: string;
    redirectUri: string;
    d1Name: string;
    r2Name: string;
  }
> = {
  local: {
    workerName: "tomodachi-studio",
    environment: "local",
    siteUrl: "http://localhost:3000",
    redirectUri: "http://localhost:3000/api/auth/google/callback",
    d1Name: "tomodachi-studio-local",
    r2Name: "tomodachi-studio-projects-local",
  },
  staging: {
    workerName: "tomodachi-studio-staging",
    environment: "staging",
    siteUrl: "https://staging.tomodachi.pw",
    redirectUri: "https://staging.tomodachi.pw/api/auth/google/callback",
    d1Name: "tomodachi-studio-staging",
    r2Name: "tomodachi-studio-projects-staging",
  },
  production: {
    workerName: "tomodachi-studio-production",
    environment: "production",
    siteUrl: "https://tomodachi.pw",
    redirectUri: "https://tomodachi.pw/api/auth/google/callback",
    d1Name: "tomodachi-studio-production",
    r2Name: "tomodachi-studio-projects-production",
  },
};

const EXPECTED_RATE_LIMITS = [
  { name: "AUTH_RATE_LIMITER", limit: 10, period: 60 },
  { name: "SAVE_RATE_LIMITER", limit: 30, period: 60 },
  { name: "SOCIAL_RATE_LIMITER", limit: 60, period: 60 },
  { name: "DISCOVERY_RATE_LIMITER", limit: 120, period: 60 },
  { name: "COMMENT_RATE_LIMITER", limit: 10, period: 60 },
] as const;

const REQUIRED_ASSET_ROUTES = [
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
] as const;

const REQUIRED_SECRETS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "OIDC_COOKIE_KEY",
  "SESSION_PEPPER",
  "PSEUDONYM_KEY",
  "OPENROUTER_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

const LEGAL_FILES = [
  "client/src/pages/Terms.tsx",
  "client/src/pages/Privacy.tsx",
  "client/src/pages/Cookies.tsx",
  "client/src/pages/community/CommunityGuidelines.tsx",
  "client/src/pages/community/Copyright.tsx",
] as const;

const LEGAL_MARKERS = [
  /substitute this section before launch/i,
  /template language[.]?\s+substitute/i,
  /substitute the placeholder/i,
  /operator entity before going live/i,
] as const;

const COMMON_CONFIRMATIONS = [
  "targetIsolationConfirmed",
  "bindingsVerified",
  "secretsConfigured",
  "migrationsApproved",
  "legalPlaceholdersReplaced",
  "adminModeratorAssigned",
  "pricingApproved",
  "rollbackReady",
  "deployApproved",
] as const;

const TARGET_CONFIRMATIONS: Record<
  "staging" | "production",
  readonly string[]
> = {
  staging: ["stagingDeployApproved"],
  production: ["stagingAcceptancePassed", "productionCutoverApproved"],
};

const APPROVAL_MAX_AGE_MS = 30 * 60 * 1_000;
const APPROVAL_CLOCK_SKEW_MS = 60 * 1_000;
const MAX_CAPTURE_BYTES = 64 * 1_024;
const USAGE =
  "Usage: tsx scripts/worker-release.ts --target local|staging|production --intent dry-run|deploy";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectAt(record: JsonRecord, key: string, label: string): JsonRecord {
  const value = record[key];
  if (!isRecord(value)) {
    throw new ReleaseError(`${label} is missing or invalid.`);
  }
  return value;
}

function arrayAt(record: JsonRecord, key: string, label: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new ReleaseError(`${label} is missing or invalid.`);
  }
  return value;
}

function expectExact(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new ReleaseError(
      `${label} does not match the selected release target.`,
    );
  }
}

function expectJsonExact(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new ReleaseError(`${label} does not match the release contract.`);
  }
}

function parseJson(text: string, label: string): JsonRecord {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new ReleaseError(`${label} is not valid JSON.`);
  }
}

/**
 * Removes JSONC comments without damaging URLs or comment-like text in strings.
 * Newlines and non-comment characters are retained to keep failures debuggable.
 */
export function stripJsonComments(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];

    if (lineComment) {
      if (current === "\n" || current === "\r") {
        lineComment = false;
        result += current;
      } else {
        result += " ";
      }
      continue;
    }

    if (blockComment) {
      if (current === "*" && next === "/") {
        result += "  ";
        index += 1;
        blockComment = false;
      } else {
        result += current === "\n" || current === "\r" ? current : " ";
      }
      continue;
    }

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }

    if (current === '"') {
      inString = true;
      result += current;
    } else if (current === "/" && next === "/") {
      result += "  ";
      index += 1;
      lineComment = true;
    } else if (current === "/" && next === "*") {
      result += "  ";
      index += 1;
      blockComment = true;
    } else {
      result += current;
    }
  }

  return result.replace(/^\uFEFF/, "");
}

function stripTrailingCommas(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    if (inString) {
      result += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }

    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }

    if (current === ",") {
      let lookahead = index + 1;
      while (/\s/.test(text[lookahead] ?? "")) lookahead += 1;
      if (text[lookahead] === "}" || text[lookahead] === "]") continue;
    }
    result += current;
  }

  return result;
}

export function parseJsonc(text: string, label = "Configuration"): JsonRecord {
  return parseJson(stripTrailingCommas(stripJsonComments(text)), label);
}

function selectedSourceConfig(
  source: JsonRecord,
  target: ReleaseTarget,
): JsonRecord {
  if (target === "local") return source;
  const environments = objectAt(source, "env", "Wrangler environments");
  return objectAt(environments, target, "Selected Wrangler environment");
}

interface BindingSnapshot {
  d1Id: string;
  kvId: string;
  communityMutationsEnabled: boolean;
}

function singleBinding(
  config: JsonRecord,
  key: string,
  binding: string,
  label: string,
): JsonRecord {
  const values = arrayAt(config, key, label);
  if (values.length !== 1 || !isRecord(values[0])) {
    throw new ReleaseError(`${label} must contain exactly one binding.`);
  }
  expectExact(values[0].binding, binding, `${label} binding`);
  return values[0];
}

function validateVariables(config: JsonRecord, target: ReleaseTarget): boolean {
  const expected = TARGETS[target];
  const vars = objectAt(config, "vars", "Environment variables");
  expectExact(vars.ENVIRONMENT, expected.environment, "Environment marker");
  expectExact(vars.PUBLIC_SITE_URL, expected.siteUrl, "Public site URL");
  expectExact(
    vars.GOOGLE_OIDC_REDIRECT_URI,
    expected.redirectUri,
    "OAuth redirect URI",
  );
  if (target === "local") {
    expectExact(
      vars.COMMUNITY_MUTATIONS_ENABLED,
      "true",
      "Community mutation mode",
    );
  } else if (
    vars.COMMUNITY_MUTATIONS_ENABLED !== "true" &&
    vars.COMMUNITY_MUTATIONS_ENABLED !== "false"
  ) {
    throw new ReleaseError(
      "Community mutation mode must be an explicit true or false string.",
    );
  }
  if (
    typeof vars.TERMS_VERSION !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(vars.TERMS_VERSION)
  ) {
    throw new ReleaseError("Terms version is missing or invalid.");
  }
  return vars.COMMUNITY_MUTATIONS_ENABLED === "true";
}

function validateRateLimits(config: JsonRecord): void {
  const configured = arrayAt(config, "ratelimits", "Rate-limit bindings");
  if (configured.length !== EXPECTED_RATE_LIMITS.length) {
    throw new ReleaseError(
      "Rate-limit bindings do not match the release contract.",
    );
  }

  for (const expected of EXPECTED_RATE_LIMITS) {
    const matches = configured.filter(
      (entry) => isRecord(entry) && entry.name === expected.name,
    );
    if (matches.length !== 1 || !isRecord(matches[0])) {
      throw new ReleaseError(
        "Rate-limit bindings do not match the release contract.",
      );
    }
    const simple = objectAt(matches[0], "simple", "Rate-limit policy");
    expectExact(simple.limit, expected.limit, "Rate-limit policy");
    expectExact(simple.period, expected.period, "Rate-limit policy");
    if (
      typeof matches[0].namespace_id !== "string" ||
      !/^\d+$/.test(matches[0].namespace_id)
    ) {
      throw new ReleaseError("Rate-limit namespace is missing or invalid.");
    }
  }
}

function validateAssets(config: JsonRecord): void {
  const assets = objectAt(config, "assets", "Static Assets binding");
  expectExact(assets.binding, "ASSETS", "Static Assets binding");
  expectExact(
    assets.not_found_handling,
    "single-page-application",
    "Static Assets SPA fallback",
  );
  expectJsonExact(
    assets.run_worker_first,
    REQUIRED_ASSET_ROUTES,
    "Worker-first routes",
  );
}

function requireUniqueStrings(values: unknown[], label: string): void {
  if (
    values.some((value) => typeof value !== "string" || value.length === 0) ||
    new Set(values).size !== values.length
  ) {
    throw new ReleaseError(
      `${label} are missing or are not isolated by target.`,
    );
  }
}

function validateSourceIsolation(source: JsonRecord): void {
  const workerNames: unknown[] = [];
  const siteUrls: unknown[] = [];
  const redirectUris: unknown[] = [];
  const d1Ids: unknown[] = [];
  const r2Names: unknown[] = [];
  const kvIds: unknown[] = [];
  const rateNamespaces: unknown[] = [];

  for (const target of ["local", "staging", "production"] as const) {
    const selected = selectedSourceConfig(source, target);
    const vars = objectAt(selected, "vars", "Environment variables");
    const d1 = singleBinding(selected, "d1_databases", "DB", "D1 bindings");
    const r2 = singleBinding(selected, "r2_buckets", "PROJECTS", "R2 bindings");
    const kv = singleBinding(
      selected,
      "kv_namespaces",
      "EDGE_CACHE",
      "KV bindings",
    );

    workerNames.push(target === "local" ? source.name : selected.name);
    siteUrls.push(vars.PUBLIC_SITE_URL);
    redirectUris.push(vars.GOOGLE_OIDC_REDIRECT_URI);
    d1Ids.push(d1.database_id);
    r2Names.push(r2.bucket_name);
    kvIds.push(kv.id);
    for (const rate of arrayAt(selected, "ratelimits", "Rate-limit bindings")) {
      rateNamespaces.push(isRecord(rate) ? rate.namespace_id : undefined);
    }
  }

  requireUniqueStrings(workerNames, "Worker names");
  requireUniqueStrings(siteUrls, "Public site URLs");
  requireUniqueStrings(redirectUris, "OAuth redirect URIs");
  requireUniqueStrings(d1Ids, "D1 resource IDs");
  requireUniqueStrings(r2Names, "R2 bucket names");
  requireUniqueStrings(kvIds, "KV resource IDs");
  requireUniqueStrings(rateNamespaces, "Rate-limit namespaces");
}

function validateSourceConfig(
  source: JsonRecord,
  target: ReleaseTarget,
): BindingSnapshot {
  const expected = TARGETS[target];
  expectExact(source.name, TARGETS.local.workerName, "Top-level Worker name");
  expectExact(source.main, "./worker/index.ts", "Worker source entry point");
  expectExact(source.compatibility_date, "2025-05-01", "Compatibility date");
  expectJsonExact(
    source.compatibility_flags,
    ["nodejs_compat"],
    "Compatibility flags",
  );

  const envs = objectAt(source, "env", "Wrangler environments");
  expectJsonExact(
    Object.keys(envs).sort(),
    ["production", "staging"],
    "Wrangler environments",
  );
  validateSourceIsolation(source);
  validateAssets(source);
  const triggers = objectAt(
    source,
    "triggers",
    "Scheduled trigger configuration",
  );
  expectJsonExact(triggers.crons, ["0 * * * *"], "Scheduled cleanup trigger");

  const selected = selectedSourceConfig(source, target);
  const selectedName = target === "local" ? source.name : selected.name;
  expectExact(selectedName, expected.workerName, "Selected Worker name");
  const communityMutationsEnabled = validateVariables(selected, target);

  const d1 = singleBinding(selected, "d1_databases", "DB", "D1 bindings");
  expectExact(d1.database_name, expected.d1Name, "D1 database name");
  expectExact(d1.migrations_dir, "./migrations", "D1 migrations directory");
  if (typeof d1.database_id !== "string") {
    throw new ReleaseError("D1 resource ID is missing or invalid.");
  }

  const r2 = singleBinding(selected, "r2_buckets", "PROJECTS", "R2 bindings");
  expectExact(r2.bucket_name, expected.r2Name, "R2 bucket name");

  const kv = singleBinding(
    selected,
    "kv_namespaces",
    "EDGE_CACHE",
    "KV bindings",
  );
  if (typeof kv.id !== "string") {
    throw new ReleaseError("KV resource ID is missing or invalid.");
  }

  const images = objectAt(selected, "images", "Images binding");
  expectExact(images.binding, "IMAGES", "Images binding");
  expectExact(images.remote, false, "Images local-processing guard");
  validateRateLimits(selected);

  const secrets = objectAt(selected, "secrets", "Required secret declaration");
  expectJsonExact(
    secrets.required,
    REQUIRED_SECRETS,
    "Required secret declaration",
  );

  return { d1Id: d1.database_id, kvId: kv.id, communityMutationsEnabled };
}

function bindingMap(config: JsonRecord): Map<string, JsonRecord> {
  const result = new Map<string, JsonRecord>();
  for (const entry of arrayAt(
    config,
    "ratelimits",
    "Generated rate-limit bindings",
  )) {
    if (
      !isRecord(entry) ||
      typeof entry.name !== "string" ||
      result.has(entry.name)
    ) {
      throw new ReleaseError(
        "Generated rate-limit bindings do not match the source configuration.",
      );
    }
    result.set(entry.name, entry);
  }
  return result;
}

function validateGeneratedConfig(
  generated: JsonRecord,
  source: JsonRecord,
  sourcePath: string,
  target: ReleaseTarget,
): void {
  const expected = TARGETS[target];
  const selected = selectedSourceConfig(source, target);

  expectExact(
    path.resolve(String(generated.configPath ?? "")),
    sourcePath,
    "Generated config source path",
  );
  expectExact(
    path.resolve(String(generated.userConfigPath ?? "")),
    sourcePath,
    "Generated user-config path",
  );
  expectExact(
    generated.topLevelName,
    TARGETS.local.workerName,
    "Generated top-level Worker name",
  );
  expectJsonExact(
    [
      ...(Array.isArray(generated.definedEnvironments)
        ? generated.definedEnvironments
        : []),
    ].sort(),
    ["production", "staging"],
    "Generated environment list",
  );
  expectExact(
    generated.targetEnvironment,
    target === "local" ? "" : target,
    "Generated target environment",
  );
  expectExact(generated.name, expected.workerName, "Generated Worker name");
  expectExact(
    generated.compatibility_date,
    source.compatibility_date,
    "Generated compatibility date",
  );
  expectJsonExact(
    generated.compatibility_flags,
    source.compatibility_flags,
    "Generated compatibility flags",
  );
  const sourceCommunityMutationsEnabled = validateVariables(selected, target);
  const generatedCommunityMutationsEnabled = validateVariables(
    generated,
    target,
  );
  expectExact(
    generatedCommunityMutationsEnabled,
    sourceCommunityMutationsEnabled,
    "Generated community mutation mode",
  );
  validateAssets(generated);
  const generatedTriggers = objectAt(
    generated,
    "triggers",
    "Generated scheduled triggers",
  );
  const sourceTriggers = objectAt(source, "triggers", "Scheduled triggers");
  expectJsonExact(
    generatedTriggers.crons,
    sourceTriggers.crons,
    "Generated scheduled triggers",
  );

  const generatedD1 = singleBinding(
    generated,
    "d1_databases",
    "DB",
    "Generated D1 bindings",
  );
  const sourceD1 = singleBinding(selected, "d1_databases", "DB", "D1 bindings");
  expectExact(
    generatedD1.database_name,
    sourceD1.database_name,
    "Generated D1 database name",
  );
  expectExact(
    generatedD1.database_id,
    sourceD1.database_id,
    "Generated D1 resource binding",
  );

  const generatedR2 = singleBinding(
    generated,
    "r2_buckets",
    "PROJECTS",
    "Generated R2 bindings",
  );
  const sourceR2 = singleBinding(
    selected,
    "r2_buckets",
    "PROJECTS",
    "R2 bindings",
  );
  expectExact(
    generatedR2.bucket_name,
    sourceR2.bucket_name,
    "Generated R2 bucket name",
  );

  const generatedKv = singleBinding(
    generated,
    "kv_namespaces",
    "EDGE_CACHE",
    "Generated KV bindings",
  );
  const sourceKv = singleBinding(
    selected,
    "kv_namespaces",
    "EDGE_CACHE",
    "KV bindings",
  );
  expectExact(generatedKv.id, sourceKv.id, "Generated KV resource binding");

  const generatedImages = objectAt(
    generated,
    "images",
    "Generated Images binding",
  );
  const sourceImages = objectAt(selected, "images", "Images binding");
  expectExact(
    generatedImages.binding,
    sourceImages.binding,
    "Generated Images binding",
  );
  expectExact(
    generatedImages.remote,
    sourceImages.remote,
    "Generated Images processing mode",
  );

  validateRateLimits(generated);
  const generatedRates = bindingMap(generated);
  const sourceRates = bindingMap(selected);
  for (const expectedRate of EXPECTED_RATE_LIMITS) {
    const generatedRate = generatedRates.get(expectedRate.name);
    const sourceRate = sourceRates.get(expectedRate.name);
    if (!generatedRate || !sourceRate) {
      throw new ReleaseError(
        "Generated rate-limit bindings do not match the source configuration.",
      );
    }
    expectExact(
      generatedRate.namespace_id,
      sourceRate.namespace_id,
      "Generated rate-limit namespace",
    );
  }
}

function hasSentinelValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (
    /(placeholder|replace|change[-_ ]?me|example|todo|sentinel)/i.test(
      normalized,
    )
  )
    return true;
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  return compact.length >= 8 && /^([a-z0-9])\1+$/.test(compact);
}

function validateRemoteResourceIds(snapshot: BindingSnapshot): void {
  if (
    hasSentinelValue(snapshot.d1Id) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      snapshot.d1Id,
    )
  ) {
    throw new ReleaseError(
      "A deploy resource binding still uses a sentinel or invalid ID.",
    );
  }
  if (
    hasSentinelValue(snapshot.kvId) ||
    !/^[0-9a-f]{32}$/i.test(snapshot.kvId)
  ) {
    throw new ReleaseError(
      "A deploy resource binding still uses a sentinel or invalid ID.",
    );
  }
}

function remoteTargetHasLocalValue(
  source: JsonRecord,
  target: "staging" | "production",
): boolean {
  const selected = selectedSourceConfig(source, target);
  const vars = objectAt(selected, "vars", "Environment variables");
  const d1 = singleBinding(selected, "d1_databases", "DB", "D1 bindings");
  const r2 = singleBinding(selected, "r2_buckets", "PROJECTS", "R2 bindings");
  const values = [
    selected.name,
    vars.PUBLIC_SITE_URL,
    vars.GOOGLE_OIDC_REDIRECT_URI,
    d1.database_name,
    r2.bucket_name,
  ];
  return values.some(
    (value) =>
      typeof value === "string" &&
      /(^|[-./:])local(host)?($|[-./:])/i.test(value),
  );
}

async function hasLegalMarkers(
  cwd: string,
  dependencies: ReleaseDependencies,
): Promise<boolean> {
  for (const relativePath of LEGAL_FILES) {
    let contents: string;
    try {
      contents = await dependencies.readText(path.join(cwd, relativePath));
    } catch {
      throw new ReleaseError(
        "A required legal document is missing or unreadable.",
      );
    }
    if (LEGAL_MARKERS.some((marker) => marker.test(contents))) return true;
  }
  return false;
}

function isNonPlaceholderApprovalText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 3 &&
    !hasSentinelValue(value) &&
    !/^(none|n\/a|na|test)$/i.test(value.trim())
  );
}

function requireApprovalText(
  record: JsonRecord,
  key: string,
  label: string,
): string {
  const value = record[key];
  if (!isNonPlaceholderApprovalText(value)) {
    throw new ReleaseError(`${label} is missing or placeholder text.`);
  }
  return value;
}

function validateAuditedInputs(
  approval: JsonRecord,
  target: "staging" | "production",
  communityMutationsEnabled: boolean,
): void {
  const infrastructure = objectAt(
    approval,
    "infrastructure",
    "Infrastructure approval inputs",
  );
  requireApprovalText(
    infrastructure,
    "cloudflareAccount",
    "Cloudflare account approval input",
  );
  requireApprovalText(
    infrastructure,
    "googleProject",
    "Google project approval input",
  );
  requireApprovalText(
    infrastructure,
    "domainControlConfirmation",
    "Domain-control approval input",
  );
  requireApprovalText(
    infrastructure,
    "cloudflarePricingDecision",
    "Cloudflare pricing approval input",
  );
  const imagesDecision = requireApprovalText(
    infrastructure,
    "imagesUsageDecision",
    "Images usage approval input",
  );
  if (imagesDecision !== "approved" && imagesDecision !== "not-required") {
    throw new ReleaseError("Images usage approval input is invalid.");
  }

  const legal = objectAt(approval, "legal", "Legal readiness inputs");
  requireApprovalText(legal, "operatorIdentity", "Legal operator input");
  requireApprovalText(legal, "jurisdiction", "Legal jurisdiction input");
  const postalAddress = requireApprovalText(
    legal,
    "postalAddress",
    "Legal postal-contact input",
  );
  if (postalAddress.length < 10) {
    throw new ReleaseError("Legal postal-contact input is invalid.");
  }
  const contactEmail = requireApprovalText(
    legal,
    "contactEmail",
    "Legal contact input",
  );
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new ReleaseError("Legal contact input is invalid.");
  }
  requireApprovalText(
    legal,
    "copyrightProcess",
    "Copyright-process approval input",
  );
  requireApprovalText(
    legal,
    "retentionConfirmation",
    "Retention approval input",
  );

  const owners = objectAt(approval, "owners", "Operational owner inputs");
  for (const idKey of ["adminInternalId", "moderatorInternalId"] as const) {
    const value = requireApprovalText(
      owners,
      idKey,
      "Privileged internal-ID input",
    );
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new ReleaseError("Privileged internal-ID input is invalid.");
    }
  }
  for (const ownerKey of [
    "legalOwner",
    "privacyOwner",
    "securityOwner",
    "helpOwner",
    "abuseOwner",
    "consult30FulfillmentOwner",
    "consult30FulfillmentProcess",
  ] as const) {
    requireApprovalText(owners, ownerKey, "Operational owner input");
  }

  const stripe = objectAt(approval, "stripe", "Stripe readiness inputs");
  expectExact(
    stripe.mode,
    target === "staging" ? "staging-test" : "production-live",
    "Stripe release mode",
  );
  requireApprovalText(stripe, "taxConfirmation", "Stripe tax approval input");

  const confirmations = objectAt(
    approval,
    "confirmations",
    "Deployment confirmations",
  );
  expectExact(
    confirmations.communityMutationsEnabled,
    communityMutationsEnabled,
    "Approved community mutation mode",
  );
  if (
    communityMutationsEnabled &&
    confirmations.writableCommunityDeployApproved !== true
  ) {
    throw new ReleaseError(
      "Writable community deployment requires explicit approval.",
    );
  }
}

async function validateApproval(
  cwd: string,
  target: "staging" | "production",
  communityMutationsEnabled: boolean,
  dependencies: ReleaseDependencies,
): Promise<void> {
  const relativePath = path.join(".deployment-readiness", `${target}.json`);
  const approvalPath = path.join(cwd, relativePath);
  let raw: string;
  let fileStat: FileStat;
  try {
    [raw, fileStat] = await Promise.all([
      dependencies.readText(approvalPath),
      dependencies.statFile(approvalPath),
    ]);
  } catch {
    throw new ReleaseError(
      "The target-specific deployment approval is missing or unreadable.",
    );
  }

  const approval = parseJson(raw, "Deployment approval");
  expectExact(approval.schemaVersion, 1, "Deployment approval schema");
  expectExact(approval.target, target, "Deployment approval target");
  expectExact(approval.intent, "deploy", "Deployment approval intent");
  if (!isNonPlaceholderApprovalText(approval.approvedBy)) {
    throw new ReleaseError(
      "Deployment approval identity is missing or placeholder text.",
    );
  }
  if (!isNonPlaceholderApprovalText(approval.changeTicket)) {
    throw new ReleaseError(
      "Deployment approval change reference is missing or placeholder text.",
    );
  }

  const approvedAt =
    typeof approval.approvedAt === "string"
      ? Date.parse(approval.approvedAt)
      : Number.NaN;
  const currentTime = dependencies.now();
  if (
    !Number.isFinite(approvedAt) ||
    approvedAt > currentTime + APPROVAL_CLOCK_SKEW_MS ||
    currentTime - approvedAt > APPROVAL_MAX_AGE_MS ||
    fileStat.mtimeMs > currentTime + APPROVAL_CLOCK_SKEW_MS ||
    currentTime - fileStat.mtimeMs > APPROVAL_MAX_AGE_MS
  ) {
    throw new ReleaseError(
      "Deployment approval is stale or has an invalid timestamp.",
    );
  }

  const confirmations = objectAt(
    approval,
    "confirmations",
    "Deployment confirmations",
  );
  for (const confirmation of [
    ...COMMON_CONFIRMATIONS,
    ...TARGET_CONFIRMATIONS[target],
  ]) {
    if (confirmations[confirmation] !== true) {
      throw new ReleaseError(
        "Deployment approval is missing one or more required confirmations.",
      );
    }
  }
  validateAuditedInputs(approval, target, communityMutationsEnabled);

  if (!(await dependencies.isPathIgnored(cwd, relativePath))) {
    throw new ReleaseError(
      "The deployment approval file is not protected by the repository ignore rules.",
    );
  }

  const git = await dependencies.getGitState(cwd);
  if (!/^[0-9a-f]{40}$/i.test(git.commit)) {
    throw new ReleaseError("The current Git commit could not be verified.");
  }
  if (git.dirty) {
    throw new ReleaseError(
      "Deploy requires a clean working tree bound to the approved commit.",
    );
  }
  if (approval.gitCommit !== git.commit) {
    throw new ReleaseError(
      "Deployment approval is not bound to the current Git commit.",
    );
  }
}

async function readSourceConfig(
  sourcePath: string,
  dependencies: ReleaseDependencies,
): Promise<JsonRecord> {
  try {
    return parseJsonc(
      await dependencies.readText(sourcePath),
      "Wrangler source configuration",
    );
  } catch (error) {
    if (error instanceof ReleaseError) throw error;
    throw new ReleaseError(
      "Wrangler source configuration is missing or unreadable.",
    );
  }
}

async function runStep(
  label: string,
  args: readonly string[],
  options: CommandOptions,
  dependencies: ReleaseDependencies,
): Promise<void> {
  let result: CommandResult;
  try {
    result = await dependencies.runCommand("pnpm", args, options);
  } catch {
    throw new ReleaseError(`${label} could not be started.`);
  }
  if (result.exitCode !== 0) {
    throw new ReleaseError(
      `${label} failed with exit code ${result.exitCode}.`,
    );
  }
}

export async function runRelease(
  options: ReleaseOptions,
  dependencies: ReleaseDependencies = createNodeDependencies(),
): Promise<ReleaseResult> {
  const cwd = path.resolve(options.cwd);
  const sourcePath = path.join(cwd, "wrangler.jsonc");
  const generatedPath = path.join(
    cwd,
    "dist",
    "tomodachi_studio",
    "wrangler.json",
  );
  const warnings: string[] = [];

  dependencies.log(
    "info",
    `Release preflight started for ${options.target} ${options.intent}.`,
  );
  if (options.intent === "deploy" && options.target === "local") {
    throw new ReleaseError(
      "Deploy intent is allowed only for staging or production.",
    );
  }

  const source = await readSourceConfig(sourcePath, dependencies);
  const bindings = validateSourceConfig(source, options.target);
  const legalMarkersPresent = await hasLegalMarkers(cwd, dependencies);

  if (options.intent === "deploy") {
    const remoteTarget = options.target as "staging" | "production";
    if (remoteTargetHasLocalValue(source, remoteTarget)) {
      throw new ReleaseError(
        "A deploy target contains a local-only name or URL.",
      );
    }
    validateRemoteResourceIds(bindings);
    if (legalMarkersPresent) {
      throw new ReleaseError(
        "Legal launch markers remain in a required public document.",
      );
    }
    await validateApproval(
      cwd,
      remoteTarget,
      bindings.communityMutationsEnabled,
      dependencies,
    );
  } else {
    if (hasSentinelValue(bindings.d1Id) || hasSentinelValue(bindings.kvId)) {
      warnings.push(
        "Selected target contains placeholder resource bindings; dry-run mode remains non-deploying.",
      );
    }
    if (legalMarkersPresent) {
      warnings.push(
        "Legal launch markers remain; dry-run mode remains non-deploying.",
      );
    }
    if (options.target !== "local" && bindings.communityMutationsEnabled) {
      warnings.push(
        "Selected remote target has community mutations enabled; dry-run mode remains non-deploying.",
      );
    }
  }

  for (const warning of warnings) dependencies.log("warn", warning);

  dependencies.log("info", "Building the selected Worker environment.");
  await runStep(
    "Worker build",
    ["build"],
    {
      cwd,
      env: {
        ...process.env,
        CLOUDFLARE_ENV: options.target === "local" ? "" : options.target,
      },
    },
    dependencies,
  );

  let generated: JsonRecord;
  try {
    generated = parseJson(
      await dependencies.readText(generatedPath),
      "Generated Wrangler configuration",
    );
  } catch (error) {
    if (error instanceof ReleaseError) throw error;
    throw new ReleaseError(
      "Generated Wrangler configuration is missing or unreadable.",
    );
  }
  validateGeneratedConfig(generated, source, sourcePath, options.target);

  const deployArgs = ["exec", "wrangler", "deploy", "--config", generatedPath];
  if (options.intent === "dry-run") deployArgs.push("--dry-run");
  dependencies.log(
    "info",
    options.intent === "dry-run"
      ? "Running Wrangler dry-run validation."
      : "Running approved Wrangler deploy.",
  );
  await runStep(
    "Wrangler release command",
    deployArgs,
    { cwd, env: { ...process.env } },
    dependencies,
  );
  dependencies.log(
    "info",
    options.intent === "dry-run"
      ? "Dry-run validation completed."
      : "Approved deploy completed.",
  );

  return { target: options.target, intent: options.intent, warnings };
}

export function parseCliArgs(
  args: readonly string[],
): Pick<ReleaseOptions, "target" | "intent"> {
  let target: string | undefined;
  let intent: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key !== "--target" && key !== "--intent") {
      throw new ReleaseError("Unknown or malformed release argument.");
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new ReleaseError(
        "Release target and intent must both be explicit.",
      );
    }
    if (key === "--target") {
      if (target !== undefined)
        throw new ReleaseError("Release target may be provided only once.");
      target = value;
    } else {
      if (intent !== undefined)
        throw new ReleaseError("Release intent may be provided only once.");
      intent = value;
    }
    index += 1;
  }

  if (!target || !intent) {
    throw new ReleaseError("Release target and intent must both be explicit.");
  }
  if (target !== "local" && target !== "staging" && target !== "production") {
    throw new ReleaseError(
      "Release target must be local, staging, or production.",
    );
  }
  if (intent !== "dry-run" && intent !== "deploy") {
    throw new ReleaseError("Release intent must be dry-run or deploy.");
  }
  return { target, intent };
}

function appendBounded(current: string, chunk: unknown): string {
  if (current.length >= MAX_CAPTURE_BYTES) return current;
  return (current + String(chunk)).slice(0, MAX_CAPTURE_BYTES);
}

function spawnCaptured(
  command: string,
  args: readonly string[],
  options: CommandOptions,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.once("error", reject);
    child.once("close", (code) =>
      resolve({ exitCode: code ?? 1, stdout, stderr }),
    );
  });
}

async function nodeGitState(cwd: string): Promise<GitState> {
  const env = { ...process.env };
  const commitResult = await spawnCaptured(
    "git",
    ["rev-parse", "--verify", "HEAD"],
    { cwd, env },
  );
  const statusResult = await spawnCaptured(
    "git",
    ["status", "--porcelain", "--untracked-files=normal"],
    { cwd, env },
  );
  if (commitResult.exitCode !== 0 || statusResult.exitCode !== 0) {
    throw new ReleaseError("Git release state could not be verified.");
  }
  return {
    commit: commitResult.stdout.trim(),
    dirty: statusResult.stdout.trim().length > 0,
  };
}

async function nodePathIgnored(
  cwd: string,
  relativePath: string,
): Promise<boolean> {
  const result = await spawnCaptured(
    "git",
    ["check-ignore", "--quiet", "--", relativePath],
    { cwd, env: { ...process.env } },
  );
  if (result.exitCode === 0) return true;
  if (result.exitCode === 1) return false;
  throw new ReleaseError("Repository ignore rules could not be verified.");
}

export function createNodeDependencies(): ReleaseDependencies {
  return {
    readText: (filePath) => readFile(filePath, "utf8"),
    statFile: async (filePath) => {
      const result = await stat(filePath);
      return { mtimeMs: result.mtimeMs };
    },
    runCommand: spawnCaptured,
    getGitState: nodeGitState,
    isPathIgnored: nodePathIgnored,
    now: Date.now,
    log(level, message) {
      const writer = level === "warn" ? console.warn : console.error;
      writer(`[worker-release] ${message}`);
    },
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  try {
    const options = parseCliArgs(args);
    await runRelease({ ...options, cwd: process.cwd() });
  } catch (error) {
    const message =
      error instanceof ReleaseError
        ? error.message
        : "Unexpected release-preflight failure.";
    console.error(`[worker-release] ${message}`);
    console.error(USAGE);
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === entryPath) {
  void main();
}
