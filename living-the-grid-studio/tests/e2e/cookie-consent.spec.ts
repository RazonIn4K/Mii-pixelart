import { expect, test, type Page } from "@playwright/test";

const ANALYTICS_PATH = "/__test/analytics/umami";
const ANALYTICS_SCRIPT = "#tomodachi-opt-in-analytics";
const CONSENT_DIALOG = "Cookie consent";
const CONSENT_STORAGE_KEY = "ltg.consent.v1";
const MARKETING_SCRIPT_SELECTOR = [
  'script[src*="googlesyndication.com"]',
  'script[src*="doubleclick.net"]',
  'script[src*="googleadservices.com"]',
].join(", ");

type StoredConsent = {
  analytics: boolean;
  decidedAt: string | null;
  decision: "accepted" | "rejected" | "unset";
  essential: boolean;
  marketing: boolean;
};

type NonEssentialProbe = {
  analyticsRequests: string[];
  marketingRequests: string[];
};

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Consent storage and script gating are viewport-independent.",
  );
});

async function installNonEssentialProbe(
  page: Page,
): Promise<NonEssentialProbe> {
  const probe: NonEssentialProbe = {
    analyticsRequests: [],
    marketingRequests: [],
  };

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === ANALYTICS_PATH) {
      probe.analyticsRequests.push(request.url());
    }
    if (
      url.hostname === "pagead2.googlesyndication.com" ||
      url.hostname.endsWith(".googlesyndication.com") ||
      url.hostname.endsWith(".doubleclick.net") ||
      url.hostname.endsWith(".googleadservices.com")
    ) {
      probe.marketingRequests.push(request.url());
    }
  });

  await page.route(`**${ANALYTICS_PATH}`, (route) =>
    route.fulfill({
      body: `globalThis.__tomodachiAnalyticsLoads = (globalThis.__tomodachiAnalyticsLoads ?? 0) + 1;`,
      contentType: "application/javascript; charset=utf-8",
      status: 200,
    }),
  );

  return probe;
}

async function readStoredConsent(page: Page): Promise<StoredConsent | null> {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as StoredConsent) : null;
  }, CONSENT_STORAGE_KEY);
}

async function expectDecision(
  page: Page,
  expected: Pick<StoredConsent, "analytics" | "decision" | "marketing">,
): Promise<StoredConsent> {
  const state = await readStoredConsent(page);
  expect(state).toMatchObject({ ...expected, essential: true });
  expect(state?.decidedAt).not.toBeNull();
  expect(Number.isNaN(Date.parse(state?.decidedAt ?? ""))).toBe(false);
  return state as StoredConsent;
}

async function expectNoNonEssentialLoading(
  page: Page,
  probe: NonEssentialProbe,
): Promise<void> {
  await expect(page.locator(ANALYTICS_SCRIPT)).toHaveCount(0);
  await expect(page.locator(MARKETING_SCRIPT_SELECTOR)).toHaveCount(0);
  expect(probe.analyticsRequests).toEqual([]);
  expect(probe.marketingRequests).toEqual([]);
}

test("Essential only blocks non-essential loading and persists across reloads", async ({
  page,
}) => {
  const probe = await installNonEssentialProbe(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("dialog", { name: CONSENT_DIALOG }),
  ).toBeVisible();
  expect(await readStoredConsent(page)).toBeNull();
  await expectNoNonEssentialLoading(page, probe);

  await page.getByRole("button", { name: "Essential only" }).click();
  await expect(page.getByRole("dialog", { name: CONSENT_DIALOG })).toHaveCount(
    0,
  );
  const originalDecision = await expectDecision(page, {
    analytics: false,
    decision: "rejected",
    marketing: false,
  });

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("dialog", { name: CONSENT_DIALOG })).toHaveCount(
    0,
  );
  const persistedDecision = await expectDecision(page, {
    analytics: false,
    decision: "rejected",
    marketing: false,
  });
  expect(persistedDecision.decidedAt).toBe(originalDecision.decidedAt);
  await expectNoNonEssentialLoading(page, probe);
});

test("Accept all enables configured analytics only after opt-in and persists", async ({
  page,
}) => {
  const probe = await installNonEssentialProbe(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await expectNoNonEssentialLoading(page, probe);

  await page.getByRole("button", { name: "Accept all" }).click();
  await expect(page.locator(ANALYTICS_SCRIPT)).toHaveAttribute(
    "data-website-id",
    "playwright-consent-site",
  );
  await expect.poll(() => probe.analyticsRequests.length).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __tomodachiAnalyticsLoads?: number;
            }
          ).__tomodachiAnalyticsLoads ?? 0,
      ),
    )
    .toBe(1);
  const originalDecision = await expectDecision(page, {
    analytics: true,
    decision: "accepted",
    marketing: true,
  });

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("dialog", { name: CONSENT_DIALOG })).toHaveCount(
    0,
  );
  await expect(page.locator(ANALYTICS_SCRIPT)).toHaveCount(1);
  await expect.poll(() => probe.analyticsRequests.length).toBe(2);
  const persistedDecision = await expectDecision(page, {
    analytics: true,
    decision: "accepted",
    marketing: true,
  });
  expect(persistedDecision.decidedAt).toBe(originalDecision.decidedAt);
});

test("reset preferences unloads analytics and restores the consent choice", async ({
  page,
}) => {
  const probe = await installNonEssentialProbe(page);

  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Accept all" }).click();
  await expect.poll(() => probe.analyticsRequests.length).toBe(1);

  await page.goto("/cookies", { waitUntil: "networkidle" });
  await expect(page.locator(ANALYTICS_SCRIPT)).toHaveCount(1);
  const requestsBeforeReset = probe.analyticsRequests.length;
  const reloaded = page.waitForEvent(
    "framenavigated",
    (frame) => frame === page.mainFrame(),
  );
  await page.getByRole("button", { name: "Reset cookie preferences" }).click();
  await reloaded;
  await page.waitForLoadState("networkidle");

  expect(await readStoredConsent(page)).toBeNull();
  await expect(page.locator(ANALYTICS_SCRIPT)).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: CONSENT_DIALOG }),
  ).toBeVisible();
  expect(probe.analyticsRequests).toHaveLength(requestsBeforeReset);

  await page.getByRole("button", { name: "Essential only" }).click();
  await expectDecision(page, {
    analytics: false,
    decision: "rejected",
    marketing: false,
  });
  await page.getByRole("button", { name: "Reset cookie preferences" }).click();

  expect(await readStoredConsent(page)).toBeNull();
  await expect(
    page.getByText("Preferences cleared.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: CONSENT_DIALOG }),
  ).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("dialog", { name: CONSENT_DIALOG }),
  ).toBeVisible();
  await expect(page.locator(ANALYTICS_SCRIPT)).toHaveCount(0);
});
