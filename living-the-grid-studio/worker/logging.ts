const ROUTE_GROUPS = new Set([
  "ai",
  "auth",
  "comments",
  "creations",
  "discover",
  "me",
  "moderation",
  "public",
  "reports",
  "search",
  "tags",
  "users",
]);

interface RequestLogOptions {
  duration: number;
  environment: string;
  requestId: string;
  status: number;
}

export function requestRouteGroup(pathname: string): string {
  if (!pathname.startsWith("/api/")) return "document_or_asset";
  const group = pathname.split("/")[2] ?? "api";
  return ROUTE_GROUPS.has(group) ? group : "api_other";
}

/**
 * Serialize only the six fields approved by the threat model. Accepting the
 * Request here lets tests prove that URL, headers, cookies, and body data are
 * not accidentally copied into the structured request log.
 */
export function formatRequestLog(
  request: Request,
  options: RequestLogOptions,
): string {
  return JSON.stringify({
    requestId: options.requestId,
    routeGroup: requestRouteGroup(new URL(request.url).pathname),
    method: request.method,
    status: options.status,
    duration: options.duration,
    environment: options.environment,
  });
}
