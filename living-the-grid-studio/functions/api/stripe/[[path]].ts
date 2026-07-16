/**
 * Provider-free tombstone for retired Tomodachi payment routes.
 *
 * Keep this route during the Pages transition so stale checkout clients get a
 * truthful terminal response instead of the SPA fallback. It has no provider
 * binding and performs no outbound request.
 */

interface PagesContext {
  request: Request;
}

export const onRequest = async (_context: PagesContext): Promise<Response> =>
  Response.json(
    {
      error: {
        code: "payments_retired",
        message: "Payments and checkout are no longer offered by Tomodachi.",
      },
    },
    {
      headers: { "Cache-Control": "no-store" },
      status: 410,
    },
  );
