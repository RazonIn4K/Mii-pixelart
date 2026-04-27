/**
 * OptimizerPanel.tsx — Optimization controls
 *
 * DESIGN: "Paper Studio" — Clean, organized controls like a notebook page.
 * Section headers in small caps. Red accent for action buttons.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sparkles, Eraser, Shrink, Palette } from "lucide-react";
import type { OptimizerConfig } from "@/lib/engine/optimizer";
import { DEFAULT_CONFIG } from "@/lib/engine/optimizer";

interface OptimizerPanelProps {
  currentColorCount: number;
  onRunOptimizer: (config: Partial<OptimizerConfig>) => void;
  disabled: boolean;
}

export default function OptimizerPanel({
  currentColorCount,
  onRunOptimizer,
  disabled,
}: OptimizerPanelProps) {
  const [mergeThreshold, setMergeThreshold] = useState(DEFAULT_CONFIG.mergeThreshold);
  const [maxIslandSize, setMaxIslandSize] = useState(DEFAULT_CONFIG.maxIslandSize);
  const [cleanupSingleCells, setCleanupSingleCells] = useState(DEFAULT_CONFIG.cleanupSingleCells);
  const [maxColors, setMaxColors] = useState(0);
  const [limitPalette, setLimitPalette] = useState(false);

  const handleRunAll = () => {
    onRunOptimizer({
      mergeThreshold,
      maxIslandSize,
      cleanupSingleCells,
      maxColors: limitPalette ? maxColors : 0,
    });
  };

  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="section-header mb-1">Optimizer</p>
        <p className="text-xs text-muted-foreground">
          Deterministic passes to simplify the grid for hand-painting.
        </p>
      </div>

      {/* Merge Similar Colors */}
      <div className="space-y-2 p-3 rounded-sm border border-border bg-card">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <Label className="text-xs font-semibold">Merge Similar Colors</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Merge colors with Delta E below threshold. Lower = stricter.
        </p>
        <div className="flex items-center gap-3">
          <Slider
            value={[mergeThreshold]}
            onValueChange={([v]) => setMergeThreshold(v)}
            min={1}
            max={30}
            step={1}
            className="flex-1"
            disabled={disabled}
          />
          <span className="text-xs font-mono w-8 text-right">{mergeThreshold}</span>
        </div>
      </div>

      {/* Remove Islands */}
      <div className="space-y-2 p-3 rounded-sm border border-border bg-card">
        <div className="flex items-center gap-2">
          <Eraser className="w-3.5 h-3.5 text-primary" />
          <Label className="text-xs font-semibold">Remove Islands</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Merge small isolated regions into surrounding colors.
        </p>
        <div className="flex items-center gap-3">
          <Slider
            value={[maxIslandSize]}
            onValueChange={([v]) => setMaxIslandSize(v)}
            min={1}
            max={10}
            step={1}
            className="flex-1"
            disabled={disabled}
          />
          <span className="text-xs font-mono w-12 text-right">≤{maxIslandSize}px</span>
        </div>
      </div>

      {/* Single Cell Cleanup */}
      <div className="flex items-center justify-between p-3 rounded-sm border border-border bg-card">
        <div className="flex items-center gap-2">
          <Shrink className="w-3.5 h-3.5 text-primary" />
          <div>
            <Label className="text-xs font-semibold">Single-Cell Cleanup</Label>
            <p className="text-xs text-muted-foreground">Remove lone isolated pixels</p>
          </div>
        </div>
        <Switch
          checked={cleanupSingleCells}
          onCheckedChange={setCleanupSingleCells}
          disabled={disabled}
        />
      </div>

      {/* Palette Limit */}
      <div className="space-y-2 p-3 rounded-sm border border-border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="w-3.5 h-3.5 text-primary" />
            <Label className="text-xs font-semibold">Limit Palette</Label>
          </div>
          <Switch
            checked={limitPalette}
            onCheckedChange={setLimitPalette}
            disabled={disabled}
          />
        </div>
        {limitPalette && (
          <>
            <p className="text-xs text-muted-foreground">
              Reduce to max N colors by merging the most similar pairs.
            </p>
            <div className="flex items-center gap-3">
              <Slider
                value={[maxColors || currentColorCount]}
                onValueChange={([v]) => setMaxColors(v)}
                min={2}
                max={Math.max(currentColorCount, 84)}
                step={1}
                className="flex-1"
                disabled={disabled}
              />
              <span className="text-xs font-mono w-8 text-right">
                {maxColors || currentColorCount}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Run Button */}
      <Button
        onClick={handleRunAll}
        disabled={disabled}
        className="w-full tracking-wide"
        size="sm"
      >
        <Sparkles className="w-3.5 h-3.5 mr-2" />
        Run Optimizer
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        All changes are reversible with Undo (Ctrl+Z).
      </p>
    </div>
  );
}
