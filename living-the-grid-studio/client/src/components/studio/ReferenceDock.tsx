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

/**
 * A read-only, browser-local visual reference. This preview controls a dim
 * tracing layer inside the authoritative canvas; it never receives drawing
 * input or enters the GridDocument/cloud-save payload.
 */
export function ReferenceDock({
  className,
  flipped,
  onClear,
  onFlippedChange,
  onOpacityChange,
  onTraceBlank,
  onUnderlayVisibleChange,
  opacity,
  sourceUrl,
  traceStatus,
  underlayEnabled,
  underlayVisible,
}: {
  className?: string;
  flipped: boolean;
  onClear: () => void;
  onFlippedChange: (flipped: boolean) => void;
  onOpacityChange: (opacity: number) => void;
  onTraceBlank?: () => void;
  onUnderlayVisibleChange: (visible: boolean) => void;
  opacity: number;
  sourceUrl: string;
  traceStatus: "error" | "preparing" | "ready" | null;
  underlayEnabled: boolean;
  underlayVisible: boolean;
}) {
  const opacityId = useId();

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col rounded-[1.25rem] border-2 border-[#26485a]/20 bg-[#fffaf0] p-2.5 shadow-[0_4px_0_rgba(38,72,90,0.12)]",
        className,
      )}
      aria-label="Local reference image"
      data-testid="studio-reference-dock"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.13em] text-[#b84426]">
            Source board
          </p>
          <p className="mt-0.5 text-[0.65rem] leading-4 text-muted-foreground">
            Raw preview · framing follows the Import controls.
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

      <div className="mt-2 flex min-h-28 flex-1 items-center justify-center overflow-hidden rounded-xl border-2 border-[#26485a]/15 bg-[linear-gradient(45deg,#fffaf0_25%,transparent_25%),linear-gradient(-45deg,#fffaf0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#fffaf0_75%),linear-gradient(-45deg,transparent_75%,#fffaf0_75%)] bg-[#e8dfcf] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] sm:min-h-36 lg:min-h-0">
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
        <Button
          type="button"
          size="sm"
          className={`h-10 w-full justify-center text-xs font-black ${
            underlayVisible && underlayEnabled
              ? "bg-[#24786f] text-white hover:bg-[#1d625b]"
              : "bg-[#fffaf0] text-[#26485a] hover:bg-[#fff0c2]"
          }`}
          variant={underlayVisible ? "default" : "outline"}
          aria-pressed={underlayEnabled ? underlayVisible : false}
          disabled={!underlayEnabled}
          onClick={() => onUnderlayVisibleChange(!underlayVisible)}
        >
          {underlayVisible && underlayEnabled ? (
            <Eye className="size-3.5" />
          ) : (
            <EyeOff className="size-3.5" />
          )}
          {!underlayEnabled
            ? "Commit or trace first"
            : underlayVisible
              ? "Reference visible"
              : "Show reference"}
        </Button>
        <label
          htmlFor={opacityId}
          className="grid grid-cols-[1fr_auto] items-center gap-2 text-[0.65rem] font-bold text-muted-foreground"
        >
          Underlay strength
          <span className="font-mono text-foreground">{opacity}%</span>
          <input
            id={opacityId}
            type="range"
            min="10"
            max="80"
            step="5"
            value={opacity}
            className="col-span-2 w-full accent-primary"
            disabled={!underlayEnabled || !underlayVisible}
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
