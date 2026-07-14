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

async function rejectNotFound(
  route: Route,
  message: string,
  requestId: string,
) {
  await route.fulfill({
    body: JSON.stringify({
      error: { code: "NOT_FOUND", message },
      requestId,
    }),
    contentType: "application/json",
    status: 404,
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
  test.skip(
    testInfo.project.name !== "desktop",
    "The compact header search appears at the desktop breakpoint.",
  );
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
  await page.route("**/api/tags", (route) =>
    fulfill(route, [], "tags-empty-e2e"),
  );
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

test("creation metadata cannot retain a previous public creation after an unavailable SPA navigation", async ({
  page,
}) => {
  await page.route("**/api/public/creations/public-alpha", (route) =>
    fulfill(
      route,
      creation({
        canEdit: false,
        commentsEnabled: true,
        commentsLocked: false,
        description: "",
        downloadEnabled: false,
        id: "public-alpha-id",
        images: [],
        slug: "public-alpha",
        socialImageUrl: "/community-og.jpg",
        title: "Public alpha",
      }),
      "public-alpha-e2e",
    ),
  );
  await page.route("**/api/creations/public-alpha-id/comments**", (route) =>
    fulfill(route, [], "public-alpha-comments-e2e"),
  );
  await page.route("**/api/public/creations/private-beta", (route) =>
    rejectNotFound(route, "Creation not found", "private-beta-e2e"),
  );

  await page.goto("/creation/public-alpha");
  await expect(
    page.getByRole("heading", { name: "Public alpha", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Public alpha · Tomodachi");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Pixel-art project by Island Maker.",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index,follow",
  );

  await page.evaluate(() => {
    window.history.pushState({}, "", "/creation/private-beta");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  await expect(
    page.getByText("Creation not found", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Creation unavailable · Tomodachi");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "This community creation is unavailable.",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
  await expect
    .poll(
      async () =>
        new URL(
          (await page.locator('link[rel="canonical"]').getAttribute("href")) ??
            "invalid:/",
        ).pathname,
    )
    .toBe("/creation/private-beta");
});

test("late paginated comments cannot cross creation route generations", async ({
  page,
}) => {
  let releaseAlphaPage = () => {};
  const alphaPageGate = new Promise<void>((resolve) => {
    releaseAlphaPage = resolve;
  });
  let markAlphaPageStarted = () => {};
  const alphaPageStarted = new Promise<void>((resolve) => {
    markAlphaPageStarted = resolve;
  });

  for (const [slug, id, title] of [
    ["public-alpha", "public-alpha-id", "Public alpha"],
    ["public-beta", "public-beta-id", "Public beta"],
  ] as const) {
    await page.route(`**/api/public/creations/${slug}`, (route) =>
      fulfill(
        route,
        creation({
          canEdit: false,
          commentsEnabled: true,
          commentsLocked: false,
          downloadEnabled: false,
          id,
          images: [],
          slug,
          title,
        }),
        `${slug}-detail-e2e`,
      ),
    );
  }

  await page.route(
    "**/api/creations/public-alpha-id/comments**",
    async (route) => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      if (!cursor) {
        await route.fulfill({
          body: JSON.stringify({
            data: [],
            meta: { nextCursor: "alpha-next-page" },
            requestId: "alpha-comments-e2e",
          }),
          contentType: "application/json",
          status: 200,
        });
        return;
      }
      markAlphaPageStarted();
      await alphaPageGate;
      await fulfill(
        route,
        [
          {
            author: creation().owner,
            body: "OLD ALPHA COMMENT",
            createdAt: 1_700_000_000_001,
            id: "old-alpha-comment",
            status: "active",
            updatedAt: 1_700_000_000_001,
          },
        ],
        "alpha-comments-page-e2e",
      );
    },
  );
  await page.route("**/api/creations/public-beta-id/comments**", (route) =>
    fulfill(route, [], "beta-comments-e2e"),
  );

  await page.goto("/creation/public-alpha");
  const delayedResponse = page.waitForResponse((response) =>
    response.url().includes("cursor=alpha-next-page"),
  );
  await page.getByRole("button", { name: "Load more comments" }).click();
  await alphaPageStarted;

  await page.evaluate(() => {
    window.history.pushState({}, "", "/creation/public-beta");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "Public beta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No comments yet.", { exact: true }),
  ).toBeVisible();

  releaseAlphaPage();
  await delayedResponse;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        ),
      ),
  );
  await expect(
    page.getByText("OLD ALPHA COMMENT", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("No comments yet.", { exact: true }),
  ).toBeVisible();
});

test("profile metadata normalizes public profiles and noindexes unavailable SPA targets", async ({
  page,
}) => {
  const profileUser = {
    avatarSeed: "island-maker-seed",
    bio: "",
    createdAt: 1_690_000_000_000,
    creationCount: 0,
    displayName: "Island Maker",
    followerCount: 20,
    followingCount: 4,
    id: "maker-id",
    isFollowing: false,
    role: "user",
    status: "active",
    username: "island-maker",
  };
  await page.route("**/api/users/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("does-not-exist")) {
      await rejectNotFound(route, "Profile not found", "missing-profile-e2e");
      return;
    }
    if (path.endsWith("/creations")) {
      await fulfill(route, [], "empty-profile-creations-e2e");
      return;
    }
    await fulfill(
      route,
      { creations: [], user: profileUser },
      "public-profile-e2e",
    );
  });

  await page.goto("/u/Island-Maker");
  await expect(
    page.getByRole("heading", { name: "Island Maker", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Island Maker (@island-maker) · Tomodachi");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "See Island Maker's public Island Workshop creations.",
  );
  await expect
    .poll(
      async () =>
        new URL(
          (await page.locator('link[rel="canonical"]').getAttribute("href")) ??
            "invalid:/",
        ).pathname,
    )
    .toBe("/u/island-maker");

  await page.evaluate(() => {
    window.history.pushState({}, "", "/u/does-not-exist");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  await expect(
    page.getByText("Profile not found", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Profile unavailable · Tomodachi");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "This community profile is unavailable.",
  );
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
