/**
 * useGridDocument — Central state management hook for the grid editor
 */

import { useState, useCallback } from "react";
import type { GridDocument } from "@/lib/engine/grid";
import {
  createGridDocument,
  getCell,
  recomputeUsedColors,
  replaceColor,
  getColorUsageCounts,
  resampleGridNearest,
  setCell,
} from "@/lib/engine/grid";
import {
  optimizeGrid,
  type OptimizerConfig,
  DEFAULT_CONFIG,
} from "@/lib/engine/optimizer";
import {
  imageToGridDocument,
  type ImageImportOptions,
} from "@/lib/engine/image-import";
import {
  importGridJson,
  importLtgNative,
  exportGridJson,
} from "@/lib/engine/json-io";

export interface GridDocumentState {
  doc: GridDocument | null;
  imagePreview: GridDocument | null;
  history: GridDocument[];
  historyIndex: number;
  isLoading: boolean;
  error: string | null;
}

function appendHistory(
  prev: GridDocumentState,
  doc: GridDocument,
): GridDocumentState {
  const newHistory = prev.history.slice(0, prev.historyIndex + 1);
  newHistory.push(doc);
  if (newHistory.length > 50) newHistory.shift();
  return {
    ...prev,
    doc,
    imagePreview: null,
    history: newHistory,
    historyIndex: newHistory.length - 1,
    error: null,
  };
}

export function useGridDocument() {
  const [state, setState] = useState<GridDocumentState>({
    doc: null,
    imagePreview: null,
    history: [],
    historyIndex: -1,
    isLoading: false,
    error: null,
  });

  const pushHistory = useCallback((doc: GridDocument) => {
    setState((prev) => appendHistory(prev, doc));
  }, []);

  const setDoc = useCallback(
    (doc: GridDocument) => {
      pushHistory(doc);
    },
    [pushHistory],
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
    (
      width: number,
      height: number,
      name?: string,
      fillColorId: string | null = null,
    ) => {
      const doc = createGridDocument(width, height, name, fillColorId);
      pushHistory(doc);
    },
    [pushHistory],
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
    [pushHistory],
  );

  const previewFromImage = useCallback(
    async (file: File, options?: Partial<ImageImportOptions>) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const doc = await imageToGridDocument(file, options);
        setState((prev) => ({
          ...prev,
          imagePreview: doc,
          isLoading: false,
          error: null,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          imagePreview: null,
          isLoading: false,
          error: err instanceof Error ? err.message : "Image preview failed",
        }));
      }
    },
    [],
  );

  const commitImagePreview = useCallback(() => {
    if (!state.imagePreview) return;
    pushHistory(state.imagePreview);
  }, [pushHistory, state.imagePreview]);

  const clearImagePreview = useCallback(() => {
    setState((prev) => ({ ...prev, imagePreview: null }));
  }, []);

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
    [pushHistory],
  );

  const mergeColors = useCallback(
    (fromId: string, toId: string) => {
      if (!state.doc) return;
      const newDoc = replaceColor(state.doc, fromId, toId);
      pushHistory(newDoc);
    },
    [state.doc, pushHistory],
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
    [state.doc, pushHistory],
  );

  const paintCell = useCallback(
    (x: number, y: number, colorId: string | null) => {
      setState((prev) => {
        if (!prev.doc) return prev;
        if (getCell(prev.doc, x, y) === colorId) return prev;

        const newDoc = recomputeUsedColors(setCell(prev.doc, x, y, colorId));
        return appendHistory(prev, newDoc);
      });
    },
    [],
  );

  const fillRegion = useCallback(
    (x: number, y: number, colorId: string | null) => {
      setState((prev) => {
        if (!prev.doc) return prev;
        if (x < 0 || x >= prev.doc.width || y < 0 || y >= prev.doc.height)
          return prev;

        const targetColorId = getCell(prev.doc, x, y);
        if (targetColorId === colorId) return prev;

        const cells = [...prev.doc.cells];
        const visited = new Uint8Array(prev.doc.width * prev.doc.height);
        const queue: [number, number][] = [[x, y]];

        while (queue.length > 0) {
          const [cx, cy] = queue.shift()!;
          if (
            cx < 0 ||
            cx >= prev.doc.width ||
            cy < 0 ||
            cy >= prev.doc.height
          ) {
            continue;
          }

          const index = cy * prev.doc.width + cx;
          if (visited[index]) continue;
          visited[index] = 1;
          if (cells[index] !== targetColorId) continue;

          cells[index] = colorId;
          queue.push([cx + 1, cy]);
          queue.push([cx - 1, cy]);
          queue.push([cx, cy + 1]);
          queue.push([cx, cy - 1]);
        }

        const newDoc = recomputeUsedColors({
          ...prev.doc,
          cells,
          meta: { ...prev.doc.meta, modifiedAt: new Date().toISOString() },
        });
        return appendHistory(prev, newDoc);
      });
    },
    [],
  );

  const resampleCanvas = useCallback((width: number, height: number) => {
    setState((prev) => {
      if (!prev.doc) return prev;
      const nextDoc = resampleGridNearest(prev.doc, width, height);
      if (nextDoc === prev.doc) return prev;
      return appendHistory(prev, nextDoc);
    });
  }, []);

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
    [state.doc, pushHistory],
  );

  const exportJson = useCallback((): string | null => {
    if (!state.doc) return null;
    return exportGridJson(state.doc);
  }, [state.doc]);

  const colorCounts = state.doc
    ? getColorUsageCounts(state.doc)
    : new Map<string, number>();

  return {
    doc: state.doc,
    imagePreview: state.imagePreview,
    isLoading: state.isLoading,
    error: state.error,
    canUndo: state.historyIndex > 0,
    canRedo: state.historyIndex < state.history.length - 1,
    colorCounts,
    setDoc,
    createNew,
    importFromImage,
    previewFromImage,
    commitImagePreview,
    clearImagePreview,
    importFromJson,
    paintCell,
    fillRegion,
    resampleCanvas,
    mergeColors,
    toggleColorLock,
    runOptimizer,
    exportJson,
    undo,
    redo,
  };
}
