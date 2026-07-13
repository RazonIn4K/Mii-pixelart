import { useMemo } from "react";
import {
  AlignCenterVertical,
  Eraser,
  FlipHorizontal2,
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

export function CanvasPaintToolbar({
  activeTool,
  brushSize,
  doc,
  horizontalMirror,
  selectedColorId,
  showCenterGuide,
  onBrushSizeChange,
  onHorizontalMirrorChange,
  onSelectedColorChange,
  onShowCenterGuideChange,
  onToolChange,
}: {
  activeTool: PaintTool;
  brushSize: BrushSize;
  doc: GridDocument;
  horizontalMirror: boolean;
  selectedColorId: string;
  showCenterGuide: boolean;
  onBrushSizeChange: (size: BrushSize) => void;
  onHorizontalMirrorChange: (enabled: boolean) => void;
  onSelectedColorChange: (colorId: string) => void;
  onShowCenterGuideChange: (enabled: boolean) => void;
  onToolChange: (tool: PaintTool) => void;
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
          <label className="flex shrink-0 items-center gap-1 text-[0.68rem] font-bold text-muted-foreground">
            Size
            <select
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
            aria-label="Face assist"
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

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex size-11 items-center justify-center rounded-md transition-colors ${
                    showCenterGuide
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  aria-keyshortcuts="G"
                  aria-label="Show center-axis guide"
                  aria-pressed={showCenterGuide}
                  title="Show center-axis guide (G)"
                  onClick={() => onShowCenterGuideChange(!showCenterGuide)}
                >
                  <AlignCenterVertical className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Center-axis guide · G</p>
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
              className="max-h-[min(60vh,30rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-3"
              aria-label="Complete paint palette"
            >
              <div className="mb-3">
                <p className="text-sm font-black">Choose a paint color</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Selecting a color switches back to the pencil when needed.
                </p>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {TOMODACHI_PALETTE.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    className={`aspect-square min-h-9 rounded-md border ${
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
            </PopoverContent>
          </Popover>

          <div
            className="flex w-full min-w-0 flex-wrap items-center gap-1 pl-1 sm:w-auto sm:shrink-0 sm:flex-nowrap"
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
