import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lceV8QAAAABJRU5ErkJggg==",
  "base64",
);
const SAMPLE_STUDIO_JSON = readFileSync(
  new URL("../../fixtures/sample-grid-document.json", import.meta.url),
);

async function mockAiAccount(
  page: Page,
  userId: string,
  dataCollection: "allow" | "deny" = "deny",
  presets: unknown[] = [],
) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      body: JSON.stringify({
        data: {
          session: { id: `${userId}-session` },
          user: {
            avatarSeed: userId,
            createdAt: Date.now(),
            displayName: "AI Browser User",
            id: userId,
            role: "user",
            status: "active",
            termsAccepted: true,
            termsVersion: "2026-07-14",
            username: userId,
          },
        },
        requestId: `${userId}-request`,
      }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      body: JSON.stringify({ configured: true, dataCollection }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/models", (route) =>
    route.fulfill({
      body: JSON.stringify({ presets }),
      contentType: "application/json",
      status: 200,
    }),
  );
}

const UNAVAILABLE_AI_PRESET = {
  available: false,
  context: "0 tokens",
  id: "offline/model:free",
  label: "Temporarily offline",
  note: "The provider reports this model as unavailable.",
  pricingCompletion: "$0.00/1M",
  pricingPrompt: "$0.00/1M",
  rank: 1,
  releaseDate: "2026-07-15",
  supportsImages: false,
};

