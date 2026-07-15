import { useMemo } from "react";
import {
  Crosshair,
  Eraser,
  FlipHorizontal2,
  ImagePlus,
  ListChecks,
  MousePointer2,
  PaintBucket,
  Palette,
  Pencil,
  Pipette,
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
import type { GridDensity } from "@/lib/engine/canvas-renderer";

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
  title: string;
}> = [
  { density: "off", label: "Off", title: "Hide copy grid" },
  { density: "coarse", label: "Coarse", title: "Guide every 8 cells" },
  { density: "medium", label: "Medium", title: "Guide every 4 cells" },
  { density: "cell", label: "Cell", title: "Guide every cell" },
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
  brushSize,
  doc,
  gridDensity,
  horizontalMirror,
  selectedColorId,
  showCenterGuide,
  onBrushSizeChange,
  onGridDensityChange,
  onHorizontalMirrorChange,
  onSelectedColorChange,
  onShowCenterGuideChange,
  onToolChange,
  onAddReference,
  onOpenCopyGuide,
}: {
  activeTool: PaintTool;
  brushSize: BrushSize;
  doc: GridDocument;
  gridDensity: GridDensity;
  horizontalMirror: boolean;
  selectedColorId: string;
  showCenterGuide: boolean;
  onBrushSizeChange: (size: BrushSize) => void;
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
      className="shrink-0 rounded-xl border border-border bg-background/95 p-2 shadow-sm backdrop-blur"
      aria-label="Canvas paint controls"
    >
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border/70 px-1 pb-2">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-primary">
            Canvas tools
          </p>
          <p className="text-[0.68rem] font-medium text-muted-foreground">
            Paint here · copy from the read-only guide
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 px-2 text-[0.68rem] font-bold sm:h-9"
            onClick={onAddReference}
          >
            <ImagePlus className="size-3.5" /> Reference
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-11 px-2 text-[0.68rem] font-bold sm:h-9"
            onClick={onOpenCopyGuide}
          >
            <ListChecks className="size-3.5" /> Copy Guide
          </Button>
        </div>
      </div>
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-end gap-2 border-b border-border/70 px-1 pb-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <div
            className="flex min-w-0 items-center rounded-lg border border-border bg-white p-0.5"
            role="group"
            aria-label="Grid density"
          >
            {GRID_DENSITY_PRESETS.map(({ density, label, title }) => (
              <button
                key={density}
                type="button"
                className={`h-9 rounded-md px-2 text-[0.68rem] font-bold transition-colors sm:px-2.5 ${
                  gridDensity === density
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                aria-label={`Grid density: ${label}`}
                aria-pressed={gridDensity === density}
                title={title}
                onClick={() => onGridDensityChange(density)}
              >
                {label}
              </button>
            ))}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`inline-flex size-10 items-center justify-center rounded-lg border transition-colors ${
                  showCenterGuide
                    ? "border-primary bg-accent text-foreground"
                    : "border-border bg-white text-muted-foreground hover:bg-accent hover:text-foreground"
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

      <div className="flex min-w-0 flex-col gap-1.5 pb-1 sm:flex-row sm:items-center">
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
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-white text-muted-foreground hover:border-primary/40 hover:text-foreground"
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

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-nowrap sm:overflow-x-auto">
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
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
                className="h-10 shrink-0 gap-2 rounded-lg bg-white px-2.5"
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
            className="flex w-full min-w-0 flex-wrap items-center gap-1 pl-1 sm:w-auto sm:shrink-0 sm:flex-nowrap"
            role="group"
            aria-label="Quick paint colors"
          >
            {quickColors.map((color, index) => (
              <button
                key={color.id}
                type="button"
                className={`size-9 shrink-0 rounded-lg border ${
                  index >= 6 ? "max-[359px]:hidden" : ""
                } ${
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
      <p className="px-1 pt-1 text-[0.68rem] font-medium text-muted-foreground">
        {activeTool === "inspect"
          ? "Choose Pencil, Eraser, Fill, or Pick color to edit."
          : `${PAINT_TOOLS.find((entry) => entry.tool === activeTool)?.label ?? "Paint"} · ${selectedColor?.name ?? selectedColorId}${brushEnabled ? ` · ${brushSize}×${brushSize}${horizontalMirror ? " · mirrored" : ""}` : ""}. Drag with mouse, touch, or pen; use arrow keys and Space on the canvas.`}
      </p>
    </section>
  );
}
