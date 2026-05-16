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
import { getCell } from "@/lib/engine/grid";

interface CanvasViewerProps {
  doc: GridDocument;
  highlightColorId: string | null;
  showGrid: boolean;
  showLabels: boolean;
  onCellClick?: (x: number, y: number, colorId: string | null) => void;
  onCellDrag?: (x: number, y: number, colorId: string | null) => void;
  onCellHover?: (x: number, y: number, colorId: string | null) => void;
}

export default function CanvasViewer({
  doc,
  highlightColorId,
  showGrid,
  showLabels,
  onCellClick,
  onCellDrag,
  onCellHover,
}: CanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const didDrawRef = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

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

      if (e.button === 0 && onCellDrag) {
        const cell = getEventCell(e);
        if (!cell) return;
        setIsDrawing(true);
        didDrawRef.current = true;
        onCellDrag(cell.x, cell.y, cell.colorId);
      }
    },
    [getEventCell, onCellDrag, pan],
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

      if (isDrawing && onCellDrag && e.buttons === 1) {
        const cell = getEventCell(e);
        if (cell) {
          didDrawRef.current = true;
          onCellDrag(cell.x, cell.y, cell.colorId);
        }
        return;
      }

      // Hover
      if (onCellHover) {
        const cell = getEventCell(e);
        if (cell) onCellHover(cell.x, cell.y, cell.colorId);
      }
    },
    [isPanning, isDrawing, panStart, onCellDrag, onCellHover, getEventCell],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDrawing(false);
  }, []);

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

      {/* Grid info */}
      <div className="absolute bottom-3 left-3 z-10 bg-card/90 backdrop-blur-sm border border-border rounded-sm px-2 py-1">
        <span className="text-xs font-mono text-muted-foreground">
          {doc.width}×{doc.height} · {doc.usedColors.length} colors
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
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />
    </div>
  );
}
