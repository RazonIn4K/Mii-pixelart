/**
 * CreationPanel.tsx — Manual creation and touch-up controls
 */

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPaletteColor } from "@/lib/engine/palette";
import {
  CREATIVE_TEMPLATES,
  createCreativeTemplateFixtureDocument,
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
  { label: "Face paint", name: "Face Paint Canvas", width: 256, height: 256 },
  { label: "Portrait", name: "Portrait Practice", width: 256, height: 256 },
  { label: "Sticker", name: "Sticker Practice", width: 256, height: 256 },
  { label: "Free draw", name: "Free Draw Canvas", width: 256, height: 256 },
];

const TEMPLATE_CATEGORY_ORDER = [
  "Faces & Portraits",
  "Characters",
  "Horror & Spooky",
  "Marks & Objects",
] as const;

const TEMPLATE_GROUPS = (() => {
  const cards = CREATIVE_TEMPLATES.map((template) => ({
    doc: createCreativeTemplateFixtureDocument(template.id),
    template,
  }));
  return TEMPLATE_CATEGORY_ORDER.map((category) => ({
    category,
    templates: cards.filter((card) => card.template.category === category),
  })).filter((group) => group.templates.length > 0);
})();

const StarterDesignGallery = memo(function StarterDesignGallery({
  onActiveToolChange,
  onCreateTemplate,
}: Pick<CreationPanelProps, "onActiveToolChange" | "onCreateTemplate">) {
  return (
    <div className="space-y-3 rounded-sm border border-border bg-card p-3">
      <div>
        <p className="text-xs font-semibold">Starter Designs</p>
        <p className="mt-1 text-[0.68rem] leading-4 text-muted-foreground">
          Original practice art with transparent space around every shape. Each
          one opens at the full game-copy resolution.
        </p>
      </div>
      <div className="space-y-4">
        {TEMPLATE_GROUPS.map((group) => (
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
                  className="group rounded-xl border border-[#26485a]/20 bg-[#fffaf0] p-2.5 text-left shadow-[0_2px_0_rgba(38,72,90,0.1)] transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-[#ef6b3b]/60 hover:shadow-[0_4px_0_rgba(38,72,90,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef6b3b] focus-visible:ring-offset-2"
                  onClick={() => {
                    onCreateTemplate(template.id);
                    onActiveToolChange("pencil");
                  }}
                >
                  <TemplatePreview doc={doc} />
                  <span className="mt-2 block min-h-8 break-words text-xs font-black leading-4 text-[#26485a]">
                    {template.displayName}
                  </span>
                  <span className="mt-1 block text-[0.62rem] font-bold leading-4 text-[#24786f]">
                    {template.surfaceLabel}
                  </span>
                  <span className="block text-[0.6rem] leading-4 text-muted-foreground">
                    {template.brushLabel} · {template.guideLabel}
                  </span>
                  <span className="block font-mono text-[0.6rem] text-muted-foreground">
                    {formatCountLabel(doc.usedColors.length, "color")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default function CreationPanel({
  currentDoc,
  onActiveToolChange,
  onCreateCanvas,
  onCreateTemplate,
  onResampleCanvas,
}: CreationPanelProps) {
  const [fillColorId, setFillColorId] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="section-header mb-1">Create / Fix</p>
        <p className="text-xs text-muted-foreground">
          Start on a transparent 256×256 game surface, then copy each block with
          the matching brush and guide.
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

      <StarterDesignGallery
        onActiveToolChange={onActiveToolChange}
        onCreateTemplate={onCreateTemplate}
      />

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
              Transparent
            </Button>
            <Button
              type="button"
              variant={fillColorId === "R10C7" ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-[0.7rem]"
              aria-pressed={fillColorId === "R10C7"}
              onClick={() => setFillColorId("R10C7")}
            >
              White fill
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
                256²
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

    const image = context.createImageData(preview.width, preview.height);
    const resolvedColors = new Map<string, [number, number, number]>();

    preview.colors.forEach((color, index) => {
      if (!color) return;
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
      className="aspect-square overflow-hidden rounded-lg border border-[#26485a]/20 bg-[linear-gradient(45deg,#eee4d2_25%,transparent_25%),linear-gradient(-45deg,#eee4d2_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee4d2_75%),linear-gradient(-45deg,transparent_75%,#eee4d2_75%)] bg-[#cfc2ad] bg-[length:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0px]"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full [image-rendering:pixelated]"
        data-template-preview
        data-template-preview-width={256}
        data-template-preview-height={256}
        data-template-preview-source-width={preview.width}
        data-template-preview-source-height={preview.height}
        width={preview.width}
        height={preview.height}
      />
    </div>
  );
}

function buildTemplatePreview(doc: GridDocument): {
  colors: (string | null)[];
  width: number;
  height: number;
} {
  const resolvedColors = new Map<string, string>();
  const colors = doc.cells.map((colorId) => {
    if (!colorId) return null;
    const existing = resolvedColors.get(colorId);
    if (existing) return existing;
    const color = getPaletteColor(colorId)?.hex ?? "#FF00FF";
    resolvedColors.set(colorId, color);
    return color;
  });

  return { colors, width: doc.width, height: doc.height };
}
