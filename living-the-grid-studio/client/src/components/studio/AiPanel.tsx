/**
 * AiPanel.tsx — OpenRouter chat and AI sketch generation controls
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Paintbrush,
  Plus,
  Send,
  Square,
  Trash2,
  WandSparkles,
} from "lucide-react";
import type {
  AiChatMessage,
  AiModelPreset,
  AiDocumentSummary,
  AiGridImage,
  AiGridSketch,
} from "@shared/ai";
import {
  AI_SKETCH_LIMITS,
  OPENROUTER_MODEL_PRESETS,
  maxAiRefineDimension,
  validateAiGridSketch,
} from "@shared/ai";
import { Button } from "@/components/ui/button";
import { AiImageGenerator } from "@/components/studio/AiImageGenerator";
import { GoogleSignIn } from "@/components/community/RequireAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import { formatCountLabel } from "@/lib/format-count";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { GridDocument } from "@/lib/engine/grid";
import { createGridDocumentFromAiSketch } from "@/lib/engine/ai-sketch";
import { exportGridAsPng } from "@/lib/engine/canvas-renderer";
import {
  AI_SESSION_LIMITS,
  boundAiMessages,
  normalizeOpenRouterModelChoice,
  parseSavedAiSessions,
  type SavedAiSession,
} from "@/lib/ai-models";
import { readAiChatResponse } from "@/lib/ai-http";

interface AiPanelProps {
  currentDoc: GridDocument | null;
  onOpenGeneratedImage: (file: File, requestId: string) => void;
  onApplySketch: (doc: GridDocument) => void;
}

const AI_SESSION_STORAGE_KEY = "ltg.ai.sessions.v1";
// Consent and chat history are scoped to the authenticated internal user ID so
// one account never inherits another account's local AI data on a shared device.
const AI_CONSENT_STORAGE_KEY = "ltg.ai.consent.v1";
const AI_CONSENT_DISCLOSURE_VERSION = 2;
// Client ceilings sit slightly above the server's upstream timeouts so the
// server's cleaner error message wins when the provider is slow.
const AI_CHAT_TIMEOUT_MS = 95_000;
const AI_METADATA_TIMEOUT_MS = 10_000;

function scopedStorageKey(base: string, userId: string): string {
  return `${base}.${userId}`;
}

type AiDataCollectionPolicy = "allow" | "deny" | "unknown";

interface ActiveAiRequest {
  controller: AbortController;
  previousMessages: AiChatMessage[];
  prompt: string;
  timedOut: boolean;
  timeoutId: number;
}

function consentStorageValue(policy: AiDataCollectionPolicy): string {
  return `v${AI_CONSENT_DISCLOSURE_VERSION}:${policy}`;
}

function readStoredAiConsent(
  userId: string,
  policy: AiDataCollectionPolicy,
): boolean {
  try {
    return (
      localStorage.getItem(scopedStorageKey(AI_CONSENT_STORAGE_KEY, userId)) ===
      consentStorageValue(policy)
    );
  } catch {
    return false;
  }
}

function persistAiConsent(
  userId: string,
  policy: AiDataCollectionPolicy,
): void {
  try {
    localStorage.setItem(
      scopedStorageKey(AI_CONSENT_STORAGE_KEY, userId),
      consentStorageValue(policy),
    );
  } catch {
    /* Private browsing: consent simply re-prompts next session. */
  }
}
// ModelPresetWithAvailability removed — `available?: boolean` now lives on the
// canonical AiModelPreset type in shared/ai.ts so client + server share one
// wire shape.

const DRAWING_STARTER_PROMPTS = [
  "Draw a 16x16 spooky mascot head with clear eyes and teeth.",
  "Draw a 16x16 mushroom badge using fewer than 8 colors.",
  "Draw a 16x16 friendly island robot with a simple silhouette.",
];

type AiWorkflow = "create" | "refine" | "advice";

function supportsWorkflow(
  preset: AiModelPreset,
  workflow: AiWorkflow,
  requiredRefineDimension: number,
): boolean {
  if (preset.available === false) return false;
  if (preset.adviceOnly === true) return workflow === "advice";
  return (
    workflow !== "refine" ||
    maxAiRefineDimension(preset) >= requiredRefineDimension
  );
}

function getPreferredPreset(
  presets: AiModelPreset[],
  workflow: AiWorkflow,
  requiredRefineDimension: number,
): AiModelPreset | null {
  const compatible = presets.filter((preset) =>
    supportsWorkflow(preset, workflow, requiredRefineDimension),
  );
  if (workflow === "advice") {
    return (
      compatible.find((preset) => preset.adviceOnly === true) ??
      compatible[0] ??
      null
    );
  }
  return compatible.find((preset) => preset.adviceOnly !== true) ?? null;
}

