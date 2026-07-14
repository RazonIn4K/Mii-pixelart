import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const representativeRoutes = [
  "/",
  "/studio",
  "/discover",
  "/search",
  "/community-guidelines",
];

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lceV8QAAAABJRU5ErkJggg==",
  "base64",
);

test("representative public routes have no WCAG 2.2 A/AA violations", async ({
  page,
}) => {
  for (const route of representativeRoutes) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(
      results.violations,
      `${route} accessibility violations:\n${results.violations
        .map(
          (violation) =>
            `${violation.id}: ${violation.help} (${violation.nodes.length})`,
        )
        .join("\n")}`,
    ).toEqual([]);

    const unsupportedAria = [
      ...results.violations,
      ...results.incomplete,
    ].filter((finding) =>
      ["aria-allowed-attr", "aria-prohibited-attr"].includes(finding.id),
    );
    expect(
      unsupportedAria,
      `${route} unsupported ARIA findings:\n${unsupportedAria
        .map(
          (finding) =>
            `${finding.id}: ${finding.help} (${finding.nodes.length})`,
        )
        .join("\n")}`,
    ).toEqual([]);

    const canonical = new URL(
      (await page.locator('link[rel="canonical"]').getAttribute("href")) ??
        "invalid:/",
    );
    expect(canonical.pathname).toBe(route);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      canonical.href,
    );

    if (route === "/") {
      await expect(
        page
          .getByRole("banner")
          .getByRole("link", { name: "tomodachi.pw", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Essential only", exact: true }),
      ).toBeVisible();
      expect(
        await page
          .locator("#password-leak-check")
          .evaluate((input: HTMLInputElement) => input.form !== null),
      ).toBe(true);
    }
  }
});

test("named visual groups and Studio sliders use supported ARIA semantics", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One Chromium desktop run covers the shared semantic components.",
  );

  const expectNoUnsupportedAria = async () => {
    const results = await new AxeBuilder({ page }).analyze();
    const unsupportedAria = [
      ...results.violations,
      ...results.incomplete,
    ].filter((finding) =>
      ["aria-allowed-attr", "aria-prohibited-attr"].includes(finding.id),
    );
    expect(
      unsupportedAria,
      unsupportedAria
        .map(
          (finding) =>
            `${finding.id}: ${finding.help} (${finding.nodes.length})`,
        )
        .join("\n"),
    ).toEqual([]);
  };

  await page.goto("/discover");
  await expect(
    page.getByRole("group", {
      name: "Examples of generated Island Workshop avatars",
    }),
  ).toBeVisible();
  await expectNoUnsupportedAria();

  await page.goto("/studio");
  await page.locator("#ltg-image-input").setInputFiles({
    buffer: TINY_PNG,
    mimeType: "image/png",
    name: "tiny.png",
  });
  await expect(page.getByText("Preview ready", { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="slider"][aria-label]')).toHaveCount(0);
  expect(await page.getByRole("slider").count()).toBeGreaterThanOrEqual(8);
  await expect(page.getByRole("slider", { name: "Grid width" })).toHaveCount(1);
  await expectNoUnsupportedAria();

  await page.reload();
  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(
    page.getByRole("group", { name: "Quick paint colors" }),
  ).toBeVisible();
  await expectNoUnsupportedAria();
});

test("Chromium remains keyboard-usable at a direct 200 percent page scale", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The direct page-scale protocol is Chromium-specific and viewport-independent.",
  );

  await page.goto("/");
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await expect
      .poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1))
      .toBe(2);

    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      visualWidth: window.visualViewport?.width ?? window.innerWidth,
    }));
    expect(metrics.visualWidth).toBeLessThanOrEqual(metrics.innerWidth / 2 + 1);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);

    const focusState = await page.evaluate(() => {
      const startCreating = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href="/studio"]'),
      ).find((link) => link.textContent?.trim() === "Start creating");
      if (!startCreating) return { focused: false, visible: false };
      startCreating.focus();
      const rect = startCreating.getBoundingClientRect();
      return {
        focused: document.activeElement === startCreating,
        visible: rect.width > 0 && rect.height > 0,
      };
    });
    expect(focusState).toEqual({ focused: true, visible: true });
  } finally {
    if (!page.isClosed()) {
      await session.send("Emulation.setPageScaleFactor", {
        pageScaleFactor: 1,
      });
    }
    await session.detach().catch(() => undefined);
  }
});

