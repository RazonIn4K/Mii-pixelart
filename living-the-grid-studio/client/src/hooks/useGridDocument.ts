/**
 * useGridDocument — Central state management hook for the grid editor
 */

import { useState, useCallback } from "react";
import type { GridDocument } from "@/lib/engine/grid";
import {
  createGridDocument,
  recomputeUsedColors,
  replaceColor,
  getColorUsageCounts,
} from "@/lib/engine/grid";
import { optimizeGrid, type OptimizerConfig, DEFAULT_CONFIG } from "@/lib/engine/optimizer";
import { imageToGridDocument, type ImageImportOptions } from "@/lib/engine/image-import";
import { importGridJson, importLtgNative, exportGridJson } from "@/lib/engine/json-io";

export interface GridDocumentState {
  doc: GridDocument | null;
  history: GridDocument[];
  historyIndex: number;
  isLoading: boolean;
  error: string | null;
}

export function useGridDocument() {
  const [state, setState] = useState<GridDocumentState>({
    doc: null,
    history: [],
    historyIndex: -1,
    isLoading: false,
    error: null,
  });

  const pushHistory = useCallback((doc: GridDocument) => {
    setState((prev) => {
      const newHistory = prev.history.slice(0, prev.historyIndex + 1);
      newHistory.push(doc);
      // Keep max 50 history entries
      if (newHistory.length > 50) newHistory.shift();
      return {
        ...prev,
        doc,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        error: null,
      };
    });
  }, []);

  const setDoc = useCallback(
    (doc: GridDocument) => {
      pushHistory(doc);
    },
    [pushHistory]
  );

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.historyIndex <= 0) return prev;
      const newIndex = prev.historyIndex - 1;
      return {
        ...prev,
        doc: prev.history[newIndex],
        historyIndex: newIndex,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.historyIndex >= prev.history.length - 1) return prev;
      const newIndex = prev.historyIndex + 1;
      return {
        ...prev,
        doc: prev.history[newIndex],
        historyIndex: newIndex,
      };
    });
  }, []);

  const createNew = useCallback(
    (width: number, height: number, name?: string) => {
      const doc = createGridDocument(width, height, name);
      pushHistory(doc);
    },
    [pushHistory]
  );

  const importFromImage = useCallback(
    async (file: File, options?: Partial<ImageImportOptions>) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const doc = await imageToGridDocument(file, options);
        pushHistory(doc);
        setState((prev) => ({ ...prev, isLoading: false }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : "Import failed",
        }));
      }
    },
    [pushHistory]
  );

  const importFromJson = useCallback(
    (jsonString: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        // Try native format first, then LTG format
        let doc: GridDocument;
        try {
          doc = importGridJson(jsonString);
        } catch {
          doc = importLtgNative(jsonString);
        }
        pushHistory(doc);
        setState((prev) => ({ ...prev, isLoading: false }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : "JSON import failed",
        }));
      }
    },
    [pushHistory]
  );

  const mergeColors = useCallback(
    (fromId: string, toId: string) => {
      if (!state.doc) return;
      const newDoc = replaceColor(state.doc, fromId, toId);
      pushHistory(newDoc);
    },
    [state.doc, pushHistory]
  );

  const toggleColorLock = useCallback(
    (colorId: string) => {
      if (!state.doc) return;
      const locked = state.doc.lockedColors.includes(colorId)
        ? state.doc.lockedColors.filter((id) => id !== colorId)
        : [...state.doc.lockedColors, colorId];
      const newDoc = { ...state.doc, lockedColors: locked };
      pushHistory(newDoc);
    },
    [state.doc, pushHistory]
  );

  const runOptimizer = useCallback(
    (config?: Partial<OptimizerConfig>) => {
      if (!state.doc) return;
      const cfg = {
        ...DEFAULT_CONFIG,
        ...config,
        lockedColors: state.doc.lockedColors,
      };
      const { doc: optimized } = optimizeGrid(state.doc, cfg);
      pushHistory(optimized);
    },
    [state.doc, pushHistory]
  );

  const exportJson = useCallback((): string | null => {
    if (!state.doc) return null;
    return exportGridJson(state.doc);
  }, [state.doc]);

  const colorCounts = state.doc ? getColorUsageCounts(state.doc) : new Map<string, number>();

  return {
    doc: state.doc,
    isLoading: state.isLoading,
    error: state.error,
    canUndo: state.historyIndex > 0,
    canRedo: state.historyIndex < state.history.length - 1,
    colorCounts,
    setDoc,
    createNew,
    importFromImage,
    importFromJson,
    mergeColors,
    toggleColorLock,
    runOptimizer,
    exportJson,
    undo,
    redo,
  };
}
