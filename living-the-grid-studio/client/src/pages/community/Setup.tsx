import { useEffect, useState, type FormEvent } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IslandAvatar } from "@/components/community/IslandAvatar";
import { AvatarRegenerationButton } from "@/components/community/AvatarRegenerationButton";
import { RequireAuth } from "@/components/community/RequireAuth";
import { CommunityShell } from "@/components/layout/CommunityShell";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  CommunityApiError,
  communityApi,
  jsonBody,
  messageFromError,
} from "@/lib/community/api";
import { hasAuthResumeDraft } from "@/lib/community/drafts";
import { normalizeUsername } from "@/lib/community/format";
import { setupCompletionReturnTo } from "@/lib/community/return-to";
import type { CommunityUser } from "@/lib/community/types";

export default function Setup() {
  useDocumentTitle("Set up your profile", undefined, { noindex: true });
  const { applyAccountUpdate, communityMutationsEnabled, user } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState(user?.username ?? "");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const reviewingUpdatedTerms = Boolean(
    user?.username && user.termsAccepted !== true,
  );
  const requiredTermsVersion =
    user?.requiredTermsVersion ?? user?.termsVersion ?? null;

  useEffect(() => {
    if (!user) return;
    setUsername(user.username ?? normalizeUsername(user.displayName));
    setDisplayName(user.displayName);
    setBio(user.bio ?? "");
  }, [user?.bio, user?.displayName, user?.username]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeUsername(username);
    if (normalized.length < 3) {
      toast.error("Choose a username with at least three letters or numbers.");
      return;
    }
    if (!displayName.trim()) {
      toast.error("Add the name you want people to see.");
      return;
    }
    if (!accepted) {
      toast.error("Confirm the age and community terms before continuing.");
      return;
    }
    if (!requiredTermsVersion) {
      toast.error(
        "The current Terms version is unavailable. Refresh and try again.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const result = await communityApi<CommunityUser>("/api/me/setup", {
        method: "POST",
        body: jsonBody({
          username: normalized,
          displayName: displayName.trim(),
          bio: bio.trim(),
          termsVersion: requiredTermsVersion,
          acceptsTerms: true,
          confirmsAge13OrOlder: true,
        }),
      });
      // Setup owns identity and Terms fields, not the avatar. Keeping this
      // patch operation-specific prevents a concurrent avatar response from
      // restoring a stale pre-setup account snapshot (or vice versa).
      applyAccountUpdate({
        id: result.data.id,
        username: result.data.username,
        displayName: result.data.displayName,
        bio: result.data.bio,
        termsAccepted: result.data.termsAccepted,
        termsVersion: result.data.termsVersion,
        requiredTermsVersion: result.data.requiredTermsVersion,
      });
      toast.success("Your island profile is ready");
      const hasResumeDraft = await hasAuthResumeDraft();
      navigate(
        setupCompletionReturnTo() ??
          (hasResumeDraft ? "/studio" : "/me/projects"),
      );
    } catch (error) {
      if (error instanceof CommunityApiError) {
        const suggestions =
          error.fields?.usernameSuggestions
            ?.split(",")
            .map((suggestion) => normalizeUsername(suggestion))
            .filter((suggestion) => suggestion.length >= 3) ?? [];
        setUsernameSuggestions(Array.from(new Set(suggestions)).slice(0, 5));
      }
      toast.error(messageFromError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CommunityShell>
      <RequireAuth>
        <div className="container py-12 sm:py-16">
          <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[280px_1fr] lg:items-start">
            <aside className="community-detail-panel text-center">
              <IslandAvatar
                seed={user?.avatarSeed ?? "new-islander"}
                imageUrl={user?.avatarUrl}
                label="Your profile picture"
                className="mx-auto h-32 w-32"
              />
              <h2 className="mt-5 text-xl font-black">Your Island avatar</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--island-ink)]/55">
                Every profile begins with an original generated avatar. You can
                try another now and optionally add a custom photo later in
                Settings.
              </p>
              {!user?.avatarUrl ? (
                <AvatarRegenerationButton className="mt-4" />
              ) : null}
            </aside>
            <form onSubmit={submit} className="community-detail-panel">
              <p className="island-kicker">
                {reviewingUpdatedTerms ? "Terms update" : "One-time setup"}
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">
                {reviewingUpdatedTerms
                  ? "Review the current community terms."
                  : "Choose your island identity."}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[var(--island-ink)]/60">
                {reviewingUpdatedTerms
                  ? "Your username stays the same. Review and accept the current Terms before returning to cloud projects and community actions."
                  : "Your email remains private. Your username, display name, bio, and profile picture are public when you publish."}
              </p>
              {!communityMutationsEnabled ? (
                <div
                  className="mt-5 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950"
                  role="status"
                >
                  <p className="font-black">Profile changes are paused</p>
                  <p className="mt-1 text-sm leading-6">
                    Your Google session is active, but this environment is in
                    read-only mode. Your form stays here; finish setup after
                    writes are restored.
                  </p>
                </div>
              ) : null}
              <div className="mt-8 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="profile-username">Username</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-2.5 font-mono text-sm text-muted-foreground">
                      @
                    </span>
                    <Input
                      id="profile-username"
                      value={username}
                      onChange={(event) => {
                        setUsername(normalizeUsername(event.target.value));
                        setUsernameSuggestions([]);
                      }}
                      className="pl-7"
                      minLength={3}
                      maxLength={24}
                      required
                      readOnly={reviewingUpdatedTerms}
                      aria-describedby="username-help username-suggestions"
                    />
                  </div>
                  <p
                    id="username-help"
                    className="text-xs text-muted-foreground"
                  >
                    3–24 lowercase letters, numbers, hyphens, or underscores.
                    Usernames cannot be changed in this release.
                  </p>
                  <div id="username-suggestions" aria-live="polite">
                    {usernameSuggestions.length ? (
                      <div className="rounded-xl border border-[var(--island-blue)]/40 bg-[var(--island-blue-soft)] p-3">
                        <p className="text-xs font-bold text-[var(--island-ink)]">
                          That name is taken. Try one of these:
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {usernameSuggestions.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => {
                                setUsername(suggestion);
                                setUsernameSuggestions([]);
                              }}
                              className="rounded-full border border-[var(--island-ink)]/20 bg-white px-3 py-1 font-mono text-xs font-bold hover:border-[var(--island-ink)]"
                            >
                              @{suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-display-name">Display name</Label>
                  <Input
                    id="profile-display-name"
                    value={displayName}
                    onChange={(event) =>
                      setDisplayName(event.target.value.slice(0, 50))
                    }
                    maxLength={50}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-bio">Bio (optional)</Label>
                  <Textarea
                    id="profile-bio"
                    value={bio}
                    onChange={(event) =>
                      setBio(event.target.value.slice(0, 500))
                    }
                    maxLength={500}
                    rows={4}
                  />
                  <p className="text-right text-xs text-muted-foreground">
                    {bio.length}/500
                  </p>
                </div>
                <label className="flex items-start gap-3 rounded-xl bg-muted/60 p-4 text-sm leading-6">
                  <Checkbox
                    checked={accepted}
                    onCheckedChange={(checked) => setAccepted(checked === true)}
                    className="mt-1"
                  />
                  <span>
                    I am at least 13 years old and agree to the{" "}
                    <a href="/terms" className="font-bold underline">
                      Terms
                    </a>{" "}
                    and{" "}
                    <a
                      href="/community-guidelines"
                      className="font-bold underline"
                    >
                      Community Guidelines
                    </a>
                    .
                  </span>
                </label>
              </div>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  type="submit"
                  disabled={submitting || !communityMutationsEnabled}
                >
                  <Check />{" "}
                  {submitting
                    ? "Saving…"
                    : reviewingUpdatedTerms
                      ? "Accept current terms"
                      : "Finish setup"}
                </Button>
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--island-ink)]/50">
                  <ShieldCheck className="h-4 w-4" /> Google email is never
                  displayed
                </span>
              </div>
            </form>
          </div>
        </div>
      </RequireAuth>
    </CommunityShell>
  );
}
