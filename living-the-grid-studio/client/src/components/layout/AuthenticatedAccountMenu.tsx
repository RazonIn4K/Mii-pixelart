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

  const profilePath =
    user.username && user.termsAccepted === true
      ? `/u/${encodeURIComponent(user.username)}`
      : "/me/setup";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-full px-2 sm:px-3"
        >
          <IslandAvatar
            seed={user.avatarSeed}
            label={`${user.displayName}'s generated avatar`}
            className="h-8 w-8"
          />
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
            <UserRound /> Profile
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
