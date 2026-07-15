import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cloud,
  CloudOff,
  CopyPlus,
  LoaderCircle,
  LogIn,
  Save,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PublishDialog } from "./PublishDialog";
import { useAuth } from "@/contexts/AuthContext";
import type { GridDocument } from "@/lib/engine/grid";
import {
  communityApi,
  CommunityApiError,
  jsonBody,
  messageFromError,
} from "@/lib/community/api";
import {
  consumeAuthResumeDraft,
  markDraftForAuthResume,
  readLocalDraft,
  saveLocalDraft,
} from "@/lib/community/drafts";
import {
  currentStudioReturnTo,
  setupPathForReturnTo,
} from "@/lib/community/return-to";
import type {
  CloudProjectState,
  CreationDetail,
  CreationSummary,
} from "@/lib/community/types";

interface SaveResponse {
  id?: string;
  creationId?: string;
  slug: string;
  revision: number;
}

function publicationFromCreation(
  creation: CreationSummary,
): NonNullable<CloudProjectState["publication"]> {
  return {
    status: creation.status,
    visibility: creation.visibility,
    title: creation.title,
    description: creation.description ?? "",
    tags: creation.tags,
    commentsEnabled: Boolean(creation.commentsEnabled),
    downloadEnabled: Boolean(creation.downloadEnabled),
  };
}

function quotedRevision(revision: number): string {
  return `"rev-${revision}"`;
}

function replaceCloudProjectInCurrentUrl(creationId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("cloud", creationId);
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function projectTimestamp(value: string | number | undefined): {
  dateTime: string;
  label: string;
} | null {
  if (value === undefined) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    dateTime: date.toISOString(),
    label: new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date),
  };
}

function ConflictVersionDetails({
  cloud,
  document,
}: {
  cloud: CloudProjectState;
  document: GridDocument;
}) {
  const localModified = projectTimestamp(document.meta.modifiedAt);
  const lastSyncedDocument = projectTimestamp(cloud.lastSyncedModifiedAt);
  const lastSuccessfulSave = projectTimestamp(cloud.lastSavedAt);
  const timestamp = (
    value: ReturnType<typeof projectTimestamp>,
    unavailable: string,
  ) =>
    value ? (
      <time dateTime={value.dateTime} title={value.dateTime}>
        {value.label}
      </time>
    ) : (
      unavailable
    );

  return (
    <dl className="grid gap-2 rounded-xl border bg-muted/35 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-muted-foreground">
          Local work modified
        </dt>
        <dd className="break-words font-medium">
          {timestamp(localModified, "Timestamp not recorded")}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-muted-foreground">
          Last synced cloud revision
        </dt>
        <dd className="font-medium">v{cloud.revision}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-muted-foreground">
          Synced document timestamp
        </dt>
        <dd className="break-words font-medium">
          {timestamp(lastSyncedDocument, "Not recorded")}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-muted-foreground">
          Last successful cloud save
        </dt>
        <dd className="break-words font-medium">
          {timestamp(lastSuccessfulSave, "Not recorded in this browser")}
        </dd>
      </div>
    </dl>
  );
}

