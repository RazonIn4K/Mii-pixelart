/**
 * CanvasViewer.tsx — Grid canvas with zoom, pan, and interaction
 *
 * DESIGN: one crisp editable grid on an opaque paper sheet. The surrounding
 * workspace stays neutral so it never competes with cell boundaries.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Hand } from "lucide-react";
import type { GridDocument } from "@/lib/engine/grid";
import {
  canvasToCell,
  gridStepForDensity,
  renderGrid,
  shouldRenderGridLines,
  type CanvasBackground,
  type GridDensity,
} from "@/lib/engine/canvas-renderer";
import { bresenhamLine, getCell } from "@/lib/engine/grid";
import { buildPaintCells, type BrushSize } from "@/lib/engine/paint-assists";
import { formatCountLabel } from "@/lib/format-count";

interface CanvasViewerProps {
  doc: GridDocument;
  highlightColorId: string | null;
  gridDensity: GridDensity;
  showLabels: boolean;
  /** Prevent every artwork mutation while retaining zoom, pan, and inspection. */
  readOnly?: boolean;
  /** One-based Copy Guide range drawn over the existing authoritative canvas. */
  guideHighlight?: {
    row: number;
    startColumn: number;
    endColumn: number;
    instruction: string;
  } | null;
  /** Draw local-only horizontal and vertical guides through the center. */
  showCenterGuide?: boolean;
  /** Local display surface behind transparent cells. */
  background?: CanvasBackground;
  /** Browser-local source aligned beneath the one authoritative cell grid. */
  referenceUnderlay?: {
    fit: "contain" | "cover";
    flipped: boolean;
    opacity: number;
    sourceUrl: string;
    visible: boolean;
  } | null;
  /** Exact local brush footprint preview; it never mutates the document. */
  paintPreview?: {
    brushSize: BrushSize;
    horizontalMirror: boolean;
    tool: "eraser" | "pencil";
  } | null;
  onCellClick?: (x: number, y: number, colorId: string | null) => void;
  onCellDrag?: (x: number, y: number, colorId: string | null) => void;
  /**
   * Called with a batch of cells produced by Bresenham line interpolation
   * between the previous and current sample positions. Use this instead of
   * onCellDrag when the receiver supports a batched immutable paint —
   * eliminates per-cell React re-renders mid-stroke and fixes the
   * "fast pointer leaves gaps" bug. If both are provided, this takes
   * precedence; onCellDrag is only the fallback for the first cell.
   */
  onCellDragSegment?: (cells: { x: number; y: number }[]) => void;
  onCellHover?: (x: number, y: number, colorId: string | null) => void;
  /**
   * Stroke lifecycle. Studio.tsx wires beginStroke() to pointer-down and
   * endStroke() to pointer-up/cancel so the entire drag becomes ONE undo entry
   * rather than one entry per painted cell.
   */
  onStrokeBegin?: () => void;
  /** Roll back an in-flight stroke when navigation takes over. */
  onStrokeCancel?: () => void;
  onStrokeEnd?: () => void;
}

interface ClientPoint {
  clientX: number;
  clientY: number;
}

type PointerGesture = "draw" | "pan" | "pinch" | "tap";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const TAP_MOVE_TOLERANCE = 5;
const TOUCH_TAP_MOVE_TOLERANCE = 14;

