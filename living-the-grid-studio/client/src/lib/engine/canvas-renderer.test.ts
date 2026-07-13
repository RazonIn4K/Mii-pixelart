import { afterEach, describe, expect, it, vi } from "vitest";

import { createGridDocument } from "./grid";
import { exportGridAsPng, shouldRenderGridLines } from "./canvas-renderer";

function installCanvasDouble() {
  const fillRect = vi.fn();
  const context = {
    beginPath: vi.fn(),
    canvas: { height: 0, width: 0 },
    clearRect: vi.fn(),
    fillRect,
    restore: vi.fn(),
    save: vi.fn(),
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
  return { canvas, fillRect };
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
});

describe("interactive grid visibility", () => {
  it("hides boundaries that would cover high-density cells at fit zoom", () => {
    expect(shouldRenderGridLines(true, 1, 1)).toBe(false);
    expect(shouldRenderGridLines(true, 2, 1.5)).toBe(false);
    expect(shouldRenderGridLines(true, 4, 1)).toBe(true);
    expect(shouldRenderGridLines(false, 16, 2)).toBe(false);
  });
});
