import React from "react";

/**
 * Paint the useful Studio start state while the full editor route downloads.
 * Keep this component dependency-free: it is part of the initial application
 * bundle and must stay cheaper than the editor it is standing in for.
 */
export function StudioStartShell() {
  return (
    <div
      className="flex min-h-svh min-w-0 flex-col bg-background"
      aria-busy="true"
    >
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
        <a
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-black"
        >
          Home
        </a>
        <span className="red-dot-sm shrink-0" aria-hidden="true" />
        <span className="truncate text-sm font-black tracking-wide">
          Tomodachi Studio
        </span>
      </header>

      <main
        id="main-content"
        className="flex min-h-[calc(100svh-4rem)] flex-1 items-center justify-center bg-[linear-gradient(to_right,hsl(var(--border)/0.32)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.32)_1px,transparent_1px)] bg-[size:22px_22px] px-4 py-8"
      >
        <section
          className="w-full max-w-2xl rounded-[1.5rem] border border-border bg-background/95 p-5 text-center shadow-lg backdrop-blur sm:p-8"
          aria-labelledby="studio-loading-title"
        >
          <div
            className="mx-auto mb-4 grid h-24 w-24 place-items-center rounded-2xl border border-border bg-[var(--island-paper)] text-4xl shadow-sm sm:h-28 sm:w-28"
            aria-hidden="true"
          >
            <span className="flex items-end gap-1">
              <span className="h-5 w-3 rounded-full bg-[var(--island-coral)]" />
              <span className="h-8 w-3 rounded-full bg-[var(--island-yellow)]" />
              <span className="h-6 w-3 rounded-full bg-[var(--island-mint)]" />
            </span>
          </div>
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-primary">
            New local project
          </p>
          <h1
            id="studio-loading-title"
            className="mt-2 text-3xl font-black tracking-[-0.035em]"
          >
            What would you like to make?
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-5 text-muted-foreground">
            Turn an image into a paintable guide, begin with a transparent
            256×256 game canvas, or choose an original starter design.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-3" aria-hidden="true">
            {["Upload an image", "Start blank", "Browse starters"].map(
              (label) => (
                <span
                  key={label}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold text-muted-foreground"
                >
                  {label}
                </span>
              ),
            )}
          </div>
          <p
            className="mt-5 text-xs font-semibold text-muted-foreground"
            role="status"
          >
            Opening the private, browser-first tools…
          </p>
        </section>
      </main>
    </div>
  );
}
