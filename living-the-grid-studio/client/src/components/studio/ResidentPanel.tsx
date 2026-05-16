/**
 * ResidentPanel.tsx — Layers of Abstraction resident planner and study loop
 */

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Clipboard,
  Download,
  FileJson,
  Lock,
  Map,
  ShieldCheck,
  Sparkles,
  Unlock,
  Users,
  XCircle,
} from "lucide-react";
import type { MiiResidentSpec, QuestHook } from "@shared/residents";
import {
  buildResidentDesignerPrompt,
  validateMiiResidentSpec,
} from "@shared/residents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GridDocument } from "@/lib/engine/grid";
import {
  CROSS_LAYER_INTERACTIONS,
  DISTRICTS,
  ISLAND_FACILITY_PLANS,
  ISLAND_GROWTH_STAGES,
  LAYERS_OF_ABSTRACTION_ISLAND,
  RESIDENT_CREATION_STEPS,
  STARTER_RESIDENTS,
  evaluateQuestAnswer,
  getDistrictById,
  validateStarterResidents,
} from "@/lib/engine/residents";
import {
  downloadGridAsPng,
  downloadPaletteSheetAsPng,
} from "@/lib/engine/canvas-renderer";

interface ResidentPanelProps {
  currentDoc: GridDocument | null;
  onAttachResidentSpec: (spec: MiiResidentSpec) => void;
}

interface ResidentProgress {
  attempts: Record<
    string,
    {
      completedAt?: string;
      correctCount: number;
      incorrectCount: number;
      lastAnswer?: string;
      lastAttemptAt: string;
    }
  >;
  completedQuestIds: string[];
}

const CUSTOM_RESIDENTS_KEY = "ltg.residents.custom.v1";
const PROGRESS_KEY = "ltg.residents.progress.v1";

