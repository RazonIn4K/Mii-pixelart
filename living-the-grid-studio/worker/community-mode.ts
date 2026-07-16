import { HttpError, type WorkerRequestContext } from "./http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// These routes remain available during a community incident so people can
// control authentication and account deletion, while the pre-existing Studio
// and AI behavior continues to operate. Retired payment routes remain listed
// only so old clients receive a truthful 410 instead of a community-mode 503.
const OPERATIONAL_MUTATIONS = new Set([
  "POST /api/auth/google/start",
  "POST /api/auth/logout",
  "POST /api/auth/revoke-all",
  "DELETE /api/me",
  "POST /api/me/deletion/cancel",
  "POST /api/ai/chat",
  "POST /api/stripe/checkout",
  "POST /api/webhooks/stripe",
]);

export function assertCommunityMutationAllowed(
  context: WorkerRequestContext,
): void {
  if (
    !isCommunityMutationBlocked(
      context.request.method,
      context.url.pathname,
      context.env.COMMUNITY_MUTATIONS_ENABLED,
    )
  ) {
    return;
  }

  throw new HttpError(
    503,
    "community_mutations_paused",
    "Community changes are temporarily paused. Please try again later.",
  );
}

export function isCommunityMutationBlocked(
  method: string,
  pathname: string,
  enabled: string | undefined,
): boolean {
  const normalizedMethod = method.toUpperCase();
  if (SAFE_METHODS.has(normalizedMethod)) return false;
  if (enabled === "true") return false;

  const normalizedPath =
    pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname;
  return !OPERATIONAL_MUTATIONS.has(`${normalizedMethod} ${normalizedPath}`);
}
