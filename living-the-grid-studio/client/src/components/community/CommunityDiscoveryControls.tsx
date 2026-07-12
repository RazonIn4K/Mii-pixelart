import { useEffect, useState, type FormEvent } from "react";
import { Flame, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type CommunityFeed = "recent" | "popular";

export interface CommunityTagOption {
  label: string;
  slug: string;
}

export function CommunitySearchBar({
  className,
  label,
  onSubmit,
  placeholder,
  query,
}: {
  className?: string;
  label: string;
  onSubmit: (query: string) => void;
  placeholder: string;
  query: string;
}) {
  const [draft, setDraft] = useState(query);

  useEffect(() => setDraft(query), [query]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(draft.trim());
  };

  return (
    <form
      role="search"
      aria-label={`${label} form`}
      onSubmit={submit}
      className={cn(
        "flex w-full max-w-2xl min-w-0 items-center gap-2 rounded-[1.35rem] border-2 border-[var(--island-ink)] bg-white p-2 shadow-[5px_5px_0_var(--island-ink)]",
        className,
      )}
    >
      <label
        htmlFor={`${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-input`}
        className="sr-only"
      >
        {label}
      </label>
      <Input
        id={`${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-input`}
        value={draft}
        onChange={(event) => setDraft(event.target.value.slice(0, 120))}
        placeholder={placeholder}
        className="h-11 min-w-0 border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <Button
        type="submit"
        className="h-11 shrink-0 rounded-xl"
        aria-label="Search shared creations"
      >
        <Search />
        <span className="hidden sm:inline">Search</span>
      </Button>
    </form>
  );
}

export function CommunityFilterRail({
  activeTag,
  feed,
  filterName = "discovery",
  onClear,
  onFeedChange,
  onQueryClear,
  onTagChange,
  query,
  resultLabel,
  tags,
}: {
  activeTag: string | null;
  feed?: CommunityFeed;
  filterName?: string;
  onClear: () => void;
  onFeedChange?: (feed: CommunityFeed) => void;
  onQueryClear: () => void;
  onTagChange: (tag: string | null) => void;
  query: string;
  resultLabel: string;
  tags: CommunityTagOption[];
}) {
  const [open, setOpen] = useState(false);
  const activeCount =
    Number(Boolean(query)) +
    Number(Boolean(activeTag)) +
    Number(feed === "popular");

  const selectFeed = (nextFeed: CommunityFeed, closeAfter = false) => {
    onFeedChange?.(nextFeed);
    if (closeAfter) setOpen(false);
  };

  const selectTag = (slug: string | null, closeAfter = false) => {
    onTagChange(slug);
    if (closeAfter) setOpen(false);
  };

  const options = (closeAfter = false) => (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
      {feed && onFeedChange ? (
        <fieldset className="min-w-0">
          <legend className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--island-ink)]/50">
            Feed
          </legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={feed === "recent" && !query && !activeTag}
              onClick={() => selectFeed("recent", closeAfter)}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-full border-2 px-3 py-2 text-sm font-black transition-colors",
                feed === "recent" && !query && !activeTag
                  ? "border-[var(--island-ink)] bg-[var(--island-yellow-soft)] text-[var(--island-ink)]"
                  : "border-[var(--island-ink)]/15 bg-white text-[var(--island-ink)]/65 hover:border-[var(--island-ink)]/45",
              )}
            >
              <Sparkles className="h-4 w-4" /> New
            </button>
            <button
              type="button"
              aria-pressed={feed === "popular" && !query && !activeTag}
              onClick={() => selectFeed("popular", closeAfter)}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-full border-2 px-3 py-2 text-sm font-black transition-colors",
                feed === "popular" && !query && !activeTag
                  ? "border-[var(--island-ink)] bg-[var(--island-coral)]/20 text-[var(--island-ink)]"
                  : "border-[var(--island-ink)]/15 bg-white text-[var(--island-ink)]/65 hover:border-[var(--island-ink)]/45",
              )}
            >
              <Flame className="h-4 w-4" /> Popular
            </button>
          </div>
        </fieldset>
      ) : null}

      <fieldset className="min-w-0">
        <legend className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--island-ink)]/50">
          Tags
        </legend>
        {tags.length ? (
          <div className="flex min-w-0 flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.slug}
                type="button"
                aria-label={`Filter by ${tag.label}`}
                aria-pressed={activeTag === tag.slug}
                onClick={() =>
                  selectTag(
                    activeTag === tag.slug ? null : tag.slug,
                    closeAfter,
                  )
                }
                className={cn(
                  "min-h-9 max-w-full rounded-full border px-3 py-1.5 text-xs font-black transition-colors",
                  activeTag === tag.slug
                    ? "border-[var(--island-ink)] bg-[var(--island-blue-soft)] text-[var(--island-ink)]"
                    : "border-[var(--island-ink)]/15 bg-white text-[var(--island-ink)]/60 hover:border-[var(--island-ink)]/45",
                )}
              >
                <span className="block truncate">#{tag.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold text-[var(--island-ink)]/50">
            Tags will appear as creations are shared.
          </p>
        )}
      </fieldset>
    </div>
  );

  return (
    <div className="min-w-0 rounded-[1.5rem] border-2 border-[var(--island-ink)]/12 bg-white/75 p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <p
          className="min-w-0 text-sm font-black text-[var(--island-ink)]"
          aria-live="polite"
        >
          {resultLabel}
        </p>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="rounded-full lg:hidden"
              aria-label={`Open ${filterName} filters`}
            >
              <SlidersHorizontal /> Filters
              {activeCount ? ` (${activeCount})` : ""}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[85svh] max-w-full overflow-hidden rounded-t-[1.75rem] border-t-2 border-[var(--island-ink)] bg-[var(--island-paper)]"
          >
            <SheetHeader>
              <SheetTitle className="text-left text-xl font-black text-[var(--island-ink)]">
                Filter creations
              </SheetTitle>
              <SheetDescription className="text-left">
                Choose a feed or tag. Your choices stay in the page URL so the
                view can be shared.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-3">
              {options(true)}
            </div>
            <SheetFooter className="border-t border-[var(--island-ink)]/10 bg-white/65 sm:flex-row">
              {activeCount ? (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={onClear}
                >
                  Clear filters
                </Button>
              ) : null}
              <SheetClose asChild>
                <Button type="button" className="rounded-full sm:ml-auto">
                  Done
                </Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      <div className="mt-4 hidden min-w-0 lg:block">{options()}</div>

      {activeCount ? (
        <div
          className="mt-4 flex min-w-0 flex-wrap items-center gap-2 border-t border-[var(--island-ink)]/10 pt-4"
          aria-label="Active filters"
        >
          <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--island-ink)]/45">
            Active
          </span>
          {query ? (
            <button
              type="button"
              onClick={onQueryClear}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--island-yellow-soft)] px-3 py-1.5 text-xs font-black text-[var(--island-ink)]"
              aria-label={`Remove search filter ${query}`}
            >
              <span className="truncate">“{query}”</span>
              <X className="h-3.5 w-3.5 shrink-0" />
            </button>
          ) : null}
          {activeTag ? (
            <button
              type="button"
              onClick={() => onTagChange(null)}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--island-blue-soft)] px-3 py-1.5 text-xs font-black text-[var(--island-ink)]"
              aria-label={`Remove tag filter ${activeTag}`}
            >
              <span className="truncate">#{activeTag}</span>
              <X className="h-3.5 w-3.5 shrink-0" />
            </button>
          ) : null}
          {feed === "popular" && !query && !activeTag ? (
            <button
              type="button"
              onClick={() => onFeedChange?.("recent")}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--island-coral)]/20 px-3 py-1.5 text-xs font-black text-[var(--island-ink)]"
              aria-label="Remove popular feed filter"
            >
              Popular
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-black text-primary underline underline-offset-4"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
