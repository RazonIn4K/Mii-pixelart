import { FileJson2, Heart, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import type { CreationSummary } from "@/lib/community/types";
import { formatCommunityDate, formatCount } from "@/lib/community/format";
import { IslandAvatar } from "./IslandAvatar";

export function CreationCard({
  creation,
  href,
  actions,
  onLike,
  onTag,
  tagHref,
}: {
  creation: CreationSummary;
  href?: string;
  actions?: ReactNode;
  onLike?: (creation: CreationSummary) => void;
  onTag?: (tag: string) => void;
  tagHref?: (tag: string) => string;
}) {
  const creationHref = href ?? `/creation/${encodeURIComponent(creation.slug)}`;
  const coverImage =
    creation.images?.find((image) => image.isCover) ?? creation.images?.[0];
  const imageSource =
    coverImage?.thumbnailUrl ??
    creation.thumbnailUrl ??
    creation.primaryImageUrl ??
    creation.previewUrl;
  const imageAlt = coverImage?.altText || `Preview of ${creation.title}`;
  return (
    <article className="community-card group">
      <div className="relative m-2 mb-0 overflow-hidden rounded-[1.05rem] bg-[var(--island-blue-soft)]">
        <Link
          href={creationHref}
          className="block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary/35"
          aria-label={`View ${creation.title}`}
        >
          {imageSource ? (
            <img
              src={imageSource}
              alt={imageAlt}
              className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
              width={640}
              height={480}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="pixel-placeholder aspect-[4/3]" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          )}
        </Link>
        {creation.downloadEnabled ? (
          <div
            className="pointer-events-none absolute inset-x-2 bottom-2 flex justify-end"
            aria-hidden="true"
          >
            <span className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/92 px-2.5 py-1 text-[10px] font-black text-[var(--island-ink)] shadow-sm backdrop-blur">
              <FileJson2 className="h-3 w-3" /> Studio JSON available
            </span>
          </div>
        ) : null}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={creationHref}
              className="line-clamp-2 font-black leading-tight tracking-[-0.02em] text-[var(--island-ink)] hover:text-primary"
            >
              {creation.title}
            </Link>
            {creation.owner.username ? (
              <Link
                href={`/u/${encodeURIComponent(creation.owner.username)}`}
                className="mt-2 flex min-w-0 items-center gap-2 rounded-lg text-xs font-bold text-[var(--island-ink)]/55 hover:text-[var(--island-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <IslandAvatar
                  seed={creation.owner.avatarSeed}
                  className="h-6 w-6"
                />
                <span className="truncate">
                  By {creation.owner.displayName}
                </span>
              </Link>
            ) : null}
          </div>
          {actions ?? null}
        </div>

        {creation.tags.length ? (
          <div
            className="mt-4 flex min-w-0 flex-wrap gap-1.5"
            aria-label={`Tags for ${creation.title}`}
          >
            {creation.tags.slice(0, 3).map((tag) =>
              onTag ? (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onTag(tag)}
                  aria-label={`Filter by ${tag}`}
                  className="max-w-full rounded-full border border-[var(--island-ink)]/10 bg-[var(--island-yellow-soft)] px-2.5 py-1 text-[10px] font-black text-[var(--island-ink)]/65 hover:border-[var(--island-ink)]/35 hover:text-[var(--island-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <span className="block max-w-28 truncate">#{tag}</span>
                </button>
              ) : (
                <Link
                  key={tag}
                  href={
                    tagHref?.(tag) ?? `/discover?tag=${encodeURIComponent(tag)}`
                  }
                  aria-label={`Browse creations tagged ${tag}`}
                  className="max-w-full rounded-full border border-[var(--island-ink)]/10 bg-[var(--island-yellow-soft)] px-2.5 py-1 text-[10px] font-black text-[var(--island-ink)]/65 hover:border-[var(--island-ink)]/35 hover:text-[var(--island-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <span className="block max-w-28 truncate">#{tag}</span>
                </Link>
              ),
            )}
            {creation.tags.length > 3 ? (
              <span
                className="rounded-full bg-[var(--island-ink)]/6 px-2.5 py-1 text-[10px] font-black text-[var(--island-ink)]/50"
                aria-label={`${creation.tags.length - 3} more tags`}
              >
                +{creation.tags.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--island-ink)]/8 pt-3 text-xs font-bold text-[var(--island-ink)]/50">
          <span>
            {formatCommunityDate(creation.publishedAt ?? creation.updatedAt)}
          </span>
          <div className="flex items-center gap-3">
            {onLike ? (
              <button
                type="button"
                onClick={() => onLike(creation)}
                className="inline-flex min-h-8 items-center gap-1 rounded-full px-1.5 hover:bg-[var(--island-coral)]/12 hover:text-[var(--island-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                aria-label={`${creation.isLiked ? "Unlike" : "Like"} ${creation.title}`}
                aria-pressed={Boolean(creation.isLiked)}
              >
                <Heart
                  className={`h-3.5 w-3.5 ${creation.isLiked ? "fill-primary text-primary" : ""}`}
                />
                {formatCount(creation.likeCount)}
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1"
                aria-label={`${formatCount(creation.likeCount)} likes`}
              >
                <Heart className="h-3.5 w-3.5" />
                {formatCount(creation.likeCount)}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1"
              aria-label={`${formatCount(creation.commentCount)} comments`}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {formatCount(creation.commentCount)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
