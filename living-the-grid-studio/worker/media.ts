import type { CanonicalGridDocument } from "../shared/community";
import { TOMODACHI_PALETTE } from "../client/src/lib/engine/palette";
import { sha256 } from "./crypto";

export type CreationObjectKind =
  "preview" | "project_json" | "social" | "thumb";

export interface StoredCreationObject {
  byteSize: number;
  contentType: string;
  key: string;
  kind: CreationObjectKind;
  sha256: string;
}

export type ShowcaseObjectKind = "display" | "social" | "thumb";

export interface StoredShowcaseObject {
  byteSize: number;
  contentType: "image/jpeg" | "image/webp";
  key: string;
  kind: ShowcaseObjectKind;
  sha256: string;
}

export interface StoredProfileImageObject {
  byteSize: number;
  contentType: "image/webp";
  key: string;
  sha256: string;
}

const SHOWCASE_OUTPUT_LIMIT = 8 * 1024 * 1024;
const PROFILE_IMAGE_OUTPUT_LIMIT = 2 * 1024 * 1024;
const REVISION_OUTPUT_LIMIT = 8 * 1024 * 1024;
const GRID_PREVIEW_SIZE = 640;

type RevisionMediaEnvironment = Pick<
  Env,
  "ENVIRONMENT" | "IMAGES" | "PROJECTS"
>;
type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

interface ImageVariant {
  format: "image/jpeg" | "image/webp";
  height: number;
  key: string;
  kind: Exclude<CreationObjectKind, "project_json">;
  quality: number;
  width: number;
}

export async function storeRevisionObjects(
  env: RevisionMediaEnvironment,
  creationId: string,
  revisionId: string,
  project: CanonicalGridDocument,
  canonicalJson: string,
): Promise<StoredCreationObject[]> {
  const prefix = `private/creations/${creationId}/${revisionId}`;
  const variants: ImageVariant[] = [
    {
      format: "image/webp",
      height: 768,
      key: `${prefix}/preview.webp`,
      kind: "preview",
      quality: 85,
      width: 768,
    },
    {
      format: "image/webp",
      height: 384,
      key: `${prefix}/thumb.webp`,
      kind: "thumb",
      quality: 80,
      width: 384,
    },
    {
      format: "image/jpeg",
      height: 630,
      key: `${prefix}/social.jpg`,
      kind: "social",
      quality: 85,
      width: 1_200,
    },
  ];
  const allKeys = [
    `${prefix}/project.json`,
    ...variants.map((variant) => variant.key),
  ];

  try {
    const projectBytes = new TextEncoder().encode(canonicalJson);
    await env.PROJECTS.put(allKeys[0], projectBytes, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: { creationId, revisionId, kind: "project_json" },
    });
    const objects: StoredCreationObject[] = [
      {
        byteSize: projectBytes.byteLength,
        contentType: "application/json",
        key: allKeys[0],
        kind: "project_json",
        sha256: await sha256(projectBytes),
      },
    ];

    const source = blobFromBytes(renderGridPng(project), "image/png");
    for (const variant of variants) {
      try {
        const imageBytes = await transformRevisionImage(env, source, variant);
        await env.PROJECTS.put(variant.key, imageBytes, {
          httpMetadata: { contentType: variant.format },
          customMetadata: { creationId, revisionId, kind: variant.kind },
        });
        objects.push({
          byteSize: imageBytes.byteLength,
          contentType: variant.format,
          key: variant.key,
          kind: variant.kind,
          sha256: await sha256(imageBytes),
        });
      } catch (error) {
        if (env.ENVIRONMENT !== "local") throw error;
        console.log(
          JSON.stringify({
            kind: variant.kind,
            message:
              "revision_image_transform_unavailable_using_dynamic_svg_fallback",
          }),
        );
      }
    }
    return objects;
  } catch (error) {
    await env.PROJECTS.delete(allKeys);
    throw error;
  }
}

async function transformRevisionImage(
  env: RevisionMediaEnvironment,
  source: Blob,
  variant: ImageVariant,
): Promise<Uint8Array> {
  const output = await env.IMAGES.input(source.stream())
    .transform({
      background: variant.format === "image/jpeg" ? "#fffaf0" : undefined,
      fit: "contain",
      height: variant.height,
      width: variant.width,
    })
    .output({ format: variant.format, quality: variant.quality });
  const response = output.response();
  if (!response.ok) throw new Error("revision_image_transform_failed");

  // The input and output dimensions are controlled, so this bounded response
  // is safe to buffer before its hash and byte count are recorded in D1.
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > REVISION_OUTPUT_LIMIT ||
    !hasImageSignature(bytes, variant.format)
  ) {
    throw new Error("revision_image_transform_failed");
  }
  return bytes;
}

