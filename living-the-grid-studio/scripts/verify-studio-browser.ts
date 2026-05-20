import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { OPENROUTER_MODEL_PRESETS } from "../shared/ai";

const STUDIO_URL = process.env.LTG_STUDIO_URL ?? "http://127.0.0.1:3000/studio";
const JPG_FIXTURE =
  process.env.LTG_SMOKE_JPG ?? path.join(homedir(), "Downloads", "epstein.jpg");
const AVIF_FIXTURE =
  process.env.LTG_SMOKE_AVIF ??
  path.join(homedir(), "Downloads", "epstein02.avif");
const CHARACTER_FIXTURE =
  process.env.LTG_SMOKE_CHARACTER ??
  path.join(homedir(), "Downloads", "freddy-fazbear.png");
const JPG_PROJECT_NAME = safeProjectName(
  path.basename(JPG_FIXTURE).replace(/\.[^.]+$/, ""),
);
const AVIF_FILENAME = path.basename(AVIF_FIXTURE);
const CHARACTER_FILENAME = path.basename(CHARACTER_FIXTURE);
const CHARACTER_PROJECT_NAME = safeProjectName(
  CHARACTER_FILENAME.replace(/\.[^.]+$/, ""),
);
const LTG_FIXTURE = new URL(
  "../fixtures/living-the-grid-real.json",
  import.meta.url,
);
const LTG_FIXTURE_PATH = fileURLToPath(LTG_FIXTURE);

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

interface CdpResponse {
  id?: number;
  method?: string;
  error?: { code: number; message: string };
  result?: Record<string, unknown>;
  exceptionDetails?: Record<string, unknown>;
}

interface ChromePage {
  type: string;
  webSocketDebuggerUrl?: string;
}

interface DownloadEntry {
  type: "anchor-click" | "blob" | "blob-text";
  download?: string;
  href?: string;
  mime?: string;
  size?: number;
  text?: string;
}

type RgbTuple = [number, number, number];

interface PresetSmokeCase {
  expectedDimensions: string;
  expectedMaxColors: number;
  fileName: string;
  filePath: string;
  presetLabel: string;
  projectName: string;
  verifyExport?: boolean;
}

const chromePath = findChrome();
if (!chromePath) {
  throw new Error(
    "Could not find Chrome. Set CHROME_PATH to run the Studio browser smoke test.",
  );
}

for (const fixture of [JPG_FIXTURE, AVIF_FIXTURE, CHARACTER_FIXTURE]) {
  if (!existsSync(fixture)) {
    throw new Error(`Missing smoke-test image fixture: ${fixture}`);
  }
}

assert.equal(
  existsSync(LTG_FIXTURE_PATH),
  true,
  "real LTG JSON fixture should exist",
);

const chromeUserDataDir = mkdtempSync(
  path.join(tmpdir(), "ltg-studio-chrome-"),
);
const generatedFixtureDir = path.join(chromeUserDataDir, "fixtures");
const MASCOT_FIXTURE = path.join(generatedFixtureDir, "smoke-mascot.bmp");
const SPRITE_FIXTURE = path.join(generatedFixtureDir, "smoke-sprite.bmp");
const EMBLEM_FIXTURE = path.join(generatedFixtureDir, "smoke-emblem.bmp");
const ICON_FIXTURE = path.join(generatedFixtureDir, "smoke-icon.bmp");
const chromePort = 9400 + Math.floor(Math.random() * 1000);
let chromeProcess: ChildProcessWithoutNullStreams | null = null;
let cdp: CdpClient | null = null;
let navigationCount = 0;

