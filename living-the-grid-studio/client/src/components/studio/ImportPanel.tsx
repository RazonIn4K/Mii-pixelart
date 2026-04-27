/**
 * ImportPanel.tsx — Import controls for image and JSON files
 *
 * DESIGN: "Paper Studio" — Clean drop zone on graph paper.
 */

import { useRef, useState, useCallback } from "react";
import { Upload, FileJson, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import type { ImageImportOptions } from "@/lib/engine/image-import";

interface ImportPanelProps {
  onImportImage: (file: File, options?: Partial<ImageImportOptions>) => void;
  onImportJson: (json: string) => void;
  isLoading: boolean;
}

export default function ImportPanel({
  onImportImage,
  onImportJson,
  isLoading,
}: ImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [gridWidth, setGridWidth] = useState(32);
  const [gridHeight, setGridHeight] = useState(32);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      processFile(file);
    },
    [gridWidth, gridHeight]
  );

  const processFile = useCallback(
    (file: File) => {
      if (file.name.endsWith(".json")) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            onImportJson(reader.result);
          }
        };
        reader.readAsText(file);
      } else if (file.type.startsWith("image/")) {
        onImportImage(file, { gridWidth, gridHeight });
      }
    },
    [gridWidth, gridHeight, onImportImage, onImportJson]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="section-header mb-1">Import</p>
        <p className="text-xs text-muted-foreground">
          Drop an image or JSON file to begin.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-sm p-6 text-center transition-colors ${
          isDragOver
            ? "border-primary bg-accent"
            : "border-border hover:border-muted-foreground"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleFileDrop}
      >
        <Upload className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
        <p className="text-xs text-muted-foreground mb-3">
          Drag & drop here
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            <ImageIcon className="w-3 h-3 mr-1" />
            Image
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => jsonInputRef.current?.click()}
            disabled={isLoading}
          >
            <FileJson className="w-3 h-3 mr-1" />
            JSON
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif"
          className="hidden"
          onChange={handleFileSelect}
        />
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Grid Size Controls */}
      <div className="space-y-3 p-3 rounded-sm border border-border bg-card">
        <Label className="text-xs font-semibold">Grid Size (for image import)</Label>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-10">Width</span>
            <Slider
              value={[gridWidth]}
              onValueChange={([v]) => setGridWidth(v)}
              min={8}
              max={256}
              step={8}
              className="flex-1"
            />
            <span className="text-xs font-mono w-8 text-right">{gridWidth}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-10">Height</span>
            <Slider
              value={[gridHeight]}
              onValueChange={([v]) => setGridHeight(v)}
              min={8}
              max={256}
              step={8}
              className="flex-1"
            />
            <span className="text-xs font-mono w-8 text-right">{gridHeight}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Tomodachi Life canvas is 256×256. Smaller grids are faster to repaint.
        </p>
      </div>

      {isLoading && (
        <div className="text-center py-4">
          <div className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground mt-2">Converting...</p>
        </div>
      )}
    </div>
  );
}
