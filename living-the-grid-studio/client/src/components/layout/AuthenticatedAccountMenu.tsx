import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { toast } from "@/lib/toast";
import { Link } from "wouter";
import { IslandAvatar } from "@/components/community/IslandAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { messageFromError } from "@/lib/community/api";

export default function AuthenticatedAccountMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const profileComplete = Boolean(user.username && user.termsAccepted === true);
  const profilePath = profileComplete
    ? `/u/${encodeURIComponent(user.username!)}`
    : "/me/setup";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-full px-2 sm:px-3"
          aria-label={
            profileComplete
              ? `Open account menu for ${user.displayName}`
              : `Finish profile for ${user.displayName}`
          }
        >
          <span className="relative">
            <IslandAvatar
              seed={user.avatarSeed}
              imageUrl={user.avatarUrl}
              label={`${user.displayName}'s profile picture`}
              className="h-8 w-8"
            />
            {!profileComplete ? (
              <span
                className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-amber-500"
                aria-hidden="true"
              />
            ) : null}
          </span>
          <span className="hidden max-w-28 truncate text-xs font-black sm:inline">
            {user.displayName}
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate">{user.displayName}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {user.username
              ? `@${user.username}`
              : "Finish setting up your profile"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={profilePath}>
            <UserRound /> {profileComplete ? "Profile" : "Finish profile"}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/me/projects">Projects</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/me/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        {user.role === "moderator" || user.role === "admin" ? (
          <DropdownMenuItem asChild>
            <Link href="/moderation">Moderation</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void logout().catch((error) =>
              toast.error(messageFromError(error)),
            );
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
