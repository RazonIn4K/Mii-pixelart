/**
 * CreationPanel.tsx — Manual creation and touch-up controls
 */

import { useMemo, useState } from "react";
import {
  Eraser,
  MousePointer2,
  PaintBucket,
  Pencil,
  Pipette,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TOMODACHI_PALETTE,
  getPaletteColor,
  type PaletteColor,
} from "@/lib/engine/palette";
import {
  CREATIVE_TEMPLATES,
  createCreativeTemplateDocument,
  type CreativeTemplateId,
} from "@/lib/engine/templates";
import type { GridDocument } from "@/lib/engine/grid";

export type PaintTool = "inspect" | "pencil" | "eraser" | "eyedropper" | "fill";

interface CreationPanelProps {
  activeTool: PaintTool;
  selectedColorId: string;
  onActiveToolChange: (tool: PaintTool) => void;
  onCreateCanvas: (
    width: number,
    height: number,
    name: string,
    fillColorId: string | null,
  ) => void;
  onCreateTemplate: (templateId: CreativeTemplateId) => void;
  currentDoc: GridDocument | null;
  onResampleCanvas: (width: number, height: number) => void;
  onSelectedColorChange: (colorId: string) => void;
}

const STARTER_PRESETS = [
  { label: "Mii Mask", name: "Mii Mask Canvas", width: 64, height: 64 },
  { label: "Character 64", name: "Character Canvas", width: 64, height: 64 },
  { label: "Sprite 32", name: "Sprite Canvas", width: 32, height: 32 },
  { label: "Sticker 64", name: "Sticker Canvas", width: 64, height: 64 },
  { label: "Icon 16", name: "Icon Canvas", width: 16, height: 16 },
  { label: "Full 64", name: "Full Image Canvas", width: 64, height: 64 },
];

const TOOL_BUTTONS: {
  icon: typeof MousePointer2;
  label: string;
  tool: PaintTool;
}[] = [
  { icon: MousePointer2, label: "Inspect tool", tool: "inspect" },
  { icon: Pencil, label: "Pencil tool", tool: "pencil" },
  { icon: Eraser, label: "Eraser tool", tool: "eraser" },
  { icon: Pipette, label: "Eyedropper tool", tool: "eyedropper" },
  { icon: PaintBucket, label: "Fill bucket tool", tool: "fill" },
];

const TEMPLATE_CATEGORY_ORDER = [
  "People & Masks",
  "Characters",
  "Horror & Spooky",
  "Marks & Objects",
] as const;

