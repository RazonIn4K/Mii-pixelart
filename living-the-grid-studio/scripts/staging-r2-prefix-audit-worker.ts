const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HEX_64 = /^[0-9a-f]{64}$/u;
const MAX_REQUEST_BYTES = 256;
export const MAX_AUDIT_OBJECTS = 16;
export const MAX_AUDIT_OBJECT_BYTES = 2 * 1_024 * 1_024;
export const MAX_AUDIT_PREFIX_BYTES = 4 * 1_024 * 1_024;

type AuditEnv = {
  AUDIT_ATTESTATION_KEY: string;
  AUDIT_NONCE: string;
  PROJECTS: Pick<R2Bucket, "list">;
};

interface AuditRequest {
  challenge: string;
  creationId: string;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status,
  });
}

function error(): Response {
  return json(
    { error: "The bounded R2 prefix audit could not be completed." },
    400,
  );
}

async function parseRequest(request: Request): Promise<AuditRequest | null> {
  if (
    request.method !== "POST" ||
    new URL(request.url).pathname !== "/audit" ||
    request.headers.get("content-type")?.toLowerCase() !== "application/json"
  ) {
    return null;
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    (declaredLength < 0 || declaredLength > MAX_REQUEST_BYTES)
  ) {
    return null;
  }
  const challenge = request.headers.get("x-tomodachi-audit-challenge");
  if (!challenge || !HEX_64.test(challenge)) return null;
  const bytes = await readBoundedRequest(request);
  if (!bytes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    JSON.stringify(Object.keys(parsed).sort()) !==
      JSON.stringify(["creationId"])
  ) {
    return null;
  }
  const creationId = (parsed as Record<string, unknown>).creationId;
  return typeof creationId === "string" && UUID_V4.test(creationId)
    ? { challenge, creationId: creationId.toLowerCase() }
    : null;
}

async function readBoundedRequest(
  request: Request,
): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function attestedJson(
  value: unknown,
  challenge: string,
  attestationKey: string,
): Promise<Response> {
  const body = JSON.stringify(value);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(attestationKey),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${challenge}.${body}`),
    ),
  );
  const base64url = btoa(String.fromCharCode(...signature))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Tomodachi-Audit-Attestation": base64url,
    },
    status: 200,
  });
}

export async function handleR2PrefixAudit(
  request: Request,
  env: AuditEnv,
): Promise<Response> {
  if (
    typeof env.AUDIT_NONCE !== "string" ||
    env.AUDIT_NONCE.length < 32 ||
    typeof env.AUDIT_ATTESTATION_KEY !== "string" ||
    env.AUDIT_ATTESTATION_KEY.length < 64 ||
    request.headers.get("x-tomodachi-audit-nonce") !== env.AUDIT_NONCE
  ) {
    return error();
  }
  const input = await parseRequest(request);
  if (!input) return error();

  const prefix = `private/creations/${input.creationId}/`;
  const listed = await env.PROJECTS.list({
    limit: MAX_AUDIT_OBJECTS + 1,
    prefix,
  });
  if (listed.truncated || listed.objects.length > MAX_AUDIT_OBJECTS) {
    return error();
  }

  const seen = new Set<string>();
  let totalBytes = 0;
  const objects: Array<{ key: string; size: number }> = [];
  for (const object of listed.objects) {
    if (
      typeof object.key !== "string" ||
      !object.key.startsWith(prefix) ||
      seen.has(object.key) ||
      !Number.isSafeInteger(object.size) ||
      object.size < 0 ||
      object.size > MAX_AUDIT_OBJECT_BYTES
    ) {
      return error();
    }
    seen.add(object.key);
    totalBytes += object.size;
    if (totalBytes > MAX_AUDIT_PREFIX_BYTES) return error();
    objects.push({ key: object.key, size: object.size });
  }
  objects.sort((left, right) => left.key.localeCompare(right.key));
  return attestedJson({ objects }, input.challenge, env.AUDIT_ATTESTATION_KEY);
}

export default {
  fetch(request, env) {
    return handleR2PrefixAudit(request, env);
  },
} satisfies ExportedHandler<AuditEnv>;
