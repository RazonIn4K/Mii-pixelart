/**
 * Provider-free tombstone for the retired Tomodachi payment webhook.
 *
 * The provider endpoint is disabled. This handler performs no signature
 * verification, storage mutation, logging, or outbound provider request.
 */

interface PagesContext {
  request: Request;
}

export const onRequest = async (_context: PagesContext): Promise<Response> =>
  Response.json(
    {
      error: {
        code: "payments_retired",
        message: "The payment webhook is retired.",
      },
    },
    {
      headers: { "Cache-Control": "no-store" },
      status: 410,
    },
  );
