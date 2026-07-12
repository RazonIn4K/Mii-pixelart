const RELATIVE_ORIGIN = "https://return-to.invalid";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validatedRelativeReturnTo(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return null;
  }

  try {
    const parsed = new URL(value, RELATIVE_ORIGIN);
    if (parsed.origin !== RELATIVE_ORIGIN) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function currentRelativeReturnTo(fallback = "/me"): string {
  if (typeof window === "undefined") return fallback;
  return (
    validatedRelativeReturnTo(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    ) ?? fallback
  );
}

export function currentStudioReturnTo(): string {
  if (typeof window === "undefined" || window.location.pathname !== "/studio") {
    return "/studio";
  }

  const cloudId = new URLSearchParams(window.location.search).get("cloud");
  return cloudId && UUID_V4_PATTERN.test(cloudId)
    ? `/studio?cloud=${encodeURIComponent(cloudId)}`
    : "/studio";
}

export function setupPathForReturnTo(value: unknown): string {
  const returnTo = validatedRelativeReturnTo(value) ?? "/me";
  return `/me/setup?returnTo=${encodeURIComponent(returnTo)}`;
}

export function setupCompletionReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const requested = new URLSearchParams(window.location.search).get("returnTo");
  const returnTo = validatedRelativeReturnTo(requested);
  if (!returnTo) return null;

  const parsed = new URL(returnTo, RELATIVE_ORIGIN);
  return parsed.pathname === "/me/setup" ? null : returnTo;
}
