# Mii-pixelart

> Browser-first Mii pixel-art studio paired with practical Tomodachishare breach-recovery guides for Tomodachi Life players.

**Live site:** [tomodachi.pw](https://tomodachi.pw/)

**Canonical source:** [GitHub](https://github.com/RazonIn4K/Mii-pixelart). GitLab is used only as a private continuity mirror; issues, pull requests, and releases belong on GitHub.

[![License: MIT](https://img.shields.io/badge/license-MIT-101016?style=flat-square)](./living-the-grid-studio/LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A1-d94f4f?style=flat-square)](https://tomodachi.pw/support)

This repository holds the source of [tomodachi.pw](https://tomodachi.pw/). The application code lives in the [`living-the-grid-studio/`](./living-the-grid-studio/) subdirectory.

## What's inside

- **Studio** ([/studio](https://tomodachi.pw/studio)) — Import a face photo, character art, logo, meme, or JSON file; crop/frame it for the mask or icon, reduce it to the Studio's 84-color working palette, preview before commit, touch up, optimize, and export manual repaint references. The palette is a Studio aid, not a verified proprietary game palette.
- **Recovery hub** — Browser-only password breach check using HIBP k-anonymity, plus an account-gated OpenRouter recovery assistant. Built for visitors arriving from the Tomodachishare credential leak.
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
- Cloudflare Worker + Static Assets, with D1, private R2, KV, and rate-limit bindings
- Cloudflare Web Analytics
- Stripe Checkout with HMAC-SHA256 webhook verification at the edge
- OpenRouter free-tier model rotation (Gemma 4 vision, GPT-OSS 120B, Nemotron 3 Super 120B)

The interesting engineering bit is the Worker document renderer: it UA-sniffs known search crawlers and serves safe route-specific HTML, canonical/Open Graph metadata, and JSON-LD, while real browsers receive the React SPA through Static Assets. See [`living-the-grid-studio/worker/documents.ts`](./living-the-grid-studio/worker/documents.ts).

## License

[MIT](./living-the-grid-studio/LICENSE). This is an unofficial fan tool. Tomodachi Life is a trademark of Nintendo Co., Ltd. — this project is not affiliated with, endorsed by, or sponsored by Nintendo.
