/**
 * ExportPanel.tsx — Export controls for JSON, PNG, and reference packs
 *
 * DESIGN: "Paper Studio" — Clean export options like a stationery order form.
 */

import { useState } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { FileJson, Image as ImageIcon, Package } from "lucide-react";
import { getColorUsageCounts, type GridDocument } from "@/lib/engine/grid";
import { downloadGridDocument, exportGridJson } from "@/lib/engine/json-io";
import {
  downloadGridAsPng,
  exportGridAsPng,
  exportPaletteSheetAsPng,
} from "@/lib/engine/canvas-renderer";
import { TOMODACHI_PALETTE } from "@/lib/engine/palette";
import { validateMiiResidentSpec } from "@shared/residents";
import { formatCountLabel } from "@/lib/format-count";

interface ExportPanelProps {
  doc: GridDocument | null;
  disabledReason?: string;
}

const MAX_CLEAN_EXPORT_DIMENSION = 2048;
const MAX_LABELED_EXPORT_DIMENSION = 3072;

/**
 * Bound PNG dimensions for the canonical 256×256 surface. Labeled guides keep
 * 12 pixels per cell; smaller legacy documents retain up to the old 16px
 * detail without allocating a 4096×4096 canvas on phones.
 */
export function getExportCellSize(
  doc: Pick<GridDocument, "height" | "width">,
  labeled: boolean,
): number {
  const maxDimension = Math.max(1, doc.width, doc.height);
  const outputLimit = labeled
    ? MAX_LABELED_EXPORT_DIMENSION
    : MAX_CLEAN_EXPORT_DIMENSION;
  return Math.max(1, Math.min(16, Math.floor(outputLimit / maxDimension)));
}

