import { expect, test } from "@playwright/test";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lceV8QAAAABJRU5ErkJggg==",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "ltg.consent.v1",
      JSON.stringify({
        analytics: false,
        decidedAt: new Date().toISOString(),
        decision: "rejected",
        essential: true,
        marketing: false,
      }),
    );
  });
});

declare global {
  interface Window {
    __studioCspEvalViolations?: string[];
  }
}

async function expectStudioFormMetadata(page: import("@playwright/test").Page) {
  const metadata = await page.evaluate(() => ({
    fieldsMissingIdAndName: Array.from(
      document.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input, select, textarea"),
    )
      .filter((field) => !field.id && !field.name)
      .map((field) => field.outerHTML),
    orphanedLabels: Array.from(document.querySelectorAll("label"))
      .filter((label) => label.control === null)
      .map((label) => label.textContent?.trim() ?? label.outerHTML),
  }));

  expect(metadata.fieldsMissingIdAndName).toEqual([]);
  expect(metadata.orphanedLabels).toEqual([]);
}

test("Studio stays strict-CSP safe and gives every native form control metadata", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One Chromium run covers the shared lazy chunks and form metadata.",
  );

  await page.addInitScript(() => {
    window.__studioCspEvalViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      if (event.blockedURI === "eval") {
        window.__studioCspEvalViolations?.push(event.violatedDirective);
      }
    });
  });

  const navigationResponse = await page.goto("/studio");
  expect(navigationResponse).not.toBeNull();
  const enforcedCsp = navigationResponse?.headers()["content-security-policy"];
  expect(enforcedCsp).toBeTruthy();
  expect(enforcedCsp).toContain("script-src");
  expect(enforcedCsp).not.toContain("'unsafe-eval'");

  await expect(page.getByRole("tabpanel", { name: "Import" })).toBeVisible();
  await expectStudioFormMetadata(page);

  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(page.getByRole("tabpanel", { name: "Create" })).toBeVisible({
    timeout: 15_000,
  });

  const brushSize = page.getByRole("combobox", { name: "Brush size" });
  await expect(brushSize).toHaveAttribute("id", "studio-brush-size");
  await expect(brushSize).toHaveAttribute("name", "studio-brush-size");
  await expect(brushSize).toHaveAttribute("autocomplete", "off");
  await expectStudioFormMetadata(page);

  for (const tabName of [
    "Palette",
    "Optimize",
    "AI",
    "Copy Guide",
    "Export",
  ] as const) {
    await page.getByRole("tab", { name: tabName, exact: true }).click();
    await expect(page.getByRole("tabpanel", { name: tabName })).toBeVisible();
    await expectStudioFormMetadata(page);
  }

  await page.getByRole("tab", { name: "Optimize", exact: true }).click();
  const cleanupSwitch = page.getByRole("switch", {
    name: "Single-Cell Cleanup",
  });
  await expect(cleanupSwitch).toBeChecked();
  await page.getByText("Single-Cell Cleanup", { exact: true }).click();
  await expect(cleanupSwitch).not.toBeChecked();

  await page.getByRole("tab", { name: "AI", exact: true }).click();
  await page.getByText("Advanced AI settings", { exact: true }).click();
  const requestSketch = page.getByRole("checkbox", {
    name: "Generate applyable sketch JSON",
  });
  await expect(requestSketch).toBeChecked();
  await page
    .getByText("Generate applyable sketch JSON", { exact: true })
    .click();
  await expect(requestSketch).not.toBeChecked();
  await expect(
    page.getByRole("textbox", { name: "Your AI request" }),
  ).toHaveAttribute("autocomplete", "off");

  expect(
    await page.evaluate(() => window.__studioCspEvalViolations ?? []),
  ).toEqual([]);
});

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
    name: /Editable \d+ by \d+ pixel grid/,
  });
  const paintControls = page.getByRole("region", {
    name: "Canvas paint controls",
  });
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-grid-density", "cell");
  const initialGridState = await canvas.getAttribute("data-grid-lines");
  expect(["suppressed", "visible"]).toContain(initialGridState);
  if (initialGridState === "suppressed") {
    await expect(page.getByTestId("grid-zoom-hint")).toHaveText(
      "Dense preview · choose Cell view to see cell lines",
    );
    await expect(canvas).toHaveAttribute("aria-describedby", /\S+ \S+ \S+/);
  } else {
    await expect(page.getByTestId("grid-zoom-hint")).toHaveCount(0);
    await expect(canvas).toHaveAttribute("aria-describedby", /^\S+ \S+$/);
  }
  await page.getByRole("button", { name: "Zoom to edit pixels" }).click();
  await expect(canvas).toHaveAttribute("data-grid-lines", "visible");
  await expect(page.getByTestId("grid-zoom-hint")).toHaveCount(0);
  await expect(paintControls).toBeVisible();
  await expect(page.getByRole("button", { name: "Pencil tool" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mirror brush left to right" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show center guides" }),
  ).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Paint tools" })).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("button", { name: /Choose paint color/ }),
  ).toBeVisible();
  await expect(page.getByText("Starter Designs", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("canvas-workspace")).toHaveAttribute(
    "data-testid",
    "canvas-workspace",
  );
  await expect(canvas).toHaveAttribute("data-grid-renderer", "crisp-layered");
  await expect(canvas).toHaveAttribute("data-canvas-background", "light");

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
      const quickColors = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[aria-label="Quick paint colors"]',
        ),
      ).find((group) => group.getClientRects().length > 0);
      if (!quickColors) return false;
      const railRect = quickColors.getBoundingClientRect();
      return (
        railRect.left >= 0 &&
        railRect.right <= window.innerWidth &&
        Array.from(quickColors.querySelectorAll("button"))
          .filter((button) => button.getClientRects().length > 0)
          .every((button) => {
            const rect = button.getBoundingClientRect();
            return rect.width >= 44 && rect.height >= 44;
          })
      );
    }),
  ).toBe(true);
});

