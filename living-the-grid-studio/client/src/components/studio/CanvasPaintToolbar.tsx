import { useMemo } from "react";
import {
  Crosshair,
  Eraser,
  FlipHorizontal2,
  ImagePlus,
  ListChecks,
  Moon,
  MousePointer2,
  PaintBucket,
  Palette,
  Pencil,
  Pipette,
  Sun,
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
import type { BrushSize } from "@/lib/engine/paint-assists";
import { getPaletteColor, TOMODACHI_PALETTE } from "@/lib/engine/palette";
import type {
  CanvasBackground,
  GridDensity,
} from "@/lib/engine/canvas-renderer";

export type { BrushSize } from "@/lib/engine/paint-assists";

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
    visibleLabel: "Clean",
    title: "Hide copy grid",
  },
  {
    density: "coarse",
    label: "Coarse",
    visibleLabel: "8",
    title: "Section guide every 8 cells",
  },
  {
    density: "medium",
    label: "Medium",
    visibleLabel: "4",
    title: "Block guide every 4 cells with stronger 8-cell sections",
  },
  {
    density: "cell",
    label: "Cell",
    visibleLabel: "Cells",
    title: "Every cell with stronger 8-cell sections",
  },
];

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
  brushSize,
  doc,
  gridDensity,
  horizontalMirror,
  selectedColorId,
  showCenterGuide,
  onBrushSizeChange,
  onBackgroundChange,
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
  brushSize: BrushSize;
  doc: GridDocument;
  gridDensity: GridDensity;
  horizontalMirror: boolean;
  selectedColorId: string;
  showCenterGuide: boolean;
  onBrushSizeChange: (size: BrushSize) => void;
  onBackgroundChange: (background: CanvasBackground) => void;
  onGridDensityChange: (density: GridDensity) => void;
  onHorizontalMirrorChange: (enabled: boolean) => void;
  onSelectedColorChange: (colorId: string) => void;
  onShowCenterGuideChange: (enabled: boolean) => void;
  onToolChange: (tool: PaintTool) => void;
  onAddReference: () => void;
  onOpenCopyGuide: () => void;
}) {
  const selectedColor = getPaletteColor(selectedColorId);
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

  const selectColor = (colorId: string) => {
    onSelectedColorChange(colorId);
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
            One cell on screen = one project cell
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
      <div className="mb-2 flex min-w-0 items-center gap-1.5 overflow-x-auto border-b border-[#26485a]/15 px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 text-[0.62rem] font-black uppercase tracking-[0.1em] text-[#526975]">
          Grid
        </span>
        <div className="flex min-w-max items-center gap-1.5">
          <div
            className="flex min-w-0 items-center rounded-xl border border-[#26485a]/20 bg-white p-0.5"
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

          <div
            className="flex items-center rounded-xl border border-[#26485a]/20 bg-white p-0.5"
            role="group"
            aria-label="Canvas background"
          >
            {(
              [
                { icon: Palette, label: "Paper", value: "paper" },
                { icon: Sun, label: "Light checker", value: "light" },
                { icon: Moon, label: "Dark checker", value: "dark" },
              ] as const
            ).map(({ icon: Icon, label, value }) => (
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

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`inline-flex size-10 items-center justify-center rounded-lg border transition-colors ${
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

      <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-x-auto rounded-xl border border-[#26485a]/15 bg-white/70 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <label
          htmlFor="studio-brush-size"
          className="flex shrink-0 items-center gap-1 text-[0.68rem] font-bold text-muted-foreground"
        >
          Size
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
            {[1, 2, 3, 5].map((size) => (
              <option key={size} value={size}>
                {size}×{size}
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

        <Popover>
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
            className="max-h-[min(70vh,34rem)] w-[min(38rem,calc(100vw-2rem))] overflow-y-auto p-3"
            aria-label="Complete paint palette"
          >
            <div className="mb-3">
              <p className="text-sm font-black">Choose a paint color</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Selecting a color switches back to the pencil when needed.
              </p>
            </div>
            <div className="overflow-x-auto pb-1">
              <div className="grid min-w-[34rem] grid-cols-[minmax(0,1fr)_auto] gap-3">
                <div>
                  <p className="mb-1.5 text-[0.68rem] font-bold text-muted-foreground">
                    Working shades · 11 families × 7 shades
                  </p>
                  <div
                    className="grid grid-cols-11 gap-1.5"
                    role="group"
                    aria-label="11 by 7 Studio color matrix"
                    data-testid="studio-palette-matrix"
                  >
                    {BASE_PALETTE_MATRIX.map((color) => (
                      <button
                        key={color.id}
                        type="button"
                        className={`aspect-square min-h-8 rounded-md border ${
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

                <div className="border-l border-border pl-3">
                  <p className="mb-1.5 text-center text-[0.68rem] font-bold text-muted-foreground">
                    Vivid
                  </p>
                  <div
                    className="grid grid-cols-1 gap-1.5"
                    role="group"
                    aria-label="Saturated color rail"
                    data-testid="studio-saturated-color-rail"
                  >
                    {SATURATED_PALETTE_RAIL.map((color) => (
                      <button
                        key={color.id}
                        type="button"
                        className={`size-8 rounded-md border ${
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
          className="hidden w-auto min-w-max shrink-0 items-center gap-1 pl-1 lg:flex"
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
        {quickColors.slice(0, 6).map((color) => (
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
      <p className="hidden px-1 pt-1 text-[0.68rem] font-medium text-muted-foreground sm:block">
        {activeTool === "inspect"
          ? "Choose Pencil, Eraser, Fill, or Pick color to edit."
          : `${PAINT_TOOLS.find((entry) => entry.tool === activeTool)?.label ?? "Paint"} · ${selectedColor?.name ?? selectedColorId}${brushEnabled ? ` · ${brushSize}×${brushSize}${horizontalMirror ? " · mirrored" : ""}` : ""}. Drag with mouse, touch, or pen; use arrow keys and Space on the canvas.`}
      </p>
    </section>
  );
}
