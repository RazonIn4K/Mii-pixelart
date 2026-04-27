/**
 * PalettePanel.tsx — Color palette display with usage counts and locking
 *
 * DESIGN: "Paper Studio" — Swatches look like painted color samples on paper.
 * Red dot indicator for selected/active items. Minimal chrome.
 */

import { Lock, Unlock, ArrowRightLeft } from "lucide-react";
import { TOMODACHI_PALETTE, type PaletteColor } from "@/lib/engine/palette";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface PalettePanelProps {
  usedColors: string[];
  colorCounts: Map<string, number>;
  lockedColors: string[];
  highlightColorId: string | null;
  onColorHover: (colorId: string | null) => void;
  onColorClick: (colorId: string) => void;
  onToggleLock: (colorId: string) => void;
  onMergeRequest: (fromId: string) => void;
}

export default function PalettePanel({
  usedColors,
  colorCounts,
  lockedColors,
  highlightColorId,
  onColorHover,
  onColorClick,
  onToggleLock,
  onMergeRequest,
}: PalettePanelProps) {
  // Sort used colors by usage count (descending)
  const sortedColors = [...usedColors].sort(
    (a, b) => (colorCounts.get(b) ?? 0) - (colorCounts.get(a) ?? 0)
  );

  const totalCells = Array.from(colorCounts.values()).reduce((a, b) => a + b, 0);

  const getPaletteInfo = (id: string): PaletteColor | undefined =>
    TOMODACHI_PALETTE.find((c) => c.id === id);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <p className="section-header mb-1">Palette</p>
        <p className="text-xs text-muted-foreground">
          {usedColors.length} colors · {totalCells.toLocaleString()} cells
        </p>
      </div>

      {/* Used Colors List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {sortedColors.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              No colors in use yet.
              <br />
              Import an image or JSON to get started.
            </p>
          )}
          {sortedColors.map((colorId) => {
            const info = getPaletteInfo(colorId);
            const count = colorCounts.get(colorId) ?? 0;
            const pct = totalCells > 0 ? ((count / totalCells) * 100).toFixed(1) : "0";
            const isLocked = lockedColors.includes(colorId);
            const isHighlighted = highlightColorId === colorId;

            return (
              <div
                key={colorId}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-sm transition-colors ${
                  isHighlighted
                    ? "bg-accent"
                    : "hover:bg-secondary"
                }`}
                onMouseEnter={() => onColorHover(colorId)}
                onMouseLeave={() => onColorHover(null)}
              >
                {/* Color swatch */}
                <button
                  onClick={() => onColorClick(colorId)}
                  className="w-6 h-6 rounded-sm border border-border shrink-0 relative"
                  style={{ backgroundColor: info?.hex ?? colorId }}
                >
                  {isHighlighted && (
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
                  )}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium truncate">
                      {info?.name ?? colorId}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {info?.id ?? ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {count.toLocaleString()} ({pct}%)
                    </span>
                    {/* Usage bar */}
                    <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, parseFloat(pct))}%`,
                          backgroundColor: info?.hex ?? colorId,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onToggleLock(colorId)}
                        className="p-1 rounded-sm hover:bg-accent"
                      >
                        {isLocked ? (
                          <Lock className="w-3 h-3 text-primary" />
                        ) : (
                          <Unlock className="w-3 h-3 text-muted-foreground" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p className="text-xs">
                        {isLocked ? "Unlock color" : "Lock color (protected from optimizer)"}
                      </p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onMergeRequest(colorId)}
                        className="p-1 rounded-sm hover:bg-accent"
                      >
                        <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p className="text-xs">Merge into another color</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Full Palette Reference */}
      <div className="border-t border-border px-4 py-3">
        <p className="section-header mb-2">Game Palette Reference</p>
        <div className="grid grid-cols-7 gap-0.5">
          {TOMODACHI_PALETTE.filter((c) => !c.isSaturated).slice(0, 77).map((c) => (
            <Tooltip key={c.id}>
              <TooltipTrigger asChild>
                <button
                  className={`w-full aspect-square rounded-sm border ${
                    usedColors.includes(c.id)
                      ? "border-foreground/30"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => onColorClick(c.id)}
                  onMouseEnter={() => onColorHover(c.id)}
                  onMouseLeave={() => onColorHover(null)}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs font-mono">
                  {c.id} · {c.name} · {c.hex}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        {/* Saturated extras */}
        <div className="grid grid-cols-7 gap-0.5 mt-1">
          {TOMODACHI_PALETTE.filter((c) => c.isSaturated).map((c) => (
            <Tooltip key={c.id}>
              <TooltipTrigger asChild>
                <button
                  className={`w-full aspect-square rounded-sm border ${
                    usedColors.includes(c.id)
                      ? "border-foreground/30"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c.hex }}
                  onClick={() => onColorClick(c.id)}
                  onMouseEnter={() => onColorHover(c.id)}
                  onMouseLeave={() => onColorHover(null)}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs font-mono">
                  {c.id} · {c.name} · {c.hex}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
}
