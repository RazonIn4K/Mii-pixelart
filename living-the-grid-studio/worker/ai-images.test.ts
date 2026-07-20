import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AI_IMAGE_DEFAULT_MODEL } from "../shared/ai-images";
import { sha256 } from "./crypto";
import worker from "./index";
import { runScheduledMaintenance } from "./scheduled";

const ORIGIN = "http://localhost:3000";
const SESSION_PEPPER = "test-only-session-pepper";
const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wlq6XcAAAAASUVORK5CYII=";

describe("paid AI image Worker route", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    await env.DB.exec(`
      DELETE FROM ai_image_requests;
      DELETE FROM sessions;
      DELETE FROM external_identities;
      DELETE FROM users;
    `);
  });

  it("advertises only the reviewed image models and cost ceiling", async () => {
    const response = await request("/api/ai/images/status");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        configured: true,
        enabled: true,
        maxPerImageCostUsd: 0.15,
        models: [
          { id: "google/gemini-3.1-flash-lite-image" },
          { id: "google/gemini-3.1-flash-image" },
        ],
        userDailyLimit: 3,
      },
    });
  });

  it("requires an onboarded account before reserving paid usage", async () => {
    const response = await request("/api/ai/images", {
      body: imageRequest(crypto.randomUUID()),
      headers: mutationHeaders(),
      method: "POST",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
    await expect(ledgerCount()).resolves.toBe(0);
  });

  it("reserves budget, returns verified bytes, and records actual cost without prompt text", async () => {
    const token = await seedOnboardedSession("image-owner");
    stubProviderSuccess(0.031);

    const response = await request("/api/ai/images", {
      body: imageRequest(crypto.randomUUID(), "Original island robot badge"),
      headers: mutationHeaders(token),
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-ai-image-model")).toBe(
      AI_IMAGE_DEFAULT_MODEL,
    );
    expect(response.headers.get("x-ai-image-cost-micro-usd")).toBe("31000");
    expect(new Uint8Array(await response.arrayBuffer()).slice(0, 8)).toEqual(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );

    await expect(
      env.DB.prepare(
        `SELECT status, actual_cost_microusd, error_code, prompt_sha256
         FROM ai_image_requests`,
      ).first(),
    ).resolves.toMatchObject({
      actual_cost_microusd: 31_000,
      error_code: null,
      prompt_sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
      status: "complete",
    });
    const columns = await env.DB.prepare(
      "PRAGMA table_info(ai_image_requests)",
    ).all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).not.toContain(
      "prompt",
    );
  });

  it("rejects an idempotency replay without a second provider charge", async () => {
    const token = await seedOnboardedSession("image-replay-owner");
    const provider = stubProviderSuccess(0.02);
    const idempotencyKey = crypto.randomUUID();

    const first = await request("/api/ai/images", {
      body: imageRequest(idempotencyKey),
      headers: mutationHeaders(token),
      method: "POST",
    });
    expect(first.status).toBe(200);
    await first.arrayBuffer();

    const replay = await request("/api/ai/images", {
      body: imageRequest(idempotencyKey),
      headers: mutationHeaders(token),
      method: "POST",
    });
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({
      error: {
        code: "CONFLICT",
        message: expect.stringContaining("already accepted"),
      },
    });
    expect(provider).toHaveBeenCalledTimes(1);
    await expect(ledgerCount()).resolves.toBe(1);
  });

  it("allows only one provider call when the same idempotency key races concurrently", async () => {
    const token = await seedOnboardedSession("image-concurrent-owner");
    const provider = stubProviderSuccess(0.02);
    const idempotencyKey = crypto.randomUUID();
    const requestInit = {
      body: imageRequest(idempotencyKey),
      headers: mutationHeaders(token),
      method: "POST",
    };

    const responses = await Promise.all([
      request("/api/ai/images", requestInit),
      request("/api/ai/images", requestInit),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);
    await Promise.all(
      responses.map((response) =>
        response.headers.get("content-type") === "image/png"
          ? response.arrayBuffer()
          : response.json(),
      ),
    );
    expect(provider).toHaveBeenCalledTimes(1);
    await expect(ledgerCount()).resolves.toBe(1);
  });

  it("enforces the D1 user daily limit before provider contact", async () => {
    const token = await seedOnboardedSession("image-limit-owner");
    const provider = stubProviderSuccess(0.01);

    for (let index = 0; index < 3; index += 1) {
      const response = await request("/api/ai/images", {
        body: imageRequest(crypto.randomUUID(), `Original badge ${index}`),
        headers: mutationHeaders(token),
        method: "POST",
      });
      expect(response.status).toBe(200);
      await response.arrayBuffer();
    }

    const limited = await request("/api/ai/images", {
      body: imageRequest(crypto.randomUUID(), "One request too many"),
      headers: mutationHeaders(token),
      method: "POST",
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    await expect(limited.json()).resolves.toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
    expect(provider).toHaveBeenCalledTimes(3);
  });

  it("reserves against the shared D1 daily budget before another provider call", async () => {
    const token = await seedOnboardedSession("image-budget-owner");
    const provider = stubProviderSuccess(0.01);
    const budgetOverrides = {
      AI_IMAGE_DAILY_BUDGET_MICRO_USD: "150000",
    };

    const first = await request(
      "/api/ai/images",
      {
        body: imageRequest(crypto.randomUUID(), "First original badge"),
        headers: mutationHeaders(token),
        method: "POST",
      },
      budgetOverrides,
    );
    expect(first.status).toBe(200);
    await first.arrayBuffer();

    const blocked = await request(
      "/api/ai/images",
      {
        body: imageRequest(crypto.randomUUID(), "Second original badge"),
        headers: mutationHeaders(token),
        method: "POST",
      },
      budgetOverrides,
    );
    expect(blocked.status).toBe(503);
    await expect(blocked.json()).resolves.toMatchObject({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: expect.stringContaining("shared daily"),
      },
    });
    expect(provider).toHaveBeenCalledTimes(1);
    await expect(ledgerCount()).resolves.toBe(1);
  });

  it("fails closed when the deployment switch is disabled", async () => {
    const token = await seedOnboardedSession("image-disabled-owner");
    const provider = stubProviderSuccess(0.01);

    const response = await request(
      "/api/ai/images",
      {
        body: imageRequest(crypto.randomUUID()),
        headers: mutationHeaders(token),
        method: "POST",
      },
      { AI_IMAGE_GENERATION_ENABLED: "false" },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: expect.stringContaining("not enabled"),
      },
    });
    expect(provider).not.toHaveBeenCalled();
    await expect(ledgerCount()).resolves.toBe(0);
  });

  it("records conservative reserved cost when a provider result is unusable", async () => {
    const token = await seedOnboardedSession("image-failure-owner");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [{ url: "https://untrusted.example/image.png" }],
              usage: { cost: 0.03 },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const response = await request("/api/ai/images", {
      body: imageRequest(crypto.randomUUID()),
      headers: mutationHeaders(token),
      method: "POST",
    });
    expect(response.status).toBe(503);
    await expect(
      env.DB.prepare(
        "SELECT status, actual_cost_microusd, error_code FROM ai_image_requests",
      ).first(),
    ).resolves.toMatchObject({
      actual_cost_microusd: 150_000,
      error_code: "upstream_invalid_response",
      status: "failed",
    });
  });

  it("conservatively closes an hour-old pending reservation during scheduled maintenance", async () => {
    const userId = await seedOnboardedUser("image-stale-owner");
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO ai_image_requests
       (id, user_id, idempotency_key, prompt_sha256, model, status,
        reserved_cost_microusd, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 150000, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        userId,
        crypto.randomUUID(),
        "a".repeat(64),
        AI_IMAGE_DEFAULT_MODEL,
        now - 60 * 60 * 1_000 - 1,
      )
      .run();

    await runScheduledMaintenance(
      env,
      createScheduledController({
        cron: "0 * * * *",
        scheduledTime: now,
      }),
    );

    await expect(
      env.DB.prepare(
        `SELECT status, actual_cost_microusd, error_code, completed_at
         FROM ai_image_requests`,
      ).first(),
    ).resolves.toEqual({
      actual_cost_microusd: 150_000,
      completed_at: now,
      error_code: "worker_interrupted",
      status: "failed",
    });
  });

  it("rejects unknown request fields before reserving budget or contacting the provider", async () => {
    const token = await seedOnboardedSession("image-extra-field-owner");
    const provider = stubProviderSuccess(0.01);
    const response = await request("/api/ai/images", {
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        prompt: "Original island robot icon",
        provider: { allow_fallbacks: true },
      }),
      headers: mutationHeaders(token),
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: expect.stringContaining("unsupported fields"),
      },
    });
    expect(provider).not.toHaveBeenCalled();
    await expect(ledgerCount()).resolves.toBe(0);
  });
});