export default function CanvasViewer({
  doc,
  highlightColorId,
  gridDensity,
  showLabels,
  readOnly = false,
  guideHighlight = null,
  showCenterGuide = false,
  background = "light",
  referenceUnderlay = null,
  paintPreview = null,
  onCellClick,
  onCellDrag,
  onCellDragSegment,
  onCellHover,
  onStrokeBegin,
  onStrokeCancel,
  onStrokeEnd,
}: CanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const pointerGestureRef = useRef<PointerGesture | null>(null);
  const pointerStartRef = useRef<ClientPoint | null>(null);
  const pointerMovedRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const touchPointsRef = useRef(new Map<number, ClientPoint>());
  const pinchStartRef = useRef<{
    distance: number;
    pointerIds: [number, number];
    world: { x: number; y: number };
    zoom: number;
  } | null>(null);
  // Last sample position during a drag, used to Bresenham-interpolate the
  // gap to the current position so fast strokes don't skip cells.
  const lastDragCellRef = useRef<{ x: number; y: number } | null>(null);
  const instructionsId = useId();
  const statusId = useId();
  const zoomHintId = useId();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isKeyboardFocused, setIsKeyboardFocused] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [keyboardCell, setKeyboardCell] = useState({
    x: Math.floor(doc.width / 2),
    y: Math.floor(doc.height / 2),
  });
  const [statusMessage, setStatusMessage] = useState(
    `Keyboard cursor at column ${Math.floor(doc.width / 2) + 1}, row ${Math.floor(doc.height / 2) + 1}.`,
  );
  // Hover cell coordinates for the on-canvas readout. Null when the
  // pointer is outside the grid.
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [referenceImage, setReferenceImage] = useState<HTMLImageElement | null>(
    null,
  );

  useEffect(() => {
    if (!referenceUnderlay?.sourceUrl || !referenceUnderlay.visible) {
      setReferenceImage(null);
      return;
    }
    let active = true;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (active) setReferenceImage(image);
    };
    image.onerror = () => {
      if (active) setReferenceImage(null);
    };
    image.src = referenceUnderlay.sourceUrl;
    return () => {
      active = false;
    };
  }, [referenceUnderlay?.sourceUrl, referenceUnderlay?.visible]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setViewportSize({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const nextCell = {
      x: Math.floor(doc.width / 2),
      y: Math.floor(doc.height / 2),
    };
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setKeyboardCell(nextCell);
    setStatusMessage(
      `Keyboard cursor at column ${nextCell.x + 1}, row ${nextCell.y + 1}.`,
    );
  }, [doc.width, doc.height]);

  useEffect(() => {
    if (!guideHighlight) return;
    const nextCell = {
      x: Math.max(0, Math.min(doc.width - 1, guideHighlight.startColumn - 1)),
      y: Math.max(0, Math.min(doc.height - 1, guideHighlight.row - 1)),
    };
    setKeyboardCell(nextCell);
    setHoverCell(nextCell);
    setStatusMessage(guideHighlight.instruction);
  }, [doc.height, doc.width, guideHighlight]);

  const getRenderMetrics = useCallback(
    (viewZoom = zoom, viewPan = pan) => {
      const width =
        viewportSize.width || containerRef.current?.clientWidth || 800;
      const height =
        viewportSize.height || containerRef.current?.clientHeight || 600;
      // Reserve real chrome space above and below the artboard. Controls and the
      // coordinate HUD stay visible without intercepting the first/last rows.
      // Tiny screens retain a compact ruler gutter and at least four-pixel cells.
      const horizontalPadding = width <= 360 ? 24 : 40;
      const topInset = width <= 360 ? 68 : 60;
      const bottomInset = width <= 360 ? 56 : 52;
      const availableWidth = Math.max(1, width - horizontalPadding);
      const availableHeight = Math.max(1, height - topInset - bottomInset);
      const fitCellSize = Math.min(
        availableWidth / doc.width,
        availableHeight / doc.height,
        32,
      );
      const cellSize = Math.max(1, Math.floor(fitCellSize));
      // Keep every visible cell an integer number of CSS pixels. Fractional cell
      // widths make alternating squares look wider/narrower and can recreate a
      // soft double-grid effect even when line strips are physically snapped.
      const scaledSize = Math.max(1, Math.round(cellSize * viewZoom));
      const renderZoom = scaledSize / cellSize;
      const gridWidth = doc.width * scaledSize;
      const gridHeight = doc.height * scaledSize;

      return {
        cellSize,
        height,
        panX: Math.round((width - gridWidth) / 2 + viewPan.x),
        panY: Math.round(
          topInset + (availableHeight - gridHeight) / 2 + viewPan.y,
        ),
        renderZoom,
        scaledSize,
        width,
      };
    },
    [doc.width, doc.height, pan, viewportSize, zoom],
  );

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const metrics = getRenderMetrics();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(metrics.width * dpr));
    canvas.height = Math.max(1, Math.floor(metrics.height * dpr));
    canvas.style.width = `${metrics.width}px`;
    canvas.style.height = `${metrics.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const requestedGridStep = gridStepForDensity(gridDensity);
    const requestedGridVisible =
      requestedGridStep !== null &&
      shouldRenderGridLines(
        true,
        metrics.cellSize,
        metrics.renderZoom,
        requestedGridStep,
      );
    // A fitted 64×64 canvas can make one-pixel cell lines consume a quarter
    // of every cell on a phone. Keep clean eight-cell sections at that scale;
    // Cell view reveals the complete per-cell mesh for exact copying.
    const renderGridStep =
      requestedGridStep === 1 && !requestedGridVisible ? 8 : requestedGridStep;
    const renderGridLines =
      renderGridStep !== null &&
      shouldRenderGridLines(
        true,
        metrics.cellSize,
        metrics.renderZoom,
        renderGridStep,
      );

    renderGrid(ctx, doc, {
      cellSize: metrics.cellSize,
      zoom: metrics.renderZoom,
      panX: metrics.panX,
      panY: metrics.panY,
      showGrid: renderGridLines,
      gridStep: renderGridStep ?? 1,
      showLabels,
      highlightColorId,
      checkerboard: background === "paper" ? "none" : background,
      devicePixelRatio: dpr,
      gridBackground: background === "paper" ? "#fffaf0" : null,
      referenceImage,
      referenceOpacity: (referenceUnderlay?.opacity ?? 45) / 100,
      referenceFlipped: referenceUnderlay?.flipped ?? false,
      referenceFit: referenceUnderlay?.fit ?? "contain",
      // Keep the only visible cell grid above the 3:1 non-text contrast target
      // and at least one CSS pixel wide, including fitted mobile canvases.
      gridColor:
        background === "dark"
          ? "rgba(231, 240, 236, 0.48)"
          : "rgba(64, 83, 92, 0.42)",
      gridWidth: 1,
      majorGridColor: background === "dark" ? "#f7c75f" : "#29485a",
      majorGridStep: 8,
      majorGridWidth: 1.5,
    });

    // Coordinate rulers share the same metrics as the authoritative canvas.
    // They are deliberately drawn outside the grid so they cannot look like a
    // second set of cells or intercept paint input.
    const scaledSize = metrics.scaledSize;
    if (scaledSize >= 4) {
      ctx.save();
      ctx.fillStyle = "#17384a";
      ctx.font = `700 10px ui-monospace, "SFMono-Regular", Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (let x = 0; x < doc.width; x += 8) {
        ctx.fillText(
          String(x + 1),
          metrics.panX + (x + 0.5) * scaledSize,
          metrics.panY - 5,
        );
      }
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let y = 0; y < doc.height; y += 8) {
        ctx.fillText(
          String(y + 1),
          metrics.panX - 5,
          metrics.panY + (y + 0.5) * scaledSize,
        );
      }

      ctx.restore();
    }

    if (guideHighlight) {
      const scaledSize = metrics.scaledSize;
      const startColumn = Math.max(
        1,
        Math.min(doc.width, guideHighlight.startColumn),
      );
      const endColumn = Math.max(
        startColumn,
        Math.min(doc.width, guideHighlight.endColumn),
      );
      const row = Math.max(1, Math.min(doc.height, guideHighlight.row));
      const x = metrics.panX + (startColumn - 1) * scaledSize;
      const y = metrics.panY + (row - 1) * scaledSize;
      const width = (endColumn - startColumn + 1) * scaledSize;

      ctx.save();
      ctx.fillStyle = "rgba(255, 178, 0, 0.24)";
      ctx.fillRect(x, y, width, scaledSize);
      ctx.strokeStyle = "#c2410c";
      ctx.lineWidth = Math.max(2, Math.min(4, scaledSize / 3));
      ctx.setLineDash([
        Math.max(3, scaledSize / 2),
        Math.max(2, scaledSize / 3),
      ]);
      ctx.strokeRect(x, y, width, scaledSize);
      ctx.restore();
    }

    if (showCenterGuide) {
      const scaledSize = metrics.scaledSize;
      const centerX = metrics.panX + (doc.width * scaledSize) / 2;
      const centerY = metrics.panY + (doc.height * scaledSize) / 2;
      const left = metrics.panX;
      const right = metrics.panX + doc.width * scaledSize;
      const top = metrics.panY;
      const bottom = metrics.panY + doc.height * scaledSize;

      ctx.save();
      ctx.fillStyle = "#b84426";
      ctx.fillRect(Math.round(centerX) - 1, top, 2, bottom - top);
      ctx.fillRect(left, Math.round(centerY) - 1, right - left, 2);
      ctx.restore();
    }
  }, [
    doc,
    zoom,
    gridDensity,
    showLabels,
    showCenterGuide,
    background,
    highlightColorId,
    guideHighlight,
    getRenderMetrics,
    readOnly,
    referenceImage,
    referenceUnderlay?.fit,
    referenceUnderlay?.flipped,
    referenceUnderlay?.opacity,
  ]);

  const zoomOut = useCallback(() => {
    setZoom((current) => Math.max(MIN_ZOOM, current * 0.8));
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((current) => Math.min(MAX_ZOOM, current * 1.25));
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setStatusMessage("Canvas view reset to fit.");
  }, []);

  const editView = useCallback(() => {
    const metrics = getRenderMetrics();
    const targetCellSize = 14;
    setZoom(
      Math.max(
        1,
        Math.min(MAX_ZOOM, targetCellSize / Math.max(1, metrics.cellSize)),
      ),
    );
    setPan({ x: 0, y: 0 });
    setStatusMessage(
      readOnly
        ? "Canvas set to Cell view for precise copying."
        : "Canvas set to Cell view for precise drawing.",
    );
  }, [getRenderMetrics, readOnly]);

  // Mouse/trackpad wheel zoom. Touch users can use the explicit zoom buttons.
  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    setZoom((current) =>
      Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current * delta)),
    );
  }, []);

  const getEventCell = useCallback(
    (point: ClientPoint) => {
      if (!canvasRef.current) return null;
      const rect = canvasRef.current.getBoundingClientRect();
      const metrics = getRenderMetrics();
      const cell = canvasToCell(
        point.clientX - rect.left,
        point.clientY - rect.top,
        {
          cellSize: metrics.cellSize,
          zoom: metrics.renderZoom,
          panX: metrics.panX,
          panY: metrics.panY,
        },
      );
      if (!cell || cell.x >= doc.width || cell.y >= doc.height) return null;
      return {
        ...cell,
        colorId: getCell(doc, cell.x, cell.y),
      };
    },
    [getRenderMetrics, zoom, doc],
  );

  const capturePointer = useCallback(
    (canvas: HTMLCanvasElement, pointerId: number) => {
      try {
        canvas.setPointerCapture(pointerId);
      } catch {
        // Synthetic test events and older embedded browsers may not expose an
        // active native pointer. The interaction still works inside the canvas.
      }
    },
    [],
  );

  const createPinchStart = useCallback(
    (
      canvas: HTMLCanvasElement,
      entries: [[number, ClientPoint], [number, ClientPoint]],
      viewZoom: number,
      viewPan: { x: number; y: number },
    ) => {
      const [[firstId, first], [secondId, second]] = entries;
      const midpoint = {
        clientX: (first.clientX + second.clientX) / 2,
        clientY: (first.clientY + second.clientY) / 2,
      };
      const rect = canvas.getBoundingClientRect();
      const metrics = getRenderMetrics(viewZoom, viewPan);
      return {
        distance: Math.max(
          1,
          Math.hypot(
            second.clientX - first.clientX,
            second.clientY - first.clientY,
          ),
        ),
        pointerIds: [firstId, secondId] as [number, number],
        world: {
          x: (midpoint.clientX - rect.left - metrics.panX) / metrics.scaledSize,
          y: (midpoint.clientY - rect.top - metrics.panY) / metrics.scaledSize,
        },
        zoom: viewZoom,
      };
    },
    [getRenderMetrics],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === "touch") {
        touchPointsRef.current.set(event.pointerId, {
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }

      if (activePointerIdRef.current !== null) {
        const touches = Array.from(touchPointsRef.current.entries());
        if (event.pointerType !== "touch" || touches.length < 2) return;

        event.preventDefault();
        capturePointer(event.currentTarget, event.pointerId);
        if (pointerGestureRef.current === "pinch") {
          pointerMovedRef.current = true;
          return;
        }
        if (pointerGestureRef.current === "draw") {
          onStrokeCancel?.();
        }
        pinchStartRef.current = createPinchStart(
          event.currentTarget,
          touches.slice(0, 2) as [[number, ClientPoint], [number, ClientPoint]],
          zoom,
          pan,
        );
        pointerGestureRef.current = "pinch";
        pointerMovedRef.current = true;
        lastDragCellRef.current = null;
        setIsPanning(true);
        setStatusMessage("Two-finger pan and zoom enabled; drawing paused.");
        return;
      }
      if (event.pointerType !== "mouse" && !event.isPrimary) return;

      const wantsPan =
        panMode || event.button === 1 || (event.button === 0 && event.altKey);
      if (wantsPan && (event.button === 0 || event.button === 1)) {
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        capturePointer(event.currentTarget, event.pointerId);
        activePointerIdRef.current = event.pointerId;
        pointerGestureRef.current = "pan";
        pointerStartRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
        };
        pointerMovedRef.current = false;
        panStartRef.current = {
          x: event.clientX - pan.x,
          y: event.clientY - pan.y,
        };
        setIsPanning(true);
        setStatusMessage("Panning canvas.");
        return;
      }

      if (event.button !== 0) return;
      const cell = getEventCell(event);
      if (!cell) return;

      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      capturePointer(event.currentTarget, event.pointerId);
      activePointerIdRef.current = event.pointerId;
      pointerStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      pointerMovedRef.current = false;
      setKeyboardCell({ x: cell.x, y: cell.y });

      if (!readOnly && (onCellDrag || onCellDragSegment)) {
        pointerGestureRef.current = "draw";
        setIsPanning(false);
        // Begin the stroke transaction so all paints below collapse into one
        // undo entry. Stroke lifecycle is owned by the parent.
        onStrokeBegin?.();
        lastDragCellRef.current = { x: cell.x, y: cell.y };
        if (onCellDragSegment) {
          onCellDragSegment([{ x: cell.x, y: cell.y }]);
        } else {
          onCellDrag?.(cell.x, cell.y, cell.colorId);
        }
        setStatusMessage(
          `Drawing from column ${cell.x + 1}, row ${cell.y + 1}.`,
        );
      } else {
        pointerGestureRef.current = "tap";
        setIsPanning(false);
        if (readOnly) {
          setStatusMessage(
            `Inspecting column ${cell.x + 1}, row ${cell.y + 1}. Copy Guide is read-only.`,
          );
        }
      }
    },
    [
      capturePointer,
      createPinchStart,
      getEventCell,
      onCellDrag,
      onCellDragSegment,
      onStrokeBegin,
      onStrokeCancel,
      onStrokeEnd,
      pan,
      panMode,
      readOnly,
      zoom,
    ],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (
        event.pointerType === "touch" &&
        touchPointsRef.current.has(event.pointerId)
      ) {
        touchPointsRef.current.set(event.pointerId, {
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }

      if (pointerGestureRef.current === "pinch") {
        event.preventDefault();
        const start = pinchStartRef.current;
        const first = start
          ? touchPointsRef.current.get(start.pointerIds[0])
          : undefined;
        const second = start
          ? touchPointsRef.current.get(start.pointerIds[1])
          : undefined;
        if (first && second && start) {
          const distance = Math.max(
            1,
            Math.hypot(
              second.clientX - first.clientX,
              second.clientY - first.clientY,
            ),
          );
          const midpoint = {
            clientX: (first.clientX + second.clientX) / 2,
            clientY: (first.clientY + second.clientY) / 2,
          };
          const nextZoom = Math.max(
            MIN_ZOOM,
            Math.min(MAX_ZOOM, start.zoom * (distance / start.distance)),
          );
          const canvasRect = event.currentTarget.getBoundingClientRect();
          const targetMetrics = getRenderMetrics(nextZoom, { x: 0, y: 0 });
          setZoom(nextZoom);
          setPan({
            x:
              midpoint.clientX -
              canvasRect.left -
              start.world.x * targetMetrics.scaledSize -
              targetMetrics.panX,
            y:
              midpoint.clientY -
              canvasRect.top -
              start.world.y * targetMetrics.scaledSize -
              targetMetrics.panY,
          });
        }
        return;
      }

      if (activePointerIdRef.current === event.pointerId) {
        event.preventDefault();
        const start = pointerStartRef.current;
        if (
          start &&
          Math.hypot(
            event.clientX - start.clientX,
            event.clientY - start.clientY,
          ) >=
            (event.pointerType === "touch"
              ? TOUCH_TAP_MOVE_TOLERANCE
              : TAP_MOVE_TOLERANCE)
        ) {
          pointerMovedRef.current = true;
        }

        if (pointerGestureRef.current === "pan") {
          setPan({
            x: event.clientX - panStartRef.current.x,
            y: event.clientY - panStartRef.current.y,
          });
          return;
        }

        if (
          pointerGestureRef.current === "draw" &&
          (onCellDrag || onCellDragSegment)
        ) {
          const cell = getEventCell(event);
          if (!cell) {
            // Do not bridge a stroke across the non-grid workspace when the
            // pointer leaves the artboard and later re-enters it.
            lastDragCellRef.current = null;
            return;
          }
          const previous = lastDragCellRef.current;
          // Bresenham-interpolate between the previous and current sample so
          // fast mouse, pen, and touch drags never leave gaps.
          const segment =
            previous && (previous.x !== cell.x || previous.y !== cell.y)
              ? bresenhamLine(previous.x, previous.y, cell.x, cell.y).slice(1)
              : previous
                ? []
                : [{ x: cell.x, y: cell.y }];
          if (segment.length > 0) {
            if (onCellDragSegment) {
              onCellDragSegment(segment);
            } else if (onCellDrag) {
              for (const point of segment) {
                onCellDrag(point.x, point.y, null);
              }
            }
          }
          lastDragCellRef.current = { x: cell.x, y: cell.y };
          setKeyboardCell({ x: cell.x, y: cell.y });
          return;
        }
      }

      // Touch has no useful hover state. Mouse and pen hover update the HUD.
      if (event.pointerType === "touch") return;
      const cell = getEventCell(event);
      if (cell) {
        if (!hoverCell || hoverCell.x !== cell.x || hoverCell.y !== cell.y) {
          setHoverCell({ x: cell.x, y: cell.y });
        }
        onCellHover?.(cell.x, cell.y, cell.colorId);
      } else if (hoverCell) {
        setHoverCell(null);
      }
    },
    [
      getEventCell,
      getRenderMetrics,
      hoverCell,
      onCellDrag,
      onCellDragSegment,
      onCellHover,
    ],
  );

  const finishPointer = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>, canceled: boolean) => {
      if (event.pointerType === "touch") {
        touchPointsRef.current.delete(event.pointerId);
      }

      if (pointerGestureRef.current === "pinch") {
        const start = pinchStartRef.current;
        if (
          touchPointsRef.current.size >= 2 &&
          start?.pointerIds.includes(event.pointerId)
        ) {
          const remaining = Array.from(touchPointsRef.current.entries()).slice(
            0,
            2,
          ) as [[number, ClientPoint], [number, ClientPoint]];
          pinchStartRef.current = createPinchStart(
            event.currentTarget,
            remaining,
            zoom,
            pan,
          );
          activePointerIdRef.current = remaining[0][0];
        }
        if (touchPointsRef.current.size < 2) {
          const remaining = touchPointsRef.current.keys().next();
          activePointerIdRef.current = remaining.done ? null : remaining.value;
          pointerGestureRef.current = remaining.done ? null : "tap";
          pointerMovedRef.current = true;
          pinchStartRef.current = null;
          setIsPanning(false);
          setStatusMessage(
            "Two-finger gesture complete; drawing remains safe.",
          );
        }
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Capture can already be gone when the browser ends a gesture.
        }
        return;
      }

      if (activePointerIdRef.current !== event.pointerId) return;

      const gesture = pointerGestureRef.current;
      const cell = canceled ? null : getEventCell(event);
      const shouldActivateCell =
        gesture === "tap" && !canceled && !pointerMovedRef.current && cell;

      // Clear the active pointer before releasing capture. lostpointercapture
      // may fire synchronously and must not finish the stroke twice.
      activePointerIdRef.current = null;
      pointerGestureRef.current = null;
      pointerStartRef.current = null;
      pointerMovedRef.current = false;
      lastDragCellRef.current = null;

      if (gesture === "draw") {
        // A canceled pointer still commits the pixels already drawn as exactly
        // one undoable stroke instead of leaving the transaction open.
        onStrokeEnd?.();
      }
      setIsPanning(false);

      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Capture may already have been released by the browser.
      }

      if (shouldActivateCell) {
        setKeyboardCell({ x: cell.x, y: cell.y });
        if (readOnly) {
          setStatusMessage(
            `Inspected column ${cell.x + 1}, row ${cell.y + 1}. Copy Guide is read-only.`,
          );
        } else {
          onCellClick?.(cell.x, cell.y, cell.colorId);
          setStatusMessage(
            `Activated column ${cell.x + 1}, row ${cell.y + 1}.`,
          );
        }
      } else if (gesture === "draw") {
        setStatusMessage(
          canceled ? "Stroke ended safely." : "Stroke complete.",
        );
      } else if (gesture === "pan") {
        setStatusMessage(canceled ? "Pan ended." : "Canvas panned.");
      }
    },
    [
      createPinchStart,
      getEventCell,
      onCellClick,
      onStrokeEnd,
      pan,
      readOnly,
      zoom,
    ],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      finishPointer(event, false);
    },
    [finishPointer],
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      finishPointer(event, true);
    },
    [finishPointer],
  );

  const handlePointerLeave = useCallback(() => {
    if (activePointerIdRef.current !== null) return;
    setHoverCell(null);
  }, []);

  const moveKeyboardCursor = useCallback(
    (deltaX: number, deltaY: number) => {
      const next = {
        x: Math.max(0, Math.min(doc.width - 1, keyboardCell.x + deltaX)),
        y: Math.max(0, Math.min(doc.height - 1, keyboardCell.y + deltaY)),
      };
      setKeyboardCell(next);
      setHoverCell(next);
      onCellHover?.(next.x, next.y, getCell(doc, next.x, next.y));
      setStatusMessage(
        `Keyboard cursor at column ${next.x + 1}, row ${next.y + 1}.`,
      );
    },
    [doc, keyboardCell, onCellHover],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLCanvasElement>) => {
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          moveKeyboardCursor(-1, 0);
          return;
        case "ArrowRight":
          event.preventDefault();
          moveKeyboardCursor(1, 0);
          return;
        case "ArrowUp":
          event.preventDefault();
          moveKeyboardCursor(0, -1);
          return;
        case "ArrowDown":
          event.preventDefault();
          moveKeyboardCursor(0, 1);
          return;
        case "Enter":
        case " ": {
          event.preventDefault();
          if (readOnly) {
            setStatusMessage(
              `Inspected column ${keyboardCell.x + 1}, row ${keyboardCell.y + 1}. Copy Guide is read-only.`,
            );
            return;
          }
          const colorId = getCell(doc, keyboardCell.x, keyboardCell.y);
          onCellClick?.(keyboardCell.x, keyboardCell.y, colorId);
          setStatusMessage(
            `Activated column ${keyboardCell.x + 1}, row ${keyboardCell.y + 1}.`,
          );
          return;
        }
        case "+":
        case "=":
          event.preventDefault();
          zoomIn();
          setStatusMessage("Zoomed in.");
          return;
        case "-":
        case "_":
          event.preventDefault();
          zoomOut();
          setStatusMessage("Zoomed out.");
          return;
        case "0":
          event.preventDefault();
          resetView();
          return;
        case "2":
          event.preventDefault();
          editView();
          return;
        case "h":
        case "H":
          event.preventDefault();
          setPanMode((current) => !current);
          setStatusMessage(
            panMode
              ? readOnly
                ? "Cell inspection enabled."
                : "Drawing interaction enabled."
              : "Hand tool enabled.",
          );
          return;
        default:
          return;
      }
    },
    [
      doc,
      editView,
      keyboardCell,
      moveKeyboardCursor,
      onCellClick,
      panMode,
      readOnly,
      resetView,
      zoomIn,
      zoomOut,
    ],
  );

  const canvasCursor = panMode
    ? isPanning
      ? "cursor-grabbing"
      : "cursor-grab"
    : !readOnly && (onCellDrag || onCellDragSegment)
      ? "cursor-crosshair"
      : "cursor-cell";
  const currentRenderMetrics = getRenderMetrics();
  const gridStep = gridStepForDensity(gridDensity);
  const gridLinesVisible =
    gridStep !== null &&
    shouldRenderGridLines(
      true,
      currentRenderMetrics.cellSize,
      currentRenderMetrics.renderZoom,
      gridStep,
    );
  const gridLineState =
    gridDensity === "off"
      ? "hidden"
      : gridLinesVisible
        ? "visible"
        : "suppressed";
  const activeCell = hoverCell ?? (isKeyboardFocused ? keyboardCell : null);
  const quadrant = activeCell
    ? `${activeCell.y < doc.height / 2 ? "N" : "S"}${
        activeCell.x < doc.width / 2 ? "W" : "E"
      }`
    : null;
  const hoverFootprint =
    hoverCell && paintPreview && !readOnly
      ? buildPaintCells(
          [hoverCell],
          paintPreview.brushSize,
          doc,
          paintPreview.horizontalMirror,
        )
      : [];

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-[1.4rem] border-2 border-[#26485a] bg-[#f6d67a] bg-[radial-gradient(circle_at_1px_1px,rgba(38,72,90,0.14)_1px,transparent_0)] bg-[size:18px_18px] shadow-[inset_0_0_0_5px_rgba(255,250,232,0.72),0_8px_24px_rgba(38,72,90,0.13)]"
      data-testid="canvas-workspace"
    >
      <p id={instructionsId} className="sr-only">
        {readOnly
          ? "Copy Guide is read-only. Use the arrow keys to inspect exact cells. Choose the Hand button or press H, then drag to pan. Pinch with two fingers to pan and zoom safely. Use plus and minus to zoom, zero to fit the canvas, and 2 for Cell view."
          : "Use one pointer to draw and two fingers to pan or zoom without painting. Choose the Hand button or press H, then drag to pan. With the canvas focused, use the arrow keys to move the keyboard cursor, Enter or Space to activate a cell, plus and minus to zoom, and zero to fit the whole canvas. Press 2 for Cell view. Press M to mirror pencil and eraser strokes left to right, and G to toggle the horizontal and vertical center guides."}
      </p>
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>

      {readOnly ? (
        <div className="pointer-events-none absolute left-3 top-[4.25rem] z-10 rounded-full border border-orange-700/30 bg-orange-50/95 px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.14em] text-orange-900 shadow-sm backdrop-blur-sm sm:top-3">
          Copy mode · read only
        </div>
      ) : null}

      {/* Interaction and zoom controls */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border-2 border-[#26485a]/20 bg-[#fffaf0]/95 p-1 shadow-[0_3px_0_rgba(38,72,90,0.18)] backdrop-blur-sm">
        <button
          type="button"
          onClick={() => {
            setPanMode((current) => !current);
            setStatusMessage(
              panMode
                ? readOnly
                  ? "Cell inspection enabled."
                  : "Drawing interaction enabled."
                : "Hand tool enabled.",
            );
          }}
          className={`flex size-11 items-center justify-center rounded-lg transition-colors sm:size-9 ${
            panMode
              ? "bg-[#24786f] text-white"
              : "text-[#26485a] hover:bg-[#e8f5ef]"
          }`}
          aria-label={
            panMode ? "Exit hand tool" : "Use hand tool to pan canvas"
          }
          aria-pressed={panMode}
          title={panMode ? "Exit hand tool (H)" : "Hand tool (H)"}
        >
          <Hand className="size-4" />
        </button>
        <span className="h-6 w-px bg-border" aria-hidden="true" />
        <button
          type="button"
          onClick={zoomOut}
          className="flex size-11 items-center justify-center rounded-lg font-mono text-sm font-black text-[#26485a] hover:bg-[#fff0c2] sm:size-9"
          aria-label="Zoom out"
          title="Zoom out (-)"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          className="flex h-11 min-w-12 items-center justify-center rounded-lg px-1 font-mono text-xs font-bold text-[#26485a] hover:bg-[#fff0c2] sm:h-9"
          aria-label="Reset zoom · Fit"
          title="Reset view (0)"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={editView}
          className="flex h-11 min-w-16 items-center justify-center rounded-lg bg-[#b84426] px-2 text-xs font-black text-white shadow-sm hover:bg-[#96381e] sm:h-9"
          aria-label={`${readOnly ? "Zoom to copy pixels" : "Zoom to edit pixels"} · Cell view`}
          title={readOnly ? "Copy zoom (2)" : "Edit zoom (2)"}
        >
          Cell view
        </button>
        <button
          type="button"
          onClick={zoomIn}
          className="flex size-11 items-center justify-center rounded-lg font-mono text-sm font-black text-[#26485a] hover:bg-[#fff0c2] sm:size-9"
          aria-label="Zoom in"
          title="Zoom in (+)"
        >
          +
        </button>
      </div>

      {/* Grid info + live coordinate readout */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-xl border-2 border-[#26485a]/20 bg-[#fffaf0]/95 px-3 py-1.5 shadow-sm backdrop-blur-sm">
        <span className="text-xs font-mono font-bold text-[#526975]">
          {doc.width}×{doc.height} ·{" "}
          {formatCountLabel(doc.usedColors.length, "color")}
          {activeCell && (
            <span className="text-[#17384a]">
              {" · "}C {activeCell.x + 1} · R {activeCell.y + 1}
              {quadrant ? ` · ${quadrant}` : ""}
            </span>
          )}
        </span>
        {gridLineState === "suppressed" ? (
          <span
            id={zoomHintId}
            className="mt-0.5 block text-[0.68rem] font-semibold text-foreground"
            data-testid="grid-zoom-hint"
            role="status"
            aria-live="polite"
          >
            Dense preview · choose Cell view to see cell lines
          </span>
        ) : null}
      </div>

      <canvas
        ref={canvasRef}
        className={`h-full w-full touch-none select-none pixel-canvas outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${canvasCursor}`}
        role="application"
        aria-label={`${readOnly ? "Read-only Copy Guide" : "Editable"} ${doc.width} by ${doc.height} pixel grid`}
        aria-roledescription={
          readOnly ? "copy guide pixel art canvas" : "pixel art canvas"
        }
        aria-describedby={`${instructionsId} ${statusId}${
          gridLineState === "suppressed" ? ` ${zoomHintId}` : ""
        }`}
        aria-keyshortcuts={
          readOnly
            ? "ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 2 H"
            : "ArrowLeft ArrowRight ArrowUp ArrowDown Enter Space + - 0 2 H M G"
        }
        data-grid-width={doc.width}
        data-grid-height={doc.height}
        data-grid-origin-x={currentRenderMetrics.panX}
        data-grid-origin-y={currentRenderMetrics.panY}
        data-cell-size={currentRenderMetrics.scaledSize}
        data-grid-density={gridDensity}
        data-grid-lines={gridLineState}
        data-grid-renderer="crisp-layered"
        data-canvas-background={background}
        data-reference-underlay={referenceImage ? "visible" : "hidden"}
        data-brush-preview={paintPreview ? paintPreview.brushSize : "none"}
        data-document-modified-at={doc.meta.modifiedAt}
        data-center-guide={showCenterGuide ? "visible" : "hidden"}
        data-canvas-mode={readOnly ? "copy" : "edit"}
        data-guide-row={guideHighlight?.row}
        data-guide-start-column={guideHighlight?.startColumn}
        data-guide-end-column={guideHighlight?.endColumn}
        tabIndex={0}
        onBlur={() => {
          setIsKeyboardFocused(false);
          setHoverCell(null);
        }}
        onFocus={() => setIsKeyboardFocused(true)}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(event) => event.preventDefault()}
      />
      <svg
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${currentRenderMetrics.width} ${currentRenderMetrics.height}`}
        preserveAspectRatio="none"
        data-testid="canvas-pointer-overlay"
      >
        {hoverCell && currentRenderMetrics.scaledSize >= 4 ? (
          <>
            <rect
              x={
                currentRenderMetrics.panX +
                hoverCell.x * currentRenderMetrics.scaledSize
              }
              y={currentRenderMetrics.panY - 4}
              width={currentRenderMetrics.scaledSize}
              height={4}
              fill="#b84426"
            />
            <rect
              x={currentRenderMetrics.panX - 4}
              y={
                currentRenderMetrics.panY +
                hoverCell.y * currentRenderMetrics.scaledSize
              }
              width={4}
              height={currentRenderMetrics.scaledSize}
              fill="#b84426"
            />
          </>
        ) : null}
        {hoverFootprint.map((cell) => (
          <rect
            key={`${cell.x}:${cell.y}`}
            x={
              currentRenderMetrics.panX +
              cell.x * currentRenderMetrics.scaledSize
            }
            y={
              currentRenderMetrics.panY +
              cell.y * currentRenderMetrics.scaledSize
            }
            width={currentRenderMetrics.scaledSize}
            height={currentRenderMetrics.scaledSize}
            fill={
              paintPreview?.tool === "eraser"
                ? "rgba(255, 250, 240, 0.6)"
                : "rgba(239, 107, 59, 0.26)"
            }
            stroke={paintPreview?.tool === "eraser" ? "#526975" : "#b84426"}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {isKeyboardFocused ? (
          <rect
            x={
              currentRenderMetrics.panX +
              keyboardCell.x * currentRenderMetrics.scaledSize +
              1
            }
            y={
              currentRenderMetrics.panY +
              keyboardCell.y * currentRenderMetrics.scaledSize +
              1
            }
            width={Math.max(1, currentRenderMetrics.scaledSize - 2)}
            height={Math.max(1, currentRenderMetrics.scaledSize - 2)}
            fill="none"
            stroke="#b91c1c"
            strokeWidth={Math.max(
              2,
              Math.min(4, currentRenderMetrics.scaledSize / 3),
            )}
            strokeDasharray={`${Math.max(2, currentRenderMetrics.scaledSize / 3)} ${Math.max(2, currentRenderMetrics.scaledSize / 4)}`}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
    </div>
  );
}
