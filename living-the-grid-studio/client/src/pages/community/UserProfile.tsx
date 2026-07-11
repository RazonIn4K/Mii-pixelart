import { useCallback, useEffect, useState } from "react";
import { CalendarDays, UserPlus, Users } from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CreationCard } from "@/components/community/CreationCard";
import { CommunityEmpty, CommunityError, CommunityLoading } from "@/components/community/CommunityState";
import { IslandAvatar } from "@/components/community/IslandAvatar";
import { ReportDialog } from "@/components/community/ReportDialog";
import { CommunityShell } from "@/components/layout/CommunityShell";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { communityApi, jsonBody, messageFromError, queryString } from "@/lib/community/api";
import { formatCommunityDate, formatCount } from "@/lib/community/format";
import type { CommunityUser, CreationSummary } from "@/lib/community/types";

interface ProfileResult {
  user: CommunityUser;
  creations: CreationSummary[];
}

export default function UserProfile() {
  const { username = "" } = useParams<{ username: string }>();
  const { user: viewer } = useAuth();
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  useDocumentTitle(profile?.user.displayName ?? `@${username}`);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, creations] = await Promise.all([
        communityApi<ProfileResult>(`/api/users/${encodeURIComponent(username)}`),
        communityApi<CreationSummary[]>(`/api/users/${encodeURIComponent(username)}/creations${queryString({ limit: 24 })}`),
      ]);
      setProfile({ user: result.data.user, creations: creations.data });
      setCursor(creations.meta?.nextCursor ?? null);
      setFollowing(Boolean(result.data.user.isFollowing));
      setError(null);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!cursor || !profile) return;
    setLoadingMore(true);
    try {
      const result = await communityApi<CreationSummary[]>(`/api/users/${encodeURIComponent(username)}/creations${queryString({ limit: 24, cursor })}`);
      setProfile((current) => current ? { ...current, creations: [...current.creations, ...result.data] } : current);
      setCursor(result.meta?.nextCursor ?? null);
    } catch (loadError) {
      toast.error(messageFromError(loadError));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleFollow = async () => {
    if (!profile) return;
    if (!viewer) {
      toast.info("Sign in when you want to follow creators.");
      return;
    }
    const next = !following;
    setFollowing(next);
    setProfile((current) => current ? {
      ...current,
      user: { ...current.user, followerCount: Math.max(0, (current.user.followerCount ?? 0) + (next ? 1 : -1)) },
    } : current);
    try {
      await communityApi(`/api/users/${encodeURIComponent(username)}/follow`, {
        method: next ? "POST" : "DELETE",
        body: jsonBody({}),
      });
    } catch (followError) {
      setFollowing(!next);
      toast.error(messageFromError(followError));
      void load();
    }
  };

  return (
    <CommunityShell>
      <div className="container py-12 sm:py-16">
        {loading ? <CommunityLoading label="Visiting this island…" /> : error || !profile ? <CommunityError message={error ?? "Profile not found"} retry={() => void load()} /> : (
          <>
            <section className="community-profile-header">
              <IslandAvatar seed={profile.user.avatarSeed} label={`${profile.user.displayName}'s generated avatar`} className="h-24 w-24 sm:h-32 sm:w-32" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <p className="island-kicker">Creator profile</p>
                    <h1 className="mt-2 break-words text-4xl font-black tracking-[-0.045em] text-[var(--island-ink)]">{profile.user.displayName}</h1>
                    <p className="mt-1 font-mono text-sm font-bold text-[var(--island-ink)]/50">@{profile.user.username}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {viewer?.id === profile.user.id ? (
                      <Button asChild variant="outline" className="rounded-full"><Link href="/me/settings">Edit profile</Link></Button>
                    ) : (
                      <>
                        <Button type="button" variant={following ? "outline" : "default"} className="rounded-full" onClick={toggleFollow}>
                          <UserPlus /> {following ? "Following" : "Follow"}
                        </Button>
                        <ReportDialog targetType="user" targetId={profile.user.id} />
                      </>
                    )}
                  </div>
                </div>
                {profile.user.bio ? <p className="mt-5 max-w-2xl whitespace-pre-line text-sm font-medium leading-6 text-[var(--island-ink)]/65">{profile.user.bio}</p> : null}
                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-[var(--island-ink)]/55">
                  <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> {formatCount(profile.user.followerCount)} followers</span>
                  <span>{formatCount(profile.user.followingCount)} following</span>
                  <span>{formatCount(profile.user.creationCount ?? profile.creations.length)} creations</span>
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> Joined {formatCommunityDate(profile.user.createdAt)}</span>
                </div>
              </div>
            </section>

            <section className="mt-14">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div><p className="island-kicker">Public workshop</p><h2 className="mt-2 text-2xl font-black">Shared creations</h2></div>
              </div>
              {profile.creations.length ? (
                <>
                  <div className="community-grid">{profile.creations.map((creation) => <CreationCard key={creation.id} creation={creation} />)}</div>
                  {cursor ? <div className="mt-10 text-center"><Button type="button" variant="outline" className="rounded-full" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more creations"}</Button></div> : null}
                </>
              ) : (
                <CommunityEmpty title="Nothing shared yet" message="Private drafts and unlisted creations never appear on a public profile." />
              )}
            </section>
          </>
        )}
      </div>
    </CommunityShell>
  );
}
