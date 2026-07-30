import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  CloudOff,
  Menu,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const AuthenticatedAccountMenu = lazy(
  () => import("@/components/layout/AuthenticatedAccountMenu"),
);

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
  compact = false,
  unavailableMessage,
}: {
  className?: string;
  compact?: boolean;
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
        className={cn(
          "island-button rounded-full font-bold",
          compact
            ? "h-9 w-auto px-3 text-xs sm:h-10 sm:px-4 sm:text-sm"
            : "w-full",
        )}
        disabled={Boolean(unavailableMessage)}
        aria-label={
          unavailableMessage ? "Accounts unavailable" : "Sign in with Google"
        }
        aria-describedby={
          unavailableMessage ? unavailableDescriptionId : undefined
        }
        title={unavailableMessage ?? undefined}
      >
        {unavailableMessage ? <CloudOff /> : null}
        {unavailableMessage ? (
          "Accounts unavailable"
        ) : compact ? (
          <>
            <span className="sm:hidden">Sign in</span>
            <span className="hidden sm:inline">Sign in with Google</span>
          </>
        ) : (
          "Sign in with Google"
        )}
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
  const { user, serviceMessage } = useAuth();
  if (!user) {
    return (
      <SignInForm
        className="shrink-0"
        compact
        unavailableMessage={serviceMessage}
      />
    );
  }
  return (
    <Suspense
      fallback={
        <span
          className="h-9 w-24 animate-pulse rounded-full bg-black/5"
          aria-label="Opening account menu"
        />
      }
    >
      <AuthenticatedAccountMenu />
    </Suspense>
  );
}

