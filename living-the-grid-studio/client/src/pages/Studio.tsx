/**
 * Studio.tsx — Main editor workspace
 *
 * DESIGN: "Paper Studio" — Asymmetric two-column layout.
 * Left: dominant canvas on graph paper (65%).
 * Right: clean vertical control stack (35%) — import, palette, optimizer, export.
 * Thin top bar with project name and minimal controls.
 */

import { useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { Undo2, Redo2, Grid3X3, Hash, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useGridDocument } from "@/hooks/useGridDocument";
import CanvasViewer from "@/components/studio/CanvasViewer";
import PalettePanel from "@/components/studio/PalettePanel";
import OptimizerPanel from "@/components/studio/OptimizerPanel";
import ImportPanel from "@/components/studio/ImportPanel";
import ExportPanel from "@/components/studio/ExportPanel";

const EMPTY_STATE_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/87446053/Wg3eEm5BszEjq4QnLj49VR/empty-state-Q4aaauXbcgtENGpUkLP2yT.webp";

export default function Studio() {
  const {
    doc,
    isLoading,
    error,
    canUndo,
    canRedo,
    colorCounts,
    importFromImage,
    importFromJson,
    mergeColors,
    toggleColorLock,
    runOptimizer,
    undo,
    redo,
  } = useGridDocument();

  const [highlightColorId, setHighlightColorId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // Show errors
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleColorClick = useCallback(
    (colorId: string) => {
      if (mergeSource) {
        if (mergeSource !== colorId) {
          mergeColors(mergeSource, colorId);
          toast.success(`Merged ${mergeSource} into ${colorId}`);
        }
        setMergeSource(null);
      } else {
        setHighlightColorId((prev) => (prev === colorId ? null : colorId));
      }
    },
    [mergeSource, mergeColors]
  );

  const handleMergeRequest = useCallback((fromId: string) => {
    setMergeSource(fromId);
    toast.info("Click the target color to merge into.");
  }, []);

  const handleCellClick = useCallback(
    (_x: number, _y: number, colorId: string | null) => {
      if (colorId) {
        if (mergeSource) {
          mergeColors(mergeSource, colorId);
          toast.success(`Merged ${mergeSource} into ${colorId}`);
          setMergeSource(null);
        } else {
          setHighlightColorId((prev) => (prev === colorId ? null : colorId));
        }
      }
    },
    [mergeSource, mergeColors]
  );

  const handleCellHover = useCallback(
    (_x: number, _y: number, colorId: string | null) => {
      // Optional: could show cell info in a status bar
    },
    []
  );

  return (
    <div className="h-screen flex flex-col">
      {/* Top Bar */}
      <header className="h-11 border-b border-border bg-background flex items-center px-4 gap-3 shrink-0">
        <Link href="/">
          <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <Home className="w-3.5 h-3.5" />
          </button>
        </Link>

        <div className="flex items-center gap-1.5">
          <div className="red-dot-sm" />
          <span className="text-xs font-medium tracking-wide">
            {doc?.meta.name ?? "Living The Grid Studio"}
          </span>
        </div>

        <div className="flex-1" />

        {/* View toggles */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowGrid((v) => !v)}
                className={`p-1.5 rounded-sm transition-colors ${
                  showGrid ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Toggle grid lines</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowLabels((v) => !v)}
                className={`p-1.5 rounded-sm transition-colors ${
                  showLabels ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Toggle paint-by-numbers labels</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5 border-l border-border pl-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={undo}
                disabled={!canUndo}
                className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Undo (Ctrl+Z)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Redo (Ctrl+Shift+Z)</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas Area (65%) */}
        <div className="flex-1 min-w-0 p-3">
          {doc ? (
            <CanvasViewer
              doc={doc}
              highlightColorId={highlightColorId}
              showGrid={showGrid}
              showLabels={showLabels}
              onCellClick={handleCellClick}
              onCellHover={handleCellHover}
            />
          ) : (
            <div className="w-full h-full graph-paper-fine rounded-sm border border-border flex items-center justify-center">
              <div className="text-center max-w-xs">
                <img
                  src={EMPTY_STATE_IMG}
                  alt="Empty graph paper"
                  className="w-48 h-auto mx-auto mb-4 rounded-sm opacity-60"
                />
                <p className="text-sm text-muted-foreground mb-1">
                  No project open
                </p>
                <p className="text-xs text-muted-foreground">
                  Import an image or JSON file from the panel on the right to get started.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel (35%) */}
        <div className="w-80 lg:w-96 border-l border-border bg-background shrink-0 flex flex-col overflow-hidden">
          {mergeSource && (
            <div className="px-4 py-2 bg-accent border-b border-border">
              <p className="text-xs">
                <span className="font-semibold">Merge mode:</span> Click a target color to merge{" "}
                <span className="font-mono">{mergeSource}</span> into it.
              </p>
              <button
                onClick={() => setMergeSource(null)}
                className="text-xs text-primary underline mt-0.5"
              >
                Cancel
              </button>
            </div>
          )}

          <Tabs defaultValue="import" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="w-full rounded-none border-b border-border bg-transparent h-9 px-2">
              <TabsTrigger value="import" className="text-xs data-[state=active]:bg-accent rounded-sm">
                Import
              </TabsTrigger>
              <TabsTrigger value="palette" className="text-xs data-[state=active]:bg-accent rounded-sm">
                Palette
              </TabsTrigger>
              <TabsTrigger value="optimize" className="text-xs data-[state=active]:bg-accent rounded-sm">
                Optimize
              </TabsTrigger>
              <TabsTrigger value="export" className="text-xs data-[state=active]:bg-accent rounded-sm">
                Export
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-auto">
              <TabsContent value="import" className="mt-0">
                <ImportPanel
                  onImportImage={importFromImage}
                  onImportJson={importFromJson}
                  isLoading={isLoading}
                />
              </TabsContent>

              <TabsContent value="palette" className="mt-0 h-full">
                {doc ? (
                  <PalettePanel
                    usedColors={doc.usedColors}
                    colorCounts={colorCounts}
                    lockedColors={doc.lockedColors}
                    highlightColorId={highlightColorId}
                    onColorHover={setHighlightColorId}
                    onColorClick={handleColorClick}
                    onToggleLock={toggleColorLock}
                    onMergeRequest={handleMergeRequest}
                  />
                ) : (
                  <div className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      Import a file to see the palette.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="optimize" className="mt-0">
                <OptimizerPanel
                  currentColorCount={doc?.usedColors.length ?? 0}
                  onRunOptimizer={runOptimizer}
                  disabled={!doc}
                />
              </TabsContent>

              <TabsContent value="export" className="mt-0">
                <ExportPanel doc={doc} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
