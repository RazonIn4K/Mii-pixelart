import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { cp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

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

export default defineConfig({
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
    strictPort: false,
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
