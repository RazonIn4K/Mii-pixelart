import { useId } from "react";
import {
  Eye,
  EyeOff,
  FlipHorizontal2,
  Scan,
  ShieldCheck,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ReferenceComparisonMode = "side" | "under" | "over" | "split";

const COMPARISON_MODES: readonly {
  label: string;
  mode: ReferenceComparisonMode;
  help: string;
}[] = [
  {
    mode: "side",
    label: "Side",
    help: "Keep the original beside the drawing surface.",
  },
  {
    mode: "under",
    label: "Under",
    help: "Trace the framed source beneath your paint.",
  },
  {
    mode: "over",
    label: "Over",
    help: "Compare the framed source above your paint.",
  },
  {
    mode: "split",
    label: "Split",
    help: "Compare source and paint across a center split.",
  },
];

/**
 * A read-only, browser-local visual reference. This preview controls a dim
 * tracing layer inside the authoritative canvas; it never receives drawing
 * input or enters the GridDocument/cloud-save payload.
 */
export function ReferenceDock({
  className,
  comparisonMode,
  flipped,
  onClear,
  onComparisonModeChange,
  onFlippedChange,
  onOpacityChange,
  onTraceBlank,
  onUnderlayVisibleChange,
  opacity,
  sourceUrl,
  supportedComparisonModes,
  traceStatus,
  underlayEnabled,
  underlayVisible,
}: {
  className?: string;
  comparisonMode?: ReferenceComparisonMode;
  flipped: boolean;
  onClear: () => void;
  onComparisonModeChange?: (mode: ReferenceComparisonMode) => void;
  onFlippedChange: (flipped: boolean) => void;
  onOpacityChange: (opacity: number) => void;
  onTraceBlank?: () => void;
  onUnderlayVisibleChange: (visible: boolean) => void;
  opacity: number;
  sourceUrl: string;
  supportedComparisonModes?: readonly ReferenceComparisonMode[];
  traceStatus: "error" | "preparing" | "ready" | null;
  underlayEnabled: boolean;
  underlayVisible: boolean;
}) {
  const opacityId = useId();
  const activeComparisonMode =
    comparisonMode ?? (underlayEnabled && underlayVisible ? "under" : "side");
  const supportedModes = new Set<ReferenceComparisonMode>(
    supportedComparisonModes ??
      (onComparisonModeChange
        ? (["side", "under", "over", "split"] as const)
        : (["side", "under"] as const)),
  );

  const isModeAvailable = (mode: ReferenceComparisonMode) => {
    if (mode === "side") return true;
    if (!underlayEnabled) return false;
    if (mode === "under") return true;
    return supportedModes.has(mode) && Boolean(onComparisonModeChange);
  };

  const selectComparisonMode = (mode: ReferenceComparisonMode) => {
    if (!isModeAvailable(mode)) return;
    onComparisonModeChange?.(mode);
    onUnderlayVisibleChange(mode !== "side");
  };

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col rounded-[1.25rem] border-2 border-[#26485a]/20 bg-[#fffaf0] p-2.5 shadow-[0_4px_0_rgba(38,72,90,0.12)] lg:overflow-y-auto",
        className,
      )}
      aria-label="Local reference image"
      data-reference-comparison={activeComparisonMode}
      data-testid="studio-reference-dock"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.13em] text-[#b84426]">
            Source board
          </p>
          <p className="mt-0.5 text-[0.65rem] leading-4 text-muted-foreground">
            Original source · visible immediately and kept browser-local.
          </p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="shrink-0"
          aria-label="Remove local reference"
          title="Remove local reference"
          onClick={onClear}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="mt-2 flex h-36 min-h-0 flex-none items-center justify-center overflow-hidden rounded-xl border-2 border-[#ef6b3b]/35 bg-[linear-gradient(45deg,#f4ead8_25%,transparent_25%),linear-gradient(-45deg,#f4ead8_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f4ead8_75%),linear-gradient(-45deg,transparent_75%,#f4ead8_75%)] bg-[#cfc2ad] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] shadow-inner sm:h-44 lg:h-auto lg:flex-1">
        <img
          src={sourceUrl}
          alt="Imported source reference"
          className="max-h-full max-w-full select-none object-contain"
          draggable={false}
          style={{
            transform: flipped ? "scaleX(-1)" : undefined,
          }}
        />
      </div>

      <div className="mt-2 grid gap-2">
        <div>
          <div
            className="grid grid-cols-4 gap-1 rounded-xl border border-[#26485a]/15 bg-white p-1"
            role="group"
            aria-label="Reference comparison mode"
          >
            {COMPARISON_MODES.map((mode) => {
              const available = isModeAvailable(mode.mode);
              const active = activeComparisonMode === mode.mode;
              const underlayCompatibilityLabel =
                mode.mode === "under"
                  ? !underlayEnabled
                    ? "Under reference · commit or trace first"
                    : active
                      ? "Under reference · visible"
                      : "Under reference · show"
                  : undefined;

              return (
                <button
                  key={mode.mode}
                  type="button"
                  className={cn(
                    "min-h-11 rounded-lg px-1 text-[0.62rem] font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef6b3b]",
                    active
                      ? "bg-[#24786f] text-white"
                      : "text-[#26485a] hover:bg-[#fff0c2]",
                    !available && "cursor-not-allowed opacity-40",
                  )}
                  aria-label={underlayCompatibilityLabel}
                  aria-pressed={active}
                  disabled={!available}
                  title={
                    available
                      ? mode.help
                      : mode.mode === "under"
                        ? "Commit or trace the framed source first."
                        : "Available when the canvas enables this comparison layer."
                  }
                  onClick={() =>
                    selectComparisonMode(
                      active && mode.mode !== "side" ? "side" : mode.mode,
                    )
                  }
                >
                  {mode.mode === "under" ? (
                    active ? (
                      <Eye className="mx-auto mb-0.5 size-3" />
                    ) : (
                      <EyeOff className="mx-auto mb-0.5 size-3" />
                    )
                  ) : null}
                  {mode.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[0.6rem] leading-4 text-muted-foreground">
            {COMPARISON_MODES.find((mode) => mode.mode === activeComparisonMode)
              ?.help ?? COMPARISON_MODES[0].help}
          </p>
        </div>
        {traceStatus ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 w-full justify-center border-[#ef6b3b]/40 bg-white text-xs font-black text-[#b84426] hover:bg-[#fff0c2]"
            disabled={traceStatus !== "ready" || !onTraceBlank}
            aria-label={
              traceStatus === "ready"
                ? "Trace framed source on a blank grid"
                : undefined
            }
            onClick={onTraceBlank}
          >
            <Scan className="size-3.5" />
            {traceStatus === "preparing"
              ? "Preparing trace…"
              : traceStatus === "error"
                ? "Trace unavailable · retry Import"
                : "Trace framed source"}
          </Button>
        ) : null}
        <label
          htmlFor={opacityId}
          className="grid grid-cols-[1fr_auto] items-center gap-2 text-[0.65rem] font-bold text-muted-foreground"
        >
          Reference strength
          <span className="font-mono text-foreground">{opacity}%</span>
          <input
            id={opacityId}
            type="range"
            min="10"
            max="80"
            step="5"
            value={opacity}
            className="col-span-2 w-full accent-primary"
            disabled={!underlayEnabled || activeComparisonMode === "side"}
            onChange={(event) => onOpacityChange(Number(event.target.value))}
          />
        </label>
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 w-full justify-center bg-white text-[0.68rem]"
            aria-pressed={flipped}
            onClick={() => onFlippedChange(!flipped)}
          >
            <FlipHorizontal2 className="size-3.5" />
            {flipped ? "Unflip" : "Flip"}
          </Button>
        </div>
      </div>

      <p className="mt-2 flex items-start gap-1 text-[0.62rem] leading-4 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-700" />
        Browser-only. The grid-aligned guide never enters a save or export.
      </p>
    </aside>
  );
}
