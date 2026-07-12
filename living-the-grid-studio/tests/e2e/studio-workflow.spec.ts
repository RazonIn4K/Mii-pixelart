import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lceV8QAAAABJRU5ErkJggg==",
  "base64",
);
const SAMPLE_STUDIO_JSON = readFileSync(
  new URL("../../fixtures/sample-grid-document.json", import.meta.url),
);

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
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
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
    page.getByRole("button", { name: "Pencil tool" }).first(),
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
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({
      body: JSON.stringify({ configured: true }),
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
    expect(route.request().postDataJSON().currentGridImage).toBeNull();
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
    name: "Essential cookies only",
  });
  if (await essentialCookies.isVisible()) await essentialCookies.click();
  await page.getByRole("button", { name: "Start blank" }).click();
  await expect(
    page.getByText("Created Untitled Canvas", { exact: false }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "AI" }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "Include current canvas for editing",
    }),
  ).not.toBeChecked();
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
  await expect(page.getByText("AI edit", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply once" }).click();

  await expect(page.getByText("8×8 · 1 colors", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByText("64×64 · 0 colors", { exact: true }),
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
