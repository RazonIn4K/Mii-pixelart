import { useCallback, useEffect, useRef, useState } from "react";
import { Dices, Plus } from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CreationCard } from "@/components/community/CreationCard";
import {
  CommunityFilterRail,
  CommunitySearchBar,
  type CommunityFeed,
  type CommunityTagOption,
} from "@/components/community/CommunityDiscoveryControls";
import {
  CommunityEmpty,
  CommunityError,
  CommunityLoading,
} from "@/components/community/CommunityState";
import { IslandAvatar } from "@/components/community/IslandAvatar";
import {
  CommunityPageIntro,
  CommunityShell,
} from "@/components/layout/CommunityShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  communityApi,
  jsonBody,
  messageFromError,
  queryString,
} from "@/lib/community/api";
import { ensureCommunityMutationReady } from "@/lib/community/onboarding";
import type { CreationSummary } from "@/lib/community/types";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

interface DiscoveryState {
  feed: CommunityFeed;
  query: string;
  tag: string | null;
}

interface TagResult {
  description?: string;
  name: string;
  slug: string;
}

function currentDiscoveryState(): DiscoveryState {
  if (typeof window === "undefined")
    return { feed: "recent", query: "", tag: null };
  const params = new URLSearchParams(window.location.search);
  const query = params.get("q")?.trim().slice(0, 120) ?? "";
  const tag = params.get("tag")?.trim().toLowerCase().slice(0, 40) || null;
  return {
    feed:
      !query && !tag && params.get("feed") === "popular" ? "popular" : "recent",
    query,
    tag,
  };
}

function discoveryHref(state: DiscoveryState): string {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.tag) params.set("tag", state.tag);
  if (!state.query && !state.tag && state.feed === "popular")
    params.set("feed", "popular");
  const query = params.toString();
  return query ? `/discover?${query}` : "/discover";
}

