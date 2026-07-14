import { useId, useState } from "react";
import { FlipHorizontal2, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A read-only, browser-local visual reference. It deliberately renders as an
 * ordinary image beside the authoritative canvas and never receives drawing
 * input or enters the GridDocument/cloud-save payload.
 */
export function ReferenceDock({
  className,
  onClear,
  sourceUrl,
}: {
  className?: string;
  onClear: () => void;
  sourceUrl: string;
}) {
  const opacityId = useId();
  const [flipped, setFlipped] = useState(false);
  const [opacity, setOpacity] = useState(100);

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col rounded-xl border border-border bg-background p-2 shadow-sm",
        className,
      )}
      aria-label="Local reference image"
      data-testid="studio-reference-dock"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.13em] text-primary">
            Reference
          </p>
          <p className="mt-0.5 text-[0.65rem] leading-4 text-muted-foreground">
            Look here, paint on the grid.
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

      <div className="mt-2 flex min-h-28 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] sm:min-h-36 lg:min-h-0">
        <img
          src={sourceUrl}
          alt="Imported source reference"
          className="max-h-full max-w-full select-none object-contain"
          draggable={false}
          style={{
            opacity: opacity / 100,
            transform: flipped ? "scaleX(-1)" : undefined,
          }}
        />
      </div>

      <div className="mt-2 grid gap-2">
        <label
          htmlFor={opacityId}
          className="grid grid-cols-[1fr_auto] items-center gap-2 text-[0.65rem] font-bold text-muted-foreground"
        >
          Dim reference
          <span className="font-mono text-foreground">{opacity}%</span>
          <input
            id={opacityId}
            type="range"
            min="25"
            max="100"
            step="5"
            value={opacity}
            className="col-span-2 w-full accent-primary"
            onChange={(event) => setOpacity(Number(event.target.value))}
          />
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 w-full justify-center text-xs"
          aria-pressed={flipped}
          onClick={() => setFlipped((current) => !current)}
        >
          <FlipHorizontal2 className="size-3.5" />
          {flipped ? "Use original direction" : "Flip reference"}
        </Button>
      </div>

      <p className="mt-2 flex items-start gap-1 text-[0.62rem] leading-4 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-700" />
        Browser-only. It is not added to cloud saves automatically.
      </p>
    </aside>
  );
}
