export type ToastKind = "success" | "error" | "info";

type ToastMessage = string;
type ToastId = string | number;
type ToastRuntime = Record<
  ToastKind,
  (message: ToastMessage) => ToastId | undefined
>;

interface QueuedToast {
  id: string;
  kind: ToastKind;
  message: ToastMessage;
}

const MAX_QUEUED_TOASTS = 50;
const NAVIGATION_TOAST_KEY = "tomodachi.pending-toast.v1";
const NAVIGATION_TOAST_TTL_MS = 60_000;
const queuedToasts: QueuedToast[] = [];
const runtimeRequestListeners = new Set<() => void>();
let runtime: ToastRuntime | null = null;
let nextToastId = 0;

function dispatch(kind: ToastKind, message: ToastMessage): ToastId | undefined {
  if (runtime) return runtime[kind](message);

  const id = `queued-toast-${++nextToastId}`;
  queuedToasts.push({ id, kind, message });
  if (queuedToasts.length > MAX_QUEUED_TOASTS) queuedToasts.shift();
  runtimeRequestListeners.forEach((listener) => listener());
  return id;
}

function sessionStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function queueForNextNavigation(kind: ToastKind, message: ToastMessage) {
  const storage = sessionStorageOrNull();
  if (!storage) return dispatch(kind, message);

  try {
    storage.setItem(
      NAVIGATION_TOAST_KEY,
      JSON.stringify({
        kind,
        message,
        expiresAt: Date.now() + NAVIGATION_TOAST_TTL_MS,
      }),
    );
    return undefined;
  } catch {
    return dispatch(kind, message);
  }
}

export const toast = {
  success: (message: ToastMessage) => dispatch("success", message),
  error: (message: ToastMessage) => dispatch("error", message),
  info: (message: ToastMessage) => dispatch("info", message),
  infoAfterNavigation: (message: ToastMessage) =>
    queueForNextNavigation("info", message),
};

export function restoreNavigationToast(): boolean {
  const storage = sessionStorageOrNull();
  if (!storage) return false;

  let serialized: string | null = null;
  try {
    serialized = storage.getItem(NAVIGATION_TOAST_KEY);
    if (serialized !== null) storage.removeItem(NAVIGATION_TOAST_KEY);
  } catch {
    return false;
  }
  if (!serialized) return false;

  try {
    const value = JSON.parse(serialized) as Partial<{
      kind: ToastKind;
      message: string;
      expiresAt: number;
    }>;
    if (
      (value.kind !== "success" &&
        value.kind !== "error" &&
        value.kind !== "info") ||
      typeof value.message !== "string" ||
      value.message.length === 0 ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= Date.now()
    ) {
      return false;
    }
    dispatch(value.kind, value.message);
    return true;
  } catch {
    return false;
  }
}

export function connectToastRuntime(nextRuntime: ToastRuntime) {
  runtime = nextRuntime;
  const pending = queuedToasts.splice(0);
  pending.forEach(({ kind, message }) => nextRuntime[kind](message));

  return () => {
    if (runtime === nextRuntime) runtime = null;
  };
}

export function onToastRuntimeRequested(listener: () => void) {
  let active = true;
  const notify = () => {
    if (active) listener();
  };
  runtimeRequestListeners.add(notify);
  if (queuedToasts.length > 0) queueMicrotask(notify);
  return () => {
    active = false;
    runtimeRequestListeners.delete(notify);
  };
}
