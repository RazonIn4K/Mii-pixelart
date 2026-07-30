declare const __TOMODACHI_SOURCE_COMMIT__: string | undefined;

const FULL_GIT_SHA = /^[0-9a-f]{40}$/iu;
const WORKER_VERSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UNBOUND_SOURCE_COMMIT = "0".repeat(40);
const UNBOUND_WORKER_VERSION = "00000000-0000-0000-0000-000000000000";

export function runtimeSourceCommit(): string {
  const candidate =
    typeof __TOMODACHI_SOURCE_COMMIT__ === "string"
      ? __TOMODACHI_SOURCE_COMMIT__
      : "";
  return FULL_GIT_SHA.test(candidate)
    ? candidate.toLowerCase()
    : UNBOUND_SOURCE_COMMIT;
}

export function applyReleaseIdentityHeaders(headers: Headers, env: Env): void {
  headers.set("X-Tomodachi-Source-Commit", runtimeSourceCommit());
  headers.set("X-Tomodachi-Environment", env.ENVIRONMENT);
  headers.set(
    "X-Tomodachi-Worker-Version",
    WORKER_VERSION_ID.test(env.CF_VERSION_METADATA?.id ?? "")
      ? env.CF_VERSION_METADATA.id.toLowerCase()
      : UNBOUND_WORKER_VERSION,
  );
  headers.set(
    "X-Tomodachi-Community-Mutations",
    env.COMMUNITY_MUTATIONS_ENABLED === "true" ? "enabled" : "disabled",
  );
}
