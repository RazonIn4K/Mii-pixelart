/**
 * ExportPanel.tsx — Export controls for JSON, PNG, and reference packs
 *
 * DESIGN: "Paper Studio" — Clean export options like a stationery order form.
 */

import { Button } from "@/components/ui/button";
import { Download, FileJson, Image as ImageIcon, Package } from "lucide-react";
import type { GridDocument } from "@/lib/engine/grid";
import { downloadGridDocument, exportGridJson } from "@/lib/engine/json-io";
import {
  downloadGridAsPng,
  downloadPaletteSheetAsPng,
} from "@/lib/engine/canvas-renderer";
import { TOMODACHI_PALETTE } from "@/lib/engine/palette";
import { validateMiiResidentSpec } from "@shared/residents";

interface ExportPanelProps {
  doc: GridDocument | null;
  disabledReason?: string;
}

export default function ExportPanel({ doc, disabledReason }: ExportPanelProps) {
  const handleExportJson = () => {
    if (!doc) return;
    downloadGridDocument(doc);
  };

  const handleExportPng = () => {
    if (!doc) return;
    const safeName = getSafeProjectName(doc);
    downloadGridAsPng(
      doc,
      { cellSize: 16, showGrid: true, showLabels: true },
      `${safeName}-guide-labeled.png`
    );
  };

  const handleExportPngClean = () => {
    if (!doc) return;
    const safeName = getSafeProjectName(doc);
    downloadGridAsPng(
      doc,
      { cellSize: 16, showGrid: false, showLabels: false },
      `${safeName}-clean.png`
    );
  };

  const handleExportReferencePack = () => {
    if (!doc) return;

    // Export JSON
    const json = exportGridJson(doc);
    const safeName = getSafeProjectName(doc);
    const paletteById = new Map(TOMODACHI_PALETTE.map((color) => [color.id, color]));
    const resident = getAttachedResident(doc);

    // Create a simple HTML reference page
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(doc.meta.name)} - Reference Pack</title>
  <style>
    body { font-family: "Noto Sans JP", sans-serif; background: #FAFAF5; color: #4A4A4A; padding: 2rem; }
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
    ${doc.width}×${doc.height} grid · ${doc.usedColors.length} colors · Created ${doc.meta.createdAt}
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
    ${doc.usedColors.map((id) => {
      const color = paletteById.get(id);
      const swatchColor = color?.hex ?? id;
      const title = color
        ? `${color.id} - ${color.name} - ${color.hex}`
        : id;
      return `<div class="swatch" style="background:${escapeHtml(swatchColor)}" title="${escapeHtml(title)}"></div>`;
    }).join("\n    ")}
  </div>
  <h2 style="font-size:0.875rem;font-weight:600;">Project JSON</h2>
  <pre>${escapeHtml(json)}</pre>
</body>
</html>`;

    // Download all files
    downloadGridDocument(doc);

    // Download PNG guide
    downloadGridAsPng(
      doc,
      { cellSize: 16, showGrid: true, showLabels: true },
      `${safeName}-guide-labeled.png`
    );
    downloadPaletteSheetAsPng(doc, `${safeName}-palette-sheet.png`);

    // Download HTML reference
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}-reference.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="section-header mb-1">Export</p>
        <p className="text-xs text-muted-foreground">
          Download your work in various formats.
        </p>
        {disabledReason && (
          <p className="mt-2 rounded-sm border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-relaxed text-amber-950">
            {disabledReason}
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
            disabled={!doc}
          >
            <Package className="w-3.5 h-3.5 mr-2" />
            Export Reference Pack
            <span className="ml-auto text-muted-foreground">all files</span>
          </Button>
          <p className="text-xs text-muted-foreground mt-1.5">
            Downloads the JSON project, labeled PNG guide, and an HTML reference page.
          </p>
        </div>
      </div>
    </div>
  );
}

function getSafeProjectName(doc: GridDocument): string {
  return doc.meta.name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getAttachedResident(doc: GridDocument) {
  const candidate = doc.meta.sourceMetadata?.miiResidentSpec;
  const result = validateMiiResidentSpec(candidate);
  return result.valid ? result.spec : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
