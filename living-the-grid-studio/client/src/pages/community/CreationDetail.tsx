import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, Heart, MessageCircle, Pencil, Save, Trash2, X } from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CommunityError, CommunityLoading } from "@/components/community/CommunityState";
import { IslandAvatar } from "@/components/community/IslandAvatar";
import { ReportDialog } from "@/components/community/ReportDialog";
import { ShareCreationActions } from "@/components/community/ShareCreationActions";
import { CreationShowcaseGallery } from "@/components/community/CreationShowcaseGallery";
import { CommunityShell } from "@/components/layout/CommunityShell";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { communityApi, jsonBody, messageFromError } from "@/lib/community/api";
import { formatCommunityDate, formatCount } from "@/lib/community/format";
import { ensureCommunityMutationReady } from "@/lib/community/onboarding";
import type { CommunityComment, CreationDetail } from "@/lib/community/types";

export default function CreationDetailPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [creation, setCreation] = useState<CreationDetail | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(creation?.title ?? "Community creation");

  const loadComments = useCallback(async (creationId: string, nextCursor?: string) => {
    if (nextCursor) setCommentsLoadingMore(true);
    try {
      const commentResult = await communityApi<CommunityComment[]>(`/api/creations/${creationId}/comments${nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ""}`);
      setComments((current) => {
        if (!nextCursor) return commentResult.data;
        const unique = new Map([...current, ...commentResult.data].map((comment) => [comment.id, comment]));
        return Array.from(unique.values()).sort((left, right) => left.createdAt - right.createdAt);
      });
      setCommentsCursor(commentResult.meta?.nextCursor ?? null);
      setCommentsError(null);
    } catch (commentError) {
      setCommentsError(messageFromError(commentError));
    } finally {
      setCommentsLoadingMore(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await communityApi<CreationDetail>(`/api/public/creations/${encodeURIComponent(slug)}`);
      setCreation(result.data);
      setComments([]);
      setCommentsCursor(null);
      setError(null);
      await loadComments(result.data.id);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
    }
  }, [loadComments, slug]);

  useEffect(() => { void load(); }, [load]);

  const toggleLike = async () => {
    if (!creation) return;
    if (!user) {
      toast.info("Sign in when you want to like a creation.");
      return;
    }
    if (!ensureCommunityMutationReady(user)) return;
    const liked = !creation.isLiked;
    setCreation({ ...creation, isLiked: liked, likeCount: Math.max(0, creation.likeCount + (liked ? 1 : -1)) });
    try {
      await communityApi(`/api/creations/${creation.id}/like`, { method: liked ? "POST" : "DELETE", body: jsonBody({}) });
    } catch (likeError) {
      setCreation(creation);
      toast.error(messageFromError(likeError));
    }
  };

  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!creation || !body.trim()) return;
    if (user && !ensureCommunityMutationReady(user)) return;
    setSubmitting(true);
    try {
      const result = await communityApi<CommunityComment>(`/api/creations/${creation.id}/comments`, {
        method: "POST",
        body: jsonBody({ body: body.trim() }),
      });
      setComments((current) => [...current, result.data].sort((left, right) => left.createdAt - right.createdAt));
      setCreation((current) => current ? { ...current, commentCount: current.commentCount + 1 } : current);
      setBody("");
    } catch (commentError) {
      toast.error(messageFromError(commentError));
    } finally {
      setSubmitting(false);
    }
  };

  const saveCommentEdit = async (comment: CommunityComment) => {
    const nextBody = editBody.trim();
    if (!nextBody) return;
    if (user && !ensureCommunityMutationReady(user)) return;
    setSubmitting(true);
    try {
      const result = await communityApi<CommunityComment>(`/api/comments/${comment.id}`, {
        method: "PATCH",
        body: jsonBody({ body: nextBody }),
      });
      setComments((current) => current.map((item) => item.id === comment.id ? result.data : item));
      setEditingId(null);
      setEditBody("");
      toast.success("Comment updated");
    } catch (editError) {
      toast.error(messageFromError(editError));
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (comment: CommunityComment) => {
    if (user && !ensureCommunityMutationReady(user)) return;
    if (!window.confirm("Delete your comment? This cannot be undone.")) return;
    try {
      await communityApi(`/api/comments/${comment.id}`, {
        method: "DELETE",
        body: jsonBody({}),
      });
      setComments((current) => current.filter((item) => item.id !== comment.id));
      setCreation((current) => current ? { ...current, commentCount: Math.max(0, current.commentCount - 1) } : current);
      toast.success("Comment deleted");
    } catch (deleteError) {
      toast.error(messageFromError(deleteError));
    }
  };

  return (
    <CommunityShell>
      <div className="container py-10 sm:py-16">
        {loading ? <CommunityLoading label="Opening this creation…" /> : error || !creation ? <CommunityError message={error ?? "Creation not found"} retry={() => void load()} /> : (
          <>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-start">
              <div className="space-y-3">
                <CreationShowcaseGallery
                  fallbackAlt={`Pixel-art preview of ${creation.title}`}
                  fallbackImageUrl={creation.primaryImageUrl ?? creation.previewUrl}
                  images={creation.images}
                  title={creation.title}
                />
              </div>

              <aside className="community-detail-panel">
                <div className="flex flex-wrap items-center gap-2">
                  {creation.tags.map((tag) => <Link key={tag} href={`/search?q=${encodeURIComponent(tag)}`} className="rounded-full bg-[var(--island-blue-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em]">{tag}</Link>)}
                </div>
                <h1 className="mt-5 text-4xl font-black tracking-[-0.05em] text-[var(--island-ink)]">{creation.title}</h1>
                {creation.description ? <p className="mt-4 whitespace-pre-line text-sm font-medium leading-6 text-[var(--island-ink)]/65">{creation.description}</p> : null}
                <Link href={`/u/${encodeURIComponent(creation.owner.username ?? "")}`} className="mt-6 flex items-center gap-3 rounded-2xl bg-white p-3">
                  <IslandAvatar seed={creation.owner.avatarSeed} className="h-10 w-10" />
                  <span><span className="block text-sm font-black">{creation.owner.displayName}</span><span className="block text-xs text-[var(--island-ink)]/50">@{creation.owner.username}</span></span>
                </Link>
                <p className="mt-4 text-xs font-bold text-[var(--island-ink)]/45">Published {formatCommunityDate(creation.publishedAt)}</p>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={creation.isLiked ? "default" : "outline"}
                    aria-label={`${creation.isLiked ? "Unlike" : "Like"} ${creation.title}`}
                    aria-pressed={Boolean(creation.isLiked)}
                    onClick={toggleLike}
                  >
                    <Heart className={creation.isLiked ? "fill-current" : ""} /> {formatCount(creation.likeCount)}
                  </Button>
                  {creation.downloadEnabled ? <Button asChild variant="outline"><a href={`/api/creations/${creation.id}/media/project`} download><Download /> Project</a></Button> : null}
                  {creation.canEdit ? <Button asChild><Link href={`/studio?cloud=${creation.id}`}>Edit in Studio</Link></Button> : null}
                </div>
                <div className="mt-3 rounded-2xl bg-white p-3">
                  <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--island-ink)]/50">Share this creation</p>
                  <ShareCreationActions
                    path={`/creation/${encodeURIComponent(creation.slug)}`}
                    title={creation.title}
                    showView={false}
                    socialCardUrl={creation.socialImageUrl}
                  />
                </div>
                <div className="mt-4 flex justify-end"><ReportDialog targetType="creation" targetId={creation.id} /></div>
              </aside>
            </div>

            <section className="mx-auto mt-14 max-w-3xl" aria-labelledby="comments-title">
              <div className="flex items-center justify-between gap-4">
                <h2 id="comments-title" className="flex items-center gap-2 text-2xl font-black"><MessageCircle /> Comments <span className="text-sm text-[var(--island-ink)]/45">{creation.commentCount}</span></h2>
              </div>
              {!creation.commentsEnabled || creation.commentsLocked ? (
                <p className="mt-5 rounded-2xl bg-white p-5 text-sm text-[var(--island-ink)]/60">
                  {creation.commentsLocked ? "A moderator locked new comments. Existing discussion remains readable." : "The creator turned off new comments. Existing discussion remains readable."}
                </p>
              ) : user ? (
                <form onSubmit={addComment} className="mt-5 rounded-2xl border-2 border-[var(--island-ink)] bg-white p-4 shadow-[4px_4px_0_var(--island-ink)]">
                  <label htmlFor="new-comment" className="text-sm font-black">Join the conversation</label>
                  <Textarea id="new-comment" value={body} onChange={(event) => setBody(event.target.value.slice(0, 1000))} rows={3} className="mt-2" placeholder="Be kind and keep it constructive." />
                  <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{body.length}/1000</span><Button type="submit" disabled={submitting || !body.trim()}>{submitting ? "Posting…" : "Post comment"}</Button></div>
                </form>
              ) : <p className="mt-5 rounded-2xl bg-white p-5 text-sm text-[var(--island-ink)]/60">Sign in to comment. Reading stays open to everyone.</p>}
              <div className="mt-6 space-y-3">
                {comments.length ? comments.map((comment) => {
                      const ownsComment = user?.id === comment.author.id;
                      const editing = editingId === comment.id;
                      return (
                        <article key={comment.id} className="rounded-2xl border border-[var(--island-ink)]/10 bg-white p-4">
                          <div className="flex items-start gap-3">
                            <IslandAvatar seed={comment.author.avatarSeed} className="h-9 w-9" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2"><span className="text-sm font-black">{comment.author.displayName}</span><span className="text-xs text-[var(--island-ink)]/45">{formatCommunityDate(comment.createdAt)}{comment.updatedAt > comment.createdAt ? " · edited" : ""}</span></div>
                              {editing ? (
                                <div className="mt-3 space-y-2">
                                  <label htmlFor={`edit-comment-${comment.id}`} className="sr-only">Edit your comment</label>
                                  <Textarea id={`edit-comment-${comment.id}`} value={editBody} onChange={(event) => setEditBody(event.target.value.slice(0, 1000))} maxLength={1000} rows={3} autoFocus />
                                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{editBody.length}/1000</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { setEditingId(null); setEditBody(""); }}><X /> Cancel</Button><Button type="button" size="sm" disabled={submitting || !editBody.trim()} onClick={() => void saveCommentEdit(comment)}><Save /> Save edit</Button></div></div>
                                </div>
                              ) : <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--island-ink)]/70">{comment.body}</p>}
                            </div>
                            {!editing ? (
                              <div className="flex shrink-0 items-center gap-1">
                                {ownsComment ? <><Button type="button" variant="ghost" size="icon-sm" aria-label="Edit your comment" onClick={() => { setEditingId(comment.id); setEditBody(comment.body); }}><Pencil /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label="Delete your comment" className="text-destructive" onClick={() => void deleteComment(comment)}><Trash2 /></Button></> : <ReportDialog targetType="comment" targetId={comment.id} label="" />}
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                }) : <p className="py-8 text-center text-sm text-[var(--island-ink)]/50">No comments yet.</p>}
                {commentsError ? <div className="rounded-2xl border border-destructive/30 bg-red-50 p-4 text-sm text-red-950" role="alert"><p>{commentsError}</p><Button type="button" size="sm" variant="outline" className="mt-3 bg-white" onClick={() => void loadComments(creation.id)}>Retry comments</Button></div> : null}
                {commentsCursor ? <div className="pt-4 text-center"><Button type="button" variant="outline" className="rounded-full" disabled={commentsLoadingMore} onClick={() => void loadComments(creation.id, commentsCursor)}>{commentsLoadingMore ? "Loading…" : "Load more comments"}</Button></div> : null}
              </div>
            </section>
          </>
        )}
      </div>
    </CommunityShell>
  );
}