export function IslandHeader({ fixed = false }: { fixed?: boolean }) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const [mobileOpen, setMobileOpen] = useState(false);
  const brandLinkRef = useRef<HTMLAnchorElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDialogRef = useRef<HTMLDialogElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileScrollStylesRef = useRef<{
    bodyOverflow: string;
    rootOverflow: string;
    rootScrollbarGutter: string;
  } | null>(null);
  const mobileTitleId = useId();
  const mobileDescriptionId = useId();
  const [quickQuery, setQuickQuery] = useState(currentSearchQuery);
  const { user, status, serviceMessage } = useAuth();

  const unlockMobileDocumentScroll = useCallback(() => {
    const previous = mobileScrollStylesRef.current;
    if (!previous) return;
    document.documentElement.style.overflow = previous.rootOverflow;
    document.body.style.overflow = previous.bodyOverflow;
    document.documentElement.style.scrollbarGutter =
      previous.rootScrollbarGutter;
    mobileScrollStylesRef.current = null;
  }, []);

  const closeMobileNavigation = useCallback(() => {
    const dialog = mobileDialogRef.current;
    if (dialog?.open) dialog.close();
    unlockMobileDocumentScroll();
    setMobileOpen(false);
  }, [unlockMobileDocumentScroll]);

  const openMobileNavigation = useCallback(() => {
    const dialog = mobileDialogRef.current;
    if (!dialog || dialog.open) return;
    const root = document.documentElement;
    const shouldReserveScrollbarGutter = window.innerWidth > root.clientWidth;
    const previousScrollStyles = {
      bodyOverflow: document.body.style.overflow,
      rootOverflow: root.style.overflow,
      rootScrollbarGutter: root.style.scrollbarGutter,
    };
    dialog.showModal();
    mobileScrollStylesRef.current = previousScrollStyles;
    mobileCloseButtonRef.current?.focus();
    if (shouldReserveScrollbarGutter) root.style.scrollbarGutter = "stable";
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    setMobileOpen(true);
  }, []);

  const keepMobileFocusInside = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const currentIndex = focusable.indexOf(
      document.activeElement as HTMLElement,
    );
    const nextIndex = event.shiftKey
      ? currentIndex <= 0
        ? focusable.length - 1
        : currentIndex - 1
      : currentIndex < 0 || currentIndex === focusable.length - 1
        ? 0
        : currentIndex + 1;
    event.preventDefault();
    focusable[nextIndex]?.focus();
  };

  useEffect(() => {
    setQuickQuery(currentSearchQuery());
    closeMobileNavigation();
  }, [closeMobileNavigation, location, search]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) closeMobileNavigation();
    };
    desktop.addEventListener("change", closeAtDesktop);
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, [closeMobileNavigation]);

  useEffect(
    () => () => unlockMobileDocumentScroll(),
    [unlockMobileDocumentScroll],
  );

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
          ref={brandLinkRef}
          href="/"
          className="group flex items-center gap-3"
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
          <Button
            ref={mobileTriggerRef}
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full md:hidden"
            aria-label="Open navigation"
            aria-haspopup="dialog"
            aria-expanded={mobileOpen}
            onClick={openMobileNavigation}
          >
            <Menu />
          </Button>
          <dialog
            ref={mobileDialogRef}
            aria-labelledby={mobileTitleId}
            aria-describedby={mobileDescriptionId}
            className="fixed inset-y-0 right-0 left-auto z-[100] m-0 h-dvh max-h-none w-3/4 max-w-sm overscroll-contain overflow-y-auto border-0 border-l-2 border-[var(--island-ink)] bg-[var(--island-paper)] p-0 text-[var(--island-ink)] shadow-2xl backdrop:bg-black/50 open:flex open:flex-col open:gap-4"
            onKeyDown={keepMobileFocusInside}
            onClick={(event) => {
              if (event.target !== event.currentTarget) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              const outsidePanel =
                event.clientX < bounds.left ||
                event.clientX > bounds.right ||
                event.clientY < bounds.top ||
                event.clientY > bounds.bottom;
              if (outsidePanel) closeMobileNavigation();
            }}
            onCancel={(event) => {
              event.preventDefault();
              closeMobileNavigation();
            }}
            onClose={() => {
              unlockMobileDocumentScroll();
              setMobileOpen(false);
              const focusTarget = window.matchMedia("(min-width: 768px)")
                .matches
                ? brandLinkRef.current
                : mobileTriggerRef.current;
              focusTarget?.focus();
            }}
          >
            <div className="flex flex-col gap-1.5 p-4 pr-14">
              <h2 id={mobileTitleId} className="text-left font-black">
                Island menu
              </h2>
              <p
                id={mobileDescriptionId}
                className="text-left text-sm text-muted-foreground"
              >
                Move between the community gallery, local Studio tools, and your
                account.
              </p>
            </div>
            <Button
              ref={mobileCloseButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 rounded-full"
              aria-label="Close navigation"
              onClick={closeMobileNavigation}
            >
              <X />
            </Button>
            <div className="px-4">
              <Link
                href="/studio"
                className="island-button flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 py-3 font-black"
                onClick={closeMobileNavigation}
              >
                <Plus className="h-5 w-5" /> Create &amp; share
              </Link>
              <p className="mt-2 px-2 text-center text-xs font-semibold text-[var(--island-ink)]/70">
                Start locally, then choose when you are ready to publish.
              </p>
            </div>
            <nav
              className="flex flex-col gap-2 px-4"
              aria-label="Mobile navigation"
            >
              {PRIMARY_LINKS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border-2 border-transparent px-4 py-3 font-black text-[var(--island-ink)] hover:border-[var(--island-ink)] hover:bg-white"
                  onClick={closeMobileNavigation}
                >
                  {item.label}
                </Link>
              ))}
              {user ? (
                <>
                  <Link
                    href="/me/projects"
                    className="rounded-xl px-4 py-3 font-black text-[var(--island-ink)] hover:bg-white"
                    onClick={closeMobileNavigation}
                  >
                    My projects
                  </Link>
                  <Link
                    href="/me/settings"
                    className="rounded-xl px-4 py-3 font-black text-[var(--island-ink)] hover:bg-white"
                    onClick={closeMobileNavigation}
                  >
                    Settings
                  </Link>
                </>
              ) : (
                <SignInForm
                  className="mt-3 sm:hidden"
                  unavailableMessage={serviceMessage}
                />
              )}
            </nav>
          </dialog>
        </div>
      </div>
    </header>
  );
}
