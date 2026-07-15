/**
 * useGridDocument — Central state management hook for the grid editor
 */

import { useState, useCallback, useRef } from "react";
import type { GridDocument } from "@/lib/engine/grid";
import {
  createGridDocument,
  replaceColor,
  getColorUsageCounts,
  resampleGridNearest,
} from "@/lib/engine/grid";
import {
  applyStudioTransaction,
  buildPaintCellsTransaction,
  type StudioCommand,
} from "@/lib/engine/studio-commands";
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
    isLoading: false,
    error: null,
  };
}

export function useGridDocument() {
  const previewRequestRef = useRef(0);
  const strokeActiveRef = useRef(false);
  const strokeStartDocRef = useRef<GridDocument | null>(null);
  const [state, setState] = useState<GridDocumentState>({
    doc: null,
    imagePreview: null,
    history: [],
    historyIndex: -1,
    isLoading: false,
    error: null,
  });

  const rollbackActiveStroke = useCallback((): boolean => {
    if (!strokeActiveRef.current) return false;
    strokeActiveRef.current = false;
    const startDoc = strokeStartDocRef.current;
    strokeStartDocRef.current = null;
    setState((prev) => {
      if (!startDoc || prev.doc === startDoc) return prev;
      return {
        ...prev,
        doc: startDoc,
        imagePreview: null,
        error: null,
      };
    });
    return true;
  }, []);

  const pushHistory = useCallback((doc: GridDocument) => {
    previewRequestRef.current += 1;
    setState((prev) => appendHistory(prev, doc));
  }, []);

  const setDoc = useCallback(
    (doc: GridDocument) => {
      pushHistory(doc);
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    // A live pointer gesture still owns the document. Ignore history movement
    // until pointerup commits one atomic stroke; otherwise later pointermove
    // samples could resume outside the transaction and create partial entries.
    if (strokeActiveRef.current) return;
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
    if (strokeActiveRef.current) return;
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
      const requestNumber = previewRequestRef.current + 1;
      previewRequestRef.current = requestNumber;
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const doc = await imageToGridDocument(file, options);
        if (previewRequestRef.current !== requestNumber) return;
        setState((prev) => ({
          ...prev,
          imagePreview: doc,
          isLoading: false,
          error: null,
        }));
      } catch (err) {
        if (previewRequestRef.current !== requestNumber) return;
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
    previewRequestRef.current += 1;
    setState((prev) => ({
      ...prev,
      imagePreview: null,
      isLoading: false,
    }));
  }, []);

  const importFromJson = useCallback(
    (jsonString: string): GridDocument | null => {
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
        return doc;
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : "JSON import failed",
        }));
        return null;
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
      const newDoc = {
        ...state.doc,
        lockedColors: locked,
        meta: { ...state.doc.meta, modifiedAt: new Date().toISOString() },
      };
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
  const beginStroke = useCallback(() => {
    if (strokeActiveRef.current) return;
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

  /**
   * Roll an in-flight stroke back to its exact starting document without
   * adding an undo entry. Canvas gestures use this when a second touch turns
   * a drawing gesture into pinch/pan, so navigation can never leave a stray
   * painted cell behind.
   */
  const cancelStroke = rollbackActiveStroke;

  const paintCell = useCallback(
    (x: number, y: number, colorId: string | null) => {
      setState((prev) => {
        if (!prev.doc) return prev;
        let newDoc: GridDocument;
        try {
          newDoc = applyStudioTransaction(prev.doc, [
            { type: "paint_cells", cells: [{ x, y }], colorId },
          ]).doc;
        } catch (error) {
          return {
            ...prev,
            error:
              error instanceof Error
                ? error.message
                : "The cell could not be painted.",
          };
        }
        if (newDoc === prev.doc) return prev;

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
    (
      cells: ReadonlyArray<{ x: number; y: number }>,
      colorId: string | null,
    ) => {
      if (cells.length === 0) return;
      setState((prev) => {
        if (!prev.doc) return prev;
        let newDoc: GridDocument;
        try {
          newDoc = applyStudioTransaction(
            prev.doc,
            buildPaintCellsTransaction(cells, colorId),
          ).doc;
        } catch (error) {
          return {
            ...prev,
            error:
              error instanceof Error
                ? error.message
                : "The stroke could not be painted.",
          };
        }
        if (newDoc === prev.doc) return prev;
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
        let newDoc: GridDocument;
        try {
          newDoc = applyStudioTransaction(prev.doc, [
            { type: "flood_fill", x, y, colorId },
          ]).doc;
        } catch (error) {
          return {
            ...prev,
            error:
              error instanceof Error
                ? error.message
                : "The region could not be filled.",
          };
        }
        if (newDoc === prev.doc) return prev;
        return appendHistory(prev, newDoc);
      });
    },
    [],
  );

  const applyCommands = useCallback((commands: readonly StudioCommand[]) => {
    setState((prev) => {
      if (!prev.doc || commands.length === 0) return prev;
      try {
        const result = applyStudioTransaction(prev.doc, commands);
        if (result.doc === prev.doc) return prev;
        return appendHistory(prev, result.doc);
      } catch (error) {
        return {
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "The Studio command transaction could not be applied.",
        };
      }
    });
  }, []);

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
    applyCommands,
    beginStroke,
    cancelStroke,
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
