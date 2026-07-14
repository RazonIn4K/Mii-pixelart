import { Check, Copy, Download, ExternalLink, Share2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function absoluteShareUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function safeSocialCardUrl(value?: string | null): string | null {
  if (!value || typeof window === "undefined") return null;
  try {
    const url = new URL(value, window.location.origin);
    const isSocialCardPath = url.pathname.startsWith("/api/creations/")
      && (url.pathname.endsWith("/media/social") || url.pathname.endsWith("/social"));
    if (
      url.origin !== window.location.origin
      || !["http:", "https:"].includes(url.protocol)
      || url.username
      || url.password
      || !isSocialCardPath
    ) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function socialCardFilename(title: string): string {
  const basename = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${basename || "tomodachi-creation"}-social-card.jpg`;
}

export function ShareCreationActions({
  path,
  title,
  showView = true,
  socialCardUrl,
  className,
}: {
  path: string;
  title: string;
  showView?: boolean;
  socialCardUrl?: string | null;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const socialCardDownloadUrl = safeSocialCardUrl(socialCardUrl);

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
      {socialCardDownloadUrl ? (
        <Button asChild variant="outline">
          <a href={socialCardDownloadUrl} download={socialCardFilename(title)}>
            <Download /> Download social card
          </a>
        </Button>
      ) : null}
    </div>
  );
}
