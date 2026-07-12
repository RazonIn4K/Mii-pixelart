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
