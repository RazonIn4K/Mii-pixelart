import { afterEach, describe, expect, it, vi } from "vitest";

import { createGridDocument, setCell } from "./grid";
import {
  exportGridAsPng,
  gridStepForDensity,
  renderGrid,
  snapGridStrip,
  shouldRenderGridLines,
} from "./canvas-renderer";

function installCanvasDouble() {
  const fillRect = vi.fn();
  const drawImage = vi.fn();
  const lineTo = vi.fn();
  const moveTo = vi.fn();
  const context = {
    beginPath: vi.fn(),
    canvas: { height: 0, width: 0 },
    clearRect: vi.fn(),
    clip: vi.fn(),
    drawImage,
    fillRect,
    lineTo,
    moveTo,
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
  };
  const canvas = {
    getContext: vi.fn(() => context),
    height: 0,
    toDataURL: vi.fn(() => "data:image/png;base64,test"),
    width: 0,
  };
  vi.stubGlobal("document", {
    createElement: vi.fn(() => canvas),
  });
  return { canvas, context, drawImage, fillRect, lineTo, moveTo };
}

describe("canvas export rendering", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the interactive paper background out of transparent exports", () => {
    const { canvas, fillRect } = installCanvasDouble();
    const doc = createGridDocument(8, 8);

    expect(
      exportGridAsPng(doc, {
        cellSize: 4,
        showGrid: false,
      }),
    ).toBe("data:image/png;base64,test");
    expect(canvas.width).toBe(32);
    expect(canvas.height).toBe(32);
    expect(fillRect).not.toHaveBeenCalled();
  });

  it("adds a paper background only when the caller explicitly requests it", () => {
    const { fillRect } = installCanvasDouble();
    const doc = createGridDocument(8, 8);

    exportGridAsPng(doc, {
      cellSize: 4,
      gridBackground: "#fffef9",
      showGrid: false,
    });

    expect(fillRect).toHaveBeenCalledOnce();
    expect(fillRect).toHaveBeenCalledWith(0, 0, 32, 32);
  });

  it("clips a local tracing image to the authoritative grid bounds", () => {
    const { context, drawImage, fillRect } = installCanvasDouble();
    const doc = setCell(createGridDocument(8, 8), 0, 0, "#123456");
    const image = {
      naturalHeight: 9,
      naturalWidth: 16,
    } as unknown as CanvasImageSource;

    renderGrid(context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 4,
      referenceFit: "cover",
      referenceImage: image,
      showGrid: false,
    });

    expect(context.rect).toHaveBeenCalledWith(0, 0, 32, 32);
    expect(context.clip).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenCalledOnce();
    expect(drawImage.mock.invocationCallOrder[0]).toBeLessThan(
      fillRect.mock.invocationCallOrder[0],
    );
  });
});

describe("interactive grid visibility", () => {
  it("hides boundaries that would cover high-density cells at fit zoom", () => {
    expect(shouldRenderGridLines(true, 1, 1)).toBe(false);
    expect(shouldRenderGridLines(true, 2, 1.5)).toBe(false);
    expect(shouldRenderGridLines(true, 4, 1)).toBe(false);
    expect(shouldRenderGridLines(true, 6, 1)).toBe(true);
    expect(shouldRenderGridLines(false, 16, 2)).toBe(false);
  });

  it("maps copy density presets to render-only cell intervals", () => {
    expect(gridStepForDensity("off")).toBeNull();
    expect(gridStepForDensity("coarse")).toBe(8);
    expect(gridStepForDensity("medium")).toBe(4);
    expect(gridStepForDensity("cell")).toBe(1);

    expect(shouldRenderGridLines(true, 1, 1, 8)).toBe(true);
    expect(shouldRenderGridLines(true, 1, 1, 4)).toBe(false);
    expect(shouldRenderGridLines(true, 1, 1, 1)).toBe(false);
  });

  it("renders one crisp minor and major strip layer without changing the document", () => {
    const { context, fillRect, moveTo } = installCanvasDouble();
    const doc = createGridDocument(10, 9);
    const before = JSON.stringify(doc);

    renderGrid(context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 4,
      gridStep: 4,
      showGrid: true,
    });

    expect(moveTo).not.toHaveBeenCalled();
    expect(fillRect).toHaveBeenCalledTimes(8);
    expect(fillRect).toHaveBeenCalledWith(16, 0, 1, 36);
    expect(fillRect).toHaveBeenCalledWith(0, 16, 40, 1);
    expect(fillRect).toHaveBeenCalledWith(31, 0, 2, 36);
    expect(fillRect).toHaveBeenCalledWith(0, 31, 40, 2);
    expect(fillRect).toHaveBeenCalledWith(38, 0, 2, 36);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("draws the 8-cell sections once when minor and major cadence match", () => {
    const { context, fillRect } = installCanvasDouble();
    const doc = createGridDocument(16, 16);

    renderGrid(context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 4,
      devicePixelRatio: 1,
      gridStep: 8,
      majorGridStep: 8,
      showGrid: true,
    });

    // One interior vertical, one interior horizontal, and four outer strips.
    expect(fillRect).toHaveBeenCalledTimes(6);
    expect(fillRect).toHaveBeenCalledWith(31, 0, 2, 64);
    expect(fillRect).toHaveBeenCalledWith(0, 31, 64, 2);
  });

  it("snaps strip edges to DPR 1 and DPR 2 physical pixels", () => {
    expect(snapGridStrip(15.5, 1)).toBe(16);
    expect(snapGridStrip(15.5, 2)).toBe(15.5);
    expect(snapGridStrip(15.26, 2)).toBe(15.5);
  });
});
