import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Search as SearchIcon } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreationCard } from "@/components/community/CreationCard";
import { CommunityEmpty, CommunityError, CommunityLoading } from "@/components/community/CommunityState";
import { CommunityPageIntro, CommunityShell } from "@/components/layout/CommunityShell";
import { communityApi, messageFromError, queryString } from "@/lib/community/api";
import type { CreationSummary } from "@/lib/community/types";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

function currentQuery(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q")?.slice(0, 120) ?? "";
}

export default function Search() {
  useDocumentTitle("Search community", undefined, { noindex: true });
  const [location, navigate] = useLocation();
  const searchParams = useSearch();
  const [query, setQuery] = useState(currentQuery);
  const [submittedQuery, setSubmittedQuery] = useState(currentQuery);
  const [items, setItems] = useState<CreationSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestSearchRequest = useRef(0);

  const search = useCallback(async (value: string, nextCursor?: string) => {
    const requestNumber = latestSearchRequest.current + 1;
    latestSearchRequest.current = requestNumber;
    const isLatestRequest = () => latestSearchRequest.current === requestNumber;
    const normalized = value.trim();
    if (!normalized) {
      setItems([]);
      setCursor(null);
      setError(null);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (nextCursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setLoadingMore(false);
    }
    try {
      const result = await communityApi<CreationSummary[]>(`/api/search${queryString({ q: normalized, limit: 24, cursor: nextCursor })}`);
      if (!isLatestRequest()) return;
      setItems((current) => nextCursor ? [...current, ...result.data] : result.data);
      setCursor(result.meta?.nextCursor ?? null);
      setError(null);
    } catch (searchError) {
      if (!isLatestRequest()) return;
      setError(messageFromError(searchError));
    } finally {
      if (!isLatestRequest()) return;
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const syncFromUrl = useCallback(() => {
    const next = currentQuery();
    setQuery(next);
    setSubmittedQuery(next);
    void search(next);
  }, [search]);

  useEffect(() => {
    syncFromUrl();
  }, [location, searchParams, syncFromUrl]);

  useEffect(() => {
    const syncSearchHistory = () => {
      if (window.location.pathname === "/search") syncFromUrl();
    };
    window.addEventListener("popstate", syncSearchHistory);
    return () => window.removeEventListener("popstate", syncSearchHistory);
  }, [syncFromUrl]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = query.trim();
    setQuery(next);
    if (next === currentQuery()) {
      setSubmittedQuery(next);
      void search(next);
      return;
    }
    navigate(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
  };

  return (
    <CommunityShell>
      <section className="community-hero py-14 sm:py-20">
        <div className="container">
          <CommunityPageIntro eyebrow="Search the workshop" title="Look for a spark." description="Search public creation titles, descriptions, creators, and community-curated tags." />
          <form onSubmit={submit} role="search" aria-label="Search public creations" className="mt-8 flex max-w-2xl gap-2 rounded-2xl border-2 border-[var(--island-ink)] bg-white p-2 shadow-[5px_5px_0_var(--island-ink)]">
            <label htmlFor="community-search" className="sr-only">Search creations</label>
            <Input id="community-search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder="Try a color, character type, or creator…" className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0" />
            <Button type="submit" aria-label="Search community creations" className="h-11 rounded-xl"><SearchIcon /> <span className="hidden sm:inline">Search</span></Button>
          </form>
        </div>
      </section>
      <section className="container py-12">
        {loading ? <CommunityLoading label={`Searching for “${submittedQuery}”…`} /> : error ? <CommunityError message={error} retry={() => void search(submittedQuery)} /> : !submittedQuery ? (
          <CommunityEmpty
            title="What are you looking for?"
            message="Search for design ideas without revealing any private or unlisted projects."
            icon={SearchIcon}
            image={{
              alt: "An original pixel-art island map, magnifying glass, color swatches, and tiny workshop lantern robot ready for a search",
              height: 800,
              src: "/community-search-empty.webp",
              width: 1200,
            }}
          />
        ) : items.length === 0 ? (
          <CommunityEmpty
            title="No public creations matched"
            message="Try a shorter phrase, a different tag, or browse the newest creations."
            icon={SearchIcon}
            image={{
              alt: "An original pixel-art island map and magnifying glass waiting for a different search",
              height: 800,
              src: "/community-search-empty.webp",
              width: 1200,
            }}
          />
        ) : (
          <>
            <p className="mb-6 text-sm font-bold text-[var(--island-muted-ink)]">Results for “{submittedQuery}”</p>
            <div className="community-grid">{items.map((creation) => <CreationCard key={creation.id} creation={creation} />)}</div>
            {cursor ? (
              <div className="mt-10 text-center">
                <Button type="button" variant="outline" className="rounded-full" disabled={loadingMore} onClick={() => void search(submittedQuery, cursor)}>
                  {loadingMore ? "Loading…" : "Load more results"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </CommunityShell>
  );
}
