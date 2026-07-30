export const LOCAL_PLAYWRIGHT_BASE_URL = "http://127.0.0.1:4173";
export const STAGING_PLAYWRIGHT_ORIGIN = "https://staging.tomodachi.pw";

export const PLAYWRIGHT_ANALYTICS_MODES = [
  "configured-provider",
  "no-provider",
] as const;

export type PlaywrightAnalyticsMode =
  (typeof PLAYWRIGHT_ANALYTICS_MODES)[number];

export type PlaywrightHostedMode = {
  analyticsMode: PlaywrightAnalyticsMode;
  baseURL: string;
  hosted: boolean;
};

type Environment = Readonly<Record<string, string | undefined>>;

function parseAnalyticsMode(
  value: string | undefined,
  hosted: boolean,
): PlaywrightAnalyticsMode {
  if (value === undefined || value === "") {
    if (hosted) {
      throw new Error(
        "PLAYWRIGHT_ANALYTICS_MODE is required when PLAYWRIGHT_BASE_URL is set. " +
          "Use no-provider to declare the deployed bundle's expected state.",
      );
    }
    return "configured-provider";
  }

  if (!PLAYWRIGHT_ANALYTICS_MODES.includes(value as PlaywrightAnalyticsMode)) {
    throw new Error(
      `Invalid PLAYWRIGHT_ANALYTICS_MODE "${value}". ` +
        "Expected configured-provider or no-provider.",
    );
  }

  return value as PlaywrightAnalyticsMode;
}

function parseHostedBaseURL(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PLAYWRIGHT_BASE_URL must be a valid absolute URL.");
  }

  const exactOrigin =
    value === STAGING_PLAYWRIGHT_ORIGIN ||
    value === `${STAGING_PLAYWRIGHT_ORIGIN}/`;
  if (
    !exactOrigin ||
    url.origin !== STAGING_PLAYWRIGHT_ORIGIN ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `Hosted Playwright runs are restricted to ${STAGING_PLAYWRIGHT_ORIGIN}. ` +
        "Production, arbitrary hosts, credentials, ports, paths, queries, and fragments are not allowed.",
    );
  }

  return url.origin;
}

export function resolvePlaywrightHostedMode(
  environment: Environment,
): PlaywrightHostedMode {
  const rawRequestedBaseURL = environment.PLAYWRIGHT_BASE_URL;
  const hosted = rawRequestedBaseURL !== undefined;

  if (hosted && rawRequestedBaseURL.trim() === "") {
    throw new Error("PLAYWRIGHT_BASE_URL cannot be blank when set.");
  }

  const requestedBaseURL = rawRequestedBaseURL?.trim();
  const baseURL = hosted
    ? parseHostedBaseURL(requestedBaseURL as string)
    : LOCAL_PLAYWRIGHT_BASE_URL;
  const analyticsMode = parseAnalyticsMode(
    environment.PLAYWRIGHT_ANALYTICS_MODE?.trim(),
    hosted,
  );

  if (hosted && analyticsMode !== "no-provider") {
    throw new Error(
      "Hosted Playwright runs only support PLAYWRIGHT_ANALYTICS_MODE=no-provider. " +
        "Configured-provider coverage is restricted to the intercepted local test fixture.",
    );
  }

  return {
    analyticsMode,
    baseURL,
    hosted,
  };
}
