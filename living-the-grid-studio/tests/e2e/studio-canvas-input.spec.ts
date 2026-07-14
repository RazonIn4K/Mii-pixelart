import { expect, test } from "@playwright/test";

test("mobile Studio keeps the canvas bounded and paint controls within reach", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "minimum-phone",
    "The minimum supported phone width is the resize-loop regression edge.",
  );

  await page.goto("/studio");
  await page.getByRole("button", { name: "Start blank" }).click();

  const canvas = page.getByRole("application", {
    name: "Editable 64 by 64 pixel grid",
  });
  const paintControls = page.getByRole("region", {
    name: "Canvas paint controls",
  });
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-grid-lines", "suppressed");
  await expect(page.getByTestId("grid-zoom-hint")).toHaveText(
    "Dense preview · choose Edit to see cell lines",
  );
  await expect(canvas).toHaveAttribute("aria-describedby", /\S+ \S+ \S+/);
  await page.getByRole("button", { name: "Zoom to edit pixels" }).click();
  await expect(canvas).toHaveAttribute("data-grid-lines", "visible");
  await expect(page.getByTestId("grid-zoom-hint")).toHaveCount(0);
  await expect(paintControls).toBeVisible();
  await expect(page.getByRole("button", { name: "Pencil tool" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mirror brush left to right" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show center-axis guide" }),
  ).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Paint tools" })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("button", { name: /Choose paint color/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Starter Designs", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("canvas-workspace")).toHaveCSS(
    "background-image",
    "none",
  );

  // Let the lazily rendered Create panel settle before checking for the old
  // resize feedback loop. The regression continually grew the canvas; normal
  // panel hydration may change the document height once.
  await page.waitForTimeout(800);

  const first = await page.evaluate(() => ({
    canvasHeight:
      document.querySelector("canvas")?.getBoundingClientRect().height ?? 0,
    pageHeight: document.documentElement.scrollHeight,
    toolsTop:
      document
        .querySelector('[aria-label="Canvas paint controls"]')
        ?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
  }));
  await page.waitForTimeout(500);
  const second = await page.evaluate(() => ({
    canvasHeight:
      document.querySelector("canvas")?.getBoundingClientRect().height ?? 0,
    pageHeight: document.documentElement.scrollHeight,
  }));
  await page.waitForTimeout(500);
  const third = await page.evaluate(() => ({
    canvasHeight:
      document.querySelector("canvas")?.getBoundingClientRect().height ?? 0,
    pageHeight: document.documentElement.scrollHeight,
  }));

  expect(first.canvasHeight).toBeGreaterThan(180);
  expect(first.canvasHeight).toBeLessThan(620);
  expect(first.toolsTop).toBeLessThan(900);
  expect(
    Math.abs(second.canvasHeight - first.canvasHeight),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(third.canvasHeight - second.canvasHeight),
  ).toBeLessThanOrEqual(2);
  expect(Math.abs(third.pageHeight - second.pageHeight)).toBeLessThanOrEqual(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => {
      const quickColors = document.querySelector(
        '[aria-label="Quick paint colors"]',
      );
      if (!quickColors) return false;
      return Array.from(quickColors.querySelectorAll("button")).every(
        (button) => {
          const rect = button.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= window.innerWidth;
        },
      );
    }),
  ).toBe(true);
});

