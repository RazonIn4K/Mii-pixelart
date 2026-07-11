import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const representativeRoutes = ["/", "/studio", "/discover", "/search", "/community-guidelines"];

test("representative public routes have no WCAG 2.2 A/AA violations", async ({ page }) => {
  for (const route of representativeRoutes) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(
      results.violations,
      `${route} accessibility violations:\n${results.violations
        .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`)
        .join("\n")}`,
    ).toEqual([]);
  }
});

test("keyboard focus stays visible and reduced-motion preferences are honored", async ({ page }) => {
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
    const motionDurations = [...document.querySelectorAll<HTMLElement>("*")].flatMap((element) => {
      const style = getComputedStyle(element);
      return [...style.animationDuration.split(","), ...style.transitionDuration.split(",")]
        .map((duration) => toMilliseconds(duration.trim()));
    });

    return {
      activeTag: active?.tagName ?? null,
      hasVisibleFocus:
        activeStyle !== null
        && (
          (activeStyle.outlineStyle !== "none" && activeStyle.outlineWidth !== "0px")
          || activeStyle.boxShadow !== "none"
        ),
      maximumMotionDurationMs: Math.max(0, ...motionDurations),
    };
  });

  expect(state.activeTag).not.toBeNull();
  expect(state.activeTag).not.toBe("BODY");
  expect(state.hasVisibleFocus).toBe(true);
  expect(state.maximumMotionDurationMs).toBeLessThanOrEqual(1);
});
