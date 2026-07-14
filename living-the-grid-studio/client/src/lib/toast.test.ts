import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectToastRuntime,
  onToastRuntimeRequested,
  restoreNavigationToast,
  toast,
} from "./toast";

describe.sequential("toast facade", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues notifications until the runtime is ready and flushes them in order", () => {
    const requested = vi.fn();
    const stopListening = onToastRuntimeRequested(requested);

    toast.success("first");
    toast.error("second");
    toast.info("third");
    expect(requested).toHaveBeenCalledTimes(3);

    const success = vi.fn();
    const error = vi.fn();
    const info = vi.fn();
    const disconnect = connectToastRuntime({ success, error, info });
    expect(success).toHaveBeenCalledWith("first");
    expect(error).toHaveBeenCalledWith("second");
    expect(info).toHaveBeenCalledWith("third");

    disconnect();
    stopListening();
  });

  it("dispatches directly once the runtime is connected", () => {
    const error = vi.fn(() => "runtime-toast-id");
    const disconnect = connectToastRuntime({
      success: vi.fn(),
      error,
      info: vi.fn(),
    });

    expect(toast.error("ready")).toBe("runtime-toast-id");
    expect(error).toHaveBeenCalledWith("ready");
    disconnect();
  });

  it("replays a redirect notification once from session storage", () => {
    const values = new Map<string, string>();
    const sessionStorage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    };
    vi.stubGlobal("window", { sessionStorage });

    const requested = vi.fn();
    const stopListening = onToastRuntimeRequested(requested);
    toast.infoAfterNavigation("review terms");
    expect(sessionStorage.setItem).toHaveBeenCalledTimes(1);
    expect(requested).not.toHaveBeenCalled();
    stopListening();

    expect(restoreNavigationToast()).toBe(true);
    expect(restoreNavigationToast()).toBe(false);
    expect(sessionStorage.removeItem).toHaveBeenCalledOnce();

    const info = vi.fn();
    const disconnect = connectToastRuntime({
      success: vi.fn(),
      error: vi.fn(),
      info,
    });
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith("review terms");

    disconnect();
  });

  it("cancels a queued runtime request when its listener unsubscribes", async () => {
    toast.info("waiting");
    const requested = vi.fn();
    const stopListening = onToastRuntimeRequested(requested);
    stopListening();

    await Promise.resolve();
    expect(requested).not.toHaveBeenCalled();

    const disconnect = connectToastRuntime({
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    });
    disconnect();
  });
});
