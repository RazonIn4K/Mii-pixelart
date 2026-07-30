import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { handleR2PrefixAudit } from "./staging-r2-prefix-audit-worker";

// Mirror the worker's fixed ceilings without importing them as top-level
// exports (workerd treats top-level exports as handlers).
const MAX_AUDIT_OBJECTS = 16;
const MAX_AUDIT_OBJECT_BYTES = 2 * 1_024 * 1_024;
const MAX_AUDIT_PREFIX_BYTES = 4 * 1_024 * 1_024;

const AUDIT_NONCE = "n".repeat(32);
const AUDIT_ATTESTATION_KEY = "k".repeat(64);
const AUDIT_CHALLENGE = "c".repeat(64);
const CREATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PREFIX = `private/creations/${CREATION_ID}/`;

type ListedObject = { key: string; size: number };
type ListResult = { objects: ListedObject[]; truncated: boolean };

function auditRequest(
  body: BodyInit | null = JSON.stringify({ creationId: CREATION_ID }),
  options: {
    contentType?: string | null;
    challenge?: string | null;
    method?: string;
    nonce?: string | null;
    path?: string;
  } = {},
): Request {
  const headers = new Headers();
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  if (options.challenge !== null) {
    headers.set(
      "x-tomodachi-audit-challenge",
      options.challenge ?? AUDIT_CHALLENGE,
    );
  }
  if (options.nonce !== null) {
    headers.set("x-tomodachi-audit-nonce", options.nonce ?? AUDIT_NONCE);
  }
  return new Request(`http://127.0.0.1${options.path ?? "/audit"}`, {
    body,
    headers,
    method: options.method ?? "POST",
  });
}

function auditEnv(list: (options: unknown) => Promise<ListResult>) {
  const projects = Object.freeze({ list });
  return {
    env: {
      AUDIT_ATTESTATION_KEY,
      AUDIT_NONCE,
      PROJECTS: projects,
    } as unknown as Parameters<typeof handleR2PrefixAudit>[1],
    projects,
  };
}

async function responseError(
  request: Request,
  list = vi.fn(async (): Promise<ListResult> => ({
    objects: [],
    truncated: false,
  })),
) {
  const { env } = auditEnv(list);
  const response = await handleR2PrefixAudit(request, env);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "The bounded R2 prefix audit could not be completed.",
  });
  return list;
}

describe("staging R2 prefix audit Worker", () => {
  it("derives the exact normalized UUID prefix and performs one bounded list only", async () => {
    const list = vi.fn(async (): Promise<ListResult> => ({
      objects: [
        { key: `${PREFIX}z.json`, size: 7 },
        { key: `${PREFIX}a.json`, size: 3 },
      ],
      truncated: false,
    }));
    const { env, projects } = auditEnv(list);

    const response = await handleR2PrefixAudit(
      auditRequest(JSON.stringify({ creationId: CREATION_ID.toUpperCase() })),
      env,
    );

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledWith({
      limit: MAX_AUDIT_OBJECTS + 1,
      prefix: PREFIX,
    });
    expect(Reflect.ownKeys(projects)).toEqual(["list"]);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      objects: [
        { key: `${PREFIX}a.json`, size: 3 },
        { key: `${PREFIX}z.json`, size: 7 },
      ],
    });
    expect(response.headers.get("x-tomodachi-audit-attestation")).toBe(
      createHmac("sha256", AUDIT_ATTESTATION_KEY)
        .update(`${AUDIT_CHALLENGE}.${body}`)
        .digest("base64url"),
    );
  });

  it("rejects nonce, method, path, media-type, and body failures before listing", async () => {
    const invalidRequests = [
      auditRequest(undefined, { nonce: "wrong" }),
      auditRequest(undefined, { challenge: null }),
      auditRequest(null, { method: "GET" }),
      auditRequest(undefined, { path: "/not-audit" }),
      auditRequest(undefined, { contentType: "text/plain" }),
      auditRequest("not-json"),
      auditRequest(JSON.stringify({ creationId: CREATION_ID, extra: true })),
      auditRequest(JSON.stringify({ creationId: "not-a-uuid" })),
      auditRequest(" ".repeat(257)),
    ];

    for (const request of invalidRequests) {
      const list = await responseError(request);
      expect(list).not.toHaveBeenCalled();
    }
  });

  it("rejects truncated and over-count listings", async () => {
    const overCount = Array.from(
      { length: MAX_AUDIT_OBJECTS + 1 },
      (_, index) => ({ key: `${PREFIX}${index}.json`, size: 1 }),
    );

    for (const result of [
      { objects: [], truncated: true },
      { objects: overCount, truncated: false },
    ]) {
      const list = vi.fn(async (): Promise<ListResult> => result);
      await responseError(auditRequest(), list);
      expect(list).toHaveBeenCalledOnce();
    }
  });

  it("rejects duplicate keys, prefix escapes, and invalid object sizes", async () => {
    const invalidListings: ListedObject[][] = [
      [
        { key: `${PREFIX}same.json`, size: 1 },
        { key: `${PREFIX}same.json`, size: 1 },
      ],
      [{ key: "private/creations/other/project.json", size: 1 }],
      [{ key: `${PREFIX}negative.json`, size: -1 }],
      [{ key: `${PREFIX}fractional.json`, size: 1.5 }],
      [{ key: `${PREFIX}unsafe.json`, size: Number.MAX_SAFE_INTEGER + 1 }],
      [{ key: `${PREFIX}oversized.json`, size: MAX_AUDIT_OBJECT_BYTES + 1 }],
    ];

    for (const objects of invalidListings) {
      const list = vi.fn(async (): Promise<ListResult> => ({
        objects,
        truncated: false,
      }));
      await responseError(auditRequest(), list);
      expect(list).toHaveBeenCalledOnce();
    }
  });

  it("rejects a prefix whose aggregate size exceeds its fixed ceiling", async () => {
    const list = vi.fn(async (): Promise<ListResult> => ({
      objects: [
        { key: `${PREFIX}one.json`, size: MAX_AUDIT_OBJECT_BYTES },
        { key: `${PREFIX}two.json`, size: MAX_AUDIT_OBJECT_BYTES },
        { key: `${PREFIX}three.json`, size: 1 },
      ],
      truncated: false,
    }));

    await responseError(auditRequest(), list);
    expect(MAX_AUDIT_PREFIX_BYTES).toBe(MAX_AUDIT_OBJECT_BYTES * 2);
    expect(list).toHaveBeenCalledOnce();
  });
});