/**
 * Decode user-provided raster bytes through Images, then persist only bounded,
 * metadata-free derivatives. The original source is deliberately never written
 * to R2. Secondary variants are derived from the canonical WebP so EXIF/GPS
 * metadata cannot survive into the JPEG social card.
 */
export async function storeShowcaseObjects(
  env: Env,
  creationId: string,
  imageId: string,
  sourceBytes: Uint8Array,
  sourceContentType: string,
): Promise<StoredShowcaseObject[]> {
  const prefix = `private/creations/${creationId}/showcase/${imageId}`;
  const keys = {
    display: `${prefix}/display.webp`,
    thumb: `${prefix}/thumb.webp`,
    social: `${prefix}/social.jpg`,
  } as const;

  try {
    const source = blobFromBytes(sourceBytes, sourceContentType);
    const displayBytes = await transformImage(env, source, {
      background: undefined,
      fit: "scale-down",
      format: "image/webp",
      height: 1_600,
      quality: 82,
      width: 1_600,
    });
    const canonical = blobFromBytes(displayBytes, "image/webp");
    const [thumbBytes, socialBytes] = await Promise.all([
      transformImage(env, canonical, {
        background: "#fffaf0",
        fit: "pad",
        format: "image/webp",
        height: 512,
        quality: 78,
        width: 512,
      }),
      transformImage(env, canonical, {
        background: "#fffaf0",
        fit: "pad",
        format: "image/jpeg",
        height: 630,
        quality: 84,
        width: 1_200,
      }),
    ]);
    const outputs = [
      {
        bytes: displayBytes,
        contentType: "image/webp",
        key: keys.display,
        kind: "display",
      },
      {
        bytes: thumbBytes,
        contentType: "image/webp",
        key: keys.thumb,
        kind: "thumb",
      },
      {
        bytes: socialBytes,
        contentType: "image/jpeg",
        key: keys.social,
        kind: "social",
      },
    ] as const;
    const totalBytes = outputs.reduce(
      (total, output) => total + output.bytes.byteLength,
      0,
    );
    if (totalBytes > SHOWCASE_OUTPUT_LIMIT) {
      throw new Error("showcase_output_limit_exceeded");
    }

    const stored: StoredShowcaseObject[] = [];
    for (const output of outputs) {
      await env.PROJECTS.put(output.key, output.bytes, {
        httpMetadata: { contentType: output.contentType },
        customMetadata: { creationId, imageId, kind: output.kind },
      });
      stored.push({
        byteSize: output.bytes.byteLength,
        contentType: output.contentType,
        key: output.key,
        kind: output.kind,
        sha256: await sha256(output.bytes),
      });
    }
    return stored;
  } catch (error) {
    await env.PROJECTS.delete(Object.values(keys));
    throw error;
  }
}

/**
 * Normalize one user-selected raster into a bounded square WebP. The source
 * bytes are decoded by Images and never written to R2; the user-controlled
 * focus point only influences the fixed cover crop.
 */
export async function storeProfileImageObject(
  env: Env,
  userId: string,
  imageId: string,
  sourceBytes: Uint8Array,
  sourceContentType: string,
  focusX: number,
  focusY: number,
): Promise<StoredProfileImageObject> {
  const key = `private/users/${userId}/avatar/${imageId}/avatar.webp`;
  try {
    const source = blobFromBytes(sourceBytes, sourceContentType);
    const transformed = await env.IMAGES.input(source.stream())
      .transform({
        fit: "cover",
        gravity: {
          mode: "box-center",
          x: focusX / 100,
          y: focusY / 100,
        },
        height: 256,
        width: 256,
      })
      .output({ anim: false, format: "image/webp", quality: 84 });
    const response = transformed.response();
    if (!response.ok) throw new Error("profile_image_transform_failed");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > PROFILE_IMAGE_OUTPUT_LIMIT ||
      !hasImageSignature(bytes, "image/webp")
    ) {
      throw new Error("profile_image_output_invalid");
    }
    await env.PROJECTS.put(key, bytes, {
      httpMetadata: { contentType: "image/webp" },
      customMetadata: { imageId, kind: "profile_avatar", userId },
    });
    return {
      byteSize: bytes.byteLength,
      contentType: "image/webp",
      key,
      sha256: await sha256(bytes),
    };
  } catch (error) {
    await env.PROJECTS.delete(key);
    throw error;
  }
}

