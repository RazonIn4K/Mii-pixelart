/**
 * Retained only as a fail-closed tombstone for old checkout clients and links.
 * Tomodachi no longer offers payments or calls Stripe from this route.
 */

interface PagesContext {
  request: Request;
}

const RETIRED_BODY = JSON.stringify({
  error: {
    code: "payments_retired",
    message: "Payments and checkout are no longer offered by Tomodachi.",
  },
});

export async function onRequest(_context: PagesContext): Promise<Response> {
  return new Response(RETIRED_BODY, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status: 410,
  });
}