test("tablet keeps the reference and workflow below a full-width canvas", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "tablet",
    "The 768px breakpoint guards against the former three-column squeeze.",
  );

  await page.goto("/studio");
  await page.locator("#ltg-image-input").setInputFiles({
    buffer: TINY_PNG,
    mimeType: "image/png",
    name: "tablet-reference.png",
  });
  await expect(page.getByText("Preview ready", { exact: true })).toBeVisible();

  const canvasBox = await page
    .getByRole("application", { name: /pixel grid/ })
    .boundingBox();
  const dockBox = await page.getByTestId("studio-reference-dock").boundingBox();
  const toolsBox = await page.locator("#studio-tools").boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(dockBox).not.toBeNull();
  expect(toolsBox).not.toBeNull();
  expect(canvasBox!.width).toBeGreaterThanOrEqual(700);
  expect(dockBox!.y).toBeGreaterThanOrEqual(canvasBox!.y + canvasBox!.height);
  expect(toolsBox!.y).toBeGreaterThanOrEqual(dockBox!.y + dockBox!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("minimum phone keeps a traced source clear of the workflow panel", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "minimum-phone",
    "The 320px trace flow guards the intrinsic reference-dock height.",
  );

  await page.goto("/studio");
  await page.locator("#ltg-image-input").setInputFiles({
    buffer: TINY_PNG,
    mimeType: "image/png",
    name: "phone-trace.png",
  });
  const trace = page.getByRole("button", {
    name: "Trace framed source on a blank grid",
  });
  await expect(trace).toBeEnabled();
  await trace.click();

  const dock = page.getByTestId("studio-reference-dock");
  const tools = page.locator("#studio-tools");
  await expect(dock).toBeVisible();
  const layout = await page.evaluate(() => {
    const dockElement = document.querySelector<HTMLElement>(
      '[data-testid="studio-reference-dock"]',
    );
    const toolsElement = document.querySelector<HTMLElement>("#studio-tools");
    if (!dockElement || !toolsElement) return null;
    const dockRect = dockElement.getBoundingClientRect();
    const childrenBottom = Math.max(
      dockRect.bottom,
      ...Array.from(dockElement.querySelectorAll<HTMLElement>("*")).map(
        (element) => element.getBoundingClientRect().bottom,
      ),
    );
    return {
      childrenBottom,
      dockHeight: dockRect.height,
      toolsTop: toolsElement.getBoundingClientRect().top,
    };
  });
  expect(layout).not.toBeNull();
  expect(layout!.dockHeight).toBeGreaterThanOrEqual(360);
  expect(layout!.childrenBottom).toBeLessThanOrEqual(layout!.toolsTop);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
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
    name: /Editable \d+ by \d+ pixel grid/,
  });
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute("data-grid-density", "cell");
  await expect(canvas).toHaveAttribute("data-brush-preview", "1");
  const brushSizeControl = page.getByRole("combobox", { name: "Brush size" });
  await brushSizeControl.selectOption("3");
  await expect(canvas).toHaveAttribute("data-brush-preview", "3");
  await brushSizeControl.selectOption("1");

  for (const density of ["Off", "Coarse", "Medium", "Cell"] as const) {
    await expect(
      page.getByRole("button", { name: `Grid density: ${density}` }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Grid density: Off" }).click();
  await expect(canvas).toHaveAttribute("data-grid-density", "off");
  await expect(canvas).toHaveAttribute("data-grid-lines", "hidden");
  await page.getByRole("button", { name: "Grid density: Coarse" }).click();
  await expect(canvas).toHaveAttribute("data-grid-density", "coarse");
  await expect(canvas).toHaveAttribute("data-grid-lines", "visible");
  await page.getByRole("button", { name: "Grid density: Cell" }).click();

  await expect(
    page.getByRole("button", { name: "Canvas background: Light checker" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Canvas background: Dark checker" })
    .click();
  await expect(canvas).toHaveAttribute("data-canvas-background", "dark");
  await page
    .getByRole("button", { name: "Canvas background: Light checker" })
    .click();

  await page.getByRole("button", { name: /Choose paint color/ }).click();
  await expect(
    page.getByTestId("studio-palette-matrix").locator("button"),
  ).toHaveCount(77);
  await expect(
    page.getByTestId("studio-saturated-color-rail").locator("button"),
  ).toHaveCount(7);
  await page.keyboard.press("Escape");

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
    name: "Show center guides",
  });
  await expect(mirrorButton).toHaveAttribute("aria-pressed", "false");
  await expect(guideButton).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).toHaveAttribute("data-center-guide", "visible");
  await guideButton.click();
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
  const cellSize = Number(await canvas.getAttribute("data-cell-size"));
  const originX =
    box!.x + Number(await canvas.getAttribute("data-grid-origin-x"));
  const originY =
    box!.y + Number(await canvas.getAttribute("data-grid-origin-y"));
  const pointForCell = (x: number, y: number) => ({
    clientX: originX + (x + 0.5) * cellSize,
    clientY: originY + (y + 0.5) * cellSize,
  });

  const firstCellPoint = pointForCell(0, 0);
  await page.mouse.move(firstCellPoint.clientX, firstCellPoint.clientY);
  await expect(
    page.getByText("64×64 · 0 colors · C 1 · R 1 · NW", { exact: true }),
  ).toBeVisible();
  await page.mouse.move(0, 0);

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

  await expect(page.getByText(/^64×64 · 1 color(?: ·|$)/)).toBeVisible();

  const mirroredPixels = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const cellSize = Number(canvasElement.dataset.cellSize);
    const panX = Number(canvasElement.dataset.gridOriginX);
    const panY = Number(canvasElement.dataset.gridOriginY);
    const dpr = canvasElement.width / Math.max(1, canvasElement.clientWidth);
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
  await expect(
    page.getByText(/^64×64 · 1 color · C \d+ · R \d+ · (?:NW|NE|SW|SE)$/),
  ).toBeVisible();
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
    page.getByText("Canvas set to Cell view for precise drawing.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(canvas).toHaveAttribute("data-cell-size", "14");
  const originBeforeKeyboardFollow = Number(
    await canvas.getAttribute("data-grid-origin-y"),
  );
  for (let step = 0; step < 64; step += 1) {
    await canvas.press("ArrowDown");
  }
  await expect(
    page.getByText(/Keyboard cursor at column \d+, row 64\./),
  ).toHaveCount(1);
  await expect
    .poll(() =>
      canvas.getAttribute("data-grid-origin-y").then((value) => Number(value)),
    )
    .toBeLessThan(originBeforeKeyboardFollow);
  await canvas.press("0");
  await expect(
    page.getByText("Canvas view reset to fit.", { exact: true }),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "256 Detail" }).click();
  await expect(canvas).toHaveAttribute("data-grid-width", "256");
  await page
    .getByRole("button", { name: /Zoom to edit pixels · Cell view/ })
    .click();
  await expect
    .poll(() =>
      canvas.getAttribute("data-cell-size").then((value) => Number(value)),
    )
    .toBeGreaterThanOrEqual(12);
});

test("paint tools change pixels and a mid-stroke shortcut keeps one undo entry", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the shared canvas tool and stroke transaction path.",
  );

  await page.goto("/studio");
  await page.getByRole("button", { name: "Start blank" }).click();
  const canvas = page.getByRole("application", {
    name: "Editable 64 by 64 pixel grid",
  });
  const point = async (x: number, y: number) => {
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const cellSize = Number(await canvas.getAttribute("data-cell-size"));
    return {
      clientX:
        box!.x +
        Number(await canvas.getAttribute("data-grid-origin-x")) +
        (x + 0.5) * cellSize,
      clientY:
        box!.y +
        Number(await canvas.getAttribute("data-grid-origin-y")) +
        (y + 0.5) * cellSize,
    };
  };
  const readCellPixel = async (x: number, y: number) =>
    canvas.evaluate(
      (element, target) => {
        const targetCanvas = element as HTMLCanvasElement;
        const context = targetCanvas.getContext("2d");
        if (!context) throw new Error("Canvas context unavailable");
        const dpr = targetCanvas.width / Math.max(1, targetCanvas.clientWidth);
        const size = Number(targetCanvas.dataset.cellSize);
        const panX = Number(targetCanvas.dataset.gridOriginX);
        const panY = Number(targetCanvas.dataset.gridOriginY);
        return Array.from(
          context.getImageData(
            Math.floor((panX + (target.x + 0.5) * size) * dpr),
            Math.floor((panY + (target.y + 0.5) * size) * dpr),
            1,
            1,
          ).data,
        );
      },
      { x, y },
    );

  const selectPaletteColor = async (accessibleName: string) => {
    const paletteTrigger = page.getByRole("button", {
      name: /Choose paint color/,
    });
    const paletteMatrix = page.getByTestId("studio-palette-matrix");
    await paletteTrigger.click();
    await page
      .getByTestId("studio-palette-matrix")
      .getByRole("button", { name: accessibleName, exact: true })
      .click();
    const selectedName = accessibleName.replace(/^Select \S+ /, "");
    await expect(paletteTrigger).toHaveAccessibleName(
      `Choose paint color. Current color ${selectedName}`,
    );
    await expect(paletteMatrix).toBeHidden();
  };

  await selectPaletteColor("Select R1C2 Red");
  await canvas.focus();
  await canvas.press("f");
  const fillPoint = await point(1, 1);
  await page.mouse.click(fillPoint.clientX, fillPoint.clientY);
  await expect(page.getByText(/^64×64 · 1 color(?: ·|$)/)).toBeVisible();

  await selectPaletteColor("Select R10C1 Black");
  await canvas.focus();
  await canvas.press("p");
  const blackPoint = await point(10, 10);
  await page.mouse.click(blackPoint.clientX, blackPoint.clientY);
  const blackPixel = await readCellPixel(10, 10);
  expect(blackPixel[0] + blackPixel[1] + blackPixel[2]).toBeLessThan(180);

  await canvas.focus();
  await canvas.press("i");
  const eyedropperPoint = await point(10, 10);
  await page.mouse.click(eyedropperPoint.clientX, eyedropperPoint.clientY);
  await expect(
    page.getByRole("button", { name: "Select R10C1 Black" }),
  ).toHaveAttribute("aria-pressed", "true");

  await canvas.focus();
  await canvas.press("e");
  await page.getByRole("combobox", { name: "Brush size" }).selectOption("3");
  const eraserPoint = await point(10, 10);
  await page.mouse.click(eraserPoint.clientX, eraserPoint.clientY);
  const erasedPixel = await readCellPixel(10, 10);
  expect(erasedPixel[0] + erasedPixel[1] + erasedPixel[2]).toBeGreaterThan(300);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await readCellPixel(10, 10)).toEqual(blackPixel);

  await page.getByRole("combobox", { name: "Brush size" }).selectOption("1");
  await canvas.focus();
  await canvas.press("p");
  const strokeStart = await point(20, 20);
  const strokeEnd = await point(24, 20);
  await canvas.dispatchEvent("pointerdown", {
    ...strokeStart,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 71,
    pointerType: "pen",
  });
  await canvas.dispatchEvent("pointermove", {
    ...strokeEnd,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 71,
    pointerType: "pen",
  });
  await page.keyboard.press("f");
  await canvas.dispatchEvent("pointerup", {
    ...strokeEnd,
    button: 0,
    buttons: 0,
    isPrimary: true,
    pointerId: 71,
    pointerType: "pen",
  });
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  const paintedStrokePixel = await readCellPixel(22, 20);
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await readCellPixel(22, 20)).not.toEqual(paintedStrokePixel);

  await canvas.focus();
  await canvas.press("p");
  await canvas.dispatchEvent("pointerdown", {
    ...strokeStart,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 72,
    pointerType: "pen",
  });
  await page.keyboard.press("Control+z");
  await canvas.dispatchEvent("pointermove", {
    ...strokeEnd,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 72,
    pointerType: "pen",
  });
  await canvas.dispatchEvent("pointerup", {
    ...strokeEnd,
    button: 0,
    buttons: 0,
    isPrimary: true,
    pointerId: 72,
    pointerType: "pen",
  });
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await readCellPixel(22, 20)).not.toEqual(paintedStrokePixel);
});

