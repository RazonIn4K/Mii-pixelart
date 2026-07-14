import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  EyeOff,
  Eye,
  ImageOff,
  LockKeyhole,
  MessageCircle,
  RotateCcw,
  ShieldAlert,
  UserRoundX,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CommunityEmpty, CommunityError, CommunityLoading } from "@/components/community/CommunityState";
import { RequireAuth } from "@/components/community/RequireAuth";
import { CommunityPageIntro, CommunityShell } from "@/components/layout/CommunityShell";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { communityApi, jsonBody, messageFromError, queryString } from "@/lib/community/api";
import { formatCommunityDate } from "@/lib/community/format";
import type { ReportRecord } from "@/lib/community/types";

type ReportFilter = "open" | "resolved" | "dismissed";
type TargetAction =
  | "hide_creation"
  | "restore_creation"
  | "hide_comment"
  | "restore_comment"
  | "suspend_user"
  | "restore_user"
  | "remove_profile_image"
  | "lock_comments"
  | "unlock_comments";

interface ModerationStats {
  openReports: number;
  suspendedUsers: number;
  hiddenCreations: number;
  hiddenComments: number;
}

interface ModerationTarget {
  id: string;
  type: "comment" | "creation" | "user";
  label: string;
  state: string;
  body?: string;
  description?: string;
  bio?: string;
  slug?: string;
  visibility?: string;
  username?: string | null;
  role?: string;
  owner?: { displayName: string; id: string; username?: string | null };
  author?: { displayName: string; id: string; username?: string | null };
  creation?: { id: string; slug: string; state: string; title: string };
  profileImageEvidence?: {
    capturedAt: number;
    imageId: string;
    mediaUrl: string;
    sha256: string;
  } | null;
}

interface ModerationContext {
  actions: { action: string; createdAt: number; id: string; reason: string }[];
  actionsCursor?: string | null;
  target: ModerationTarget;
}

const TARGET_ACTIONS: Record<TargetAction, { path: (report: ReportRecord) => string; success: string }> = {
  hide_creation: { path: (report) => `/api/moderation/creations/${report.targetId}/hide`, success: "Creation hidden" },
  restore_creation: { path: (report) => `/api/moderation/creations/${report.targetId}/restore`, success: "Creation restored as a private draft" },
  hide_comment: { path: (report) => `/api/moderation/comments/${report.targetId}/hide`, success: "Comment hidden" },
  restore_comment: { path: (report) => `/api/moderation/comments/${report.targetId}/restore`, success: "Comment restored" },
  suspend_user: { path: (report) => `/api/moderation/users/${report.targetId}/suspend`, success: "User suspended and sessions revoked" },
  restore_user: { path: (report) => `/api/moderation/users/${report.targetId}/restore`, success: "User restored" },
  remove_profile_image: { path: (report) => `/api/moderation/reports/${report.id}/remove-profile-image`, success: "Reported profile photo removed" },
  lock_comments: { path: (report) => `/api/moderation/creations/${report.targetId}/lock-comments`, success: "Creation comments locked" },
  unlock_comments: { path: (report) => `/api/moderation/creations/${report.targetId}/unlock-comments`, success: "Creation comments unlocked" },
};

