import { Link } from "wouter";

export function IslandFooter() {
  return (
    <footer className="border-t border-[var(--island-ink)]/10 bg-white/60 py-10">
      <div className="container grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="brand-mark brand-mark-small" aria-hidden="true"><span /><span /><span /><span /></span>
            <span className="text-sm font-extrabold text-[var(--island-ink)]">tomodachi<span className="text-primary">.pw</span></span>
          </Link>
          <p className="mt-4 max-w-md text-xs font-medium leading-5 text-[var(--island-ink)]/50">
            An unofficial, fan-made creative tool. No official game or character assets are bundled, and no affiliation with Nintendo is implied.
          </p>
        </div>
        <nav aria-label="Footer" className="flex max-w-xl flex-wrap gap-x-5 gap-y-3 text-xs font-bold text-[var(--island-ink)]/60 md:justify-end">
          <Link href="/discover">Discover</Link>
          <Link href="/studio">Studio</Link>
          <Link href="/community-guidelines">Community guidelines</Link>
          <Link href="/copyright">Copyright</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/cookies">Cookies</Link>
          <Link href="/security">Security</Link>
        </nav>
      </div>
    </footer>
  );
}
