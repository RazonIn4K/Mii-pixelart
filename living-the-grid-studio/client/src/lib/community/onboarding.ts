import { toast } from "sonner";
import type { CommunityUser } from "./types";
import {
  currentRelativeReturnTo,
  setupPathForReturnTo,
} from "./return-to";

/**
 * Public community pages remain readable before setup or Terms re-consent,
 * but every social/report mutation requires the current onboarding contract.
 * Keep this browser preflight aligned with requireOnboardedSession so people
 * receive a useful recovery path instead of a generic forbidden response.
 */
export function ensureCommunityMutationReady(
  user: Pick<CommunityUser, "termsAccepted" | "username">,
): boolean {
  if (user.username && user.termsAccepted === true) return true;

  toast.info(
    user.username
      ? "Review and accept the current Terms before using community features."
      : "Finish your profile before using community features.",
  );
  window.location.assign(
    setupPathForReturnTo(currentRelativeReturnTo()),
  );
  return false;
}
