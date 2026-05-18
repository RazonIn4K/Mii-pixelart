/**
 * useGridDocument — Central state management hook for the grid editor
 */

import { useState, useCallback, useRef } from "react";
import type { GridDocument } from "@/lib/engine/grid";
import {
  createGridDocument,
  getCell,
  recomputeUsedColors,
  replaceColor,
  getColorUsageCounts,
  resampleGridNearest,
  setCell,
  setCells,
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

  /**
   * Stroke transaction grouping.
   *
   * Without this, each painted cell during a drag would push its own
   * history frame, filling the 50-frame undo buffer mid-stroke and making
   * undo unusable. With this:
   *   - Studio.tsx calls beginStroke() on mouse-down.
   *   - paintCell / paintCells during the stroke mutate the live doc in
   *     place (still immutable per call) WITHOUT appending to history.
   *   - On mouse-up, endStroke() promotes the final doc state to a single
   *     history entry.
   *
   * A ref (not state) is used so beginStroke/endStroke don't cause a
   * re-render and so the active flag is read synchronously by the same
   * tick's paintCell call.
   */
  const strokeActiveRef = useRef(false);
  const strokeStartDocRef = useRef<GridDocument | null>(null);

  const beginStroke = useCallback(() => {
    strokeActiveRef.current = true;
    // Capture the pre-stroke doc so we know what to compare against on end.
    setState((prev) => {
      strokeStartDocRef.current = prev.doc;
      return prev;
    });
  }, []);

  const endStroke = useCallback(() => {
    if (!strokeActiveRef.current) return;
    strokeActiveRef.current = false;
    setState((prev) => {
      const startDoc = strokeStartDocRef.current;
      strokeStartDocRef.current = null;
      // Nothing happened or the user erased back to the start state — skip.
      if (!prev.doc || !startDoc || prev.doc === startDoc) return prev;
      // Promote the in-flight stroke result to a real history entry.
      // We replace whatever in-stroke state was set so undo lands on the
      // pre-stroke doc, not on a mid-stroke frame.
      const trimmed = prev.history.slice(0, prev.historyIndex);
      // Re-anchor the pre-stroke doc as the prior entry if it isn't already.
      if (trimmed[trimmed.length - 1] !== startDoc) {
        trimmed.push(startDoc);
      }
      trimmed.push(prev.doc);
      // Keep the 50-frame cap.
      while (trimmed.length > 50) trimmed.shift();
      return {
        ...prev,
        history: trimmed,
        historyIndex: trimmed.length - 1,
      };
    });
  }, []);

  const paintCell = useCallback(
    (x: number, y: number, colorId: string | null) => {
      setState((prev) => {
        if (!prev.doc) return prev;
        if (getCell(prev.doc, x, y) === colorId) return prev;

        const newDoc = recomputeUsedColors(setCell(prev.doc, x, y, colorId));

        // During a stroke, mutate the live doc without appending history —
        // endStroke will promote the final state to one history entry.
        if (strokeActiveRef.current) {
          return { ...prev, doc: newDoc, imagePreview: null, error: null };
        }
        return appendHistory(prev, newDoc);
      });
    },
    [],
  );

  /**
   * Batch paint: write `colorId` to many cells in one immutable update.
   *
   * Used by the canvas drag handler when a fast mouse stroke skips cells —
   * the handler calls bresenhamLine() to fill the gaps and feeds the
   * resulting cell array here. Single immutable update means React only
   * re-renders once per drag frame.
   *
   * Honors the stroke transaction the same way paintCell does.
   */
  const paintCells = useCallback(
    (cells: ReadonlyArray<{ x: number; y: number }>, colorId: string | null) => {
      if (cells.length === 0) return;
      setState((prev) => {
        if (!prev.doc) return prev;
        const updated = setCells(prev.doc, cells, colorId);
        if (updated === prev.doc) return prev;
        const newDoc = recomputeUsedColors(updated);
        if (strokeActiveRef.current) {
          return { ...prev, doc: newDoc, imagePreview: null, error: null };
        }
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
    paintCells,
    fillRegion,
    beginStroke,
    endStroke,
    resampleCanvas,
    mergeColors,
    toggleColorLock,
    runOptimizer,
    exportJson,
    undo,
    redo,
  };
}
