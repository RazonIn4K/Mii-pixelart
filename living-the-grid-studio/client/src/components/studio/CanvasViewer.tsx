/**
 * CanvasViewer.tsx — Grid canvas with zoom, pan, and interaction
 *
 * DESIGN: "Paper Studio" — graph-paper background, pale blue grid lines,
 * red accent for highlights. The canvas is the hero of the workspace.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Hand } from "lucide-react";
import type { GridDocument } from "@/lib/engine/grid";
import {
  renderGrid,
  canvasToCell,
  type RenderOptions,
  DEFAULT_RENDER_OPTIONS,
} from "@/lib/engine/canvas-renderer";
import { bresenhamLine, getCell } from "@/lib/engine/grid";

interface CanvasViewerProps {
  doc: GridDocument;
  highlightColorId: string | null;
  showGrid: boolean;
  showLabels: boolean;
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
  onStrokeEnd?: () => void;
}

interface ClientPoint {
  clientX: number;
  clientY: number;
}

type PointerGesture = "draw" | "pan" | "tap";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const TAP_MOVE_TOLERANCE = 5;

export default function CanvasViewer({
  doc,
  highlightColorId,
  showGrid,
  showLabels,
  onCellClick,
  onCellDrag,
  onCellDragSegment,
  onCellHover,
  onStrokeBegin,
  onStrokeEnd,
}: CanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const pointerGestureRef = useRef<PointerGesture | null>(null);
  const pointerStartRef = useRef<ClientPoint | null>(null);
  const pointerMovedRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  // Last sample position during a drag, used to Bresenham-interpolate the
  // gap to the current position so fast strokes don't skip cells.
  const lastDragCellRef = useRef<{ x: number; y: number } | null>(null);
  const instructionsId = useId();
  const statusId = useId();
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

  const getRenderMetrics = useCallback(() => {
    const width =
      viewportSize.width || containerRef.current?.clientWidth || 800;
    const height =
      viewportSize.height || containerRef.current?.clientHeight || 600;
    const padding = 40;
    const availableWidth = Math.max(1, width - padding);
    const availableHeight = Math.max(1, height - padding);
    const fitCellSize = Math.min(
      availableWidth / doc.width,
      availableHeight / doc.height,
      32,
    );
    const cellSize = Math.max(1, Math.floor(fitCellSize));
    const scaledSize = cellSize * zoom;
    const gridWidth = doc.width * scaledSize;
    const gridHeight = doc.height * scaledSize;

    return {
      cellSize,
      height,
      panX: Math.round((width - gridWidth) / 2 + pan.x),
      panY: Math.round((height - gridHeight) / 2 + pan.y),
      width,
    };
  }, [doc.width, doc.height, pan, viewportSize, zoom]);

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

    renderGrid(ctx, doc, {
      cellSize: metrics.cellSize,
      zoom,
      panX: metrics.panX,
      panY: metrics.panY,
      showGrid,
      showLabels,
      highlightColorId,
    });

    if (isKeyboardFocused) {
      const scaledSize = metrics.cellSize * zoom;
      const x = metrics.panX + keyboardCell.x * scaledSize;
      const y = metrics.panY + keyboardCell.y * scaledSize;
      ctx.save();
      ctx.strokeStyle = "#E33139";
      ctx.lineWidth = Math.max(2, Math.min(4, scaledSize / 3));
      ctx.setLineDash([
        Math.max(2, scaledSize / 3),
        Math.max(2, scaledSize / 4),
      ]);
      ctx.strokeRect(
        x + 1,
        y + 1,
        Math.max(1, scaledSize - 2),
        Math.max(1, scaledSize - 2),
      );
      ctx.restore();
    }
  }, [
    doc,
    zoom,
    showGrid,
    showLabels,
    highlightColorId,
    getRenderMetrics,
    isKeyboardFocused,
    keyboardCell,
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
    setStatusMessage("Canvas zoomed to an easier painting scale.");
  }, [getRenderMetrics]);

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
          zoom,
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

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (activePointerIdRef.current !== null) return;
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

      if (onCellDrag || onCellDragSegment) {
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
      }
    },
    [
      capturePointer,
      getEventCell,
      onCellDrag,
      onCellDragSegment,
      onStrokeBegin,
      pan,
      panMode,
    ],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (activePointerIdRef.current === event.pointerId) {
        event.preventDefault();
        const start = pointerStartRef.current;
        if (
          start &&
          Math.hypot(
            event.clientX - start.clientX,
            event.clientY - start.clientY,
          ) >= TAP_MOVE_TOLERANCE
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
          if (!cell) return;
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
    [getEventCell, hoverCell, onCellDrag, onCellDragSegment, onCellHover],
  );

  const finishPointer = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>, canceled: boolean) => {
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
        onCellClick?.(cell.x, cell.y, cell.colorId);
        setStatusMessage(`Activated column ${cell.x + 1}, row ${cell.y + 1}.`);
      } else if (gesture === "draw") {
        setStatusMessage(
          canceled ? "Stroke ended safely." : "Stroke complete.",
        );
      } else if (gesture === "pan") {
        setStatusMessage(canceled ? "Pan ended." : "Canvas panned.");
      }
    },
    [getEventCell, onCellClick, onStrokeEnd],
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
            panMode ? "Drawing interaction enabled." : "Hand tool enabled.",
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
      resetView,
      zoomIn,
      zoomOut,
    ],
  );

  const canvasCursor = panMode
    ? isPanning
      ? "cursor-grabbing"
      : "cursor-grab"
    : onCellDrag || onCellDragSegment
      ? "cursor-crosshair"
      : "cursor-cell";

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full graph-paper-fine overflow-hidden rounded-sm border border-border"
    >
      <p id={instructionsId} className="sr-only">
        Use one pointer to draw. Choose the Hand button or press H, then drag to
        pan. With the canvas focused, use the arrow keys to move the keyboard
        cursor, Enter or Space to activate a cell, plus and minus to zoom, and
        zero to fit the whole canvas. Press 2 to zoom to an easier painting
        scale.
      </p>
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>

      {/* Interaction and zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-sm border border-border bg-card/90 p-1 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          onClick={() => {
            setPanMode((current) => !current);
            setStatusMessage(
              panMode ? "Drawing interaction enabled." : "Hand tool enabled.",
            );
          }}
          className={`flex size-11 items-center justify-center rounded-sm transition-colors ${
            panMode
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
          className="flex size-11 items-center justify-center rounded-sm font-mono text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Zoom out"
          title="Zoom out (-)"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          className="flex h-11 min-w-12 items-center justify-center rounded-sm px-1 font-mono text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Reset zoom"
          title="Reset view (0)"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={editView}
          className="flex h-11 min-w-12 items-center justify-center rounded-sm px-1 text-xs font-bold text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Zoom to edit pixels"
          title="Edit zoom (2)"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={zoomIn}
          className="flex size-11 items-center justify-center rounded-sm font-mono text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Zoom in"
          title="Zoom in (+)"
        >
          +
        </button>
      </div>

      {/* Grid info + live coordinate readout */}
      <div className="absolute bottom-3 left-3 z-10 rounded-sm border border-border bg-card/90 px-2 py-1 backdrop-blur-sm">
        <span className="text-xs font-mono text-muted-foreground">
          {doc.width}×{doc.height} · {doc.usedColors.length} colors
          {hoverCell && (
            <span className="ml-2 text-foreground">
              · x:{hoverCell.x} y:{hoverCell.y}
            </span>
          )}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        className={`h-full w-full touch-none select-none pixel-canvas outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${canvasCursor}`}
        role="application"
        aria-label={`Editable ${doc.width} by ${doc.height} pixel grid`}
        aria-roledescription="pixel art canvas"
        aria-describedby={`${instructionsId} ${statusId}`}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Enter Space + - 0 2 H"
        data-grid-width={doc.width}
        data-grid-height={doc.height}
        data-document-modified-at={doc.meta.modifiedAt}
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
    </div>
  );
}
