import type { ReactNode } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { currentRelativeReturnTo } from "@/lib/community/return-to";
import { CommunityError, CommunityLoading } from "./CommunityState";

export function GoogleSignIn({ returnTo }: { returnTo?: string }) {
  const destination = returnTo ?? currentRelativeReturnTo();
  return (
    <form action="/api/auth/google/start" method="post">
      <input type="hidden" name="returnTo" value={destination} />
      <button type="submit" className="island-button inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-black text-white">
        <LogIn className="h-4 w-4" /> Sign in with Google
      </button>
    </form>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { refresh, serviceMessage, status, user } = useAuth();
  if (status === "loading") return <CommunityLoading label="Checking your session…" />;
  if (!user && serviceMessage) {
    return <CommunityError message={serviceMessage} retry={() => void refresh()} />;
  }
  if (!user) {
    return (
      <div className="community-state my-16">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[var(--island-ink)] bg-[var(--island-blue)] shadow-[4px_4px_0_var(--island-ink)]">
          <LogIn className="h-6 w-6" />
        </span>
        <div>
          <p className="font-black text-[var(--island-ink)]">Sign in to continue</p>
          <p className="mt-1 max-w-md text-sm text-[var(--island-ink)]/60">The Studio stays free without an account. Sign in only when you want cloud projects or community features.</p>
        </div>
        <GoogleSignIn />
      </div>
    );
  }
  return <>{children}</>;
}
