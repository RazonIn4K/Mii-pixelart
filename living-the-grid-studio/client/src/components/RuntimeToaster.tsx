import { useEffect } from "react";
import { toast as sonnerToast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { connectToastRuntime } from "@/lib/toast";

export default function RuntimeToaster() {
  useEffect(() => {
    let disconnect: (() => void) | undefined;
    // Sonner subscribes from its child effect. Flush queued notifications on
    // the next frame so its listener is definitely ready before delivery.
    const frame = window.requestAnimationFrame(() => {
      disconnect = connectToastRuntime({
        success: (message) => sonnerToast.success(message),
        error: (message) => sonnerToast.error(message),
        info: (message) => sonnerToast.info(message),
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      disconnect?.();
    };
  }, []);

  return <Toaster />;
}
