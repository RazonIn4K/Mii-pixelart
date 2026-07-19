import { useId, useMemo, useState } from "react";
import {
  Crosshair,
  Eraser,
  FlipHorizontal2,
  Gamepad2,
  ImagePlus,
  ListChecks,
  Moon,
  MousePointer2,
  PaintBucket,
  Palette,
  Pencil,
  Pipette,
  Sun,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PaintTool } from "@/components/studio/CreationPanel";
import type { GridDocument } from "@/lib/engine/grid";
import {
  SMOOTH_BRUSH_SIZES,
  type BrushMode,
  type BrushSize,
} from "@/lib/engine/paint-assists";
import { getPaletteColor, TOMODACHI_PALETTE } from "@/lib/engine/palette";
import type {
  CanvasBackground,
  GridDensity,
} from "@/lib/engine/canvas-renderer";
import {
  getGameMatchRecipe,
  PIXEL_PERFECT_GAME_BRUSHES,
  type GameGridSections,
} from "@/lib/engine/game-match";

export type { BrushMode, BrushSize } from "@/lib/engine/paint-assists";

const PAINT_TOOLS: ReadonlyArray<{
  icon: typeof Pencil;
  label: string;
  shortcut: string;
  tool: PaintTool;
}> = [
  { icon: Pencil, label: "Pencil", shortcut: "P", tool: "pencil" },
  { icon: Eraser, label: "Eraser", shortcut: "E", tool: "eraser" },
  { icon: PaintBucket, label: "Fill", shortcut: "F", tool: "fill" },
  { icon: Pipette, label: "Pick color", shortcut: "I", tool: "eyedropper" },
  { icon: MousePointer2, label: "Inspect", shortcut: "V", tool: "inspect" },
];

const FALLBACK_QUICK_COLORS = [
  "R10C1",
  "R10C7",
  "R1C3",
  "R2C3",
  "R3C3",
  "R4C2",
  "R6C3",
  "R8C3",
] as const;

const GRID_DENSITY_PRESETS: ReadonlyArray<{
  density: GridDensity;
  label: string;
  visibleLabel: string;
  title: string;
}> = [
  {
    density: "off",
    label: "Off",
    visibleLabel: "Off",
    title: "Hide project cell lines",
  },
  {
    density: "coarse",
    label: "Coarse · every 8 cells",
    visibleLabel: "8c",
    title: "Project line every 8 cells",
  },
  {
    density: "medium",
    label: "Medium · every 4 cells",
    visibleLabel: "4c",
    title: "Project line every 4 cells",
  },
  {
    density: "cell",
    label: "Cell · every cell",
    visibleLabel: "Every",
    title: "Show the boundary of every project cell",
  },
];

const GAME_GRID_PRESETS: ReadonlyArray<{
  label: string;
  sections: GameGridSections;
}> = [
  { label: "Off", sections: 0 },
  { label: "2×2", sections: 2 },
  { label: "4×4", sections: 4 },
  { label: "8×8", sections: 8 },
];

const CANVAS_BACKGROUND_PRESETS = [
  { icon: Palette, label: "Warm checker", value: "paper" },
  { icon: Sun, label: "Light checker", value: "light" },
  { icon: Moon, label: "Dark checker", value: "dark" },
] as const;

// The base palette is modeled as 11 hue families with 7 shades each. Sort by
// shade first so the popover presents an 11-column by 7-row matrix, followed
// by the separate saturated color rail.
const BASE_PALETTE_MATRIX = TOMODACHI_PALETTE.filter(
  (color) => !color.isSaturated,
).sort((a, b) => a.col - b.col || a.row - b.row);
const SATURATED_PALETTE_RAIL = TOMODACHI_PALETTE.filter(
  (color) => color.isSaturated,
).sort((a, b) => a.col - b.col);

