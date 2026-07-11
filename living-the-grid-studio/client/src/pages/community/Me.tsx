import { FolderOpen, Settings, UserRound } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { IslandAvatar } from "@/components/community/IslandAvatar";
import { RequireAuth } from "@/components/community/RequireAuth";
import { CommunityPageIntro, CommunityShell } from "@/components/layout/CommunityShell";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function Me() {
  useDocumentTitle("Your account");
  const { user } = useAuth();
  return (
    <CommunityShell>
      <RequireAuth>
        <div className="container py-12 sm:py-16">
          <CommunityPageIntro eyebrow="Your workshop" title={`Welcome back${user ? `, ${user.displayName}` : ""}.`} description="Your local Studio is always available. Account tools begin only when you deliberately save or share." />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Link href="/me/projects" className="community-action-card"><FolderOpen /><span><strong>Cloud projects</strong><small>Private drafts and published work</small></span></Link>
            <Link href={user?.username ? `/u/${user.username}` : "/me/setup"} className="community-action-card"><UserRound /><span><strong>Public profile</strong><small>See what other islanders see</small></span></Link>
            <Link href="/me/settings" className="community-action-card"><Settings /><span><strong>Account settings</strong><small>Profile, sessions, export, deletion</small></span></Link>
          </div>
          {user ? <div className="mt-10 flex flex-col items-start gap-5 rounded-3xl border-2 border-[var(--island-ink)] bg-white p-6 shadow-[6px_6px_0_var(--island-ink)] sm:flex-row sm:items-center"><IslandAvatar seed={user.avatarSeed} className="h-20 w-20" /><div className="flex-1"><h2 className="text-xl font-black">{user.displayName}</h2><p className="text-sm text-muted-foreground">{user.username ? `@${user.username}` : "Your public identity is not finished yet."}</p></div>{!user.username ? <Button asChild><Link href="/me/setup">Finish profile</Link></Button> : null}</div> : null}
        </div>
      </RequireAuth>
    </CommunityShell>
  );
}
