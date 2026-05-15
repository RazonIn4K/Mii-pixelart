/**
 * Catalog of paid products surfaced on /unlock and /support.
 *
 * Each entry describes one Stripe Checkout line item. We intentionally keep
 * the source of truth here (not in Stripe) so the frontend and the Pages
 * Function agree on what is sellable. Prices are stored in the smallest
 * currency unit (cents for USD).
 *
 * Categories:
 *   - "recovery": gated digital deliverables shown on /unlock.
 *   - "consult":  scheduled human time, also on /unlock.
 *   - "support":  tip-jar style payments shown on /support; not gated content.
 */

export type ProductCategory = "recovery" | "consult" | "support";

export interface PaidProduct {
  id: string;
  /** Human-friendly display name. */
  name: string;
  /** Short marketing description shown on /unlock or /support. */
  description: string;
  /** Smallest currency unit. 999 = $9.99 USD. */
  amount: number;
  currency: "usd";
  /** Where to drop the visitor after Stripe redirects them back on success. */
  successPath: string;
  /**
   * Where to drop the visitor when they cancel out of Stripe. Defaults to the
   * /unlock cancel screen for legacy products; tip-jar products override this
   * so a canceled tip returns to /support instead of /unlock.
   */
  cancelPath?: string;
  /** Optional bullet list shown under the description. */
  perks?: string[];
  /** Anything the buyer should know before purchasing. */
  caveat?: string;
  /** Drives where the product is displayed and how unlocked content renders. */
  category: ProductCategory;
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
    cancelPath: "/unlock?canceled=1",
    category: "recovery",
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
    cancelPath: "/unlock?canceled=1",
    category: "consult",
    perks: [
      "Google Meet link delivered after checkout",
      "Written follow-up summary within 24 hours",
      "Reschedule any time with 24h notice",
    ],
    caveat:
      "Not legal or law-enforcement advice. For active criminal incidents contact the appropriate authorities.",
  },
  {
    id: "support-jar-5",
    name: "Support Jar — $5",
    description:
      "A small tip that helps keep the browser tools, guides, and template packs online.",
    amount: 500,
    currency: "usd",
    successPath: "/support?thanks=1&support=support-jar-5",
    cancelPath: "/support?canceled=1",
    category: "support",
  },
  {
    id: "support-jar-15",
    name: "Support Jar — $15",
    description:
      "A bigger thank-you that funds hosting, the AI assistant credits, and the next free guide.",
    amount: 1500,
    currency: "usd",
    successPath: "/support?thanks=1&support=support-jar-15",
    cancelPath: "/support?canceled=1",
    category: "support",
  },
  {
    id: "support-jar-25",
    name: "Support Jar — $25",
    description:
      "Enough to sponsor a new free guide end-to-end, from research to publishing.",
    amount: 2500,
    currency: "usd",
    successPath: "/support?thanks=1&support=support-jar-25",
    cancelPath: "/support?canceled=1",
    category: "support",
  },
];

export function findProduct(id: string): PaidProduct | undefined {
  return PAID_PRODUCTS.find((product) => product.id === id);
}

export function productsByCategory(category: ProductCategory): PaidProduct[] {
  return PAID_PRODUCTS.filter((product) => product.category === category);
}

/** Formats `amount` (in cents) for display, e.g. 900 -> "$9.00". */
export function formatPrice(amount: number, currency: PaidProduct["currency"]): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}
