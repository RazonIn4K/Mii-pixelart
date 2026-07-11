const encoder = new TextEncoder();

export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return hex(new Uint8Array(signature));
}

export async function pseudonymize(
  env: Env,
  purpose: "client_ip" | "moderator" | "reporter",
  value: string,
): Promise<string> {
  const configured = env.PSEUDONYM_KEY?.trim();
  const secret = configured || (env.ENVIRONMENT === "local"
    ? "tomodachi-local-only-pseudonym-key"
    : null);
  if (!secret) {
    // This error is deliberately handled by the Worker's redacted error path.
    // Never fall back to an unkeyed digest outside local development.
    throw new Error("Pseudonym key is not configured.");
  }
  return hmacSha256(secret, `${purpose}\u0000${value}`);
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function secretKey(secret: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return new Uint8Array(digest);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function safeRelativeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/me";
  }
  try {
    const parsed = new URL(value, "https://relative.invalid");
    if (parsed.origin !== "https://relative.invalid") return "/me";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/me";
  }
}
