import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, UserPlus, Users } from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CreationCard } from "@/components/community/CreationCard";
import {
  CommunityFilterRail,
  CommunitySearchBar,
  type CommunityTagOption,
} from "@/components/community/CommunityDiscoveryControls";
import {
  CommunityEmpty,
  CommunityError,
  CommunityLoading,
} from "@/components/community/CommunityState";
import { IslandAvatar } from "@/components/community/IslandAvatar";
import { ReportDialog } from "@/components/community/ReportDialog";
import { CommunityShell } from "@/components/layout/CommunityShell";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  communityApi,
  jsonBody,
  messageFromError,
  queryString,
} from "@/lib/community/api";
import { formatCommunityDate, formatCount } from "@/lib/community/format";
import { ensureCommunityMutationReady } from "@/lib/community/onboarding";
import type { CommunityUser, CreationSummary } from "@/lib/community/types";

interface ProfileResult {
  user: CommunityUser;
  creations: CreationSummary[];
}

interface ProfileFilters {
  query: string;
  tag: string | null;
}

function currentProfileFilters(): ProfileFilters {
  if (typeof window === "undefined") return { query: "", tag: null };
  const params = new URLSearchParams(window.location.search);
  return {
    query: params.get("q")?.trim().slice(0, 120) ?? "",
    tag: params.get("tag")?.trim().toLowerCase().slice(0, 40) || null,
  };
}

function profileHref(username: string, filters: ProfileFilters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.tag) params.set("tag", filters.tag);
  const query = params.toString();
  const path = `/u/${encodeURIComponent(username)}`;
  return query ? `${path}?${query}` : path;
}

