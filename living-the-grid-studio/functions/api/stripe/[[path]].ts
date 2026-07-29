/** Retained as a fail-closed tombstone for obsolete API clients and links. */

interface PagesContext {
  request: Request;
}

const DECOMMISSIONED_BODY = JSON.stringify({
  error: {
    code: "route_decommissioned",
    message: "This legacy route is no longer available.",
  },
});

export async function onRequest(_context: PagesContext): Promise<Response> {
  return new Response(DECOMMISSIONED_BODY, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status: 410,
  });
}