export default function AiPanel({
  currentDoc,
  onApplySketch,
  onOpenGeneratedImage,
}: AiPanelProps) {
  const { serviceMessage, status: authStatus, user } = useAuth();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [dataCollectionPolicy, setDataCollectionPolicy] =
    useState<AiDataCollectionPolicy>("unknown");
  const [sessions, setSessions] = useState<SavedAiSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [modelChoice, setModelChoice] = useState(
    OPENROUTER_MODEL_PRESETS[0].id,
  );
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [includeGridImage, setIncludeGridImage] = useState(false);
  const [includeGridSummary, setIncludeGridSummary] = useState(false);
  const [requestSketch, setRequestSketch] = useState(true);
  const [pendingSketch, setPendingSketch] = useState<AiGridSketch | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAiConsent, setHasAiConsent] = useState(false);
  const [showConsentPrompt, setShowConsentPrompt] = useState(false);
  const consentAcceptRef = useRef<HTMLButtonElement>(null);
  const requestGenerationRef = useRef(0);
  const activeRequestRef = useRef<ActiveAiRequest | null>(null);
  const [presets, setPresets] = useState<AiModelPreset[]>(
    OPENROUTER_MODEL_PRESETS,
  );
  const workflow: AiWorkflow = !requestSketch
    ? "advice"
    : includeGridImage
      ? "refine"
      : "create";
  const requiredRefineDimension = Math.max(
    currentDoc?.width ?? AI_SKETCH_LIMITS.minDimension,
    currentDoc?.height ?? AI_SKETCH_LIMITS.minDimension,
  );

  useEffect(() => {
    requestGenerationRef.current += 1;
    setIsLoading(false);
    let active = true;
    const loadPresets = async () => {
      try {
        const response = await fetch("/api/ai/models", {
          signal: AbortSignal.timeout(AI_METADATA_TIMEOUT_MS),
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          presets?: AiModelPreset[];
        };
        if (
          !active ||
          !Array.isArray(data.presets) ||
          data.presets.length === 0
        )
          return;
        setPresets(data.presets);
      } catch {
        /* Keep built-in presets if endpoint is unavailable. */
      }
    };

    loadPresets();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const preset = presets.find((entry) => entry.id === modelChoice);
    if (
      !preset ||
      !supportsWorkflow(preset, workflow, requiredRefineDimension)
    ) {
      const fallback = getPreferredPreset(
        presets,
        workflow,
        requiredRefineDimension,
      );
      setModelChoice(fallback?.id ?? "");
    }
  }, [modelChoice, presets, requiredRefineDimension, workflow]);

  const selectedModel = modelChoice;
  const selectedPreset = presets.find((preset) => preset.id === selectedModel);
  const hasAvailableModels = presets.some((preset) =>
    supportsWorkflow(preset, workflow, requiredRefineDimension),
  );
  const visionPreset = presets.find(
    (preset) =>
      preset.available !== false &&
      maxAiRefineDimension(preset) >= requiredRefineDimension,
  );
  const canRefineDimensions = Boolean(
    currentDoc &&
    currentDoc.width <= AI_SKETCH_LIMITS.maxDimension &&
    currentDoc.height <= AI_SKETCH_LIMITS.maxDimension,
  );
  const canRefine = Boolean(currentDoc && canRefineDimensions && visionPreset);
  const currentSummary = useMemo(
    () => (includeGridSummary ? summarizeDocument(currentDoc) : null),
    [currentDoc, includeGridSummary],
  );

  useEffect(() => {
    if (!includeGridImage) return;
    if (
      selectedPreset &&
      maxAiRefineDimension(selectedPreset) >= requiredRefineDimension
    ) {
      return;
    }
    if (visionPreset) {
      setModelChoice(visionPreset.id);
      return;
    }
    setIncludeGridImage(false);
    setIncludeGridSummary(false);
    setError(
      "Canvas refinement is unavailable because no vision-capable free model has enough output capacity for this grid.",
    );
  }, [includeGridImage, requiredRefineDimension, selectedPreset, visionPreset]);
  const pendingPreview = useMemo(() => {
    if (!pendingSketch) return null;
    try {
      const previewDoc = createGridDocumentFromAiSketch(pendingSketch);
      const maxDimension = Math.max(previewDoc.width, previewDoc.height);
      const cellSize = Math.max(
        2,
        Math.min(12, Math.floor(256 / maxDimension)),
      );
      return {
        colorCount: previewDoc.usedColors.length,
        dataUrl: exportGridAsPng(previewDoc, {
          cellSize,
          gridColor: "transparent",
          gridWidth: 0,
          highlightColorId: null,
          labelFontSize: 0,
          showGrid: false,
          showLabels: false,
          zoom: 1,
        }),
      };
    } catch {
      return null;
    }
  }, [pendingSketch]);

  const hydrateSession = (session: SavedAiSession) => {
    setIncludeGridImage(Boolean(session.includeGridImage));
    setIncludeGridSummary(session.includeGridSummary);
    setMessages(session.messages);
    setModelChoice(normalizeOpenRouterModelChoice(session.modelChoice));
    setRequestSketch(session.requestSketch);
  };

  useEffect(() => {
    const activeRequest = activeRequestRef.current;
    if (activeRequest) {
      window.clearTimeout(activeRequest.timeoutId);
      activeRequest.controller.abort();
      activeRequestRef.current = null;
    }
    requestGenerationRef.current += 1;
    setIsLoading(false);
    setHydratedUserId(null);
    setShowConsentPrompt(false);
    setPendingSketch(null);
    setError(null);
    setInput("");
    if (!user) {
      setSessions([]);
      setActiveSessionId("");
      setMessages([]);
      setHasAiConsent(false);
      return;
    }
    removeLegacySharedAiStorage();
    setHasAiConsent(false);
    const loaded = readAiSessions(user.id);
    const initialSession = loaded[0] ?? createEmptySession();
    const nextSessions = loaded.length > 0 ? loaded : [initialSession];
    setSessions(nextSessions);
    hydrateSession(initialSession);
    setActiveSessionId(initialSession.id);
    setHydratedUserId(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setHasAiConsent(false);
      return;
    }
    setHasAiConsent(readStoredAiConsent(user.id, dataCollectionPolicy));
  }, [dataCollectionPolicy, user?.id]);

  useEffect(
    () => () => {
      const activeRequest = activeRequestRef.current;
      if (!activeRequest) return;
      window.clearTimeout(activeRequest.timeoutId);
      activeRequest.controller.abort();
      activeRequestRef.current = null;
      requestGenerationRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    let canceled = false;
    fetch("/api/ai/status", {
      signal: AbortSignal.timeout(AI_METADATA_TIMEOUT_MS),
    })
      .then((response) => response.json())
      .then(
        (data: {
          configured?: boolean;
          dataCollection?: "allow" | "deny" | "unknown";
        }) => {
          if (canceled) return;
          setConfigured(Boolean(data.configured));
          setDataCollectionPolicy(data.dataCollection ?? "unknown");
        },
      )
      .catch(() => {
        if (!canceled) {
          setConfigured(false);
          setDataCollectionPolicy("unknown");
        }
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    // The visible user message is optimistic while a provider request is in
    // flight. Persist only settled conversations so a tab close, route change,
    // or account switch cannot leave a one-sided canceled turn in history.
    if (isLoading || !activeSessionId || !user || hydratedUserId !== user.id)
      return;
    setSessions((prev) => {
      const now = new Date().toISOString();
      const session = {
        createdAt:
          prev.find((entry) => entry.id === activeSessionId)?.createdAt ?? now,
        id: activeSessionId,
        includeGridImage,
        includeGridSummary,
        messages,
        modelChoice,
        requestSketch,
        title: inferSessionTitle(messages),
        updatedAt: now,
      };
      const next = [
        session,
        ...prev.filter((entry) => entry.id !== activeSessionId),
      ]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 12);
      writeAiSessions(user.id, next);
      return next;
    });
  }, [
    activeSessionId,
    includeGridImage,
    includeGridSummary,
    hydratedUserId,
    isLoading,
    messages,
    modelChoice,
    requestSketch,
    user?.id,
  ]);

  useEffect(() => {
    if (!showConsentPrompt) return;
    consentAcceptRef.current?.focus();
  }, [showConsentPrompt]);

  const startNewSession = () => {
    if (!user || isLoading) return;
    const session = createEmptySession();
    hydrateSession(session);
    setActiveSessionId(session.id);
    setSessions((prev) => {
      const next = [session, ...prev].slice(0, 12);
      writeAiSessions(user.id, next);
      return next;
    });
    setInput("");
    setPendingSketch(null);
    setError(null);
  };

  const selectSession = (sessionId: string) => {
    if (isLoading) return;
    const session = sessions.find((entry) => entry.id === sessionId);
    if (!session) return;
    hydrateSession(session);
    setActiveSessionId(session.id);
    setInput("");
    setPendingSketch(null);
    setError(null);
  };

  const deleteActiveSession = () => {
    if (!activeSessionId || !user || isLoading) return;
    const nextSessions = sessions.filter(
      (entry) => entry.id !== activeSessionId,
    );
    const nextActive = nextSessions[0] ?? createEmptySession();
    const savedSessions = nextSessions.length > 0 ? nextSessions : [nextActive];
    writeAiSessions(user.id, savedSessions);
    setSessions(savedSessions);
    hydrateSession(nextActive);
    setActiveSessionId(nextActive.id);
    setInput("");
    setPendingSketch(null);
    setError(null);
  };

  const performSend = async () => {
    const trimmed = input.trim().slice(0, AI_SESSION_LIMITS.messageCharacters);
    if (!trimmed || !selectedModel || isLoading || configured !== true) return;

    const previousMessages = messages;
    const nextMessages = boundAiMessages([
      ...previousMessages,
      { role: "user", content: trimmed },
    ]);
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);
    setPendingSketch(null);
    const requestGeneration = ++requestGenerationRef.current;
    const preserveDimensions = workflow === "refine";
    const expectedDimensions = currentDoc
      ? { height: currentDoc.height, width: currentDoc.width }
      : null;
    const controller = new AbortController();
    const activeRequest: ActiveAiRequest = {
      controller,
      previousMessages,
      prompt: trimmed,
      timedOut: false,
      timeoutId: 0,
    };
    activeRequest.timeoutId = window.setTimeout(() => {
      activeRequest.timedOut = true;
      controller.abort();
    }, AI_CHAT_TIMEOUT_MS);
    activeRequestRef.current = activeRequest;

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          currentDocument: currentSummary,
          currentGridImage:
            includeGridImage && currentDoc
              ? createGridImagePayload(currentDoc)
              : null,
          messages: nextMessages,
          model: selectedModel,
          preserveDimensions,
          requestSketch,
          sessionId: activeSessionId,
        }),
      });
      const data = await readAiChatResponse(response);
      if (requestGenerationRef.current !== requestGeneration) return;
      setMessages((prev) =>
        boundAiMessages([...prev, { role: "assistant", content: data.reply }]),
      );
      let responseWarning = data.warning ?? null;
      if (data.sketch) {
        const validated = validateAiGridSketch(data.sketch);
        if (!validated.ok) {
          responseWarning = `The AI returned an unsafe sketch (${validated.error}). Nothing was applied.`;
        } else if (
          preserveDimensions &&
          expectedDimensions &&
          (validated.sketch.width !== expectedDimensions.width ||
            validated.sketch.height !== expectedDimensions.height)
        ) {
          responseWarning = `The AI changed this refinement to ${validated.sketch.width}x${validated.sketch.height}; it must remain ${expectedDimensions.width}x${expectedDimensions.height}. Nothing was applied.`;
        } else {
          setPendingSketch(validated.sketch);
        }
      } else if (requestSketch) {
        responseWarning =
          responseWarning ??
          (preserveDimensions
            ? "The model replied with text but did not return a usable canvas refinement. Nothing can be previewed or applied."
            : "The text model replied but did not return a usable structured grid. Nothing can be previewed or applied. Try a simpler prompt or continue with the manual drawing tools.");
      }
      setError(responseWarning);
    } catch (err) {
      if (requestGenerationRef.current !== requestGeneration) return;
      // A failed request is not a completed conversation turn. Restore both
      // the prior history and editable prompt so retry never duplicates it.
      setMessages(previousMessages);
      setInput(trimmed);
      setError(
        activeRequest.timedOut
          ? "The AI request timed out. Try again, ask for a smaller sketch, or pick a faster model."
          : err instanceof Error
            ? err.message
            : "AI request failed.",
      );
    } finally {
      window.clearTimeout(activeRequest.timeoutId);
      if (activeRequestRef.current === activeRequest) {
        activeRequestRef.current = null;
      }
      if (requestGenerationRef.current === requestGeneration) {
        setIsLoading(false);
      }
    }
  };

  const sendMessage = () => {
    if (!user) {
      setError("Sign in and finish account setup before using AI Draw.");
      return;
    }
    if (!input.trim() || !selectedModel || isLoading || configured !== true)
      return;
    // Explicit, informed consent before anything leaves the browser for a
    // third-party AI provider. Deterministic import/paint flows never require
    // this — only the optional AI features do.
    if (!hasAiConsent) {
      setShowConsentPrompt(true);
      return;
    }
    void performSend();
  };

  const cancelAiRequest = () => {
    const activeRequest = activeRequestRef.current;
    if (!activeRequest) return;
    requestGenerationRef.current += 1;
    window.clearTimeout(activeRequest.timeoutId);
    activeRequest.controller.abort();
    activeRequestRef.current = null;
    setMessages(activeRequest.previousMessages);
    setInput(activeRequest.prompt);
    setPendingSketch(null);
    setIsLoading(false);
    setError(
      "AI request canceled. Your prompt is ready to edit or send again.",
    );
  };

  const grantAiConsent = () => {
    if (!user) return;
    persistAiConsent(user.id, dataCollectionPolicy);
    setHasAiConsent(true);
  };

  const acceptAiConsent = () => {
    grantAiConsent();
    setShowConsentPrompt(false);
    void performSend();
  };

  const declineAiConsent = () => {
    setShowConsentPrompt(false);
  };

  const chooseWorkflow = (nextWorkflow: AiWorkflow) => {
    setPendingSketch(null);
    setError(null);
    if (nextWorkflow === "create") {
      const createPreset = getPreferredPreset(
        presets,
        "create",
        requiredRefineDimension,
      );
      if (selectedPreset?.adviceOnly === true && createPreset) {
        setModelChoice(createPreset.id);
      }
      setRequestSketch(true);
      setIncludeGridSummary(false);
      setIncludeGridImage(false);
      if (!input.trim()) {
        setInput(
          "Draw a 32x32 original island character with a clear silhouette and fewer than 12 colors.",
        );
      }
      return;
    }
    if (nextWorkflow === "refine") {
      if (!currentDoc || !canRefineDimensions || !visionPreset) return;
      setModelChoice(visionPreset.id);
      setRequestSketch(true);
      setIncludeGridSummary(true);
      setIncludeGridImage(true);
      if (!input.trim()) {
        setInput(
          "Improve the current canvas while preserving its subject and dimensions. Return a cleaner complete grid.",
        );
      }
      return;
    }
    const advicePreset = getPreferredPreset(
      presets,
      "advice",
      requiredRefineDimension,
    );
    if (advicePreset) setModelChoice(advicePreset.id);
    setRequestSketch(false);
    setIncludeGridSummary(Boolean(currentDoc));
    setIncludeGridImage(false);
    if (!input.trim()) {
      setInput(
        "Give me a short, practical plan for making this design easier to repaint by hand.",
      );
    }
  };

  const chooseDrawingStarter = (prompt: string) => {
    // Drawing starters are intentionally mode-setting actions. Without this,
    // a locally persisted Advice session can send a drawing prompt as prose
    // and make it look as though AI Draw silently failed.
    setPendingSketch(null);
    setError(null);
    const createPreset = getPreferredPreset(
      presets,
      "create",
      requiredRefineDimension,
    );
    if (selectedPreset?.adviceOnly === true && createPreset) {
      setModelChoice(createPreset.id);
    }
    setRequestSketch(true);
    setIncludeGridSummary(false);
    setIncludeGridImage(false);
    setInput(prompt);
  };

  const applySketch = () => {
    if (!pendingSketch) return;
    let finalDoc;
    try {
      finalDoc = createGridDocumentFromAiSketch(pendingSketch);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The AI sketch could not be applied.",
      );
      return;
    }

    setError(null);
    // Commit the validated sketch exactly once. The previous decorative
    // row-by-row animation pushed dozens of history entries, so Undo landed on
    // a partial frame. A single structured document commit is deterministic,
    // accessible to automation, and one-step undoable.
    onApplySketch(finalDoc);
    setPendingSketch(null);
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="section-header mb-1">AI Draw</p>
        <p className="text-xs text-muted-foreground">
          Pick one goal, describe the result, then review before anything is
          applied to the canvas.
        </p>
      </div>

      <AiImageGenerator
        consentGranted={hasAiConsent}
        onConsentGranted={grantAiConsent}
        onOpenImportReview={onOpenGeneratedImage}
        userId={user?.id ?? null}
      />

      {!hasAvailableModels ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950"
        >
          No free AI model is currently available. Manual Studio tools and all
          exports remain available.
        </p>
      ) : null}

      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
        <p id="ai-workflow-label" className="text-xs font-semibold">
          What should AI do?
        </p>
        <div
          className="grid gap-2 sm:grid-cols-3 md:grid-cols-1 xl:grid-cols-3"
          role="group"
          aria-labelledby="ai-workflow-label"
        >
          <button
            type="button"
            className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              workflow === "create"
                ? "border-primary bg-primary/5 ring-2 ring-primary/15"
                : "border-border bg-background hover:border-primary/40"
            }`}
            aria-pressed={workflow === "create"}
            disabled={isLoading}
            onClick={() => chooseWorkflow("create")}
          >
            <WandSparkles className="mb-2 h-4 w-4 text-primary" />
            <span className="block text-xs font-black">
              Experimental grid sketch
            </span>
            <span className="mt-1 block text-[0.68rem] leading-4 text-muted-foreground">
              A text model attempts structured grid JSON. Results can fail and
              are never applied without review.
            </span>
          </button>
          <button
            type="button"
            className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              workflow === "refine"
                ? "border-primary bg-primary/5 ring-2 ring-primary/15"
                : "border-border bg-background hover:border-primary/40"
            }`}
            aria-pressed={workflow === "refine"}
            disabled={isLoading || !canRefine}
            onClick={() => chooseWorkflow("refine")}
          >
            <Paintbrush className="mb-2 h-4 w-4 text-primary" />
            <span className="block text-xs font-black">Refine this canvas</span>
            <span className="mt-1 block text-[0.68rem] leading-4 text-muted-foreground">
              Explicitly attaches a clean grid snapshot, never the source photo.
            </span>
          </button>
          <button
            type="button"
            className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              workflow === "advice"
                ? "border-primary bg-primary/5 ring-2 ring-primary/15"
                : "border-border bg-background hover:border-primary/40"
            }`}
            aria-pressed={workflow === "advice"}
            disabled={isLoading}
            onClick={() => chooseWorkflow("advice")}
          >
            <Bot className="mb-2 h-4 w-4 text-primary" />
            <span className="block text-xs font-black">Get advice only</span>
            <span className="mt-1 block text-[0.68rem] leading-4 text-muted-foreground">
              Returns written guidance and cannot replace the canvas.
            </span>
          </button>
        </div>
        {currentDoc && !canRefineDimensions ? (
          <p className="text-[0.68rem] leading-4 text-amber-800">
            Refine supports canvases up to {AI_SKETCH_LIMITS.maxDimension}×
            {AI_SKETCH_LIMITS.maxDimension}. Resize or use advice mode for this{" "}
            {currentDoc.width}×{currentDoc.height} canvas.
          </p>
        ) : currentDoc && !visionPreset ? (
          <p className="text-[0.68rem] leading-4 text-amber-800">
            Refine will unlock when a vision-capable free model with enough
            output capacity is available.
          </p>
        ) : null}
      </div>

      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-xs font-bold">
          Advanced AI settings
        </summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-3 rounded-sm border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor="ai-chat-session-select"
                className="text-xs font-semibold"
              >
                Chat Session
              </Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[0.7rem]"
                  disabled={isLoading}
                  onClick={startNewSession}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  New
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[0.7rem]"
                  disabled={isLoading}
                  onClick={deleteActiveSession}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Delete
                </Button>
              </div>
            </div>
            <Select
              value={activeSessionId}
              onValueChange={selectSession}
              disabled={isLoading}
            >
              <SelectTrigger
                id="ai-chat-session-select"
                className="h-8 text-xs"
              >
                <SelectValue placeholder="Choose saved chat" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
              Saved locally in this browser. No database is needed unless you
              want accounts, cross-device sync, or shared cloud sessions.
            </p>
          </div>

          <div className="space-y-3 rounded-sm border border-border bg-card p-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="ai-model-select"
                className="text-xs font-semibold"
              >
                Model
              </Label>
              <Select
                value={modelChoice}
                onValueChange={setModelChoice}
                disabled={isLoading || !hasAvailableModels}
              >
                <SelectTrigger
                  id="ai-model-select"
                  className="h-8 text-xs"
                  aria-label="AI model"
                >
                  <SelectValue placeholder="Choose model" />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((preset) => (
                    <SelectItem
                      key={preset.id}
                      value={preset.id}
                      disabled={
                        !supportsWorkflow(
                          preset,
                          workflow,
                          requiredRefineDimension,
                        )
                      }
                    >
                      #{preset.rank} {preset.label}
                      {preset.available === false ? " (unavailable)" : ""}
                      {preset.available !== false && preset.adviceOnly === true
                        ? " (advice only)"
                        : ""}
                      {preset.available !== false &&
                      maxAiRefineDimension(preset) > 0
                        ? ` (vision ≤${maxAiRefineDimension(preset)}px)`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPreset && (
                <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
                  {selectedPreset.note} Context {selectedPreset.context}. In{" "}
                  {selectedPreset.pricingPrompt}, out{" "}
                  {selectedPreset.pricingCompletion}.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <Checkbox
                  id="ai-request-sketch"
                  checked={requestSketch}
                  disabled={isLoading}
                  onCheckedChange={(checked) =>
                    setRequestSketch(Boolean(checked))
                  }
                />
                <Label htmlFor="ai-request-sketch" className="text-xs">
                  Request experimental grid sketch JSON
                </Label>
              </div>
              <p className="pl-6 text-[0.68rem] leading-relaxed text-muted-foreground">
                This asks a text model for structured cells, not a generated
                image. Turn it off for written critique or planning.
              </p>
              <div className="flex items-center gap-2 text-xs">
                <Checkbox
                  id="ai-include-grid-summary"
                  checked={includeGridSummary}
                  disabled={isLoading}
                  onCheckedChange={(checked) =>
                    setIncludeGridSummary(Boolean(checked))
                  }
                />
                <Label htmlFor="ai-include-grid-summary" className="text-xs">
                  Include current grid summary
                </Label>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Checkbox
                  id="ai-include-grid-image"
                  checked={includeGridImage}
                  disabled={isLoading || !canRefine}
                  onCheckedChange={(checked) => {
                    const next = Boolean(checked);
                    setIncludeGridImage(next);
                    if (next) setIncludeGridSummary(true);
                  }}
                />
                <Label htmlFor="ai-include-grid-image" className="text-xs">
                  Include current canvas for editing
                </Label>
              </div>
              {includeGridImage && (
                <p className="pl-6 text-[0.68rem] leading-relaxed text-muted-foreground">
                  Sends a clean PNG of the current grid to OpenRouter, a
                  third-party AI service, so the model can review or revise the
                  actual composition. Your original uploaded photos are never
                  sent — only this palette-grid render. Turn this off for a
                  text-only request.
                </p>
              )}
            </div>

            <div
              className={`rounded-sm border px-2 py-1 text-xs ${
                configured === null
                  ? "border-border bg-muted text-muted-foreground"
                  : configured
                    ? "border-green-200 bg-green-50 text-green-950"
                    : "border-amber-200 bg-amber-50 text-amber-950"
              }`}
            >
              {configured === null
                ? "Checking AI service availability…"
                : configured
                  ? `AI service ready. Provider data collection policy: ${dataCollectionPolicy}.`
                  : "The AI service is not configured for this deployment."}
            </div>
          </div>
        </div>
      </details>

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <div className="flex flex-wrap gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.08em]">
          <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
            {includeGridImage ? "Canvas attached" : "Text only"}
          </span>
          <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
            {requestSketch ? "Reviewable grid" : "Advice only"}
          </span>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {workflow === "advice"
            ? "Advice only mode. AI will return written guidance."
            : workflow === "refine"
              ? "Canvas refinement mode. AI will attempt a reviewable grid."
              : "Experimental grid sketch mode. AI will attempt a reviewable structured grid."}
        </p>
        <div>
          <p className="text-xs font-semibold">
            Try an experimental grid starter
          </p>
          <p className="mt-1 text-[0.68rem] leading-4 text-muted-foreground">
            Choosing one always switches to Experimental grid sketch, including
            from a saved Advice session.
          </p>
        </div>
        <div className="space-y-2">
          {DRAWING_STARTER_PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto w-full justify-start whitespace-normal text-left text-xs"
              disabled={isLoading}
              aria-label={`Use drawing starter and switch to Experimental grid sketch: ${prompt}`}
              onClick={() => chooseDrawingStarter(prompt)}
            >
              <WandSparkles className="mr-2 h-3.5 w-3.5 shrink-0" />
              {prompt}
            </Button>
          ))}
        </div>

        <div
          className="max-h-64 space-y-2 overflow-auto rounded-sm border border-border bg-background p-2"
          role="log"
          aria-label="AI conversation"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5" />
              Ask for a character, icon, mask, or repaint cleanup plan.
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-sm px-2 py-1.5 text-xs leading-relaxed ${
                  message.role === "user"
                    ? "bg-accent text-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <span className="mb-1 block text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
                  {message.role === "user" ? "You" : "AI"}
                </span>
                <p>{message.content}</p>
              </div>
            ))
          )}
        </div>

        {pendingSketch && (
          <div className="space-y-2 rounded-sm border border-primary/30 bg-primary/5 p-2">
            {pendingPreview && (
              <div className="overflow-hidden rounded-lg border border-primary/20 bg-[#fffef9] p-2">
                <img
                  src={pendingPreview.dataUrl}
                  alt={`Preview of ${pendingSketch.name}`}
                  className="mx-auto max-h-56 w-auto max-w-full rounded object-contain [image-rendering:pixelated]"
                  width={Math.max(1, pendingSketch.width * 4)}
                  height={Math.max(1, pendingSketch.height * 4)}
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">{pendingSketch.name}</p>
                <p className="font-mono text-[0.68rem] text-muted-foreground">
                  {pendingSketch.width}x{pendingSketch.height}
                  {pendingPreview
                    ? ` / ${formatCountLabel(pendingPreview.colorCount, "palette color")}`
                    : ""}
                </p>
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={applySketch}>
                <Paintbrush className="mr-2 h-3.5 w-3.5" />
                Apply once
              </Button>
            </div>
            <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
              The validated grid is applied as one document change, so it can be
              reviewed and undone in one step.
            </p>
          </div>
        )}

        {showConsentPrompt && (
          <div
            role="alertdialog"
            aria-label="AI processing consent"
            aria-describedby="ai-consent-description"
            className="space-y-2 rounded-sm border border-primary/40 bg-primary/5 p-2"
          >
            <p className="text-xs font-semibold">
              Send this request to a third-party AI service?
            </p>
            <p
              id="ai-consent-description"
              className="text-[0.68rem] leading-relaxed text-muted-foreground"
            >
              AI Draw sends your current prompt, recent messages in this AI
              chat, an opaque session ID, and—when selected—a grid summary and
              clean PNG render to OpenRouter, which routes the request to an
              external model provider. Your original uploaded image and its
              filename are never sent.{" "}
              {getDataCollectionConsentText(dataCollectionPolicy)} Provider
              policies can differ, so treat anything you send as leaving this
              device and do not include sensitive information. For a text-only
              sketch request, the server may send one validator-generated
              correction with the same prompt context when the first grid is
              malformed. Deterministic image import never uses AI. This choice
              is stored only for this signed-in account on this browser.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                ref={consentAcceptRef}
                onClick={acceptAiConsent}
              >
                Agree and send
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={declineAiConsent}
              >
                Not now
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-950"
          >
            {error}
          </div>
        )}

        {!user && (
          <div className="space-y-2 rounded-sm border border-sky-200 bg-sky-50 p-3 text-sky-950">
            <p className="text-xs font-semibold">Sign in to use AI Draw</p>
            <p className="text-[0.68rem] leading-relaxed">
              Import, paint, undo, and every export remain available without an
              account. AI requests require an onboarded account so the shared
              provider quota cannot be drained anonymously.
            </p>
            {authStatus !== "loading" && !serviceMessage ? (
              <GoogleSignIn returnTo="/studio" />
            ) : serviceMessage ? (
              <p className="text-[0.68rem]">{serviceMessage}</p>
            ) : null}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="studio-ai-prompt" className="text-xs font-semibold">
            Your AI request
          </Label>
          <Textarea
            id="studio-ai-prompt"
            name="studio-ai-prompt"
            autoComplete="off"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={AI_SESSION_LIMITS.messageCharacters}
            placeholder="Ask for a 32x32 horror icon, a mascot mask, or a repaint cleanup plan..."
            className="min-h-24 resize-none text-xs"
            disabled={!user}
          />
          <p className="text-right font-mono text-[0.65rem] text-muted-foreground">
            {input.length.toLocaleString()} /{" "}
            {AI_SESSION_LIMITS.messageCharacters.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              className="min-w-0 flex-1 text-xs"
              disabled={
                !user ||
                configured !== true ||
                !input.trim() ||
                !selectedModel ||
                !hasAvailableModels ||
                isLoading
              }
              onClick={sendMessage}
            >
              <Send className="mr-2 h-3.5 w-3.5" />
              {isLoading
                ? "Asking model..."
                : workflow === "advice"
                  ? "Ask for advice"
                  : workflow === "refine"
                    ? "Try canvas refinement"
                    : "Try experimental sketch"}
            </Button>
            {isLoading ? (
              <Button
                type="button"
                variant="outline"
                className="shrink-0 text-xs"
                onClick={cancelAiRequest}
              >
                <Square className="mr-2 h-3.5 w-3.5" />
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function summarizeDocument(doc: GridDocument | null): AiDocumentSummary | null {
  if (!doc) return null;
  return {
    // Imported filenames can become document names. Use a generic label so
    // local source-file metadata never leaves the browser.
    name: "Current canvas",
    width: doc.width,
    height: doc.height,
    usedColors: doc.usedColors,
  };
}

function createLocalSessionId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  return `session-${Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function createEmptySession(): SavedAiSession {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    id: createLocalSessionId(),
    includeGridImage: false,
    includeGridSummary: false,
    messages: [],
    modelChoice: OPENROUTER_MODEL_PRESETS[0].id,
    requestSketch: true,
    title: "New AI chat",
    updatedAt: now,
  };
}

