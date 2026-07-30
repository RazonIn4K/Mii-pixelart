import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { cp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import {
  assertNoForbiddenReleaseSecretArtifacts,
  isForbiddenReleaseSecretFilename,
} from "./scripts/release-output-hygiene";

const FULL_GIT_SHA = /^[0-9a-f]{40}$/iu;
const UNBOUND_SOURCE_COMMIT = "0".repeat(40);

function sourceCommit(): string {
  const resolved = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: import.meta.dirname,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (!FULL_GIT_SHA.test(resolved)) {
    throw new Error("The build source commit could not be resolved.");
  }
  const dirty = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=normal"],
    {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  ).trim();
  if (dirty) {
    if (process.env.TOMODACHI_REQUIRE_CLEAN_SOURCE === "true") {
      throw new Error("A release build requires a clean Git source tree.");
    }
    return UNBOUND_SOURCE_COMMIT;
  }
  return resolved.toLowerCase();
}

function pagesRollbackAssets(): Plugin {
  const clientDirectory = path.resolve(import.meta.dirname, "dist", "client");
  const pagesDirectory = path.resolve(import.meta.dirname, "dist", "public");

  return {
    name: "tomodachi-pages-rollback-assets",
    apply: "build",
    async closeBundle() {
      try {
        if (!(await stat(clientDirectory)).isDirectory()) return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }

      await rm(pagesDirectory, { force: true, recursive: true });
      await cp(clientDirectory, pagesDirectory, { recursive: true });
    },
  };
}

function releaseOutputSecretHygiene(): Plugin {
  const outputDirectory = path.resolve(import.meta.dirname, "dist");

  return {
    name: "tomodachi-release-output-secret-hygiene",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (isForbiddenReleaseSecretFilename(path.basename(fileName))) {
          delete bundle[fileName];
        }
      }
    },
    async closeBundle() {
      await assertNoForbiddenReleaseSecretArtifacts(outputDirectory);
    },
  };
}

export default defineConfig({
  define: {
    __TOMODACHI_SOURCE_COMMIT__: JSON.stringify(sourceCommit()),
  },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      configPath: path.resolve(import.meta.dirname, "wrangler.jsonc"),
      inspectorPort: false,
      persistState: {
        path: path.resolve(import.meta.dirname, ".wrangler", "state"),
      },
      remoteBindings: false,
    }),
    pagesRollbackAssets(),
    releaseOutputSecretHygiene(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 3000,
    strictPort: true,
    host: "127.0.0.1",
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