async function transformImage(
  env: Env,
  source: Blob,
  options: {
    background: string | undefined;
    fit: "contain" | "pad" | "scale-down";
    format: "image/jpeg" | "image/webp";
    height: number;
    quality: number;
    width: number;
  },
): Promise<Uint8Array> {
  const transformed = await env.IMAGES.input(source.stream())
    .transform({
      background: options.background,
      fit: options.fit,
      height: options.height,
      width: options.width,
    })
    // Accepted animated WebP input is intentionally flattened to a still. The
    // community gallery stores bounded static derivatives, never animation.
    .output({ anim: false, format: options.format, quality: options.quality });
  const response = transformed.response();
  if (!response.ok) throw new Error("showcase_image_transform_failed");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > SHOWCASE_OUTPUT_LIMIT) {
    throw new Error("showcase_output_limit_exceeded");
  }
  return bytes;
}

function blobFromBytes(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}

/**
 * Render a bounded raster preview from the validated grid only. The PNG has no
 * text or metadata chunks, so project names and import metadata cannot enter
 * the bytes passed to Cloudflare Images.
 */
export function renderGridPng(project: CanonicalGridDocument): Uint8Array {
  const pixels = new Uint8Array(GRID_PREVIEW_SIZE * GRID_PREVIEW_SIZE * 4);
  fillPixels(pixels, [255, 250, 240, 255]);
  fillRoundedRect(pixels, 10, 10, 620, 620, 36, [23, 35, 28, 255]);
  fillRoundedRect(pixels, 18, 18, 604, 604, 28, [220, 233, 223, 255]);

  const padding = 28;
  const available = GRID_PREVIEW_SIZE - padding * 2;
  const scale = Math.min(available / project.width, available / project.height);
  const renderedWidth = project.width * scale;
  const renderedHeight = project.height * scale;
  const originX = (GRID_PREVIEW_SIZE - renderedWidth) / 2;
  const originY = (GRID_PREVIEW_SIZE - renderedHeight) / 2;

  for (let index = 0; index < project.cells.length; index += 1) {
    const colorId = project.cells[index];
    if (!colorId) continue;
    const x = index % project.width;
    const y = Math.floor(index / project.width);
    const left = Math.floor(originX + x * scale);
    const top = Math.floor(originY + y * scale);
    const right = Math.ceil(originX + (x + 1) * scale + 0.15);
    const bottom = Math.ceil(originY + (y + 1) * scale + 0.15);
    fillRect(pixels, left, top, right - left, bottom - top, rgbaForId(colorId));
  }

  const outlineLeft = Math.floor(originX) - 2;
  const outlineTop = Math.floor(originY) - 2;
  const outlineRight = Math.ceil(originX + renderedWidth) + 2;
  const outlineBottom = Math.ceil(originY + renderedHeight) + 2;
  strokeRect(
    pixels,
    outlineLeft,
    outlineTop,
    outlineRight - outlineLeft,
    outlineBottom - outlineTop,
    4,
    [23, 35, 28, 255],
  );

  const scanlines = new Uint8Array(
    GRID_PREVIEW_SIZE * (1 + GRID_PREVIEW_SIZE * 4),
  );
  for (let y = 0; y < GRID_PREVIEW_SIZE; y += 1) {
    const row = y * (1 + GRID_PREVIEW_SIZE * 4);
    scanlines[row] = 0;
    scanlines.set(
      pixels.subarray(
        y * GRID_PREVIEW_SIZE * 4,
        (y + 1) * GRID_PREVIEW_SIZE * 4,
      ),
      row + 1,
    );
  }

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, GRID_PREVIEW_SIZE);
  headerView.setUint32(4, GRID_PREVIEW_SIZE);
  header.set([8, 6, 0, 0, 0], 8);
  return concatenateBytes(
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateStored(scanlines)),
    pngChunk("IEND", new Uint8Array()),
  );
}

