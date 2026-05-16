/**
 * Validate that a checkout URL handed back by our /api/stripe/* endpoint
 * actually points at Stripe before we redirect the browser to it.
 *
 * The real attack surface is our Pages Function — if a compromised backend
 * returned a hostile origin in `payload.url`, an unguarded
 * `window.location.assign(payload.url)` would happily send the user there.
 * This guard makes the client refuse to follow any non-Stripe URL even when
 * the upstream is misbehaving.
 *
 * Allowed origins (kept minimal so the allowlist doesn't drift):
 *   - checkout.stripe.com   — Checkout Session URL
 *   - buy.stripe.com        — Stripe Payment Link URL (used by the tip jar's
 *                              optional VITE_STRIPE_DONATION_LINK)
 */
const ALLOWED_HOSTS = new Set([
  "checkout.stripe.com",
  "buy.stripe.com",
]);

export function isStripeRedirectSafe(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Convenience wrapper. Throws if the URL isn't on the Stripe allowlist so
 * callers can surface a clear error to the user instead of silently failing.
 */
export function assertStripeRedirect(url: unknown): string {
  if (!isStripeRedirectSafe(url)) {
    throw new Error(
      "Refusing to redirect: checkout URL is not on the Stripe allowlist.",
    );
  }
  return url;
}
