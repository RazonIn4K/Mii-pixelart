import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  buildCopyGuideRuns,
  countCompletedCopyGuideRuns,
  getNextActiveCopyGuideIndex,
  normalizeCompletedCopyGuideIds,
  type CopyGuideRun,
} from "@/lib/engine/copy-guide";
import type { GridDocument } from "@/lib/engine/grid";
import { getPaletteColor } from "@/lib/engine/palette";

const COPY_GUIDE_STORAGE_PREFIX = "tomodachi.copy-guide.v1";

interface CopyGuideProgress {
  activeIndex: number;
  completedIds: string[];
  storageKey: string;
}

interface CopyGuidePanelProps {
  doc: GridDocument;
  hasReference: boolean;
  onActiveRunChange: (run: CopyGuideRun | null) => void;
  onAddReference: () => void;
}

export default function CopyGuidePanel({
  doc,
  hasReference,
  onActiveRunChange,
  onAddReference,
}: CopyGuidePanelProps) {
  const guide = useMemo(() => {
    try {
      return { error: null, runs: buildCopyGuideRuns(doc) };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "This project cannot be opened in Copy Guide.",
        runs: [] as CopyGuideRun[],
      };
    }
  }, [doc]);
  const storageKey = useMemo(
    () => copyGuideStorageKey(doc.width, doc.height, guide.runs),
    [doc.height, doc.width, guide.runs],
  );
  const [progress, setProgress] = useState<CopyGuideProgress>(() =>
    readCopyGuideProgress(storageKey, guide.runs),
  );

  useEffect(() => {
    setProgress((current) =>
      current.storageKey === storageKey
        ? current
        : readCopyGuideProgress(storageKey, guide.runs),
    );
  }, [guide.runs, storageKey]);

  const completedIds =
    progress.storageKey === storageKey
      ? normalizeCompletedCopyGuideIds(guide.runs, progress.completedIds)
      : [];
  const activeIndex =
    progress.storageKey === storageKey &&
    progress.activeIndex >= 0 &&
    progress.activeIndex < guide.runs.length
      ? progress.activeIndex
      : -1;
  const activeRun = activeIndex >= 0 ? guide.runs[activeIndex] : null;
  const completedCount = countCompletedCopyGuideRuns(guide.runs, completedIds);
  const progressPercent =
    guide.runs.length > 0
      ? Math.round((completedCount / guide.runs.length) * 100)
      : 0;

  useEffect(() => {
    onActiveRunChange(activeRun);
    return () => onActiveRunChange(null);
  }, [activeRun, onActiveRunChange]);

  const updateProgress = useCallback(
    (nextCompletedIds: string[], nextActiveIndex: number) => {
      const normalizedIds = normalizeCompletedCopyGuideIds(
        guide.runs,
        nextCompletedIds,
      );
      const next: CopyGuideProgress = {
        activeIndex:
          nextActiveIndex >= 0 && nextActiveIndex < guide.runs.length
            ? nextActiveIndex
            : -1,
        completedIds: normalizedIds,
        storageKey,
      };
      setProgress(next);
      writeCopyGuideProgress(storageKey, normalizedIds);
    },
    [guide.runs, storageKey],
  );

  const moveBy = (offset: number) => {
    if (guide.runs.length === 0) return;
    const baseIndex = activeIndex >= 0 ? activeIndex : 0;
    const nextIndex =
      (baseIndex + offset + guide.runs.length) % guide.runs.length;
    updateProgress(completedIds, nextIndex);
  };

  const toggleActiveCompletion = () => {
    if (!activeRun) return;
    const completed = new Set(completedIds);
    if (completed.has(activeRun.id)) {
      completed.delete(activeRun.id);
      updateProgress(Array.from(completed), activeIndex);
      return;
    }

    completed.add(activeRun.id);
    const nextCompletedIds = Array.from(completed);
    const nextIndex = getNextActiveCopyGuideIndex(
      guide.runs,
      nextCompletedIds,
      activeIndex,
    );
    updateProgress(nextCompletedIds, nextIndex);
  };

  if (guide.error) {
    return (
      <section className="p-4" aria-labelledby="copy-guide-title">
        <h2 id="copy-guide-title" className="text-base font-black">
          Copy Guide
        </h2>
        <div
          className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-5 text-foreground"
          role="alert"
        >
          {guide.error}
        </div>
      </section>
    );
  }

  if (guide.runs.length === 0) {
    return (
      <section className="p-4" aria-labelledby="copy-guide-title">
        <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-primary">
          One canvas · zero guesswork
        </p>
        <h2 id="copy-guide-title" className="mt-1 text-lg font-black">
          Copy Guide
        </h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Paint at least one cell first. The guide will turn the finished art
          into exact row and column runs without changing your project.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 min-h-11 w-full"
          onClick={onAddReference}
        >
          <ImagePlus /> Add a reference image
        </Button>
      </section>
    );
  }

  const activeColor = activeRun
    ? getPaletteColor(activeRun.colorId)
    : undefined;
  const activeIsComplete = activeRun
    ? completedIds.includes(activeRun.id)
    : false;

  return (
    <section
      className="space-y-4 p-4"
      aria-labelledby="copy-guide-title"
      data-testid="copy-guide-panel"
    >
      <div>
        <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-primary">
          One canvas · zero guesswork
        </p>
        <h2 id="copy-guide-title" className="mt-1 text-lg font-black">
          Copy Guide
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Follow each highlighted run in your game, then mark it complete. Your
          artwork stays read-only here.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/35 p-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-bold">Copy progress</span>
          <span className="font-mono text-muted-foreground">
            {completedCount}/{guide.runs.length} runs
          </span>
        </div>
        <Progress
          value={progressPercent}
          className="mt-2 h-2.5"
          aria-label={`${completedCount} of ${guide.runs.length} Copy Guide runs complete`}
        />
      </div>

      {activeRun ? (
        <div
          className="rounded-2xl border-2 border-orange-600/60 bg-orange-50 p-4 text-orange-950 shadow-sm"
          data-testid="copy-guide-current-step"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-orange-800">
                Run {activeIndex + 1} of {guide.runs.length}
              </p>
              <p
                className="mt-1 text-base font-black leading-6"
                aria-live="polite"
              >
                {activeRun.instruction}
              </p>
            </div>
            <span
              className="size-11 shrink-0 rounded-xl border-2 border-white shadow-[0_0_0_1px_rgba(124,45,18,0.25)]"
              style={{ backgroundColor: activeColor?.hex }}
              aria-label={`${activeColor?.name ?? activeRun.colorId} color swatch`}
              role="img"
            />
          </div>
          <p className="mt-3 text-xs font-semibold text-orange-900/80">
            {activeColor?.name ?? "Studio color"} · Paint {activeRun.cellCount}{" "}
            {activeRun.cellCount === 1 ? "cell" : "cells"} from left to right.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"
          role="status"
        >
          <p className="text-base font-black">Every run is complete</p>
          <p className="mt-1 text-xs leading-5">
            Review the finished result in your game before exporting or sharing.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11 w-full border-emerald-400 bg-white"
            onClick={() => updateProgress(completedIds, 0)}
          >
            Review from the first run
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={!activeRun}
          onClick={() => moveBy(-1)}
        >
          <ChevronLeft /> Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={!activeRun}
          onClick={() => moveBy(1)}
        >
          Next <ChevronRight />
        </Button>
        <Button
          type="button"
          className="col-span-2 min-h-12"
          disabled={!activeRun}
          onClick={toggleActiveCompletion}
        >
          <Check />
          {activeIsComplete ? "Mark this run incomplete" : "Complete & next"}
        </Button>
      </div>

      <div className="rounded-xl border border-border p-3">
        <p className="text-xs font-bold">
          {hasReference
            ? "Reference is beside the canvas"
            : "Need the original nearby?"}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Reference images stay in this browser tab and are never uploaded by
          Copy Guide.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 min-h-11 w-full"
          onClick={onAddReference}
        >
          <ImagePlus />{" "}
          {hasReference ? "Replace reference" : "Add reference image"}
        </Button>
      </div>

      <Button
        type="button"
        variant="ghost"
        className="min-h-11 w-full text-muted-foreground"
        disabled={completedCount === 0}
        onClick={() => updateProgress([], 0)}
      >
        <RotateCcw /> Reset copy progress
      </Button>
    </section>
  );
}

function readCopyGuideProgress(
  storageKey: string,
  runs: readonly CopyGuideRun[],
): CopyGuideProgress {
  let completedIds: string[] = [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      const candidates =
        parsed && typeof parsed === "object" && "completedIds" in parsed
          ? (parsed as { completedIds?: unknown }).completedIds
          : parsed;
      completedIds = normalizeCompletedCopyGuideIds(runs, candidates);
    }
  } catch {
    completedIds = [];
  }

  return {
    activeIndex: getNextActiveCopyGuideIndex(runs, completedIds),
    completedIds,
    storageKey,
  };
}

function writeCopyGuideProgress(storageKey: string, completedIds: string[]) {
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ completedIds, version: 1 }),
    );
  } catch {
    // Copy Guide remains usable in memory when storage is blocked or full.
  }
}

function copyGuideStorageKey(
  width: number,
  height: number,
  runs: readonly CopyGuideRun[],
): string {
  let hash = 0x811c9dc5;
  const update = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  update(`${width}x${height}|`);
  for (const run of runs) update(`${run.id}|`);
  return `${COPY_GUIDE_STORAGE_PREFIX}.${width}x${height}.${(hash >>> 0).toString(36)}`;
}
