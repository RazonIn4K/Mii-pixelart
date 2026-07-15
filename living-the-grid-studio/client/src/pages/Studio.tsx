/**
 * Studio.tsx — Main editor workspace
 *
 * DESIGN: "Paper Studio" — Asymmetric two-column layout.
 * Left: dominant canvas on graph paper (65%).
 * Right: clean vertical control stack (35%) — import, palette, optimizer, export.
 * Thin top bar with project name and minimal controls.
 */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "wouter";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useStructuredData } from "@/hooks/useStructuredData";
import { breadcrumbFor } from "@/lib/breadcrumb";
import {
  AlertTriangle,
  Compass,
  FolderOpen,
  Grid2x2Plus,
  Hash,
  Home,
  ImageUp,
  Redo2,
  ShieldCheck,
  Sparkles,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/lib/toast";
import { useGridDocument } from "@/hooks/useGridDocument";
import CanvasViewer from "@/components/studio/CanvasViewer";
import type { PaintTool } from "@/components/studio/CreationPanel";
import {
  CanvasPaintToolbar,
  type BrushSize,
} from "@/components/studio/CanvasPaintToolbar";
import { ReferenceDock } from "@/components/studio/ReferenceDock";
import {
  StudioWorkflowNav,
  type StudioPanel,
} from "@/components/studio/StudioWorkflowNav";
import { CloudProjectControls } from "@/components/community/CloudProjectControls";
// ResidentPanel + Island tab removed — feature wasn't being used and the
// ResidentSpec sidecar lived only in the AI tab's "validate JSON" path which
// is now a non-feature.
// import ResidentPanel from "@/components/studio/ResidentPanel";
import {
  createCreativeTemplateDocument,
  type CreativeTemplateId,
} from "@/lib/engine/templates";
import type { GridDocument } from "@/lib/engine/grid";
import type {
  CanvasBackground,
  GridDensity,
} from "@/lib/engine/canvas-renderer";
import {
  DEFAULT_IMPORT_OPTIONS,
  getImagePreview,
  type ImageImportOptions,
} from "@/lib/engine/image-import";
import { buildPaintCells } from "@/lib/engine/paint-assists";
import type { CopyGuideRun } from "@/lib/engine/copy-guide";
// Resident spec type retired alongside the Island tab.
// import type { MiiResidentSpec } from "@shared/residents";

const EMPTY_STATE_IMG = "/empty-state.webp";
const AiPanel = lazy(() => import("@/components/studio/AiPanel"));
const CreationPanel = lazy(() => import("@/components/studio/CreationPanel"));
const CopyGuidePanel = lazy(() => import("@/components/studio/CopyGuidePanel"));
const ExportPanel = lazy(() => import("@/components/studio/ExportPanel"));
const ImportPanel = lazy(() => import("@/components/studio/ImportPanel"));
const OptimizerPanel = lazy(() => import("@/components/studio/OptimizerPanel"));
const PalettePanel = lazy(() => import("@/components/studio/PalettePanel"));

export default function Studio() {
  useDocumentTitle(
    "Studio",
    "Browser-first Mii pixel-art editor. Import a photo or character art, reduce colors to a paintable palette, and export a paint-by-numbers reference.",
  );
  useStructuredData([
    breadcrumbFor([
      { name: "Home", href: "/" },
      { name: "Studio", href: "/studio" },
    ]),
  ]);
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
    paintCells,
    fillRegion,
    beginStroke,
    cancelStroke,
    endStroke,
    resampleCanvas,
    mergeColors,
    toggleColorLock,
    runOptimizer,
    undo,
    redo,
  } = useGridDocument();

  const [highlightColorId, setHighlightColorId] = useState<string | null>(null);
  const [gridDensity, setGridDensity] = useState<GridDensity>("cell");
  const [canvasBackground, setCanvasBackground] =
    useState<CanvasBackground>("light");
  const [showLabels, setShowLabels] = useState(false);
  const [horizontalMirror, setHorizontalMirror] = useState(false);
  const [showCenterGuide, setShowCenterGuide] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [paintTool, setPaintTool] = useState<PaintTool>("pencil");
  const [brushSize, setBrushSize] = useState<BrushSize>(1);
  const [selectedPaintColorId, setSelectedPaintColorId] = useState("R10C1");
  const [activePanel, setActivePanel] = useState<StudioPanel>("import");
  const [activeCopyRun, setActiveCopyRun] = useState<CopyGuideRun | null>(null);
  const [referenceSourceUrl, setReferenceSourceUrl] = useState<string | null>(
    null,
  );
  const [referenceUnderlayUrl, setReferenceUnderlayUrl] = useState<
    string | null
  >(null);
  const [referenceUnderlayStatus, setReferenceUnderlayStatus] = useState<
    "error" | "idle" | "preparing" | "ready"
  >("idle");
  const [referenceOpacity, setReferenceOpacity] = useState(40);
  const [referenceFlipped, setReferenceFlipped] = useState(false);
  const [referenceUnderlayVisible, setReferenceUnderlayVisible] =
    useState(true);
  const imagePickerRequestRef = useRef(0);
  const referencePreviewRequestRef = useRef(0);
  const referenceFileRef = useRef<File | null>(null);
  const referenceSourceUrlRef = useRef<string | null>(null);
  const visibleDoc = imagePreview ?? doc;
  const isCopyMode = activePanel === "copy" && !!doc && !imagePreview;

  useEffect(() => {
    if (!referenceSourceUrl) return;
    return () => URL.revokeObjectURL(referenceSourceUrl);
  }, [referenceSourceUrl]);

  const rememberLocalReference = useCallback((file: File) => {
    if (referenceFileRef.current === file && referenceSourceUrlRef.current) {
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    referenceFileRef.current = file;
    referenceSourceUrlRef.current = nextUrl;
    setReferenceSourceUrl(nextUrl);
    setReferenceOpacity(40);
    setReferenceFlipped(false);
    setReferenceUnderlayVisible(true);
  }, []);

  const clearLocalReference = useCallback(() => {
    referencePreviewRequestRef.current += 1;
    referenceFileRef.current = null;
    referenceSourceUrlRef.current = null;
    setReferenceSourceUrl(null);
    setReferenceUnderlayUrl(null);
    setReferenceUnderlayStatus("idle");
  }, []);

  const handlePreviewImage = useCallback(
    (file: File, options?: Partial<ImageImportOptions>) => {
      rememberLocalReference(file);
      previewFromImage(file, options);
      const requestNumber = referencePreviewRequestRef.current + 1;
      referencePreviewRequestRef.current = requestNumber;
      setReferenceUnderlayUrl(null);
      setReferenceUnderlayStatus("preparing");
      const resolvedOptions = { ...DEFAULT_IMPORT_OPTIONS, ...options };
      void getImagePreview(
        file,
        resolvedOptions.gridWidth,
        resolvedOptions.gridHeight,
        8,
        resolvedOptions,
      )
        .then((previewUrl) => {
          if (referencePreviewRequestRef.current !== requestNumber) return;
          setReferenceUnderlayUrl(previewUrl);
          setReferenceUnderlayStatus("ready");
        })
        .catch(() => {
          if (referencePreviewRequestRef.current !== requestNumber) return;
          setReferenceUnderlayUrl(null);
          setReferenceUnderlayStatus("error");
        });
    },
    [previewFromImage, rememberLocalReference],
  );

  const confirmImportReplacement = useCallback(() => {
    if (!doc?.cells.some((cell) => cell !== null)) return true;
    return window.confirm(
      "Replace the current painted canvas with this import? You can undo the replacement after it is committed.",
    );
  }, [doc]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (activePanel === "copy") {
        if ((e.metaKey || e.ctrlKey) && (key === "z" || key === "y")) {
          e.preventDefault();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      const shortcutTool: Partial<Record<string, PaintTool>> = {
        e: "eraser",
        f: "fill",
        i: "eyedropper",
        p: "pencil",
        v: "inspect",
      };
      const nextTool = shortcutTool[key];
      if (nextTool && doc && !imagePreview) {
        e.preventDefault();
        setPaintTool(nextTool);
        return;
      }
      if (key === "m" && doc && !imagePreview) {
        e.preventDefault();
        const next = !horizontalMirror;
        setHorizontalMirror(next);
        if (next) setShowCenterGuide(true);
        return;
      }
      if (key === "g" && doc && !imagePreview) {
        e.preventDefault();
        setShowCenterGuide((current) => !current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePanel, doc, horizontalMirror, imagePreview, undo, redo]);

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
        setSelectedPaintColorId(colorId);
        setHighlightColorId(null);
        setPaintTool("pencil");
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

      if (imagePreview || !doc) return;

      if (mergeSource) {
        if (colorId) {
          mergeColors(mergeSource, colorId);
          toast.success(`Merged ${mergeSource} into ${colorId}`);
          setMergeSource(null);
        }
        return;
      }

      if (paintTool === "pencil") {
        paintCells(
          buildPaintCells([{ x, y }], brushSize, doc, horizontalMirror),
          selectedPaintColorId,
        );
        setHighlightColorId(null);
        return;
      }

      if (paintTool === "eraser") {
        paintCells(
          buildPaintCells([{ x, y }], brushSize, doc, horizontalMirror),
          null,
        );
        return;
      }

      if (paintTool === "eyedropper") {
        if (colorId) {
          setSelectedPaintColorId(colorId);
          setHighlightColorId(null);
          toast.success(`Selected ${colorId}`);
        }
        setPaintTool("pencil");
        return;
      }

      if (paintTool === "fill") {
        fillRegion(x, y, selectedPaintColorId);
        setHighlightColorId(null);
        return;
      }

      if (colorId) {
        setHighlightColorId((prev) => (prev === colorId ? null : colorId));
      }
    },
    [
      imagePreview,
      doc,
      mergeSource,
      paintTool,
      brushSize,
      horizontalMirror,
      selectedPaintColorId,
      mergeColors,
      paintCells,
      fillRegion,
    ],
  );

  const handleCellDrag = useCallback(
    (x: number, y: number) => {
      if (imagePreview || !doc) return;
      const cells = buildPaintCells(
        [{ x, y }],
        brushSize,
        doc,
        horizontalMirror,
      );
      if (paintTool === "pencil") {
        paintCells(cells, selectedPaintColorId);
      } else if (paintTool === "eraser") {
        paintCells(cells, null);
      }
    },
    [
      brushSize,
      doc,
      horizontalMirror,
      imagePreview,
      paintTool,
      selectedPaintColorId,
      paintCells,
    ],
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
      const brushCells = buildPaintCells(
        cells,
        brushSize,
        doc,
        horizontalMirror,
      );
      if (paintTool === "pencil") {
        paintCells(brushCells, selectedPaintColorId);
      } else if (paintTool === "eraser") {
        paintCells(brushCells, null);
      }
    },
    [
      brushSize,
      doc,
      horizontalMirror,
      imagePreview,
      paintTool,
      selectedPaintColorId,
      paintCells,
    ],
  );

  /**
   * Stroke transactions. The pencil and eraser tools both group the entire
   * mouse-down → mouse-up drag into one undo entry. Other tools (inspect,
   * eyedropper, fill) are single-click and don't need transaction grouping.
   */
  const handleStrokeBegin = useCallback(() => {
    // CanvasViewer only starts this lifecycle for a real pencil/eraser drag.
    // Keep ownership with the gesture instead of the currently selected tool:
    // a keyboard shortcut may change tools before pointerup.
    beginStroke();
  }, [beginStroke]);

  const handleStrokeEnd = useCallback(() => {
    endStroke();
  }, [endStroke]);

  const handleStrokeCancel = useCallback(() => {
    cancelStroke();
  }, [cancelStroke]);

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

  const handleTraceReferenceOnBlank = useCallback(() => {
    if (!imagePreview) return;
    createNew(
      imagePreview.width,
      imagePreview.height,
      `${imagePreview.meta.name} Trace`,
      null,
    );
    clearImagePreview();
    setHighlightColorId(null);
    setPaintTool("pencil");
    setShowCenterGuide(true);
    setActivePanel("create");
    toast.success("Blank tracing grid ready");
  }, [clearImagePreview, createNew, imagePreview]);

  const revealPanel = useCallback((panel: StudioPanel) => {
    setActivePanel(panel);
    window.requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1023px)").matches) {
        document.getElementById("studio-tools")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  }, []);

  const revealCanvasForEditing = useCallback(() => {
    window.requestAnimationFrame(() => {
      if (!window.matchMedia("(max-width: 1023px)").matches) return;
      document
        .querySelector<HTMLCanvasElement>("canvas[data-grid-width]")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const handleChooseImage = useCallback(() => {
    setActivePanel("import");
    const requestNumber = imagePickerRequestRef.current + 1;
    imagePickerRequestRef.current = requestNumber;
    const openWhenReady = (attempt: number) => {
      if (imagePickerRequestRef.current !== requestNumber) return;
      const input = document.getElementById("ltg-image-input");
      if (input) {
        input.click();
        return;
      }
      if (attempt >= 200) {
        toast.error(
          "The import tools are still opening. Try Upload an image again.",
        );
        return;
      }
      window.setTimeout(() => openWhenReady(attempt + 1), 25);
    };
    openWhenReady(0);
  }, []);

  const handleStartBlank = useCallback(() => {
    handleCreateCanvas(64, 64, "Untitled Canvas", null);
    setPaintTool("pencil");
    setShowCenterGuide(true);
    setActivePanel("create");
  }, [handleCreateCanvas]);

  const handleCreateTemplate = useCallback(
    (templateId: CreativeTemplateId) => {
      const templateDoc = createCreativeTemplateDocument(templateId);
      setDoc(templateDoc);
      setHighlightColorId(null);
      setPaintTool("pencil");
      setShowCenterGuide(true);
      setActivePanel("create");
      revealCanvasForEditing();
      toast.success(`Created ${templateDoc.meta.name}`);
    },
    [revealCanvasForEditing, setDoc],
  );

  const handleApplyAiSketch = useCallback(
    (sketchDoc: NonNullable<typeof doc>) => {
      setDoc(sketchDoc);
      setHighlightColorId(null);
      setPaintTool("pencil");
      setActivePanel("create");
      revealCanvasForEditing();
      toast.success(`Applied ${sketchDoc.meta.name}`);
    },
    [revealCanvasForEditing, setDoc],
  );

  const handleLoadProjectDocument = useCallback(
    (projectDoc: NonNullable<typeof doc>) => {
      setDoc(projectDoc);
      setHighlightColorId(null);
      setPaintTool("pencil");
      setActivePanel("create");
    },
    [setDoc],
  );

  // handleAttachResidentSpec removed alongside the Island tab.

  const handleCommitImagePreview = useCallback(() => {
    if (!confirmImportReplacement()) return;
    commitImagePreview();
    setPaintTool("pencil");
    setActivePanel("create");
    revealCanvasForEditing();
    toast.success("Image committed. Paint tools are ready above the canvas.");
  }, [commitImagePreview, confirmImportReplacement, revealCanvasForEditing]);

  const handleImportJson = useCallback(
    (json: string): boolean => {
      if (!confirmImportReplacement()) return false;
      const imported = importFromJson(json);
      if (!imported) return false;
      setPaintTool("pencil");
      setActivePanel("create");
      revealCanvasForEditing();
      return true;
    },
    [confirmImportReplacement, importFromJson, revealCanvasForEditing],
  );

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
    <div className="flex min-h-svh min-w-0 flex-col lg:h-screen lg:min-h-0">
      {/* Top Bar */}
      <header className="grid min-h-11 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-1 border-b border-border bg-background px-2 sm:flex sm:h-11 sm:flex-nowrap sm:gap-3 sm:px-4">
        <Button asChild variant="ghost" size="icon-sm" className="shrink-0">
          <Link href="/" aria-label="Go home" title="Go home">
            <Home className="w-3.5 h-3.5" />
          </Link>
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="red-dot-sm shrink-0" />
          <span className="block truncate text-xs font-medium tracking-wide">
            {doc?.meta.name ?? "Tomodachi Studio"}
          </span>
        </div>

        <nav
          aria-label="Studio destinations"
          className="col-span-2 col-start-1 row-start-2 flex min-w-0 items-center gap-1 border-t border-border/60 py-1 sm:order-none sm:col-auto sm:row-auto sm:w-auto sm:border-0 sm:py-0"
        >
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 min-w-0 flex-1 px-2 text-xs sm:size-8 sm:flex-none sm:px-0 lg:h-8 lg:w-auto lg:px-2.5"
          >
            <Link href="/discover" aria-label="Explore community">
              <Compass className="size-3.5" />
              <span className="sm:hidden lg:inline">Community</span>
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 min-w-0 flex-1 px-2 text-xs sm:size-8 sm:flex-none sm:px-0 lg:h-8 lg:w-auto lg:px-2.5"
          >
            <Link href="/me/projects" aria-label="Open my projects">
              <FolderOpen className="size-3.5" />
              <span className="sm:hidden lg:inline">My Projects</span>
            </Link>
          </Button>
        </nav>

        <div className="col-span-2 col-start-3 row-start-2 flex min-w-0 items-center justify-end border-t border-border/60 py-1 sm:order-none sm:col-auto sm:row-auto sm:w-auto sm:border-0 sm:py-0">
          <CloudProjectControls
            doc={doc}
            onLoadDocument={handleLoadProjectDocument}
          />
        </div>

        {/* View toggles */}
        <div
          className="col-start-3 row-start-1 flex shrink-0 items-center gap-1 sm:col-auto sm:row-auto"
          role="toolbar"
          aria-label="Canvas view options"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowLabels((v) => !v)}
                disabled={isCopyMode}
                className={`p-1.5 rounded-sm transition-colors ${
                  isCopyMode || showLabels
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                } disabled:cursor-not-allowed disabled:opacity-70`}
                aria-label="Toggle paint-by-numbers labels"
                aria-pressed={isCopyMode || showLabels}
                title={
                  isCopyMode
                    ? "Paint-by-numbers labels stay on in Copy Guide"
                    : "Toggle paint-by-numbers labels"
                }
              >
                <Hash className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {isCopyMode
                  ? "Paint-by-numbers labels stay on in Copy Guide"
                  : "Toggle paint-by-numbers labels"}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Undo/Redo */}
        <div className="col-start-4 row-start-1 flex shrink-0 items-center gap-0.5 border-l border-border pl-1 sm:col-auto sm:row-auto sm:pl-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  if (!isCopyMode) undo();
                }}
                disabled={!canUndo || isCopyMode}
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
                onClick={() => {
                  if (!isCopyMode) redo();
                }}
                disabled={!canRedo || isCopyMode}
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

      {/* Main Content — stacks through tablet widths so the workflow panel
          never squeezes the canvas/reference into three narrow columns. */}
      <main
        id="main-content"
        className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:flex-row lg:overflow-hidden"
      >
        <h1 className="sr-only">Tomodachi Studio pixel editor</h1>
        {/* Canvas Area (full width on mobile, ~65% on desktop) */}
        <div
          className={
            visibleDoc
              ? referenceSourceUrl
                ? "min-w-0 flex-none p-3 lg:h-auto lg:min-h-0 lg:flex-1"
                : "h-[88svh] min-h-[41rem] min-w-0 flex-none p-3 lg:h-auto lg:min-h-0 lg:flex-1"
              : "min-w-0 flex-none p-3 lg:h-auto lg:min-h-0 lg:flex-1"
          }
        >
          {visibleDoc ? (
            <div className="relative flex h-full min-h-0 w-full flex-col gap-2">
              {!imagePreview && doc && !isCopyMode ? (
                <CanvasPaintToolbar
                  activeTool={paintTool}
                  brushSize={brushSize}
                  doc={doc}
                  background={canvasBackground}
                  gridDensity={gridDensity}
                  horizontalMirror={horizontalMirror}
                  selectedColorId={selectedPaintColorId}
                  showCenterGuide={showCenterGuide}
                  onBrushSizeChange={setBrushSize}
                  onBackgroundChange={setCanvasBackground}
                  onGridDensityChange={setGridDensity}
                  onHorizontalMirrorChange={(enabled) => {
                    setHorizontalMirror(enabled);
                    if (enabled) setShowCenterGuide(true);
                  }}
                  onSelectedColorChange={(colorId) => {
                    setSelectedPaintColorId(colorId);
                    setHighlightColorId(null);
                  }}
                  onShowCenterGuideChange={setShowCenterGuide}
                  onToolChange={setPaintTool}
                  onAddReference={handleChooseImage}
                  onOpenCopyGuide={() => setActivePanel("copy")}
                />
              ) : null}
              {isCopyMode ? (
                <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-orange-950 shadow-sm">
                  <div>
                    <p className="text-xs font-black">
                      Copy Guide is read-only
                    </p>
                    <p className="text-[0.68rem] leading-4 text-orange-900/75">
                      The highlighted run is the next section to recreate.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 border-orange-300 bg-white sm:min-h-9"
                    onClick={handleChooseImage}
                  >
                    <ImageUp /> Add reference
                  </Button>
                </div>
              ) : null}
              {imagePreview && (
                <div className="z-20 shrink-0 self-start rounded-lg border border-primary/30 bg-background/95 px-2 py-1 text-xs shadow-sm">
                  Preview mode · commit or cancel from Import
                </div>
              )}
              <div
                className={
                  referenceSourceUrl
                    ? "grid min-h-0 flex-none grid-rows-[20rem_auto] gap-2 sm:grid-rows-[24rem_auto] lg:flex-1 lg:grid-cols-[14rem_minmax(0,1fr)] lg:grid-rows-1"
                    : "min-h-0 flex-1"
                }
              >
                {referenceSourceUrl ? (
                  <ReferenceDock
                    className="order-2 lg:order-1"
                    flipped={referenceFlipped}
                    opacity={referenceOpacity}
                    sourceUrl={referenceSourceUrl}
                    onClear={clearLocalReference}
                    onFlippedChange={setReferenceFlipped}
                    onOpacityChange={setReferenceOpacity}
                    onTraceBlank={
                      imagePreview && referenceUnderlayUrl
                        ? handleTraceReferenceOnBlank
                        : undefined
                    }
                    onUnderlayVisibleChange={setReferenceUnderlayVisible}
                    traceStatus={
                      imagePreview
                        ? referenceUnderlayStatus === "idle"
                          ? "preparing"
                          : referenceUnderlayStatus
                        : null
                    }
                    underlayEnabled={
                      !imagePreview && referenceUnderlayStatus === "ready"
                    }
                    underlayVisible={referenceUnderlayVisible}
                  />
                ) : null}
                <div className="order-1 h-full min-h-0 min-w-0 lg:order-2">
                  <CanvasViewer
                    doc={visibleDoc}
                    background={canvasBackground}
                    highlightColorId={isCopyMode ? null : highlightColorId}
                    gridDensity={isCopyMode ? "cell" : gridDensity}
                    showLabels={isCopyMode || showLabels}
                    showCenterGuide={showCenterGuide}
                    readOnly={isCopyMode}
                    guideHighlight={isCopyMode ? activeCopyRun : null}
                    paintPreview={
                      !isCopyMode &&
                      (paintTool === "pencil" || paintTool === "eraser")
                        ? {
                            brushSize,
                            horizontalMirror,
                            tool: paintTool,
                          }
                        : null
                    }
                    referenceUnderlay={
                      referenceUnderlayUrl && !imagePreview
                        ? {
                            fit: "contain",
                            flipped: referenceFlipped,
                            opacity: referenceOpacity,
                            sourceUrl: referenceUnderlayUrl,
                            visible: referenceUnderlayVisible,
                          }
                        : null
                    }
                    onCellClick={isCopyMode ? undefined : handleCellClick}
                    onCellDrag={
                      !isCopyMode &&
                      (paintTool === "pencil" || paintTool === "eraser")
                        ? handleCellDrag
                        : undefined
                    }
                    onCellDragSegment={
                      !isCopyMode &&
                      (paintTool === "pencil" || paintTool === "eraser")
                        ? handleCellDragSegment
                        : undefined
                    }
                    onCellHover={handleCellHover}
                    onStrokeBegin={isCopyMode ? undefined : handleStrokeBegin}
                    onStrokeCancel={isCopyMode ? undefined : handleStrokeCancel}
                    onStrokeEnd={handleStrokeEnd}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-xl border border-border bg-[linear-gradient(to_right,hsl(var(--border)/0.32)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.32)_1px,transparent_1px)] bg-[size:22px_22px] px-4 py-8 sm:px-8">
              <section
                className="w-full max-w-2xl rounded-[1.5rem] border border-border bg-background/95 p-5 text-center shadow-lg backdrop-blur sm:p-8"
                aria-labelledby="studio-start-title"
              >
                <img
                  src={EMPTY_STATE_IMG}
                  alt="An empty sheet of graph paper ready for a new pixel creation"
                  className="mx-auto mb-4 h-24 w-24 rounded-2xl object-cover opacity-70 sm:h-28 sm:w-28"
                  width={1434}
                  height={1920}
                  loading="lazy"
                  decoding="async"
                />
                <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-primary">
                  New local project
                </p>
                <h2
                  id="studio-start-title"
                  className="mt-2 text-2xl font-black tracking-[-0.035em] sm:text-3xl"
                >
                  What would you like to make?
                </h2>
                <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-muted-foreground sm:text-sm">
                  Turn an image into a paintable grid, begin with a clean 64×64
                  canvas, or choose a starter design.
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    className="h-auto min-h-12 justify-center rounded-xl px-4 py-3"
                    onClick={handleChooseImage}
                  >
                    <ImageUp /> Upload an image
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-12 justify-center rounded-xl px-4 py-3"
                    onClick={handleStartBlank}
                  >
                    <Grid2x2Plus /> Start blank
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-12 justify-center rounded-xl px-4 py-3"
                    onClick={() => revealPanel("create")}
                  >
                    <Sparkles /> Browse starters
                  </Button>
                </div>
                <p className="mt-5 inline-flex items-center gap-1.5 text-[0.68rem] font-semibold text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Source images stay on this device. Anonymous editing and
                  export remain available.
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Right Panel (full width on mobile below canvas, ~320px / 384px on md/lg) */}
        <div
          id="studio-tools"
          className="flex min-h-[34rem] w-full min-w-0 shrink-0 scroll-mt-2 flex-col overflow-hidden border-t border-border bg-background lg:min-h-0 lg:w-80 lg:border-l lg:border-t-0"
        >
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
            value={activePanel}
            onValueChange={(value) => {
              const nextPanel = value as StudioPanel;
              setActivePanel(nextPanel);
              if (nextPanel !== "copy") setActiveCopyRun(null);
            }}
            className="min-w-0 flex-1 flex-col overflow-hidden"
          >
            <StudioWorkflowNav />

            <div className="flex-1 overflow-auto">
              <TabsContent value="import" className="mt-0">
                <Suspense fallback={<PanelLoading />}>
                  <ImportPanel
                    previewDoc={imagePreview}
                    onPreviewImage={handlePreviewImage}
                    onCommitPreview={handleCommitImagePreview}
                    onCancelPreview={handleCancelImagePreview}
                    onImportJson={handleImportJson}
                    isLoading={isLoading}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="create" className="mt-0">
                <Suspense fallback={<PanelLoading />}>
                  {imagePreview ? (
                    <PreviewBlockedPanel title="Create" />
                  ) : (
                    <CreationPanel
                      currentDoc={doc}
                      onActiveToolChange={setPaintTool}
                      onCreateCanvas={handleCreateCanvas}
                      onCreateTemplate={handleCreateTemplate}
                      onResampleCanvas={resampleCanvas}
                    />
                  )}
                </Suspense>
              </TabsContent>

              {/* Island tab removed in Pass 19. */}

              <TabsContent value="palette" className="mt-0 h-full">
                <Suspense fallback={<PanelLoading />}>
                  {imagePreview ? (
                    <PreviewBlockedPanel title="Palette" />
                  ) : doc ? (
                    <PalettePanel
                      usedColors={doc.usedColors}
                      colorCounts={colorCounts}
                      lockedColors={doc.lockedColors}
                      highlightColorId={highlightColorId}
                      selectedColorId={selectedPaintColorId}
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
                </Suspense>
              </TabsContent>

              <TabsContent value="optimize" className="mt-0">
                <Suspense fallback={<PanelLoading />}>
                  <OptimizerPanel
                    currentColorCount={doc?.usedColors.length ?? 0}
                    onRunOptimizer={runOptimizer}
                    disabled={!doc || !!imagePreview}
                  />
                  {imagePreview && <PreviewBlockedPanel title="Optimizer" />}
                </Suspense>
              </TabsContent>

              <TabsContent value="ai" className="mt-0">
                <Suspense fallback={<PanelLoading />}>
                  {imagePreview ? (
                    <PreviewBlockedPanel title="AI Draw" />
                  ) : (
                    <AiPanel
                      currentDoc={doc}
                      onApplySketch={handleApplyAiSketch}
                    />
                  )}
                </Suspense>
              </TabsContent>

              <TabsContent value="copy" className="mt-0">
                <Suspense fallback={<PanelLoading />}>
                  {imagePreview ? (
                    <PreviewBlockedPanel title="Copy Guide" />
                  ) : doc ? (
                    <CopyGuidePanel
                      doc={doc}
                      hasReference={Boolean(referenceSourceUrl)}
                      onActiveRunChange={setActiveCopyRun}
                      onAddReference={handleChooseImage}
                    />
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-xs text-muted-foreground">
                        Create or import a project to start Copy Guide.
                      </p>
                    </div>
                  )}
                </Suspense>
              </TabsContent>

              <TabsContent value="export" className="mt-0">
                <Suspense fallback={<PanelLoading />}>
                  <ExportPanel
                    doc={imagePreview ? null : doc}
                    disabledReason={
                      imagePreview
                        ? "Commit or cancel the image preview before exporting."
                        : undefined
                    }
                  />
                </Suspense>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function PanelLoading() {
  return (
    <div
      className="p-4 text-xs font-medium text-muted-foreground"
      role="status"
    >
      Opening tools…
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