test("two-finger gestures pause painting without changing the document", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Synthetic multi-touch in one browser covers the shared gesture state machine.",
  );

  await page.goto("/studio");
  await page.getByRole("button", { name: "Start blank" }).click();
  const canvas = page.getByRole("application", {
    name: "Editable 64 by 64 pixel grid",
  });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cellSize = Number(await canvas.getAttribute("data-cell-size"));
  const modifiedAtBeforeGesture = await canvas.getAttribute(
    "data-document-modified-at",
  );
  const origin = {
    x: box!.x + Number(await canvas.getAttribute("data-grid-origin-x")),
    y: box!.y + Number(await canvas.getAttribute("data-grid-origin-y")),
  };
  // Begin in the surrounding workbench gutter, not on a project cell. A
  // two-finger navigation gesture must still start without painting.
  const first = {
    clientX: box!.x + 8,
    clientY: box!.y + box!.height / 2,
  };
  const second = {
    clientX: origin.x + 20.5 * cellSize,
    clientY: origin.y + 20.5 * cellSize,
  };
  const midpoint = {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  };
  const anchoredWorldCell = {
    x: (midpoint.x - origin.x) / cellSize,
    y: (midpoint.y - origin.y) / cellSize,
  };

  await canvas.dispatchEvent("pointerdown", {
    ...first,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 41,
    pointerType: "touch",
  });
  await canvas.dispatchEvent("pointerdown", {
    ...second,
    button: 0,
    buttons: 1,
    isPrimary: false,
    pointerId: 42,
    pointerType: "touch",
  });
  await expect(
    page.getByText("Two-finger pan and zoom enabled; drawing paused.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await canvas.dispatchEvent("pointermove", {
    clientX: first.clientX - cellSize * 8,
    clientY: first.clientY - cellSize * 8,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 41,
    pointerType: "touch",
  });
  await canvas.dispatchEvent("pointermove", {
    clientX: second.clientX + cellSize * 8,
    clientY: second.clientY + cellSize * 8,
    button: 0,
    buttons: 1,
    isPrimary: false,
    pointerId: 42,
    pointerType: "touch",
  });
  await expect
    .poll(() =>
      canvas.getAttribute("data-cell-size").then((value) => Number(value)),
    )
    .toBeGreaterThan(cellSize);
  const pinchedCellSize = Number(await canvas.getAttribute("data-cell-size"));
  const pinchedOrigin = {
    x: box!.x + Number(await canvas.getAttribute("data-grid-origin-x")),
    y: box!.y + Number(await canvas.getAttribute("data-grid-origin-y")),
  };
  expect(
    Math.abs(
      pinchedOrigin.x + anchoredWorldCell.x * pinchedCellSize - midpoint.x,
    ),
  ).toBeLessThanOrEqual(1.5);
  expect(
    Math.abs(
      pinchedOrigin.y + anchoredWorldCell.y * pinchedCellSize - midpoint.y,
    ),
  ).toBeLessThanOrEqual(1.5);
  await canvas.dispatchEvent("pointerup", {
    ...second,
    button: 0,
    buttons: 0,
    isPrimary: false,
    pointerId: 42,
    pointerType: "touch",
  });
  await canvas.dispatchEvent("pointerup", {
    ...first,
    button: 0,
    buttons: 0,
    isPrimary: true,
    pointerId: 41,
    pointerType: "touch",
  });

  await expect(page.getByText(/64×64 · 0 colors/)).toBeVisible();
  await expect(canvas).toHaveAttribute(
    "data-document-modified-at",
    modifiedAtBeforeGesture ?? "",
  );
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("an imported image becomes a browser-local tracing layer on one canvas", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the shared local reference lifecycle.",
  );

  await page.goto("/studio");
  await page.locator("#ltg-image-input").setInputFiles({
    buffer: TINY_PNG,
    mimeType: "image/png",
    name: "local-reference.png",
  });
  await expect(page.getByText("Preview ready", { exact: true })).toBeVisible();

  const dock = page.getByTestId("studio-reference-dock");
  await expect(dock).toBeVisible();
  await expect(dock.getByText("Browser-only", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("application", { name: /pixel grid/ }),
  ).toHaveCount(1);
  await expect(page.locator("canvas")).toHaveCount(1);
  const canvas = page.getByRole("application", { name: /pixel grid/ });
  await expect(canvas).toHaveAttribute("data-reference-underlay", "hidden");
  await expect(
    dock.getByRole("button", { name: "Commit or trace first" }),
  ).toBeDisabled();

  await dock
    .getByRole("button", { name: "Trace framed source on a blank grid" })
    .click();
  await expect(
    page.getByRole("application", {
      name: "Editable 32 by 32 pixel grid",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Commit Preview" }),
  ).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-reference-underlay", "visible");

  const dim = dock.locator('input[type="range"]');
  await dim.fill("55");
  await expect(dim).toHaveValue("55");
  const flip = dock.getByRole("button", { name: "Flip" });
  await flip.click();
  await expect(dock.getByRole("button", { name: "Unflip" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const tracingToggle = dock.getByRole("button", {
    name: "Reference visible",
  });
  await tracingToggle.click();
  await expect(
    dock.getByRole("button", { name: "Show reference" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(canvas).toHaveAttribute("data-reference-underlay", "hidden");
  await dock.getByRole("button", { name: "Show reference" }).click();
  await expect(canvas).toHaveAttribute("data-reference-underlay", "visible");

  await expect(dock).toBeVisible();
  await expect(page.locator("canvas[data-grid-width]")).toHaveCount(1);
  await expect(
    page.getByRole("application", { name: /pixel grid/ }),
  ).toHaveCount(1);

  await dock.getByRole("button", { name: "Remove local reference" }).click();
  await expect(dock).toHaveCount(0);
  await expect(page.locator("canvas[data-grid-width]")).toHaveCount(1);
  await expect(
    page.getByRole("application", { name: /pixel grid/ }),
  ).toHaveCount(1);
});
