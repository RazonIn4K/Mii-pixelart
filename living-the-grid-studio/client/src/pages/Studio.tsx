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
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useStructuredData } from "@/hooks/useStructuredData";
import { breadcrumbFor } from "@/lib/breadcrumb";
import { AlertTriangle, Undo2, Redo2, Grid3X3, Hash, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useGridDocument } from "@/hooks/useGridDocument";
import CanvasViewer from "@/components/studio/CanvasViewer";
import PalettePanel from "@/components/studio/PalettePanel";
import OptimizerPanel from "@/components/studio/OptimizerPanel";
import ImportPanel from "@/components/studio/ImportPanel";
import ExportPanel from "@/components/studio/ExportPanel";
import CreationPanel, {
  type PaintTool,
} from "@/components/studio/CreationPanel";
import AiPanel from "@/components/studio/AiPanel";
// ResidentPanel + Island tab removed — feature wasn't being used and the
// ResidentSpec sidecar lived only in the AI tab's "validate JSON" path which
// is now a non-feature.
// import ResidentPanel from "@/components/studio/ResidentPanel";
import {
  createCreativeTemplateDocument,
  type CreativeTemplateId,
} from "@/lib/engine/templates";
// Resident spec type retired alongside the Island tab.
// import type { MiiResidentSpec } from "@shared/residents";

const EMPTY_STATE_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/87446053/Wg3eEm5BszEjq4QnLj49VR/empty-state-Q4aaauXbcgtENGpUkLP2yT.webp";

