import { expect, test, type Page, type Route } from "@playwright/test";

const envelope = (data: unknown, requestId: string) => ({
  data,
  meta: { nextCursor: null },
  requestId,
});

const creation = (overrides: Record<string, unknown> = {}) => ({
  commentCount: 3,
  description: "An original island grid made for the community.",
  id: "creation-one",
  isLiked: false,
  likeCount: 12,
  owner: {
    avatarSeed: "island-maker-seed",
    displayName: "Island Maker",
    id: "maker-id",
    username: "island-maker",
  },
  publishedAt: 1_700_000_000_000,
  revision: 1,
  slug: "coral-tide-chart",
  status: "published",
  tags: ["coral", "island"],
  title: "Coral tide chart",
  updatedAt: 1_700_000_000_000,
  visibility: "public",
  ...overrides,
});

async function fulfill(route: Route, data: unknown, requestId: string) {
  await route.fulfill({
    body: JSON.stringify(envelope(data, requestId)),
    contentType: "application/json",
    status: 200,
  });
}

async function openFiltersWhenCollapsed(page: Page, accessibleName: string) {
  const trigger = page.getByRole("button", {
    name: accessibleName,
    exact: true,
  });
  if (await trigger.isVisible()) await trigger.click();
}

test("discovery search, feeds, and tags stay URL-backed without mobile overflow", async ({
  page,
}) => {
  await page.route("**/api/tags", (route) =>
    fulfill(
      route,
      [
        { description: "Warm reef colors", name: "Coral", slug: "coral" },
        {
          description: "Night-sky palettes",
          name: "Moonlight",
          slug: "moonlight",
        },
      ],
      "tags-e2e",
    ),
  );
  await page.route("**/api/discover/recent?**", (route) =>
    fulfill(route, [creation()], "recent-e2e"),
  );
  await page.route("**/api/discover/popular?**", (route) =>
    fulfill(
      route,
      [
        creation({
          id: "popular-one",
          slug: "popular-lantern",
          title: "Popular lantern",
        }),
      ],
      "popular-e2e",
    ),
  );
  await page.route("**/api/tags/coral/creations?**", (route) =>
    fulfill(route, [creation()], "tag-e2e"),
  );
  await page.route("**/api/search?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("q")).toBe("sunset");
    expect(params.get("tag")).toBe("coral");
    await fulfill(
      route,
      [
        creation({
          id: "search-one",
          slug: "sunset-coral",
          title: "Sunset coral mosaic",
        }),
      ],
      "search-e2e",
    );
  });

  await page.goto("/discover", { waitUntil: "networkidle" });
  await expect(
    page.getByText("Coral tide chart", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("search", { name: "Search public creations form" }),
  ).toBeVisible();

  await openFiltersWhenCollapsed(page, "Open discovery filters");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Filter by Coral", exact: true })
    .click();
  await expect(page).toHaveURL(/\/discover\?tag=coral$/);
  await expect(
    page.getByRole("button", { name: "Remove tag filter coral", exact: true }),
  ).toBeVisible();

  const discoverySearch = page.getByRole("search", {
    name: "Search public creations form",
  });
  await discoverySearch
    .getByLabel("Search public creations", { exact: true })
    .fill("sunset");
  await discoverySearch
    .getByRole("button", { name: "Search shared creations", exact: true })
    .click();
  await expect(page).toHaveURL(/\/discover\?q=sunset&tag=coral$/);
  await expect(
    page.getByText("Sunset coral mosaic", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Results for “sunset” in #coral · 1 loaded", {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(page).toHaveURL(/\/discover$/);
});

test("desktop quick search navigates to current community results", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The compact header search appears at the desktop breakpoint.");
  await page.route("**/api/search?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("q")).toBe("moon lantern");
    await fulfill(
      route,
      [creation({ slug: "moon-lantern", title: "Moon lantern" })],
      "quick-search-e2e",
    );
  });

  await page.goto("/search");
  const quickSearch = page.getByRole("search", {
    name: "Community quick search",
  });
  await quickSearch.getByLabel("Search public creations").fill("moon lantern");
  await quickSearch.getByRole("button", { name: "Search community" }).click();

  await expect(page).toHaveURL(/\/search\?q=moon%20lantern$/);
  await expect(page.getByText("Moon lantern", { exact: true })).toBeVisible();
});

test("surprise discovery opens a public creation without exposing filtered work", async ({
  page,
}) => {
  await page.route("**/api/tags", (route) => fulfill(route, [], "tags-empty-e2e"));
  await page.route("**/api/discover/recent?**", (route) =>
    fulfill(route, [creation()], "recent-surprise-e2e"),
  );
  await page.route("**/api/discover/random", (route) =>
    fulfill(route, creation(), "random-e2e"),
  );
  await page.route("**/api/public/creations/coral-tide-chart", (route) =>
    fulfill(route, creation(), "detail-e2e"),
  );

  await page.goto("/discover", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Surprise me", exact: true }).click();

  await expect(page).toHaveURL(/\/creation\/coral-tide-chart$/);
});

test("profile creation filters are reusable, URL-backed, and keep creator links intact", async ({
  page,
}) => {
  const creations = [
    creation({
      id: "coral-one",
      slug: "coral-notebook",
      title: "Coral notebook",
      tags: ["coral", "journal"],
    }),
    creation({
      id: "mint-one",
      slug: "mint-lantern",
      title: "Mint lantern",
      tags: ["mint", "light"],
    }),
  ];
  const user = {
    avatarSeed: "island-maker-seed",
    bio: "I make tiny island patterns.",
    createdAt: 1_690_000_000_000,
    creationCount: 2,
    displayName: "Island Maker",
    followerCount: 20,
    followingCount: 4,
    id: "maker-id",
    isFollowing: false,
    role: "user",
    status: "active",
    username: "island-maker",
  };

  await page.route("**/api/users/island-maker", (route) =>
    fulfill(route, { creations, user }, "profile-e2e"),
  );
  await page.route("**/api/users/island-maker/creations?**", (route) =>
    fulfill(route, creations, "profile-creations-e2e"),
  );

  await page.goto("/u/island-maker", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Island Maker", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Coral notebook", { exact: true })).toBeVisible();
  await expect(page.getByText("Mint lantern", { exact: true })).toBeVisible();

  await openFiltersWhenCollapsed(page, "Open profile creation filters");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page
    .getByRole("group", { name: "Tags", exact: true })
    .getByRole("button", { name: "Filter by coral", exact: true })
    .click();
  await expect(page).toHaveURL(/\/u\/island-maker\?tag=coral$/);
  await expect(page.getByText("Coral notebook", { exact: true })).toBeVisible();
  await expect(page.getByText("Mint lantern", { exact: true })).toHaveCount(0);

  const profileSearch = page.getByRole("search", {
    name: "Search Island Maker's creations form",
  });
  await profileSearch
    .getByLabel("Search Island Maker's creations", { exact: true })
    .fill("notebook");
  await profileSearch
    .getByRole("button", { name: "Search shared creations", exact: true })
    .click();
  await expect(page).toHaveURL(/\/u\/island-maker\?q=notebook&tag=coral$/);
  await expect(
    page.getByText("1 of 2 loaded creations", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "By Island Maker", exact: true }),
  ).toBeVisible();
});
