import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  connectToastRuntime,
  onToastRuntimeRequested,
  restoreNavigationToast,
  type ToastKind,
} from "@/lib/toast";

const TOAST_RUNTIME_FALLBACK_DELAY_MS = 8_000;
const FALLBACK_TOAST_DURATION_MS = 8_000;

interface FallbackNotice {
  id: string;
  kind: ToastKind;
  message: string;
}

function FallbackToastRuntime() {
  const [notices, setNotices] = useState<FallbackNotice[]>([]);
  const timers = useRef(new Map<string, number>());
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = `fallback-toast-${++nextId.current}`;
      setNotices((current) => [...current, { id, kind, message }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), FALLBACK_TOAST_DURATION_MS),
      );
      return id;
    },
    [dismiss],
  );

  useEffect(
    () =>
      connectToastRuntime({
        success: (message) => show("success", message),
        error: (message) => show("error", message),
        info: (message) => show("info", message),
      }),
    [show],
  );

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    },
    [],
  );

  return (
    <section
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] ml-auto flex max-w-sm flex-col gap-2"
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          role={notice.kind === "error" ? "alert" : "status"}
          aria-atomic="true"
          className="pointer-events-auto flex items-start gap-3 rounded-xl border-2 border-[var(--ink)] bg-[var(--paper)] p-4 text-sm font-semibold text-[var(--ink)] shadow-[4px_4px_0_var(--ink)]"
        >
          <span className="min-w-0 flex-1">{notice.message}</span>
          <button
            type="button"
            className="rounded px-1 font-black"
            aria-label="Dismiss notification"
            onClick={() => dismiss(notice.id)}
          >
            ×
          </button>
        </div>
      ))}
    </section>
  );
}

export function DeferredToaster() {
  const [shouldLoad, setShouldLoad] = useState(false);
  const [runtimeComponent, setRuntimeComponent] =
    useState<ComponentType | null>(null);
  const [runtimeLoadFailed, setRuntimeLoadFailed] = useState(false);

  useEffect(() => {
    if (shouldLoad) return;

    restoreNavigationToast();
    const reveal = () => setShouldLoad(true);
    const stopListeningForToast = onToastRuntimeRequested(reveal);
    window.addEventListener("pointerdown", reveal, {
      capture: true,
      once: true,
    });
    window.addEventListener("keydown", reveal, { capture: true, once: true });

    const fallbackHandle = window.setTimeout(
      reveal,
      TOAST_RUNTIME_FALLBACK_DELAY_MS,
    );

    return () => {
      stopListeningForToast();
      window.removeEventListener("pointerdown", reveal, { capture: true });
      window.removeEventListener("keydown", reveal, { capture: true });
      window.clearTimeout(fallbackHandle);
    };
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad || runtimeComponent || runtimeLoadFailed) return;

    let active = true;
    void import("@/components/RuntimeToaster")
      .then(({ default: RuntimeToaster }) => {
        if (active) setRuntimeComponent(() => RuntimeToaster);
      })
      .catch(() => {
        if (active) setRuntimeLoadFailed(true);
      });

    return () => {
      active = false;
    };
  }, [runtimeComponent, runtimeLoadFailed, shouldLoad]);

  if (!shouldLoad) return null;
  if (runtimeLoadFailed) return <FallbackToastRuntime />;
  if (!runtimeComponent) return null;
  const RuntimeToaster = runtimeComponent;
  return <RuntimeToaster />;
}
