type CloudflareError = {
  code?: number;
  message?: string;
};

type CloudflareResponse<T> = {
  success: boolean;
  result: T;
  errors?: CloudflareError[];
  messages?: CloudflareError[];
};

type Zone = {
  id: string;
  name: string;
};

type Account = {
  id: string;
  name: string;
};

type PagesProject = {
  name: string;
};

type PagesDomain = {
  name: string;
  zone_tag?: string;
};

type BotManagementConfig = Record<string, unknown>;

type RulesetSummary = {
  id: string;
  name: string;
  phase: string;
  kind: string;
  version?: string;
};

type RulesetRule = {
  id?: string;
  ref?: string;
  description?: string;
  action?: string;
  expression?: string;
  enabled?: boolean;
  action_parameters?: unknown;
};

type RulesetDetail = RulesetSummary & {
  rules?: RulesetRule[];
};

type SkipRuleFinding = {
  ruleset: string;
  phase: string;
  rule: string;
  enabled: boolean;
  expression: string;
  skipTargets: string;
  recommendation: string;
};

const API_BASE = "https://api.cloudflare.com/client/v4";
const TARGET_ZONE_NAME = process.env.CLOUDFLARE_ZONE_NAME ?? "tomodachi.pw";
const APPLY = process.argv.includes("--apply");

const BOT_PAYLOAD_KEYS = new Set([
  "ai_bots_protection",
  "auto_update_model",
  "bm_cookie_enabled",
  "cf_robots_variant",
  "content_bots_protection",
  "crawler_protection",
  "enable_js",
  "fight_mode",
  "is_robots_txt_managed",
  "optimize_wordpress",
  "sbfm_definitely_automated",
  "sbfm_likely_automated",
  "sbfm_static_resource_protection",
  "sbfm_verified_bots",
  "suppress_session_score",
]);

const SECURITY_PHASES = new Set([
  "http_request_firewall_custom",
  "http_request_firewall_managed",
  "http_ratelimit",
  "http_request_sbfm",
]);

function requireToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_API_TOKEN;
  if (!token) {
    throw new Error(
      "Set CLOUDFLARE_API_TOKEN or CF_API_TOKEN before running this script.",
    );
  }
  return token;
}

async function cloudflareFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = requireToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = (await response.json()) as CloudflareResponse<T>;
  if (!response.ok || !body.success) {
    const errors = body.errors
      ?.map((error) =>
        error.code ? `${error.code}: ${error.message}` : error.message,
      )
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `${path} failed: ${errors || `Cloudflare API returned ${response.status}`}`,
    );
  }
  return body.result;
}

