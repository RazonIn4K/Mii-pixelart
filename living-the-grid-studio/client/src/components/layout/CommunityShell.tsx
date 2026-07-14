import type { ReactNode } from "react";
import { IslandFooter } from "./IslandFooter";
import { IslandHeader } from "./IslandHeader";

export function CommunityShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--island-paper)] text-[var(--island-ink)]">
      <IslandHeader />
      <main id="main-content" className="min-h-[70vh]">{children}</main>
      <IslandFooter />
    </div>
  );
}

export function CommunityPageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div className="max-w-3xl">
        <p className="island-kicker">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.055em] text-[var(--island-ink)] sm:text-6xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-sm font-medium leading-6 text-[var(--island-muted-ink)] sm:text-base">{description}</p>
      </div>
      {action}
    </div>
  );
}
