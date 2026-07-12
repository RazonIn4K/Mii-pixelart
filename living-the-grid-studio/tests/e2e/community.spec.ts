import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/about",
  "/faq",
  "/studio",
  "/unlock",
  "/discover",
  "/search",
  "/community-guidelines",
  "/copyright",
  "/security",
  "/privacy",
  "/terms",
  "/cookies",
] as const;

for (const route of publicRoutes) {
  test(`${route} renders without runtime errors or horizontal overflow`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        errors.push(`${response.status()} ${response.url()}`);
      }
    });

    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.ok(), `expected ${route} to return a successful document`).toBe(true);
    await expect(page.locator("main").first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("mobile navigation exposes community and Studio destinations", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/discover");
  await page.getByRole("button", { name: /open navigation/i }).click();
  const mobileNavigation = page.getByRole("navigation", { name: /mobile navigation/i });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "Discover", exact: true })).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "Studio", exact: true })).toBeVisible();
});

test("the document permits zoom and advertises the original social card", async ({ page }) => {
  await page.goto("/");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).not.toContain("maximum-scale");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /community-og\.jpg$/,
  );
});

test("the hero image is preloaded only on the homepage", async ({ page }) => {
  await page.goto("/discover", { waitUntil: "networkidle" });
  await expect(page.locator('link[rel="preload"][as="image"][href="/hero.webp"]')).toHaveCount(
    0,
  );

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator('link[rel="preload"][as="image"][href="/hero.webp"]')).toHaveCount(
    1,
  );
  await expect(page.locator('img[src="/hero.webp"]')).toHaveAttribute("fetchpriority", "high");
});

test("original community artwork and generated avatars are wired into public routes", async ({
  page,
}) => {
  await page.goto("/discover", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("img", {
      name: "Five original pixel-art creators collaborating around a colorful grid in an open-air island workshop",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Mira's generated avatar", exact: true }),
  ).toBeVisible();

  await page.goto("/search", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("img", {
      name: "An original pixel-art island map, magnifying glass, color swatches, and tiny workshop lantern robot ready for a search",
      exact: true,
    }),
  ).toBeVisible();

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("img", {
      name: "An original lantern workshop robot arranged as a repaintable pixel guide on graph paper",
      exact: true,
    }),
  ).toBeVisible();
});

test("submitting a search requests results without reloading the page", async ({ page }) => {
  let documentRequests = 0;
  let searchRequests = 0;
  page.on("request", (request) => {
    if (request.resourceType() === "document") documentRequests += 1;
  });

  await page.route("**/api/search?**", async (route) => {
    searchRequests += 1;
    await route.fulfill({
      body: JSON.stringify({
        data: [],
        meta: { nextCursor: null },
        requestId: "search-submit-e2e",
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/search", { waitUntil: "networkidle" });
  const documentRequestsAfterLoad = documentRequests;

  const searchRequest = page.waitForRequest((request) =>
    request.url().includes("/api/search?") && request.url().includes("q=coral"),
  );
  await page.getByLabel("Search creations", { exact: true }).fill("coral");
  await page.getByRole("button", { name: "Search community creations", exact: true }).click();
  const request = await searchRequest;

  expect(new URL(request.url()).searchParams.get("q")).toBe("coral");
  await expect(page).toHaveURL(/\/search\?q=coral$/);
  await expect(page.getByText("No public creations matched", { exact: true })).toBeVisible();
  expect(documentRequests).toBe(documentRequestsAfterLoad);
  expect(searchRequests).toBe(1);
});

test("newer searches win over stale responses and browser history stays in sync", async ({
  page,
}) => {
  let releaseCoral: (() => void) | undefined;
  const coralGate = new Promise<void>((resolve) => {
    releaseCoral = resolve;
  });
  let coralRequests = 0;

  await page.route("**/api/search?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") ?? "";
    if (query === "coral") {
      coralRequests += 1;
      if (coralRequests === 1) await coralGate;
    }
    await route.fulfill({
      body: JSON.stringify({
        data: [
          {
            commentCount: 0,
            description: null,
            id: `${query}-creation`,
            isLiked: false,
            likeCount: 0,
            owner: {
              avatarSeed: `${query}-maker`,
              displayName: "Island Maker",
              id: "maker-id",
              username: "island-maker",
            },
            publishedAt: 1_700_000_000_000,
            revision: 1,
            slug: `${query}-mosaic`,
            status: "published",
            tags: [query],
            title: `${query[0]?.toUpperCase() ?? ""}${query.slice(1)} mosaic`,
            updatedAt: 1_700_000_000_000,
            visibility: "public",
          },
        ],
        meta: { nextCursor: null },
        requestId: `search-${query}`,
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/search", { waitUntil: "networkidle" });
  const input = page.getByLabel("Search creations", { exact: true });
  const submit = page.getByRole("button", {
    name: "Search community creations",
    exact: true,
  });

  const firstRequest = page.waitForRequest((request) =>
    request.url().includes("/api/search?") && request.url().includes("q=coral"),
  );
  await input.fill("coral");
  await submit.click();
  await firstRequest;

  await input.fill("beach");
  await submit.click();
  await expect(page.getByText("Beach mosaic", { exact: true })).toBeVisible();
  await expect(page.getByText("Results for “beach”", { exact: true })).toBeVisible();

  const staleResponse = page.waitForResponse((response) =>
    response.url().includes("/api/search?") && response.url().includes("q=coral"),
  );
  releaseCoral?.();
  await staleResponse;
  await expect(page.getByText("Beach mosaic", { exact: true })).toBeVisible();
  await expect(page.getByText("Coral mosaic", { exact: true })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/search\?q=coral$/);
  await expect(page.getByText("Coral mosaic", { exact: true })).toBeVisible();
  await expect(page.getByText("Results for “coral”", { exact: true })).toBeVisible();
});