test("keyboard focus stays visible and reduced-motion preferences are honored", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");

  const state = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    const activeStyle = active ? getComputedStyle(active) : null;
    const toMilliseconds = (duration: string) => {
      const value = Number.parseFloat(duration);
      return duration.endsWith("ms") ? value : value * 1_000;
    };
    const motionDurations = [
      ...document.querySelectorAll<HTMLElement>("*"),
    ].flatMap((element) => {
      const style = getComputedStyle(element);
      return [
        ...style.animationDuration.split(","),
        ...style.transitionDuration.split(","),
      ].map((duration) => toMilliseconds(duration.trim()));
    });

    return {
      activeTag: active?.tagName ?? null,
      hasVisibleFocus:
        activeStyle !== null &&
        ((activeStyle.outlineStyle !== "none" &&
          activeStyle.outlineWidth !== "0px") ||
          activeStyle.boxShadow !== "none"),
      maximumMotionDurationMs: Math.max(0, ...motionDurations),
    };
  });

  expect(state.activeTag).not.toBeNull();
  expect(state.activeTag).not.toBe("BODY");
  expect(state.hasVisibleFocus).toBe(true);
  expect(state.maximumMotionDurationMs).toBeLessThanOrEqual(1);
});

test("client navigation replaces deep-link metadata with the destination contract", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Metadata lifecycle is viewport-independent.",
  );

  await page.goto("/discover");
  await page.waitForLoadState("networkidle");
  expect(
    new URL(
      (await page.locator('link[rel="canonical"]').getAttribute("href")) ??
        "invalid:/",
    ).pathname,
  ).toBe("/discover");

  await page
    .getByRole("banner")
    .getByRole("link", { name: "tomodachi.pw", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle(
    "Tomodachi.pw · Turn Ideas Into Paintable Pixel Guides",
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /Turn faces, characters, logos, and sketches/,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index,follow",
  );
  expect(
    new URL(
      (await page.locator('link[rel="canonical"]').getAttribute("href")) ??
        "invalid:/",
    ).pathname,
  ).toBe("/");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    /\/$/,
  );
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    "Tomodachi.pw · Turn Ideas Into Paintable Pixel Guides",
  );

  await page.goto("/search");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );
  await page
    .getByRole("banner")
    .getByRole("link", { name: "tomodachi.pw", exact: true })
    .click();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index,follow",
  );

  await page.goto("/definitely-not-a-real-route");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );

  for (const [alias, canonicalPath] of [
    ["/donate", "/support"],
    ["/disclosure", "/affiliate-disclosure"],
  ] as const) {
    await page.goto(alias);
    await expect
      .poll(
        async () =>
          new URL(
            (await page
              .locator('link[rel="canonical"]')
              .getAttribute("href")) ?? "invalid:/",
          ).pathname,
      )
      .toBe(canonicalPath);
  }

  await page.goto("/");
  const requestOrigin = new URL(page.url()).origin;
  await page.goto(`${requestOrigin}//attacker.example/path`);
  await expect
    .poll(
      async () =>
        new URL(
          (await page.locator('link[rel="canonical"]').getAttribute("href")) ??
            "invalid:/",
        ).pathname,
    )
    .toBe("/attacker.example/path");
  await expect
    .poll(
      async () =>
        new URL(
          (await page.locator('link[rel="canonical"]').getAttribute("href")) ??
            "invalid:/",
        ).hostname,
    )
    .not.toBe("attacker.example");
});