export default function ResidentPanel({
  currentDoc,
  onAttachResidentSpec,
}: ResidentPanelProps) {
  const [customResidents, setCustomResidents] = useState<MiiResidentSpec[]>([]);
  const [progress, setProgress] = useState<ResidentProgress>(EMPTY_PROGRESS);
  const [selectedResidentId, setSelectedResidentId] = useState(
    STARTER_RESIDENTS[0]?.id ?? "",
  );
  const [selectedGrowthStageId, setSelectedGrowthStageId] = useState(
    ISLAND_GROWTH_STAGES[0]?.id ?? "",
  );
  const [selectedDistrictId, setSelectedDistrictId] = useState(
    DISTRICTS[0]?.id ?? "",
  );
  const [activeQuest, setActiveQuest] = useState<QuestHook | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<
    | { kind: "correct"; message: string }
    | { kind: "incorrect"; message: string; retry: string }
    | null
  >(null);
  const [aiJson, setAiJson] = useState("");
  const [pendingAiSpec, setPendingAiSpec] = useState<MiiResidentSpec | null>(
    null,
  );
  const [aiValidationErrors, setAiValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    setCustomResidents(readCustomResidents());
    setProgress(readProgress());
  }, []);

  const allResidents = useMemo(
    () => [...STARTER_RESIDENTS, ...customResidents],
    [customResidents],
  );
  const selectedResident =
    allResidents.find((resident) => resident.id === selectedResidentId) ??
    allResidents[0];
  const visibleResidents = allResidents.filter(
    (resident) => resident.districtId === selectedDistrictId,
  );
  const selectedQuest = activeQuest ?? selectedResident?.questHook ?? null;
  const starterValidationErrors = useMemo(validateStarterResidents, []);
  const completedCount = progress.completedQuestIds.length;
  const totalQuestCount =
    allResidents.length + CROSS_LAYER_INTERACTIONS.length;
  const selectedGrowthStage =
    ISLAND_GROWTH_STAGES.find((stage) => stage.id === selectedGrowthStageId) ??
    ISLAND_GROWTH_STAGES[0];

  useEffect(() => {
    if (!selectedResident) return;
    setSelectedDistrictId(selectedResident.districtId);
    setActiveQuest(null);
    setAnswer("");
    setFeedback(null);
  }, [selectedResident?.id]);

  const submitAnswer = () => {
    if (!selectedQuest) return;
    const correct = evaluateQuestAnswer(answer, selectedQuest);
    const now = new Date().toISOString();
    const nextProgress: ResidentProgress = {
      attempts: {
        ...progress.attempts,
        [selectedQuest.id]: {
          completedAt: correct
            ? (progress.attempts[selectedQuest.id]?.completedAt ?? now)
            : progress.attempts[selectedQuest.id]?.completedAt,
          correctCount:
            (progress.attempts[selectedQuest.id]?.correctCount ?? 0) +
            (correct ? 1 : 0),
          incorrectCount:
            (progress.attempts[selectedQuest.id]?.incorrectCount ?? 0) +
            (correct ? 0 : 1),
          lastAnswer: answer,
          lastAttemptAt: now,
        },
      },
      completedQuestIds: correct
        ? Array.from(new Set([...progress.completedQuestIds, selectedQuest.id]))
        : progress.completedQuestIds,
    };
    setProgress(nextProgress);
    writeProgress(nextProgress);
    if (correct) {
      setFeedback({
        kind: "correct",
        message: "Correct. The next dependent bridge is now available.",
      });
    } else {
      setFeedback({
        kind: "incorrect",
        message: selectedQuest.correctionHint,
        retry: selectedQuest.retryVariant,
      });
    }
  };

  const validateAiResident = () => {
    setPendingAiSpec(null);
    try {
      const parsed = JSON.parse(aiJson) as unknown;
      const result = validateMiiResidentSpec(parsed);
      if (!result.valid || !result.spec) {
        setAiValidationErrors(result.errors);
        return;
      }
      setAiValidationErrors([]);
      setPendingAiSpec(result.spec);
    } catch (error) {
      setAiValidationErrors([
        error instanceof Error ? error.message : "AI JSON could not be parsed.",
      ]);
    }
  };

  const addPendingAiResident = () => {
    if (!pendingAiSpec) return;
    const next = [
      pendingAiSpec,
      ...customResidents.filter((resident) => resident.id !== pendingAiSpec.id),
    ].slice(0, 40);
    setCustomResidents(next);
    writeCustomResidents(next);
    setSelectedResidentId(pendingAiSpec.id);
    setSelectedDistrictId(pendingAiSpec.districtId);
    setPendingAiSpec(null);
    setAiJson("");
  };

  const exportResidentPack = () => {
    if (!selectedResident) return;
    const safeName = toSafeName(selectedResident.name);
    downloadText(
      JSON.stringify(selectedResident, null, 2),
      `${safeName}-resident.json`,
      "application/json",
    );
    downloadText(
      buildResidentHtml(selectedResident, currentDoc),
      `${safeName}-feature-sheet.html`,
      "text/html",
    );
    if (currentDoc) {
      downloadGridAsPng(
        currentDoc,
        { cellSize: 16, showGrid: true, showLabels: true },
        `${safeName}-face-paint-guide.png`,
      );
      downloadPaletteSheetAsPng(currentDoc, `${safeName}-palette-sheet.png`);
    }
  };

  const copyDesignerPrompt = async () => {
    await navigator.clipboard.writeText(buildResidentDesignerPrompt());
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="section-header mb-1">Island</p>
        <p className="text-xs text-muted-foreground">
          Resident feature sheets, locked bridge quests, and local study
          progress for {LAYERS_OF_ABSTRACTION_ISLAND.name}.
        </p>
      </div>

      <div className="space-y-2 rounded-sm border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-semibold">Progress</Label>
          <Badge variant="outline" className="font-mono">
            {completedCount}/{totalQuestCount}
          </Badge>
        </div>
        <div className="h-2 overflow-hidden rounded-sm bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{
              width: `${Math.min(100, (completedCount / totalQuestCount) * 100)}%`,
            }}
          />
        </div>
        <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
          Lower-layer quests unlock cross-layer interactions. Wrong answers show
          a correction and a retry variant instead of silently passing.
        </p>
        {starterValidationErrors.length > 0 && (
          <div className="rounded-sm border border-destructive/30 bg-destructive/10 px-2 py-1 text-[0.68rem] text-destructive">
            {starterValidationErrors[0]}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-semibold">Island Growth</Label>
        </div>
        <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
          Start with a few anchor Miis, then expand only when the previous layer
          has produced friendships, gifts, and completed bridge quests.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {ISLAND_GROWTH_STAGES.map((stage) => {
            const unlocked = stage.requiredQuestIds.every((questId) =>
              isCompleted(progress, questId),
            );
            return (
              <button
                key={stage.id}
                type="button"
                className={`rounded-sm border px-2 py-1.5 text-left transition-colors ${
                  selectedGrowthStage?.id === stage.id
                    ? "border-primary bg-accent"
                    : "border-border bg-background hover:bg-muted/40"
                }`}
                onClick={() => setSelectedGrowthStageId(stage.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{stage.name}</span>
                  {unlocked ? (
                    <Unlock className="h-3.5 w-3.5 text-green-700" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-1 text-[0.68rem] leading-snug text-muted-foreground">
                  {stage.learningGoal}
                </p>
              </button>
            );
          })}
        </div>
        {selectedGrowthStage && (
          <div className="rounded-sm border border-border bg-background p-2">
            <p className="text-xs font-semibold">{selectedGrowthStage.name}</p>
            <p className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">
              {selectedGrowthStage.gamePattern}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedGrowthStage.residentIds.map((residentId) => {
                const resident = allResidents.find(
                  (entry) => entry.id === residentId,
                );
                return (
                  <Badge key={residentId} variant="outline">
                    {resident?.name ?? residentId}
                  </Badge>
                );
              })}
            </div>
            <p className="mt-2 text-[0.68rem] leading-relaxed">
              Unlocks: {selectedGrowthStage.unlocks.join(", ")}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-semibold">
            Game Systems as Study Tools
          </Label>
        </div>
        <div className="space-y-2">
          {ISLAND_FACILITY_PLANS.map((facility) => {
            const stage = ISLAND_GROWTH_STAGES.find(
              (entry) => entry.id === facility.unlockStageId,
            );
            return (
              <div
                key={facility.id}
                className="rounded-sm border border-border bg-background p-2"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{facility.name}</p>
                  <span className="font-mono text-[0.62rem] text-muted-foreground">
                    {stage?.name ?? facility.unlockStageId}
                  </span>
                </div>
                <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
                  {facility.learningRole}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Map className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-semibold">Districts</Label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {DISTRICTS.map((district) => (
            <button
              key={district.id}
              type="button"
              className={`rounded-sm border px-2 py-1.5 text-left text-xs transition-colors ${
                selectedDistrictId === district.id
                  ? "border-primary bg-accent text-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => {
                setSelectedDistrictId(district.id);
                const firstResident = allResidents.find(
                  (resident) => resident.districtId === district.id,
                );
                if (firstResident) setSelectedResidentId(firstResident.id);
              }}
            >
              <span className="block truncate font-medium">{district.name}</span>
              <span className="font-mono text-[0.62rem]">
                L{district.order}
              </span>
            </button>
          ))}
        </div>
        {getDistrictById(selectedDistrictId) && (
          <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
            {getDistrictById(selectedDistrictId)?.waypoint}
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-semibold">Residents</Label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {visibleResidents.map((resident) => (
            <button
              key={resident.id}
              type="button"
              className={`rounded-sm border bg-[#FFF8EA] p-2 text-left transition-colors hover:border-primary/40 ${
                selectedResident?.id === resident.id
                  ? "border-primary"
                  : "border-[#E9B66A]/60"
              }`}
              onClick={() => setSelectedResidentId(resident.id)}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold">
                  {resident.name}
                </span>
                {isCompleted(progress, resident.questHook.id) ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-700" />
                ) : (
                  <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
              </div>
              <p className="line-clamp-2 text-[0.68rem] leading-snug text-muted-foreground">
                {resident.layerRole}
              </p>
            </button>
          ))}
        </div>
      </div>

      {selectedResident && (
        <div className="space-y-3 rounded-sm border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{selectedResident.name}</p>
              <p className="text-[0.68rem] text-muted-foreground">
                {selectedResident.district} · {selectedResident.makeup}
              </p>
            </div>
            <Badge variant="secondary">{selectedResident.platform}</Badge>
          </div>

          <div className="flex flex-wrap gap-1">
            {selectedResident.tags.slice(0, 6).map((tag) => (
              <Badge key={tag} variant="outline" className="bg-[#FFE2AE]/60">
                {tag}
              </Badge>
            ))}
          </div>

          <div className="space-y-2 text-xs">
            <FeatureRow label="Below" value={selectedResident.bridgeBelow} />
            <FeatureRow label="Above" value={selectedResident.bridgeAbove} />
            <FeatureRow
              label="Catchphrase"
              value={`"${selectedResident.catchphrase}"`}
            />
            <FeatureRow label="Prompt" value={selectedResident.recallPrompt} />
            <FeatureRow label="Pixel" value={selectedResident.pixelArtNotes} />
            {selectedResident.quirks?.length ? (
              <FeatureRow
                label="Quirks"
                value={selectedResident.quirks.join(", ")}
              />
            ) : null}
            {selectedResident.giftPlan?.length ? (
              <FeatureRow
                label="Gifts"
                value={selectedResident.giftPlan.join(", ")}
              />
            ) : null}
            {selectedResident.homePlan ? (
              <FeatureRow label="Home" value={selectedResident.homePlan} />
            ) : null}
            {selectedResident.relationshipPlan ? (
              <FeatureRow
                label="Social"
                value={selectedResident.relationshipPlan}
              />
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                setActiveQuest(selectedResident.questHook);
                setAnswer("");
                setFeedback(null);
              }}
            >
              <BookOpen className="mr-2 h-3.5 w-3.5" />
              Study
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={!currentDoc}
              onClick={() => onAttachResidentSpec(selectedResident)}
            >
              <ShieldCheck className="mr-2 h-3.5 w-3.5" />
              Attach
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="col-span-2 text-xs"
              onClick={exportResidentPack}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              Export Resident Pack
            </Button>
          </div>
          {!currentDoc && (
            <p className="text-[0.68rem] text-muted-foreground">
              Open or create a grid to include guide PNG and palette sheet in
              the resident pack.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Unlock className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-semibold">Bridge Interactions</Label>
        </div>
        <div className="space-y-2">
          {CROSS_LAYER_INTERACTIONS.map((interaction) => {
            const unlocked = interaction.requiredQuestIds.every((questId) =>
              isCompleted(progress, questId),
            );
            return (
              <div
                key={interaction.id}
                className="rounded-sm border border-border bg-background p-2"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{interaction.title}</p>
                  {unlocked ? (
                    <Unlock className="h-3.5 w-3.5 text-green-700" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <p className="mb-2 text-[0.68rem] leading-relaxed text-muted-foreground">
                  {unlocked
                    ? interaction.quest.bridgeQuestion
                    : `Locked until: ${interaction.requiredQuestIds.join(", ")}`}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[0.7rem]"
                  disabled={!unlocked}
                  onClick={() => {
                    setActiveQuest(interaction.quest);
                    setAnswer("");
                    setFeedback(null);
                  }}
                >
                  Study Bridge
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {selectedQuest && (
        <div className="space-y-3 rounded-sm border border-border bg-card p-3">
          <div>
            <p className="text-xs font-semibold">{selectedQuest.title}</p>
            <p className="mt-1 text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
              {selectedQuest.artifactType} · {selectedQuest.trigger}
            </p>
          </div>
          <div className="rounded-sm border border-border bg-background p-2">
            <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Input
            </p>
            <p className="text-xs leading-relaxed">{selectedQuest.input}</p>
          </div>
          <p className="text-xs leading-relaxed">
            {selectedQuest.bridgeQuestion}
          </p>
          <Textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Predict the output or explain the bridge..."
            className="min-h-20 text-xs"
          />
          <Button
            type="button"
            size="sm"
            className="w-full text-xs"
            disabled={!answer.trim()}
            onClick={submitAnswer}
          >
            Check Prediction
          </Button>
          {feedback && (
            <div
              className={`rounded-sm border px-2 py-1.5 text-xs leading-relaxed ${
                feedback.kind === "correct"
                  ? "border-green-200 bg-green-50 text-green-950"
                  : "border-amber-200 bg-amber-50 text-amber-950"
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                {feedback.kind === "correct" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                {feedback.kind === "correct" ? "Unlocked" : "Correction"}
              </div>
              <p>{feedback.message}</p>
              {feedback.kind === "incorrect" && (
                <p className="mt-1 font-medium">Retry: {feedback.retry}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-semibold">Resident Creation Loop</Label>
        </div>
        <div className="space-y-2">
          {RESIDENT_CREATION_STEPS.map((step, index) => (
            <div
              key={step.id}
              className="grid grid-cols-[1.6rem_1fr] gap-2 rounded-sm border border-border bg-background p-2"
            >
              <span className="font-mono text-[0.68rem] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-xs font-semibold">{step.label}</p>
                <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted-foreground">
                  {step.purpose}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-sm border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs font-semibold">AI Resident Designer</Label>
        </div>
        <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
          Ask any model for strict MiiResidentSpec JSON, paste it here, and
          validate it before saving or exporting.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={copyDesignerPrompt}
          >
            <Clipboard className="mr-2 h-3.5 w-3.5" />
            Copy Prompt
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() =>
              setAiJson(JSON.stringify(selectedResident ?? STARTER_RESIDENTS[0], null, 2))
            }
          >
            <FileJson className="mr-2 h-3.5 w-3.5" />
            Example JSON
          </Button>
        </div>
        <Textarea
          value={aiJson}
          onChange={(event) => setAiJson(event.target.value)}
          placeholder="{ ...MiiResidentSpec JSON... }"
          className="min-h-28 font-mono text-[0.7rem]"
        />
        <Button
          type="button"
          size="sm"
          className="w-full text-xs"
          disabled={!aiJson.trim()}
          onClick={validateAiResident}
        >
          Validate AI Output
        </Button>
        {aiValidationErrors.length > 0 && (
          <div className="rounded-sm border border-destructive/30 bg-destructive/10 px-2 py-1 text-[0.68rem] leading-relaxed text-destructive">
            {aiValidationErrors.slice(0, 3).join(" ")}
          </div>
        )}
        {pendingAiSpec && (
          <div className="rounded-sm border border-green-200 bg-green-50 p-2 text-xs text-green-950">
            <p className="font-semibold">{pendingAiSpec.name} is valid.</p>
            <Button
              type="button"
              size="sm"
              className="mt-2 h-7 text-[0.7rem]"
              onClick={addPendingAiResident}
            >
              Add to Local Residents
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_PROGRESS: ResidentProgress = {
  attempts: {},
  completedQuestIds: [],
};

function FeatureRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span className="leading-relaxed">{value}</span>
    </div>
  );
}

function isCompleted(progress: ResidentProgress, questId: string): boolean {
  return progress.completedQuestIds.includes(questId);
}

function readProgress(): ResidentProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw) as ResidentProgress;
    if (!Array.isArray(parsed.completedQuestIds) || !parsed.attempts) {
      return EMPTY_PROGRESS;
    }
    return parsed;
  } catch {
    return EMPTY_PROGRESS;
  }
}

function writeProgress(progress: ResidentProgress): void {
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function readCustomResidents(): MiiResidentSpec[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_RESIDENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => validateMiiResidentSpec(entry).spec)
      .filter((entry): entry is MiiResidentSpec => Boolean(entry));
  } catch {
    return [];
  }
}

function writeCustomResidents(residents: MiiResidentSpec[]): void {
  window.localStorage.setItem(CUSTOM_RESIDENTS_KEY, JSON.stringify(residents));
}

function downloadText(text: string, filename: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildResidentHtml(
  resident: MiiResidentSpec,
  currentDoc: GridDocument | null,
): string {
  const featureRows = [
    ["District", resident.district],
    ["Layer role", resident.layerRole],
    ["Makeup", resident.makeup],
    ["Bridge below", resident.bridgeBelow],
    ["Bridge above", resident.bridgeAbove],
    ["Recall prompt", resident.recallPrompt],
    ["Pixel art notes", resident.pixelArtNotes],
    ["Quirks", resident.quirks?.join(", ") ?? ""],
    ["Gift plan", resident.giftPlan?.join(", ") ?? ""],
    ["Home plan", resident.homePlan ?? ""],
    ["Relationship plan", resident.relationshipPlan ?? ""],
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(resident.name)} Feature Sheet</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #FAFAF5; color: #342B23; padding: 24px; }
    main { max-width: 860px; margin: 0 auto; }
    h1 { font-size: 28px; margin: 0 0 4px; }
    .note { color: #756B60; font-size: 12px; line-height: 1.5; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0; }
    .tag { border: 1px solid #E9B66A; background: #FFE2AE; border-radius: 6px; padding: 3px 8px; font-size: 12px; }
    table { border-collapse: collapse; width: 100%; margin: 18px 0; background: #FFFDF7; }
    th, td { border: 1px solid #E1DDD4; padding: 8px; text-align: left; vertical-align: top; font-size: 13px; }
    th { width: 150px; background: #F5F1E8; }
    pre { background: #F5F1E8; border: 1px solid #E1DDD4; padding: 12px; overflow: auto; font-size: 12px; }
  </style>
</head>
<body>
<main>
  <p class="note">${escapeHtml(LAYERS_OF_ABSTRACTION_ISLAND.sourceNote)}</p>
  <h1>${escapeHtml(resident.name)}</h1>
  <p class="note">${escapeHtml(resident.catchphrase)} · ${escapeHtml(resident.platform)} · ${escapeHtml(resident.gender)}</p>
  <div class="tags">${resident.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
  <table>
    ${featureRows.filter(([, value]) => value).map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("\n    ")}
  </table>
  <h2>Quest</h2>
  <table>
    <tr><th>Input</th><td>${escapeHtml(resident.questHook.input)}</td></tr>
    <tr><th>Question</th><td>${escapeHtml(resident.questHook.bridgeQuestion)}</td></tr>
    <tr><th>Expected output</th><td>${escapeHtml(resident.questHook.expectedOutput)}</td></tr>
    <tr><th>Correction</th><td>${escapeHtml(resident.questHook.correctionHint)}</td></tr>
    <tr><th>Retry</th><td>${escapeHtml(resident.questHook.retryVariant)}</td></tr>
  </table>
  <h2>Source Credits</h2>
  <ul>${resident.sourceCredits.map((credit) => `<li>${escapeHtml(credit)}</li>`).join("")}</ul>
  ${
    currentDoc
      ? `<p class="note">Attached guide: ${escapeHtml(currentDoc.meta.name)} (${currentDoc.width}x${currentDoc.height}, ${currentDoc.usedColors.length} colors)</p>`
      : `<p class="note">No grid was attached when this feature sheet was exported.</p>`
  }
  <h2>Raw Resident JSON</h2>
  <pre>${escapeHtml(JSON.stringify(resident, null, 2))}</pre>
</main>
</body>
</html>`;
}

function toSafeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
