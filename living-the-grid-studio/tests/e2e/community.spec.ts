import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Route } from "@playwright/test";

const publicRoutes = [
  "/",
  "/about",
  "/faq",
  "/studio",
  "/ai-plan",
  "/unlock",
  "/support",
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
  test(`${route} renders without runtime errors or horizontal overflow`, async ({
    page,
  }) => {
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
    expect(
      response?.ok(),
      `expected ${route} to return a successful document`,
    ).toBe(true);
    await expect(page.locator("main").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("AI plan and support surfaces expose no payment or checkout action", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop check covers the shared payment-free product surfaces.",
  );

  const paymentRequests: string[] = [];
  page.on("request", (request) => {
    if (/stripe|checkout|payment/iu.test(request.url())) {
      paymentRequests.push(request.url());
    }
  });

  await page.goto("/ai-plan", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Free AI plan beta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "A one-time expanded plan is being explored, but it is not for sale yet. Tomodachi currently accepts no payments and has no checkout.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.locator("a, button").filter({ hasText: /buy|checkout|pay/i }),
  ).toHaveCount(0);

  await page.goto("/unlock", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Free AI plan beta", exact: true }),
  ).toBeVisible();

  await page.goto("/support", { waitUntil: "networkidle" });
  await expect(
    page.getByText(
      "Tomodachi does not currently accept payments, tips, donations, or consultation bookings. Testing the real workflow and sharing clear feedback helps more than a checkout ever could.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.locator("a, button").filter({ hasText: /buy|checkout|pay/i }),
  ).toHaveCount(0);
  expect(paymentRequests).toEqual([]);
});

test("phone header exposes Google sign-in before opening navigation", async ({
  page,
}, testInfo) => {
  test.skip(
    !["small-phone", "minimum-phone"].includes(testInfo.project.name),
    "The two narrowest Chromium viewports cover compact sign-in.",
  );

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(
    page.locator("header").getByRole("button", { name: "Sign in with Google" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("mobile navigation exposes community and Studio destinations", async ({
  page,
}, testInfo) => {
  test.skip(
    !["small-phone", "minimum-phone", "mobile-webkit"].includes(
      testInfo.project.name,
    ),
    "The mobile navigation contract is covered at the two narrowest Chromium viewports and a mobile WebKit viewport.",
  );
  const accessibilityWarnings: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "warning" &&
      message.text().includes("Missing \`Description\`")
    ) {
      accessibilityWarnings.push(message.text());
    }
  });
  if (testInfo.project.name === "mobile-webkit") {
    await page.route(
      /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/discover(?:\?.*)?$/,
      async (route) => {
        const response = await route.fetch();
        const headers = response.headers();
        // WebKit correctly upgrades loopback subresources when it sees the
        // production HTTPS policy. Strip only that directive from this
        // local-only document so Vite's HTTP modules load while every other
        // CSP protection remains active; the hosted policy is tested elsewhere.
        const csp = headers["content-security-policy"];
        if (csp) {
          headers["content-security-policy"] = csp
            .split(";")
            .map((directive) => directive.trim())
            .filter(
              (directive) =>
                directive.toLowerCase() !== "upgrade-insecure-requests",
            )
            .join("; ");
        }
        await route.fulfill({ response, headers });
      },
    );
  }
  await page.goto("/discover");
  const navigationTrigger = page.getByRole("button", {
    name: /open navigation/i,
  });
  const originalScrollStyles = await page.evaluate(() => ({
    bodyOverflow: document.body.style.overflow,
    rootOverflow: document.documentElement.style.overflow,
    rootScrollbarGutter: document.documentElement.style.scrollbarGutter,
  }));
  await navigationTrigger.click();
  const navigationDialog = page.getByRole("dialog", {
    name: "Island menu",
  });
  await expect(navigationDialog).toBeVisible();
  await expect(
    navigationDialog.getByRole("button", { name: "Close navigation" }),
  ).toBeFocused();
  await expect(navigationTrigger).toHaveAttribute("aria-expanded", "true");
  const mobileNavigation = page.getByRole("navigation", {
    name: /mobile navigation/i,
  });
  await expect(mobileNavigation).toBeVisible();
  await expect(
    page.getByText(
      "Move between the community gallery, local Studio tools, and your account.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "Discover", exact: true }),
  ).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "Studio", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => navigationDialog.evaluate((dialog) => dialog.matches(":modal")))
    .toBe(true);
  const accessibilityResults = await new AxeBuilder({ page })
    .include("dialog[open]")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibilityResults.violations).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        bodyOverflow: document.body.style.overflow,
        rootOverflow: document.documentElement.style.overflow,
      })),
    )
    .toEqual({ bodyOverflow: "hidden", rootOverflow: "hidden" });

  const backgroundScrollPosition = await page.evaluate(() => window.scrollY);
  if (testInfo.project.name !== "mobile-webkit") {
    const navigationBounds = await navigationDialog.boundingBox();
    expect(navigationBounds).not.toBeNull();
    await page.mouse.move(
      (navigationBounds?.x ?? 80) + (navigationBounds?.width ?? 240) / 2,
      (navigationBounds?.y ?? 0) + (navigationBounds?.height ?? 760) / 2,
    );
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(backgroundScrollPosition);
    await page.mouse.move(20, 400);
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(backgroundScrollPosition);
  }

  await page.mouse.click(20, 400);
  await expect(navigationDialog).toBeHidden();
  await expect(navigationTrigger).toBeFocused();
  expect(
    await page.evaluate(() => ({
      bodyOverflow: document.body.style.overflow,
      rootOverflow: document.documentElement.style.overflow,
      rootScrollbarGutter: document.documentElement.style.scrollbarGutter,
    })),
  ).toEqual(originalScrollStyles);
  await navigationTrigger.click();
  await expect(navigationDialog).toBeVisible();
  await expect(
    navigationDialog.getByRole("button", { name: "Close navigation" }),
  ).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(
    navigationDialog.getByRole("button", { name: "Sign in with Google" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    navigationDialog.getByRole("button", { name: "Close navigation" }),
  ).toBeFocused();

  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() =>
        navigationDialog.evaluate((dialog) =>
          dialog.contains(document.activeElement),
        ),
      )
      .toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(navigationDialog).toBeHidden();
  await expect(navigationTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(navigationTrigger).toBeFocused();

  const narrowViewport = page.viewportSize();
  expect(narrowViewport).not.toBeNull();
  await navigationTrigger.click();
  await page.setViewportSize({
    width: 768,
    height: narrowViewport?.height ?? 800,
  });
  await expect(navigationDialog).toBeHidden();
  await expect(
    page
      .getByRole("banner")
      .getByRole("link", { name: "tomodachi.pw", exact: true }),
  ).toBeFocused();
  await page.setViewportSize(narrowViewport ?? { width: 360, height: 800 });
  await expect(navigationTrigger).toBeVisible();

  await navigationTrigger.click();
  await mobileNavigation
    .getByRole("link", { name: "Studio", exact: true })
    .click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(navigationDialog).toBeHidden();
  expect(accessibilityWarnings).toEqual([]);
});

test("an unconnected community deployment disables account and cloud actions", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop degraded-deployment check covers the shared service state.",
  );

  const staticFallback = (route: Route) =>
    route.fulfill({
      body: "<!doctype html><title>Tomodachi</title>",
      contentType: "text/html",
      status: 200,
    });
  await page.route("**/api/auth/session", staticFallback);
  await page.route("**/api/tags", staticFallback);
  await page.route("**/api/discover/recent**", staticFallback);

  await page.goto("/discover");
  await expect(
    page.getByRole("heading", {
      name: "Community features are not connected here yet",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accounts unavailable", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/0 loaded/)).toHaveCount(0);

  await page.goto("/studio");
  await page.getByRole("button", { name: "Start blank", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cloud saving unavailable", exact: true }),
  ).toBeDisabled();
});

test("Discover actions and avatar captions stay separate at layout edges", async ({
  page,
}, testInfo) => {
  test.skip(
    !["desktop", "minimum-phone"].includes(testInfo.project.name),
    "The desktop and 320px layouts cover the collision edges.",
  );

  const fulfill = (route: Route, data: unknown) =>
    route.fulfill({
      body: JSON.stringify({
        data,
        meta: { nextCursor: null },
        requestId: "layout-edge",
      }),
      contentType: "application/json",
      status: 200,
    });
  await page.route("**/api/auth/session", (route) =>
    fulfill(route, { session: null, user: null }),
  );
  await page.route("**/api/tags", (route) => fulfill(route, []));
  await page.route("**/api/discover/recent**", (route) => fulfill(route, []));

  await page.goto("/discover", { waitUntil: "networkidle" });
  const createBox = await page
    .locator("#main-content")
    .getByRole("link", { name: "Create & share", exact: true })
    .boundingBox();
  const artworkBox = await page.locator("main figure").boundingBox();
  const avatarsBox = await page
    .getByLabel("Examples of generated Island Workshop avatars", {
      exact: true,
    })
    .boundingBox();
  const captionBox = await page
    .getByText("A face for every maker", { exact: true })
    .boundingBox();
  expect(createBox).not.toBeNull();
  expect(artworkBox).not.toBeNull();
  expect(avatarsBox).not.toBeNull();
  expect(captionBox).not.toBeNull();

  const overlaps = (
    left: NonNullable<typeof createBox>,
    right: NonNullable<typeof createBox>,
  ) =>
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y;
  expect(overlaps(createBox!, artworkBox!)).toBe(false);
  expect(overlaps(avatarsBox!, captionBox!)).toBe(false);
});

test("the document permits zoom and advertises the original social card", async ({
  page,
}) => {
  await page.goto("/");
  const viewport = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(viewport).not.toContain("maximum-scale");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /community-og\.jpg$/,
  );
});

test("the public AI-agent index is concise and action-safe", async ({
  request,
}) => {
  const response = await request.get("/llms.txt");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/plain");

  const body = await response.text();
  expect(body).toMatch(/^# Tomodachi\.pw$/m);
  expect(body).toContain("## Public resources");
  expect(body).toContain("## Agent safety boundaries");
  expect(body).toContain("https://tomodachi.pw/studio");
  expect(body).toContain("https://tomodachi.pw/community-guidelines");
  expect(body).toContain("Respect `robots.txt`");
  expect(body).toContain("Do not automate sign-in");
  expect(body.length).toBeLessThan(2_000);
});

test("the hero image is preloaded only on the homepage", async ({ page }) => {
  await page.goto("/discover", { waitUntil: "networkidle" });
  await expect(
    page.locator('link[rel="preload"][as="image"][href="/hero.webp"]'),
  ).toHaveCount(0);

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(
    page.locator('link[rel="preload"][as="image"][href="/hero.webp"]'),
  ).toHaveCount(1);
  await expect(page.locator('img[src="/hero.webp"]')).toHaveAttribute(
    "fetchpriority",
    "high",
  );
});

test("anonymous homepage does not request the authenticated account menu", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the shared anonymous bundle boundary.",
  );

  const accountMenuRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("AuthenticatedAccountMenu")) {
      accountMenuRequests.push(request.url());
    }
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: { session: null, user: null },
        requestId: "anonymous-header-test",
      }),
      status: 200,
    }),
  );

  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sign in with Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Enter the studio" }),
  ).toBeAttached();
  await page.waitForTimeout(500);
  expect(accountMenuRequests).toEqual([]);
});