function createGridImagePayload(doc: GridDocument): AiGridImage {
  const maxDimension = Math.max(doc.width, doc.height);
  const cellSize = Math.max(1, Math.min(16, Math.floor(512 / maxDimension)));
  return {
    dataUrl: exportGridAsPng(doc, {
      cellSize,
      gridColor: "transparent",
      gridWidth: 0,
      highlightColorId: null,
      labelFontSize: 0,
      showGrid: false,
      showLabels: false,
      zoom: 1,
    }),
    height: doc.height,
    width: doc.width,
  };
}

function inferSessionTitle(messages: AiChatMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) return "New AI chat";
  const title = firstUser.content.replace(/\s+/g, " ").trim();
  return title.length > 42 ? `${title.slice(0, 39)}...` : title;
}

function readAiSessions(userId: string): SavedAiSession[] {
  try {
    return parseSavedAiSessions(
      window.localStorage.getItem(
        scopedStorageKey(AI_SESSION_STORAGE_KEY, userId),
      ),
    );
  } catch {
    return [];
  }
}

function writeAiSessions(userId: string, sessions: SavedAiSession[]): void {
  try {
    window.localStorage.setItem(
      scopedStorageKey(AI_SESSION_STORAGE_KEY, userId),
      JSON.stringify(sessions),
    );
  } catch {
    // Storage can be blocked or full. Keep the session in memory and never
    // turn a successful AI response into an error because persistence failed.
  }
}

function removeLegacySharedAiStorage(): void {
  try {
    window.localStorage.removeItem(AI_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(AI_CONSENT_STORAGE_KEY);
  } catch {
    // Best-effort privacy cleanup for blocked/private storage contexts.
  }
}

function getDataCollectionConsentText(
  policy: "allow" | "deny" | "unknown",
): string {
  if (policy === "deny") {
    return "This deployment requests providers marked for no data collection.";
  }
  if (policy === "allow") {
    return "This deployment allows providers that may collect request data.";
  }
  return "The provider data-collection routing policy could not be confirmed.";
}
