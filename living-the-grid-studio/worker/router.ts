import { HttpError, type WorkerRequestContext } from "./http";

export type RouteHandler = (context: WorkerRequestContext) => Promise<Response>;

interface Route {
  handler: RouteHandler;
  method: string;
  pattern: string;
  segments: string[];
}

export class Router {
  readonly #routes: Route[] = [];

  add(method: string, pattern: string, handler: RouteHandler): this {
    this.#routes.push({
      handler,
      method: method.toUpperCase(),
      pattern,
      segments: splitPath(pattern),
    });
    return this;
  }

  async dispatch(context: WorkerRequestContext): Promise<Response | null> {
    const requestMethod = context.request.method === "HEAD" ? "GET" : context.request.method;
    const requestSegments = splitPath(context.url.pathname);
    let pathMatched = false;

    for (const route of this.#routes) {
      const params = matchSegments(route.segments, requestSegments);
      if (!params) continue;
      pathMatched = true;
      if (route.method !== requestMethod && route.method !== "*") continue;
      return route.handler({ ...context, params });
    }

    if (pathMatched) {
      throw new HttpError(405, "method_not_allowed", "Method is not allowed for this route.");
    }
    return null;
  }
}

function splitPath(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map(decodeURIComponent);
}

function matchSegments(
  pattern: readonly string[],
  request: readonly string[],
): Record<string, string> | null {
  const wildcard = pattern.at(-1)?.startsWith("*") ?? false;
  if ((!wildcard && pattern.length !== request.length) || (wildcard && request.length < pattern.length - 1)) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let index = 0; index < pattern.length; index += 1) {
    const expected = pattern[index];
    if (expected.startsWith("*")) {
      params[expected.slice(1)] = request.slice(index).join("/");
      return params;
    }
    const actual = request[index];
    if (expected.startsWith(":")) {
      params[expected.slice(1)] = actual;
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}