test("homepage keeps deep scroll restoration stable across browser history", async ({
  page,
}, testInfo) => {
  let clientRouteDocumentRequests = 0;
  page.on("request", (request) => {
    if (
      request.resourceType() === "document" &&
      ["/about", "/guides"].includes(new URL(request.url()).pathname)
    ) {
      clientRouteDocumentRequests += 1;
    }
  });

  await page.goto("/#recovery");
  const recoveryHeading = page.getByRole("heading", {
    name: "Calm help when something goes wrong.",
  });
  await expect(recoveryHeading).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerdown"));
    window.scrollBy(0, Math.min(320, Math.round(window.innerHeight / 3)));
  });
  const initialScrollY = await page.evaluate(() => window.scrollY);

  await page
    .locator('a[href="/guides"]')
    .first()
    .evaluate((link: HTMLAnchorElement) => link.click());
  await expect(page).toHaveURL(/\/guides$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Guides", exact: true }),
  ).toBeVisible();
  expect(clientRouteDocumentRequests).toBe(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/#recovery$/);
  await expect(page.locator("#recovery")).toBeInViewport();
  await expect
    .poll(async () =>
      page.evaluate(
        (expected) => Math.abs(window.scrollY - expected),
        initialScrollY,
      ),
    )
    // Sub-pixel section sizing can shift the exact offset, but a client-side
    // Back traversal must retain the user's within-section reading position.
    .toBeLessThan(100);

  await page.goForward();
  await expect(page).toHaveURL(/\/guides$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Guides", exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);

  await page.goBack();
  await expect(page).toHaveURL(/\/#recovery$/);
  await expect
    .poll(async () =>
      page.evaluate(
        (expected) => Math.abs(window.scrollY - expected),
        initialScrollY,
      ),
    )
    .toBeLessThan(100);

  if (testInfo.project.name === "desktop") {
    await page.evaluate(() =>
      window.history.replaceState(
        { source: "scroll-restoration-test" },
        "",
        "/about",
      ),
    );
    await expect(page).toHaveURL(/\/about$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "A Mii pixel-art studio paired with practical breach recovery.",
      }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThan(50);
    expect(await page.evaluate(() => window.history.state.source)).toBe(
      "scroll-restoration-test",
    );
    expect(clientRouteDocumentRequests).toBe(0);
  }
});

test("scroll restoration preserves custom state and immediate traversals", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers History state and rapid traversal semantics.",
  );

  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 1_200));
  const firstPosition = await page.evaluate(() => window.scrollY);
  await page.evaluate(() =>
    window.history.pushState(["preserve", { nested: true }], "", "/about"),
  );
  await expect(page).toHaveURL(/\/about$/);
  expect(
    await page.evaluate(() => ({
      isArray: Array.isArray(window.history.state),
      value: window.history.state,
    })),
  ).toEqual({
    isArray: true,
    value: ["preserve", { nested: true }],
  });

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(async () =>
      page.evaluate(
        (expected) => Math.abs(window.scrollY - expected),
        firstPosition,
      ),
    )
    .toBeLessThan(10);

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerdown"));
    window.scrollTo(0, 900);
    window.history.pushState(null, "", "/faq");
    window.history.back();
  });
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(() => page.evaluate(() => Math.abs(window.scrollY - 900)))
    .toBeLessThan(10);

  await page.evaluate(() => {
    document.documentElement.style.minHeight = "5000px";
    window.dispatchEvent(new PointerEvent("pointerdown"));
    window.scrollTo(0, 600);
  });
  const firstEntryPosition = await page.evaluate(() => window.scrollY);

  await page.evaluate(() => window.history.pushState(null, "", "/about"));
  await expect(page).toHaveURL(/\/about$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10);
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerdown"));
    window.scrollTo(0, 1_100);
  });
  const middleEntryPosition = await page.evaluate(() => window.scrollY);

  await page.evaluate(() => window.history.pushState(null, "", "/faq"));
  await expect(page).toHaveURL(/\/faq$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10);
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointerdown"));
    window.scrollTo(0, 1_600);
  });

  // Trigger the second Back from the first popstate handler, before the
  // component's two-frame restore can apply the middle entry's position.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let traversals = 0;
        const onPopState = () => {
          traversals += 1;
          if (traversals === 1) window.history.back();
          else {
            window.removeEventListener("popstate", onPopState);
            resolve();
          }
        };
        window.addEventListener("popstate", onPopState);
        window.history.back();
      }),
  );
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(async () =>
      page.evaluate(
        (expected) => Math.abs(window.scrollY - expected),
        firstEntryPosition,
      ),
    )
    .toBeLessThan(10);

  await page.goForward();
  await expect(page).toHaveURL(/\/about$/);
  await expect
    .poll(async () =>
      page.evaluate(
        (expected) => Math.abs(window.scrollY - expected),
        middleEntryPosition,
      ),
    )
    .toBeLessThan(10);
});

