/**
 * ImportPanel.tsx — Import controls for image and JSON files
 *
 * DESIGN: "Paper Studio" — Clean drop zone on graph paper.
 */

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  Crop,
  Crosshair,
  FileJson,
  Image as ImageIcon,
  Maximize2,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import type { GridDocument } from "@/lib/engine/grid";
import {
  checkImageSignature,
  readFileSignature,
} from "@/lib/engine/file-signature";
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
  onImportJson: (json: string) => boolean;
  isLoading: boolean;
}

type CropDragMode = "move" | "nw" | "ne" | "sw" | "se";

interface CropDragState {
  mode: CropDragMode;
  startPoint: { x: number; y: number };
  startCrop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface SourceImageSize {
  width: number;
  height: number;
}

interface PreviewImageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const LOCAL_IMAGE_LIMITS = {
  bytes: 15 * 1024 * 1024,
  dimension: 8_192,
  pixels: 40_000_000,
} as const;

const IMAGE_INPUT_ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-ms-bmp",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
].join(",");

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
  const cropDragRef = useRef<CropDragState | null>(null);
  const validationRequestRef = useRef(0);
  const [gridWidth, setGridWidth] = useState(32);
  const [gridHeight, setGridHeight] = useState(32);
  const [frameMode, setFrameMode] = useState<ImageFrameMode>("cover");
  const [focusX, setFocusX] = useState(50);
  const [focusY, setFocusY] = useState(50);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropWidth, setCropWidth] = useState(100);
  const [cropHeight, setCropHeight] = useState(100);
  const [maxColors, setMaxColors] = useState(24);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("keep");
  const [backgroundTolerance, setBackgroundTolerance] = useState(34);
  const [samplingMode, setSamplingMode] = useState<ImageSamplingMode>("smooth");
  const [lastImageFile, setLastImageFile] = useState<File | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [sourceImageSize, setSourceImageSize] =
    useState<SourceImageSize | null>(null);
  const [lastAppliedOptions, setLastAppliedOptions] =
    useState<Partial<ImageImportOptions> | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isInspectingFile, setIsInspectingFile] = useState(false);

  const imageOptions = useMemo<Partial<ImageImportOptions>>(
    () => ({
      gridWidth,
      gridHeight,
      frameMode,
      focusX,
      focusY,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
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
      cropX,
      cropY,
      cropWidth,
      cropHeight,
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
      setSourceImageSize(null);
      return;
    }

    const url = URL.createObjectURL(lastImageFile);
    setSourcePreviewUrl(url);
    setSourceImageSize(null);
    return () => URL.revokeObjectURL(url);
  }, [lastImageFile]);

  const previewImageBox = useMemo(
    () => getPreviewImageBox(sourceImageSize),
    [sourceImageSize],
  );

  const getImagePointFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const rect = sourcePreviewRef.current?.getBoundingClientRect();
      if (!rect) return null;

      const localX = ((clientX - rect.left) / rect.width) * 100;
      const localY = ((clientY - rect.top) / rect.height) * 100;
      return {
        x: clamp(
          Math.round(
            ((localX - previewImageBox.left) / previewImageBox.width) * 100,
          ),
          0,
          100,
        ),
        y: clamp(
          Math.round(
            ((localY - previewImageBox.top) / previewImageBox.height) * 100,
          ),
          0,
          100,
        ),
      };
    },
    [previewImageBox],
  );

  const setFocusFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const point = getImagePointFromPointer(clientX, clientY);
      if (!point) return;
      setFocusX(point.x);
      setFocusY(point.y);
    },
    [getImagePointFromPointer],
  );

  const handlePreviewPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setFocusFromPointer(event.clientX, event.clientY);
    },
    [setFocusFromPointer],
  );

  const handlePreviewPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = cropDragRef.current;
      if (drag) {
        const point = getImagePointFromPointer(event.clientX, event.clientY);
        if (!point) return;
        const dx = point.x - drag.startPoint.x;
        const dy = point.y - drag.startPoint.y;
        const next = resizeCrop(drag.startCrop, drag.mode, dx, dy);
        setCropX(next.x);
        setCropY(next.y);
        setCropWidth(next.width);
        setCropHeight(next.height);
        return;
      }

      if (event.buttons !== 1) return;
      setFocusFromPointer(event.clientX, event.clientY);
    },
    [getImagePointFromPointer, setFocusFromPointer],
  );

  const handlePreviewPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      cropDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const handleCropPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, mode: CropDragMode) => {
      event.preventDefault();
      event.stopPropagation();
      const point = getImagePointFromPointer(event.clientX, event.clientY);
      if (!point) return;
      sourcePreviewRef.current?.setPointerCapture(event.pointerId);
      cropDragRef.current = {
        mode,
        startPoint: point,
        startCrop: {
          x: cropX,
          y: cropY,
          width: cropWidth,
          height: cropHeight,
        },
      };
    },
    [cropHeight, cropWidth, cropX, cropY, getImagePointFromPointer],
  );

  const processFile = useCallback(
    async (file: File) => {
      const requestNumber = validationRequestRef.current + 1;
      validationRequestRef.current = requestNumber;
      setImportError(null);
      const fileKind = getImportFileKind(file);

      if (fileKind === "json") {
        setIsInspectingFile(false);
        setLastImageFile(null);
        setLastAppliedOptions(null);
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            const imported = onImportJson(reader.result);
            if (!imported) {
              setImportError(
                "That JSON file is not a valid Tomodachi Studio document.",
              );
            }
          } else {
            setImportError("Could not read that JSON file.");
          }
        };
        reader.onerror = () => setImportError("Could not read that JSON file.");
        reader.readAsText(file);
        return;
      }

      if (fileKind === "unsupported") {
        setIsInspectingFile(false);
        setImportError(
          "Unsupported file. Choose PNG, JPG, GIF, WebP, AVIF, BMP, or Studio JSON. SVG, HEIC, and TIFF are not accepted.",
        );
        return;
      }

      if (file.size > LOCAL_IMAGE_LIMITS.bytes) {
        setIsInspectingFile(false);
        setImportError("That image is larger than the 15 MB local limit.");
        return;
      }

      setIsInspectingFile(true);
      try {
        // Content check before any decode work: the extension and MIME type
        // are attacker-controlled metadata, so verify the actual leading
        // bytes match a supported raster signature.
        const signature = checkImageSignature(
          await readFileSignature(file),
          file.name,
          file.type,
        );
        if (validationRequestRef.current !== requestNumber) return;
        if (!signature.ok) {
          setImportError(
            signature.reason === "svg"
              ? "SVG files are not accepted, even when renamed. Export the graphic as PNG and import that instead."
              : signature.reason === "mismatch"
                ? "That file's content does not match its extension. Re-export the image as PNG, JPG, or WebP and try again."
                : "That file is not a recognizable PNG, JPG, GIF, WebP, AVIF, or BMP image.",
          );
          return;
        }

        const dimensions = await decodeImageDimensions(file);
        if (validationRequestRef.current !== requestNumber) return;
        const dimensionError = validateDecodedDimensions(dimensions);
        if (dimensionError) {
          setImportError(dimensionError);
          return;
        }
        setLastImageFile(file);
        setLastAppliedOptions(imageOptions);
        onPreviewImage(file, imageOptions);
      } catch {
        if (validationRequestRef.current !== requestNumber) return;
        setImportError(
          "This browser could not decode that image. Try PNG, JPG, or WebP, or convert the file before importing.",
        );
      } finally {
        if (validationRequestRef.current === requestNumber) {
          setIsInspectingFile(false);
        }
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
      void processFile(file);
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
      if (file) void processFile(file);
      e.currentTarget.value = "";
    },
    [processFile],
  );

  const setCropValues = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const next = normalizeCrop({ x, y, width, height });
      setCropX(next.x);
      setCropY(next.y);
      setCropWidth(next.width);
      setCropHeight(next.height);
    },
    [],
  );

  const applyFullCrop = useCallback(() => {
    setCropValues(0, 0, 100, 100);
  }, [setCropValues]);

  const applySquareCrop = useCallback(() => {
    setCropValues(...getSourceSquareCrop(sourceImageSize, "center"));
  }, [setCropValues, sourceImageSize]);

  const applyHeadCrop = useCallback(() => {
    setCropValues(...getSourceSquareCrop(sourceImageSize, "head"));
  }, [setCropValues, sourceImageSize]);

  const applyFacePaintPreset = useCallback(() => {
    setGridWidth(64);
    setGridHeight(64);
    setFrameMode("cover");
    setFocusX(50);
    setFocusY(38);
    setCropValues(8, 0, 84, 88);
    setMaxColors(18);
    setBrightness(104);
    setContrast(116);
    setSaturation(88);
    setBackgroundMode("flatten");
    setBackgroundTolerance(34);
    setSamplingMode("smooth");
  }, [setCropValues]);

  const applyCharacterPreset = useCallback(() => {
    setGridWidth(64);
    setGridHeight(64);
    setFrameMode("cover");
    setFocusX(50);
    setFocusY(44);
    setCropValues(4, 2, 92, 92);
    setMaxColors(22);
    setBrightness(102);
    setContrast(122);
    setSaturation(112);
    setBackgroundMode("flatten");
    setBackgroundTolerance(30);
    setSamplingMode("crisp");
  }, [setCropValues]);

  const applyFaceDetailPreset = useCallback(() => {
    setGridWidth(96);
    setGridHeight(96);
    setFrameMode("cover");
    setFocusX(50);
    setFocusY(38);
    setCropValues(8, 0, 84, 88);
    setMaxColors(28);
    setBrightness(104);
    setContrast(118);
    setSaturation(92);
    setBackgroundMode("flatten");
    setBackgroundTolerance(32);
    setSamplingMode("smooth");
  }, [setCropValues]);

  const applyCharacterDetailPreset = useCallback(() => {
    setGridWidth(128);
    setGridHeight(128);
    setFrameMode("cover");
    setFocusX(50);
    setFocusY(45);
    setCropValues(4, 2, 92, 92);
    setMaxColors(36);
    setBrightness(102);
    setContrast(124);
    setSaturation(116);
    setBackgroundMode("flatten");
    setBackgroundTolerance(28);
    setSamplingMode("crisp");
  }, [setCropValues]);

  const applySpritePreset = useCallback(() => {
    setGridWidth(32);
    setGridHeight(32);
    setFrameMode("contain");
    setFocusX(50);
    setFocusY(50);
    setCropValues(0, 0, 100, 100);
    setMaxColors(16);
    setBrightness(100);
    setContrast(138);
    setSaturation(130);
    setBackgroundMode("flatten");
    setBackgroundTolerance(26);
    setSamplingMode("crisp");
  }, [setCropValues]);

  const applyLogoPreset = useCallback(() => {
    setGridWidth(64);
    setGridHeight(64);
    setFrameMode("contain");
    setFocusX(50);
    setFocusY(50);
    setCropValues(0, 0, 100, 100);
    setMaxColors(12);
    setBrightness(100);
    setContrast(130);
    setSaturation(120);
    setBackgroundMode("flatten");
    setBackgroundTolerance(28);
    setSamplingMode("crisp");
  }, [setCropValues]);

  const applyStickerPreset = useCallback(() => {
    setGridWidth(64);
    setGridHeight(64);
    setFrameMode("contain");
    setFocusX(50);
    setFocusY(50);
    setCropValues(0, 0, 100, 100);
    setMaxColors(18);
    setBrightness(102);
    setContrast(128);
    setSaturation(122);
    setBackgroundMode("flatten");
    setBackgroundTolerance(24);
    setSamplingMode("crisp");
  }, [setCropValues]);

  const applyIconPreset = useCallback(() => {
    setGridWidth(16);
    setGridHeight(16);
    setFrameMode("contain");
    setFocusX(50);
    setFocusY(50);
    setCropValues(0, 0, 100, 100);
    setMaxColors(8);
    setBrightness(100);
    setContrast(150);
    setSaturation(135);
    setBackgroundMode("flatten");
    setBackgroundTolerance(22);
    setSamplingMode("crisp");
  }, [setCropValues]);

  const applyFullImagePreset = useCallback(() => {
    setGridWidth(64);
    setGridHeight(64);
    setFrameMode("contain");
    setFocusX(50);
    setFocusY(50);
    setCropValues(0, 0, 100, 100);
    setMaxColors(24);
    setBrightness(100);
    setContrast(104);
    setSaturation(96);
    setBackgroundMode("keep");
    setBackgroundTolerance(34);
    setSamplingMode("smooth");
  }, [setCropValues]);

  const applyPixelDetailPreset = useCallback(() => {
    setGridWidth(256);
    setGridHeight(256);
    setFrameMode("contain");
    setFocusX(50);
    setFocusY(50);
    setCropValues(0, 0, 100, 100);
    setMaxColors(0);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setBackgroundMode("flatten");
    setBackgroundTolerance(18);
    setSamplingMode("crisp");
  }, [setCropValues]);

  const hasPendingImageChanges =
    !!lastImageFile && !areImageOptionsEqual(imageOptions, lastAppliedOptions);
  const hasCurrentPreview = !!previewDoc && !hasPendingImageChanges;
  const cropOverlayStyle = getPreviewCropStyle(previewImageBox, {
    x: cropX,
    y: cropY,
    width: cropWidth,
    height: cropHeight,
  });
  const focusTargetStyle = getPreviewPointStyle(previewImageBox, {
    x: focusX,
    y: focusY,
  });

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="section-header mb-1">Import</p>
        <p className="text-xs text-muted-foreground">
          Drop a character, face, logo, meme, or Studio JSON file to begin.
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
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={isLoading || isInspectingFile}
            aria-describedby="studio-supported-formats"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="w-3 h-3 mr-1" />
            Image
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={isLoading || isInspectingFile}
            onClick={() => jsonInputRef.current?.click()}
          >
            <FileJson className="w-3 h-3 mr-1" />
            JSON
          </Button>
        </div>
        <input
          id="ltg-image-input"
          name="studio-image-file"
          ref={fileInputRef}
          type="file"
          accept={IMAGE_INPUT_ACCEPT}
          aria-hidden="true"
          tabIndex={-1}
          className="sr-only"
          onChange={handleFileSelect}
        />
        <input
          id="ltg-json-input"
          name="studio-json-file"
          ref={jsonInputRef}
          type="file"
          accept=".json"
          aria-hidden="true"
          tabIndex={-1}
          className="sr-only"
          onChange={handleFileSelect}
        />
        <p
          id="studio-supported-formats"
          className="mt-3 text-[0.68rem] font-medium leading-5 text-muted-foreground"
        >
          PNG, JPG, GIF (first frame), WebP, AVIF, or BMP · up to 15 MB, 8192px
          per side, and 40 megapixels.
        </p>
        <p className="mt-1 text-[0.65rem] leading-4 text-muted-foreground">
          SVG, HEIC, and TIFF are not supported. Source images stay in this
          browser; only the converted grid is saved if you opt into cloud sync.
        </p>
      </div>

      {isInspectingFile ? (
        <p
          className="rounded-sm border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground"
          role="status"
        >
          Checking image format and dimensions…
        </p>
      ) : null}

      {importError && (
        <div
          className="rounded-sm border border-destructive/30 bg-destructive/10 p-3"
          role="alert"
        >
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
                <p className="text-xs font-semibold">Source Frame</p>
                <span className="text-[0.7rem] text-muted-foreground">
                  {Math.round(cropWidth)}×{Math.round(cropHeight)}%
                </span>
              </div>
              <div
                ref={sourcePreviewRef}
                className="relative aspect-square overflow-hidden rounded-sm border border-border bg-muted cursor-crosshair touch-none select-none"
                onPointerDown={handlePreviewPointerDown}
                onPointerMove={handlePreviewPointerMove}
                onPointerUp={handlePreviewPointerUp}
                onPointerCancel={handlePreviewPointerUp}
                aria-label="Set image crop and subject position"
                role="img"
              >
                <img
                  src={sourcePreviewUrl}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-contain"
                  onLoad={(event) =>
                    setSourceImageSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })
                  }
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
                  className="pointer-events-none absolute border-2 border-primary bg-primary/10 shadow-[0_0_0_999px_rgba(0,0,0,0.34)]"
                  style={cropOverlayStyle}
                >
                  <div
                    className="pointer-events-auto absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-primary/90 shadow-sm"
                    onPointerDown={(event) =>
                      handleCropPointerDown(event, "move")
                    }
                  >
                    <Crop className="m-1 h-3 w-3 text-primary-foreground" />
                  </div>
                  {(
                    [
                      ["nw", "-left-2 -top-2 cursor-nwse-resize"],
                      ["ne", "-right-2 -top-2 cursor-nesw-resize"],
                      ["sw", "-bottom-2 -left-2 cursor-nesw-resize"],
                      ["se", "-bottom-2 -right-2 cursor-nwse-resize"],
                    ] as [CropDragMode, string][]
                  ).map(([mode, className]) => (
                    <div
                      key={mode}
                      className={`pointer-events-auto absolute h-4 w-4 rounded-full border-2 border-white bg-primary shadow-sm ${className}`}
                      onPointerDown={(event) =>
                        handleCropPointerDown(event, mode)
                      }
                    />
                  ))}
                </div>
                <div
                  className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2"
                  style={focusTargetStyle}
                >
                  <div className="h-7 w-7 rounded-full border-2 border-white bg-primary/80 shadow-sm" />
                  <div className="absolute left-1/2 top-[-2rem] h-[5.25rem] w-px -translate-x-1/2 bg-white/90" />
                  <div className="absolute left-[-2rem] top-1/2 h-px w-[5.25rem] -translate-y-1/2 bg-white/90" />
                  <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={applyFullCrop}
                >
                  <Maximize2 className="mr-1 h-3 w-3" />
                  Full
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={applySquareCrop}
                >
                  <Crop className="mr-1 h-3 w-3" />
                  Square
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={applyHeadCrop}
                >
                  <Crosshair className="mr-1 h-3 w-3" />
                  Head
                </Button>
              </div>
              <fieldset className="rounded-sm border border-border/80 p-2.5">
                <legend className="px-1 text-xs font-semibold">
                  Crop values
                </legend>
                <p
                  id="crop-keyboard-help"
                  className="mb-2 text-[0.68rem] leading-4 text-muted-foreground"
                >
                  Enter percentages or use the arrow keys for precise framing.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <CropNumberControl
                    id="studio-crop-x"
                    label="Crop X"
                    value={cropX}
                    max={100 - cropWidth}
                    onChange={(value) =>
                      setCropValues(value, cropY, cropWidth, cropHeight)
                    }
                  />
                  <CropNumberControl
                    id="studio-crop-y"
                    label="Crop Y"
                    value={cropY}
                    max={100 - cropHeight}
                    onChange={(value) =>
                      setCropValues(cropX, value, cropWidth, cropHeight)
                    }
                  />
                  <CropNumberControl
                    id="studio-crop-width"
                    label="Crop width"
                    value={cropWidth}
                    min={8}
                    max={100 - cropX}
                    onChange={(value) =>
                      setCropValues(cropX, cropY, value, cropHeight)
                    }
                  />
                  <CropNumberControl
                    id="studio-crop-height"
                    label="Crop height"
                    value={cropHeight}
                    min={8}
                    max={100 - cropY}
                    onChange={(value) =>
                      setCropValues(cropX, cropY, cropWidth, value)
                    }
                  />
                </div>
              </fieldset>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            className="w-full justify-start text-xs"
            variant={hasPendingImageChanges ? "default" : "outline"}
            onClick={handleReprocessImage}
            disabled={isLoading || isInspectingFile}
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
                disabled={isLoading || isInspectingFile || !hasCurrentPreview}
              >
                Commit Preview
              </Button>
              <Button
                type="button"
                size="sm"
                className="text-xs"
                variant="outline"
                onClick={handleCancelPreview}
                disabled={isLoading || isInspectingFile}
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
        <p className="text-xs font-semibold">Use Case Presets</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={applyFacePaintPreset}
          >
            Face Paint
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
              aria-label="Grid width"
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
              aria-label="Grid height"
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
        <p className="text-xs font-semibold">Framing</p>
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
              aria-label="Horizontal image focus"
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
              aria-label="Vertical image focus"
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
        <p className="text-xs font-semibold">Source Type</p>
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
        <p className="text-xs font-semibold">Background</p>
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
              aria-label="Background cleanup tolerance"
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
        <p className="text-xs font-semibold">Image Adjustments</p>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-16">Colors</span>
            <Slider
              aria-label="Maximum palette colors"
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
              aria-label="Image brightness"
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
              aria-label="Image contrast"
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
              aria-label="Image saturation"
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