async function main(): Promise<void> {
  try {
    ensureGeneratedSmokeFixtures();
    await assertStudioReachable();
    chromeProcess = spawnChrome(chromePath, chromeUserDataDir, chromePort);
    cdp = await CdpClient.connect(chromePort);

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("DOM.enable");
    await navigateStudio(cdp);

    const presetLabels = await cdp.evaluate<string[]>(
      "[...document.querySelectorAll('button')].map((button) => button.textContent.trim())",
    );
    for (const label of [
      "Create",
      "Mii Mask",
      "Character 64",
      "Face 96",
      "Character 128",
      "Sprite 32",
      "Logo 64",
      "Sticker 64",
      "Icon 16",
      "Full 64",
      "Pixel 256",
      "Photo",
      "Pixel / Logo",
      "AI",
    ]) {
      assert.ok(
        presetLabels.includes(label),
        `preset should be visible: ${label}`,
      );
    }

    await installErrorCapture(cdp);
    await verifyCreationTools(cdp);
    await navigateStudio(cdp);
    await installErrorCapture(cdp);
    await verifyAiPanel(cdp);
    await navigateStudio(cdp);
    await installErrorCapture(cdp);
    await verifyPresetImport(cdp, {
      expectedDimensions: "64×64",
      expectedMaxColors: 22,
      fileName: CHARACTER_FILENAME,
      filePath: CHARACTER_FIXTURE,
      presetLabel: "Character 64",
      projectName: CHARACTER_PROJECT_NAME,
      verifyExport: true,
    });
    await navigateStudio(cdp);
    await installErrorCapture(cdp);
    await verifyPresetImport(cdp, {
      expectedDimensions: "128×128",
      expectedMaxColors: 36,
      fileName: CHARACTER_FILENAME,
      filePath: CHARACTER_FIXTURE,
      presetLabel: "Character 128",
      projectName: CHARACTER_PROJECT_NAME,
    });
    await navigateStudio(cdp);
    await installErrorCapture(cdp);
    await verifyPresetImport(cdp, {
      expectedDimensions: "256×256",
      expectedMaxColors: 84,
      fileName: CHARACTER_FILENAME,
      filePath: CHARACTER_FIXTURE,
      presetLabel: "Pixel 256",
      projectName: CHARACTER_PROJECT_NAME,
    });
    await navigateStudio(cdp);
    await installErrorCapture(cdp);
    await verifyPresetImport(cdp, {
      expectedDimensions: "32×32",
      expectedMaxColors: 16,
      fileName: CHARACTER_FILENAME,
      filePath: CHARACTER_FIXTURE,
      presetLabel: "Sprite 32",
      projectName: CHARACTER_PROJECT_NAME,
    });
    await navigateStudio(cdp);
    await installErrorCapture(cdp);
    await verifyPresetImport(cdp, {
      expectedDimensions: "64×64",
      expectedMaxColors: 22,
      fileName: "smoke-mascot.bmp",
      filePath: MASCOT_FIXTURE,
      presetLabel: "Character 64",
      projectName: "smoke-mascot",
    });
    await navigateStudio(cdp);
    await installErrorCapture(cdp);
    await verifyPresetImport(cdp, {
      expectedDimensions: "32×32",
      expectedMaxColors: 16,
      fileName: "smoke-sprite.bmp",
      filePath: SPRITE_FIXTURE,
      presetLabel: "Sprite 32",
      projectName: "smoke-sprite",
    });
    await navigateStudio(cdp);
    await installErrorCapture(cdp);
    await verifyPresetImport(cdp, {
      expectedDimensions: "64×64",
      expectedMaxColors: 12,
      fileName: "smoke-emblem.bmp",
      filePath: EMBLEM_FIXTURE,
      presetLabel: "Logo 64",
      projectName: "smoke-emblem",
    });
    await navigateStudio(cdp);
    await installErrorCapture(cdp);
    await verifyPresetImport(cdp, {
      expectedDimensions: "64×64",
      expectedMaxColors: 18,
      fileName: "smoke-mascot.bmp",
      filePath: MASCOT_FIXTURE,
      presetLabel: "Sticker 64",
      projectName: "smoke-mascot",
    });
    await navigateStudio(cdp);
    await installErrorCapture(cdp);
    await verifyPresetImport(cdp, {
      expectedDimensions: "16×16",
      expectedMaxColors: 8,
      fileName: "smoke-icon.bmp",
      filePath: ICON_FIXTURE,
      presetLabel: "Icon 16",
      projectName: "smoke-icon",
    });
    await installErrorCapture(cdp);

    await uploadFile(cdp, "#ltg-image-input", JPG_FIXTURE);
    await waitFor(() =>
      cdp!.evaluate<boolean>(
        "document.body.innerText.includes('Preview ready') && document.body.innerText.includes('Commit Preview')",
      ),
    );
    await waitFor(() =>
      cdp!.evaluate<boolean>(
        `[...document.querySelectorAll('button')]
          .some((button) => button.textContent.trim().includes('Commit Preview') && !button.disabled)`,
      ),
    );

    await clickByText(cdp, "Commit Preview", "js");
    await waitFor(() =>
      cdp!.evaluate<boolean>(
        "!document.body.innerText.includes('Preview mode')",
      ),
    );

    await installDownloadCapture(cdp);
    await clickByText(cdp, "Export", "mouse");
    await waitFor(() =>
      cdp!.evaluate<boolean>(
        "document.body.innerText.includes('Export JSON') && document.body.innerText.includes('Export Reference Pack')",
      ),
    );

    for (const label of [
      "Export JSON",
      "Export Guide",
      "Export Clean Image",
      "Export Reference Pack",
    ]) {
      await clickByText(cdp, label, "js");
      await delay(250);
    }

    await waitFor(() =>
      cdp!.evaluate<boolean>(
        "window.__ltgDownloads.filter((entry) => entry.type === 'blob-text').length >= 1 && window.__ltgDownloads.some((entry) => entry.download && entry.download.endsWith('-reference-pack.zip'))",
      ),
    );

    const downloads = await cdp.evaluate<DownloadEntry[]>(
      "window.__ltgDownloads",
    );
    const filenames = downloads
      .filter((entry) => entry.download)
      .map((entry) => entry.download as string);
    const jsonEntry = downloads.find(
      (entry) =>
        entry.type === "blob-text" && entry.mime === "application/json",
    );
    const zipEntry = downloads.find(
      (entry) => entry.type === "blob" && (entry.size ?? 0) > 10_000,
    );

    assert.ok(
      filenames.some((name) => name.endsWith(".json")),
      "JSON export should trigger a .json download",
    );
    assert.ok(
      filenames.includes(`${JPG_PROJECT_NAME}-guide-labeled.png`),
      "labeled PNG export should use the guide filename",
    );
    assert.ok(
      filenames.includes(`${JPG_PROJECT_NAME}-clean.png`),
      "clean PNG export should use the clean filename",
    );
    assert.ok(
      filenames.includes(`${JPG_PROJECT_NAME}-reference-pack.zip`),
      "reference pack should trigger a .zip download",
    );
    assert.ok(
      jsonEntry?.text?.includes('"width"'),
      "exported JSON should include width",
    );
    assert.ok(
      jsonEntry?.text?.includes('"height"'),
      "exported JSON should include height",
    );
    assert.ok(zipEntry, "reference pack ZIP blob should be generated");

    // Reset the page before testing more imports; the download capture intentionally
    // stubs URL.createObjectURL, which image decoding also depends on.
    await navigateStudio(cdp);
    await installErrorCapture(cdp);

    await uploadFile(cdp, "#ltg-image-input", AVIF_FIXTURE);
    await waitFor(() =>
      cdp!.evaluate<boolean>(
        `document.body.innerText.includes(${JSON.stringify(
          AVIF_FILENAME,
        )}) && document.body.innerText.includes('Preview ready')`,
      ),
    );

    await uploadFile(cdp, "#ltg-json-input", LTG_FIXTURE_PATH);
    await waitFor(() =>
      cdp!.evaluate<boolean>("document.body.innerText.includes('64×64')"),
    );
    const jsonImportText = await cdp.evaluate<string>(
      "document.body.innerText",
    );
    assert.ok(
      jsonImportText.includes("has no exact game swatch") ||
        jsonImportText.includes("Delta E"),
      "real LTG JSON import should surface mapping warnings",
    );

    const unsupportedFixture = path.join(tmpdir(), "ltg-unsupported.txt");
    writeFileSync(unsupportedFixture, "not importable");
    await uploadFile(cdp, "#ltg-image-input", unsupportedFixture);
    await waitFor(() =>
      cdp!.evaluate<boolean>(
        "document.body.innerText.includes('Unsupported file')",
      ),
    );

    const browserErrors = await cdp.evaluate<string[]>("window.__ltgErrors");
    assert.deepEqual(
      browserErrors,
      [],
      "browser should not report runtime errors",
    );

    console.log("Studio browser smoke verification passed.");
  } finally {
    try {
      cdp?.close();
    } catch {
      // Ignore cleanup failures.
    }
    try {
      chromeProcess?.kill();
    } catch {
      // Ignore cleanup failures.
    }
    await delay(250);
    try {
      rmSync(chromeUserDataDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    } catch {
      // Chrome can briefly keep profile files open after process shutdown.
    }
  }
}

function findChrome(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function safeProjectName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function ensureGeneratedSmokeFixtures(): void {
  mkdirSync(generatedFixtureDir, { recursive: true });

  writeBmpFixture(MASCOT_FIXTURE, 128, 128, (x, y) => {
    if (insideCircle(x, y, 36, 31, 20) || insideCircle(x, y, 92, 31, 20)) {
      return [118, 70, 41];
    }
    if (insideCircle(x, y, 64, 70, 42)) return [178, 102, 54];
    if (insideEllipse(x, y, 64, 80, 25, 18)) return [225, 170, 112];
    if (insideCircle(x, y, 50, 62, 6) || insideCircle(x, y, 78, 62, 6)) {
      return [28, 27, 24];
    }
    if (insideEllipse(x, y, 64, 75, 7, 6)) return [83, 42, 29];
    if (y > 93 && y < 99 && x > 48 && x < 80) return [98, 37, 39];
    if (insideCircle(x, y, 64, 102, 11)) return [202, 48, 50];
    return [242, 238, 229];
  });

  writeBmpFixture(SPRITE_FIXTURE, 96, 96, (x, y) => {
    if (x < 18 || x > 77 || y < 10 || y > 88) return [246, 246, 238];
    if (x >= 38 && x <= 58 && y >= 12 && y <= 30) return [225, 171, 119];
    if (x >= 32 && x <= 64 && y >= 32 && y <= 58) return [42, 83, 164];
    if (x >= 25 && x <= 38 && y >= 37 && y <= 65) return [224, 70, 60];
    if (x >= 58 && x <= 71 && y >= 37 && y <= 65) return [224, 70, 60];
    if (x >= 35 && x <= 46 && y >= 58 && y <= 84) return [43, 45, 56];
    if (x >= 50 && x <= 61 && y >= 58 && y <= 84) return [43, 45, 56];
    if (insideCircle(x, y, 43, 20, 3) || insideCircle(x, y, 53, 20, 3)) {
      return [22, 22, 22];
    }
    return [246, 246, 238];
  });

  writeBmpFixture(EMBLEM_FIXTURE, 128, 128, (x, y) => {
    if (insideDiamond(x, y, 64, 64, 52)) return [229, 41, 51];
    if (insideDiamond(x, y, 64, 64, 38)) return [248, 202, 64];
    if (insideDiamond(x, y, 64, 64, 26)) return [39, 69, 143];
    if (
      (x >= 56 && x <= 72 && y >= 35 && y <= 93) ||
      (y >= 56 && y <= 72 && x >= 35 && x <= 93)
    ) {
      return [248, 248, 241];
    }
    return [247, 247, 241];
  });

  writeBmpFixture(ICON_FIXTURE, 64, 64, (x, y) => {
    if (insideCircle(x, y, 32, 32, 29)) return [34, 142, 102];
    if (insideCircle(x, y, 32, 32, 22)) return [247, 222, 68];
    if (insideCircle(x, y, 24, 28, 5) || insideCircle(x, y, 40, 28, 5)) {
      return [29, 31, 33];
    }
    if (y >= 40 && y <= 44 && x >= 22 && x <= 42) return [196, 54, 72];
    return [246, 246, 239];
  });
}

function writeBmpFixture(
  filePath: string,
  width: number,
  height: number,
  pixelAt: (x: number, y: number) => RgbTuple,
): void {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowStride * height;
  const fileSize = 54 + pixelDataSize;
  const buffer = Buffer.alloc(fileSize);

  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(pixelDataSize, 34);

  for (let y = 0; y < height; y += 1) {
    const destY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixelAt(x, y);
      const offset = 54 + destY * rowStride + x * 3;
      buffer[offset] = b;
      buffer[offset + 1] = g;
      buffer[offset + 2] = r;
    }
  }

  writeFileSync(filePath, buffer);
}

function insideCircle(
  x: number,
  y: number,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function insideEllipse(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): boolean {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

function insideDiamond(
  x: number,
  y: number,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  return Math.abs(x - cx) + Math.abs(y - cy) <= radius;
}

async function navigateStudio(cdpClient: CdpClient): Promise<void> {
  await cdpClient.send("Page.navigate", { url: makeStudioNavigationUrl() });
  try {
    await waitFor(
      () =>
        cdpClient.evaluate<boolean>(
          "document.readyState === 'complete' && Boolean(document.querySelector('#ltg-image-input') && document.querySelector('#ltg-json-input'))",
        ),
      30_000,
    );
  } catch (error) {
    const pageState = await cdpClient
      .evaluate<{ href: string; text: string }>(
        `({
          href: location.href,
          text: document.body?.innerText?.slice(0, 600) ?? ''
        })`,
      )
      .catch(() => "");
    throw new Error(
      `Studio did not become ready after navigation. ${JSON.stringify(pageState)}`,
      { cause: error },
    );
  }
}

function makeStudioNavigationUrl(): string {
  navigationCount += 1;
  const url = new URL(STUDIO_URL);
  url.searchParams.set("smoke", String(navigationCount));
  return url.toString();
}

async function verifyPresetImport(
  cdpClient: CdpClient,
  smokeCase: PresetSmokeCase,
): Promise<void> {
  const {
    expectedDimensions,
    expectedMaxColors,
    fileName,
    filePath,
    presetLabel,
    projectName,
    verifyExport = false,
  } = smokeCase;

  await clickByText(cdpClient, presetLabel, "js");
  await uploadFile(cdpClient, "#ltg-image-input", filePath);
  await waitFor(() =>
    cdpClient.evaluate<boolean>(
      `document.body.innerText.includes(${JSON.stringify(
        fileName,
      )}) && document.body.innerText.includes('Preview ready') && document.body.innerText.includes(${JSON.stringify(
        expectedDimensions,
      )})`,
    ),
  );
  const colorCount = await cdpClient.evaluate<number | null>(`(() => {
    const match = document.body.innerText.match(${JSON.stringify(
      `${expectedDimensions} · `,
    )} + '(\\\\d+) colors');
    return match ? Number(match[1]) : null;
  })()`);
  assert.ok(colorCount, `${presetLabel} should show a color count`);
  assert.ok(
    colorCount <= expectedMaxColors,
    `${presetLabel} should cap colors at ${expectedMaxColors}; got ${colorCount}`,
  );

  if (!verifyExport) return;

  await clickByText(cdpClient, "Commit Preview", "js");
  await waitFor(() =>
    cdpClient.evaluate<boolean>(
      "!document.body.innerText.includes('Preview mode')",
    ),
  );
  await installDownloadCapture(cdpClient);
  await clickByText(cdpClient, "Export", "mouse");
  await waitFor(() =>
    cdpClient.evaluate<boolean>(
      "document.body.innerText.includes('Export Clean Image')",
    ),
  );
  await clickByText(cdpClient, "Export Clean Image", "js");
  await waitFor(() =>
    cdpClient.evaluate<boolean>(
      `window.__ltgDownloads.some((entry) => entry.download === ${JSON.stringify(
        `${projectName}-clean.png`,
      )})`,
    ),
  );
  const downloads = await cdpClient.evaluate<DownloadEntry[]>(
    "window.__ltgDownloads",
  );
  assert.ok(
    downloads.some(
      (entry) =>
        entry.download === `${projectName}-clean.png` &&
        entry.href?.startsWith("data:image/png"),
    ),
    `${presetLabel} clean export should create a PNG download`,
  );
}

async function verifyCreationTools(cdpClient: CdpClient): Promise<void> {
  await clickByText(cdpClient, "Create", "mouse");
  for (const label of [
    "People & Masks",
    "Characters",
    "Horror & Spooky",
    "Marks & Objects",
    "Face Guide",
    "Mascot Head",
    "Space Crew",
    "Tiny Dino",
    "Cute Monster",
    "Haunted Mascot",
    "Bald Teacher",
    "Masked Slasher",
    "Pumpkin Ghoul",
    "Ghost Sheet",
    "Vampire Count",
    "Zombie Buddy",
    "Creepy Clown",
    "Red Cap Hero",
    "Green Adventurer",
    "Blue Speed Mascot",
    "Portrait Bust",
    "Space Helmet",
    "Robot Face",
    "Letter Mark",
    "Controller Icon",
    "Racing Kart",
    "Pizza Slice",
    "Sword Badge",
  ]) {
    await waitFor(() =>
      cdpClient.evaluate<boolean>(
        `document.body.innerText.toLowerCase().includes(${JSON.stringify(
          label.toLowerCase(),
        )})`,
      ),
    );
  }

  await clickByText(cdpClient, "Red Cap Hero", "js");
  await waitFor(() =>
    cdpClient.evaluate<boolean>(
      "document.body.innerText.includes('Red Cap Hero Template') && document.body.innerText.includes('64×64')",
    ),
  );

  await clickByText(cdpClient, "Icon 16", "js");
  await waitFor(() =>
    cdpClient.evaluate<boolean>(
      "document.body.innerText.includes('Icon Canvas') && document.body.innerText.includes('16×16 · 1 colors')",
    ),
  );

  await clickByText(cdpClient, "Upscale 2x", "js");
  await waitFor(() =>
    cdpClient.evaluate<boolean>(
      "document.body.innerText.includes('32×32 · 1 colors')",
    ),
  );

  await clickCanvasCell(cdpClient, 2, 2);
  await waitFor(() =>
    cdpClient.evaluate<boolean>(
      "document.body.innerText.includes('32×32 · 2 colors')",
    ),
  );

  await clickByLabel(cdpClient, "Eraser tool");
  await clickCanvasCell(cdpClient, 2, 2);
  await waitFor(() =>
    cdpClient.evaluate<boolean>(
      "document.body.innerText.includes('32×32 · 1 colors')",
    ),
  );

  await clickByText(cdpClient, "256 Detail", "js");
  await waitFor(() =>
    cdpClient.evaluate<boolean>(
      "document.body.innerText.includes('256×256 · 1 colors')",
    ),
  );
  await assertCanvasFitsViewport(cdpClient);
}

async function verifyAiPanel(cdpClient: CdpClient): Promise<void> {
  const hasAiTab = await cdpClient.evaluate<boolean>(
    `[...document.querySelectorAll('[role="tab"]')]
      .some((candidate) => candidate.textContent.trim() === 'AI')`,
  );
  assert.equal(hasAiTab, true, "AI tab should be present");

  const status = await cdpClient.evaluate<{
    configured?: boolean;
    envVar?: string;
  }>(
    `fetch('/api/ai/status')
      .then((response) => response.json())
      .catch(() => ({}))`,
  );
  assert.equal(
    typeof status.configured,
    "boolean",
    "AI status should report whether OpenRouter is configured",
  );
  assert.equal(status.envVar, "OPENROUTER_API_KEY");

  const models = await cdpClient.evaluate<{
    presets?: { available?: boolean; id?: string }[];
  }>(
    `fetch('/api/ai/models')
      .then((response) => response.json())
      .catch(() => ({}))`,
  );
  const expectedModelIds = new Set(
    OPENROUTER_MODEL_PRESETS.map((preset) => preset.id),
  );
  assert.equal(
    models.presets?.length,
    OPENROUTER_MODEL_PRESETS.length,
    "AI model preset count",
  );
  assert.ok(
    models.presets?.every(
      (preset) => preset.id && expectedModelIds.has(preset.id),
    ),
    "AI model presets should match the curated shared preset list",
  );
}

function spawnChrome(
  executablePath: string,
  userDataDir: string,
  remoteDebuggingPort: number,
): ChildProcessWithoutNullStreams {
  return spawn(
    executablePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1280,1200",
      `--remote-debugging-port=${remoteDebuggingPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
}

async function assertStudioReachable(): Promise<void> {
  try {
    await fetchText(STUDIO_URL);
  } catch (error) {
    throw new Error(
      `Studio is not reachable at ${STUDIO_URL}. Start it with pnpm dev before running verify:studio. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let data = "";
        response.on("data", (chunk: Buffer) => {
          data += chunk.toString("utf8");
        });
        response.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function fetchJson<T>(url: string): Promise<T> {
  return fetchText(url).then((text) => JSON.parse(text) as T);
}

async function waitFor<T>(
  callback: () => Promise<T> | T,
  timeoutMs = 15_000,
  intervalMs = 100,
): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await callback();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }

  throw lastError instanceof Error ? lastError : new Error("Timed out");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadFile(
  cdpClient: CdpClient,
  selector: string,
  filePath: string,
): Promise<void> {
  const documentResult = await cdpClient.send("DOM.getDocument", {
    depth: -1,
    pierce: true,
  });
  const root = documentResult.root as { nodeId: number };
  const input = await cdpClient.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector,
  });
  const nodeId = input.nodeId as number | undefined;
  assert.ok(nodeId, `Expected file input ${selector} to exist`);
  await cdpClient.send("DOM.setFileInputFiles", {
    nodeId,
    files: [filePath],
  });
}

async function clickByText(
  cdpClient: CdpClient,
  text: string,
  mode: "js" | "mouse",
): Promise<void> {
  const details = await cdpClient.evaluate<{
    disabled: boolean;
    height: number;
    text: string;
    width: number;
    x: number;
    y: number;
  } | null>(`(() => {
    const candidates = [...document.querySelectorAll('button,[role="tab"],label')];
    const element = candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 &&
        rect.height > 0 &&
        candidate.textContent.trim().includes(${JSON.stringify(text)});
    });
    if (!element) return null;
    element.scrollIntoView({ block: 'center' });
    const rect = element.getBoundingClientRect();
    return {
      disabled: Boolean(element.disabled),
      height: rect.height,
      text: element.textContent.trim(),
      width: rect.width,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()`);

  assert.ok(details, `Expected clickable control containing text: ${text}`);
  assert.equal(details.disabled, false, `Control should be enabled: ${text}`);

  if (mode === "js") {
    await cdpClient.evaluate(
      `(() => {
        const candidates = [...document.querySelectorAll('button,[role="tab"],label')];
        const element = candidates.find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.width > 0 &&
            rect.height > 0 &&
            candidate.textContent.trim().includes(${JSON.stringify(text)});
        });
        element.click();
      })()`,
    );
    return;
  }

  await cdpClient.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: details.x,
    y: details.y,
  });
  await cdpClient.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: details.x,
    y: details.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await cdpClient.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: details.x,
    y: details.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
}

