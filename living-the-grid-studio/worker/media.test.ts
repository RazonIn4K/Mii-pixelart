import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalizeGridDocument,
  type CanonicalGridDocument,
} from "../shared/community";
import { renderGridPng, storeRevisionObjects } from "./media";

const TEST_PREFIXES: string[] = [];

describe("deterministic revision preview PNG", () => {
  afterEach(async () => {
    await Promise.all(TEST_PREFIXES.splice(0).map(clearPrefix));
  });

  // This determinism proof synchronously renders and compresses the same
  // 640px RGBA image three times. It completes within the global 15s timeout
  // alone, but can take about 20s while the Workers pool runs CPU-heavy files
  // in parallel. Keep the extra headroom local so other tests still catch
  // stalls against the stricter suite-wide timeout.
  it("emits a deterministic 640px RGBA PNG with no user metadata chunks", () => {
    const cells = ["R1C1", "R10C7", ...Array.from({ length: 62 }, () => null)];
    const project = gridProject("<script>alert(1)</script>", cells);
    const sameGrid = gridProject("A completely different project name", cells);

    const png = renderGridPng(project);
    expect(Array.from(png.subarray(0, 8))).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(640);
    expect(view.getUint32(20)).toBe(640);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(6);
    expect(pngChunkTypes(png)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(renderGridPng(project)).toEqual(png);
    expect(renderGridPng(sameGrid)).toEqual(png);
    expect(new TextDecoder().decode(png)).not.toContain("script");
  }, 30_000);

  it("renders only canonical palette colors into the raster", async () => {
    const project = gridProject("Palette proof", [
      "R1C1",
      "R10C7",
      ...Array.from({ length: 62 }, () => null),
    ]);
    const decoded = await decodeRgbaPng(renderGridPng(project));

    expect(hasPixel(decoded, [139, 0, 0, 255])).toBe(true);
    expect(hasPixel(decoded, [255, 255, 255, 255])).toBe(true);
    expect(hasPixel(decoded, [220, 233, 223, 255])).toBe(true);
  });

  it("stores WebP/JPEG derivatives with valid signatures", async () => {
    const project = gridProject("Transform proof", [
      "R6C3",
      ...Array.from({ length: 63 }, () => null),
    ]);
    const creationId = `media-test-${crypto.randomUUID()}`;
    const revisionId = crypto.randomUUID();
    const prefix = `private/creations/${creationId}/${revisionId}`;
    TEST_PREFIXES.push(prefix);

    const objects = await storeRevisionObjects(
      env,
      creationId,
      revisionId,
      project,
      JSON.stringify(project),
    );
    expect(objects.map((object) => object.kind).sort()).toEqual([
      "preview",
      "project_json",
      "social",
      "thumb",
    ]);

    for (const object of objects.filter(
      (candidate) => candidate.kind !== "project_json",
    )) {
      const stored = await env.PROJECTS.get(object.key);
      expect(stored).not.toBeNull();
      const bytes = new Uint8Array(await stored!.arrayBuffer());
      if (object.contentType === "image/jpeg") {
        expect(Array.from(bytes.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
      } else {
        expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("RIFF");
        expect(new TextDecoder().decode(bytes.subarray(8, 12))).toBe("WEBP");
      }
    }
  });

  it("removes partial R2 writes when Images returns an error", async () => {
    const project = gridProject("Failure cleanup", [
      "R4C3",
      ...Array.from({ length: 63 }, () => null),
    ]);
    const creationId = `media-test-${crypto.randomUUID()}`;
    const revisionId = crypto.randomUUID();
    const prefix = `private/creations/${creationId}/${revisionId}`;
    TEST_PREFIXES.push(prefix);
    const failedResponse = new Response("transform failed", { status: 502 });
    const transformer: ImageTransformer = {
      draw() {
        return transformer;
      },
      output: () =>
        Promise.resolve({
          contentType: () => "text/plain",
          image: () => failedResponse.clone().body!,
          response: () => failedResponse.clone(),
        }),
      transform() {
        return transformer;
      },
    };
    const images: ImagesBinding = {
      hosted: env.IMAGES.hosted,
      info: env.IMAGES.info.bind(env.IMAGES),
      input: () => transformer,
    };

    await expect(
      storeRevisionObjects(
        {
          ENVIRONMENT: "staging",
          IMAGES: images,
          PROJECTS: env.PROJECTS,
        },
        creationId,
        revisionId,
        project,
        JSON.stringify(project),
      ),
    ).rejects.toThrow("revision_image_transform_failed");
    expect((await env.PROJECTS.list({ prefix })).objects).toHaveLength(0);
  });
});

function gridProject(
  name: string,
  cells: Array<string | null>,
): CanonicalGridDocument {
  const timestamp = "2026-07-13T12:00:00.000Z";
  return canonicalizeGridDocument({
    version: 1,
    meta: { name, createdAt: timestamp, modifiedAt: timestamp },
    width: 8,
    height: 8,
    cells,
    usedColors: Array.from(
      new Set(cells.filter((cell): cell is string => cell !== null)),
    ),
    lockedColors: [],
  });
}

async function clearPrefix(prefix: string): Promise<void> {
  const objects = await env.PROJECTS.list({ prefix });
  if (objects.objects.length) {
    await env.PROJECTS.delete(objects.objects.map((object) => object.key));
  }
}

function pngChunkTypes(png: Uint8Array): string[] {
  const types: string[] = [];
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  for (let offset = 8; offset < png.byteLength;) {
    const length = view.getUint32(offset);
    types.push(new TextDecoder().decode(png.subarray(offset + 4, offset + 8)));
    offset += 12 + length;
  }
  return types;
}

async function decodeRgbaPng(png: Uint8Array): Promise<{
  height: number;
  raw: Uint8Array;
  width: number;
}> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const idatParts: Uint8Array[] = [];
  for (let offset = 8; offset < png.byteLength;) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    if (type === "IDAT")
      idatParts.push(png.slice(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const compressed = concatenateBytes(...idatParts);
  const raw = new Uint8Array(
    await new Response(
      new Blob([compressed.buffer])
        .stream()
        .pipeThrough(new DecompressionStream("deflate")),
    ).arrayBuffer(),
  );
  expect(raw.byteLength).toBe(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    expect(raw[y * (1 + width * 4)]).toBe(0);
  }
  return { height, raw, width };
}

function hasPixel(
  image: { height: number; raw: Uint8Array; width: number },
  color: readonly [number, number, number, number],
): boolean {
  const stride = 1 + image.width * 4;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = y * stride + 1 + x * 4;
      if (
        color.every((channel, index) => image.raw[offset + index] === channel)
      ) {
        return true;
      }
    }
  }
  return false;
}

function concatenateBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}
