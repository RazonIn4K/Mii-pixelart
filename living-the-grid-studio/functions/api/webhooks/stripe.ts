/**
 * Retained only so stale requests receive an explicit decommissioned response.
 * The payment integration is retired and this route performs no verification,
 * storage, logging, or external calls.
 */

interface PagesContext {
  request: Request;
}

export async function onRequest(_context: PagesContext): Promise<Response> {
  return Response.json(
    {
      error: {
        code: "payments_retired",
        message: "The payment webhook is retired.",
      },
    },
    { headers: { "Cache-Control": "no-store" }, status: 410 },
  );
}

export const onRequestPost = onRequest;
