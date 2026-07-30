import { describe, expect, it } from "vitest";

import {
  compositeRgbaPixel,
  computeImagePlacement,
  flattenBackgroundPixels,
  importPixelsToPaletteCells,
  prepareImportPixels,
  type ImportPixel,
  type RGBA,
} from "./image-import";
import { createGridDocument, recomputeUsedColors } from "./grid";
import { DEFAULT_CONFIG, passLimitPalette } from "./optimizer";
import { TOMODACHI_PALETTE } from "./palette";

describe("alpha-aware image import", () => {
  it("turns pixels at or below the default alpha threshold into empty cells", () => {
    expect(
      compositeRgbaPixel(
        { r: 255, g: 0, b: 255, a: 16 },
        { r: 255, g: 255, b: 255 },
      ),
    ).toBeNull();

    expect(
      compositeRgbaPixel(
        { r: 255, g: 0, b: 255, a: 17 },
        { r: 255, g: 255, b: 255 },
      ),
    ).not.toBeNull();
  });

  it("composites partial alpha deterministically against the configured matte", () => {
    expect(
      compositeRgbaPixel(
        { r: 255, g: 0, b: 0, a: 128 },
        { r: 255, g: 255, b: 255 },
      ),
    ).toEqual({ r: 255, g: 127, b: 127 });

    expect(
      compositeRgbaPixel({ r: 255, g: 0, b: 0, a: 128 }, { r: 0, g: 0, b: 0 }),
    ).toEqual({ r: 128, g: 0, b: 0 });
  });

  it("preserves opaque RGB values exactly", () => {
    expect(
      compositeRgbaPixel(
        { r: 12, g: 34, b: 56, a: 255 },
        { r: 255, g: 255, b: 255 },
      ),
    ).toEqual({ r: 12, g: 34, b: 56 });
  });

  it("keeps contain-mode letterbox samples transparent", () => {
    const placement = computeImagePlacement(200, 100, 256, 256, "contain");
    expect(placement).toMatchObject({
      destX: 0,
      destY: 64,
      destWidth: 256,
      destHeight: 128,
    });

    const transparent: RGBA = { r: 0, g: 0, b: 0, a: 0 };
    const opaque: RGBA = { r: 20, g: 40, b: 60, a: 255 };
    const prepared = prepareImportPixels([
      [transparent, transparent],
      [opaque, transparent],
    ]);

    expect(prepared).toEqual([
      [null, null],
      [{ r: 20, g: 40, b: 60 }, null],
    ]);
  });

  it("never turns transparent cells into background paint during cleanup", () => {
    const background = { r: 240, g: 240, b: 240 };
    const subject = { r: 20, g: 40, b: 60 };
    const pixels: ImportPixel[][] = [
      [null, background, null],
      [background, subject, background],
      [null, background, null],
    ];

    expect(
      flattenBackgroundPixels(pixels, { r: 255, g: 255, b: 255 }, 0),
    ).toEqual([
      [null, { r: 255, g: 255, b: 255 }, null],
      [{ r: 255, g: 255, b: 255 }, subject, { r: 255, g: 255, b: 255 }],
      [null, { r: 255, g: 255, b: 255 }, null],
    ]);
  });

  it("returns a deterministic copy when every edge cell is transparent", () => {
    const subject = { r: 12, g: 34, b: 56 };
    const pixels: ImportPixel[][] = [
      [null, null, null],
      [null, subject, null],
      [null, null, null],
    ];

    const flattened = flattenBackgroundPixels(
      pixels,
      { r: 255, g: 255, b: 255 },
      34,
    );

    expect(flattened).toEqual(pixels);
    expect(flattened).not.toBe(pixels);
  });

  it("keeps empty cells through deterministic palette limiting", () => {
    const first = TOMODACHI_PALETTE[0];
    const second = TOMODACHI_PALETTE.at(-1)!;
    const pixels: ImportPixel[][] = [
      [null, { r: first.rgb[0], g: first.rgb[1], b: first.rgb[2] }],
      [{ r: second.rgb[0], g: second.rgb[1], b: second.rgb[2] }, null],
    ];
    const doc = createGridDocument(2, 2, "Alpha import");
    doc.cells = importPixelsToPaletteCells(pixels, 2, 2);
    const imported = recomputeUsedColors(doc);

    const limitOnce = passLimitPalette(imported, {
      ...DEFAULT_CONFIG,
      maxColors: 1,
    }).doc;
    const limitAgain = passLimitPalette(imported, {
      ...DEFAULT_CONFIG,
      maxColors: 1,
    }).doc;

    expect(limitOnce.usedColors).toHaveLength(1);
    expect(limitOnce.cells[0]).toBeNull();
    expect(limitOnce.cells[3]).toBeNull();
    expect(limitAgain.cells).toEqual(limitOnce.cells);
  });

  it("rejects a sampled surface that does not match the target dimensions", () => {
    expect(() => importPixelsToPaletteCells([[null]], 2, 1)).toThrowError(
      "Import pixels must exactly match the target dimensions",
    );
  });
});
