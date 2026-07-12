import type { CanonicalGridDocument } from "../shared/community";
import { TOMODACHI_PALETTE } from "../client/src/lib/engine/palette";
import { sha256 } from "./crypto";

export type CreationObjectKind = "preview" | "project_json" | "social" | "thumb";

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

const SHOWCASE_OUTPUT_LIMIT = 8 * 1024 * 1024;

interface ImageVariant {
  format: "image/jpeg" | "image/webp";
  height: number;
  key: string;
  kind: Exclude<CreationObjectKind, "project_json">;
  quality: number;
  width: number;
}

export async function storeRevisionObjects(
  env: Env,
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
  const allKeys = [`${prefix}/project.json`, ...variants.map((variant) => variant.key)];

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

    const sourceSvg = renderGridSvg(project);
    const source = new Blob([sourceSvg], { type: "image/svg+xml" });
    for (const variant of variants) {
      try {
        const output = await env.IMAGES.input(source.stream())
          .transform({
            background: variant.format === "image/jpeg" ? "#fffaf0" : undefined,
            fit: "contain",
            height: variant.height,
            width: variant.width,
          })
          .output({ format: variant.format, quality: variant.quality });
        // The dimensions and input are controlled, so buffering this transformed
        // result cannot grow with user-provided upload size.
        const imageBytes = new Uint8Array(await output.response().arrayBuffer());
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
        console.log(JSON.stringify({
          kind: variant.kind,
          message: "images_binding_unavailable_using_dynamic_svg_fallback",
        }));
      }
    }
    return objects;
  } catch (error) {
    await env.PROJECTS.delete(allKeys);
    throw error;
  }
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
      { bytes: displayBytes, contentType: "image/webp", key: keys.display, kind: "display" },
      { bytes: thumbBytes, contentType: "image/webp", key: keys.thumb, kind: "thumb" },
      { bytes: socialBytes, contentType: "image/jpeg", key: keys.social, kind: "social" },
    ] as const;
    const totalBytes = outputs.reduce((total, output) => total + output.bytes.byteLength, 0);
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

const PALETTE_HEX = new Map(TOMODACHI_PALETTE.map((color) => [color.id, color.hex]));

function colorForId(id: string): string {
  return PALETTE_HEX.get(id) ?? "#000000";
}

function decimal(value: number): string {
  return value.toFixed(3).replace(/\.0+$/u, "").replace(/(\.\d*?)0+$/u, "$1");
}
