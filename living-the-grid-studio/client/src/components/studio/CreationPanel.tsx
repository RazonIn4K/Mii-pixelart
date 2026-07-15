/**
 * CreationPanel.tsx — Manual creation and touch-up controls
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPaletteColor } from "@/lib/engine/palette";
import {
  CREATIVE_TEMPLATES,
  createCreativeTemplateDocument,
  type CreativeTemplateId,
} from "@/lib/engine/templates";
import type { GridDocument } from "@/lib/engine/grid";
import { formatCountLabel } from "@/lib/format-count";

export type PaintTool = "inspect" | "pencil" | "eraser" | "eyedropper" | "fill";

interface CreationPanelProps {
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
}

const STARTER_PRESETS = [
  { label: "Face Paint", name: "Face Paint Canvas", width: 64, height: 64 },
  { label: "Character 64", name: "Character Canvas", width: 64, height: 64 },
  { label: "Sprite 32", name: "Sprite Canvas", width: 32, height: 32 },
  { label: "Sticker 64", name: "Sticker Canvas", width: 64, height: 64 },
  { label: "Icon 16", name: "Icon Canvas", width: 16, height: 16 },
  { label: "Full 64", name: "Full Image Canvas", width: 64, height: 64 },
];

const TEMPLATE_CATEGORY_ORDER = [
  "Faces & Portraits",
  "Characters",
  "Horror & Spooky",
  "Marks & Objects",
] as const;

export default function CreationPanel({
  currentDoc,
  onActiveToolChange,
  onCreateCanvas,
  onCreateTemplate,
  onResampleCanvas,
}: CreationPanelProps) {
  const [fillColorId, setFillColorId] = useState<string | null>("R10C7");
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
            <p className="text-xs font-semibold">Canvas Detail</p>
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
        <p className="text-xs font-semibold">Starter Designs</p>
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
                      {formatCountLabel(doc.usedColors.length, "color")}
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
          <p className="text-xs font-semibold">Starter Canvas</p>
          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              variant={fillColorId === null ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-[0.7rem]"
              aria-pressed={fillColorId === null}
              onClick={() => setFillColorId(null)}
            >
              Empty
            </Button>
            <Button
              type="button"
              variant={fillColorId === "R10C7" ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-[0.7rem]"
              aria-pressed={fillColorId === "R10C7"}
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

      {currentDoc ? (
        <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950">
          Paint tools and the complete color picker stay above the canvas while
          you browse starters here, so there is only one active editing toolbar.
        </p>
      ) : null}
    </div>
  );
}

function TemplatePreview({ doc }: { doc: GridDocument }) {
  const preview = useMemo(() => buildTemplatePreview(doc), [doc]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const image = context.createImageData(preview.size, preview.size);
    const resolvedColors = new Map<string, [number, number, number]>();

    preview.colors.forEach((color, index) => {
      let rgb = resolvedColors.get(color);
      if (!rgb) {
        const value = Number.parseInt(color.slice(1), 16);
        rgb = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
        resolvedColors.set(color, rgb);
      }

      const offset = index * 4;
      image.data[offset] = rgb[0];
      image.data[offset + 1] = rgb[1];
      image.data[offset + 2] = rgb[2];
      image.data[offset + 3] = 0xff;
    });

    context.putImageData(image, 0, 0);
  }, [preview]);

  return (
    <div
      className="aspect-square overflow-hidden rounded-sm border border-border bg-white"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full [image-rendering:pixelated]"
        data-template-preview
        width={preview.size}
        height={preview.size}
      />
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
