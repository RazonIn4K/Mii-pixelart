import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, KeyRound, Save, Trash2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IslandAvatar } from "@/components/community/IslandAvatar";
import { AvatarRegenerationButton } from "@/components/community/AvatarRegenerationButton";
import { ProfileImageManager } from "@/components/community/ProfileImageManager";
import { RequireAuth } from "@/components/community/RequireAuth";
import { CommunityShell } from "@/components/layout/CommunityShell";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { communityApi, jsonBody, messageFromError } from "@/lib/community/api";
import { formatCommunityDate } from "@/lib/community/format";
import type { CommunityUser, SessionInfo } from "@/lib/community/types";

export default function SettingsPage() {
  useDocumentTitle("Account settings", undefined, { noindex: true });
  const {
    applyAccountUpdate,
    communityMutationsEnabled,
    user,
    refresh,
    revokeAll,
    getSessions,
  } = useAuth();
  const [, navigate] = useLocation();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsStatus, setSessionsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [sessionsError, setSessionsError] = useState("");
  const [deleteText, setDeleteText] = useState("");
  const [saving, setSaving] = useState(false);
  const accountSetupRequired = Boolean(
    user && (!user.username || user.termsAccepted !== true),
  );

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
    setBio(user?.bio ?? "");
  }, [user?.bio, user?.displayName]);

  const loadSessions = useCallback(async () => {
    setSessionsStatus("loading");
    setSessionsError("");
    try {
      setSessions(await getSessions());
      setSessionsStatus("ready");
    } catch (error) {
      setSessions([]);
      setSessionsError(messageFromError(error));
      setSessionsStatus("error");
    }
  }, [getSessions]);
  useEffect(() => {
    if (user) void loadSessions();
  }, [loadSessions, user?.id]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await communityApi<CommunityUser>("/api/me", {
        method: "PATCH",
        body: jsonBody({ displayName: displayName.trim(), bio: bio.trim() }),
      });
      // A simultaneous avatar regeneration owns avatarSeed; profile save owns
      // only these editable text fields.
      applyAccountUpdate({
        id: result.data.id,
        displayName: result.data.displayName,
        bio: result.data.bio,
      });
      toast.success("Profile saved");
    } catch (error) {
      toast.error(messageFromError(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteText !== "DELETE") return;
    try {
      await communityApi("/api/me", { method: "DELETE", body: jsonBody({}) });
      await refresh();
      toast.success(
        "Account scheduled for deletion. You have seven days to cancel.",
      );
      navigate("/");
    } catch (error) {
      toast.error(messageFromError(error));
    }
  };

  const cancelDeletion = async () => {
    try {
      await communityApi("/api/me/deletion/cancel", {
        method: "POST",
        body: jsonBody({}),
      });
      await refresh();
      toast.success(
        "Account deletion canceled. Your creations remain private until you republish them.",
      );
    } catch (error) {
      toast.error(messageFromError(error));
    }
  };

  return (
    <CommunityShell>
      <RequireAuth>
        <div className="container py-12 sm:py-16">
          <div className="mx-auto max-w-3xl space-y-6">
            <div>
              <p className="island-kicker">Account controls</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.05em]">
                Settings you can understand.
              </h1>
              <p className="mt-3 text-sm leading-6 text-[var(--island-ink)]/60">
                Manage your public profile, active sessions, export, and
                deletion from one place.
              </p>
            </div>
            {!communityMutationsEnabled ? (
              <section
                className="rounded-3xl border-2 border-amber-500 bg-amber-50 p-6 text-amber-950"
                role="status"
              >
                <h2 className="text-xl font-black">
                  Profile changes are paused
                </h2>
                <p className="mt-2 text-sm leading-6">
                  Session, export, and account-safety controls remain available,
                  but profile and community writes are read-only right now.
                </p>
              </section>
            ) : null}
            {accountSetupRequired ? (
              <section
                className="rounded-3xl border-2 border-[var(--island-blue)]/45 bg-[var(--island-blue-soft)] p-6"
                role="status"
              >
                <h2 className="text-xl font-black text-[var(--island-ink)]">
                  Account setup is still required
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--island-ink)]/65">
                  You can always manage sessions, export your data, or delete
                  your account here. Finish your profile and accept the current
                  Terms before editing your public profile or using cloud and
                  community features.
                </p>
                <Button asChild className="mt-4">
                  <Link href="/me/setup?returnTo=%2Fme%2Fsettings">
                    Finish account setup
                  </Link>
                </Button>
              </section>
            ) : null}
            {user?.status === "deletion_pending" ? (
              <section
                className="rounded-3xl border-2 border-amber-500 bg-amber-50 p-6"
                role="status"
              >
                <h2 className="text-xl font-black text-amber-950">
                  Deletion is scheduled
                </h2>
                <p className="mt-2 text-sm leading-6 text-amber-950/70">
                  Cancel during the seven-day grace period to keep the account.
                  Previously published creations remain private until you
                  deliberately republish them.
                </p>
                <Button
                  type="button"
                  className="mt-4"
                  onClick={() => void cancelDeletion()}
                >
                  Cancel account deletion
                </Button>
              </section>
            ) : null}
            {!accountSetupRequired ? (
              <form onSubmit={save} className="community-detail-panel">
                <div className="flex items-center gap-4">
                  <IslandAvatar
                    seed={user?.avatarSeed ?? "islander"}
                    imageUrl={user?.avatarUrl}
                    label="Your profile picture"
                    className="h-16 w-16"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-black">Public profile</h2>
                    <p className="text-xs text-muted-foreground">
                      {user?.avatarUrl
                        ? "Your custom photo · updates everywhere"
                        : "Generated Island avatar · updates everywhere"}
                    </p>
                    {!user?.avatarUrl ? (
                      <AvatarRegenerationButton className="mt-3" />
                    ) : null}
                  </div>
                </div>
                <ProfileImageManager />
                <div className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="settings-name">Display name</Label>
                    <Input
                      id="settings-name"
                      value={displayName}
                      onChange={(event) =>
                        setDisplayName(event.target.value.slice(0, 50))
                      }
                      required
                      maxLength={50}
                      disabled={!communityMutationsEnabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-bio">Bio</Label>
                    <Textarea
                      id="settings-bio"
                      value={bio}
                      onChange={(event) =>
                        setBio(event.target.value.slice(0, 500))
                      }
                      rows={4}
                      maxLength={500}
                      disabled={!communityMutationsEnabled}
                    />
                    <p className="text-right text-xs text-muted-foreground">
                      {bio.length}/500
                    </p>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="mt-5"
                  disabled={saving || !communityMutationsEnabled}
                >
                  <Save /> {saving ? "Saving…" : "Save profile"}
                </Button>
              </form>
            ) : null}

            <section
              className="community-detail-panel"
              aria-labelledby="sessions-heading"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 id="sessions-heading" className="text-xl font-black">
                    Active sessions
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sessions expire after 30 days and never silently extend.
                  </p>
                </div>
                <KeyRound className="text-primary" />
              </div>
              <div className="mt-5 divide-y">
                {sessionsStatus === "loading" || sessionsStatus === "idle" ? (
                  <p
                    className="py-3 text-sm text-muted-foreground"
                    role="status"
                  >
                    Loading active sessions…
                  </p>
                ) : sessionsStatus === "error" ? (
                  <div
                    className="rounded-2xl border border-destructive/30 bg-red-50 p-4"
                    role="alert"
                  >
                    <p className="text-sm font-bold text-red-950">
                      Session details could not be loaded.
                    </p>
                    <p className="mt-1 text-xs text-red-950/70">
                      {sessionsError}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3 bg-white"
                      onClick={() => void loadSessions()}
                    >
                      Retry session details
                    </Button>
                  </div>
                ) : sessions.length ? (
                  sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between gap-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-bold">
                          {session.userAgentLabel || "Browser session"}{" "}
                          {session.current ? (
                            <span className="text-primary">· This device</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Last used {formatCommunityDate(session.lastSeenAt)} ·
                          expires {formatCommunityDate(session.expiresAt)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">
                    No active sessions were returned.
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                onClick={() =>
                  void revokeAll().catch((error) =>
                    toast.error(messageFromError(error)),
                  )
                }
              >
                Sign out everywhere
              </Button>
            </section>

            <section className="community-detail-panel">
              <h2 className="text-xl font-black">Your data</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--island-ink)]/60">
                Download a fresh-authenticated NDJSON export containing your
                profile, projects, comments, likes, follows, and account
                moderation data.
              </p>
              <div className="mt-4 rounded-xl border border-[var(--island-blue)]/35 bg-[var(--island-blue-soft)] p-4">
                <p className="text-sm font-black text-[var(--island-ink)]">
                  Sensitive controls require a recent Google sign-in
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--island-ink)]/60">
                  Confirm your identity immediately before exporting data or
                  scheduling deletion. The fresh-authentication window lasts 15
                  minutes and does not create a second account.
                </p>
                <form
                  action="/api/auth/google/start"
                  method="post"
                  className="mt-3"
                >
                  <input type="hidden" name="intent" value="reauth" />
                  <input type="hidden" name="returnTo" value="/me/settings" />
                  <Button type="submit" variant="outline" className="bg-white">
                    <KeyRound /> Confirm identity with Google
                  </Button>
                </form>
              </div>
              <Button asChild variant="outline" className="mt-4">
                <a href="/api/me/export" download>
                  <Download /> Download export
                </a>
              </Button>
            </section>

            <section className="rounded-3xl border-2 border-destructive/35 bg-red-50 p-6">
              <h2 className="text-xl font-black text-destructive">
                Delete account
              </h2>
              <p className="mt-2 text-sm leading-6 text-red-950/65">
                Deletion immediately hides your content and signs you out. You
                may cancel during the seven-day grace period; after that, your
                account and content are erased.
              </p>
              <Label
                htmlFor="delete-confirm"
                className="mt-5 block text-red-950"
              >
                Type DELETE to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={deleteText}
                onChange={(event) => setDeleteText(event.target.value)}
                className="mt-2 max-w-xs border-red-300 bg-white"
              />
              <Button
                type="button"
                variant="destructive"
                className="mt-4"
                disabled={deleteText !== "DELETE"}
                onClick={() => void deleteAccount()}
              >
                <Trash2 /> Schedule deletion
              </Button>
              <p className="mt-4 text-xs text-red-950/60">
                If the server says fresh authentication is required, use
                “Confirm identity with Google” above, then return here and
                submit again.
              </p>
            </section>
          </div>
        </div>
      </RequireAuth>
    </CommunityShell>
  );
}