function CropNumberControl({
  id,
  label,
  value,
  min = 0,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-[0.68rem] text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          autoComplete="off"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-describedby="crop-keyboard-help"
          className="h-8 pr-7 font-mono text-xs"
          onChange={(event) => {
            const nextValue = event.currentTarget.valueAsNumber;
            if (Number.isFinite(nextValue)) onChange(nextValue);
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.65rem] text-muted-foreground"
        >
          %
        </span>
      </div>
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
    a.cropX === b.cropX &&
    a.cropY === b.cropY &&
    a.cropWidth === b.cropWidth &&
    a.cropHeight === b.cropHeight &&
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

function getPreviewImageBox(
  sourceImageSize: SourceImageSize | null,
): PreviewImageBox {
  if (!sourceImageSize?.width || !sourceImageSize.height) {
    return { left: 0, top: 0, width: 100, height: 100 };
  }

  const aspect = sourceImageSize.width / sourceImageSize.height;
  if (aspect > 1) {
    const height = 100 / aspect;
    return { left: 0, top: (100 - height) / 2, width: 100, height };
  }

  const width = 100 * aspect;
  return { left: (100 - width) / 2, top: 0, width, height: 100 };
}

function getPreviewCropStyle(
  box: PreviewImageBox,
  crop: { x: number; y: number; width: number; height: number },
): React.CSSProperties {
  return {
    left: `${box.left + (crop.x / 100) * box.width}%`,
    top: `${box.top + (crop.y / 100) * box.height}%`,
    width: `${(crop.width / 100) * box.width}%`,
    height: `${(crop.height / 100) * box.height}%`,
  };
}

function getPreviewPointStyle(
  box: PreviewImageBox,
  point: { x: number; y: number },
): React.CSSProperties {
  return {
    left: `${box.left + (point.x / 100) * box.width}%`,
    top: `${box.top + (point.y / 100) * box.height}%`,
  };
}

function resizeCrop(
  start: { x: number; y: number; width: number; height: number },
  mode: CropDragMode,
  dx: number,
  dy: number,
): { x: number; y: number; width: number; height: number } {
  const minSize = 8;

  if (mode === "move") {
    return normalizeCrop({
      ...start,
      x: start.x + dx,
      y: start.y + dy,
    });
  }

  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  if (mode.includes("w")) {
    const nextX = clamp(start.x + dx, 0, start.x + start.width - minSize);
    width = start.width + (start.x - nextX);
    x = nextX;
  }

  if (mode.includes("e")) {
    width = clamp(start.width + dx, minSize, 100 - start.x);
  }

  if (mode.includes("n")) {
    const nextY = clamp(start.y + dy, 0, start.y + start.height - minSize);
    height = start.height + (start.y - nextY);
    y = nextY;
  }

  if (mode.includes("s")) {
    height = clamp(start.height + dy, minSize, 100 - start.y);
  }

  return normalizeCrop({ x, y, width, height });
}

function normalizeCrop(crop: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  const minSize = 8;
  const width = clamp(Math.round(crop.width), minSize, 100);
  const height = clamp(Math.round(crop.height), minSize, 100);
  const x = clamp(Math.round(crop.x), 0, 100 - width);
  const y = clamp(Math.round(crop.y), 0, 100 - height);
  return { x, y, width, height };
}

function getSourceSquareCrop(
  sourceImageSize: SourceImageSize | null,
  mode: "center" | "head",
): [number, number, number, number] {
  if (!sourceImageSize?.width || !sourceImageSize.height) {
    return mode === "head" ? [8, 0, 84, 88] : [0, 0, 100, 100];
  }

  const { width, height } = sourceImageSize;
  if (width > height) {
    const cropWidth = Math.round((height / width) * 100);
    return [Math.round((100 - cropWidth) / 2), 0, cropWidth, 100];
  }

  const cropHeight = Math.round((width / height) * 100);
  const cropY = mode === "head" ? 0 : Math.round((100 - cropHeight) / 2);
  return [0, cropY, 100, cropHeight];
}

type ImportFileKind = "image" | "json" | "unsupported";

const IMAGE_TYPES_BY_EXTENSION = new Map<string, ReadonlySet<string>>([
  ["png", new Set(["image/png"])],
  ["jpg", new Set(["image/jpeg"])],
  ["jpeg", new Set(["image/jpeg"])],
  ["gif", new Set(["image/gif"])],
  ["webp", new Set(["image/webp"])],
  ["avif", new Set(["image/avif"])],
  ["bmp", new Set(["image/bmp", "image/x-ms-bmp"])],
]);

const ALLOWED_IMAGE_MIME_TYPES = new Set(
  Array.from(IMAGE_TYPES_BY_EXTENSION.values()).flatMap((types) =>
    Array.from(types),
  ),
);

const ALLOWED_JSON_MIME_TYPES = new Set([
  "application/json",
  "text/json",
  "text/plain",
]);

function getImportFileKind(file: File): ImportFileKind {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = file.type.trim().toLowerCase();
  if (
    (extension === "json" &&
      (!mimeType || ALLOWED_JSON_MIME_TYPES.has(mimeType))) ||
    (!extension && mimeType === "application/json")
  ) {
    return "json";
  }

  const allowedForExtension = IMAGE_TYPES_BY_EXTENSION.get(extension);
  if (allowedForExtension) {
    return !mimeType || allowedForExtension.has(mimeType)
      ? "image"
      : "unsupported";
  }

  if (!extension && ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) return "image";
  return "unsupported";
}

interface DecodedImageDimensions {
  height: number;
  width: number;
}

async function decodeImageDimensions(
  file: File,
): Promise<DecodedImageDimensions> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const dimensions = { height: bitmap.height, width: bitmap.width };
      bitmap.close();
      return dimensions;
    } catch {
      // Some browsers can display a format that createImageBitmap cannot
      // decode. The HTML image fallback keeps support capability-based.
    }
  }

  return await new Promise<DecodedImageDimensions>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const finish = () => {
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(objectUrl);
    };
    image.onload = () => {
      const dimensions = {
        height: image.naturalHeight,
        width: image.naturalWidth,
      };
      finish();
      resolve(dimensions);
    };
    image.onerror = () => {
      finish();
      reject(new Error("Image decoding failed"));
    };
    image.src = objectUrl;
  });
}

function validateDecodedDimensions({
  height,
  width,
}: DecodedImageDimensions): string | null {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    return "That image does not have valid pixel dimensions.";
  }
  if (
    width > LOCAL_IMAGE_LIMITS.dimension ||
    height > LOCAL_IMAGE_LIMITS.dimension
  ) {
    return "Image dimensions must not exceed 8192×8192 pixels.";
  }
  if (width * height > LOCAL_IMAGE_LIMITS.pixels) {
    return "That image contains more than the 40 megapixel local limit.";
  }
  return null;
}
