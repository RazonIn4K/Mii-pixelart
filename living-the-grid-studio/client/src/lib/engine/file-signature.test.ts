import { describe, expect, it } from "vitest";

import {
  checkImageSignature,
  declaredImageFormat,
  readFileSignature,
  sniffImageFormat,
} from "./file-signature";

const bytes = (...values: (number | string)[]): Uint8Array => {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number") {
      out.push(value);
    } else {
      for (const ch of value) out.push(ch.charCodeAt(0));
    }
  }
  return new Uint8Array(out);
};

const PNG_HEAD = bytes(
  0x89,
  "PNG",
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0,
  0,
  0,
  13,
  "IHDR",
);
const JPEG_HEAD = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, "JFIF");
const GIF_HEAD = bytes("GIF89a", 0x10, 0x00);
const WEBP_HEAD = bytes("RIFF", 0x24, 0x00, 0x00, 0x00, "WEBP", "VP8 ");
const AVIF_HEAD = bytes(
  0x00,
  0x00,
  0x00,
  0x1c,
  "ftyp",
  "avif",
  0x00,
  0x00,
  0x00,
  0x00,
  "avifmif1",
);
const BMP_HEAD = bytes("BM", 0x36, 0x00, 0x00, 0x00);
const SVG_HEAD = bytes(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">',
);
const SVG_BARE_HEAD = bytes("  \n<svg width='10'>");

describe("sniffImageFormat", () => {
  it.each([
    [PNG_HEAD, "png"],
    [JPEG_HEAD, "jpeg"],
    [GIF_HEAD, "gif"],
    [WEBP_HEAD, "webp"],
    [AVIF_HEAD, "avif"],
    [BMP_HEAD, "bmp"],
    [SVG_HEAD, "svg"],
    [SVG_BARE_HEAD, "svg"],
  ] as const)("identifies known signatures (%#)", (head, expected) => {
    expect(sniffImageFormat(head)).toBe(expected);
  });

  it("returns null for unknown or empty content", () => {
    expect(sniffImageFormat(bytes("MZ\x90\x00"))).toBeNull();
    expect(sniffImageFormat(bytes('{"version":1}'))).toBeNull();
    expect(sniffImageFormat(new Uint8Array(0))).toBeNull();
  });

  it("does not identify RIFF containers that are not WebP", () => {
    expect(sniffImageFormat(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBeNull();
  });

  it("does not identify non-AVIF ISO-BMFF (e.g. HEIC, MP4)", () => {
    expect(
      sniffImageFormat(
        bytes(0x00, 0x00, 0x00, 0x18, "ftyp", "heic", 0, 0, 0, 0),
      ),
    ).toBeNull();
    expect(
      sniffImageFormat(
        bytes(0x00, 0x00, 0x00, 0x18, "ftyp", "isom", 0, 0, 0, 0),
      ),
    ).toBeNull();
  });
});

describe("declaredImageFormat", () => {
  it("prefers the extension and falls back to MIME", () => {
    expect(declaredImageFormat("photo.JPG", "")).toBe("jpeg");
    expect(declaredImageFormat("photo", "image/webp")).toBe("webp");
    expect(declaredImageFormat("archive.zip", "image/png")).toBe("png");
    expect(declaredImageFormat("notes.txt", "text/plain")).toBeNull();
  });
});

describe("checkImageSignature", () => {
  it("accepts content that matches its declared format", () => {
    expect(checkImageSignature(PNG_HEAD, "pixel.png", "image/png")).toEqual({
      ok: true,
      format: "png",
    });
    expect(
      checkImageSignature(BMP_HEAD, "legacy.bmp", "image/x-ms-bmp"),
    ).toEqual({
      ok: true,
      format: "bmp",
    });
  });

  it("rejects SVG content regardless of its name", () => {
    expect(checkImageSignature(SVG_HEAD, "disguised.png", "image/png")).toEqual(
      {
        ok: false,
        reason: "svg",
      },
    );
  });

  it("rejects content whose signature contradicts the declared format", () => {
    expect(checkImageSignature(JPEG_HEAD, "renamed.png", "image/png")).toEqual({
      ok: false,
      reason: "mismatch",
    });
    expect(checkImageSignature(PNG_HEAD, "renamed.gif", "image/gif")).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects unrecognizable content", () => {
    expect(
      checkImageSignature(bytes("plain text"), "fake.png", "image/png"),
    ).toEqual({ ok: false, reason: "unknown-signature" });
  });
});

describe("readFileSignature", () => {
  it("reads only the leading bytes of a blob", async () => {
    const blob = new Blob([PNG_HEAD, new Uint8Array(1024).fill(0x41)]);
    const head = await readFileSignature(blob);
    expect(head.length).toBeLessThanOrEqual(64);
    expect(sniffImageFormat(head)).toBe("png");
  });
});
