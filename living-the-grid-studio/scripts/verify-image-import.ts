import assert from "node:assert/strict";

import {
  computeImagePlacement,
  estimateEdgeBackgroundColor,
  flattenBackgroundPixels,
  normalizeImageCrop,
} from "../client/src/lib/engine/image-import";
import type { RGB } from "../client/src/lib/engine/color";

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function verifyPortraitCover(): void {
  const placement = computeImagePlacement(331, 395, 64, 64, "cover");
  assert.equal(placement.sourceX, 0);
  assert.equal(rounded(placement.sourceY), 32);
  assert.equal(placement.sourceWidth, 331);
  assert.equal(placement.sourceHeight, 331);
  assert.equal(placement.destWidth, 64);
  assert.equal(placement.destHeight, 64);
}

function verifyPortraitCoverFocus(): void {
  const placement = computeImagePlacement(331, 395, 64, 64, "cover", {
    x: 50,
    y: 38,
  });
  assert.equal(placement.sourceX, 0);
  assert.equal(rounded(placement.sourceY), 24.32);
  assert.equal(placement.sourceWidth, 331);
  assert.equal(placement.sourceHeight, 331);
}

function verifyWideCover(): void {
  const placement = computeImagePlacement(1280, 720, 64, 64, "cover");
  assert.equal(rounded(placement.sourceX), 280);
  assert.equal(placement.sourceY, 0);
  assert.equal(placement.sourceWidth, 720);
  assert.equal(placement.sourceHeight, 720);
}

function verifyWideCoverFocus(): void {
  const placement = computeImagePlacement(1280, 720, 64, 64, "cover", {
    x: 25,
    y: 50,
  });
  assert.equal(rounded(placement.sourceX), 140);
  assert.equal(placement.sourceY, 0);
  assert.equal(placement.sourceWidth, 720);
  assert.equal(placement.sourceHeight, 720);
}

function verifyContain(): void {
  const placement = computeImagePlacement(331, 395, 64, 64, "contain");
  assert.equal(placement.sourceX, 0);
  assert.equal(placement.sourceY, 0);
  assert.equal(placement.sourceWidth, 331);
  assert.equal(placement.sourceHeight, 395);
  assert.equal(rounded(placement.destX), 5.185);
  assert.equal(placement.destY, 0);
  assert.equal(rounded(placement.destWidth), 53.63);
  assert.equal(placement.destHeight, 64);
}

function verifyContainFocus(): void {
  const placement = computeImagePlacement(331, 395, 64, 64, "contain", {
    x: 75,
    y: 50,
  });
  assert.equal(rounded(placement.destX), 7.777);
  assert.equal(placement.destY, 0);
  assert.equal(rounded(placement.destWidth), 53.63);
  assert.equal(placement.destHeight, 64);
}

function verifyStretch(): void {
  const placement = computeImagePlacement(331, 395, 64, 64, "stretch");
  assert.deepEqual(placement, {
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 331,
    sourceHeight: 395,
    destX: 0,
    destY: 0,
    destWidth: 64,
    destHeight: 64,
  });
}

function verifyStretchCrop(): void {
  const placement = computeImagePlacement(
    1000,
    200,
    64,
    64,
    "stretch",
    { x: 50, y: 50 },
    { x: 10, y: 20, width: 40, height: 50 },
  );
  assert.deepEqual(placement, {
    sourceX: 100,
    sourceY: 40,
    sourceWidth: 400,
    sourceHeight: 100,
    destX: 0,
    destY: 0,
    destWidth: 64,
    destHeight: 64,
  });
}

function verifyCoverCrop(): void {
  const placement = computeImagePlacement(
    1000,
    500,
    64,
    64,
    "cover",
    { x: 50, y: 50 },
    { x: 25, y: 0, width: 50, height: 100 },
  );
  assert.equal(placement.sourceX, 250);
  assert.equal(placement.sourceY, 0);
  assert.equal(placement.sourceWidth, 500);
  assert.equal(placement.sourceHeight, 500);
  assert.equal(placement.destWidth, 64);
  assert.equal(placement.destHeight, 64);
}

function verifyCropNormalization(): void {
  assert.deepEqual(
    normalizeImageCrop({ x: 96, y: -10, width: 20, height: 999 }),
    {
      x: 96,
      y: 0,
      width: 4,
      height: 100,
    },
  );
}

function verifyInvalidDimensions(): void {
  assert.throws(() => computeImagePlacement(0, 395, 64, 64, "cover"));
  assert.throws(() => computeImagePlacement(331, 395, 0, 64, "cover"));
}

function verifyBackgroundEstimate(): void {
  const bg: RGB = { r: 132, g: 136, b: 129 };
  const skin: RGB = { r: 216, g: 154, b: 116 };
  const pixels: RGB[][] = [
    [bg, bg, bg, bg, bg],
    [bg, skin, skin, skin, bg],
    [bg, skin, skin, skin, bg],
    [bg, skin, skin, skin, bg],
    [bg, bg, bg, bg, bg],
  ];

  assert.deepEqual(estimateEdgeBackgroundColor(pixels), bg);
}

function verifyBackgroundFlatteningIsEdgeConnected(): void {
  const bg: RGB = { r: 132, g: 136, b: 129 };
  const noisyBg: RGB = { r: 140, g: 130, b: 125 };
  const skin: RGB = { r: 216, g: 154, b: 116 };
  const innerGray: RGB = { r: 138, g: 134, b: 126 };
  const white: RGB = { r: 255, g: 255, b: 255 };
  const pixels: RGB[][] = [
    [bg, bg, noisyBg, bg, bg],
    [bg, skin, skin, skin, bg],
    [bg, skin, innerGray, skin, bg],
    [bg, skin, skin, skin, bg],
    [bg, bg, bg, noisyBg, bg],
  ];

  const flattened = flattenBackgroundPixels(pixels, white, 18);

  assert.deepEqual(flattened[0][0], white);
  assert.deepEqual(flattened[4][3], white);
  assert.deepEqual(flattened[2][2], innerGray);
  assert.deepEqual(flattened[2][1], skin);
}

verifyPortraitCover();
verifyPortraitCoverFocus();
verifyWideCover();
verifyWideCoverFocus();
verifyContain();
verifyContainFocus();
verifyStretch();
verifyStretchCrop();
verifyCoverCrop();
verifyCropNormalization();
verifyInvalidDimensions();
verifyBackgroundEstimate();
verifyBackgroundFlatteningIsEdgeConnected();

console.log("Image import verification passed.");
