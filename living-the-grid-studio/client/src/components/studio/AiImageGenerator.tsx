import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Square,
} from "lucide-react";

import {
  AI_IMAGE_DEFAULT_MODEL,
  AI_IMAGE_LIMITS,
  AI_IMAGE_MODEL_PRESETS,
  type AiImageModelId,
} from "@shared/ai-images";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const AI_IMAGE_CLIENT_TIMEOUT_MS = AI_IMAGE_LIMITS.timeoutMs + 5_000;
const GENERATED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

interface AiImageGeneratorProps {
  consentGranted: boolean;
  onConsentGranted: () => void;
  onOpenImportReview: (file: File, requestId: string) => void;
  userId: string | null;
}

interface AiImageStatus {
  configured: boolean;
  enabled: boolean;
  models: ReadonlyArray<{
    id: AiImageModelId;
    label: string;
    note: string;
  }>;
  userDailyLimit: number;
}

interface GeneratedImage {
  file: File;
  model: string;
  requestId: string;
  url: string;
}

const ORIGINAL_STARTERS = [
  "Create an original friendly island robot badge with a bold silhouette, flat colors, and a plain high-contrast background.",
  "Create an original cheerful mushroom mascot icon with clean outlines and a simple centered composition.",
  "Create an original spooky-but-playful lighthouse sticker with readable shapes and fewer than 16 visual colors.",
] as const;