export default function UserProfile() {
  const { username = "" } = useParams<{ username: string }>();
  const [, navigate] = useLocation();
  const { user: viewer } = useAuth();
  const [initialFilters] = useState<ProfileFilters>(currentProfileFilters);
  const [profileQuery, setProfileQuery] = useState(initialFilters.query);
  const [profileTag, setProfileTag] = useState<string | null>(
    initialFilters.tag,
  );
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const loadRequestRef = useRef(0);
  const profileDescription = error
    ? "This community profile is unavailable."
    : profile
      ? profile.user.bio?.trim() ||
        `See ${profile.user.displayName}'s public Island Workshop creations.`
      : undefined;
  useDocumentTitle(
    error
      ? "Profile unavailable"
      : (profile?.user.displayName ?? `@${username}`),
    profileDescription,
    {
      canonicalPath: `/u/${encodeURIComponent(
        (profile?.user.username ?? username).toLowerCase(),
      )}`,
      fullTitle: profile
        ? `${profile.user.displayName} (@${profile.user.username}) · Tomodachi`
        : undefined,
      noindex: error ? true : profile ? false : null,
      ogType: "profile",
    },
  );

  const applyFilters = useCallback(
    (filters: ProfileFilters) => {
      const normalized: ProfileFilters = {
        query: filters.query.trim().slice(0, 120),
        tag: filters.tag?.trim().toLowerCase().slice(0, 40) || null,
      };
      setProfileQuery(normalized.query);
      setProfileTag(normalized.tag);
      navigate(profileHref(username, normalized));
    },
    [navigate, username],
  );

  const load = useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoading(true);
    setFollowPending(false);
    try {
      const [result, creations] = await Promise.all([
        communityApi<ProfileResult>(
          `/api/users/${encodeURIComponent(username)}`,
        ),
        communityApi<CreationSummary[]>(
          `/api/users/${encodeURIComponent(username)}/creations${queryString({ limit: 24 })}`,
        ),
      ]);
      if (loadRequestRef.current !== requestId) return;
      setProfile({ user: result.data.user, creations: creations.data });
      setCursor(creations.meta?.nextCursor ?? null);
      setFollowing(Boolean(result.data.user.isFollowing));
      setError(null);
    } catch (loadError) {
      if (loadRequestRef.current !== requestId) return;
      setError(messageFromError(loadError));
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    const filters = currentProfileFilters();
    setProfileQuery(filters.query);
    setProfileTag(filters.tag);
    setProfile(null);
    setCursor(null);
    setError(null);
    void load();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [load, username]);

  useEffect(() => {
    const syncHistory = () => {
      if (window.location.pathname !== `/u/${encodeURIComponent(username)}`)
        return;
      const next = currentProfileFilters();
      setProfileQuery(next.query);
      setProfileTag(next.tag);
    };
    window.addEventListener("popstate", syncHistory);
    return () => window.removeEventListener("popstate", syncHistory);
  }, [username]);

  const profileTags = useMemo<CommunityTagOption[]>(() => {
    const unique = new Set(
      profile?.creations.flatMap((creation) => creation.tags) ?? [],
    );
    return Array.from(unique)
      .sort((left, right) => left.localeCompare(right))
      .map((tag) => ({ label: tag, slug: tag }));
  }, [profile?.creations]);

  const filteredCreations = useMemo(() => {
    if (!profile) return [];
    const normalizedQuery = profileQuery.toLocaleLowerCase();
    return profile.creations.filter((creation) => {
      if (profileTag && !creation.tags.includes(profileTag)) return false;
      if (!normalizedQuery) return true;
      return [creation.title, creation.description ?? "", ...creation.tags]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [profile, profileQuery, profileTag]);

  const loadMore = async () => {
    if (!cursor || !profile) return;
    const requestId = loadRequestRef.current;
    setLoadingMore(true);
    try {
      const result = await communityApi<CreationSummary[]>(
        `/api/users/${encodeURIComponent(username)}/creations${queryString({ limit: 24, cursor })}`,
      );
      if (loadRequestRef.current !== requestId) return;
      setProfile((current) =>
        current
          ? { ...current, creations: [...current.creations, ...result.data] }
          : current,
      );
      setCursor(result.meta?.nextCursor ?? null);
    } catch (loadError) {
      if (loadRequestRef.current === requestId)
        toast.error(messageFromError(loadError));
    } finally {
      if (loadRequestRef.current === requestId) setLoadingMore(false);
    }
  };

  const toggleFollow = async () => {
    if (!profile) return;
    if (!viewer) {
      toast.info("Sign in when you want to follow creators.");
      return;
    }
    if (!ensureCommunityMutationReady(viewer)) return;
    const requestId = loadRequestRef.current;
    const profileId = profile.user.id;
    const previousFollowerCount = profile.user.followerCount ?? 0;
    const next = !following;
    setFollowPending(true);
    setFollowing(next);
    setProfile((current) =>
      current
        ? {
            ...current,
            user: {
              ...current.user,
              followerCount: Math.max(
                0,
                (current.user.followerCount ?? 0) + (next ? 1 : -1),
              ),
            },
          }
        : current,
    );
    try {
      await communityApi(`/api/users/${encodeURIComponent(username)}/follow`, {
        method: next ? "POST" : "DELETE",
        body: jsonBody({}),
      });
    } catch (followError) {
      if (loadRequestRef.current === requestId) {
        setFollowing(!next);
        setProfile((current) =>
          current?.user.id === profileId
            ? {
                ...current,
                user: {
                  ...current.user,
                  followerCount: previousFollowerCount,
                },
              }
            : current,
        );
        toast.error(messageFromError(followError));
      }
    } finally {
      if (loadRequestRef.current === requestId) setFollowPending(false);
    }
  };

  return (
    <CommunityShell>
      <div className="container py-12 sm:py-16">
        {loading ? (
          <CommunityLoading label="Visiting this island…" />
        ) : error || !profile ? (
          <CommunityError
            message={error ?? "Profile not found"}
            retry={() => void load()}
          />
        ) : (
          <>
            <section className="community-profile-header">
              <IslandAvatar
                seed={profile.user.avatarSeed}
                label={`${profile.user.displayName}'s generated avatar`}
                className="h-24 w-24 sm:h-32 sm:w-32"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <p className="island-kicker">Creator profile</p>
                    <h1 className="mt-2 break-words text-4xl font-black tracking-[-0.045em] text-[var(--island-ink)]">
                      {profile.user.displayName}
                    </h1>
                    <p className="mt-1 font-mono text-sm font-bold text-[var(--island-ink)]/50">
                      @{profile.user.username}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {viewer?.id === profile.user.id ? (
                      <Button
                        asChild
                        variant="outline"
                        className="rounded-full"
                      >
                        <Link href="/me/settings">Edit profile</Link>
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant={following ? "outline" : "default"}
                          className="rounded-full"
                          disabled={followPending}
                          onClick={toggleFollow}
                        >
                          <UserPlus /> {following ? "Following" : "Follow"}
                        </Button>
                        <ReportDialog
                          targetType="user"
                          targetId={profile.user.id}
                        />
                      </>
                    )}
                  </div>
                </div>
                {profile.user.bio ? (
                  <p className="mt-5 max-w-2xl whitespace-pre-line text-sm font-medium leading-6 text-[var(--island-ink)]/65">
                    {profile.user.bio}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-[var(--island-ink)]/55">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-4 w-4" />{" "}
                    {formatCount(profile.user.followerCount)} followers
                  </span>
                  <span>
                    {formatCount(profile.user.followingCount)} following
                  </span>
                  <span>
                    {formatCount(
                      profile.user.creationCount ?? profile.creations.length,
                    )}{" "}
                    creations
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" /> Joined{" "}
                    {formatCommunityDate(profile.user.createdAt)}
                  </span>
                </div>
              </div>
            </section>

            <section className="mt-14">
              <div className="mb-6">
                <p className="island-kicker">Public workshop</p>
                <h2 className="mt-2 text-2xl font-black">Shared creations</h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold text-[var(--island-ink)]/55">
                  Search and filter the creations currently loaded from this
                  maker&apos;s public workshop.
                </p>
              </div>
              {profile.creations.length ? (
                <>
                  <CommunitySearchBar
                    label={`Search ${profile.user.displayName}'s creations`}
                    placeholder={`Search ${profile.user.displayName}'s titles and tags…`}
                    query={profileQuery}
                    onSubmit={(query) =>
                      applyFilters({ query, tag: profileTag })
                    }
                  />
                  <div className="mt-6">
                    <CommunityFilterRail
                      activeTag={profileTag}
                      filterName="profile creation"
                      onClear={() => applyFilters({ query: "", tag: null })}
                      onQueryClear={() =>
                        applyFilters({ query: "", tag: profileTag })
                      }
                      onTagChange={(tag) =>
                        applyFilters({ query: profileQuery, tag })
                      }
                      query={profileQuery}
                      resultLabel={`${filteredCreations.length} of ${profile.creations.length} loaded creations`}
                      tags={profileTags}
                    />
                  </div>
                  {filteredCreations.length ? (
                    <div className="community-grid mt-8">
                      {filteredCreations.map((creation) => (
                        <CreationCard
                          key={creation.id}
                          creation={creation}
                          onTag={(tag) =>
                            applyFilters({ query: profileQuery, tag })
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-8">
                      <CommunityEmpty
                        title="No loaded creations match"
                        message="Try another title or tag, or clear the profile filters."
                        action={
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              applyFilters({ query: "", tag: null })
                            }
                          >
                            Clear filters
                          </Button>
                        }
                      />
                    </div>
                  )}
                  {cursor ? (
                    <div className="mt-10 text-center">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        disabled={loadingMore}
                        onClick={() => void loadMore()}
                      >
                        {loadingMore
                          ? "Loading…"
                          : "Load more from this workshop"}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <CommunityEmpty
                  title="Nothing shared yet"
                  message="Private drafts and unlisted creations never appear on a public profile."
                />
              )}
            </section>
          </>
        )}
      </div>
    </CommunityShell>
  );
}