export function renderGridSvg(project: CanonicalGridDocument): string {
  const canvas = 640;
  const padding = 28;
  const available = canvas - padding * 2;
  const scale = Math.min(available / project.width, available / project.height);
  const width = project.width * scale;
  const height = project.height * scale;
  const originX = (canvas - width) / 2;
  const originY = (canvas - height) / 2;
  const cells: string[] = [];

  for (let index = 0; index < project.cells.length; index += 1) {
    const colorId = project.cells[index];
    if (!colorId) continue;
    const x = index % project.width;
    const y = Math.floor(index / project.width);
    cells.push(
      `<rect x="${decimal(originX + x * scale)}" y="${decimal(originY + y * scale)}" width="${decimal(scale + 0.15)}" height="${decimal(scale + 0.15)}" fill="${colorForId(colorId)}"/>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}"><rect width="640" height="640" rx="40" fill="#fffaf0"/><rect x="14" y="14" width="612" height="612" rx="32" fill="#dce9df" stroke="#17231c" stroke-width="8"/>${cells.join("")}<rect x="${decimal(originX)}" y="${decimal(originY)}" width="${decimal(width)}" height="${decimal(height)}" fill="none" stroke="#17231c" stroke-width="4"/></svg>`;
}

const PALETTE_HEX = new Map(
  TOMODACHI_PALETTE.map((color) => [color.id, color.hex]),
);
const PALETTE_RGBA = new Map<string, Rgba>(
  TOMODACHI_PALETTE.map((color) => [color.id, [...color.rgb, 255]]),
);
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC32_TABLE = createCrc32Table();

function colorForId(id: string): string {
  return PALETTE_HEX.get(id) ?? "#000000";
}

function rgbaForId(id: string): Rgba {
  return PALETTE_RGBA.get(id) ?? [0, 0, 0, 255];
}

function fillPixels(pixels: Uint8Array, color: Rgba): void {
  for (let offset = 0; offset < pixels.byteLength; offset += 4) {
    pixels.set(color, offset);
  }
}

function fillRect(
  pixels: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Rgba,
): void {
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(GRID_PREVIEW_SIZE, x + width);
  const bottom = Math.min(GRID_PREVIEW_SIZE, y + height);
  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      pixels.set(color, (row * GRID_PREVIEW_SIZE + column) * 4);
    }
  }
}

function fillRoundedRect(
  pixels: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: Rgba,
): void {
  fillRect(pixels, x + radius, y, width - radius * 2, height, color);
  fillRect(pixels, x, y + radius, width, height - radius * 2, color);
  const centers = [
    [x + radius, y + radius],
    [x + width - radius, y + radius],
    [x + radius, y + height - radius],
    [x + width - radius, y + height - radius],
  ] as const;
  const radiusSquared = radius * radius;
  for (const [centerX, centerY] of centers) {
    for (let offsetY = -radius; offsetY < radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX < radius; offsetX += 1) {
        const dx = offsetX + 0.5;
        const dy = offsetY + 0.5;
        if (dx * dx + dy * dy > radiusSquared) continue;
        fillRect(pixels, centerX + offsetX, centerY + offsetY, 1, 1, color);
      }
    }
  }
}

function strokeRect(
  pixels: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number,
  color: Rgba,
): void {
  fillRect(pixels, x, y, width, thickness, color);
  fillRect(pixels, x, y + height - thickness, width, thickness, color);
  fillRect(pixels, x, y, thickness, height, color);
  fillRect(pixels, x + width - thickness, y, thickness, height, color);
}

function deflateStored(bytes: Uint8Array): Uint8Array {
  const blocks = Math.ceil(bytes.byteLength / 65_535);
  const output = new Uint8Array(2 + blocks * 5 + bytes.byteLength + 4);
  output.set([0x78, 0x01]);
  let inputOffset = 0;
  let outputOffset = 2;
  while (inputOffset < bytes.byteLength) {
    const length = Math.min(65_535, bytes.byteLength - inputOffset);
    const final = inputOffset + length === bytes.byteLength;
    output[outputOffset] = final ? 1 : 0;
    output[outputOffset + 1] = length & 0xff;
    output[outputOffset + 2] = length >>> 8;
    const inverseLength = ~length & 0xffff;
    output[outputOffset + 3] = inverseLength & 0xff;
    output[outputOffset + 4] = inverseLength >>> 8;
    outputOffset += 5;
    output.set(bytes.subarray(inputOffset, inputOffset + length), outputOffset);
    inputOffset += length;
    outputOffset += length;
  }
  new DataView(output.buffer).setUint32(outputOffset, adler32(bytes));
  return output;
}

function adler32(bytes: Uint8Array): number {
  const modulus = 65_521;
  let a = 1;
  let b = 0;
  for (let start = 0; start < bytes.byteLength; start += 5_552) {
    const end = Math.min(start + 5_552, bytes.byteLength);
    for (let index = start; index < end; index += 1) {
      a += bytes[index];
      b += a;
    }
    a %= modulus;
    b %= modulus;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(
  type: "IDAT" | "IEND" | "IHDR",
  data: Uint8Array,
): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.byteLength);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.byteLength);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(typeBytes, data));
  return chunk;
}

function crc32(type: Uint8Array, data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const bytes of [type, data]) {
    for (const byte of bytes) {
      crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
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

function hasImageSignature(
  bytes: Uint8Array,
  format: "image/jpeg" | "image/webp",
): boolean {
  if (format === "image/jpeg") {
    return (
      bytes.byteLength >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  return (
    bytes.byteLength >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  );
}

function decimal(value: number): string {
  return value
    .toFixed(3)
    .replace(/\.0+$/u, "")
    .replace(/(\.\d*?)0+$/u, "$1");
}