async function request(
  path: string,
  init?: RequestInit,
  overrides: Partial<Env> = {},
): Promise<Response> {
  const testEnv = new Proxy(env as Env, {
    get(target, property, receiver) {
      const defaults: Partial<Env> = {
        AI_IMAGE_DAILY_BUDGET_MICRO_USD: "2000000",
        AI_IMAGE_GENERATION_ENABLED: "true",
        AI_IMAGE_USER_DAILY_LIMIT: "3",
        OPENROUTER_API_KEY: "test-only-openrouter-key",
        AI_RATE_LIMITER: {
          limit: async () => ({ success: true }),
        },
      };
      const values = { ...defaults, ...overrides };
      if (property in values) return values[property as keyof Env];
      return Reflect.get(target, property, receiver);
    },
  });
  const execution = createExecutionContext();
  const response = await worker.fetch(
    new Request(`${ORIGIN}${path}`, init),
    testEnv,
    execution,
  );
  await waitOnExecutionContext(execution);
  return response;
}

function stubProviderSuccess(cost: number) {
  const provider = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          data: [{ b64_json: ONE_PIXEL_PNG, media_type: "image/png" }],
          usage: { cost },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", provider);
  return provider;
}

function imageRequest(
  idempotencyKey: string,
  prompt = "Original friendly island robot icon",
): string {
  return JSON.stringify({ idempotencyKey, prompt });
}

