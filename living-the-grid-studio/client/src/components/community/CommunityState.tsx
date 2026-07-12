import type { LucideIcon } from "lucide-react";
import { AlertCircle, CloudOff, LoaderCircle, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { COMMUNITY_SERVICE_UNAVAILABLE_MESSAGE } from "@/lib/community/api";

export function CommunityLoading({
  label = "Loading the island…",
}: {
  label?: string;
}) {
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
  const deploymentUnavailable =
    message === COMMUNITY_SERVICE_UNAVAILABLE_MESSAGE;
  const offline =
    !navigator.onLine ||
    message.toLowerCase().includes("unreachable") ||
    deploymentUnavailable;
  const Icon = offline ? CloudOff : AlertCircle;
  return (
    <div className="community-state" role="alert">
      <Icon className="h-7 w-7 text-primary" />
      <div>
        <h2 className="font-black text-[var(--island-ink)]">
          {deploymentUnavailable
            ? "Community features are not connected here yet"
            : "Community unavailable"}
        </h2>
        <p className="mt-1 max-w-md text-sm text-[var(--island-ink)]/60">
          {message}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {deploymentUnavailable ? (
          <Button asChild>
            <Link href="/studio">Use Studio locally</Link>
          </Button>
        ) : null}
        {retry ? (
          <Button type="button" variant="outline" onClick={retry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function CommunityEmpty({
  title,
  message,
  icon: Icon = Sparkles,
  action,
  image = {
    alt: "A cozy empty pixel workshop waiting for a new creation",
    height: 800,
    src: "/community-empty-state.webp",
    width: 1200,
  },
}: {
  title: string;
  message: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  image?: {
    alt: string;
    height: number;
    src: string;
    width: number;
  };
}) {
  return (
    <div className="community-state">
      <img
        src={image.src}
        alt={image.alt}
        className="mb-2 w-full max-w-xs rounded-2xl border-2 border-[var(--island-ink)] object-cover shadow-[4px_4px_0_var(--island-ink)]"
        width={image.width}
        height={image.height}
        loading="lazy"
        decoding="async"
      />
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[var(--island-ink)] bg-[var(--island-yellow)] shadow-[4px_4px_0_var(--island-ink)]">
        <Icon className="h-6 w-6 text-[var(--island-ink)]" />
      </span>
      <div>
        <p className="font-black text-[var(--island-ink)]">{title}</p>
        <p className="mt-1 max-w-md text-sm text-[var(--island-ink)]/60">
          {message}
        </p>
      </div>
      {action}
    </div>
  );
}
