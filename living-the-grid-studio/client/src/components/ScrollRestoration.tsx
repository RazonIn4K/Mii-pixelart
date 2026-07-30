import { useEffect } from "react";

const HISTORY_KEY = "__tomodachiScrollKey";
const STORAGE_KEY = "tomodachi.scroll-positions.v1";
const MAX_STORED_POSITIONS = 50;
const MAX_HASH_RESTORE_FRAMES = 60;
const MAX_POSITION_RESTORE_WAIT_MS = 15_000;
const POSITION_RESTORE_RETRY_MS = 100;

interface ScrollPosition {
  x: number;
  y: number;
}

function keyFromState(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const key = (state as Record<string, unknown>)[HISTORY_KEY];
  return typeof key === "string" && key.length > 0 ? key : null;
}

function stateWithKey(
  state: unknown,
  key: string,
): Record<string, unknown> | null {
  if (state === null || state === undefined) return { [HISTORY_KEY]: key };
  if (typeof state !== "object") return null;
  const prototype = Object.getPrototypeOf(state);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return { ...(state as Record<string, unknown>), [HISTORY_KEY]: key };
}

function createHistoryKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `scroll-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function readStoredPositions(): Map<string, ScrollPosition> {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as unknown;
    const positions = new Map<string, ScrollPosition>();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return positions;
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const { x, y } = value as Partial<ScrollPosition>;
      if (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        (x ?? -1) >= 0 &&
        (y ?? -1) >= 0
      ) {
        positions.set(key, { x: x as number, y: y as number });
      }
    }
    return positions;
  } catch {
    return new Map();
  }
}

function writeStoredPositions(positions: Map<string, ScrollPosition>) {
  try {
    const recent = Array.from(positions.entries()).slice(-MAX_STORED_POSITIONS);
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(recent)),
    );
  } catch {
    // Scroll restoration remains available in memory when storage is blocked.
  }
}

function currentHashTarget(): HTMLElement | null {
  if (!window.location.hash) return null;
  try {
    return document.getElementById(
      decodeURIComponent(window.location.hash.slice(1)),
    );
  } catch {
    return null;
  }
}

/**
 * Wouter keeps the document alive during navigation, so browsers cannot restore
 * each history entry's scroll offset on their own. Give every entry a private
 * key, remember its position, and restore it after the destination DOM exists.
 */
export function ScrollRestoration() {
  useEffect(() => {
    const positions = readStoredPositions();
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    let assigningState = false;
    let captureFrame: number | null = null;
    let currentKey = keyFromState(window.history.state);
    let viewportKey = currentKey;
    let currentHash = window.location.hash;
    let currentPathname = window.location.pathname;
    let pendingRestoreGeneration: number | null = null;
    let pendingRestoreArmed = false;
    let restoreGeneration = 0;
    let restoring = false;
    let suppressedTraversalUrl: string | null = null;
    let traversalTimer: number | null = null;
    let positionRetryTimer: number | null = null;

    const clearPositionRetry = () => {
      if (positionRetryTimer === null) return;
      window.clearTimeout(positionRetryTimer);
      positionRetryTimer = null;
    };

    const assignKey = (key: string) => {
      const nextState = stateWithKey(window.history.state, key);
      if (!nextState) return false;
      try {
        assigningState = true;
        window.history.replaceState(nextState, "", window.location.href);
        return true;
      } catch {
        return false;
      } finally {
        assigningState = false;
      }
    };

    if (!currentKey) {
      const nextKey = createHistoryKey();
      currentKey = assignKey(nextKey) ? nextKey : null;
      viewportKey = currentKey;
    }

    const remember = (persist = false) => {
      // A rapid second traversal can arrive before the first destination has
      // restored. In that window currentKey already names the destination,
      // while the viewport still belongs to the entry we just left. Never
      // write that inherited offset into the pending destination.
      if (!currentKey || viewportKey !== currentKey) return;
      if (captureFrame !== null) {
        window.cancelAnimationFrame(captureFrame);
        captureFrame = null;
      }
      positions.delete(currentKey);
      positions.set(currentKey, { x: window.scrollX, y: window.scrollY });
      while (positions.size > MAX_STORED_POSITIONS) {
        const oldest = positions.keys().next().value as string | undefined;
        if (!oldest) break;
        positions.delete(oldest);
      }
      if (persist) writeStoredPositions(positions);
    };

    const finishRestore = (
      position: ScrollPosition,
      generation: number,
      scheduledKey: string | null,
      stabilize: boolean,
    ) => {
      restoring = true;
      let remainingFrames = stabilize ? 8 : 0;

      const apply = () => {
        if (generation !== restoreGeneration || currentKey !== scheduledKey) {
          if (pendingRestoreGeneration === generation) {
            pendingRestoreGeneration = null;
            pendingRestoreArmed = false;
            restoring = false;
            clearPositionRetry();
          }
          return;
        }
        if (
          Math.abs(window.scrollX - position.x) > 1 ||
          Math.abs(window.scrollY - position.y) > 1
        ) {
          window.scrollTo({
            behavior: "auto",
            left: position.x,
            top: position.y,
          });
        }
        viewportKey = scheduledKey;
        if (remainingFrames-- > 0) {
          window.requestAnimationFrame(apply);
          return;
        }
        restoring = false;
        if (pendingRestoreGeneration === generation) {
          pendingRestoreGeneration = null;
          pendingRestoreArmed = false;
          clearPositionRetry();
        }
        remember();
      };

      apply();
    };

    const scheduleRestore = (
      position: ScrollPosition | undefined,
      preferHash: boolean,
      stabilize = false,
    ) => {
      const generation = ++restoreGeneration;
      const scheduledKey = currentKey;
      clearPositionRetry();
      pendingRestoreGeneration = generation;
      pendingRestoreArmed = false;
      let attempts = 0;
      const positionDeadline =
        window.performance.now() + MAX_POSITION_RESTORE_WAIT_MS;

      const attempt = () => {
        if (generation !== restoreGeneration || currentKey !== scheduledKey) {
          return;
        }

        if (preferHash && window.location.hash) {
          const target = currentHashTarget();
          if (!target && attempts++ < MAX_HASH_RESTORE_FRAMES) {
            window.requestAnimationFrame(attempt);
            return;
          }
          if (target) {
            restoring = true;
            target.scrollIntoView({ block: "start" });
            viewportKey = scheduledKey;
            window.requestAnimationFrame(() => {
              if (
                generation !== restoreGeneration ||
                currentKey !== scheduledKey
              ) {
                return;
              }
              restoring = false;
              if (pendingRestoreGeneration === generation) {
                pendingRestoreGeneration = null;
                pendingRestoreArmed = false;
                clearPositionRetry();
              }
              remember();
            });
            return;
          }
        }

        const destination = position ?? { x: 0, y: 0 };
        const maximumY = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        if (
          destination.y > maximumY + 1 &&
          window.performance.now() < positionDeadline
        ) {
          positionRetryTimer = window.setTimeout(() => {
            positionRetryTimer = null;
            attempt();
          }, POSITION_RESTORE_RETRY_MS);
          return;
        }
        finishRestore(destination, generation, scheduledKey, stabilize);
      };

      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          if (generation !== restoreGeneration || currentKey !== scheduledKey) {
            return;
          }
          // Browsers can emit their own scroll while completing a traversal,
          // even with manual restoration. Arm interruption after that brief
          // traversal phase so later scrollbar/assistive scroll remains final.
          pendingRestoreArmed = true;
          attempt();
        }),
      );
    };

    const onScroll = () => {
      if (restoring) return;
      // Scrollbars and assistive scrolling do not necessarily emit wheel,
      // pointer, touch, or key events. A scroll while a restore is pending is
      // therefore an explicit claim over the destination viewport.
      if (pendingRestoreGeneration !== null) {
        if (!pendingRestoreArmed) return;
        ++restoreGeneration;
        pendingRestoreGeneration = null;
        pendingRestoreArmed = false;
        clearPositionRetry();
      }
      viewportKey = currentKey;
      if (captureFrame !== null) return;
      captureFrame = window.requestAnimationFrame(() => {
        captureFrame = null;
        remember();
      });
    };

    const cancelRestoreForInput = () => {
      if (!restoring && pendingRestoreGeneration === null) return;
      ++restoreGeneration;
      pendingRestoreGeneration = null;
      pendingRestoreArmed = false;
      clearPositionRetry();
      restoring = false;
    };

    const onPushState = () => {
      remember(true);
      currentHash = window.location.hash;
      currentPathname = window.location.pathname;
      const nextKey = createHistoryKey();
      currentKey = assignKey(nextKey) ? nextKey : null;
      scheduleRestore(undefined, true);
    };

    const onReplaceState = () => {
      if (assigningState) return;
      const pathnameChanged = currentPathname !== window.location.pathname;
      const hashChanged = currentHash !== window.location.hash;
      currentPathname = window.location.pathname;
      currentHash = window.location.hash;
      const replacementKey = keyFromState(window.history.state);
      if (replacementKey) {
        currentKey = replacementKey;
      } else {
        const nextKey = currentKey ?? createHistoryKey();
        currentKey = assignKey(nextKey) ? nextKey : null;
      }
      if (pathnameChanged || hashChanged) {
        viewportKey = null;
        scheduleRestore(undefined, true);
      }
    };

    const onPopState = (event: PopStateEvent) => {
      remember(true);
      suppressedTraversalUrl = window.location.href;
      if (traversalTimer !== null) window.clearTimeout(traversalTimer);
      traversalTimer = window.setTimeout(() => {
        suppressedTraversalUrl = null;
        traversalTimer = null;
      }, 100);

      currentKey = keyFromState(event.state);
      currentHash = window.location.hash;
      currentPathname = window.location.pathname;
      if (!currentKey) {
        const nextKey = createHistoryKey();
        currentKey = assignKey(nextKey) ? nextKey : null;
      }
      const position = currentKey ? positions.get(currentKey) : undefined;
      scheduleRestore(position, !position, true);
    };

    const onHashChange = () => {
      if (suppressedTraversalUrl === window.location.href) {
        suppressedTraversalUrl = null;
        if (traversalTimer !== null) window.clearTimeout(traversalTimer);
        traversalTimer = null;
        return;
      }
      remember(true);
      currentHash = window.location.hash;
      currentPathname = window.location.pathname;
      const nextKey = createHistoryKey();
      currentKey = assignKey(nextKey) ? nextKey : null;
      scheduleRestore(undefined, true);
    };

    const persist = () => remember(true);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", cancelRestoreForInput, { passive: true });
    window.addEventListener("touchstart", cancelRestoreForInput, {
      passive: true,
    });
    window.addEventListener("pointerdown", cancelRestoreForInput);
    window.addEventListener("keydown", cancelRestoreForInput);
    window.addEventListener("pushState", onPushState);
    window.addEventListener("replaceState", onReplaceState);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("pagehide", persist);

    const storedPosition = currentKey ? positions.get(currentKey) : undefined;
    if (storedPosition) scheduleRestore(storedPosition, false, true);
    else if (window.location.hash) scheduleRestore(undefined, true);
    else remember();

    return () => {
      ++restoreGeneration;
      remember(true);
      if (captureFrame !== null) window.cancelAnimationFrame(captureFrame);
      if (traversalTimer !== null) window.clearTimeout(traversalTimer);
      clearPositionRetry();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", cancelRestoreForInput);
      window.removeEventListener("touchstart", cancelRestoreForInput);
      window.removeEventListener("pointerdown", cancelRestoreForInput);
      window.removeEventListener("keydown", cancelRestoreForInput);
      window.removeEventListener("pushState", onPushState);
      window.removeEventListener("replaceState", onReplaceState);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("pagehide", persist);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  return null;
}
