import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { communityApi, jsonBody, messageFromError } from "@/lib/community/api";
import type { CommunityUser } from "@/lib/community/types";
import { cn } from "@/lib/utils";

export function AvatarRegenerationButton({
  className,
}: {
  className?: string;
}) {
  const { applyAccountUpdate } = useAuth();
  const [regenerating, setRegenerating] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const regenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    setAnnouncement("");
    try {
      const result = await communityApi<CommunityUser>("/api/me", {
        method: "PATCH",
        body: jsonBody({ regenerateAvatar: true }),
      });
      applyAccountUpdate(result.data);
      const message =
        "New avatar generated. It now appears on your profile, creations, and comments.";
      setAnnouncement(message);
      toast.success("New avatar generated");
    } catch (error) {
      const message = messageFromError(error);
      setAnnouncement(`Avatar could not be changed. ${message}`);
      toast.error(message);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <span className={cn("inline-flex", className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={regenerating}
        aria-busy={regenerating}
        onClick={() => void regenerate()}
      >
        <RefreshCw
          className={regenerating ? "motion-safe:animate-spin" : undefined}
        />
        {regenerating ? "Generating…" : "Try another avatar"}
      </Button>
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </span>
    </span>
  );
}
