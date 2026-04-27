/**
 * CanvasViewer.tsx — Grid canvas with zoom, pan, and interaction
 *
 * DESIGN: "Paper Studio" — graph-paper background, pale blue grid lines,
 * red accent for highlights. The canvas is the hero of the workspace.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import type { GridDocument } from "@/lib/engine/grid";
import { renderGrid, canvasToCell, type RenderOptions, DEFAULT_RENDER_OPTIONS } from "@/lib/engine/canvas-renderer";
import { getCell } from "@/lib/engine/grid";

interface CanvasViewerProps {
  doc: GridDocument;
  highlightColorId: string | null;
  showGrid: boolean;
  showLabels: boolean;
  onCellClick?: (x: number, y: number, colorId: string | null) => void;
  onCellHover?: (x: number, y: number, colorId: string | null) => void;
}

export default function CanvasViewer({
  doc,
  highlightColorId,
  showGrid,
  showLabels,
  onCellClick,
  onCellHover,
}: CanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Calculate cell size to fit the container
  const getCellSize = useCallback(() => {
    if (!containerRef.current) return 16;
    const rect = containerRef.current.getBoundingClientRect();
    const maxW = (rect.width - 40) / doc.width;
    const maxH = (rect.height - 40) / doc.height;
    return Math.max(4, Math.min(32, Math.floor(Math.min(maxW, maxH))));
  }, [doc.width, doc.height]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cellSize = getCellSize();
    const scaledSize = cellSize * zoom;
    canvas.width = doc.width * scaledSize + Math.abs(pan.x) + 100;
    canvas.height = doc.height * scaledSize + Math.abs(pan.y) + 100;

    renderGrid(ctx, doc, {
      cellSize,
      zoom,
      panX: pan.x,
      panY: pan.y,
      showGrid,
      showLabels,
      highlightColorId,
    });
  }, [doc, zoom, pan, showGrid, showLabels, highlightColorId, getCellSize]);

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.max(0.25, Math.min(8, z * delta)));
    },
    []
  );

  // Pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || e.altKey) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    },
    [pan]
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

      // Hover
      if (onCellHover && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const cellSize = getCellSize();
        const cell = canvasToCell(
          e.clientX - rect.left,
          e.clientY - rect.top,
          { cellSize, zoom, panX: pan.x, panY: pan.y }
        );
        if (cell && cell.x < doc.width && cell.y < doc.height) {
          onCellHover(cell.x, cell.y, getCell(doc, cell.x, cell.y));
        }
      }
    },
    [isPanning, panStart, onCellHover, getCellSize, zoom, pan, doc]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onCellClick || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const cellSize = getCellSize();
      const cell = canvasToCell(
        e.clientX - rect.left,
        e.clientY - rect.top,
        { cellSize, zoom, panX: pan.x, panY: pan.y }
      );
      if (cell && cell.x < doc.width && cell.y < doc.height) {
        onCellClick(cell.x, cell.y, getCell(doc, cell.x, cell.y));
      }
    },
    [onCellClick, getCellSize, zoom, pan, doc]
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
        >
          −
        </button>
        <button
          onClick={resetView}
          className="text-xs font-mono text-muted-foreground hover:text-foreground px-1"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
          className="text-xs font-mono text-muted-foreground hover:text-foreground px-1"
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
        className="cursor-crosshair"
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
