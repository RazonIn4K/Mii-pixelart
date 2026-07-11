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