test("Studio opens with a task-oriented workflow and useful start choices", async ({
  page,
}) => {
  await page.goto("/studio");

  await expect(
    page.getByRole("heading", { name: "What would you like to make?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload an image" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start blank" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Browse starters" }),
  ).toBeVisible();

  const gameMatchedSizes = page.getByRole("group", {
    name: "Game-matched grid size",
  });
  await expect(
    gameMatchedSizes.getByRole("button", { name: /32×32 cells/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await gameMatchedSizes.getByRole("button", { name: /64×64 cells/ }).click();
  await expect(
    gameMatchedSizes.getByRole("button", { name: /64×64 cells/ }),
  ).toHaveAttribute("aria-pressed", "true");

  const workflow = page.getByRole("tablist", { name: "Studio workflow" });
  for (const phase of ["Start", "Edit", "Improve", "Finish"]) {
    await expect(workflow.getByText(phase, { exact: true })).toBeVisible();
  }
  for (const tool of [
    "Import",
    "Create",
    "Palette",
    "Optimize",
    "AI",
    "Copy Guide",
    "Export",
  ]) {
    await expect(
      workflow.getByRole("tab", { name: tool, exact: true }),
    ).toBeVisible();
  }

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);

  await expect(
    page.getByRole("link", { name: "Explore community" }),
  ).toHaveAttribute("href", "/discover");
  await expect(
    page.getByRole("link", { name: "Open my projects" }),
  ).toHaveAttribute("href", "/me/projects");

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload an image" }).click();
  const fileChooser = await fileChooserPromise;
  expect(fileChooser.isMultiple()).toBe(false);

  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(workflow.getByRole("tab", { name: "Create" })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(
    page.getByRole("heading", { name: "What would you like to make?" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("64×64 · 0 colors", { exact: true }),
  ).toBeVisible();
  const templatePreviews = page.locator("canvas[data-template-preview]");
  await expect(templatePreviews).toHaveCount(28);
  expect(
    await page
      .locator("#studio-tools")
      .evaluate((element) => element.querySelectorAll("*").length),
  ).toBeLessThan(500);
  await expect
    .poll(() =>
      templatePreviews.first().evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const context = canvas.getContext("2d");
        if (!context) return false;
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        for (let index = 0; index < pixels.length; index += 4) {
          if (
            pixels[index] !== 255 ||
            pixels[index + 1] !== 255 ||
            pixels[index + 2] !== 255
          ) {
            return true;
          }
        }
        return false;
      }),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("queued Studio notifications survive the deferred toast runtime", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the shared deferred notification runtime.",
  );

  const runtimeRequests: string[] = [];
  page.on("request", (request) => {
    if (
      /RuntimeToaster|components\/ui\/sonner|deps\/sonner/.test(request.url())
    ) {
      runtimeRequests.push(request.url());
    }
  });

  await page.goto("/studio");
  await expect(
    page.getByRole("heading", { name: "What would you like to make?" }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  expect(runtimeRequests).toEqual([]);

  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(
    page.getByText("Created Untitled Canvas", { exact: true }),
  ).toBeVisible();
  expect(runtimeRequests.some((url) => url.includes("RuntimeToaster"))).toBe(
    true,
  );
});

test("Studio notifications remain usable when the optional toast chunk fails", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the shared notification fallback.",
  );

  // Exercise the fallback against both Vite's source URL in development and
  // the hashed lazy chunk emitted by the production build.
  await page.route(/\/RuntimeToaster(?:-[^/]+\.js|\.tsx)(?:\?.*)?$/, (route) =>
    route.abort("failed"),
  );
  await page.goto("/studio");
  await page.getByRole("button", { name: "Start blank" }).click();

  const notifications = page.getByRole("region", { name: "Notifications" });
  await expect(notifications).toBeVisible();
  await expect(
    notifications.getByText("Created Untitled Canvas", { exact: true }),
  ).toBeVisible();
  await expect(
    notifications.getByRole("button", { name: "Dismiss notification" }),
  ).toBeVisible();
});

test("Studio file pickers are keyboard-focusable buttons while inputs stay out of the tab order", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One keyboard file-picker run is sufficient.",
  );
  await page.goto("/studio");

  const imageButton = page.getByRole("button", {
    name: "Image",
    exact: true,
  });
  const jsonButton = page.getByRole("button", { name: "JSON", exact: true });
  await expect(imageButton).toBeVisible();
  await expect(jsonButton).toBeVisible();
  await expect(page.locator("#ltg-image-input")).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await expect(page.locator("#ltg-json-input")).toHaveAttribute(
    "tabindex",
    "-1",
  );

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (
      await imageButton.evaluate(
        (element) => element === document.activeElement,
      )
    )
      break;
    await page.keyboard.press("Tab");
  }
  await expect(imageButton).toBeFocused();

  const imageChooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await imageChooserPromise;

  await page.keyboard.press("Tab");
  await expect(jsonButton).toBeFocused();
  const jsonChooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await jsonChooserPromise;
});

test("Studio crop percentages can be adjusted with the keyboard", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One keyboard crop-control run is sufficient.",
  );
  await page.goto("/studio");
  await page.locator("#ltg-image-input").setInputFiles({
    buffer: TINY_PNG,
    mimeType: "image/png",
    name: "tiny.png",
  });
  await expect(page.getByText("Preview ready", { exact: true })).toBeVisible();

  const cropWidth = page.getByRole("spinbutton", { name: "Crop width" });
  const cropHeight = page.getByRole("spinbutton", { name: "Crop height" });
  const cropX = page.getByRole("spinbutton", { name: "Crop X" });
  const cropY = page.getByRole("spinbutton", { name: "Crop Y" });

  await cropWidth.focus();
  await page.keyboard.press("ArrowDown");
  await expect(cropWidth).toHaveValue("99");
  await cropX.focus();
  await page.keyboard.press("ArrowUp");
  await expect(cropX).toHaveValue("1");

  await cropHeight.focus();
  await page.keyboard.press("ArrowDown");
  await expect(cropHeight).toHaveValue("99");
  await cropY.focus();
  await page.keyboard.press("ArrowUp");
  await expect(cropY).toHaveValue("1");
});