test("native fragment history restores both sides of the trip", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers native same-document fragment history.",
  );

  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 1_200));
  const rootPosition = await page.evaluate(() => window.scrollY);
  await page
    .locator('a[href="#recovery"]')
    .evaluate((link: HTMLAnchorElement) => link.click());
  await expect(page).toHaveURL(/\/#recovery$/);
  await expect(page.locator("#recovery")).toBeInViewport();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(async () =>
      page.evaluate(
        (expected) => Math.abs(window.scrollY - expected),
        rootPosition,
      ),
    )
    .toBeLessThan(10);

  await page.goForward();
  await expect(page).toHaveURL(/\/#recovery$/);
  await expect(page.locator("#recovery")).toBeInViewport();
});

test("saved scroll remains eligible while delayed content restores page height", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers delayed API-driven destination height.",
  );

  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.minHeight = "20000px";
    window.scrollTo(0, 15_000);
  });
  const savedPosition = await page.evaluate(() => window.scrollY);

  await page.evaluate(() => window.history.pushState(null, "", "/about"));
  await expect(page).toHaveURL(/\/about$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10);

  await page.evaluate(() => {
    document.documentElement.style.minHeight = "";
    window.setTimeout(() => {
      document.documentElement.style.minHeight = "20000px";
    }, 1_500);
    window.history.back();
  });
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(
      async () =>
        page.evaluate(
          (expected) => Math.abs(window.scrollY - expected),
          savedPosition,
        ),
      { timeout: 5_000 },
    )
    .toBeLessThan(10);
});

