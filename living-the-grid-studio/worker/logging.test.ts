import { describe, expect, it } from "vitest";

import { formatRequestLog, requestRouteGroup } from "./logging";

describe("structured request logs", () => {
  it("emits exactly the six-field allowlist without request secrets", () => {
    const request = new Request(
      "https://tomodachi.pw/api/auth/private-user-value?token=do-not-log-query",
      {
        body: JSON.stringify({ project: "do-not-log-body" }),
        headers: {
          Authorization: "Bearer do-not-log-token",
          Cookie: "__Host-tomodachi.sid=do-not-log-session",
        },
        method: "POST",
      },
    );
    const serialized = formatRequestLog(request, {
      duration: 12,
      environment: "production",
      requestId: "safe-request-id",
      status: 403,
    });
    const parsed = JSON.parse(serialized) as Record<string, unknown>;

    expect(Object.keys(parsed)).toEqual([
      "requestId",
      "routeGroup",
      "method",
      "status",
      "duration",
      "environment",
    ]);
    expect(parsed).toEqual({
      duration: 12,
      environment: "production",
      method: "POST",
      requestId: "safe-request-id",
      routeGroup: "auth",
      status: 403,
    });
    for (const forbidden of [
      "private-user-value",
      "do-not-log-query",
      "do-not-log-body",
      "do-not-log-token",
      "do-not-log-session",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("collapses unknown APIs and all non-API paths into safe groups", () => {
    expect(requestRouteGroup("/api/future/private-value")).toBe("api_other");
    expect(requestRouteGroup("/creation/private-slug")).toBe(
      "document_or_asset",
    );
  });
});
