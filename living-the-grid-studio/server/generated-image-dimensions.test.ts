import { describe, expect, it } from "vitest";

import { readGeneratedImageDimensions } from "./generated-image-dimensions";

describe("generated raster dimension reader", () => {
  it("reads PNG IHDR dimensions without decoding pixels", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    bytes.set([0, 0, 4, 0, 0, 0, 3, 0], 16);

    expect(readGeneratedImageDimensions(bytes, "image/png")).toEqual({
      height: 768,
      width: 1024,
    });
  });

  it("reads JPEG start-of-frame dimensions", () => {
    const bytes = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x07,
      0x08, 0x03, 0x00, 0x04, 0x00, 0xff, 0xd9,
    ]);

    expect(readGeneratedImageDimensions(bytes, "image/jpeg")).toEqual({
      height: 768,
      width: 1024,
    });
  });

  it.each([
    {
      bytes: Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0x16, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56,
        0x50, 0x38, 0x58, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0x03, 0, 0xff, 0x02, 0,
      ]),
      name: "VP8X",
    },
    {
      bytes: Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0x0d, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56,
        0x50, 0x38, 0x4c, 0, 0, 0, 0, 0x2f, 0xff, 0xc3, 0xbf, 0x00,
      ]),
      name: "VP8L",
    },
    {
      bytes: Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0x16, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56,
        0x50, 0x38, 0x20, 0, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, 0x00, 0x04,
        0x00, 0x03,
      ]),
      name: "VP8",
    },
  ])("reads $name WebP dimensions", ({ bytes }) => {
    expect(readGeneratedImageDimensions(bytes, "image/webp")).toEqual({
      height: 768,
      width: 1024,
    });
  });

  it("rejects malformed or dimensionless headers", () => {
    expect(
      readGeneratedImageDimensions(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
        "image/png",
      ),
    ).toBeNull();
    expect(
      readGeneratedImageDimensions(
        Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
        "image/jpeg",
      ),
    ).toBeNull();
  });
});
