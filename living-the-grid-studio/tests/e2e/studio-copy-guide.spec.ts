import { expect, test } from "@playwright/test";

const COPY_GUIDE_DOCUMENT = {
  version: 1,
  meta: {
    name: "Copy Guide acceptance",
    createdAt: "2026-07-14T00:00:00.000Z",
    modifiedAt: "2026-07-14T00:00:00.000Z",
  },
  width: 8,
  height: 8,
  cells: [
    "R1C1",
    "R1C1",
    null,
    "R2C2",
    "R2C2",
    null,
    null,
    null,
    null,
    "R4C2",
    null,
    null,
    null,
    null,
    null,
    null,
    ...new Array(48).fill(null),
  ],
  usedColors: ["R1C1", "R2C2", "R4C2"],
  lockedColors: [],
};

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

test("Copy Guide highlights deterministic runs without mutating the artwork", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers shared Copy Guide state and interaction behavior.",
  );

  const sessionReady = page.waitForResponse((response) =>
    response.url().includes("/api/auth/session"),
  );
  await page.goto("/studio");
  await sessionReady;
  await page.locator("#ltg-json-input").setInputFiles({
    name: "copy-guide.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(COPY_GUIDE_DOCUMENT)),
  });

  const editableCanvas = page.getByRole("application", {
    name: "Editable 8 by 8 pixel grid",
  });
  await expect(editableCanvas).toBeVisible();
  const originalModifiedAt = await editableCanvas.getAttribute(
    "data-document-modified-at",
  );

  await page.getByRole("button", { name: "Copy Guide", exact: true }).click();

  const guideCanvas = page.getByRole("application", {
    name: "Read-only Copy Guide 8 by 8 pixel grid",
  });
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(guideCanvas).toBeVisible();
  await expect(guideCanvas).toHaveAttribute("data-canvas-mode", "copy");
  await expect(guideCanvas).toHaveAttribute("data-guide-row", "1");
  await expect(guideCanvas).toHaveAttribute("data-guide-start-column", "1");
  await expect(guideCanvas).toHaveAttribute("data-guide-end-column", "2");
  await expect(
    page
      .getByTestId("copy-guide-current-step")
      .getByText("Row 1, columns 1–2: R1C1.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Copy mode · read only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();

  await guideCanvas.focus();
  await guideCanvas.press("Space");
  await page.keyboard.press("Control+z");
  await expect(guideCanvas).toHaveAttribute(
    "data-document-modified-at",
    originalModifiedAt ?? "",
  );

  await page.getByRole("button", { name: "Complete & next" }).click();
  await expect(
    page
      .getByTestId("copy-guide-current-step")
      .getByText("Row 1, columns 4–5: R2C2.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", {
      name: "1 of 3 Copy Guide runs complete",
    }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Create", exact: true }).click();
  await page.getByRole("tab", { name: "Copy Guide", exact: true }).click();
  await expect(
    page
      .getByTestId("copy-guide-current-step")
      .getByText("Row 1, columns 4–5: R2C2.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("progressbar", {
      name: "1 of 3 Copy Guide runs complete",
    }),
  ).toBeVisible();
});

test("minimum-phone Studio exposes reference and Copy Guide actions without overflow", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "minimum-phone",
    "The 320px project is the mobile navigation and overflow regression edge.",
  );

  const sessionReady = page.waitForResponse((response) =>
    response.url().includes("/api/auth/session"),
  );
  await page.goto("/studio");
  await sessionReady;
  await page.getByRole("button", { name: "Start blank" }).click();

  const referenceButton = page.getByRole("button", {
    name: "Reference",
    exact: true,
  });
  const copyGuideButton = page.getByRole("button", {
    name: "Copy Guide",
    exact: true,
  });
  await expect(referenceButton).toBeVisible();
  await expect(copyGuideButton).toBeVisible();

  const firstViewportActions = await Promise.all([
    referenceButton.boundingBox(),
    copyGuideButton.boundingBox(),
  ]);
  for (const box of firstViewportActions) {
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y + box!.height).toBeLessThanOrEqual(760);
  }

  const canvas = page.getByRole("application", {
    name: "Editable 64 by 64 pixel grid",
  });
  await canvas.focus();
  await canvas.press("Space");
  await copyGuideButton.click();

  await expect(
    page.getByRole("application", {
      name: "Read-only Copy Guide 64 by 64 pixel grid",
    }),
  ).toBeVisible();
  const labelToggle = page.getByRole("button", {
    name: "Toggle paint-by-numbers labels",
  });
  await expect(labelToggle).toBeDisabled();
  await expect(labelToggle).toHaveAttribute("aria-pressed", "true");
  const zoomHint = page.getByTestId("grid-zoom-hint");
  if ((await zoomHint.count()) > 0) {
    await expect(zoomHint).toHaveText(
      "Dense preview · choose Copy to see cell lines",
    );
  }
  await expect(page.getByTestId("copy-guide-panel")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("switching to Copy Guide finishes an active paint stroke", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "A synthetic pointer transition in one browser covers the shared stroke lifecycle.",
  );

  await page.goto("/studio");
  await page.getByRole("button", { name: "Start blank" }).click();

  const editableCanvas = page.getByRole("application", {
    name: "Editable 64 by 64 pixel grid",
  });
  const box = await editableCanvas.boundingBox();
  expect(box).not.toBeNull();
  const cellSize = Math.max(
    1,
    Math.floor(Math.min((box!.width - 40) / 64, (box!.height - 40) / 64, 32)),
  );
  const point = {
    clientX: box!.x + (box!.width - cellSize * 64) / 2 + (4 + 0.5) * cellSize,
    clientY: box!.y + (box!.height - cellSize * 64) / 2 + (4 + 0.5) * cellSize,
  };

  await editableCanvas.dispatchEvent("pointerdown", {
    ...point,
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 31,
    pointerType: "pen",
  });
  await expect(
    page.getByText("64×64 · 1 color", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Copy Guide", exact: true })
    .evaluate((element) => (element as HTMLButtonElement).click());
  await expect(
    page.getByRole("application", {
      name: "Read-only Copy Guide 64 by 64 pixel grid",
    }),
  ).toBeVisible();
  await page.locator("canvas").dispatchEvent("pointerup", {
    ...point,
    button: 0,
    buttons: 0,
    isPrimary: true,
    pointerId: 31,
    pointerType: "pen",
  });

  await page.getByRole("tab", { name: "Create", exact: true }).click();
  const labelToggle = page.getByRole("button", {
    name: "Toggle paint-by-numbers labels",
  });
  await expect(labelToggle).toBeEnabled();
  await expect(labelToggle).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByText("64×64 · 0 colors", { exact: true }),
  ).toBeVisible();
});
