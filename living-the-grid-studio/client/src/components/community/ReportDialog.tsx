import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { communityApi, jsonBody, messageFromError } from "@/lib/community/api";

const REASONS = [
  ["spam", "Spam or misleading"],
  ["harassment", "Harassment"],
  ["sexual_content", "Sexual content"],
  ["violence", "Violence"],
  ["personal_information", "Personal information"],
  ["copyright", "Copyright concern"],
  ["other", "Other"],
] as const;

export function ReportDialog({
  targetType,
  targetId,
  label,
}: {
  targetType: "creation" | "comment" | "user";
  targetId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await communityApi("/api/reports", {
        method: "POST",
        body: jsonBody({ targetType, targetId, reason, details: details.trim() }),
      });
      toast.success("Report sent to the moderation team");
      setOpen(false);
      setDetails("");
    } catch (error) {
      toast.error(messageFromError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label={label === "" ? `Report this ${targetType}` : undefined}>
          <Flag className="h-4 w-4" /> {label ?? "Report"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this {targetType}</DialogTitle>
          <DialogDescription>
            Reports are private. A moderator will review the context and take proportionate action.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`report-reason-${targetId}`}>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id={`report-reason-${targetId}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`report-details-${targetId}`}>Details (optional)</Label>
            <Textarea
              id={`report-details-${targetId}`}
              value={details}
              onChange={(event) => setDetails(event.target.value.slice(0, 2000))}
              placeholder="Share only what a moderator needs to understand the issue."
              rows={5}
            />
            <p className="text-right text-xs text-muted-foreground">{details.length}/2000</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