export default function CreationPanel({
  activeTool,
  currentDoc,
  selectedColorId,
  onActiveToolChange,
  onCreateCanvas,
  onCreateTemplate,
  onResampleCanvas,
  onSelectedColorChange,
}: CreationPanelProps) {
  const [fillColorId, setFillColorId] = useState<string | null>("R10C7");
  const selectedColor = getPaletteColor(selectedColorId);
  const templateGroups = useMemo(() => {
    const cards = CREATIVE_TEMPLATES.map((template) => ({
      doc: createCreativeTemplateDocument(template.id),
      template,
    }));

    return TEMPLATE_CATEGORY_ORDER.map((category) => ({
      category,
      templates: cards.filter((card) => card.template.category === category),
    })).filter((group) => group.templates.length > 0);
  }, []);

  const handleSelectColor = (colorId: string) => {
    onSelectedColorChange(colorId);
    if (activeTool === "inspect" || activeTool === "eyedropper") {
      onActiveToolChange("pencil");
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="section-header mb-1">Create / Fix</p>
        <p className="text-xs text-muted-foreground">
          Start blank, paint details, or touch up an imported guide.
        </p>
      </div>

      {currentDoc && (
        <div className="space-y-3 rounded-sm border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold">Canvas Detail</Label>
            <span className="font-mono text-[0.68rem] text-muted-foreground">
              {currentDoc.width}x{currentDoc.height}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start text-xs"
              disabled={currentDoc.width >= 256 || currentDoc.height >= 256}
              onClick={() =>
                onResampleCanvas(
                  Math.min(256, currentDoc.width * 2),
                  Math.min(256, currentDoc.height * 2),
                )
              }
            >
              Upscale 2x
            </Button>
            {[
              [64, "64 Detail"],
              [96, "96 Detail"],
              [128, "128 Detail"],
              [256, "256 Detail"],
            ].map(([size, label]) => (
              <Button
                key={size}
                type="button"
                variant="outline"
                size="sm"
                className="justify-start text-xs"
                disabled={
                  currentDoc.width === size && currentDoc.height === size
                }
                onClick={() => onResampleCanvas(Number(size), Number(size))}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <Label className="text-xs font-semibold">Starter Designs</Label>
        <div className="space-y-4">
          {templateGroups.map((group) => (
            <div key={group.category} className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3 w-3 text-muted-foreground" />
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {group.category}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.templates.map(({ doc, template }) => (
                  <button
                    key={template.id}
                    type="button"
                    className="group rounded-sm border border-border bg-background p-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/50"
                    onClick={() => {
                      onCreateTemplate(template.id);
                      onActiveToolChange("pencil");
                    }}
                  >
                    <TemplatePreview doc={doc} />
                    <span className="mt-2 block truncate text-xs font-medium">
                      {template.name}
                    </span>
                    <span className="block font-mono text-[0.65rem] text-muted-foreground">
                      {template.width}x{template.height} ·{" "}
                      {doc.usedColors.length} colors
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-semibold">Starter Canvas</Label>
          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              variant={fillColorId === null ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-[0.7rem]"
              onClick={() => setFillColorId(null)}
            >
              Empty
            </Button>
            <Button
              type="button"
              variant={fillColorId === "R10C7" ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-[0.7rem]"
              onClick={() => setFillColorId("R10C7")}
            >
              White
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {STARTER_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="outline"
              size="sm"
              className="justify-start text-xs"
              onClick={() => {
                onCreateCanvas(
                  preset.width,
                  preset.height,
                  preset.name,
                  fillColorId,
                );
                onActiveToolChange("pencil");
              }}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              <span>{preset.label}</span>
              <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">
                {preset.width}x{preset.height}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <Label className="text-xs font-semibold">Tools</Label>
        <div className="grid grid-cols-5 gap-2">
          {TOOL_BUTTONS.map(({ icon: Icon, label, tool }) => (
            <Tooltip key={tool}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={`flex h-9 items-center justify-center rounded-sm border transition-colors ${
                    activeTool === tool
                      ? "border-primary bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label={label}
                  title={label}
                  onClick={() => onActiveToolChange(tool)}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-sm border border-border bg-background p-2">
          <div
            className="h-7 w-7 shrink-0 rounded-sm border border-border"
            style={{ backgroundColor: selectedColor?.hex ?? "#000000" }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">
              {selectedColor?.name ?? selectedColorId}
            </p>
            <p className="font-mono text-[0.7rem] text-muted-foreground">
              {selectedColorId}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <Label className="text-xs font-semibold">Paint Palette</Label>
        <PaletteGrid
          colors={TOMODACHI_PALETTE.filter((color) => !color.isSaturated)}
          selectedColorId={selectedColorId}
          onSelectColor={handleSelectColor}
        />
        <PaletteGrid
          colors={TOMODACHI_PALETTE.filter((color) => color.isSaturated)}
          selectedColorId={selectedColorId}
          onSelectColor={handleSelectColor}
        />
      </div>
    </div>
  );
}

function TemplatePreview({ doc }: { doc: GridDocument }) {
  const preview = useMemo(() => buildTemplatePreview(doc), [doc]);

  return (
    <div
      className="aspect-square overflow-hidden rounded-sm border border-border bg-white"
      aria-hidden="true"
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${preview.size}, minmax(0, 1fr))`,
        }}
      >
        {preview.colors.map((color, index) => (
          <span key={index} style={{ backgroundColor: color }} />
        ))}
      </div>
    </div>
  );
}

function buildTemplatePreview(doc: GridDocument): {
  colors: string[];
  size: number;
} {
  const size = Math.min(24, doc.width, doc.height);
  const colors: string[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(
        doc.width - 1,
        Math.floor(((x + 0.5) / size) * doc.width),
      );
      const sourceY = Math.min(
        doc.height - 1,
        Math.floor(((y + 0.5) / size) * doc.height),
      );
      const colorId = doc.cells[sourceY * doc.width + sourceX];
      colors.push(
        colorId ? (getPaletteColor(colorId)?.hex ?? "#FFFFFF") : "#FFFFFF",
      );
    }
  }

  return { colors, size };
}

function PaletteGrid({
  colors,
  selectedColorId,
  onSelectColor,
}: {
  colors: PaletteColor[];
  selectedColorId: string;
  onSelectColor: (colorId: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {colors.map((color) => (
        <Tooltip key={color.id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`aspect-square rounded-sm border ${
                selectedColorId === color.id
                  ? "border-primary ring-2 ring-primary/25"
                  : "border-border"
              }`}
              style={{ backgroundColor: color.hex }}
              aria-label={`Select ${color.id} ${color.name}`}
              title={`${color.id} ${color.name}`}
              onClick={() => onSelectColor(color.id)}
            />
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs font-mono">
              {color.id} · {color.name} · {color.hex}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