async function clickByLabel(
  cdpClient: CdpClient,
  ariaLabel: string,
): Promise<void> {
  const details = await cdpClient.evaluate<{
    disabled: boolean;
    height: number;
    width: number;
    x: number;
    y: number;
  } | null>(`(() => {
    const candidates = [...document.querySelectorAll('[aria-label]')];
    const element = candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 &&
        rect.height > 0 &&
        candidate.getAttribute('aria-label') === ${JSON.stringify(ariaLabel)};
    });
    if (!element) return null;
    element.scrollIntoView({ block: 'center' });
    const rect = element.getBoundingClientRect();
    return {
      disabled: Boolean(element.disabled),
      height: rect.height,
      width: rect.width,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()`);

  assert.ok(details, `Expected visible control with label: ${ariaLabel}`);
  assert.equal(
    details.disabled,
    false,
    `Control should be enabled: ${ariaLabel}`,
  );
  await dispatchMouseClick(cdpClient, details.x, details.y);
}

async function clickCanvasCell(
  cdpClient: CdpClient,
  cellX: number,
  cellY: number,
): Promise<void> {
  const details = await cdpClient.evaluate<{
    x: number;
    y: number;
  } | null>(`(() => {
    const canvas = document.querySelector('canvas');
    const text = document.body.innerText;
    const match = text.match(/(\\d+)×(\\d+) · \\d+ colors/);
    if (!canvas || !match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    const rect = canvas.getBoundingClientRect();
    const cellSize = Math.max(
      1,
      Math.floor(
        Math.min((rect.width - 40) / width, (rect.height - 40) / height, 32)
      )
    );
    const gridWidth = width * cellSize;
    const gridHeight = height * cellSize;
    const originX = rect.left + Math.round((rect.width - gridWidth) / 2);
    const originY = rect.top + Math.round((rect.height - gridHeight) / 2);
    return {
      x: originX + cellSize * (${cellX} + 0.5),
      y: originY + cellSize * (${cellY} + 0.5),
    };
  })()`);

  assert.ok(details, "Expected a visible canvas with grid dimensions");
  await dispatchMouseClick(cdpClient, details.x, details.y);
}