test("delayed restoration yields to input and blocked storage", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the defensive restoration fallbacks.",
  );

  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "tomodachi.scroll-positions.v1") {
        throw new DOMException("Storage blocked", "SecurityError");
      }
      return originalGetItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "tomodachi.scroll-positions.v1") {
        throw new DOMException("Storage blocked", "SecurityError");
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await page.goto("/");
  await page.evaluate(() =>
    window.history.pushState(null, "", "/#missing-restoration-target"),
  );
  // Let the normal two-frame traversal phase finish before simulating a
  // scrollbar/assistive scroll with no preceding input event.
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    // A scrollbar or assistive scroll may not emit any wheel, pointer, touch,
    // or key event. The scroll event itself must cancel the delayed restore.
    window.scrollTo(0, 600);
  });
  await expect(page).toHaveURL(/#missing-restoration-target$/);
  await page.waitForTimeout(1_200);
  await expect
    .poll(() => page.evaluate(() => Math.abs(window.scrollY - 600)))
    .toBeLessThan(10);
});

test("one malformed stored scroll entry does not discard valid entries", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers defensive stored-position parsing.",
  );

  await page.addInitScript(() => {
    window.history.replaceState(
      { __tomodachiScrollKey: "valid-scroll-entry" },
      "",
      window.location.href,
    );
    window.sessionStorage.setItem(
      "tomodachi.scroll-positions.v1",
      JSON.stringify({
        "broken-scroll-entry": null,
        "valid-scroll-entry": { x: 0, y: 600 },
      }),
    );
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => Math.abs(window.scrollY - 600)))
    .toBeLessThan(10);
});