export default function Moderation() {
  useDocumentTitle("Moderation queue", undefined, { noindex: true });
  const { user } = useAuth();
  const [filter, setFilter] = useState<ReportFilter>("open");
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [contexts, setContexts] = useState<Record<string, ModerationContext>>({});
  const [contextErrors, setContextErrors] = useState<Record<string, string>>({});
  const [loadingContextId, setLoadingContextId] = useState<string | null>(null);
  const [loadingContextActionsId, setLoadingContextActionsId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextCursor?: string) => {
    nextCursor ? setLoadingMore(true) : setLoading(true);
    try {
      const [reportResult, statsResult] = await Promise.all([
        communityApi<ReportRecord[]>(`/api/moderation/reports${queryString({ status: filter, limit: 50, cursor: nextCursor })}`),
        communityApi<ModerationStats>("/api/moderation/stats"),
      ]);
      setReports((current) => nextCursor ? [...current, ...reportResult.data] : reportResult.data);
      setCursor(reportResult.meta?.nextCursor ?? null);
      setStats(statsResult.data);
      setError(null);
    } catch (loadError) {
      setError(messageFromError(loadError));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter]);

  useEffect(() => {
    if (user?.role === "moderator" || user?.role === "admin") void load();
    else setLoading(false);
  }, [load, user]);

  const rationale = (report: ReportRecord): string => reasons[report.id]?.trim() ?? "";

  const reviewContext = async (report: ReportRecord) => {
    setLoadingContextId(report.id);
    try {
      const result = await communityApi<ModerationContext>(`/api/moderation/reports/${report.id}?limit=50`);
      setContexts((current) => ({
        ...current,
        [report.id]: { ...result.data, actionsCursor: result.meta?.nextCursor ?? null },
      }));
      setContextErrors((current) => {
        const next = { ...current };
        delete next[report.id];
        return next;
      });
    } catch (reviewError) {
      setContextErrors((current) => ({ ...current, [report.id]: messageFromError(reviewError) }));
    } finally {
      setLoadingContextId(null);
    }
  };

  const loadMoreContextActions = async (report: ReportRecord) => {
    const reviewed = contexts[report.id];
    if (!reviewed?.actionsCursor) return;
    setLoadingContextActionsId(report.id);
    try {
      const result = await communityApi<ModerationContext>(
        `/api/moderation/reports/${report.id}${queryString({ limit: 50, cursor: reviewed.actionsCursor })}`,
      );
      setContexts((current) => {
        const existing = current[report.id];
        if (!existing) return current;
        return {
          ...current,
          [report.id]: {
            ...result.data,
            actions: [...existing.actions, ...result.data.actions],
            actionsCursor: result.meta?.nextCursor ?? null,
          },
        };
      });
    } catch (reviewError) {
      setContextErrors((current) => ({ ...current, [report.id]: messageFromError(reviewError) }));
    } finally {
      setLoadingContextActionsId(null);
    }
  };

  const decideReport = async (
    report: ReportRecord,
    action: "resolve_report" | "dismiss_report",
    reason: string,
  ) => {
    await communityApi(`/api/moderation/reports/${report.id}/actions`, {
      method: "POST",
      body: jsonBody({ action, reason }),
    });
  };

  const decide = async (report: ReportRecord, action: "resolve_report" | "dismiss_report") => {
    const reason = rationale(report);
    if (!reason) return;
    setWorkingId(report.id);
    try {
      await decideReport(report, action, reason);
      toast.success(action === "dismiss_report" ? "Report dismissed" : "Report resolved without removing the target");
      await load();
    } catch (actionError) {
      toast.error(messageFromError(actionError));
    } finally {
      setWorkingId(null);
    }
  };

  const targetAction = async (
    report: ReportRecord,
    action: TargetAction,
    resolveAfter: boolean,
  ) => {
    const reason = rationale(report);
    if (!reason) return;
    setWorkingId(report.id);
    try {
      const definition = TARGET_ACTIONS[action];
      await communityApi(definition.path(report), {
        method: "POST",
        body: jsonBody({ action, reason }),
      });
      if (resolveAfter) {
        try {
          await decideReport(report, "resolve_report", reason);
        } catch (resolutionError) {
          toast.error(`${definition.success}, but the report still needs resolution: ${messageFromError(resolutionError)}`);
          await load();
          return;
        }
      }
      toast.success(resolveAfter ? `${definition.success} and report resolved` : definition.success);
      await load();
    } catch (actionError) {
      toast.error(messageFromError(actionError));
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <CommunityShell>
      <RequireAuth>
        <div className="container py-12 sm:py-16">
          {user?.role !== "moderator" && user?.role !== "admin" ? (
            <CommunityError message="This area is limited to assigned community moderators." />
          ) : (
            <>
              <CommunityPageIntro eyebrow="Moderator workspace" title="Review context, not just flags." description="Every decision requires a concise rationale. Target actions and report decisions are recorded separately so partial failures remain visible and recoverable." />

              {stats ? (
                <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Open reports", stats.openReports],
                    ["Suspended users", stats.suspendedUsers],
                    ["Hidden creations", stats.hiddenCreations],
                    ["Hidden comments", stats.hiddenComments],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border-2 border-[var(--island-ink)] bg-white p-4 shadow-[3px_3px_0_var(--island-ink)]">
                      <dt className="text-xs font-bold text-[var(--island-ink)]/55">{label}</dt>
                      <dd className="mt-1 text-2xl font-black text-[var(--island-ink)]">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <div className="mt-10 flex flex-wrap gap-2" role="group" aria-label="Filter moderation reports">
                {(["open", "resolved", "dismissed"] as const).map((status) => (
                  <Button key={status} type="button" variant={filter === status ? "default" : "outline"} className="rounded-full capitalize" aria-pressed={filter === status} onClick={() => setFilter(status)}>
                    {status}
                  </Button>
                ))}
              </div>

              <section className="mt-6" aria-live="polite" aria-busy={loading}>
                {loading ? <CommunityLoading label={`Loading ${filter} reports…`} /> : error ? <CommunityError message={error} retry={() => void load()} /> : !reports.length ? (
                  <CommunityEmpty title={`No ${filter} reports`} message={filter === "open" ? "The active queue is clear." : `Reports marked ${filter} will remain available here for audit and recovery actions.`} icon={ShieldAlert} />
                ) : (
                  <div className="space-y-4">
                    {reports.map((report) => {
                      const reason = rationale(report);
                      const busy = workingId === report.id;
                      const reviewed = contexts[report.id];
                      const contextLoading = loadingContextId === report.id;
                      return (
                        <article key={report.id} className="community-detail-panel" aria-labelledby={`report-${report.id}`}>
                          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                            <div>
                              <div className="flex flex-wrap gap-2"><Badge>{report.reason.replaceAll("_", " ")}</Badge><Badge variant="outline">{report.targetType}</Badge><Badge variant="secondary">{report.status}</Badge></div>
                              <h2 id={`report-${report.id}`} className="mt-3 text-lg font-black">{report.targetLabel || `${report.targetType} ${report.targetId.slice(0, 8)}`}</h2>
                              <p className="mt-1 text-xs text-muted-foreground">Reported {formatCommunityDate(report.createdAt)} · case {report.id.slice(0, 8)}</p>
                            </div>
                            <ShieldAlert className="h-6 w-6 text-primary" />
                          </div>
                          {report.details ? <p className="mt-4 whitespace-pre-line rounded-xl bg-muted/60 p-4 text-sm leading-6">{report.details}</p> : <p className="mt-4 text-sm text-muted-foreground">No additional details were provided.</p>}

                          <div className="mt-4 rounded-2xl border border-[var(--island-ink)]/15 bg-[var(--island-paper)] p-4">
                            {!reviewed ? (
                              <div>
                                <p className="text-sm font-black">Review the reported target before acting</p>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">This loads the current target state and its retained moderation history.</p>
                                <Button type="button" size="sm" variant="outline" className="mt-3 bg-white" disabled={contextLoading} onClick={() => void reviewContext(report)}>
                                  {contextLoading ? "Loading context…" : "Review target context"}
                                </Button>
                                {contextErrors[report.id] ? <p className="mt-2 text-xs text-destructive" role="alert">{contextErrors[report.id]}</p> : null}
                              </div>
                            ) : (
                              <div>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Current target</p><h3 className="mt-1 text-lg font-black">{reviewed.target.label}</h3></div>
                                  <div className="flex gap-2"><Badge variant="outline">{reviewed.target.type}</Badge><Badge variant="secondary">{reviewed.target.state}</Badge></div>
                                </div>
                                {reviewed.target.description || reviewed.target.body || reviewed.target.bio ? <p className="mt-3 whitespace-pre-line rounded-xl bg-white p-3 text-sm leading-6">{reviewed.target.description ?? reviewed.target.body ?? reviewed.target.bio}</p> : null}
                                {reviewed.target.type === "user" && reviewed.target.profileImageEvidence ? (
                                  <figure className="mt-3 overflow-hidden rounded-xl border border-amber-300 bg-white p-3">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                      <img
                                        src={reviewed.target.profileImageEvidence.mediaUrl}
                                        alt="Report-time profile photo evidence"
                                        className="h-28 w-28 shrink-0 rounded-xl border border-[var(--island-ink)]/15 object-cover"
                                      />
                                      <figcaption className="min-w-0 text-xs leading-5 text-muted-foreground">
                                        <strong className="block text-sm text-foreground">Private report-time photo</strong>
                                        Captured {formatCommunityDate(reviewed.target.profileImageEvidence.capturedAt)}. This normalized copy is visible only to moderators and is released after the report is decided.
                                        <span className="mt-1 block break-all font-mono text-[0.65rem]">SHA-256 {reviewed.target.profileImageEvidence.sha256}</span>
                                      </figcaption>
                                    </div>
                                  </figure>
                                ) : null}
                                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-muted-foreground">
                                  {reviewed.target.visibility ? <span>Visibility: {reviewed.target.visibility}</span> : null}
                                  {reviewed.target.role ? <span>Role: {reviewed.target.role}</span> : null}
                                  {reviewed.target.owner ? <span>Owner: {reviewed.target.owner.displayName}{reviewed.target.owner.username ? ` (@${reviewed.target.owner.username})` : ""}</span> : null}
                                  {reviewed.target.author ? <span>Author: {reviewed.target.author.displayName}{reviewed.target.author.username ? ` (@${reviewed.target.author.username})` : ""}</span> : null}
                                  {reviewed.target.type === "creation" && reviewed.target.slug && reviewed.target.state === "published" ? <Link href={`/creation/${encodeURIComponent(reviewed.target.slug)}`} className="underline">Open creation</Link> : null}
                                  {reviewed.target.type === "user" && reviewed.target.username && reviewed.target.state === "active" ? <Link href={`/u/${encodeURIComponent(reviewed.target.username)}`} className="underline">Open profile</Link> : null}
                                  {reviewed.target.type === "comment" && reviewed.target.creation?.state === "published" ? <Link href={`/creation/${encodeURIComponent(reviewed.target.creation.slug)}`} className="underline">Open parent creation</Link> : null}
                                </div>
                                <div className="mt-4 border-t pt-3">
                                  <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Prior actions</p>
                                  {reviewed.actions.length ? <ul className="mt-2 space-y-2">{reviewed.actions.map((action) => <li key={action.id} className="rounded-lg bg-white p-2 text-xs"><strong>{action.action.replaceAll("_", " ")}</strong> · {formatCommunityDate(action.createdAt)}<span className="mt-1 block text-muted-foreground">{action.reason}</span></li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No retained actions for this target.</p>}
                                  {reviewed.actionsCursor ? <Button type="button" size="sm" variant="outline" className="mt-3 bg-white" disabled={loadingContextActionsId === report.id} onClick={() => void loadMoreContextActions(report)}>{loadingContextActionsId === report.id ? "Loading history…" : "Load more history"}</Button> : null}
                                  {contextErrors[report.id] ? <p className="mt-2 text-xs text-destructive" role="alert">{contextErrors[report.id]}</p> : null}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="mt-5 space-y-2">
                            <label htmlFor={`moderation-reason-${report.id}`} className="text-sm font-black">Moderator rationale</label>
                            <Textarea id={`moderation-reason-${report.id}`} value={reasons[report.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [report.id]: event.target.value.slice(0, 1000) }))} maxLength={1000} rows={2} placeholder="State what was reviewed and why this action is proportionate." />
                            <p className="text-right text-xs text-muted-foreground">{(reasons[report.id] ?? "").length}/1000 · required for every action</p>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {filter === "open" ? (
                              <>
                                <Button type="button" variant="outline" disabled={!reason || busy || !reviewed} onClick={() => void decide(report, "dismiss_report")}><XCircle /> Dismiss report</Button>
                                <Button type="button" variant="outline" disabled={!reason || busy || !reviewed} onClick={() => void decide(report, "resolve_report")}><CheckCircle2 /> Resolve, no removal</Button>
                                {report.targetType === "creation" ? <><Button type="button" variant="destructive" disabled={!reason || busy || !reviewed} onClick={() => void targetAction(report, "hide_creation", true)}><EyeOff /> Hide & resolve</Button><Button type="button" variant="outline" disabled={!reason || busy || !reviewed} onClick={() => void targetAction(report, "lock_comments", true)}><LockKeyhole /> Lock comments & resolve</Button></> : null}
                                {report.targetType === "comment" ? <Button type="button" variant="destructive" disabled={!reason || busy || !reviewed} onClick={() => void targetAction(report, "hide_comment", true)}><EyeOff /> Hide & resolve</Button> : null}
                                {report.targetType === "user" ? <><Button type="button" variant="destructive" disabled={!reason || busy || !reviewed || !reviewed.target.profileImageEvidence} onClick={() => void targetAction(report, "remove_profile_image", true)}><ImageOff /> Remove reported photo & resolve</Button><Button type="button" variant="destructive" disabled={!reason || busy || !reviewed} onClick={() => void targetAction(report, "suspend_user", true)}><UserRoundX /> Suspend & resolve</Button></> : null}
                              </>
                            ) : (
                              <>
                                {report.targetType === "creation" ? <><Button type="button" variant="outline" disabled={!reason || busy || !reviewed} onClick={() => void targetAction(report, "restore_creation", false)}><RotateCcw /> Restore as private draft</Button><Button type="button" variant="outline" disabled={!reason || busy || !reviewed} onClick={() => void targetAction(report, "unlock_comments", false)}><MessageCircle /> Unlock comments</Button></> : null}
                                {report.targetType === "comment" ? <Button type="button" variant="outline" disabled={!reason || busy || !reviewed} onClick={() => void targetAction(report, "restore_comment", false)}><Eye /> Restore comment</Button> : null}
                                {report.targetType === "user" ? <Button type="button" variant="outline" disabled={!reason || busy || !reviewed} onClick={() => void targetAction(report, "restore_user", false)}><RotateCcw /> Restore user</Button> : null}
                              </>
                            )}
                          </div>
                        </article>
                      );
                    })}
                    {cursor ? (
                      <div className="pt-4 text-center">
                        <Button type="button" variant="outline" className="rounded-full" disabled={loadingMore} onClick={() => void load(cursor)}>
                          {loadingMore ? "Loading…" : "Load more reports"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </RequireAuth>
    </CommunityShell>
  );
}
