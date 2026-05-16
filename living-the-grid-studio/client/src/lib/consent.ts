/**
 * Lightweight cookie / tracking-consent state.
 *
 * Persisted in `localStorage` under `ltg.consent.v1`. We deliberately keep the
 * schema small and additive so we never have to migrate older visitors. Any
 * code that wants to fire a tracking pixel, AdSense script, or analytics call
 * should gate on `getConsent().marketing === true` and subscribe to
 * `onConsentChange` so it can react if the user updates their choice later.
 */

export type ConsentDecision = "accepted" | "rejected" | "unset";

export interface ConsentState {
  /** True when the visitor has explicitly accepted marketing / ad cookies. */
  marketing: boolean;
  /** True when the visitor has explicitly accepted product analytics. */
  analytics: boolean;
  /** Always true — essential cookies do not need consent under GDPR/CCPA. */
  essential: true;
  decision: ConsentDecision;
  /** ISO timestamp of the last decision; useful for audit. */
  decidedAt: string | null;
}

export const STORAGE_KEY = "ltg.consent.v1";

const DEFAULT_STATE: ConsentState = {
  marketing: false,
  analytics: false,
  essential: true,
  decision: "unset",
  decidedAt: null,
};

type Listener = (state: ConsentState) => void;
const listeners = new Set<Listener>();

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getConsent(): ConsentState {
  if (!isBrowser()) return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      essential: true,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function setConsent(
  next: Pick<ConsentState, "marketing" | "analytics"> & {
    decision: Exclude<ConsentDecision, "unset">;
  },
): ConsentState {
  const state: ConsentState = {
    marketing: Boolean(next.marketing),
    analytics: Boolean(next.analytics),
    essential: true,
    decision: next.decision,
    decidedAt: new Date().toISOString(),
  };
  if (isBrowser()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* Storage might be disabled in private browsing; ignore. */
    }
  }
  listeners.forEach((listener) => {
    listener(state);
  });
  return state;
}

export function resetConsent(): ConsentState {
  if (isBrowser()) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((listener) => {
    listener(DEFAULT_STATE);
  });
  return DEFAULT_STATE;
}

export function onConsentChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
