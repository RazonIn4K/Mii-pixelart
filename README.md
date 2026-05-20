# Mii-pixelart

> Browser-first Mii pixel-art studio paired with practical Tomodachishare breach-recovery guides for Tomodachi Life players.

**Live site:** [tomodachi.pw](https://tomodachi.pw/)

[![License: MIT](https://img.shields.io/badge/license-MIT-101016?style=flat-square)](./living-the-grid-studio/LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A1-d94f4f?style=flat-square)](https://tomodachi.pw/support)

This repository holds the source of [tomodachi.pw](https://tomodachi.pw/). The application code lives in the [`living-the-grid-studio/`](./living-the-grid-studio/) subdirectory.

## What's inside

- **Studio** ([/studio](https://tomodachi.pw/studio)) — Import a face photo, character art, logo, meme, or JSON file; crop/frame it for the mask or icon, snap to the 84-color Tomodachi Life: Living the Dream palette, preview before commit, touch up, optimize, and export repaint references.
- **Recovery hub** — Browser-only password breach check using HIBP k-anonymity, plus an OpenRouter-backed recovery assistant. Built for visitors arriving from the Tomodachishare credential leak.
- **Guides** ([/guides](https://tomodachi.pw/guides)) — Long-form articles on Mii creation, gameplay basics, breach recovery, and QR code save backup.
- **Paid extras** ([/unlock](https://tomodachi.pw/unlock)) — Optional $9 detailed recovery checklist plus a $49 30-min consult.

## Where to start

| If you want to...                                         | Open this                                                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Use the live site                                         | [tomodachi.pw](https://tomodachi.pw/)                                                                                        |
| Read the architecture, contributing guide, and tech stack | [`living-the-grid-studio/README.md`](./living-the-grid-studio/README.md)                                                     |
| Read the detailed implementation atlas                    | [`living-the-grid-studio/PROJECT_STACK_AND_IMPLEMENTATION.md`](./living-the-grid-studio/PROJECT_STACK_AND_IMPLEMENTATION.md) |
| Report a security issue                                   | [`living-the-grid-studio/SECURITY.md`](./living-the-grid-studio/SECURITY.md)                                                 |
| See the changelog                                         | [`living-the-grid-studio/CHANGELOG.md`](./living-the-grid-studio/CHANGELOG.md)                                               |
| Sponsor the project                                       | [tomodachi.pw/support](https://tomodachi.pw/support) or the Sponsor button at the top of this repo                           |

## Tech stack (overview)

- React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui/Radix primitives
- Cloudflare Pages + Pages Functions (edge runtime)
- Cloudflare KV cache + Cloudflare Web Analytics
- Stripe Checkout with HMAC-SHA256 webhook verification at the edge
- OpenRouter free-tier model rotation (DeepSeek V4 Flash, GPT-OSS 120B, GLM 4.5 Air, Nemotron 3 Super 120B)

The interesting engineering bit is the edge pre-render: Cloudflare Pages middleware UA-sniffs known search crawlers (Googlebot, Bingbot, DuckDuckBot, Applebot, etc.) and serves a static pre-rendered HTML shell with per-route JSON-LD, while real browsers continue to receive the React SPA. No SSR framework needed — just one TS file at the edge. See [`living-the-grid-studio/functions/_middleware.ts`](./living-the-grid-studio/functions/_middleware.ts).

## License

[MIT](./living-the-grid-studio/LICENSE). This is an unofficial fan tool. Tomodachi Life is a trademark of Nintendo Co., Ltd. — this project is not affiliated with, endorsed by, or sponsored by Nintendo.
