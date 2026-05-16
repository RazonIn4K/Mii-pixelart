/**
 * ImportPanel.tsx — Import controls for image and JSON files
 *
 * DESIGN: "Paper Studio" — Clean drop zone on graph paper.
 */

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { RefreshCw, Upload, FileJson, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import type { GridDocument } from "@/lib/engine/grid";
import type {
  BackgroundMode,
  ImageFrameMode,
  ImageImportOptions,
  ImageSamplingMode,
} from "@/lib/engine/image-import";

interface ImportPanelProps {
  previewDoc: GridDocument | null;
  onPreviewImage: (file: File, options?: Partial<ImageImportOptions>) => void;
  onCommitPreview: () => void;
  onCancelPreview: () => void;
  onImportJson: (json: string) => void;
  isLoading: boolean;
}

export default function ImportPanel({
  previewDoc,
  onPreviewImage,
  onCommitPreview,
  onCancelPreview,
  onImportJson,
  isLoading,
}: ImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const sourcePreviewRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(32);
  const [gridHeight, setGridHeight] = useState(32);
  const [frameMode, setFrameMode] = useState<ImageFrameMode>("cover");
  const [focusX, setFocusX] = useState(50);
  const [focusY, setFocusY] = useState(50);
  const [maxColors, setMaxColors] = useState(24);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("keep");
  const [backgroundTolerance, setBackgroundTolerance] = useState(34);
  const [samplingMode, setSamplingMode] =
    useState<ImageSamplingMode>("smooth");
  const [lastImageFile, setLastImageFile] = useState<File | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [lastAppliedOptions, setLastAppliedOptions] =
    useState<Partial<ImageImportOptions> | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const imageOptions = useMemo<Partial<ImageImportOptions>>(
    () => ({
      gridWidth,
      gridHeight,
      frameMode,
      focusX,
      focusY,
      maxColors,
      brightness,
      contrast,
      saturation,
      backgroundMode,
      backgroundTolerance,
      samplingMode,
    }),
    [
      gridWidth,
      gridHeight,
      frameMode,
      focusX,
      focusY,
      maxColors,
      brightness,
      contrast,
      saturation,
      backgroundMode,
      backgroundTolerance,
      samplingMode,
    ],
  );

  useEffect(() => {
    if (!lastImageFile) {
      setSourcePreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(lastImageFile);
    setSourcePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [lastImageFile]);

  const setFocusFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const rect = sourcePreviewRef.current?.getBoundingClientRect();
      if (!rect) return;

      const nextX = clamp(
        Math.round(((clientX - rect.left) / rect.width) * 100),
        0,
        100,
      );
      const nextY = clamp(
        Math.round(((clientY - rect.top) / rect.height) * 100),
        0,
        100,
      );
      setFocusX(nextX);
      setFocusY(nextY);
    },
    [],
  );

  const handleFocusPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setFocusFromPointer(event.clientX, event.clientY);
    },
    [setFocusFromPointer],
  );

  const handleFocusPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.buttons !== 1) return;
      setFocusFromPointer(event.clientX, event.clientY);
    },
    [setFocusFromPointer],
  );

  const processFile = useCallback(
    (file: File) => {
      setImportError(null);
      const fileKind = getImportFileKind(file);

      if (fileKind === "json") {
        setLastImageFile(null);
        setLastAppliedOptions(null);
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            onImportJson(reader.result);
          } else {
            setImportError("Could not read that JSON file.");
          }
        };
        reader.onerror = () => setImportError("Could not read that JSON file.");
        reader.readAsText(file);
      } else if (fileKind === "image") {
        setLastImageFile(file);
        setLastAppliedOptions(imageOptions);
        onPreviewImage(file, imageOptions);
      } else {
        setImportError(
          "Unsupported file. Use PNG, JPG, GIF, WebP, AVIF, BMP, or JSON.",
        );
      }
    },
    [imageOptions, onPreviewImage, onImportJson],
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      processFile(file);
    },
    [processFile],
  );

  const handleReprocessImage = useCallback(() => {
    if (!lastImageFile) return;
    setLastAppliedOptions(imageOptions);
    onPreviewImage(lastImageFile, imageOptions);
  }, [imageOptions, lastImageFile, onPreviewImage]);

  const handleCancelPreview = useCallback(() => {
    setLastAppliedOptions(null);
    onCancelPreview();
  }, [onCancelPreview]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.currentTarget.value = "";
    },
    [processFile],
  );

  const applyMiiMaskPreset = useCallback(() => {
    setGridWidth(64);
    setGridHeight(64);
    setFrameMode("cover");
    setFocusX(50);
    setFocusY(38);
    setMaxColors(18);
    setBrightness(104);
    setContrast(116);
    setSaturation(88);
    setBackgroundMode("flatten");
    setBackgroundTolerance(34);
    setSamplingMode("smooth");
  }, []);

  const applyCharacterPreset = useCallback(() => {
    setGridWidth(64);
    setGridHeight(64);
    setFrameMode("cover");
    setFocusX(50);
    setFocusY(44);
    setMaxColors(22);
    setBrightness(102);
    setContrast(122);
    setSaturation(112);
    setBackgroundMode("flatten");
    setBackgroundTolerance(30);
    setSamplingMode("crisp");
  }, []);

  const applyFaceDetailPreset = useCallback(() => {
    setGridWidth(96);
    setGridHeight(96);
    setFrameMode("cover");
    setFocusX(50);
    setFocusY(38);
    setMaxColors(28);
    setBrightness(104);
    setContrast(118);
    setSaturation(92);
    setBackgroundMode("flatten");
    setBackgroundTolerance(32);
    setSamplingMode("smooth");
  }, []);

  const applyCharacterDetailPreset = useCallback(() => {
    setGridWidth(128);
    setGridHeight(128);
    setFrameMode("cover");
    setFocusX(50);
    setFocusY(45);
    setMaxColors(36);
    setBrightness(102);
    setContrast(124);
    setSaturation(116);
    setBackgroundMode("flatten");
    setBackgroundTolerance(28);
    setSamplingMode("crisp");
  }, []);

  const applySpritePreset = useCallback(() => {
    setGridWidth(32);
    setGridHeight(32);
    setFrameMode("contain");
    setFocusX(50);
    setFocusY(50);
    setMaxColors(16);
    setBrightness(100);
    setContrast(138);
    setSaturation(130);
    setBackgroundMode("flatten");
    setBackgroundTolerance(26);
    setSamplingMode("crisp");
  }, []);

  const applyLogoPreset = useCallback(() => {
    setGridWidth(64);
    setGridHeight(64);
    setFrameMode("contain");
    setFocusX(50);
    setFocusY(50);
    setMaxColors(12);
    setBrightness(100);
    setContrast(130);
    setSaturation(120);
    setBackgroundMode("flatten");
    setBackgroundTolerance(28);
    setSamplingMode("crisp");
  }, []);

  const applyStickerPreset = useCallback(() => {
    setGridWidth(64);
    setGridHeight(64);
    setFrameMode("contain");
    setFocusX(50);
    setFocusY(50);
    setMaxColors(18);
    setBrightness(102);
    setContrast(128);
    setSaturation(122);
    setBackgroundMode("flatten");
    setBackgroundTolerance(24);
    setSamplingMode("crisp");
  }, []);

  const applyIconPreset = useCallback(() => {
    setGridWidth(16);
    setGridHeight(16);
    setFrameMode("contain");
    setFocusX(50);
    setFocusY(50);
    setMaxColors(8);
    setBrightness(100);
    setContrast(150);
    setSaturation(135);
    setBackgroundMode("flatten");
    setBackgroundTolerance(22);
    setSamplingMode("crisp");
  }, []);

  const applyFullImagePreset = useCallback(() => {
    setGridWidth(64);
    setGridHeight(64);
    setFrameMode("contain");
    setFocusX(50);
    setFocusY(50);
    setMaxColors(24);
    setBrightness(100);
    setContrast(104);
    setSaturation(96);
    setBackgroundMode("keep");
    setBackgroundTolerance(34);
    setSamplingMode("smooth");
  }, []);

  const applyPixelDetailPreset = useCallback(() => {
    setGridWidth(256);
    setGridHeight(256);
    setFrameMode("contain");
    setFocusX(50);
    setFocusY(50);
    setMaxColors(0);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setBackgroundMode("flatten");
    setBackgroundTolerance(18);
    setSamplingMode("crisp");
  }, []);

  const hasPendingImageChanges =
    !!lastImageFile && !areImageOptionsEqual(imageOptions, lastAppliedOptions);
  const hasCurrentPreview = !!previewDoc && !hasPendingImageChanges;

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="section-header mb-1">Import</p>
        <p className="text-xs text-muted-foreground">
          Drop a character, face, logo, meme, or JSON file to begin.
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
        <p className="text-xs text-muted-foreground mb-3">Drag & drop here</p>
        <div className="flex items-center justify-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className={`cursor-pointer text-xs ${
              isLoading ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <label htmlFor="ltg-image-input" aria-disabled={isLoading}>
              <ImageIcon className="w-3 h-3 mr-1" />
              Image
            </label>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className={`cursor-pointer text-xs ${
              isLoading ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <label htmlFor="ltg-json-input" aria-disabled={isLoading}>
              <FileJson className="w-3 h-3 mr-1" />
              JSON
            </label>
          </Button>
        </div>
        <input
          id="ltg-image-input"
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,.png,.jpg,.jpeg,.gif,.webp,.avif,.bmp"
          className="sr-only"
          onChange={handleFileSelect}
        />
        <input
          id="ltg-json-input"
          ref={jsonInputRef}
          type="file"
          accept=".json"
          className="sr-only"
          onChange={handleFileSelect}
        />
      </div>

      {importError && (
        <div className="rounded-sm border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-xs leading-relaxed text-destructive">
            {importError}
          </p>
        </div>
      )}

      {lastImageFile && (
        <div className="space-y-3 p-3 rounded-sm border border-border bg-card">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">
                {lastImageFile.name}
              </p>
              <p className="text-[0.7rem] text-muted-foreground">
                {hasPendingImageChanges
                  ? "Settings changed"
                  : previewDoc
                    ? "Preview ready"
                    : "Source image ready"}
              </p>
            </div>
          </div>
          {sourcePreviewUrl && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  Subject Position
                </Label>
                <span className="text-[0.7rem] text-muted-foreground">
                  Drag target
                </span>
              </div>
              <div
                ref={sourcePreviewRef}
                className="relative aspect-square overflow-hidden rounded-sm border border-border bg-muted cursor-crosshair touch-none select-none"
                onPointerDown={handleFocusPointerDown}
                onPointerMove={handleFocusPointerMove}
                aria-label="Drag to set image subject position"
                role="img"
              >
                <img
                  src={sourcePreviewUrl}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-contain"
                />
                <div
                  className="absolute inset-0 pointer-events-none opacity-60"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, rgba(255,255,255,0.42) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.42) 1px, transparent 1px)",
                    backgroundSize: "25% 25%",
                  }}
                />
                <div
                  className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${focusX}%`, top: `${focusY}%` }}
                >
                  <div className="h-7 w-7 rounded-full border-2 border-white bg-primary/80 shadow-sm" />
                  <div className="absolute left-1/2 top-[-2rem] h-[5.25rem] w-px -translate-x-1/2 bg-white/90" />
                  <div className="absolute left-[-2rem] top-1/2 h-px w-[5.25rem] -translate-y-1/2 bg-white/90" />
                  <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                </div>
              </div>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            className="w-full justify-start text-xs"
            variant={hasPendingImageChanges ? "default" : "outline"}
            onClick={handleReprocessImage}
            disabled={isLoading}
            aria-label="Update preview using the same source file"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-2" />
            {previewDoc ? "Update Preview" : "Preview Image"}
            <span className="ml-auto text-[0.7rem] opacity-75"> Same file</span>
          </Button>
          {previewDoc && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                className="text-xs"
                onClick={onCommitPreview}
                disabled={isLoading || !hasCurrentPreview}
              >
                Commit Preview
              </Button>
              <Button
                type="button"
                size="sm"
                className="text-xs"
                variant="outline"
                onClick={handleCancelPreview}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          )}
          {previewDoc && hasPendingImageChanges && (
            <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
              Update the preview before committing the changed settings.
            </p>
          )}
        </div>
      )}

      {/* Grid Size Controls */}
      <div className="space-y-3 p-3 rounded-sm border border-border bg-card">
        <Label className="text-xs font-semibold">Use Case Presets</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={applyMiiMaskPreset}
          >
            Mii Mask
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={applyCharacterPreset}
          >
            Character 64
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={applyFaceDetailPreset}
          >
            Face 96
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={applyCharacterDetailPreset}
          >
            Character 128
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={applySpritePreset}
          >
            Sprite 32
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={applyLogoPreset}
          >
            Logo 64
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={applyStickerPreset}
          >
            Sticker 64
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={applyIconPreset}
          >
            Icon 16
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={applyFullImagePreset}
          >
            Full 64
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={applyPixelDetailPreset}
          >
            Pixel 256
          </Button>
        </div>
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
            <span className="text-xs font-mono w-8 text-right">
              {gridWidth}
            </span>
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
            <span className="text-xs font-mono w-8 text-right">
              {gridHeight}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-3 rounded-sm border border-border bg-card">
        <Label className="text-xs font-semibold">Framing</Label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["cover", "Fill"],
              ["contain", "Fit"],
              ["stretch", "Stretch"],
            ] as [ImageFrameMode, string][]
          ).map(([mode, label]) => (
            <Button
              key={mode}
              type="button"
              variant={frameMode === mode ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => setFrameMode(mode)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-16">Focus X</span>
            <Slider
              value={[focusX]}
              onValueChange={([v]) => setFocusX(v)}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
            <span className="text-xs font-mono w-10 text-right">{focusX}%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-16">Focus Y</span>
            <Slider
              value={[focusY]}
              onValueChange={([v]) => setFocusY(v)}
              min={0}
              max={100}
              step={1}
              className="flex-1"
            />
            <span className="text-xs font-mono w-10 text-right">{focusY}%</span>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-3 rounded-sm border border-border bg-card">
        <Label className="text-xs font-semibold">Source Type</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["smooth", "Photo"],
              ["crisp", "Pixel / Logo"],
            ] as [ImageSamplingMode, string][]
          ).map(([mode, label]) => (
            <Button
              key={mode}
              type="button"
              variant={samplingMode === mode ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => setSamplingMode(mode)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3 p-3 rounded-sm border border-border bg-card">
        <Label className="text-xs font-semibold">Background</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["keep", "Keep"],
              ["flatten", "Clean"],
            ] as [BackgroundMode, string][]
          ).map(([mode, label]) => (
            <Button
              key={mode}
              type="button"
              variant={backgroundMode === mode ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => setBackgroundMode(mode)}
            >
              {label}
            </Button>
          ))}
        </div>
        {backgroundMode === "flatten" && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-16">
              Tolerance
            </span>
            <Slider
              value={[backgroundTolerance]}
              onValueChange={([v]) => setBackgroundTolerance(v)}
              min={8}
              max={80}
              step={1}
              className="flex-1"
            />
            <span className="text-xs font-mono w-10 text-right">
              {backgroundTolerance}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-3 p-3 rounded-sm border border-border bg-card">
        <Label className="text-xs font-semibold">Image Adjustments</Label>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-16">Colors</span>
            <Slider
              value={[maxColors]}
              onValueChange={([v]) => setMaxColors(v)}
              min={0}
              max={84}
              step={1}
              className="flex-1"
            />
            <span className="text-xs font-mono w-10 text-right">
              {maxColors === 0 ? "all" : maxColors}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-16">Bright</span>
            <Slider
              value={[brightness]}
              onValueChange={([v]) => setBrightness(v)}
              min={50}
              max={150}
              step={1}
              className="flex-1"
            />
            <span className="text-xs font-mono w-10 text-right">
              {brightness}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-16">Contrast</span>
            <Slider
              value={[contrast]}
              onValueChange={([v]) => setContrast(v)}
              min={50}
              max={180}
              step={1}
              className="flex-1"
            />
            <span className="text-xs font-mono w-10 text-right">
              {contrast}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-16">Saturate</span>
            <Slider
              value={[saturation]}
              onValueChange={([v]) => setSaturation(v)}
              min={0}
              max={160}
              step={1}
              className="flex-1"
            />
            <span className="text-xs font-mono w-10 text-right">
              {saturation}%
            </span>
          </div>
        </div>
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

function areImageOptionsEqual(
  a: Partial<ImageImportOptions>,
  b: Partial<ImageImportOptions> | null,
): boolean {
  if (!b) return false;
  return (
    a.gridWidth === b.gridWidth &&
    a.gridHeight === b.gridHeight &&
    a.frameMode === b.frameMode &&
    a.focusX === b.focusX &&
    a.focusY === b.focusY &&
    a.maxColors === b.maxColors &&
    a.brightness === b.brightness &&
    a.contrast === b.contrast &&
    a.saturation === b.saturation &&
    a.backgroundMode === b.backgroundMode &&
    a.backgroundTolerance === b.backgroundTolerance &&
    a.samplingMode === b.samplingMode
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type ImportFileKind = "image" | "json" | "unsupported";

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
]);

function getImportFileKind(file: File): ImportFileKind {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "json" || file.type === "application/json") return "json";
  if (file.type.startsWith("image/") || IMAGE_EXTENSIONS.has(extension))
    return "image";
  return "unsupported";
}
