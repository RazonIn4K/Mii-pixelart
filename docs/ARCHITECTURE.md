# Architecture

This repository's system map is an [Archify](https://tt-a1i.github.io/archify/) specification.

- Spec: `docs/archify/mii-pixelart-architecture.json`
- Type: architecture (showcase)
- Captured: 2026-08-27

## Summary

Tomodachi Pixel Art Studio is a React 19 Vite application hosted on Cloudflare Pages at tomodachi.pw that communicates with a Hono Worker via /api/* routes. The backend uses D1 SQLite with FTS5 for identity and social data, R2 for project revisions and media storage, and KV to cache the OpenRouter model list. Authentication is handled via Google OIDC with authorization-code + PKCE, while OpenRouter provides AI chat and image generation capabilities.

## Regenerate the interactive HTML

Do not commit the generated HTML (~700KB).

```bash
npx -y skills add tt-a1i/archify --skill archify --agent cursor --global --copy --yes
node bin/archify.mjs deliver architecture docs/archify/mii-pixelart-architecture.json /tmp/mii-pixelart.html --quality showcase
```