export default function Studio() {
  useDocumentTitle(
    "Studio",
    "Browser-first Mii pixel-art editor. Import a photo or character art, reduce colors to a paintable palette, and export a paint-by-numbers reference.",
  );
  useStructuredData([breadcrumbFor([{ name: "Home", href: "/" }, { name: "Studio", href: "/studio" }])]);
  const {
    doc,
    imagePreview,
    isLoading,
    error,
    canUndo,
    canRedo,
    colorCounts,
    setDoc,
    createNew,
    previewFromImage,
    commitImagePreview,
    clearImagePreview,
    importFromJson,
    paintCell,
    paintCells,
    fillRegion,
    beginStroke,
    endStroke,
    resampleCanvas,
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
  const [paintTool, setPaintTool] = useState<PaintTool>("inspect");
  const [selectedPaintColorId, setSelectedPaintColorId] = useState("R10C1");
  const visibleDoc = imagePreview ?? doc;

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
    [mergeSource, mergeColors],
  );

  const handleMergeRequest = useCallback((fromId: string) => {
    setMergeSource(fromId);
    toast.info("Click the target color to merge into.");
  }, []);

  const handleCellClick = useCallback(
    (x: number, y: number, colorId: string | null) => {
      if (colorId) {
        if (imagePreview) {
          setHighlightColorId((prev) => (prev === colorId ? null : colorId));
          return;
        }
      }

      if (imagePreview) return;

      if (mergeSource) {
        if (colorId) {
          mergeColors(mergeSource, colorId);
          toast.success(`Merged ${mergeSource} into ${colorId}`);
          setMergeSource(null);
        }
        return;
      }

      if (paintTool === "pencil") {
        paintCell(x, y, selectedPaintColorId);
        setHighlightColorId(selectedPaintColorId);
        return;
      }

      if (paintTool === "eraser") {
        paintCell(x, y, null);
        return;
      }

      if (paintTool === "eyedropper") {
        if (colorId) {
          setSelectedPaintColorId(colorId);
          setHighlightColorId(colorId);
          toast.success(`Selected ${colorId}`);
        }
        setPaintTool("pencil");
        return;
      }

      if (paintTool === "fill") {
        fillRegion(x, y, selectedPaintColorId);
        setHighlightColorId(selectedPaintColorId);
        return;
      }

      if (colorId) {
        setHighlightColorId((prev) => (prev === colorId ? null : colorId));
      }
    },
    [
      imagePreview,
      mergeSource,
      paintTool,
      selectedPaintColorId,
      mergeColors,
      paintCell,
      fillRegion,
    ],
  );

  const handleCellDrag = useCallback(
    (x: number, y: number) => {
      if (imagePreview || !doc) return;
      if (paintTool === "pencil") {
        paintCell(x, y, selectedPaintColorId);
      } else if (paintTool === "eraser") {
        paintCell(x, y, null);
      }
    },
    [doc, imagePreview, paintTool, selectedPaintColorId, paintCell],
  );

  /**
   * Batched drag handler: receives a Bresenham-interpolated list of cells
   * between the previous and current pointer sample, so fast strokes never
   * leave gaps. Single immutable paintCells() update per drag frame
   * instead of N React re-renders. Paired with beginStroke / endStroke on
   * the canvas so the whole drag is one undo entry.
   */
  const handleCellDragSegment = useCallback(
    (cells: { x: number; y: number }[]) => {
      if (imagePreview || !doc) return;
      if (paintTool === "pencil") {
        paintCells(cells, selectedPaintColorId);
      } else if (paintTool === "eraser") {
        paintCells(cells, null);
      }
    },
    [doc, imagePreview, paintTool, selectedPaintColorId, paintCells],
  );

  /**
   * Stroke transactions. The pencil and eraser tools both group the entire
   * mouse-down → mouse-up drag into one undo entry. Other tools (inspect,
   * eyedropper, fill) are single-click and don't need transaction grouping.
   */
  const handleStrokeBegin = useCallback(() => {
    if (paintTool === "pencil" || paintTool === "eraser") {
      beginStroke();
    }
  }, [paintTool, beginStroke]);

  const handleStrokeEnd = useCallback(() => {
    if (paintTool === "pencil" || paintTool === "eraser") {
      endStroke();
    }
  }, [paintTool, endStroke]);

  const handleCreateCanvas = useCallback(
    (
      width: number,
      height: number,
      name: string,
      fillColorId: string | null,
    ) => {
      createNew(width, height, name, fillColorId);
      setHighlightColorId(null);
      toast.success(`Created ${name}`);
    },
    [createNew],
  );

  const handleCreateTemplate = useCallback(
    (templateId: CreativeTemplateId) => {
      const templateDoc = createCreativeTemplateDocument(templateId);
      setDoc(templateDoc);
      setHighlightColorId(null);
      setPaintTool("pencil");
      toast.success(`Created ${templateDoc.meta.name}`);
    },
    [setDoc],
  );

  const handleApplyAiSketch = useCallback(
    (sketchDoc: NonNullable<typeof doc>) => {
      setDoc(sketchDoc);
      setHighlightColorId(null);
      setPaintTool("pencil");
      toast.success(`Applied ${sketchDoc.meta.name}`);
    },
    [setDoc],
  );

  // handleAttachResidentSpec removed alongside the Island tab.

  const handleCommitImagePreview = useCallback(() => {
    commitImagePreview();
    toast.success("Image preview committed");
  }, [commitImagePreview]);

  const handleCancelImagePreview = useCallback(() => {
    clearImagePreview();
    toast.info("Image preview canceled");
  }, [clearImagePreview]);

  const handleCellHover = useCallback(
    (_x: number, _y: number, colorId: string | null) => {
      // Optional: could show cell info in a status bar
    },
    [],
  );

  return (
    <div className="h-screen flex flex-col">
      {/* Top Bar */}
      <header className="h-11 border-b border-border bg-background flex items-center px-4 gap-3 shrink-0">
        <Link href="/">
          <button
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Go home"
            title="Go home"
          >
            <Home className="w-3.5 h-3.5" />
          </button>
        </Link>

        <div className="flex items-center gap-1.5">
          <div className="red-dot-sm" />
          <span className="text-xs font-medium tracking-wide">
            {doc?.meta.name ?? "Tomodachi Studio"}
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
                  showGrid
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label="Toggle grid lines"
                title="Toggle grid lines"
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
                  showLabels
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label="Toggle paint-by-numbers labels"
                title="Toggle paint-by-numbers labels"
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
                aria-label="Undo"
                title="Undo"
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
                aria-label="Redo"
                title="Redo"
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

      {/* Main Content — stacks vertically on mobile (<768px) so the
          right panel doesn't push the canvas off-screen. Side-by-side on md+. */}
      <main id="main-content" className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Canvas Area (full width on mobile, ~65% on desktop) */}
        <div className="flex-1 min-w-0 p-3 min-h-[60vh] md:min-h-0">
          {visibleDoc ? (
            <div className="relative w-full h-full">
              {imagePreview && (
                <div className="absolute top-3 left-3 z-20 rounded-sm border border-primary/30 bg-background/95 px-2 py-1 text-xs shadow-sm">
                  Preview mode · commit or cancel from Import
                </div>
              )}
              <CanvasViewer
                doc={visibleDoc}
                highlightColorId={highlightColorId}
                showGrid={showGrid}
                showLabels={showLabels}
                onCellClick={handleCellClick}
                onCellDrag={
                  paintTool === "pencil" || paintTool === "eraser"
                    ? handleCellDrag
                    : undefined
                }
                onCellDragSegment={
                  paintTool === "pencil" || paintTool === "eraser"
                    ? handleCellDragSegment
                    : undefined
                }
                onCellHover={handleCellHover}
                onStrokeBegin={handleStrokeBegin}
                onStrokeEnd={handleStrokeEnd}
              />
            </div>
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
                  Import an image or JSON file from the panel on the right to
                  get started.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel (full width on mobile below canvas, ~320px / 384px on md/lg) */}
        <div className="w-full md:w-80 lg:w-96 max-h-[50vh] md:max-h-none border-t md:border-t-0 md:border-l border-border bg-background shrink-0 flex flex-col overflow-hidden">
          {mergeSource && (
            <div className="px-4 py-2 bg-accent border-b border-border">
              <p className="text-xs">
                <span className="font-semibold">Merge mode:</span> Click a
                target color to merge{" "}
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

          {doc?.meta.importWarnings?.length ? (
            <div className="px-4 py-2 border-b border-border bg-amber-50 text-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <p className="text-xs leading-relaxed">
                  {doc.meta.importWarnings[0]}
                  {doc.meta.importWarnings.length > 1
                    ? ` (${doc.meta.importWarnings.length - 1} more import warnings saved in JSON metadata.)`
                    : ""}
                </p>
              </div>
            </div>
          ) : null}

          <Tabs
            defaultValue="import"
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="w-full rounded-none border-b border-border bg-transparent h-9 px-2">
              <TabsTrigger
                value="import"
                className="text-xs data-[state=active]:bg-accent rounded-sm"
              >
                Import
              </TabsTrigger>
              <TabsTrigger
                value="create"
                className="text-xs data-[state=active]:bg-accent rounded-sm"
              >
                Create
              </TabsTrigger>
              <TabsTrigger
                value="palette"
                className="text-xs data-[state=active]:bg-accent rounded-sm"
              >
                Palette
              </TabsTrigger>
              <TabsTrigger
                value="optimize"
                className="text-xs data-[state=active]:bg-accent rounded-sm"
              >
                Optimize
              </TabsTrigger>
              <TabsTrigger
                value="ai"
                className="text-xs data-[state=active]:bg-accent rounded-sm"
              >
                AI
              </TabsTrigger>
              <TabsTrigger
                value="export"
                className="text-xs data-[state=active]:bg-accent rounded-sm"
              >
                Export
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-auto">
              <TabsContent value="import" className="mt-0">
                <ImportPanel
                  previewDoc={imagePreview}
                  onPreviewImage={previewFromImage}
                  onCommitPreview={handleCommitImagePreview}
                  onCancelPreview={handleCancelImagePreview}
                  onImportJson={importFromJson}
                  isLoading={isLoading}
                />
              </TabsContent>

              <TabsContent value="create" className="mt-0">
                {imagePreview ? (
                  <PreviewBlockedPanel title="Create" />
                ) : (
                  <CreationPanel
                    activeTool={paintTool}
                    currentDoc={doc}
                    selectedColorId={selectedPaintColorId}
                    onActiveToolChange={setPaintTool}
                    onCreateCanvas={handleCreateCanvas}
                    onCreateTemplate={handleCreateTemplate}
                    onResampleCanvas={resampleCanvas}
                    onSelectedColorChange={setSelectedPaintColorId}
                  />
                )}
              </TabsContent>

              {/* Island tab removed in Pass 19. */}

              <TabsContent value="palette" className="mt-0 h-full">
                {imagePreview ? (
                  <PreviewBlockedPanel title="Palette" />
                ) : doc ? (
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
                  disabled={!doc || !!imagePreview}
                />
                {imagePreview && <PreviewBlockedPanel title="Optimizer" />}
              </TabsContent>

              <TabsContent value="ai" className="mt-0">
                {imagePreview ? (
                  <PreviewBlockedPanel title="AI Draw" />
                ) : (
                  <AiPanel
                    currentDoc={doc}
                    onApplySketch={handleApplyAiSketch}
                  />
                )}
              </TabsContent>

              <TabsContent value="export" className="mt-0">
                <ExportPanel
                  doc={imagePreview ? null : doc}
                  disabledReason={
                    imagePreview
                      ? "Commit or cancel the image preview before exporting."
                      : undefined
                  }
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function PreviewBlockedPanel({ title }: { title: string }) {
  return (
    <div className="p-4">
      <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
        <p className="text-xs font-semibold">{title} paused during preview</p>
        <p className="mt-1 text-xs leading-relaxed">
          Commit or cancel the image preview from the Import tab before editing,
          optimizing, or exporting.
        </p>
      </div>
    </div>
  );
}