export function AiImageGenerator({
  consentGranted,
  onConsentGranted,
  onOpenImportReview,
  userId,
}: AiImageGeneratorProps) {
  const [status, setStatus] = useState<AiImageStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [prompt, setPrompt] = useState<string>(ORIGINAL_STARTERS[0]);
  const [model, setModel] = useState<AiImageModelId>(AI_IMAGE_DEFAULT_MODEL);
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    let active = true;
    void fetch("/api/ai/images/status", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok || !isRecord(payload) || !isRecord(payload.data)) {
          throw new Error("Invalid image-generation status.");
        }
        const parsed = parseStatus(payload.data);
        if (!parsed) throw new Error("Invalid image-generation status.");
        if (active) {
          setStatus(parsed);
          setStatusError(false);
        }
      })
      .catch(() => {
        if (active) setStatusError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      requestGenerationRef.current += 1;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (generated) URL.revokeObjectURL(generated.url);
    };
  }, [generated]);

  const beginGenerate = () => {
    if (!userId) {
      setError("Sign in and finish account setup before generating artwork.");
      return;
    }
    if (!consentGranted) {
      setShowConsent(true);
      return;
    }
    void generate();
  };

  const acceptConsentAndGenerate = () => {
    onConsentGranted();
    setShowConsent(false);
    void generate();
  };

  const generate = async () => {
    const trimmedPrompt = prompt.trim();
    if (
      !trimmedPrompt ||
      !userId ||
      !status?.enabled ||
      !status.configured ||
      isGenerating
    ) {
      return;
    }

    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      AI_IMAGE_CLIENT_TIMEOUT_MS,
    );
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/images", {
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          model,
          prompt: trimmedPrompt,
        }),
        credentials: "include",
        headers: {
          Accept: "image/png,image/webp,image/jpeg,application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const contentType =
        response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      if (!GENERATED_IMAGE_TYPES.has(contentType)) {
        throw new Error(
          "The image service returned an unsupported file type. Nothing was imported.",
        );
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > AI_IMAGE_LIMITS.maxDecodedImageBytes
      ) {
        throw new Error(
          "The generated image exceeded the safe local review limit.",
        );
      }
      const blob = await response.blob();
      if (
        blob.size < 1 ||
        blob.size > AI_IMAGE_LIMITS.maxDecodedImageBytes ||
        !GENERATED_IMAGE_TYPES.has(blob.type)
      ) {
        throw new Error(
          "The generated image could not be safely prepared for review.",
        );
      }
      if (requestGenerationRef.current !== requestGeneration) return;

      const requestId =
        response.headers.get("x-ai-image-request-id") ?? crypto.randomUUID();
      const extension =
        contentType === "image/jpeg"
          ? "jpg"
          : contentType === "image/webp"
            ? "webp"
            : "png";
      const file = new File(
        [blob],
        `generated-artwork-${requestId.slice(0, 8)}.${extension}`,
        { type: contentType },
      );
      setGenerated({
        file,
        model: response.headers.get("x-ai-image-model") ?? model,
        requestId,
        url: URL.createObjectURL(file),
      });
    } catch (caught) {
      if (requestGenerationRef.current !== requestGeneration) return;
      setError(
        controller.signal.aborted
          ? "Image generation was canceled or timed out. No canvas or cloud data changed."
          : caught instanceof Error
            ? caught.message
            : "Image generation failed. No canvas or cloud data changed.",
      );
    } finally {
      window.clearTimeout(timeoutId);
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
      }
      if (requestGenerationRef.current === requestGeneration) {
        setIsGenerating(false);
      }
    }
  };

  const cancel = () => {
    requestGenerationRef.current += 1;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setIsGenerating(false);
    setError("Image generation canceled. Your prompt is still ready to edit.");
  };

  const ready = status?.enabled === true && status.configured;

  return (
    <section
      className="space-y-3 rounded-2xl border border-primary/25 bg-[linear-gradient(145deg,hsl(var(--primary)/0.08),hsl(var(--background))_55%)] p-3 shadow-sm"
      aria-labelledby="ai-image-generator-title"
    >
      <div className="flex items-start gap-2">
        <div className="rounded-xl bg-primary p-2 text-primary-foreground">
          <ImageIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 id="ai-image-generator-title" className="text-sm font-black">
            Generate artwork, then convert it
          </h2>
          <p className="mt-1 text-[0.7rem] leading-5 text-muted-foreground">
            A real image model creates one original source image. You review it,
            then the existing importer converts it to the exact 256×256 game
            grid. Nothing paints, saves, uploads, or publishes automatically.
          </p>
        </div>
      </div>

      {statusError ? (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950"
          role="status"
        >
          Image-generation status could not be verified. Manual import, drawing,
          and export remain available.
        </p>
      ) : status === null ? (
        <p className="text-xs text-muted-foreground" role="status">
          Checking image-generation availability…
        </p>
      ) : !ready ? (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950"
          role="status"
        >
          Image generation is unavailable on this deployment. The advice
          assistant and all manual Studio tools remain available.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="ai-image-model" className="text-xs font-semibold">
              Image model
            </Label>
            <Select
              value={model}
              onValueChange={(value) => setModel(value as AiImageModelId)}
              disabled={isGenerating}
            >
              <SelectTrigger
                id="ai-image-model"
                className="h-9 bg-background text-xs"
                aria-label="Image model"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {status.models.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[0.68rem] leading-4 text-muted-foreground">
              Default: fast Gemini Flash Lite. Full Gemini Flash Image is an
              explicit higher-detail option and is never selected automatically.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-image-prompt" className="text-xs font-semibold">
              Describe original artwork
            </Label>
            <Textarea
              id="ai-image-prompt"
              autoComplete="off"
              className="min-h-28 resize-none bg-background text-xs"
              disabled={isGenerating || !userId}
              maxLength={AI_IMAGE_LIMITS.maxPromptLength}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe one original, centered design with clean shapes…"
              value={prompt}
            />
            <p className="text-right font-mono text-[0.65rem] text-muted-foreground">
              {prompt.length.toLocaleString()} /{" "}
              {AI_IMAGE_LIMITS.maxPromptLength.toLocaleString()}
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[0.68rem] font-bold text-muted-foreground">
              Original prompt starters
            </p>
            {ORIGINAL_STARTERS.map((starter) => (
              <Button
                key={starter}
                type="button"
                variant="outline"
                size="sm"
                className="h-auto w-full justify-start whitespace-normal bg-background py-2 text-left text-xs"
                disabled={isGenerating}
                onClick={() => setPrompt(starter)}
              >
                {starter}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11 flex-1 text-xs"
              disabled={!userId || !prompt.trim() || isGenerating}
              onClick={beginGenerate}
            >
              {isGenerating ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : generated ? (
                <RefreshCw className="mr-2 h-4 w-4" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {isGenerating
                ? "Generating one image…"
                : generated
                  ? "Regenerate"
                  : "Generate one image"}
            </Button>
            {isGenerating ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 text-xs"
                onClick={cancel}
              >
                <Square className="mr-2 h-3.5 w-3.5" />
                Cancel
              </Button>
            ) : null}
          </div>

          <p className="text-[0.66rem] leading-4 text-muted-foreground">
            Up to {status.userDailyLimit} accepted requests per UTC day. The
            server reserves shared capacity before contacting the model
            provider.
          </p>
        </>
      )}

      {showConsent ? (
        <div
          role="alertdialog"
          aria-label="AI image generation consent"
          aria-describedby="ai-image-consent-description"
          className="space-y-2 rounded-xl border border-primary/40 bg-background p-3"
        >
          <p className="text-xs font-semibold">
            Send this prompt to external image providers?
          </p>
          <p
            id="ai-image-consent-description"
            className="text-[0.68rem] leading-5 text-muted-foreground"
          >
            The prompt goes through OpenRouter to the selected external image
            model under a no-data-collection routing requirement. No source
            photo or current canvas is included. D1 stores a prompt hash,
            request state and model—not prompt text or image bytes. The result
            remains local until you explicitly commit the converted grid. Do not
            include sensitive information.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={acceptConsentAndGenerate}>
              Agree and generate
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowConsent(false)}
            >
              Not now
            </Button>
          </div>
        </div>
      ) : null}

      {generated ? (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
          <img
            src={generated.url}
            alt="Generated original artwork waiting for 256 by 256 import review"
            className="mx-auto aspect-square max-h-72 w-full rounded-lg border border-emerald-200 bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] object-contain"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 text-[0.68rem] text-emerald-950">
              <p className="truncate font-semibold">{generated.model}</p>
              <p>Generation request recorded</p>
            </div>
            <Button
              type="button"
              size="sm"
              className="min-h-11 text-xs"
              onClick={() =>
                onOpenImportReview(generated.file, generated.requestId)
              }
            >
              Review 256×256 conversion
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-[0.66rem] leading-4 text-emerald-950/80">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This is still only a browser-local source preview. The canvas has
            not changed.
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-950"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function parseStatus(value: Record<string, unknown>): AiImageStatus | null {
  if (
    typeof value.configured !== "boolean" ||
    typeof value.enabled !== "boolean" ||
    !Number.isSafeInteger(value.userDailyLimit) ||
    (value.userDailyLimit as number) < 0 ||
    (value.userDailyLimit as number) > 100 ||
    !Array.isArray(value.models)
  ) {
    return null;
  }
  const models = value.models.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.label !== "string" ||
      typeof entry.note !== "string" ||
      !AI_IMAGE_MODEL_PRESETS.some((preset) => preset.id === entry.id)
    ) {
      return [];
    }
    return [
      {
        id: entry.id as AiImageModelId,
        label: entry.label,
        note: entry.note,
      },
    ];
  });
  const modelIds = new Set(models.map((entry) => entry.id));
  if (
    models.length !== AI_IMAGE_MODEL_PRESETS.length ||
    modelIds.size !== AI_IMAGE_MODEL_PRESETS.length ||
    !AI_IMAGE_MODEL_PRESETS.every((preset) => modelIds.has(preset.id))
  ) {
    return null;
  }
  return {
    configured: value.configured,
    enabled: value.enabled,
    models,
    userDailyLimit: value.userDailyLimit as number,
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload: unknown = await response.json();
      if (
        isRecord(payload) &&
        isRecord(payload.error) &&
        typeof payload.error.message === "string"
      ) {
        return payload.error.message;
      }
    } catch {
      // Fall through to the stable status-based message.
    }
  }
  return response.status === 429
    ? "The image-generation limit has been reached. Try again later."
    : "Image generation could not be completed. No canvas or cloud data changed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