test("recovery tools defer model discovery until they approach the viewport", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the shared viewport-gated recovery boundary.",
  );

  let modelRequests = 0;
  await page.route("**/api/ai/models", (route) => {
    modelRequests += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ presets: [] }),
      status: 200,
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  expect(modelRequests).toBe(0);

  await expect(
    page.getByRole("heading", { name: /Create freely/ }),
  ).toBeAttached();
  await page.locator("#recovery").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("heading", {
      name: "Calm help when something goes wrong.",
    }),
  ).toBeVisible();
  await expect.poll(() => modelRequests).toBe(1);
  const recoveryAccessibility = await new AxeBuilder({ page })
    .include("#recovery")
    .analyze();
  expect(recoveryAccessibility.violations).toEqual([]);

  await page.goto("about:blank");
  modelRequests = 0;
  await page.goto("/#how-it-works");
  const workflowHeading = page.getByRole("heading", {
    name: "From idea to paintable recipe.",
  });
  await expect(workflowHeading).toBeVisible();
  await expect(workflowHeading).toBeInViewport();
  expect(modelRequests).toBe(0);

  await page.goto("about:blank");
  modelRequests = 0;
  await page.goto("/#recovery");
  const directRecoveryHeading = page.getByRole("heading", {
    name: "Calm help when something goes wrong.",
  });
  await expect(directRecoveryHeading).toBeVisible();
  await expect(directRecoveryHeading).toBeInViewport();
  await expect.poll(() => modelRequests).toBe(1);
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

test("submitting a search requests results without reloading the page", async ({
  page,
}) => {
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

  const searchRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/search?") &&
      request.url().includes("q=coral"),
  );
  await page.getByLabel("Search creations", { exact: true }).fill("coral");
  await page
    .getByRole("button", { name: "Search community creations", exact: true })
    .click();
  const request = await searchRequest;

  expect(new URL(request.url()).searchParams.get("q")).toBe("coral");
  await expect(page).toHaveURL(/\/search\?q=coral$/);
  await expect(
    page.getByText("No public creations matched", { exact: true }),
  ).toBeVisible();
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

  const firstRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/search?") &&
      request.url().includes("q=coral"),
  );
  await input.fill("coral");
  await submit.click();
  await firstRequest;

  await input.fill("beach");
  await submit.click();
  await expect(page.getByText("Beach mosaic", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Results for “beach”", { exact: true }),
  ).toBeVisible();

  const staleResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/search?") &&
      response.url().includes("q=coral"),
  );
  releaseCoral?.();
  await staleResponse;
  await expect(page.getByText("Beach mosaic", { exact: true })).toBeVisible();
  await expect(page.getByText("Coral mosaic", { exact: true })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/search\?q=coral$/);
  await expect(page.getByText("Coral mosaic", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Results for “coral”", { exact: true }),
  ).toBeVisible();
});
