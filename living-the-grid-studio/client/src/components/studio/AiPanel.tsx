/**
 * AiPanel.tsx — OpenRouter chat and AI sketch generation controls
 */

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Paintbrush,
  Plus,
  Send,
  Trash2,
  WandSparkles,
} from "lucide-react";
import type {
  AiChatMessage,
  AiChatResponse,
  AiModelPreset,
  AiDocumentSummary,
  AiGridImage,
  AiGridSketch,
} from "@shared/ai";
import { OPENROUTER_MODEL_PRESETS } from "@shared/ai";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface AiPanelProps {
  currentDoc: GridDocument | null;
  onApplySketch: (doc: GridDocument) => void;
}

const CUSTOM_MODEL_VALUE = "__custom__";
const AI_SESSION_STORAGE_KEY = "ltg.ai.sessions.v1";
type ModelPresetWithAvailability = AiModelPreset & { available?: boolean };

const STARTER_PROMPTS = [
  "Draw a 32x32 spooky mascot head with clear eyes and teeth.",
  "Draw a 16x16 mushroom badge using fewer than 8 colors.",
  "Draw a 32x32 bald schoolhouse horror teacher face with glasses and a ruler.",
  "Suggest how to simplify the current grid for repainting.",
];

interface SavedAiSession {
  createdAt: string;
  customModel: string;
  id: string;
  includeGridImage: boolean;
  includeGridSummary: boolean;
  messages: AiChatMessage[];
  modelChoice: string;
  requestSketch: boolean;
  title: string;
  updatedAt: string;
}

function getFallbackPreset(presets: ModelPresetWithAvailability[]): ModelPresetWithAvailability {
  return (
    presets.find((preset) => preset.available !== false) ??
    OPENROUTER_MODEL_PRESETS[0]
  );
}

