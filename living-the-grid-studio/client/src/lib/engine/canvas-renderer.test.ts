import { afterEach, describe, expect, it, vi } from "vitest";

import { createGridDocument, setCell, setCells } from "./grid";
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
    fillStyle: "",
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

  it("draws an under reference before project paint", () => {
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
      referenceMode: "under",
      showGrid: false,
    });

    expect(context.rect).toHaveBeenCalledWith(0, 0, 32, 32);
    expect(context.clip).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenCalledOnce();
    expect(drawImage.mock.invocationCallOrder[0]).toBeLessThan(
      fillRect.mock.invocationCallOrder[0],
    );
  });

  it("draws an over reference after paint and before the fine grid", () => {
    const { context, drawImage, fillRect } = installCanvasDouble();
    const doc = setCell(createGridDocument(4, 4), 0, 0, "#123456");
    const image = {
      naturalHeight: 16,
      naturalWidth: 16,
    } as unknown as CanvasImageSource;

    renderGrid(context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 8,
      gridStep: 1,
      majorGridStep: 0,
      referenceImage: image,
      referenceMode: "over",
      showGrid: true,
    });

    const paintedCellIndex = fillRect.mock.calls.findIndex(
      (call) =>
        call[0] === 0 && call[1] === 0 && call[2] === 8 && call[3] === 8,
    );
    const firstGridStripIndex = fillRect.mock.calls.findIndex(
      (call) =>
        call[0] === 8 && call[1] === 0 && call[2] === 1 && call[3] === 32,
    );
    expect(paintedCellIndex).toBeGreaterThanOrEqual(0);
    expect(firstGridStripIndex).toBeGreaterThanOrEqual(0);
    expect(fillRect.mock.invocationCallOrder[paintedCellIndex]).toBeLessThan(
      drawImage.mock.invocationCallOrder[0],
    );
    expect(drawImage.mock.invocationCallOrder[0]).toBeLessThan(
      fillRect.mock.invocationCallOrder[firstGridStripIndex],
    );
  });

  it("clips a split reference and paints its divider before the fine grid", () => {
    const { context, drawImage, fillRect } = installCanvasDouble();
    const doc = setCell(createGridDocument(4, 4), 0, 0, "#123456");
    const image = {
      naturalHeight: 16,
      naturalWidth: 16,
    } as unknown as CanvasImageSource;

    renderGrid(context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 8,
      gridStep: 1,
      majorGridStep: 0,
      referenceImage: image,
      referenceMode: "split",
      showGrid: true,
    });

    const paintedCellIndex = fillRect.mock.calls.findIndex(
      (call) =>
        call[0] === 0 && call[1] === 0 && call[2] === 8 && call[3] === 8,
    );
    const dividerIndex = fillRect.mock.calls.findIndex(
      (call) =>
        call[0] === 14 && call[1] === 0 && call[2] === 4 && call[3] === 32,
    );
    const firstGridStripIndex = fillRect.mock.calls.findIndex(
      (call) =>
        call[0] === 8 && call[1] === 0 && call[2] === 1 && call[3] === 32,
    );
    expect(context.rect).toHaveBeenCalledWith(0, 0, 16, 32);
    expect(paintedCellIndex).toBeGreaterThanOrEqual(0);
    expect(dividerIndex).toBeGreaterThanOrEqual(0);
    expect(firstGridStripIndex).toBeGreaterThanOrEqual(0);
    expect(fillRect.mock.invocationCallOrder[paintedCellIndex]).toBeLessThan(
      drawImage.mock.invocationCallOrder[0],
    );
    expect(drawImage.mock.invocationCallOrder[0]).toBeLessThan(
      fillRect.mock.invocationCallOrder[dividerIndex],
    );
    expect(fillRect.mock.invocationCallOrder[dividerIndex]).toBeLessThan(
      fillRect.mock.invocationCallOrder[firstGridStripIndex],
    );
  });

  it("paints only cells intersecting the visible viewport at edit zoom", () => {
    const { context, fillRect } = installCanvasDouble();
    context.canvas.width = 32;
    context.canvas.height = 32;
    const doc = createGridDocument(16, 16, "Large", "R1C1");

    renderGrid(context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 8,
      devicePixelRatio: 1,
      showGrid: false,
    });

    expect(fillRect).toHaveBeenCalledTimes(16);
  });

  it("rasterizes a canonical document once and draws it as one crisp bitmap", () => {
    const { context, drawImage, fillRect } = installCanvasDouble();
    const createImageData = vi.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }));
    const putImageData = vi.fn();
    const rasterContext = { createImageData, putImageData };
    const rasterCanvas = {
      getContext: vi.fn(() => rasterContext),
      height: 0,
      width: 0,
    };
    (context.canvas as { ownerDocument?: unknown }).ownerDocument = {
      createElement: vi.fn(() => rasterCanvas),
    };
    context.canvas.width = 512;
    context.canvas.height = 512;
    const doc = createGridDocument(256, 256, "Canonical", "R1C1");

    renderGrid(context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 2,
      showGrid: false,
    });

    expect(createImageData).toHaveBeenCalledWith(256, 256);
    expect(putImageData).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenCalledWith(rasterCanvas, 0, 0, 512, 512);
    expect(fillRect).not.toHaveBeenCalled();
    const image = putImageData.mock.calls[0][0] as {
      data: Uint8ClampedArray;
    };
    expect(image.data[(12 * 256 + 10) * 4 + 3]).toBe(255);
  });

  it("updates a cached bitmap from an immutable cell delta", () => {
    const { context, drawImage, fillRect } = installCanvasDouble();
    const baseImage = {
      data: new Uint8ClampedArray(256 * 256 * 4),
    };
    const baseContext = {
      createImageData: vi.fn(() => baseImage),
      putImageData: vi.fn(),
    };
    const incrementalContext = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: "",
      imageSmoothingEnabled: true,
    };
    const baseCanvas = {
      getContext: vi.fn(() => baseContext),
      height: 0,
      width: 0,
    };
    const incrementalCanvas = {
      getContext: vi.fn(() => incrementalContext),
      height: 0,
      width: 0,
    };
    const ownerDocument = {
      createElement: vi
        .fn()
        .mockReturnValueOnce(baseCanvas)
        .mockReturnValueOnce(incrementalCanvas),
    };
    (context.canvas as { ownerDocument?: unknown }).ownerDocument =
      ownerDocument;
    context.canvas.width = 512;
    context.canvas.height = 512;
    const base = createGridDocument(256, 256, "Incremental");

    renderGrid(context as unknown as CanvasRenderingContext2D, base, {
      cellSize: 2,
      showGrid: false,
    });
    const changed = setCells(
      base,
      [
        { x: 8, y: 12 },
        { x: 9, y: 12 },
      ],
      "R1C1",
    );
    renderGrid(context as unknown as CanvasRenderingContext2D, changed, {
      cellSize: 2,
      showGrid: false,
    });

    expect(baseContext.createImageData).toHaveBeenCalledOnce();
    expect(incrementalContext.drawImage).toHaveBeenCalledWith(baseCanvas, 0, 0);
    expect(incrementalContext.clearRect).toHaveBeenCalledTimes(2);
    expect(incrementalContext.fillRect).toHaveBeenCalledWith(8, 12, 1, 1);
    expect(incrementalContext.fillRect).toHaveBeenCalledWith(9, 12, 1, 1);
    expect(drawImage).toHaveBeenNthCalledWith(1, baseCanvas, 0, 0, 512, 512);
    expect(drawImage).toHaveBeenNthCalledWith(
      2,
      incrementalCanvas,
      0,
      0,
      512,
      512,
    );
    expect(fillRect).not.toHaveBeenCalled();
  });

  it("uses the full logical viewport and clears it at a fractional DPR", () => {
    const { context, fillRect } = installCanvasDouble();
    context.canvas.width = 32;
    context.canvas.height = 32;
    const doc = createGridDocument(16, 16, "Large", "R1C1");

    renderGrid(context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 8,
      devicePixelRatio: 0.8,
      showGrid: false,
    });

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 40, 40);
    expect(fillRect).toHaveBeenCalledTimes(25);
  });

  it("limits checkerboard tiles to the visible artboard intersection", () => {
    const { context, fillRect } = installCanvasDouble();
    context.canvas.width = 48;
    context.canvas.height = 48;
    const doc = createGridDocument(256, 256, "Large");

    renderGrid(context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 16,
      checkerboard: "light",
      panX: -12,
      panY: -12,
      showGrid: false,
    });

    expect(fillRect).toHaveBeenCalledTimes(5);
    expect(fillRect).toHaveBeenCalledWith(12, 12, 48, 48);
    expect(fillRect).toHaveBeenCalledWith(24, 12, 24, 12);
    expect(fillRect).toHaveBeenCalledWith(12, 24, 12, 24);
    expect(fillRect).toHaveBeenCalledWith(48, 24, 12, 24);
    expect(fillRect).toHaveBeenCalledWith(24, 48, 24, 12);
  });

  it("keeps warm and neutral transparency backgrounds visually distinct", () => {
    const warm = installCanvasDouble();
    const doc = createGridDocument(8, 8, "Transparent");
    renderGrid(warm.context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 4,
      checkerboard: "warm",
      showGrid: false,
    });
    expect(warm.context.fillStyle).toBe("#eee5d6");

    const neutral = installCanvasDouble();
    renderGrid(neutral.context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 4,
      checkerboard: "light",
      showGrid: false,
    });
    expect(neutral.context.fillStyle).toBe("#dce5e8");
  });

  it("uses a bounded tint instead of a negative highlight stroke on dense cells", () => {
    const { context, fillRect } = installCanvasDouble();
    const doc = setCell(createGridDocument(8, 8), 0, 0, "R1C1");

    renderGrid(context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 2,
      highlightColorId: "R1C1",
      showGrid: false,
    });

    expect(fillRect).toHaveBeenCalledWith(0, 0, 2, 2);
    expect(context).not.toHaveProperty("strokeRect");
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

  it("draws exact Cell view as one uniform mesh without a second cadence", () => {
    const { context, fillRect } = installCanvasDouble();
    const doc = createGridDocument(4, 4);

    renderGrid(context as unknown as CanvasRenderingContext2D, doc, {
      cellSize: 8,
      devicePixelRatio: 1,
      gridStep: 1,
      gridWidth: 1,
      majorGridStep: 0,
      showGrid: true,
    });

    // Three interior strips per axis plus the four outer boundary strips.
    // Every strip is the same one-pixel cadence; no major-grid layer is drawn.
    expect(fillRect).toHaveBeenCalledTimes(10);
    expect(fillRect).toHaveBeenCalledWith(8, 0, 1, 32);
    expect(fillRect).toHaveBeenCalledWith(0, 8, 32, 1);
    expect(fillRect).not.toHaveBeenCalledWith(31, 0, 2, 32);
  });

  it("snaps strip edges at any positive DPR", () => {
    expect(snapGridStrip(15.5, 0.8)).toBe(15);
    expect(snapGridStrip(15.5, 1)).toBe(16);
    expect(snapGridStrip(15.5, 2)).toBe(15.5);
    expect(snapGridStrip(15.26, 2)).toBe(15.5);
  });
});
