import type { LucideIcon } from "lucide-react";
import { AlertCircle, CloudOff, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CommunityLoading({ label = "Loading the island…" }: { label?: string }) {
  return (
    <div className="community-state" role="status" aria-live="polite">
      <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
      <p>{label}</p>
    </div>
  );
}

export function CommunityError({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const offline = !navigator.onLine || message.toLowerCase().includes("unreachable");
  const Icon = offline ? CloudOff : AlertCircle;
  return (
    <div className="community-state" role="alert">
      <Icon className="h-7 w-7 text-primary" />
      <div>
        <p className="font-black text-[var(--island-ink)]">Community unavailable</p>
        <p className="mt-1 max-w-md text-sm text-[var(--island-ink)]/60">{message}</p>
      </div>
      {retry ? (
        <Button type="button" variant="outline" onClick={retry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function CommunityEmpty({
  title,
  message,
  icon: Icon = Sparkles,
  action,
}: {
  title: string;
  message: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <div className="community-state">
      <img
        src="/community-empty-state.webp"
        alt="A cozy empty pixel workshop waiting for a new creation"
        className="mb-2 w-full max-w-xs rounded-2xl border-2 border-[var(--island-ink)] object-cover shadow-[4px_4px_0_var(--island-ink)]"
        width={1200}
        height={800}
        loading="lazy"
        decoding="async"
      />
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[var(--island-ink)] bg-[var(--island-yellow)] shadow-[4px_4px_0_var(--island-ink)]">
        <Icon className="h-6 w-6 text-[var(--island-ink)]" />
      </span>
      <div>
        <p className="font-black text-[var(--island-ink)]">{title}</p>
        <p className="mt-1 max-w-md text-sm text-[var(--island-ink)]/60">{message}</p>
      </div>
      {action}
    </div>
  );
}