export default function AiPanel({ currentDoc, onApplySketch }: AiPanelProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<SavedAiSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [modelChoice, setModelChoice] = useState(
    OPENROUTER_MODEL_PRESETS[0].id,
  );
  const [customModel, setCustomModel] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [includeGridImage, setIncludeGridImage] = useState(false);
  const [includeGridSummary, setIncludeGridSummary] = useState(true);
  const [requestSketch, setRequestSketch] = useState(true);
  const [pendingSketch, setPendingSketch] = useState<AiGridSketch | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<ModelPresetWithAvailability[]>(
    OPENROUTER_MODEL_PRESETS,
  );

  useEffect(() => {
    let active = true;
    const loadPresets = async () => {
      try {
        const response = await fetch("/api/ai/models");
        if (!response.ok) return;
        const data = (await response.json()) as {
          presets?: ModelPresetWithAvailability[];
        };
        if (!active || !Array.isArray(data.presets) || data.presets.length === 0)
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
    if (modelChoice === CUSTOM_MODEL_VALUE) return;
    const preset = presets.find((entry) => entry.id === modelChoice);
    if (!preset || preset.available === false) {
      const fallback = getFallbackPreset(presets);
      setModelChoice(fallback.id);
    }
  }, [modelChoice, presets]);

  const selectedModel =
    modelChoice === CUSTOM_MODEL_VALUE ? customModel.trim() : modelChoice;
  const selectedPreset = presets.find(
    (preset) => preset.id === selectedModel,
  );
  const currentSummary = useMemo(
    () => (includeGridSummary ? summarizeDocument(currentDoc) : null),
    [currentDoc, includeGridSummary],
  );

  const hydrateSession = (session: SavedAiSession) => {
    setCustomModel(session.customModel);
    setIncludeGridImage(Boolean(session.includeGridImage));
    setIncludeGridSummary(session.includeGridSummary);
    setMessages(session.messages);
    setModelChoice(session.modelChoice);
    setRequestSketch(session.requestSketch);
  };

  useEffect(() => {
    const loaded = readAiSessions();
    const initialSession = loaded[0] ?? createEmptySession();
    const nextSessions = loaded.length > 0 ? loaded : [initialSession];
    setSessions(nextSessions);
    hydrateSession(initialSession);
    setActiveSessionId(initialSession.id);
  }, []);

  useEffect(() => {
    let canceled = false;
    fetch("/api/ai/status")
      .then((response) => response.json())
      .then((data: { configured?: boolean }) => {
        if (!canceled) setConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (!canceled) setConfigured(false);
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    setSessions((prev) => {
      const now = new Date().toISOString();
      const session = {
        createdAt:
          prev.find((entry) => entry.id === activeSessionId)?.createdAt ?? now,
        customModel,
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
        .slice(0, 20);
      writeAiSessions(next);
      return next;
    });
  }, [
    activeSessionId,
    customModel,
    includeGridImage,
    includeGridSummary,
    messages,
    modelChoice,
    requestSketch,
  ]);

  const startNewSession = () => {
    const session = createEmptySession();
    hydrateSession(session);
    setActiveSessionId(session.id);
    setSessions((prev) => {
      const next = [session, ...prev].slice(0, 20);
      writeAiSessions(next);
      return next;
    });
    setInput("");
    setPendingSketch(null);
    setError(null);
  };

  const selectSession = (sessionId: string) => {
    const session = sessions.find((entry) => entry.id === sessionId);
    if (!session) return;
    hydrateSession(session);
    setActiveSessionId(session.id);
    setInput("");
    setPendingSketch(null);
    setError(null);
  };

  const deleteActiveSession = () => {
    if (!activeSessionId) return;
    const nextSessions = sessions.filter(
      (entry) => entry.id !== activeSessionId,
    );
    const nextActive = nextSessions[0] ?? createEmptySession();
    const savedSessions = nextSessions.length > 0 ? nextSessions : [nextActive];
    writeAiSessions(savedSessions);
    setSessions(savedSessions);
    hydrateSession(nextActive);
    setActiveSessionId(nextActive.id);
    setInput("");
    setPendingSketch(null);
    setError(null);
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !selectedModel || isLoading) return;

    const nextMessages: AiChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);
    setPendingSketch(null);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentDocument: currentSummary,
          currentGridImage:
            includeGridImage && currentDoc
              ? createGridImagePayload(currentDoc)
              : null,
          messages: nextMessages,
          model: selectedModel,
          requestSketch,
          sessionId: activeSessionId,
        }),
      });
      const data = (await response.json()) as AiChatResponse;
      if (!response.ok) {
        throw new Error(data.reply || "AI request failed.");
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
      if (data.sketch) setPendingSketch(data.sketch);
      if (data.warning) setError(data.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const applySketch = () => {
    if (!pendingSketch) return;
    try {
      const doc = createGridDocumentFromAiSketch(pendingSketch);
      onApplySketch(doc);
      setPendingSketch(null);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The AI sketch could not be applied.",
      );
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="section-header mb-1">AI Draw</p>
        <p className="text-xs text-muted-foreground">
          Saved chats, model comparisons, and applyable pixel sketches.
        </p>
      </div>

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-semibold">Chat Session</Label>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[0.7rem]"
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
              onClick={deleteActiveSession}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>
        <Select value={activeSessionId} onValueChange={selectSession}>
          <SelectTrigger className="h-8 text-xs">
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
          Saved locally in this browser. No database is needed unless you want
          accounts, cross-device sync, or shared cloud sessions.
        </p>
      </div>

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Model</Label>
          <Select value={modelChoice} onValueChange={setModelChoice}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Choose model" />
            </SelectTrigger>
            <SelectContent>
              {presets.map((preset) => (
                <SelectItem
                  key={preset.id}
                  value={preset.id}
                  disabled={preset.available === false}
                >
                  #{preset.rank} {preset.label}
                  {preset.available === false ? " (unavailable)" : ""}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_MODEL_VALUE}>Custom model</SelectItem>
            </SelectContent>
          </Select>
          {selectedPreset && (
            <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
              {selectedPreset.note} Context {selectedPreset.context}. In{" "}
              {selectedPreset.pricingPrompt}, out{" "}
              {selectedPreset.pricingCompletion}.
            </p>
          )}
          {modelChoice === CUSTOM_MODEL_VALUE && (
            <Input
              value={customModel}
              onChange={(event) => setCustomModel(event.target.value)}
              placeholder="provider/model-id"
              className="h-8 text-xs"
            />
          )}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={requestSketch}
              onCheckedChange={(checked) => setRequestSketch(Boolean(checked))}
            />
            Generate applyable sketch JSON
          </label>
          <p className="pl-6 text-[0.68rem] leading-relaxed text-muted-foreground">
            Leave on for paintable grid output. Turn off if you want a free-form
            critique or written planning instead of an applyable sketch.
          </p>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={includeGridSummary}
              onCheckedChange={(checked) =>
                setIncludeGridSummary(Boolean(checked))
              }
            />
            Include current grid summary
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={includeGridImage}
              onCheckedChange={(checked) =>
                setIncludeGridImage(Boolean(checked))
              }
            />
            Include visual grid snapshot
          </label>
          {includeGridImage && (
            <p className="pl-6 text-[0.68rem] leading-relaxed text-muted-foreground">
              Sends a clean PNG of the current grid to OpenRouter. Use an
              image-capable model for visual critique.
            </p>
          )}
        </div>

        <div
          className={`rounded-sm border px-2 py-1 text-xs ${
            configured
              ? "border-green-200 bg-green-50 text-green-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          {configured
            ? "OpenRouter key detected on the local server."
            : "OPENROUTER_API_KEY is not visible to the local server."}
        </div>
      </div>

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <div className="space-y-2">
          {STARTER_PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto w-full justify-start whitespace-normal text-left text-xs"
              onClick={() => setInput(prompt)}
            >
              <WandSparkles className="mr-2 h-3.5 w-3.5 shrink-0" />
              {prompt}
            </Button>
          ))}
        </div>

        <div className="max-h-64 space-y-2 overflow-auto rounded-sm border border-border bg-background p-2">
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
                {message.content}
              </div>
            ))
          )}
        </div>

        {pendingSketch && (
          <div className="space-y-2 rounded-sm border border-primary/30 bg-primary/5 p-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">{pendingSketch.name}</p>
                <p className="font-mono text-[0.68rem] text-muted-foreground">
                  {pendingSketch.width}x{pendingSketch.height}
                </p>
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={applySketch}>
                <Paintbrush className="mr-2 h-3.5 w-3.5" />
                Apply
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-950">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask for a 32x32 horror icon, a mascot mask, or a repaint cleanup plan..."
            className="min-h-24 resize-none text-xs"
          />
          <Button
            type="button"
            className="w-full text-xs"
            disabled={!input.trim() || !selectedModel || isLoading}
            onClick={sendMessage}
          >
            <Send className="mr-2 h-3.5 w-3.5" />
            {isLoading ? "Asking model..." : "Send to AI"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function summarizeDocument(doc: GridDocument | null): AiDocumentSummary | null {
  if (!doc) return null;
  return {
    name: doc.meta.name,
    width: doc.width,
    height: doc.height,
    usedColors: doc.usedColors,
  };
}

function createEmptySession(): SavedAiSession {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    customModel: "",
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    includeGridImage: false,
    includeGridSummary: true,
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

function readAiSessions(): SavedAiSession[] {
  try {
    const raw = window.localStorage.getItem(AI_SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedAiSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((session) => session.id && Array.isArray(session.messages))
      .map((session) => ({
        ...session,
        includeGridImage: Boolean(session.includeGridImage),
      }))
      .slice(0, 20);
  } catch {
    return [];
  }
}

function writeAiSessions(sessions: SavedAiSession[]): void {
  window.localStorage.setItem(AI_SESSION_STORAGE_KEY, JSON.stringify(sessions));
}
