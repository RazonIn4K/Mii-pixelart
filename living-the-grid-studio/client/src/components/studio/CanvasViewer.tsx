/**
 * CanvasViewer.tsx — Grid canvas with zoom, pan, and interaction
 *
 * DESIGN: "Paper Studio" — graph-paper background, pale blue grid lines,
 * red accent for highlights. The canvas is the hero of the workspace.
 */

import { useRef, useEffect, useState, useCallback } from "react";
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
   * "fast mouse leaves gaps" bug. If both are provided, this takes
   * precedence; onCellDrag is only the fallback for the first cell.
   */
  onCellDragSegment?: (cells: { x: number; y: number }[]) => void;
  onCellHover?: (x: number, y: number, colorId: string | null) => void;
  /**
   * Stroke lifecycle. Studio.tsx wires beginStroke() to mouse-down and
   * endStroke() to mouse-up so the entire drag becomes ONE undo entry
   * rather than one entry per painted cell.
   */
  onStrokeBegin?: () => void;
  onStrokeEnd?: () => void;
}

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
  const didDrawRef = useRef(false);
  // Last sample position during a drag, used to Bresenham-interpolate the
  // gap to the current position so fast strokes don't skip cells.
  const lastDragCellRef = useRef<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  // Hover cell coordinates for the on-canvas readout. Null when the
  // cursor is outside the grid.
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
    setZoom(1);
    setPan({ x: 0, y: 0 });
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
  }, [
    doc,
    zoom,
    showGrid,
    showLabels,
    highlightColorId,
    getRenderMetrics,
  ]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.25, Math.min(8, z * delta)));
  }, []);

  const getEventCell = useCallback(
    (e: React.MouseEvent) => {
      if (!canvasRef.current) return null;
      const rect = canvasRef.current.getBoundingClientRect();
      const metrics = getRenderMetrics();
      const cell = canvasToCell(e.clientX - rect.left, e.clientY - rect.top, {
        cellSize: metrics.cellSize,
        zoom,
        panX: metrics.panX,
        panY: metrics.panY,
      });
      if (!cell || cell.x >= doc.width || cell.y >= doc.height) return null;
      return {
        ...cell,
        colorId: getCell(doc, cell.x, cell.y),
      };
    },
    [getRenderMetrics, zoom, doc],
  );

  // Pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || e.altKey) {
        setIsPanning(true);
        setIsDrawing(false);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        return;
      }

      if (e.button === 0 && (onCellDrag || onCellDragSegment)) {
        const cell = getEventCell(e);
        if (!cell) return;
        setIsDrawing(true);
        didDrawRef.current = true;
        // Begin the stroke transaction so all paints below collapse into
        // one undo entry. Stroke lifecycle is owned by the parent so the
        // hook can decide what "one entry" means.
        onStrokeBegin?.();
        lastDragCellRef.current = { x: cell.x, y: cell.y };
        if (onCellDragSegment) {
          onCellDragSegment([{ x: cell.x, y: cell.y }]);
        } else {
          onCellDrag?.(cell.x, cell.y, cell.colorId);
        }
      }
    },
    [getEventCell, onCellDrag, onCellDragSegment, onStrokeBegin, pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
        return;
      }

      if (
        isDrawing &&
        (onCellDrag || onCellDragSegment) &&
        e.buttons === 1
      ) {
        const cell = getEventCell(e);
        if (cell) {
          didDrawRef.current = true;
          const prev = lastDragCellRef.current;
          // Bresenham-interpolate between the previous and current sample
          // so fast drags don't leave gaps. Single-cell moves (the common
          // case) just produce a 1-element segment.
          const segment =
            prev && (prev.x !== cell.x || prev.y !== cell.y)
              ? bresenhamLine(prev.x, prev.y, cell.x, cell.y).slice(1)
              : prev
                ? []
                : [{ x: cell.x, y: cell.y }];
          if (segment.length > 0) {
            if (onCellDragSegment) {
              onCellDragSegment(segment);
            } else if (onCellDrag) {
              for (const p of segment) onCellDrag(p.x, p.y, null);
            }
          }
          lastDragCellRef.current = { x: cell.x, y: cell.y };
        }
        return;
      }

      // Hover — update local HUD state and forward to parent if it cares.
      const cell = getEventCell(e);
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
      isPanning,
      isDrawing,
      panStart,
      onCellDrag,
      onCellDragSegment,
      onCellHover,
      getEventCell,
      hoverCell,
    ],
  );

  const handleMouseUp = useCallback(() => {
    if (isDrawing) {
      // Promote the in-flight stroke to a single history entry.
      onStrokeEnd?.();
    }
    setIsPanning(false);
    setIsDrawing(false);
    lastDragCellRef.current = null;
  }, [isDrawing, onStrokeEnd]);

  const handleMouseLeave = useCallback(() => {
    handleMouseUp();
    setHoverCell(null);
  }, [handleMouseUp]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (didDrawRef.current) {
        didDrawRef.current = false;
        return;
      }
      if (!onCellClick) return;
      const cell = getEventCell(e);
      if (cell) onCellClick(cell.x, cell.y, cell.colorId);
    },
    [onCellClick, getEventCell],
  );

  // Reset view
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full graph-paper-fine overflow-hidden rounded-sm border border-border"
    >
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-card/90 backdrop-blur-sm border border-border rounded-sm px-2 py-1">
        <button
          onClick={() => setZoom((z) => Math.max(0.25, z * 0.8))}
          className="text-xs font-mono text-muted-foreground hover:text-foreground px-1"
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={resetView}
          className="text-xs font-mono text-muted-foreground hover:text-foreground px-1"
          aria-label="Reset zoom"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
          className="text-xs font-mono text-muted-foreground hover:text-foreground px-1"
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
      </div>

      {/* Grid info + live coordinate readout */}
      <div className="absolute bottom-3 left-3 z-10 bg-card/90 backdrop-blur-sm border border-border rounded-sm px-2 py-1">
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
        className="h-full w-full cursor-crosshair pixel-canvas"
        aria-label={`${doc.width} by ${doc.height} pixel grid preview`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
    </div>
  );
}
