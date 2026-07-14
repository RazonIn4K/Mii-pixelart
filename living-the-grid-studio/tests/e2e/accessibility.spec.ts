import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const representativeRoutes = [
  "/",
  "/studio",
  "/discover",
  "/search",
  "/community-guidelines",
];

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