async function resolveZoneId(): Promise<string> {
  if (process.env.CLOUDFLARE_ZONE_ID) {
    return process.env.CLOUDFLARE_ZONE_ID;
  }

  try {
    const zones = await cloudflareFetch<Zone[]>(
      `/zones?name=${encodeURIComponent(TARGET_ZONE_NAME)}&per_page=1`,
    );
    const zone = zones.find((candidate) => candidate.name === TARGET_ZONE_NAME);
    if (zone) {
      return zone.id;
    }
  } catch (error) {
    console.warn(
      `Zone list lookup failed, trying Pages custom-domain lookup: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }

  const accounts = await cloudflareFetch<Account[]>("/accounts?per_page=50");
  for (const account of accounts) {
    const projects = await cloudflareFetch<PagesProject[]>(
      `/accounts/${account.id}/pages/projects`,
    );

    for (const project of projects) {
      const domains = await cloudflareFetch<PagesDomain[]>(
        `/accounts/${account.id}/pages/projects/${project.name}/domains`,
      );
      const matchingDomain = domains.find(
        (domain) => domain.name === TARGET_ZONE_NAME && domain.zone_tag,
      );
      if (matchingDomain?.zone_tag) {
        return matchingDomain.zone_tag;
      }
    }
  }

  throw new Error(
    `Could not find Cloudflare zone ${TARGET_ZONE_NAME}. Set CLOUDFLARE_ZONE_ID if the token cannot list zones or Pages custom domains.`,
  );
}

function buildBotManagementPayload(
  current: BotManagementConfig,
): BotManagementConfig {
  const payload: BotManagementConfig = {};

  for (const [key, value] of Object.entries(current)) {
    if (BOT_PAYLOAD_KEYS.has(key) && value !== undefined && value !== null) {
      payload[key] = value;
    }
  }

  payload.ai_bots_protection = "block";
  payload.crawler_protection = "enabled";
  payload.is_robots_txt_managed = true;
  payload.cf_robots_variant = "policy_only";

  return payload;
}

function stringifySkipTargets(actionParameters: unknown): string {
  if (!actionParameters) return "unspecified";
  if (typeof actionParameters !== "object") {
    return String(actionParameters);
  }
  return JSON.stringify(actionParameters);
}

function looksBroad(expression: string): boolean {
  const normalized = expression.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "true" || normalized === "(true)") return true;
  if (normalized.includes("1 == 1") || normalized.includes("1==1")) return true;

  const scopingSignals = [
    "http.host",
    "http.request.uri.path",
    "http.request.method",
    "ip.src",
    "cf.client.bot",
    "cf.bot_management",
  ];

  return !scopingSignals.some((signal) => normalized.includes(signal));
}

function containsBotSkipTarget(actionParameters: unknown): boolean {
  return stringifySkipTargets(actionParameters).includes("http_request_sbfm");
}

function findingFor(
  ruleset: RulesetDetail,
  rule: RulesetRule,
): SkipRuleFinding {
  const expression = rule.expression ?? "";
  const skipTargets = stringifySkipTargets(rule.action_parameters);
  const broad = looksBroad(expression);
  const skipsBot = containsBotSkipTarget(rule.action_parameters);
  const recommendation = skipsBot
    ? "Review first: this can bypass Super Bot Fight Mode and weaken AI bot blocking."
    : broad
      ? "Reduce scope or remove if no longer needed."
      : "Keep only if this exact exception is still required.";

  return {
    ruleset: ruleset.name,
    phase: ruleset.phase,
    rule: rule.description ?? rule.ref ?? rule.id ?? "(unnamed skip rule)",
    enabled: rule.enabled !== false,
    expression: expression || "(no expression)",
    skipTargets,
    recommendation,
  };
}

async function auditSkipRules(zoneId: string): Promise<SkipRuleFinding[]> {
  const summaries = await cloudflareFetch<RulesetSummary[]>(
    `/zones/${zoneId}/rulesets?per_page=50`,
  );
  const relevant = summaries.filter((ruleset) =>
    SECURITY_PHASES.has(ruleset.phase),
  );
  const findings: SkipRuleFinding[] = [];

  for (const summary of relevant) {
    const detail = await cloudflareFetch<RulesetDetail>(
      `/zones/${zoneId}/rulesets/${summary.id}`,
    );
    for (const rule of detail.rules ?? []) {
      if (rule.action === "skip") {
        findings.push(findingFor(detail, rule));
      }
    }
  }

  return findings;
}

async function main(): Promise<void> {
  const zoneId = await resolveZoneId();
  console.log(`Cloudflare zone: ${TARGET_ZONE_NAME} (${zoneId})`);

  let blocked = false;

  try {
    const currentBotConfig = await cloudflareFetch<BotManagementConfig>(
      `/zones/${zoneId}/bot_management`,
    );
    const desiredBotConfig = buildBotManagementPayload(currentBotConfig);

    console.log("\nRecommended Bot Management settings:");
    console.log(
      JSON.stringify(
        {
          ai_bots_protection: desiredBotConfig.ai_bots_protection,
          crawler_protection: desiredBotConfig.crawler_protection,
          is_robots_txt_managed: desiredBotConfig.is_robots_txt_managed,
          cf_robots_variant: desiredBotConfig.cf_robots_variant,
        },
        null,
        2,
      ),
    );

    if (APPLY) {
      await cloudflareFetch<BotManagementConfig>(
        `/zones/${zoneId}/bot_management`,
        {
          method: "PUT",
          body: JSON.stringify(desiredBotConfig),
        },
      );
      console.log("\nApplied Bot Management settings.");
    } else {
      console.log(
        "\nDry run only. Re-run with --apply to update Bot Management.",
      );
    }
  } catch (error) {
    blocked = true;
    console.error(
      `\nBot Management update unavailable: ${
        error instanceof Error ? error.message : error
      }`,
    );
    console.error(
      "The token needs zone-level permission for Bot Management settings on this zone.",
    );
  }

  try {
    const skipFindings = await auditSkipRules(zoneId);
    console.log(`\nSkip rules found: ${skipFindings.length}`);
    if (skipFindings.length > 0) {
      console.table(skipFindings);
      console.log(
        "\nSkip rules are audit-only in this script. Remove or narrow them in Cloudflare after reviewing whether they are still needed.",
      );
    }
  } catch (error) {
    blocked = true;
    console.error(
      `\nSkip-rule audit unavailable: ${
        error instanceof Error ? error.message : error
      }`,
    );
    console.error(
      "The token needs zone-level Rulesets/WAF read permission to audit skip rules.",
    );
  }

  if (blocked) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
