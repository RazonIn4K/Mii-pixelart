import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMMUNITY_SERVICE_UNAVAILABLE_MESSAGE,
  CommunityApiError,
  communityApi,
} from "./api";

describe("communityApi deployment fallback handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats a successful HTML SPA fallback as an unavailable service", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!doctype html><title>Tomodachi</title>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
          status: 200,
        }),
      ),
    );

    await expect(communityApi("/api/auth/session")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: COMMUNITY_SERVICE_UNAVAILABLE_MESSAGE,
      status: 200,
    } satisfies Partial<CommunityApiError>);
  });

  it("treats malformed successful JSON as an unavailable service", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      ),
    );

    await expect(communityApi("/api/discover/recent")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: COMMUNITY_SERVICE_UNAVAILABLE_MESSAGE,
      status: 200,
    } satisfies Partial<CommunityApiError>);
  });
});