async function assertCanvasFitsViewport(cdpClient: CdpClient): Promise<void> {
  const metrics = await cdpClient.evaluate<{
    canvasHeight: number;
    canvasWidth: number;
    parentHeight: number;
    parentWidth: number;
  } | null>(`(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas?.parentElement) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const parentRect = canvas.parentElement.getBoundingClientRect();
    return {
      canvasHeight: canvasRect.height,
      canvasWidth: canvasRect.width,
      parentHeight: parentRect.height,
      parentWidth: parentRect.width,
    };
  })()`);

  assert.ok(metrics, "Expected canvas metrics");
  assert.ok(
    metrics.canvasWidth <= metrics.parentWidth + 1,
    `canvas should fit the viewport width; got canvas ${metrics.canvasWidth}, parent ${metrics.parentWidth}`,
  );
  assert.ok(
    metrics.canvasHeight <= metrics.parentHeight + 1,
    `canvas should fit the viewport height; got canvas ${metrics.canvasHeight}, parent ${metrics.parentHeight}`,
  );
}

async function dispatchMouseClick(
  cdpClient: CdpClient,
  x: number,
  y: number,
): Promise<void> {
  await cdpClient.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
  });
  await cdpClient.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await cdpClient.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
}

async function installErrorCapture(cdpClient: CdpClient): Promise<void> {
  await cdpClient.evaluate(`(() => {
    window.__ltgErrors = [];
    window.addEventListener('error', (event) => window.__ltgErrors.push(event.message));
    window.addEventListener('unhandledrejection', (event) =>
      window.__ltgErrors.push(String(event.reason))
    );
  })()`);
}

