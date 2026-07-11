import { useCallback, useEffect, useState } from "react";
import { Flame, Plus, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CreationCard } from "@/components/community/CreationCard";
import { CommunityEmpty, CommunityError, CommunityLoading } from "@/components/community/CommunityState";
import { CommunityPageIntro, CommunityShell } from "@/components/layout/CommunityShell";
import { useAuth } from "@/contexts/AuthContext";
import { communityApi, jsonBody, messageFromError, queryString } from "@/lib/community/api";
import type { CreationSummary } from "@/lib/community/types";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

type Feed = "recent" | "popular";

export default function Discover() {
  useDocumentTitle("Discover", "Browse original pixel guides shared by the Tomodachi community.");
  const { user } = useAuth();
  const [feed, setFeed] = useState<Feed>("recent");
  const [items, setItems] = useState<CreationSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextCursor?: string) => {
    nextCursor ? setLoadingMore(true) : setLoading(true);
    try {
      const result = await communityApi<CreationSummary[]>(
        `/api/discover/${feed}${queryString({ cursor: nextCursor, limit: 24 })}`,
      );
      setItems((current) => nextCursor ? [...current, ...result.data] : result.data);
      setCursor(result.meta?.nextCursor ?? null);
      setError(null);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [feed]);

  useEffect(() => { void load(); }, [load]);

  const like = async (creation: CreationSummary) => {
    if (!user) {
      toast.info("Sign in when you want to like community creations.");
      return;
    }
    const nextLiked = !creation.isLiked;
    setItems((current) => current.map((item) => item.id === creation.id
      ? { ...item, isLiked: nextLiked, likeCount: Math.max(0, item.likeCount + (nextLiked ? 1 : -1)) }
      : item));
    try {
      await communityApi(`/api/creations/${creation.id}/like`, {
        method: nextLiked ? "POST" : "DELETE",
        body: jsonBody({}),
      });
    } catch (likeError) {
      setItems((current) => current.map((item) => item.id === creation.id ? creation : item));
      toast.error(messageFromError(likeError));
    }
  };

  return (
    <CommunityShell>
      <section className="community-hero py-14 sm:py-20">
        <div className="container">
          <CommunityPageIntro
            eyebrow="Community gallery"
            title="Find your next pixel idea."
            description="Browse original fan-made grids, save inspiration, and share your own work when it feels ready. Private drafts never appear here."
            action={<Button asChild className="island-button rounded-full"><Link href="/studio"><Plus /> Create something</Link></Button>}
          />
        </div>
      </section>

      <section className="container py-10 sm:py-14">
        <div className="mb-8 flex flex-wrap items-center gap-2" role="group" aria-label="Choose a discovery feed">
          <Button type="button" variant={feed === "recent" ? "default" : "outline"} className="rounded-full" onClick={() => setFeed("recent")}>
            <Sparkles /> New arrivals
          </Button>
          <Button type="button" variant={feed === "popular" ? "default" : "outline"} className="rounded-full" onClick={() => setFeed("popular")}>
            <Flame /> Popular now
          </Button>
        </div>

        {loading ? <CommunityLoading /> : error ? <CommunityError message={error} retry={() => void load()} /> : items.length === 0 ? (
          <CommunityEmpty title="The gallery is ready for its first creation" message="Public creations will appear here after their owners review and publish them." action={<Button asChild><Link href="/studio">Open Studio</Link></Button>} />
        ) : (
          <>
            <div className="community-grid">
              {items.map((creation) => <CreationCard key={creation.id} creation={creation} onLike={like} />)}
            </div>
            {cursor ? (
              <div className="mt-10 text-center">
                <Button type="button" variant="outline" className="rounded-full" disabled={loadingMore} onClick={() => void load(cursor)}>
                  {loadingMore ? "Loading…" : "Load more creations"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </CommunityShell>
  );
}
