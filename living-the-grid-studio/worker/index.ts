import { Hono } from "hono";

import { registerAccountRoutes } from "./accounts";
import { registerAuthRoutes } from "./auth";
import { registerCreationRoutes } from "./creations";
import { registerCreationImageRoutes } from "./creation-images";
import { assertCommunityMutationAllowed } from "./community-mode";
import { registerDiscoveryRoutes } from "./discovery";
import { dynamicDocument } from "./documents";
import {
  applySecurityHeaders,
  assertSafeOrigin,
  errorResponse,
  failure,
  type WorkerRequestContext,
} from "./http";
import { registerLegacyRoutes } from "./legacy";
import { formatRequestLog } from "./logging";
import { registerModerationRoutes } from "./moderation";
import { Router } from "./router";
import { runScheduledMaintenance } from "./scheduled";
import { registerSocialRoutes } from "./social";

const router = new Router();
registerAuthRoutes(router);
registerAccountRoutes(router);
registerCreationRoutes(router);
registerCreationImageRoutes(router);
registerDiscoveryRoutes(router);
registerSocialRoutes(router);
registerModerationRoutes(router);
registerLegacyRoutes(router);

const app = new Hono<{ Bindings: Env }>();
app.all("*", (context) => handleRequest(
  context.req.raw,
  context.env,
  context.executionCtx,
));

async function handleRequest(
  request: Request,
  env: Env,
  executionCtx: WorkerRequestContext["executionCtx"],
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const url = new URL(request.url);
  const context: WorkerRequestContext = {
    env,
    executionCtx,
    params: {},
    request,
    requestId,
    url,
  };
  let response: Response;

  try {
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      response = new Response(null, { status: 204, headers: { Allow: "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS" } });
    } else {
      assertSafeOrigin(context);
      if (url.pathname.startsWith("/api/")) {
        assertCommunityMutationAllowed(context);
        response = (await router.dispatch(context))
          ?? failure(requestId, 404, "route_not_found", "API route was not found.");
      } else {
        // API route matching decodes parameters. Document routing must stay on
        // the raw URL so malformed public slugs become safe 404/noindex pages
        // and never reach a decoding path that can throw URIError.
        response = (await dynamicDocument(context)) ?? await assetOrSpa(request, env);
      }
    }
  } catch (error) {
    response = errorResponse(error, requestId);
  }

  const headers = new Headers(response.headers);
  headers.set("X-Worker-Scheme", url.protocol.slice(0, -1));
  response = new Response(request.method === "HEAD" ? null : response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
  response = applySecurityHeaders(response, requestId);
  console.log(formatRequestLog(request, {
    duration: Date.now() - startedAt,
    environment: env.ENVIRONMENT,
    requestId,
    status: response.status,
  }));
  return response;
}

async function assetOrSpa(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  if (asset.status !== 404) return asset;
  // The Vite plugin's local ASSETS binding serves the SPA shell at `/`, while
  // deployed Static Assets may also expose `/index.html`. Using `/` works in
  // both runtimes and avoids recursively routing through this Worker.
  const indexUrl = new URL("/", request.url);
  return env.ASSETS.fetch(new Request(indexUrl, {
    headers: request.headers,
    method: request.method === "HEAD" ? "HEAD" : "GET",
  }));
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (hasMalformedPathEncoding(request)) {
      const pathname = new URL(request.url).pathname;
      if (
        (request.method === "GET" || request.method === "HEAD")
        && !pathname.startsWith("/api/")
      ) {
        // Hono decodes route segments before invoking a wildcard handler. Let
        // the raw document renderer produce its safe 404/noindex response for
        // malformed public profile/creation paths instead of surfacing a 500.
        return handleRequest(request, env, ctx);
      }
      return malformedApiPath(request, env);
    }
    return app.fetch(request, env, ctx);
  },
  scheduled(controller, env, ctx): void {
    ctx.waitUntil(runScheduledMaintenance(env, controller));
  },
} satisfies ExportedHandler<Env>;

function hasMalformedPathEncoding(request: Request): boolean {
  try {
    decodeURI(new URL(request.url).pathname);
    return false;
  } catch {
    return true;
  }
}

function malformedApiPath(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const response = failure(requestId, 400, "invalid_path", "Request path encoding is invalid.");
  response.headers.set("X-Worker-Scheme", url.protocol.slice(0, -1));
  console.log(formatRequestLog(request, {
    duration: 0,
    environment: env.ENVIRONMENT,
    requestId,
    status: 400,
  }));
  return Promise.resolve(applySecurityHeaders(response, requestId));
}
