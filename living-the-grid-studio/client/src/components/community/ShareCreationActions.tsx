import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function absoluteShareUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

export function ShareCreationActions({
  path,
  title,
  showView = true,
  className,
}: {
  path: string;
  title: string;
  showView?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absoluteShareUrl(path));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
      toast.success("Share link copied");
    } catch {
      toast.error("The share link could not be copied.");
    }
  };

  const share = async () => {
    const url = absoluteShareUrl(path);
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await copy();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("This device could not open the share sheet.");
    }
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label={`Share ${title}`}>
      {showView ? (
        <Button asChild type="button">
          <Link href={path}><ExternalLink /> View creation</Link>
        </Button>
      ) : null}
      <Button type="button" variant="outline" onClick={() => void copy()}>
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
      </Button>
      <Button type="button" variant="outline" onClick={() => void share()}>
        <Share2 /> Share
      </Button>
    </div>
  );
}
