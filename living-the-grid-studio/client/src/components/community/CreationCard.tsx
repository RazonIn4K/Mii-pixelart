import { Heart, MessageCircle, MoreHorizontal } from "lucide-react";
import { Link } from "wouter";
import type { CreationSummary } from "@/lib/community/types";
import { formatCommunityDate, formatCount } from "@/lib/community/format";
import { IslandAvatar } from "./IslandAvatar";

export function CreationCard({
  creation,
  href,
  menuOpen = false,
  onLike,
  onMenu,
}: {
  creation: CreationSummary;
  href?: string;
  menuOpen?: boolean;
  onLike?: (creation: CreationSummary) => void;
  onMenu?: (creation: CreationSummary) => void;
}) {
  const creationHref = href ?? `/creation/${encodeURIComponent(creation.slug)}`;
  return (
    <article className="community-card group">
      <Link
        href={creationHref}
        className="block overflow-hidden rounded-[1.05rem] bg-[var(--island-blue-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        aria-label={`View ${creation.title}`}
      >
        {creation.thumbnailUrl || creation.previewUrl ? (
          <img
            src={creation.thumbnailUrl ?? creation.previewUrl ?? ""}
            alt={`Preview of ${creation.title}`}
            className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            width={640}
            height={640}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="pixel-placeholder aspect-square" aria-hidden="true">
            <span /><span /><span /><span /><span /><span /><span /><span /><span />
          </div>
        )}
      </Link>

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
                className="mt-2 flex min-w-0 items-center gap-2 text-xs font-bold text-[var(--island-ink)]/55 hover:text-[var(--island-ink)]"
              >
                <IslandAvatar seed={creation.owner.avatarSeed} className="h-6 w-6" />
                <span className="truncate">{creation.owner.displayName}</span>
              </Link>
            ) : null}
          </div>
          {onMenu ? (
            <button
              type="button"
              onClick={() => onMenu(creation)}
              className="rounded-full p-2 text-[var(--island-ink)]/45 hover:bg-[var(--island-paper)] hover:text-[var(--island-ink)]"
              aria-label={`More actions for ${creation.title}`}
              aria-expanded={menuOpen}
              aria-controls={`project-actions-${creation.id}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-[var(--island-ink)]/50">
          <span>{formatCommunityDate(creation.publishedAt ?? creation.updatedAt)}</span>
          <div className="flex items-center gap-3">
            {onLike ? (
              <button
                type="button"
                onClick={() => onLike(creation)}
                className="inline-flex items-center gap-1 rounded-full"
                aria-label={`${creation.isLiked ? "Unlike" : "Like"} ${creation.title}`}
                aria-pressed={Boolean(creation.isLiked)}
              >
                <Heart className={`h-3.5 w-3.5 ${creation.isLiked ? "fill-primary text-primary" : ""}`} />
                {formatCount(creation.likeCount)}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1" aria-label={`${formatCount(creation.likeCount)} likes`}>
                <Heart className="h-3.5 w-3.5" />
                {formatCount(creation.likeCount)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" />
              {formatCount(creation.commentCount)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
