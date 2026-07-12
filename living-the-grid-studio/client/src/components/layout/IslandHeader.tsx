import { useEffect, useId, useState, type FormEvent } from "react";
import {
  ChevronDown,
  CloudOff,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { IslandAvatar } from "@/components/community/IslandAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { messageFromError } from "@/lib/community/api";
import { cn } from "@/lib/utils";

const PRIMARY_LINKS = [
  { href: "/discover", label: "Discover" },
  { href: "/search", label: "Search" },
  { href: "/studio", label: "Studio" },
  { href: "/guides", label: "Guides" },
] as const;

function currentSearchQuery(): string {
  if (typeof window === "undefined" || window.location.pathname !== "/search")
    return "";
  return (
    new URLSearchParams(window.location.search)
      .get("q")
      ?.trim()
      .slice(0, 120) ?? ""
  );
}

function SignInForm({
  className,
  unavailableMessage,
}: {
  className?: string;
  unavailableMessage?: string | null;
}) {
  const unavailableDescriptionId = useId();
  const returnTo =
    typeof window === "undefined"
      ? "/discover"
      : `${window.location.pathname}${window.location.search}`;
  return (
    <form action="/api/auth/google/start" method="post" className={className}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button
        type="submit"
        className="island-button w-full rounded-full font-bold"
        disabled={Boolean(unavailableMessage)}
        aria-describedby={
          unavailableMessage ? unavailableDescriptionId : undefined
        }
        title={unavailableMessage ?? undefined}
      >
        {unavailableMessage ? <CloudOff /> : null}
        {unavailableMessage ? "Accounts unavailable" : "Sign in with Google"}
      </Button>
      {unavailableMessage ? (
        <p id={unavailableDescriptionId} className="sr-only">
          {unavailableMessage}
        </p>
      ) : null}
    </form>
  );
}

function AccountMenu() {
  const { user, logout, serviceMessage } = useAuth();
  if (!user) {
    return (
      <SignInForm
        className="hidden sm:block"
        unavailableMessage={serviceMessage}
      />
    );
  }

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

export function IslandHeader({ fixed = false }: { fixed?: boolean }) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState(currentSearchQuery);
  const { user, status, serviceMessage } = useAuth();

  useEffect(() => {
    setQuickQuery(currentSearchQuery());
  }, [location, search]);

  const submitQuickSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = quickQuery.trim().slice(0, 120);
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
  };

  return (
    <header
      className={cn(
        "z-50 border-b border-[var(--island-ink)]/10 bg-[color:var(--background)]/92 backdrop-blur-xl",
        fixed ? "fixed inset-x-0 top-0" : "sticky top-0",
      )}
    >
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="group flex items-center gap-3"
          aria-label="Tomodachi home"
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="text-[15px] font-extrabold tracking-[-0.02em] text-[var(--island-ink)]">
            tomodachi<span className="text-primary">.pw</span>
          </span>
        </Link>

        <nav
          className="hidden items-center gap-1 text-sm font-bold text-[var(--island-ink)]/65 md:flex"
          aria-label="Primary navigation"
        >
          {PRIMARY_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full px-3 py-2 transition-colors hover:bg-white hover:text-[var(--island-ink)]",
                (location === item.href ||
                  location.startsWith(`${item.href}/`)) &&
                  "bg-white text-[var(--island-ink)] shadow-sm",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <form
          role="search"
          aria-label="Community quick search"
          className="hidden min-w-40 max-w-xs flex-1 items-center rounded-full border border-[var(--island-ink)]/15 bg-white/85 p-1 shadow-sm xl:flex"
          onSubmit={submitQuickSearch}
        >
          <label htmlFor="community-quick-search" className="sr-only">
            Search public creations
          </label>
          <Input
            id="community-quick-search"
            value={quickQuery}
            onChange={(event) =>
              setQuickQuery(event.target.value.slice(0, 120))
            }
            placeholder="Search creations…"
            className="h-9 min-w-0 border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full"
            aria-label="Search community"
          >
            <Search className="h-4 w-4" />
          </Button>
        </form>

        <div className="flex items-center gap-1">
          <Button
            asChild
            className="island-button hidden rounded-full lg:inline-flex"
          >
            <Link href="/studio">
              <Plus /> Create &amp; share
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="hidden rounded-full sm:inline-flex md:hidden"
          >
            <Link href="/search" aria-label="Search community">
              <Search />
            </Link>
          </Button>
          {status === "loading" ? (
            <span
              className="h-9 w-24 animate-pulse rounded-full bg-black/5"
              aria-label="Checking session"
            />
          ) : (
            <AccountMenu />
          )}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full md:hidden"
                aria-label="Open navigation"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto border-l-2 border-[var(--island-ink)] bg-[var(--island-paper)]">
              <SheetHeader>
                <SheetTitle className="text-left font-black text-[var(--island-ink)]">
                  Island menu
                </SheetTitle>
                <SheetDescription className="text-left">
                  Move between the community gallery, local Studio tools, and
                  your account.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4">
                <SheetClose asChild>
                  <Link
                    href="/studio"
                    className="island-button flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 py-3 font-black"
                  >
                    <Plus className="h-5 w-5" /> Create &amp; share
                  </Link>
                </SheetClose>
                <p className="mt-2 px-2 text-center text-xs font-semibold text-[var(--island-ink)]/55">
                  Start locally, then choose when you are ready to publish.
                </p>
              </div>
              <nav
                className="flex flex-col gap-2 px-4"
                aria-label="Mobile navigation"
              >
                {PRIMARY_LINKS.map((item) => (
                  <SheetClose key={item.href} asChild>
                    <Link
                      href={item.href}
                      className="rounded-xl border-2 border-transparent px-4 py-3 font-black text-[var(--island-ink)] hover:border-[var(--island-ink)] hover:bg-white"
                    >
                      {item.label}
                    </Link>
                  </SheetClose>
                ))}
                {user ? (
                  <>
                    <SheetClose asChild>
                      <Link
                        href="/me/projects"
                        className="rounded-xl px-4 py-3 font-black text-[var(--island-ink)] hover:bg-white"
                      >
                        My projects
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="/me/settings"
                        className="rounded-xl px-4 py-3 font-black text-[var(--island-ink)] hover:bg-white"
                      >
                        Settings
                      </Link>
                    </SheetClose>
                  </>
                ) : (
                  <SignInForm
                    className="mt-3 sm:hidden"
                    unavailableMessage={serviceMessage}
                  />
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