test("Studio canvas supports touch strokes, keyboard editing, and phone-friendly panning", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "A synthetic touch-pointer run in one browser covers the shared input path.",
  );

  await page.goto("/studio");
  await page.getByRole("button", { name: "Start blank" }).click();

  const canvas = page.getByRole("application", {
    name: "Editable 64 by 64 pixel grid",
  });
  await expect(canvas).toHaveAttribute("tabindex", "0");
  await expect(canvas).toHaveCSS("touch-action", "none");
  await expect(canvas).toHaveAttribute(
    "aria-keyshortcuts",
    "ArrowLeft ArrowRight ArrowUp ArrowDown Enter Space + - 0 2 H M G",
  );

  const mirrorButton = page.getByRole("button", {
    name: "Mirror brush left to right",
  });
  const guideButton = page.getByRole("button", {
    name: "Show center-axis guide",
  });
  await expect(mirrorButton).toHaveAttribute("aria-pressed", "false");
  await expect(guideButton).toHaveAttribute("aria-pressed", "false");
  await expect(canvas).toHaveAttribute("data-center-guide", "hidden");
  await mirrorButton.click();
  await expect(mirrorButton).toHaveAttribute("aria-pressed", "true");
  await expect(guideButton).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).toHaveAttribute("data-center-guide", "visible");
  await guideButton.click();
  await expect(mirrorButton).toHaveAttribute("aria-pressed", "true");
  await expect(guideButton).toHaveAttribute("aria-pressed", "false");
  await expect(canvas).toHaveAttribute("data-center-guide", "hidden");
  await guideButton.click();
  await expect(canvas).toHaveAttribute("data-center-guide", "visible");

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cellSize = Math.max(
    1,
    Math.floor(Math.min((box!.width - 40) / 64, (box!.height - 40) / 64, 32)),
  );
  const originX = box!.x + (box!.width - cellSize * 64) / 2;
  const originY = box!.y + (box!.height - cellSize * 64) / 2;
  const pointForCell = (x: number, y: number) => ({
    clientX: originX + (x + 0.5) * cellSize,
    clientY: originY + (y + 0.5) * cellSize,
  });

  const start = pointForCell(4, 4);
  const end = pointForCell(10, 4);
  await canvas.dispatchEvent("pointerdown", {
    ...start,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 17,
    pointerType: "touch",
  });
  await canvas.dispatchEvent("pointermove", {
    ...end,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 17,
    pointerType: "touch",
  });
  await canvas.dispatchEvent("pointerup", {
    ...end,
    button: 0,
    buttons: 0,
    isPrimary: true,
    pointerId: 17,
    pointerType: "touch",
  });

  await expect(
    page.getByText("64×64 · 1 color", { exact: true }),
  ).toBeVisible();

  const mirroredPixels = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const rect = canvasElement.getBoundingClientRect();
    const cellSize = Math.max(
      1,
      Math.floor(Math.min((rect.width - 40) / 64, (rect.height - 40) / 64, 32)),
    );
    const panX = Math.round((rect.width - cellSize * 64) / 2);
    const panY = Math.round((rect.height - cellSize * 64) / 2);
    const dpr = window.devicePixelRatio || 1;
    const context = canvasElement.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    const read = (x: number, y: number) =>
      Array.from(
        context.getImageData(
          Math.floor((panX + (x + 0.5) * cellSize) * dpr),
          Math.floor((panY + (y + 0.5) * cellSize) * dpr),
          1,
          1,
        ).data,
      );
    return { mirror: read(59, 4), source: read(4, 4) };
  });
  expect(mirroredPixels.mirror).toEqual(mirroredPixels.source);
  expect(
    mirroredPixels.source[0] +
      mirroredPixels.source[1] +
      mirroredPixels.source[2],
  ).toBeLessThan(180);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByText("64×64 · 0 colors", { exact: true }),
  ).toBeVisible();
  await canvas.focus();
  await canvas.press("m");
  await expect(mirrorButton).toHaveAttribute("aria-pressed", "false");
  await canvas.press("m");
  await expect(mirrorButton).toHaveAttribute("aria-pressed", "true");

  const cancelStart = pointForCell(14, 8);
  const cancelEnd = pointForCell(18, 8);
  await canvas.dispatchEvent("pointerdown", {
    ...cancelStart,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 19,
    pointerType: "pen",
  });
  await canvas.dispatchEvent("pointermove", {
    ...cancelEnd,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 19,
    pointerType: "pen",
  });
  await canvas.dispatchEvent("pointercancel", {
    ...cancelEnd,
    button: 0,
    buttons: 0,
    isPrimary: true,
    pointerId: 19,
    pointerType: "pen",
  });
  await expect(
    page.getByText("Stroke ended safely.", { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByText("64×64 · 0 colors", { exact: true }),
  ).toBeVisible();

  await canvas.focus();
  await canvas.press("ArrowRight");
  await canvas.press("Enter");
  await expect(page.getByText(/^64×64 · 1 color · x:\d+ y:\d+$/)).toBeVisible();
  await expect(page.getByText(/Activated column \d+, row \d+\./)).toHaveCount(
    1,
  );

  const handButton = page.getByRole("button", {
    name: "Use hand tool to pan canvas",
  });
  await handButton.click();
  await expect(
    page.getByRole("button", { name: "Exit hand tool" }),
  ).toHaveAttribute("aria-pressed", "true");

  const panStart = pointForCell(20, 20);
  await canvas.dispatchEvent("pointerdown", {
    ...panStart,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 23,
    pointerType: "touch",
  });
  await canvas.dispatchEvent("pointermove", {
    clientX: panStart.clientX + 32,
    clientY: panStart.clientY + 24,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 23,
    pointerType: "touch",
  });
  await canvas.dispatchEvent("pointerup", {
    clientX: panStart.clientX + 32,
    clientY: panStart.clientY + 24,
    button: 0,
    buttons: 0,
    isPrimary: true,
    pointerId: 23,
    pointerType: "touch",
  });
  await expect(page.getByText("Canvas panned.", { exact: true })).toHaveCount(
    1,
  );

  await canvas.focus();
  await canvas.press("2");
  await expect(
    page.getByText("Canvas zoomed to an easier painting scale.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await canvas.press("0");
  await expect(
    page.getByText("Canvas view reset to fit.", { exact: true }),
  ).toHaveCount(1);
});
