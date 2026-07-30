/**
 * Retained only so stale requests receive an explicit decommissioned response.
 * This route performs no verification, storage, logging, or external calls.
 */

interface PagesContext {
  request: Request;
}

export async function onRequest(_context: PagesContext): Promise<Response> {
  return Response.json(
    {
      error: {
        code: "route_decommissioned",
        message: "This legacy route is no longer available.",
      },
    },
    { headers: { "Cache-Control": "no-store" }, status: 410 },
  );
}

export const onRequestPost = onRequest;