async function installDownloadCapture(cdpClient: CdpClient): Promise<void> {
  await cdpClient.evaluate(`(() => {
    window.__ltgDownloads = [];
    HTMLAnchorElement.prototype.click = function patchedClick() {
      window.__ltgDownloads.push({
        download: this.download,
        href: this.href,
        type: 'anchor-click',
      });
    };
    URL.createObjectURL = function patchedCreateObjectURL(blob) {
      const id = 'blob:ltg-test-' + window.__ltgDownloads.length;
      window.__ltgDownloads.push({
        id,
        mime: blob.type,
        size: blob.size,
        type: 'blob',
      });
      if (blob.type === 'text/html' || blob.type === 'application/json') {
        blob.text().then((text) =>
          window.__ltgDownloads.push({
            mime: blob.type,
            text,
            type: 'blob-text',
          })
        );
      }
      return id;
    };
    URL.revokeObjectURL = function patchedRevokeObjectURL() {};
  })()`);
}

class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      reject: (error: Error) => void;
      resolve: (value: Record<string, unknown>) => void;
    }
  >();

  private constructor(private readonly socket: WebSocket) {
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data.toString()) as CdpResponse;
      if (!message.id) return;

      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result ?? {});
      }
    });
  }

  static async connect(port: number): Promise<CdpClient> {
    const page = await waitFor(async () => {
      const pages = await fetchJson<ChromePage[]>(
        `http://127.0.0.1:${port}/json/list`,
      );
      return pages.find((candidate) => candidate.type === "page");
    });

    assert.ok(
      page.webSocketDebuggerUrl,
      "Chrome page should expose a CDP websocket",
    );
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("CDP connection failed")),
        {
          once: true,
        },
      );
    });
    return new CdpClient(socket);
  }

  send(
    method: string,
    params: Record<string, JsonValue> = {},
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
      userGesture: true,
    });

    const exception = response.exceptionDetails as
      | { exception?: { description?: string }; text?: string }
      | undefined;
    if (exception) {
      throw new Error(
        exception.exception?.description ??
          exception.text ??
          "Evaluation failed",
      );
    }

    const result = response.result as { value: T };
    return result.value;
  }

  close(): void {
    this.socket.close();
  }
}

await main();
