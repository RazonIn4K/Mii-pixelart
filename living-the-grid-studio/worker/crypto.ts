const encoder = new TextEncoder();

const PLACEHOLDER_PREFIXES = [
  "change-me",
  "change_me",
  "changeme",
  "dev-",
  "dev_",
  "development-",
  "example-",
  "example_",
  "local-",
  "local_",
  "placeholder",
  "replace-",
  "replace_",
  "test-only-",
  "test_only_",
  "test-",
  "test_",
  "your-",
  "your_",
] as const;

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
  const secret = env.ENVIRONMENT === "local"
    ? configured || "tomodachi-local-only-pseudonym-key"
    : isStrongRuntimeSecret(configured, env.ENVIRONMENT) ? configured : null;
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

export function isStrongRuntimeSecret(
  secret: string | undefined,
  environment: Env["ENVIRONMENT"],
): boolean {
  const value = secret?.trim();
  if (!value) return false;
  if (environment === "local") return true;
  if (encoder.encode(value).byteLength < 32) return false;
  const normalized = value.toLowerCase();
  return !PLACEHOLDER_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function isValidOidcCookieKey(secret: string | undefined): boolean {
  const value = secret?.trim();
  if (!value || !/^[A-Za-z0-9_-]+={0,2}$/u.test(value)) return false;
  try {
    return decodeBase64Url(value).byteLength === 32;
  } catch {
    return false;
  }
}

export function secretKey(secret: string): Uint8Array {
  if (!isValidOidcCookieKey(secret)) {
    throw new Error("OIDC cookie key must contain exactly 32 base64url-encoded bytes.");
  }
  return decodeBase64Url(secret.trim());
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
