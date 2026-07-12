import { useCallback, useEffect, useState } from "react";
import { EyeOff, MoreHorizontal, Plus, Settings2, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreationCard } from "@/components/community/CreationCard";
import { CommunityEmpty, CommunityError, CommunityLoading } from "@/components/community/CommunityState";
import { PublishDialog } from "@/components/community/PublishDialog";
import { RequireAuth } from "@/components/community/RequireAuth";
import { CommunityPageIntro, CommunityShell } from "@/components/layout/CommunityShell";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { communityApi, jsonBody, messageFromError, queryString } from "@/lib/community/api";
import type { CreationSummary } from "@/lib/community/types";

export default function Projects() {
  useDocumentTitle("Your projects");
  const [items, setItems] = useState<CreationSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { status, user } = useAuth();

  const load = useCallback(async (nextCursor?: string) => {
    nextCursor ? setLoadingMore(true) : setLoading(true);
    try {
      const result = await communityApi<CreationSummary[]>(`/api/creations${queryString({ owner: "me", visibility: "all", limit: 50, cursor: nextCursor })}`);
      setItems((current) => nextCursor ? [...current, ...result.data] : result.data);
      setCursor(result.meta?.nextCursor ?? null);
      setError(null);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);
  useEffect(() => {
    if (user) void load();
    else if (status === "anonymous") setLoading(false);
  }, [load, status, user]);
  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  const unpublish = async (creation: CreationSummary) => {
    try {
      const result = await communityApi<CreationSummary>(`/api/creations/${creation.id}/unpublish`, { method: "POST", body: jsonBody({}) });
      setItems((current) => current.map((item) => item.id === creation.id ? result.data : item));
      toast.success("Creation returned to a private draft");
    } catch (actionError) {
      toast.error(messageFromError(actionError));
    }
  };

  const remove = async (creation: CreationSummary) => {
    if (!window.confirm(`Delete “${creation.title}”? This cannot be undone after the account retention window.`)) return;
    try {
      await communityApi(`/api/creations/${creation.id}`, { method: "DELETE", body: jsonBody({}) });
      setItems((current) => current.filter((item) => item.id !== creation.id));
      toast.success("Project deleted");
    } catch (actionError) {
      toast.error(messageFromError(actionError));
    }
  };

  return (
    <CommunityShell>
      <RequireAuth>
        <div className="container py-12 sm:py-16">
          <CommunityPageIntro eyebrow="Cloud projects" title="Your private shelf." description="The first cloud save is always deliberate and private. Publishing remains a separate review step." action={<Button asChild className="island-button rounded-full"><Link href="/studio"><Plus /> New Studio project</Link></Button>} />
          <div className="mt-10">
            {loading ? <CommunityLoading /> : error ? <CommunityError message={error} retry={() => void load()} /> : !items.length ? (
              <CommunityEmpty title="No cloud projects yet" message="Create locally in Studio for as long as you like. Use Save to account only when you want private cloud sync." action={<Button asChild><Link href="/studio">Open Studio</Link></Button>} />
            ) : (
              <div className="community-grid">
                {items.map((creation) => (
                  <div key={creation.id} className="relative">
                    <div className="absolute left-3 top-3 z-10 flex gap-1"><Badge className="border border-black/10 bg-white/90 text-[var(--island-ink)]">{creation.visibility}</Badge><Badge variant="secondary">v{creation.revision}</Badge></div>
                    <CreationCard creation={creation} href={`/studio?cloud=${encodeURIComponent(creation.id)}`} menuOpen={selected === creation.id} onMenu={() => setSelected(selected === creation.id ? null : creation.id)} />
                    {selected === creation.id ? (
                      <div id={`project-actions-${creation.id}`} className="absolute right-3 top-12 z-20 w-48 rounded-xl border bg-white p-2 shadow-lg" aria-label={`Actions for ${creation.title}`}>
                        <Button asChild variant="ghost" className="w-full justify-start"><Link href={`/studio?cloud=${creation.id}`}>Edit in Studio</Link></Button>
                        <PublishDialog
                          creationId={creation.id}
                          initial={creation}
                          onPublished={(published) => setItems((current) => current.map((item) => item.id === published.id ? published : item))}
                          trigger={(
                            <Button type="button" variant="ghost" className="w-full justify-start">
                              {creation.status === "published" ? <Settings2 /> : <MoreHorizontal />}
                              {creation.status === "published" ? "Edit publishing" : "Review & publish"}
                            </Button>
                          )}
                        />
                        {creation.status === "published" ? (
                          <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => void unpublish(creation)}><EyeOff /> Unpublish</Button>
                        ) : null}
                        <Button type="button" variant="ghost" className="w-full justify-start text-destructive" onClick={() => void remove(creation)}><Trash2 /> Delete</Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {cursor ? (
              <div className="mt-10 text-center">
                <Button type="button" variant="outline" className="rounded-full" disabled={loadingMore} onClick={() => void load(cursor)}>
                  {loadingMore ? "Loading…" : "Load more projects"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </RequireAuth>
    </CommunityShell>
  );
}