test("image upload moves directly into reliable paint mode after review", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One upload-to-paint transition covers the shared workflow.",
  );
  await page.goto("/studio");
  await page.locator("#ltg-image-input").setInputFiles({
    buffer: TINY_PNG,
    mimeType: "image/png",
    name: "tiny.png",
  });
  await expect(page.getByText("Preview ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Commit Preview" }).click();

  await expect(page.getByRole("tab", { name: "Create" })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(
    page.getByRole("region", { name: "Canvas paint controls" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pencil tool" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("application", { name: /Editable \d+ by \d+ pixel grid/ }),
  ).toBeVisible();
});

test("AI applies one validated document revision that Undo removes in one step", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop AI history run covers the shared document state.",
  );
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      body: JSON.stringify({
        data: {
          session: { id: "ai-e2e-session" },
          user: {
            avatarSeed: "ai-e2e-user",
            createdAt: Date.now(),
            displayName: "AI E2E User",
            id: "ai-e2e-user",
            role: "user",
            status: "active",
            termsAccepted: true,
            termsVersion: "2026-07-14",
            username: "ai-e2e-user",
          },
        },
        requestId: "ai-e2e-session",
      }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      body: JSON.stringify({ configured: true, dataCollection: "deny" }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/models", (route) =>
    route.fulfill({
      body: JSON.stringify({ presets: [] }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/chat", async (route) => {
    expect(route.request().postDataJSON().currentGridImage).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 250));
    return route.fulfill({
      body: JSON.stringify({
        configured: true,
        model: "test/free",
        reply: "A small validated edit.",
        sketch: {
          name: "AI edit",
          width: 8,
          height: 8,
          rows: Array.from({ length: 8 }, (_, y) =>
            Array.from({ length: 8 }, (_, x) => (x === y ? "R10C1" : null)),
          ),
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/studio");
  const essentialCookies = page.getByRole("button", {
    name: "Essential only",
  });
  if (await essentialCookies.isVisible()) await essentialCookies.click();
  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(
    page.getByText("Created Untitled Canvas", { exact: false }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "AI" }).click();
  await expect(page.getByText("Text only", { exact: true })).toBeVisible();
  await page.getByText("Advanced AI settings", { exact: true }).click();
  await page
    .getByPlaceholder(/Ask for a 32x32 horror icon/)
    .fill("Improve this canvas");
  await page.getByRole("button", { name: "Send to AI" }).click();
  // First AI use requires explicit third-party processing consent; the
  // request must not fire until it is granted.
  await expect(
    page.getByRole("alertdialog", { name: "AI processing consent" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Agree and send" }).click();
  await expect(page.getByRole("button", { name: "New" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete" })).toBeDisabled();
  await expect(page.getByText("AI edit", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply once" }).click();

  await expect(page.getByText("8×8 · 1 color", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByText("64×64 · 0 colors", { exact: true }),
  ).toBeVisible();
});

test("AI refine mode explicitly attaches only the rendered grid", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop request covers the shared AI payload builder.",
  );
  await page.addInitScript(() => {
    localStorage.setItem("ltg.ai.consent.v1.ai-refine-user", "v2:deny");
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      body: JSON.stringify({
        data: {
          session: { id: "ai-refine-session" },
          user: {
            avatarSeed: "ai-refine-user",
            createdAt: Date.now(),
            displayName: "AI Refine User",
            id: "ai-refine-user",
            role: "user",
            status: "active",
            termsAccepted: true,
            termsVersion: "2026-07-14",
            username: "ai-refine-user",
          },
        },
        requestId: "ai-refine-session",
      }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      body: JSON.stringify({ configured: true, dataCollection: "deny" }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/models", (route) =>
    route.fulfill({
      body: JSON.stringify({ presets: [] }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/chat", (route) => {
    const body = route.request().postDataJSON();
    expect(body.currentDocument).toMatchObject({ width: 64, height: 64 });
    expect(body.currentGridImage).toMatchObject({ width: 64, height: 64 });
    expect(body.currentGridImage.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(body.requestSketch).toBe(true);
    expect(body.preserveDimensions).toBe(true);
    return route.fulfill({
      body: JSON.stringify({
        configured: true,
        model: "test/free",
        reply: "I reviewed the rendered palette grid only.",
        sketch: {
          name: "Refined canvas",
          width: 64,
          height: 64,
          rows: Array.from({ length: 64 }, (_, y) =>
            Array.from({ length: 64 }, (_, x) =>
              (x === 30 || x === 33) && y >= 28 && y <= 35 ? "R10C1" : null,
            ),
          ),
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/studio");
  const essentialCookies = page.getByRole("button", {
    name: "Essential only",
  });
  if (await essentialCookies.isVisible()) await essentialCookies.click();
  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(
    page.getByText("Created Untitled Canvas", { exact: false }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "AI" }).click();
  await page.getByRole("button", { name: "Refine this canvas" }).click();
  await expect(
    page.getByText("Canvas attached", { exact: true }),
  ).toBeVisible();
  await page.getByText("Advanced AI settings", { exact: true }).click();
  await page.getByRole("combobox", { name: "AI model" }).click();
  await expect(
    page.getByRole("option", { name: /Gemma 4 31B/ }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Send to AI" }).click();
  await expect(
    page.getByText("I reviewed the rendered palette grid only.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Preview of Refined canvas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply once" }).click();
  await expect(
    page.getByText("64×64 · 1 color", { exact: true }),
  ).toBeVisible();
});

test("AI refine explains its 64 pixel canvas ceiling", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the shared refinement dimension gate.",
  );
  await page.goto("/studio");
  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(
    page.getByText("Created Untitled Canvas", { exact: false }),
  ).toBeHidden();
  await page.getByRole("button", { name: "96 Detail" }).click();
  await expect(
    page.getByText("96×96 · 0 colors", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "AI" }).click();
  await expect(
    page.getByRole("button", { name: "Refine this canvas" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Refine supports canvases up to 64×64/),
  ).toBeVisible();
  await page.getByText("Advanced AI settings", { exact: true }).click();
  await expect(
    page.getByLabel("Include current canvas for editing"),
  ).toBeDisabled();
});

test("AI provider failure leaves manual painting available", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop failure run covers the shared recovery path.",
  );
  await page.addInitScript(() => {
    localStorage.setItem("ltg.ai.consent.v1.ai-failure-user", "v2:deny");
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      body: JSON.stringify({
        data: {
          session: { id: "ai-failure-session" },
          user: {
            avatarSeed: "ai-failure-user",
            createdAt: Date.now(),
            displayName: "AI Failure User",
            id: "ai-failure-user",
            role: "user",
            status: "active",
            termsAccepted: true,
            termsVersion: "2026-07-14",
            username: "ai-failure-user",
          },
        },
        requestId: "ai-failure-session",
      }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      body: JSON.stringify({ configured: true, dataCollection: "deny" }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/models", (route) =>
    route.fulfill({
      body: JSON.stringify({ presets: [] }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/chat", (route) =>
    route.fulfill({
      body: JSON.stringify({
        configured: true,
        reply: "The AI provider is temporarily unavailable.",
      }),
      contentType: "application/json",
      status: 503,
    }),
  );

  await page.goto("/studio");
  const essentialCookies = page.getByRole("button", {
    name: "Essential only",
  });
  if (await essentialCookies.isVisible()) await essentialCookies.click();
  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(
    page.getByText("Created Untitled Canvas", { exact: false }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "AI" }).click();
  await page.getByRole("button", { name: "Create a sketch" }).click();
  await page.getByRole("button", { name: "Send to AI" }).click();
  await expect(
    page.getByText("The AI provider is temporarily unavailable.", {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Create" }).click();
  const canvas = page.getByRole("application", {
    name: "Editable 64 by 64 pixel grid",
  });
  await canvas.focus();
  await canvas.press("Enter");
  await expect(
    page.getByText("64×64 · 1 color", { exact: false }),
  ).toBeVisible();
});

test("AI disables sending when the live catalog has no available free model", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the live model-availability fail-safe.",
  );
  await mockAiAccount(page, "ai-no-model-user", "deny", [
    UNAVAILABLE_AI_PRESET,
  ]);

  await page.goto("/studio");
  await page.getByRole("button", { name: "Start blank" }).click();
  await page.getByRole("tab", { name: "AI" }).click();

  await expect(
    page.getByText(
      "No free AI model is currently available. Manual Studio tools and all exports remain available.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Your AI request" })
    .fill("Draw a small island badge.");
  await expect(page.getByRole("button", { name: "Send to AI" })).toBeDisabled();
});

test("canceling an AI request restores the prompt and ignores a late reply", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers the shared abort and stale-response path.",
  );
  const userId = "ai-cancel-user";
  await page.addInitScript((id) => {
    localStorage.setItem(`ltg.ai.consent.v1.${id}`, "v2:deny");
  }, userId);
  await mockAiAccount(page, userId);

  let releaseProvider: (() => void) | null = null;
  await page.route("**/api/ai/chat", async (route) => {
    await new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    await route
      .fulfill({
        body: JSON.stringify({
          configured: true,
          reply: "This late reply must never enter history.",
        }),
        contentType: "application/json",
        status: 200,
      })
      .catch(() => undefined);
  });

  await page.goto("/studio");
  const essentialCookies = page.getByRole("button", {
    name: "Essential only",
  });
  if (await essentialCookies.isVisible()) await essentialCookies.click();
  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(
    page.getByText("Created Untitled Canvas", { exact: false }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "AI" }).click();
  const prompt = page.getByRole("textbox", { name: "Your AI request" });
  await prompt.fill("Make a small lighthouse badge");
  await page.getByRole("button", { name: "Send to AI" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (id) => localStorage.getItem(`ltg.ai.sessions.v1.${id}`) ?? "",
        userId,
      ),
    )
    .not.toContain("Make a small lighthouse badge");
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(
    page.getByText(
      "AI request canceled. Your prompt is ready to edit or send again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(prompt).toHaveValue("Make a small lighthouse badge");
  expect(releaseProvider).not.toBeNull();
  releaseProvider?.();
  await page.waitForTimeout(150);
  await expect(
    page.getByText("This late reply must never enter history.", {
      exact: true,
    }),
  ).toHaveCount(0);
});

test("AI consent is requested again when provider data policy changes", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop run covers versioned, policy-scoped AI consent.",
  );
  const userId = "ai-policy-user";
  await page.addInitScript((id) => {
    localStorage.setItem(`ltg.ai.consent.v1.${id}`, "v2:deny");
  }, userId);
  await mockAiAccount(page, userId, "allow");
  let chatRequests = 0;
  await page.route("**/api/ai/chat", (route) => {
    chatRequests += 1;
    return route.fulfill({
      body: JSON.stringify({ configured: true, reply: "Unexpected request" }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/studio");
  const essentialCookies = page.getByRole("button", {
    name: "Essential only",
  });
  if (await essentialCookies.isVisible()) await essentialCookies.click();
  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(
    page.getByText("Created Untitled Canvas", { exact: false }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "AI" }).click();
  await page
    .getByRole("textbox", { name: "Your AI request" })
    .fill("Suggest three cleaner colors");
  await page.getByRole("button", { name: "Send to AI" }).click();

  await expect(
    page.getByRole("alertdialog", { name: "AI processing consent" }),
  ).toBeVisible();
  await expect(
    page.getByText(/allows providers that may collect request data/i),
  ).toBeVisible();
  expect(chatRequests).toBe(0);
  await page.getByRole("button", { name: "Not now" }).click();
  expect(chatRequests).toBe(0);
});

test("AI history and consent stay isolated between signed-in users", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One desktop account switch covers browser-local AI data isolation.",
  );
  let currentUserId = "ai-account-a";
  await page.addInitScript(() => {
    localStorage.setItem("ltg.ai.consent.v1.ai-account-a", "v2:deny");
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      body: JSON.stringify({
        data: {
          session: { id: `${currentUserId}-session` },
          user: {
            avatarSeed: currentUserId,
            createdAt: Date.now(),
            displayName: currentUserId,
            id: currentUserId,
            role: "user",
            status: "active",
            termsAccepted: true,
            termsVersion: "2026-07-14",
            username: currentUserId,
          },
        },
        requestId: `${currentUserId}-request`,
      }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      body: JSON.stringify({ configured: true, dataCollection: "deny" }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/models", (route) =>
    route.fulfill({
      body: JSON.stringify({ presets: [] }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/ai/chat", (route) =>
    route.fulfill({
      body: JSON.stringify({
        configured: true,
        reply: "Private reply for account A",
      }),
      contentType: "application/json",
      status: 200,
    }),
  );

  await page.goto("/studio");
  const essentialCookies = page.getByRole("button", {
    name: "Essential only",
  });
  if (await essentialCookies.isVisible()) await essentialCookies.click();
  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(
    page.getByText("Created Untitled Canvas", { exact: false }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "AI" }).click();
  await page
    .getByPlaceholder(/Ask for a 32x32 horror icon/)
    .fill("Private prompt for account A");
  await page.getByRole("button", { name: "Send to AI" }).click();
  await expect(
    page.getByText("Private reply for account A", { exact: true }),
  ).toBeVisible();
  await page.waitForFunction(() =>
    localStorage
      .getItem("ltg.ai.sessions.v1.ai-account-a")
      ?.includes("Private prompt for account A"),
  );

  currentUserId = "ai-account-b";
  await page.reload();
  await expect(
    page.getByRole("application", {
      name: "Editable 64 by 64 pixel grid",
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "AI" }).click();
  await expect(page.getByText("Private prompt for account A")).toHaveCount(0);
  await expect(page.getByText("Private reply for account A")).toHaveCount(0);
  await page
    .getByPlaceholder(/Ask for a 32x32 horror icon/)
    .fill("Account B prompt");
  await page.getByRole("button", { name: "Send to AI" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "AI processing consent" }),
  ).toBeVisible();
});

test("Studio documents its exact local format and resource limits", async ({
  page,
}) => {
  await page.goto("/studio");

  const imageInput = page.locator("#ltg-image-input");
  await expect(imageInput).toHaveAttribute(
    "accept",
    "image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/x-ms-bmp,.png,.jpg,.jpeg,.gif,.webp,.avif,.bmp",
  );
  await expect(
    page.getByText(/PNG, JPG, GIF \(first frame\), WebP, AVIF, or BMP/),
  ).toBeVisible();
  await expect(
    page.getByText(/up to 15 MB, 8192px per side, and 40 megapixels/),
  ).toBeVisible();
  await expect(
    page.getByText(/SVG, HEIC, and TIFF are not supported/),
  ).toBeVisible();
});

test("Studio rejects unapproved and oversized image files before decoding", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One format-policy run is sufficient.",
  );
  await page.goto("/studio");
  const imageInput = page.locator("#ltg-image-input");

  await imageInput.setInputFiles({
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    mimeType: "image/svg+xml",
    name: "unsafe.svg",
  });
  await expect(page.getByRole("alert")).toContainText(
    "SVG, HEIC, and TIFF are not accepted",
  );

  await imageInput.setInputFiles({
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    mimeType: "image/svg+xml",
    name: "disguised.png",
  });
  await expect(page.getByRole("alert")).toContainText("Unsupported file");

  await imageInput.setInputFiles({
    buffer: Buffer.alloc(15 * 1024 * 1024 + 1),
    mimeType: "image/png",
    name: "too-large.png",
  });
  await expect(page.getByRole("alert")).toContainText(
    "larger than the 15 MB local limit",
  );
});

test("Studio JSON remains compatible with plain-text browser MIME reporting", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One JSON compatibility run is sufficient.",
  );
  await page.goto("/studio");
  const jsonInput = page.locator("#ltg-json-input");
  await expect(jsonInput).toBeAttached();
  await jsonInput.setInputFiles({
    buffer: SAMPLE_STUDIO_JSON,
    mimeType: "text/plain",
    name: "sample-grid-document.json",
  });

  await expect(
    page.getByText("Sample 4x4 Grid", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("invalid Studio JSON stays in Import instead of pretending to open a canvas", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One invalid-import state transition run covers the shared workflow.",
  );
  await page.goto("/studio");
  await page.locator("#ltg-json-input").setInputFiles({
    buffer: Buffer.from('{"version":1,"width":64,"cells":[]}'),
    mimeType: "application/json",
    name: "invalid-grid.json",
  });

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Import" })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.getByRole("tab", { name: "Create" })).toHaveAttribute(
    "data-state",
    "inactive",
  );
});

test("Studio checks decoded dimensions and still imports an allowed PNG", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One decoder-policy run is sufficient.",
  );
  await page.goto("/studio");
  await expect(page.locator("#ltg-image-input")).toBeAttached();

  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8_193;
    canvas.height = 1;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Could not create dimension fixture"));
      }, "image/png");
    });
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "too-wide.png", { type: "image/png" }));
    const input = document.querySelector<HTMLInputElement>("#ltg-image-input");
    if (!input) throw new Error("Image input not found");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: transfer.files,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByRole("alert")).toContainText(
    "Image dimensions must not exceed 8192×8192 pixels",
  );

  await page.reload();
  await expect(page.locator("#ltg-image-input")).toBeAttached();
  await page.evaluate(() => {
    const revoked: string[] = [];
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    Object.defineProperty(window, "__studioRevokedObjectUrls", {
      configurable: true,
      value: revoked,
    });
    URL.revokeObjectURL = (objectUrl: string) => {
      revoked.push(objectUrl);
      originalRevoke(objectUrl);
    };
  });
  await page.locator("#ltg-image-input").setInputFiles({
    buffer: TINY_PNG,
    mimeType: "image/png",
    name: "tiny.png",
  });
  await expect(page.getByText("Preview ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __studioRevokedObjectUrls: string[];
            }
          ).__studioRevokedObjectUrls.length,
      ),
    )
    .toBeGreaterThan(0);
});
