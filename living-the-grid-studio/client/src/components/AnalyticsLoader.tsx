import { useEffect } from "react";
import { STORAGE_KEY, getConsent, onConsentChange } from "@/lib/consent";

const SCRIPT_ID = "tomodachi-opt-in-analytics";

/** Loads analytics only after explicit consent and stops it on revocation. */
export function AnalyticsLoader() {
  useEffect(() => {
    const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
    const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
    if (!endpoint || !websiteId) return;

    const sync = () => {
      const existing = document.getElementById(SCRIPT_ID);
      if (getConsent().analytics) {
        if (existing) return;
        const script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.defer = true;
        script.src = `${endpoint.replace(/\/$/, "")}/umami`;
        script.dataset.websiteId = websiteId;
        document.body.appendChild(script);
        return;
      }

      if (existing) {
        existing.remove();
        // An analytics bundle may retain navigation listeners after its script
        // node is removed. A one-time reload is the reliable revocation path;
        // the cleared/rejected consent state prevents the script from returning.
        window.location.reload();
      }
    };

    const unsubscribe = onConsentChange(sync);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    sync();
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