export function CloudProjectControls({
  doc,
  onLoadDocument,
}: {
  doc: GridDocument | null;
  onLoadDocument: (document: GridDocument) => void;
}) {
  const { user, status, serviceAvailable, serviceMessage } = useAuth();
  const [cloud, setCloud] = useState<CloudProjectState | null>(null);
  const [cloudSignInRequired, setCloudSignInRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [confirmCloudReplaceOpen, setConfirmCloudReplaceOpen] = useState(false);
  const docRef = useRef(doc);
  const savingRef = useRef(false);
  const lastSavedModifiedRef = useRef<string | null>(null);
  const resumeSaveRef = useRef(false);
  const bootstrappedRef = useRef(false);
  docRef.current = doc;

  const persistLocal = useCallback(
    async (document: GridDocument, state?: CloudProjectState | null) => {
      try {
        await saveLocalDraft({
          id: "current",
          document,
          updatedAt: Date.now(),
          cloud: state ?? undefined,
        });
      } catch {
        // IndexedDB can be unavailable in hardened/private browser modes. The in-memory editor still works.
      }
    },
    [],
  );

  const refreshCloudMetadata = useCallback(
    async (state: CloudProjectState, showError = false): Promise<boolean> => {
      try {
        const result = await communityApi<CreationDetail>(
          `/api/creations/${encodeURIComponent(state.creationId)}`,
        );
        setCloud((current) => {
          if (!current || current.creationId !== state.creationId)
            return current;
          const revisionChanged = result.data.revision !== current.revision;
          return {
            ...current,
            slug: result.data.slug,
            publication: publicationFromCreation(result.data),
            ...(revisionChanged
              ? {
                  saveState: "conflict" as const,
                  error: "A newer cloud revision exists.",
                }
              : {
                  etag: result.etag ?? quotedRevision(result.data.revision),
                }),
          };
        });
        return true;
      } catch (error) {
        if (showError) toast.error(messageFromError(error));
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    if (!doc) return;
    const timer = window.setTimeout(() => {
      void persistLocal(doc, cloud);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [cloud, doc, persistLocal]);

  const firstSave = useCallback(
    async (
      document: GridDocument,
      options?: { preserveCloudOnError?: boolean },
    ): Promise<string | null> => {
      if (!user) return null;
      if (!user.username || user.termsAccepted !== true) {
        try {
          await markDraftForAuthResume(document);
          toast.infoAfterNavigation(
            "Finish your public profile once before using cloud projects.",
          );
          window.location.assign(setupPathForReturnTo(currentStudioReturnTo()));
        } catch {
          toast.error(
            "This browser could not preserve the draft for profile setup. Export JSON before leaving the page.",
          );
        }
        return null;
      }
      setBusy(true);
      savingRef.current = true;
      try {
        const result = await communityApi<SaveResponse>("/api/creations", {
          method: "POST",
          body: jsonBody({ project: document, title: document.meta.name }),
        });
        const creationId = result.data.id ?? result.data.creationId;
        if (!creationId)
          throw new Error("The server did not return a project identifier.");
        const next: CloudProjectState = {
          userId: user.id,
          creationId,
          slug: result.data.slug,
          revision: result.data.revision,
          etag: result.etag ?? quotedRevision(result.data.revision),
          saveState: "saved",
          lastSavedAt: Date.now(),
          lastSyncedModifiedAt: document.meta.modifiedAt,
          publication: {
            status: "draft",
            visibility: "private",
            title: document.meta.name,
            description: "",
            tags: [],
            commentsEnabled: false,
            downloadEnabled: false,
          },
        };
        lastSavedModifiedRef.current = document.meta.modifiedAt;
        setCloud(next);
        await persistLocal(document, next);
        toast.success(
          "Private cloud save created. Publishing is still separate.",
        );
        return creationId;
      } catch (error) {
        toast.error(messageFromError(error));
        if (!options?.preserveCloudOnError) {
          setCloud((current) =>
            current
              ? {
                  ...current,
                  saveState: "error",
                  error: messageFromError(error),
                }
              : null,
          );
        }
        return null;
      } finally {
        savingRef.current = false;
        setBusy(false);
      }
    },
    [persistLocal, user],
  );

  useEffect(() => {
    if (status === "loading" || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    let canceled = false;

    void (async () => {
      const cloudId = new URLSearchParams(window.location.search).get("cloud");
      if (cloudId) {
        if (!user) {
          setCloudSignInRequired(true);
          return;
        }
        if (!user.username || user.termsAccepted !== true) {
          window.location.assign(setupPathForReturnTo(currentStudioReturnTo()));
          return;
        }
        setCloudSignInRequired(false);
        setBusy(true);
        try {
          const result = await communityApi<CreationDetail>(
            `/api/creations/${encodeURIComponent(cloudId)}`,
          );
          if (canceled || !result.data.project) return;
          onLoadDocument(result.data.project);
          lastSavedModifiedRef.current = result.data.project.meta.modifiedAt;
          setCloud({
            userId: user.id,
            creationId: result.data.id,
            slug: result.data.slug,
            revision: result.data.revision,
            etag: result.etag ?? quotedRevision(result.data.revision),
            saveState: "saved",
            lastSavedAt: Date.now(),
            lastSyncedModifiedAt: result.data.project.meta.modifiedAt,
            publication: publicationFromCreation(result.data),
          });
        } catch (error) {
          if (
            !canceled &&
            error instanceof CommunityApiError &&
            error.status === 401
          ) {
            setCloudSignInRequired(true);
          } else if (!canceled) {
            toast.error(messageFromError(error));
          }
        } finally {
          if (!canceled) setBusy(false);
        }
        return;
      }

      if (user) {
        const resume = await consumeAuthResumeDraft();
        if (resume && !canceled) {
          onLoadDocument(resume.document);
          resumeSaveRef.current = true;
          toast.info("Your local draft returned safely after sign-in.");
          return;
        }
      }

      const current = await readLocalDraft("current");
      if (!current || canceled || docRef.current) return;
      onLoadDocument(current.document);
      if (user && current.cloud?.userId === user.id) {
        const syncedModifiedAt = current.cloud.lastSyncedModifiedAt ?? null;
        const dirty = syncedModifiedAt !== current.document.meta.modifiedAt;
        lastSavedModifiedRef.current = syncedModifiedAt;
        const restoredState =
          current.cloud.saveState === "conflict"
            ? "conflict"
            : current.cloud.saveState === "error"
              ? "error"
              : dirty && !navigator.onLine
                ? "offline"
                : "saved";
        const restoredCloud: CloudProjectState = {
          ...current.cloud,
          saveState: restoredState,
          error: restoredState === "saved" ? undefined : current.cloud.error,
          // Always re-fetch publication metadata. Older IndexedDB records do
          // not contain it, and settings may have changed on another route.
          publication: undefined,
        };
        setCloud(restoredCloud);
        if (navigator.onLine) await refreshCloudMetadata(restoredCloud);
      }
      toast.info(
        user && current.cloud?.userId === user.id
          ? "Restored your local draft and cloud sync status."
          : "Restored your local Studio draft.",
      );
    })().catch(() => {
      // IndexedDB may be unavailable; the editor remains usable in memory.
    });

    return () => {
      canceled = true;
    };
  }, [onLoadDocument, refreshCloudMetadata, status, user]);

  useEffect(() => {
    if (!resumeSaveRef.current || !doc || !user || cloud) return;
    resumeSaveRef.current = false;
    void firstSave(doc);
  }, [cloud, doc, firstSave, user]);

  const saveRevision = useCallback(async (): Promise<boolean> => {
    const document = docRef.current;
    if (!document || !cloud || savingRef.current) return false;
    if (lastSavedModifiedRef.current === document.meta.modifiedAt) return true;
    savingRef.current = true;
    setCloud((current) =>
      current
        ? { ...current, saveState: navigator.onLine ? "saving" : "offline" }
        : current,
    );
    if (!navigator.onLine) {
      savingRef.current = false;
      return false;
    }
    try {
      const result = await communityApi<SaveResponse>(
        `/api/creations/${cloud.creationId}/project`,
        {
          method: "PUT",
          headers: { "If-Match": cloud.etag },
          body: jsonBody({ project: document }),
        },
      );
      const revision = result.data.revision;
      const next: CloudProjectState = {
        ...cloud,
        revision,
        etag: result.etag ?? quotedRevision(revision),
        saveState: "saved",
        lastSavedAt: Date.now(),
        lastSyncedModifiedAt: document.meta.modifiedAt,
        error: undefined,
      };
      lastSavedModifiedRef.current = document.meta.modifiedAt;
      setCloud(next);
      await persistLocal(document, next);
      return true;
    } catch (error) {
      if (error instanceof CommunityApiError && error.status === 409) {
        setCloud((current) =>
          current
            ? {
                ...current,
                saveState: "conflict",
                error: "A newer cloud revision exists.",
              }
            : current,
        );
      } else {
        setCloud((current) =>
          current
            ? { ...current, saveState: "error", error: messageFromError(error) }
            : current,
        );
      }
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [cloud, persistLocal]);

  useEffect(() => {
    if (
      !doc ||
      !cloud ||
      !navigator.onLine ||
      ["conflict", "offline", "saving", "error"].includes(cloud.saveState)
    )
      return;
    const timer = window.setTimeout(() => {
      void saveRevision();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [cloud, doc, saveRevision]);

  useEffect(() => {
    if (!cloud) return;
    const flush = () => {
      void saveRevision();
    };
    const refreshMetadata = () => {
      if (navigator.onLine) void refreshCloudMetadata(cloud);
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") void saveRevision();
      else refreshMetadata();
    };
    window.addEventListener("blur", flush);
    window.addEventListener("focus", refreshMetadata);
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("blur", flush);
      window.removeEventListener("focus", refreshMetadata);
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [cloud, refreshCloudMetadata, saveRevision]);

  const requestFirstSave = async () => {
    if (!doc) return;
    if (status !== "authenticated" || !user) {
      try {
        await markDraftForAuthResume(doc);
        const returnTo = currentStudioReturnTo();
        const form = document.createElement("form");
        form.method = "post";
        form.action = "/api/auth/google/start";
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "returnTo";
        input.value = returnTo;
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
      } catch {
        toast.error(
          "This browser could not preserve the draft for sign-in. Export JSON before leaving the page.",
        );
      }
      return;
    }
    await firstSave(doc);
  };

  const reloadCloud = async () => {
    if (!cloud) return;
    setBusy(true);
    try {
      const result = await communityApi<CreationDetail>(
        `/api/creations/${cloud.creationId}`,
      );
      if (!result.data.project)
        throw new Error("The cloud project has no document data.");
      onLoadDocument(result.data.project);
      lastSavedModifiedRef.current = result.data.project.meta.modifiedAt;
      setCloud({
        ...cloud,
        revision: result.data.revision,
        etag: result.etag ?? quotedRevision(result.data.revision),
        saveState: "saved",
        lastSavedAt: Date.now(),
        lastSyncedModifiedAt: result.data.project.meta.modifiedAt,
        error: undefined,
        slug: result.data.slug,
        publication: publicationFromCreation(result.data),
      });
      toast.success("Loaded the cloud version");
    } catch (error) {
      toast.error(messageFromError(error));
    } finally {
      setBusy(false);
    }
  };

  const saveCopy = async () => {
    if (!doc) return false;
    const creationId = await firstSave(
      {
        ...doc,
        meta: { ...doc.meta, name: `${doc.meta.name} (copy)` },
      },
      { preserveCloudOnError: true },
    );
    if (!creationId) return false;
    replaceCloudProjectInCurrentUrl(creationId);
    return true;
  };

  useEffect(() => {
    if (cloud?.saveState === "conflict") return;
    setConflictDialogOpen(false);
    setConfirmCloudReplaceOpen(false);
  }, [cloud?.saveState]);

  if (!serviceAvailable) {
    const checking = status === "loading";
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 rounded-full text-xs"
        disabled
        aria-label={
          checking ? "Checking cloud availability" : "Cloud saving unavailable"
        }
        title={serviceMessage ?? "Checking cloud availability"}
      >
        {checking ? (
          <LoaderCircle className="animate-spin motion-reduce:animate-none" />
        ) : (
          <CloudOff />
        )}
        <span className="hidden sm:inline">
          {checking ? "Checking cloud…" : "Cloud unavailable"}
        </span>
        <span className="sm:hidden">
          {checking ? "Checking…" : "Local only"}
        </span>
      </Button>
    );
  }

  if (cloudSignInRequired) {
    const returnTo = currentStudioReturnTo();
    return (
      <div className="flex min-w-0 max-w-full items-center justify-end gap-2">
        <span
          className="truncate text-[10px] font-bold text-muted-foreground"
          role="status"
        >
          Cloud sign-in required
        </span>
        <form action="/api/auth/google/start" method="post">
          <input type="hidden" name="returnTo" value={returnTo} />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 rounded-full px-2 text-xs sm:px-3"
            aria-label="Sign in to open cloud project"
          >
            <LogIn /> Sign in
          </Button>
        </form>
      </div>
    );
  }

  // A cloud-link bootstrap can start without a local document. Keep the
  // availability/sign-in states above this guard so a fresh browser can open
  // a shared ?cloud=… destination instead of silently showing an empty Studio.
  if (!doc) return null;

  if (!cloud) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 rounded-full text-xs"
        disabled={busy}
        aria-label="Save to account"
        onClick={() => void requestFirstSave()}
      >
        {busy ? <LoaderCircle className="animate-spin" /> : <Save />}{" "}
        <span className="hidden sm:inline">Save to account</span>
        <span className="sm:hidden">Save</span>
      </Button>
    );
  }

  const hasUnsavedChanges =
    lastSavedModifiedRef.current !== doc.meta.modifiedAt;
  const publication = cloud.publication;
  const canPublish =
    Boolean(publication) &&
    navigator.onLine &&
    cloud.saveState === "saved" &&
    !hasUnsavedChanges;

  return (
    <div className="flex min-w-0 max-w-full items-center justify-end gap-1.5">
      <span
        className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {cloud.saveState === "saving" ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : cloud.saveState === "offline" ? (
          <CloudOff className="h-3.5 w-3.5" />
        ) : cloud.saveState === "conflict" ? (
          <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />
        ) : (
          <Cloud className="h-3.5 w-3.5 text-[var(--island-mint-dark)]" />
        )}
        {cloud.saveState === "saving"
          ? "Saving…"
          : cloud.saveState === "offline"
            ? "Offline"
            : cloud.saveState === "conflict"
              ? "Conflict"
              : cloud.saveState === "error"
                ? "Save failed"
                : hasUnsavedChanges
                  ? "Saving soon…"
                  : `Saved · v${cloud.revision}`}
      </span>
      {cloud.saveState === "conflict" ? (
        <>
          <Dialog
            open={conflictDialogOpen}
            onOpenChange={setConflictDialogOpen}
          >
            <DialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-full px-2 text-xs sm:px-3"
                disabled={busy}
                aria-label="Resolve cloud save conflict"
              >
                <span className="hidden sm:inline">Resolve conflict</span>
                <span className="sm:hidden">Resolve</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>
                  Choose how to resolve this save conflict
                </DialogTitle>
                <DialogDescription>
                  Your local work and the newer cloud version are both preserved
                  until you make an explicit choice. Nothing will be overwritten
                  by opening or canceling this window.
                </DialogDescription>
              </DialogHeader>

              <ConflictVersionDetails cloud={cloud} document={doc} />

              <div className="rounded-xl border border-[var(--island-mint-dark)]/25 bg-[var(--island-mint)]/15 p-3 text-sm">
                <p className="font-semibold">Recommended: keep both versions</p>
                <p className="mt-1 text-muted-foreground">
                  Save your local work as a new private cloud project. The
                  existing cloud project stays unchanged.
                </p>
              </div>

              <DialogFooter className="sm:flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConflictDialogOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setConflictDialogOpen(false);
                    setConfirmCloudReplaceOpen(true);
                  }}
                  disabled={busy}
                >
                  Use cloud version
                </Button>
                <Button
                  type="button"
                  autoFocus
                  onClick={() => {
                    void saveCopy().then((saved) => {
                      if (saved) setConflictDialogOpen(false);
                    });
                  }}
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <CopyPlus />
                  )}
                  {busy ? "Saving copy…" : "Save local work as a copy"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog
            open={confirmCloudReplaceOpen}
            onOpenChange={setConfirmCloudReplaceOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Replace the local editor with the cloud version?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This explicit choice loads the newer cloud project into the
                  Studio and removes the current local edits from the editor. If
                  you may need those edits, cancel and save them as a copy
                  instead.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <ConflictVersionDetails cloud={cloud} document={doc} />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ variant: "destructive" })}
                  onClick={() => void reloadCloud()}
                  disabled={busy}
                >
                  Confirm use cloud version
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <>
          {cloud.saveState === "error" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-full text-xs"
              onClick={() => void saveRevision()}
            >
              Retry save
            </Button>
          ) : null}
          {!publication ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-full text-xs"
              disabled={busy || !navigator.onLine}
              onClick={() => {
                setBusy(true);
                void refreshCloudMetadata(cloud, true).finally(() =>
                  setBusy(false),
                );
              }}
              title="Refresh the authoritative publishing settings before sharing"
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Cloud />}
              Sync sharing
            </Button>
          ) : (
            <PublishDialog
              creationId={cloud.creationId}
              project={doc}
              beforePublish={() => {
                const currentDocument = docRef.current;
                const ready =
                  Boolean(currentDocument) &&
                  navigator.onLine &&
                  cloud.saveState === "saved" &&
                  lastSavedModifiedRef.current ===
                    currentDocument?.meta.modifiedAt;
                if (!ready)
                  toast.error(
                    "Wait for the private cloud save to finish before publishing.",
                  );
                return ready;
              }}
              initial={{
                title: publication.title,
                description: publication.description,
                tags: publication.tags,
                status: publication.status,
                visibility: publication.visibility,
                commentsEnabled: publication.commentsEnabled,
                downloadEnabled: publication.downloadEnabled,
                slug: cloud.slug,
                revision: cloud.revision,
              }}
              onPublished={(creation: CreationSummary) =>
                setCloud((current) =>
                  current
                    ? {
                        ...current,
                        slug: creation.slug,
                        publication: publicationFromCreation(creation),
                      }
                    : current,
                )
              }
              trigger={
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full text-xs"
                  disabled={!canPublish}
                  title={
                    canPublish
                      ? "Review and share"
                      : "Wait for the private cloud save to finish"
                  }
                >
                  {hasUnsavedChanges
                    ? "Saving first…"
                    : publication.status === "published"
                      ? "Share settings"
                      : "Share"}
                </Button>
              }
            />
          )}
        </>
      )}
    </div>
  );
}
