/**
 * Catalog of paid products surfaced on /unlock.
 *
 * Each entry describes one Stripe Checkout line item. We intentionally keep
 * the source of truth here (not in Stripe) so the frontend and the Pages
 * Function agree on what is sellable. Prices are stored in the smallest
 * currency unit (cents for USD).
 */

export interface PaidProduct {
  id: string;
  /** Human-friendly display name. */
  name: string;
  /** Short marketing description shown on /unlock. */
  description: string;
  /** Smallest currency unit. 999 = $9.99 USD. */
  amount: number;
  currency: "usd";
  /** Where to drop the visitor after Stripe redirects them back. */
  successPath: string;
  /** Optional bullet list shown on /unlock under the description. */
  perks?: string[];
  /** Anything the buyer should know before purchasing. */
  caveat?: string;
}

export const PAID_PRODUCTS: PaidProduct[] = [
  {
    id: "breach-recovery-checklist",
    name: "Breach Recovery Checklist",
    description:
      "A printable 12-step recovery flow for the Tomodachishare breach. Covers password rotation, 2FA migration, session revocation, and a 30-day monitoring plan.",
    amount: 900,
    currency: "usd",
    successPath: "/unlock?product=breach-recovery-checklist",
    perks: [
      "PDF + Markdown formats",
      "Sample email templates for contacting services that reused your password",
      "Lifetime updates as the breach disclosure evolves",
    ],
  },
  {
    id: "consult-30",
    name: "30-min Recovery Consult",
    description:
      "One scheduled call with a security-aware operator. We walk through your specific exposure and leave you with a written action plan.",
    amount: 4900,
    currency: "usd",
    successPath: "/unlock?product=consult-30",
    perks: [
      "Google Meet link delivered after checkout",
      "Written follow-up summary within 24 hours",
      "Reschedule any time with 24h notice",
    ],
    caveat:
      "Not legal or law-enforcement advice. For active criminal incidents contact the appropriate authorities.",
  },
];

export function findProduct(id: string): PaidProduct | undefined {
  return PAID_PRODUCTS.find((product) => product.id === id);
}

/** Formats `amount` (in cents) for display, e.g. 900 -> "$9.00". */
export function formatPrice(amount: number, currency: PaidProduct["currency"]): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}
