#!/usr/bin/env bash
# Optional: bulk-sync current Doppler config secrets into a standalone Cloudflare Worker
# (not Cloudflare Pages — use Doppler's Cloudflare Pages integration for Pages).
# Run from a directory with wrangler.toml, with DOPPLER_TOKEN or doppler login active.
set -euo pipefail

if ! command -v doppler >/dev/null 2>&1; then
  echo "doppler CLI is required"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required"
  exit 1
fi

if ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler CLI is required"
  exit 1
fi

doppler secrets --json \
  | jq -c 'with_entries(.value = .value.computed)' \
  | wrangler secret bulk