export default function Discover() {
  useDocumentTitle(
    "Discover",
    "Browse original pixel guides shared by the Tomodachi community.",
  );
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [initialState] = useState<DiscoveryState>(currentDiscoveryState);
  const [feed, setFeed] = useState<CommunityFeed>(initialState.feed);
  const [submittedQuery, setSubmittedQuery] = useState(initialState.query);
  const [activeTag, setActiveTag] = useState<string | null>(initialState.tag);
  const [tags, setTags] = useState<CommunityTagOption[]>([]);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [items, setItems] = useState<CreationSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [surprising, setSurprising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const applyState = useCallback(
    (next: DiscoveryState) => {
      const normalized: DiscoveryState = {
        feed: next.query || next.tag ? "recent" : next.feed,
        query: next.query.trim().slice(0, 120),
        tag: next.tag?.trim().toLowerCase().slice(0, 40) || null,
      };
      setFeed(normalized.feed);
      setSubmittedQuery(normalized.query);
      setActiveTag(normalized.tag);
      navigate(discoveryHref(normalized));
    },
    [navigate],
  );

  const load = useCallback(
    async (nextCursor?: string) => {
      const requestNumber = nextCursor
        ? latestRequest.current
        : latestRequest.current + 1;
      if (!nextCursor) latestRequest.current = requestNumber;
      const isLatestRequest = () => latestRequest.current === requestNumber;
      nextCursor ? setLoadingMore(true) : setLoading(true);
      try {
        const path = submittedQuery
          ? `/api/search${queryString({ q: submittedQuery, tag: activeTag, cursor: nextCursor, limit: 24 })}`
          : activeTag
            ? `/api/tags/${encodeURIComponent(activeTag)}/creations${queryString({ cursor: nextCursor, limit: 24 })}`
            : `/api/discover/${feed}${queryString({ cursor: nextCursor, limit: 24 })}`;
        const result = await communityApi<CreationSummary[]>(path);
        if (!isLatestRequest()) return;
        setItems((current) =>
          nextCursor ? [...current, ...result.data] : result.data,
        );
        setCursor(result.meta?.nextCursor ?? null);
        setError(null);
      } catch (loadError) {
        if (!isLatestRequest()) return;
        setError(messageFromError(loadError));
      } finally {
        if (!isLatestRequest()) return;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeTag, feed, submittedQuery],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void communityApi<TagResult[]>("/api/tags")
      .then((result) => {
        setTags(
          result.data.map((tag) => ({ label: tag.name, slug: tag.slug })),
        );
        setTagsError(null);
      })
      .catch((tagError) => {
        setTags([]);
        setTagsError(messageFromError(tagError));
      });
  }, []);

  useEffect(() => {
    const syncHistory = () => {
      if (window.location.pathname !== "/discover") return;
      const next = currentDiscoveryState();
      setFeed(next.feed);
      setSubmittedQuery(next.query);
      setActiveTag(next.tag);
    };
    window.addEventListener("popstate", syncHistory);
    return () => window.removeEventListener("popstate", syncHistory);
  }, []);

  const like = async (creation: CreationSummary) => {
    if (!user) {
      toast.info("Sign in when you want to like community creations.");
      return;
    }
    if (!ensureCommunityMutationReady(user)) return;
    const nextLiked = !creation.isLiked;
    setItems((current) =>
      current.map((item) =>
        item.id === creation.id
          ? {
              ...item,
              isLiked: nextLiked,
              likeCount: Math.max(0, item.likeCount + (nextLiked ? 1 : -1)),
            }
          : item,
      ),
    );
    try {
      await communityApi(`/api/creations/${creation.id}/like`, {
        method: nextLiked ? "POST" : "DELETE",
        body: jsonBody({}),
      });
    } catch (likeError) {
      setItems((current) =>
        current.map((item) => (item.id === creation.id ? creation : item)),
      );
      toast.error(messageFromError(likeError));
    }
  };

  const clearFilters = () =>
    applyState({ feed: "recent", query: "", tag: null });
  const surpriseMe = async () => {
    setSurprising(true);
    try {
      const result = await communityApi<CreationSummary | null>(
        "/api/discover/random",
      );
      if (!result.data) {
        toast.info("No public creations are ready to explore yet.");
        return;
      }
      navigate(`/creation/${encodeURIComponent(result.data.slug)}`);
    } catch (surpriseError) {
      toast.error(messageFromError(surpriseError));
    } finally {
      setSurprising(false);
    }
  };
  const viewLabel = submittedQuery
    ? `Results for “${submittedQuery}”${activeTag ? ` in #${activeTag}` : ""}`
    : activeTag
      ? `Newest creations tagged #${activeTag}`
      : feed === "popular"
        ? "Popular creations"
        : "New arrivals";

  return (
    <CommunityShell>
      <section className="community-hero py-14 sm:py-20">
        <div className="container grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div className="min-w-0">
            <CommunityPageIntro
              eyebrow="Community gallery"
              title="Find, filter, and share your next pixel idea."
              description="Search original public grids, browse governed tags, and open the Studio when inspiration strikes. Private drafts never appear here."
            />
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild className="island-button rounded-full">
                <Link href="/studio">
                  <Plus /> Create &amp; share
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full bg-white"
                disabled={surprising}
                onClick={() => void surpriseMe()}
              >
                <Dices /> {surprising ? "Finding one…" : "Surprise me"}
              </Button>
            </div>
            <CommunitySearchBar
              className="mt-8"
              label="Search public creations"
              placeholder="Try a color, subject, tag, or creator…"
              query={submittedQuery}
              onSubmit={(query) =>
                applyState({ feed: "recent", query, tag: activeTag })
              }
            />
          </div>
          <figure className="relative overflow-hidden rounded-[2rem] border-2 border-[var(--island-ink)] bg-white shadow-[8px_8px_0_var(--island-ink)]">
            <img
              src="/island-creator-collective.webp"
              alt="Five original pixel-art creators collaborating around a colorful grid in an open-air island workshop"
              className="aspect-[3/2] w-full object-cover"
              width={1440}
              height={960}
              loading="lazy"
              decoding="async"
            />
            <figcaption className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/92 p-3 shadow-lg backdrop-blur max-[360px]:flex-col max-[360px]:items-start max-[360px]:gap-2 sm:inset-x-5 sm:bottom-5 sm:p-4">
              <div
                className="flex -space-x-2"
                role="group"
                aria-label="Examples of generated Island Workshop avatars"
              >
                {[
                  ["mira-coral", "Mira"],
                  ["sol-sunbeam", "Sol"],
                  ["jun-grid", "Jun"],
                  ["ada-mint", "Ada"],
                ].map(([seed, name]) => (
                  <IslandAvatar
                    key={seed}
                    seed={seed}
                    label={`${name}'s generated avatar`}
                    className="h-9 w-9 sm:h-11 sm:w-11"
                  />
                ))}
              </div>
              <div className="text-right max-[360px]:text-left">
                <p className="text-xs font-black text-[var(--island-ink)]">
                  A face for every maker
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[var(--island-ink)]/70">
                  Generated from a stable seed · no photo upload
                </p>
              </div>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="container py-10 sm:py-14">
        {!error ? (
          tagsError ? (
            <div className="min-w-0 rounded-[1.5rem] border-2 border-[var(--island-ink)]/12 bg-white/75 p-4 shadow-sm sm:p-5">
              <p
                className="text-sm font-black text-[var(--island-ink)]"
                aria-live="polite"
              >
                {loading
                  ? `Loading ${viewLabel.toLowerCase()}…`
                  : `${viewLabel} · ${items.length} loaded`}
              </p>
              <p
                className="mt-2 text-sm font-semibold text-[var(--island-muted-ink)]"
                role="status"
              >
                Tag filters could not be loaded. This is a temporary service
                issue, not an empty tag library.
                <span className="sr-only"> {tagsError}</span>
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  aria-pressed={
                    feed === "recent" && !submittedQuery && !activeTag
                  }
                  onClick={() =>
                    applyState({ feed: "recent", query: "", tag: null })
                  }
                >
                  Browse new
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  aria-pressed={
                    feed === "popular" && !submittedQuery && !activeTag
                  }
                  onClick={() =>
                    applyState({ feed: "popular", query: "", tag: null })
                  }
                >
                  Browse popular
                </Button>
                {submittedQuery || activeTag ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-full"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <CommunityFilterRail
              activeTag={activeTag}
              feed={feed}
              onClear={clearFilters}
              onFeedChange={(nextFeed) =>
                applyState({ feed: nextFeed, query: "", tag: null })
              }
              onQueryClear={() =>
                applyState({ feed: "recent", query: "", tag: activeTag })
              }
              onTagChange={(tag) =>
                applyState({ feed: "recent", query: submittedQuery, tag })
              }
              query={submittedQuery}
              resultLabel={
                loading
                  ? `Loading ${viewLabel.toLowerCase()}…`
                  : `${viewLabel} · ${items.length} loaded`
              }
              tags={tags}
            />
          )
        ) : null}

        <div className="mt-8">
          {loading ? (
            <CommunityLoading />
          ) : error ? (
            <CommunityError message={error} retry={() => void load()} />
          ) : items.length === 0 ? (
            <CommunityEmpty
              title={
                submittedQuery || activeTag
                  ? "No public creations matched this view"
                  : "The gallery is ready for its first creation"
              }
              message={
                submittedQuery || activeTag
                  ? "Try a shorter search, another tag, or clear the filters to return to new arrivals."
                  : "Public creations will appear here after their owners review and publish them."
              }
              action={
                submittedQuery || activeTag ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="/studio">Open Studio</Link>
                  </Button>
                )
              }
            />
          ) : (
            <>
              <div className="community-grid">
                {items.map((creation) => (
                  <CreationCard
                    key={creation.id}
                    creation={creation}
                    onLike={like}
                    onTag={(tag) =>
                      applyState({ feed: "recent", query: submittedQuery, tag })
                    }
                  />
                ))}
              </div>
              {cursor ? (
                <div className="mt-10 text-center">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    disabled={loadingMore}
                    onClick={() => void load(cursor)}
                  >
                    {loadingMore ? "Loading…" : "Load more creations"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </CommunityShell>
  );
}