export default function ExportPanel({ doc, disabledReason }: ExportPanelProps) {
  const [isBuildingPack, setIsBuildingPack] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportJson = () => {
    if (!doc) return;
    setExportError(null);
    try {
      downloadGridDocument(doc);
    } catch {
      setExportError(getExportFailureMessage("json"));
    }
  };

  const handleExportPng = () => {
    if (!doc) return;
    setExportError(null);
    try {
      const safeName = getSafeProjectName(doc);
      downloadGridAsPng(
        doc,
        {
          cellSize: getExportCellSize(doc, true),
          showGrid: true,
          showLabels: true,
        },
        `${safeName}-guide-labeled.png`,
      );
    } catch {
      setExportError(getExportFailureMessage("image"));
    }
  };

  const handleExportPngClean = () => {
    if (!doc) return;
    setExportError(null);
    try {
      const safeName = getSafeProjectName(doc);
      downloadGridAsPng(
        doc,
        {
          cellSize: getExportCellSize(doc, false),
          showGrid: false,
          showLabels: false,
        },
        `${safeName}-clean.png`,
      );
    } catch {
      setExportError(getExportFailureMessage("image"));
    }
  };

  const handleExportReferencePack = async () => {
    if (!doc || isBuildingPack) return;
    setIsBuildingPack(true);
    setExportError(null);

    try {
      const json = exportGridJson(doc);
      const safeName = getSafeProjectName(doc);
      const zip = new JSZip();

      zip.file("project.json", json);
      zip.file(
        "guide-labeled.png",
        dataUrlToUint8Array(
          exportGridAsPng(doc, {
            cellSize: getExportCellSize(doc, true),
            showGrid: true,
            showLabels: true,
          }),
        ),
        { binary: true },
      );
      zip.file(
        "guide-clean.png",
        dataUrlToUint8Array(
          exportGridAsPng(doc, {
            cellSize: getExportCellSize(doc, false),
            showGrid: false,
            showLabels: false,
          }),
        ),
        { binary: true },
      );
      zip.file(
        "palette-sheet.png",
        dataUrlToUint8Array(exportPaletteSheetAsPng(doc)),
        { binary: true },
      );
      zip.file("paint-order.csv", buildPaintOrderCsv(doc));
      zip.file("source-notes.txt", buildSourceNotes(doc));
      zip.file("manifest.json", buildReferencePackManifest(doc));
      zip.file("reference.html", buildReferenceHtml(doc, json));

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `${safeName}-reference-pack.zip`);
    } catch {
      setExportError(getExportFailureMessage("pack"));
    } finally {
      setIsBuildingPack(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="section-header mb-1">Export</p>
        <p className="text-xs text-muted-foreground">
          Download Studio project data, images, and manual Copy Guides. These
          are not Nintendo game or save files.
        </p>
        {doc && (
          <p className="mt-1 text-xs text-muted-foreground">
            Labeled guide: {doc.width * getExportCellSize(doc, true)}×
            {doc.height * getExportCellSize(doc, true)} px · Clean image:{" "}
            {doc.width * getExportCellSize(doc, false)}×
            {doc.height * getExportCellSize(doc, false)} px
          </p>
        )}
        {disabledReason && (
          <p className="mt-2 rounded-sm border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-relaxed text-amber-950">
            {disabledReason}
          </p>
        )}
        {exportError && (
          <p
            className="mt-2 rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 text-xs leading-relaxed text-red-950"
            role="alert"
          >
            {exportError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={handleExportJson}
          disabled={!doc}
        >
          <FileJson className="w-3.5 h-3.5 mr-2" />
          Export JSON
          <span className="ml-auto text-muted-foreground">.json</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={handleExportPng}
          disabled={!doc}
        >
          <ImageIcon className="w-3.5 h-3.5 mr-2" />
          Export Guide (with labels)
          <span className="ml-auto text-muted-foreground">.png</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={handleExportPngClean}
          disabled={!doc}
        >
          <ImageIcon className="w-3.5 h-3.5 mr-2" />
          Export Clean Image
          <span className="ml-auto text-muted-foreground">.png</span>
        </Button>

        <div className="pt-2">
          <Button
            size="sm"
            className="w-full justify-start text-xs tracking-wide"
            onClick={handleExportReferencePack}
            disabled={!doc || isBuildingPack}
          >
            <Package className="w-3.5 h-3.5 mr-2" />
            {isBuildingPack
              ? "Building Reference Pack..."
              : "Export Reference Pack"}
            <span className="ml-auto text-muted-foreground">.zip</span>
          </Button>
          <p className="text-xs text-muted-foreground mt-1.5">
            Downloads a ZIP with JSON, guide PNGs, palette sheet, paint order,
            and reference HTML.
          </p>
        </div>
      </div>
    </div>
  );
}

export function getExportFailureMessage(
  kind: "image" | "json" | "pack",
): string {
  if (kind === "json") {
    return "The project JSON could not be downloaded. Check browser download permissions and try again.";
  }
  if (kind === "image") {
    return "The image could not be generated in this browser. Close other tabs or try a desktop browser, then export again.";
  }
  return "The reference pack could not be built in this browser. Try the individual JSON or PNG exports, close other tabs, or use a desktop browser.";
}

export function buildReferenceHtml(doc: GridDocument, json: string): string {
  const paletteById = new Map(
    TOMODACHI_PALETTE.map((color) => [color.id, color]),
  );
  const resident = getAttachedResident(doc);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(doc.meta.name)} - Reference Pack</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif; background: #FAFAF5; color: #4A4A4A; padding: 2rem; }
    h1 { font-size: 1.25rem; font-weight: 600; }
    .meta { font-size: 0.75rem; color: #888; margin-bottom: 2rem; }
    .palette { display: flex; flex-wrap: wrap; gap: 4px; margin: 1rem 0; }
    .swatch { width: 24px; height: 24px; border-radius: 2px; border: 1px solid #ddd; }
    pre { font-size: 0.7rem; background: #f5f5f0; padding: 1rem; border-radius: 4px; overflow: auto; max-height: 300px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(doc.meta.name)}</h1>
  <div class="meta">
    ${doc.width}×${doc.height} grid · ${formatCountLabel(doc.usedColors.length, "color")} · Created ${doc.meta.createdAt}
  </div>
  <p class="meta">Fan-made repaint reference. Not affiliated with Nintendo, TomodachiShare, or any referenced source.</p>
  ${
    resident
      ? `<h2 style="font-size:0.875rem;font-weight:600;">Resident Feature Sheet</h2>
  <table style="border-collapse:collapse;width:100%;margin:1rem 0;font-size:0.75rem;">
    <tr><th style="text-align:left;border:1px solid #ddd;padding:0.4rem;background:#f5f5f0;">Resident</th><td style="border:1px solid #ddd;padding:0.4rem;">${escapeHtml(resident.name)}</td></tr>
    <tr><th style="text-align:left;border:1px solid #ddd;padding:0.4rem;background:#f5f5f0;">District</th><td style="border:1px solid #ddd;padding:0.4rem;">${escapeHtml(resident.district)}</td></tr>
    <tr><th style="text-align:left;border:1px solid #ddd;padding:0.4rem;background:#f5f5f0;">Bridge Below</th><td style="border:1px solid #ddd;padding:0.4rem;">${escapeHtml(resident.bridgeBelow)}</td></tr>
    <tr><th style="text-align:left;border:1px solid #ddd;padding:0.4rem;background:#f5f5f0;">Bridge Above</th><td style="border:1px solid #ddd;padding:0.4rem;">${escapeHtml(resident.bridgeAbove)}</td></tr>
    <tr><th style="text-align:left;border:1px solid #ddd;padding:0.4rem;background:#f5f5f0;">Pixel Notes</th><td style="border:1px solid #ddd;padding:0.4rem;">${escapeHtml(resident.pixelArtNotes)}</td></tr>
    <tr><th style="text-align:left;border:1px solid #ddd;padding:0.4rem;background:#f5f5f0;">Sources</th><td style="border:1px solid #ddd;padding:0.4rem;">${resident.sourceCredits.map(escapeHtml).join("<br>")}</td></tr>
  </table>`
      : ""
  }
  <h2 style="font-size:0.875rem;font-weight:600;">Palette</h2>
  <div class="palette">
    ${doc.usedColors
      .map((id) => {
        const color = paletteById.get(id);
        const swatchColor = color?.hex ?? id;
        const title = color ? `${color.id} - ${color.name} - ${color.hex}` : id;
        return `<div class="swatch" style="background:${escapeHtml(swatchColor)}" title="${escapeHtml(title)}"></div>`;
      })
      .join("\n    ")}
  </div>
  <h2 style="font-size:0.875rem;font-weight:600;">Project JSON</h2>
  <pre>${escapeHtml(json)}</pre>
</body>
</html>`;
}

export function getSafeProjectName(doc: GridDocument): string {
  return doc.meta.name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function buildPaintOrderCsv(doc: GridDocument): string {
  const counts = getColorUsageCounts(doc);
  const paletteById = new Map(
    TOMODACHI_PALETTE.map((color) => [color.id, color]),
  );
  const rows = doc.usedColors
    .map((id) => ({
      color: paletteById.get(id),
      count: counts.get(id) ?? 0,
      id,
    }))
    .sort((a, b) => b.count - a.count)
    .map((entry, index) =>
      [
        index + 1,
        entry.id,
        entry.color?.name ?? "Unknown",
        entry.color?.hex ?? "",
        entry.count,
        `${((entry.count / Math.max(1, doc.width * doc.height)) * 100).toFixed(2)}%`,
      ]
        .map(csvEscape)
        .join(","),
    );

  return [
    ["paintOrder", "paletteId", "name", "hex", "cellCount", "coverage"]
      .map(csvEscape)
      .join(","),
    ...rows,
  ].join("\n");
}

function buildSourceNotes(doc: GridDocument): string {
  const lines = [
    `${doc.meta.name}`,
    `${doc.width}x${doc.height} grid`,
    formatCountLabel(doc.usedColors.length, "color"),
    "",
    "Fan-made repaint reference. Not affiliated with Nintendo, Tomodachi Life, TomodachiShare, or any referenced source.",
    "",
    "Suggested painting order:",
    "1. Paint the largest/background colors first.",
    "2. Paint midtone regions next.",
    "3. Save one-cell details, eyes, text, outlines, and locked colors for last.",
    "",
    "Files in this pack:",
    "- project.json: editable project data.",
    "- guide-labeled.png: repaint guide with grid and labels.",
    "- guide-clean.png: clean pixel image without labels.",
    "- palette-sheet.png: used color reference sheet.",
    "- paint-order.csv: colors sorted by cell count.",
    "- reference.html: browser-readable reference page.",
    "- manifest.json: pack metadata.",
  ];
  return `${lines.join("\n")}\n`;
}

function buildReferencePackManifest(doc: GridDocument): string {
  return JSON.stringify(
    {
      app: "Tomodachi Studio",
      createdAt: new Date().toISOString(),
      disclaimer:
        "Fan-made repaint reference. Not affiliated with Nintendo, Tomodachi Life, TomodachiShare, or any referenced source.",
      files: [
        "project.json",
        "guide-labeled.png",
        "guide-clean.png",
        "palette-sheet.png",
        "paint-order.csv",
        "source-notes.txt",
        "reference.html",
      ],
      grid: {
        height: doc.height,
        name: doc.meta.name,
        usedColors: doc.usedColors.length,
        width: doc.width,
      },
      sourceFormat: doc.meta.sourceFormat ?? null,
    },
    null,
    2,
  );
}

function getAttachedResident(doc: GridDocument) {
  const candidate = doc.meta.sourceMetadata?.miiResidentSpec;
  const result = validateMiiResidentSpec(candidate);
  return result.valid ? result.spec : null;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const [, base64 = ""] = dataUrl.split(",");
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | number): string {
  const raw = String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