function mutationHeaders(token?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Origin: ORIGIN,
    ...(token ? { Cookie: `tomodachi.sid=${token}` } : {}),
  };
}

async function seedOnboardedSession(username: string): Promise<string> {
  const userId = await seedOnboardedUser(username);
  const token = `${username}-token`;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO external_identities
       (id, user_id, provider, provider_subject, email, email_verified,
        created_at, updated_at)
       VALUES (?, ?, 'google', ?, ?, 1, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      userId,
      `subject-${userId}`,
      `${username}@example.test`,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO sessions
       (id, token_hash, user_id, ua_label, created_at, last_seen_at,
        last_authenticated_at, expires_at)
       VALUES (?, ?, ?, 'AI image test', ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      await sha256(`${SESSION_PEPPER}:${token}`),
      userId,
      now,
      now,
      now,
      now + 60 * 60 * 1_000,
    ),
  ]);
  return token;
}

async function seedOnboardedUser(username: string): Promise<string> {
  const userId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users
     (id, username, display_name, bio, role, status, avatar_seed,
      terms_version, terms_accepted_at, created_at, updated_at)
     VALUES (?, ?, ?, '', 'user', 'active', ?, '2026-07-16', ?, ?, ?)`,
  )
    .bind(userId, username, username, userId, now, now, now)
    .run();
  return userId;
}

async function ledgerCount(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM ai_image_requests",
  ).first<{ count: number }>();
  return row?.count ?? 0;
}