export function CanvasPaintToolbar({
  activeTool,
  background,
  brushMode,
  brushSize,
  doc,
  gameGridSections,
  gridDensity,
  horizontalMirror,
  selectedColorId,
  showCenterGuide,
  onBrushSizeChange,
  onBrushModeChange,
  onBackgroundChange,
  onEasyDrawSetup,
  onGameGridSectionsChange,
  onGridDensityChange,
  onHorizontalMirrorChange,
  onSelectedColorChange,
  onShowCenterGuideChange,
  onToolChange,
  onAddReference,
  onOpenCopyGuide,
}: {
  activeTool: PaintTool;
  background: CanvasBackground;
  brushMode: BrushMode;
  brushSize: BrushSize;
  doc: GridDocument;
  gameGridSections: GameGridSections;
  gridDensity: GridDensity;
  horizontalMirror: boolean;
  selectedColorId: string;
  showCenterGuide: boolean;
  onBrushSizeChange: (size: BrushSize) => void;
  onBrushModeChange: (mode: BrushMode) => void;
  onBackgroundChange: (background: CanvasBackground) => void;
  onEasyDrawSetup: () => void;
  onGameGridSectionsChange: (sections: GameGridSections) => void;
  onGridDensityChange: (density: GridDensity) => void;
  onHorizontalMirrorChange: (enabled: boolean) => void;
  onSelectedColorChange: (colorId: string) => void;
  onShowCenterGuideChange: (enabled: boolean) => void;
  onToolChange: (tool: PaintTool) => void;
  onAddReference: () => void;
  onOpenCopyGuide: () => void;
}) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isBackgroundOpen, setIsBackgroundOpen] = useState(false);
  const [isGridDensityOpen, setIsGridDensityOpen] = useState(false);
  const gameMatchDescriptionId = useId();
  const selectedColor = getPaletteColor(selectedColorId);
  const gameMatch = getGameMatchRecipe(doc.width, doc.height);
  const ActiveBackgroundIcon =
    CANVAS_BACKGROUND_PRESETS.find(({ value }) => value === background)?.icon ??
    Sun;
  const quickColors = useMemo(
    () =>
      Array.from(
        new Set([selectedColorId, ...doc.usedColors, ...FALLBACK_QUICK_COLORS]),
      )
        .map((id) => getPaletteColor(id))
        .filter((color): color is NonNullable<typeof color> => Boolean(color))
        .slice(0, 10),
    [doc.usedColors, selectedColorId],
  );
  const brushEnabled = activeTool === "pencil" || activeTool === "eraser";
  const brushSizes =
    brushMode === "pixel-perfect"
      ? PIXEL_PERFECT_GAME_BRUSHES
      : SMOOTH_BRUSH_SIZES;

  const selectColor = (colorId: string) => {
    onSelectedColorChange(colorId);
    // A color choice is an immediate painting action. Closing the floating
    // matrix here keeps it from covering the canvas or intercepting the first
    // stroke after a mouse, pen, keyboard, or agent selects a swatch.
    setIsPaletteOpen(false);
    if (activeTool === "inspect" || activeTool === "eyedropper") {
      onToolChange("pencil");
    }
  };

  return (
    <section
      className="shrink-0 rounded-[1.25rem] border-2 border-[#26485a]/20 bg-[#fffaf0]/95 p-2 shadow-[0_4px_0_rgba(38,72,90,0.12)] backdrop-blur"
      aria-label="Canvas paint controls"
    >
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2 border-b border-[#26485a]/15 px-1 pb-2">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#b84426]">
            <span className="sm:hidden">Copy board</span>
            <span className="hidden sm:inline">Island Copy Workbench</span>
          </p>
          <p className="hidden text-[0.68rem] font-medium text-muted-foreground sm:block">
            One Studio cell = one pixel on the 256×256 game surface
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 rounded-xl border-[#26485a]/20 bg-white px-2 text-[0.68rem] font-black text-[#26485a] sm:h-9"
            aria-label="Reference"
            onClick={onAddReference}
          >
            <ImagePlus className="size-3.5" />
            <span className="hidden sm:inline">Reference</span>
            <span className="sm:hidden">Ref</span>
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-11 rounded-xl bg-[#b84426] px-2 text-[0.68rem] font-black text-white hover:bg-[#96381e] sm:h-9"
            aria-label="Copy Guide"
            onClick={onOpenCopyGuide}
          >
            <ListChecks className="size-3.5" />
            <span className="hidden sm:inline">Copy Guide</span>
            <span className="sm:hidden">Guide</span>
          </Button>
        </div>
      </div>
      <div
        className="mb-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-xl border border-[#24786f]/25 bg-[#e8f5ef] p-1.5 sm:flex sm:flex-nowrap sm:gap-2 sm:overflow-x-auto sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden"
        data-testid="game-match-bar"
        role="group"
        aria-label="Game copy setup"
        aria-describedby={gameMatchDescriptionId}
        title="Observed 256px square face-paint profile for manual copying; verify against your game version."
      >
        <div className="col-span-2 flex min-w-0 items-center gap-1 sm:col-auto sm:min-w-max sm:gap-2 sm:px-1">
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[0.62rem] font-black uppercase tracking-[0.1em] text-[#17384a]">
            <Gamepad2 className="size-3.5" />
            <span className="sm:hidden">Game setup</span>
            <span className="hidden sm:inline">Game copy setup</span>
          </span>
          <span className="hidden rounded-full bg-white px-2 py-1 text-[0.68rem] font-black text-[#17384a] shadow-sm sm:inline-flex">
            {doc.width}×{doc.height} surface
          </span>
          <span className="hidden rounded-full bg-white px-2 py-1 text-[0.68rem] font-black text-[#17384a] shadow-sm sm:inline-flex">
            {gameMatch.exact ? "Game matched" : "Legacy canvas"}
          </span>
          <span
            className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[0.68rem] font-black shadow-sm ${
              gameMatch.canonicalSurface
                ? "bg-[#f6d67a] text-[#17384a]"
                : "bg-white text-[#526975]"
            }`}
            data-testid="game-brush-recipe"
          >
            <span className="sr-only">
              {gameMatch.canonicalSurface
                ? `${brushMode === "pixel-perfect" ? "Pixel-perfect" : "Smooth"} ${brushSize}px brush on the 256 by 256 game surface`
                : "Convert to the 256 by 256 game surface"}
            </span>
            {gameMatch.canonicalSurface ? (
              <>
                <span className="sm:hidden" aria-hidden="true">
                  {brushSize}px{" "}
                  {brushMode === "pixel-perfect" ? "stamp" : "smooth"}
                </span>
                <span className="hidden sm:inline" aria-hidden="true">
                  {brushSize}px{" "}
                  {brushMode === "pixel-perfect"
                    ? "snapped stamp"
                    : "smooth brush"}
                </span>
              </>
            ) : (
              <>
                <span className="sm:hidden" aria-hidden="true">
                  Convert
                </span>
                <span className="hidden sm:inline" aria-hidden="true">
                  Convert to 256×256
                </span>
              </>
            )}
          </span>
          <span
            id={gameMatchDescriptionId}
            className="ml-auto shrink-0 text-[0.58rem] font-semibold text-[#526975] sm:ml-0 sm:text-[0.62rem]"
          >
            <span className="sr-only">
              Observed profile; verify against your game version.
            </span>
            <span aria-hidden="true">256px · verify</span>
          </span>
        </div>

        <span
          className="hidden h-6 w-px shrink-0 bg-[#24786f]/25 sm:block"
          aria-hidden="true"
        />
        <div
          className="flex min-w-0 items-center gap-1 rounded-lg bg-white p-0.5 sm:min-w-max"
          role="group"
          aria-label="In-game grid view"
        >
          <span className="hidden px-1 text-[0.6rem] font-black uppercase tracking-[0.08em] text-[#526975] sm:inline">
            Game grid
          </span>
          {GAME_GRID_PRESETS.map(({ label, sections }) => (
            <button
              key={sections}
              type="button"
              className={`h-11 min-w-11 rounded-md px-1 text-[0.65rem] font-black transition-colors sm:h-8 sm:min-w-9 sm:px-1.5 ${
                gameGridSections === sections
                  ? "bg-[#24786f] text-white shadow-sm"
                  : "text-[#526975] hover:bg-[#e8f5ef] hover:text-[#17384a]"
              }`}
              aria-label={`In-game grid view: ${label}`}
              aria-pressed={gameGridSections === sections}
              title={`${label} reference overlay; does not change the artwork`}
              onClick={() => onGameGridSectionsChange(sections)}
            >
              {label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          size="sm"
          className="h-11 min-w-max shrink-0 rounded-lg bg-[#17384a] px-2 text-[0.68rem] font-black text-white hover:bg-[#26485a] sm:h-9 sm:px-2.5"
          aria-label="Easy draw"
          onClick={onEasyDrawSetup}
        >
          <WandSparkles className="size-3.5" />
          <span className="sm:hidden">Easy</span>
          <span className="hidden sm:inline">Match game</span>
        </Button>
      </div>
      <div className="mb-2 flex min-w-0 flex-nowrap items-center gap-1.5 border-b border-[#26485a]/15 px-1 pb-2 sm:overflow-x-auto sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 text-[0.62rem] font-black uppercase tracking-[0.1em] text-[#526975]">
          Cell lines
        </span>
        <div className="flex min-w-0 flex-nowrap items-center gap-1.5 sm:min-w-max">
          <div
            className="hidden min-w-0 items-center rounded-xl border border-[#26485a]/20 bg-white p-0.5 sm:flex"
            role="group"
            aria-label="Grid density"
          >
            {GRID_DENSITY_PRESETS.map(
              ({ density, label, title, visibleLabel }) => (
                <button
                  key={density}
                  type="button"
                  className={`h-9 min-w-8 rounded-lg px-2 text-[0.68rem] font-black transition-colors sm:px-2.5 ${
                    gridDensity === density
                      ? "bg-[#24786f] text-white shadow-sm"
                      : "text-[#526975] hover:bg-[#e8f5ef] hover:text-[#17384a]"
                  }`}
                  aria-label={`Grid density: ${label} · ${visibleLabel}`}
                  aria-pressed={gridDensity === density}
                  title={title}
                  onClick={() => onGridDensityChange(density)}
                >
                  {visibleLabel}
                </button>
              ),
            )}
          </div>

          <Popover open={isGridDensityOpen} onOpenChange={setIsGridDensityOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-11 min-w-[4.75rem] items-center justify-center rounded-lg border border-[#26485a]/20 bg-white px-2 text-[0.68rem] font-black text-[#17384a] sm:hidden"
                aria-label={`Cell line density: ${
                  GRID_DENSITY_PRESETS.find(
                    ({ density }) => density === gridDensity,
                  )?.label ?? "Cell"
                }`}
              >
                {GRID_DENSITY_PRESETS.find(
                  ({ density }) => density === gridDensity,
                )?.visibleLabel ?? "Every"}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              collisionPadding={8}
              className="w-56 p-2 data-[state=closed]:!animate-none data-[state=open]:!animate-none sm:hidden"
              aria-label="Cell line density options"
            >
              <div
                className="grid gap-1"
                role="group"
                aria-label="Grid density"
              >
                {GRID_DENSITY_PRESETS.map(
                  ({ density, label, title, visibleLabel }) => (
                    <button
                      key={density}
                      type="button"
                      className={`flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 text-left text-sm font-bold transition-colors ${
                        gridDensity === density
                          ? "bg-[#24786f] text-white"
                          : "text-[#526975] hover:bg-[#e8f5ef] hover:text-[#17384a]"
                      }`}
                      aria-label={`Grid density: ${label}`}
                      aria-pressed={gridDensity === density}
                      title={title}
                      onClick={() => {
                        onGridDensityChange(density);
                        setIsGridDensityOpen(false);
                      }}
                    >
                      <span>{label}</span>
                      <span aria-hidden="true">{visibleLabel}</span>
                    </button>
                  ),
                )}
              </div>
            </PopoverContent>
          </Popover>

          <div
            className="hidden items-center rounded-xl border border-[#26485a]/20 bg-white p-0.5 sm:flex"
            role="group"
            aria-label="Canvas background"
          >
            {CANVAS_BACKGROUND_PRESETS.map(({ icon: Icon, label, value }) => (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`inline-flex size-9 items-center justify-center rounded-lg transition-colors ${
                      background === value
                        ? "bg-[#f6d67a] text-[#17384a] shadow-sm"
                        : "text-[#526975] hover:bg-[#fff0c2]"
                    }`}
                    aria-label={`Canvas background: ${label}`}
                    aria-pressed={background === value}
                    onClick={() => onBackgroundChange(value)}
                  >
                    <Icon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{label}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          <Popover open={isBackgroundOpen} onOpenChange={setIsBackgroundOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-[#26485a]/20 bg-white text-[#526975] transition-colors hover:bg-[#fff0c2] hover:text-[#17384a] sm:hidden"
                aria-label={`Canvas background options: ${
                  CANVAS_BACKGROUND_PRESETS.find(
                    ({ value }) => value === background,
                  )?.label ?? "Light checker"
                }`}
              >
                <ActiveBackgroundIcon className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              collisionPadding={8}
              className="w-52 p-2 data-[state=closed]:!animate-none data-[state=open]:!animate-none sm:hidden"
              aria-label="Canvas background options"
            >
              <div
                className="grid gap-1"
                role="group"
                aria-label="Choose canvas background"
              >
                {CANVAS_BACKGROUND_PRESETS.map(
                  ({ icon: Icon, label, value }) => (
                    <button
                      key={value}
                      type="button"
                      className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm font-bold transition-colors ${
                        background === value
                          ? "bg-[#f6d67a] text-[#17384a]"
                          : "text-[#526975] hover:bg-[#fff0c2] hover:text-[#17384a]"
                      }`}
                      aria-label={`Use ${label.toLowerCase()} canvas background`}
                      aria-pressed={background === value}
                      onClick={() => {
                        onBackgroundChange(value);
                        setIsBackgroundOpen(false);
                      }}
                    >
                      <Icon className="size-4" /> {label}
                    </button>
                  ),
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`inline-flex size-11 items-center justify-center rounded-lg border transition-colors sm:size-10 ${
                  showCenterGuide
                    ? "border-[#2d8f86] bg-[#e8f5ef] text-[#17384a]"
                    : "border-[#26485a]/20 bg-white text-[#526975] hover:bg-[#e8f5ef] hover:text-[#17384a]"
                }`}
                aria-keyshortcuts="G"
                aria-label="Show center guides"
                aria-pressed={showCenterGuide}
                title="Show horizontal and vertical center guides (G)"
                onClick={() => onShowCenterGuideChange(!showCenterGuide)}
              >
                <Crosshair className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Center crosshair · G</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          className="flex shrink-0 items-center gap-1"
          role="toolbar"
          aria-label="Paint tools"
        >
          {PAINT_TOOLS.map(({ icon: Icon, label, shortcut, tool }) => (
            <Tooltip key={tool}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg border transition-colors sm:size-10 ${
                    activeTool === tool
                      ? "border-[#96381e] bg-[#b84426] text-white shadow-sm"
                      : "border-[#26485a]/20 bg-white text-[#526975] hover:border-[#ef6b3b]/50 hover:text-[#17384a]"
                  }`}
                  aria-keyshortcuts={shortcut}
                  aria-label={`${label} tool`}
                  aria-pressed={activeTool === tool}
                  title={`${label} (${shortcut})`}
                  onClick={() => onToolChange(tool)}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {label} <span className="font-mono">{shortcut}</span>
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      <div className="mt-1 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-1.5 rounded-xl border border-[#26485a]/15 bg-white/70 p-1">
        <div
          className="flex min-w-max items-center gap-1 rounded-lg border border-border bg-white p-0.5"
          role="group"
          aria-label="Brush mode"
        >
          {(
            [
              ["pixel-perfect", "Game pixels"],
              ["smooth", "Smooth"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`min-h-10 rounded-md px-2.5 text-[0.68rem] font-black transition-colors ${
                brushMode === mode
                  ? "bg-[#24786f] text-white shadow-sm"
                  : "text-[#526975] hover:bg-[#e8f5ef] hover:text-[#17384a]"
              }`}
              aria-pressed={brushMode === mode}
              onClick={() => onBrushModeChange(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label={
            brushMode === "pixel-perfect"
              ? "Pixel-perfect brush footprint"
              : "Smooth brush footprint"
          }
        >
          {brushSizes.map((size) => (
            <button
              key={size}
              type="button"
              className={`inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg border px-2 font-mono text-xs font-black transition-colors ${
                brushSize === size
                  ? "border-[#96381e] bg-[#b84426] text-white shadow-sm"
                  : "border-[#26485a]/20 bg-white text-[#526975] hover:border-[#ef6b3b]/50 hover:text-[#17384a]"
              }`}
              aria-label={`${size}px ${brushMode === "pixel-perfect" ? "snapped stamp" : "smooth brush"}`}
              aria-pressed={brushSize === size}
              onClick={() => onBrushSizeChange(size)}
            >
              {size}px
            </button>
          ))}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <label
            htmlFor="studio-brush-size"
            className="hidden shrink-0 items-center gap-1 text-[0.68rem] font-bold text-muted-foreground sm:flex"
          >
            Exact size
            <select
              id="studio-brush-size"
              name="studio-brush-size"
              autoComplete="off"
              value={brushSize}
              disabled={!brushEnabled}
              onChange={(event) =>
                onBrushSizeChange(Number(event.target.value) as BrushSize)
              }
              className="h-10 rounded-lg border border-border bg-white px-2 font-mono text-xs text-foreground disabled:opacity-45"
              aria-label="Brush size"
            >
              {brushSizes.map((size) => (
                <option key={size} value={size}>
                  {size}px {brushMode === "pixel-perfect" ? "stamp" : "smooth"}
                </option>
              ))}
            </select>
          </label>

          <div
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-white p-0.5"
            role="group"
            aria-label="Symmetry assist"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex size-11 items-center justify-center rounded-md transition-colors ${
                    horizontalMirror
                      ? "bg-[#24786f] text-white shadow-sm"
                      : "text-[#526975] hover:bg-[#e8f5ef] hover:text-[#17384a]"
                  }`}
                  aria-keyshortcuts="M"
                  aria-label="Mirror brush left to right"
                  aria-pressed={horizontalMirror}
                  title="Mirror brush left to right (M)"
                  onClick={() => onHorizontalMirrorChange(!horizontalMirror)}
                >
                  <FlipHorizontal2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Mirror pencil and eraser · M</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <Popover open={isPaletteOpen} onOpenChange={setIsPaletteOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 gap-2 rounded-xl border-[#26485a]/20 bg-white px-2.5"
              aria-label={`Choose paint color. Current color ${selectedColor?.name ?? selectedColorId}`}
            >
              <span
                className="size-5 rounded border border-black/20"
                style={{ backgroundColor: selectedColor?.hex ?? "#000000" }}
                aria-hidden="true"
              />
              <span className="hidden max-w-24 truncate text-xs font-bold lg:inline">
                {selectedColor?.name ?? selectedColorId}
              </span>
              <Palette className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            collisionPadding={8}
            className="max-h-[min(78vh,var(--radix-popover-content-available-height),38rem)] w-[min(38rem,calc(100vw-1rem))] overflow-y-auto p-2 data-[state=closed]:pointer-events-none data-[state=closed]:!animate-none data-[state=open]:!animate-none sm:p-3"
            aria-label="Complete paint palette"
          >
            <div className="mb-3">
              <p className="text-sm font-black">Choose a paint color</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Selecting a color switches back to the pencil when needed.
              </p>
            </div>
            <div className="pb-1 sm:overflow-x-auto">
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:min-w-[34rem] sm:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <p className="mb-1.5 text-[0.68rem] font-bold text-muted-foreground">
                    Working shades · 11 families × 7 shades
                  </p>
                  <div
                    className="grid grid-cols-5 gap-1.5 sm:grid-cols-11"
                    role="group"
                    aria-label="11 by 7 Studio color matrix"
                    data-testid="studio-palette-matrix"
                  >
                    {BASE_PALETTE_MATRIX.map((color) => (
                      <button
                        key={color.id}
                        type="button"
                        className={`aspect-square min-h-11 rounded-md border sm:min-h-8 ${
                          selectedColorId === color.id
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-black/15"
                        }`}
                        style={{ backgroundColor: color.hex }}
                        aria-label={`Select ${color.id} ${color.name}`}
                        aria-pressed={selectedColorId === color.id}
                        title={`${color.id} · ${color.name}`}
                        onClick={() => selectColor(color.id)}
                      />
                    ))}
                  </div>
                </div>

                <div className="border-t border-border pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                  <p className="mb-1.5 text-left text-[0.68rem] font-bold text-muted-foreground sm:text-center">
                    Vivid
                  </p>
                  <div
                    className="grid grid-cols-5 gap-1.5 sm:grid-cols-1"
                    role="group"
                    aria-label="Saturated color rail"
                    data-testid="studio-saturated-color-rail"
                  >
                    {SATURATED_PALETTE_RAIL.map((color) => (
                      <button
                        key={color.id}
                        type="button"
                        className={`aspect-square min-h-11 rounded-md border sm:size-8 sm:min-h-0 ${
                          selectedColorId === color.id
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-black/15"
                        }`}
                        style={{ backgroundColor: color.hex }}
                        aria-label={`Select ${color.id} ${color.name}`}
                        aria-pressed={selectedColorId === color.id}
                        title={`${color.id} · ${color.name}`}
                        onClick={() => selectColor(color.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div
          className="hidden w-auto min-w-max shrink-0 items-center gap-1 pl-1 lg:col-span-full lg:flex"
          role="group"
          aria-label="Quick paint colors"
        >
          {quickColors.map((color, index) => (
            <button
              key={color.id}
              type="button"
              className={`size-11 shrink-0 rounded-xl border-2 sm:size-9 ${
                index >= 4 ? "max-[1199px]:hidden" : ""
              } ${
                selectedColorId === color.id
                  ? "border-[#17384a] ring-2 ring-[#f6d67a]"
                  : "border-white shadow-[0_0_0_1px_rgba(38,72,90,0.18)]"
              }`}
              style={{ backgroundColor: color.hex }}
              aria-label={`Select ${color.id} ${color.name}`}
              aria-pressed={selectedColorId === color.id}
              title={`${color.id} · ${color.name}`}
              onClick={() => selectColor(color.id)}
            />
          ))}
        </div>
      </div>
      <div
        className="mt-1 flex min-w-0 items-center gap-1.5 overflow-x-auto rounded-xl border border-[#26485a]/15 bg-white/70 p-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="Quick paint colors"
      >
        <span className="shrink-0 px-1 text-[0.6rem] font-black uppercase tracking-[0.08em] text-[#526975]">
          Colors
        </span>
        {quickColors.slice(0, 5).map((color) => (
          <button
            key={color.id}
            type="button"
            className={`size-11 shrink-0 rounded-xl border-2 ${
              selectedColorId === color.id
                ? "border-[#17384a] ring-2 ring-[#f6d67a]"
                : "border-white shadow-[0_0_0_1px_rgba(38,72,90,0.18)]"
            }`}
            style={{ backgroundColor: color.hex }}
            aria-label={`Select ${color.id} ${color.name}`}
            aria-pressed={selectedColorId === color.id}
            title={`${color.id} · ${color.name}`}
            onClick={() => selectColor(color.id)}
          />
        ))}
      </div>
      <p className="truncate px-1 pt-1 text-[0.68rem] font-medium text-muted-foreground">
        {activeTool === "inspect"
          ? "Choose Pencil, Eraser, Fill, or Pick color to edit."
          : `${PAINT_TOOLS.find((entry) => entry.tool === activeTool)?.label ?? "Paint"} · ${selectedColor?.name ?? selectedColorId}${brushEnabled ? ` · ${brushMode === "pixel-perfect" ? "snapped" : "smooth"} ${brushSize}px${horizontalMirror ? " · mirrored" : ""}` : ""}. Drag with mouse, touch, or pen; use arrow keys and Space on the canvas.`}
      </p>
    </section>
  );
}
