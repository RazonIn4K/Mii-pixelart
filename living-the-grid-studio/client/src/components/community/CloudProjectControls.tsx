import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, LoaderCircle, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PublishDialog } from "./PublishDialog";
import { useAuth } from "@/contexts/AuthContext";
import type { GridDocument } from "@/lib/engine/grid";
import { communityApi, CommunityApiError, jsonBody, messageFromError } from "@/lib/community/api";
import { consumeAuthResumeDraft, markDraftForAuthResume, readLocalDraft, saveLocalDraft } from "@/lib/community/drafts";
import type { CloudProjectState, CreationDetail, CreationSummary } from "@/lib/community/types";

interface SaveResponse {
  id?: string;
  creationId?: string;
  slug: string;
  revision: number;
}

function quotedRevision(revision: number): string {
  return `"rev-${revision}"`;
}

export function CloudProjectControls({
  doc,
  onLoadDocument,
}: {
  doc: GridDocument | null;
  onLoadDocument: (document: GridDocument) => void;
}) {
  const { user, status } = useAuth();
  const [cloud, setCloud] = useState<CloudProjectState | null>(null);
  const [busy, setBusy] = useState(false);
  const docRef = useRef(doc);
  const savingRef = useRef(false);
  const lastSavedModifiedRef = useRef<string | null>(null);
  const resumeSaveRef = useRef(false);
  const bootstrappedRef = useRef(false);
  docRef.current = doc;

  const persistLocal = useCallback(async (document: GridDocument, state?: CloudProjectState | null) => {
    try {
      await saveLocalDraft({ id: "current", document, updatedAt: Date.now(), cloud: state ?? undefined });
    } catch {
      // IndexedDB can be unavailable in hardened/private browser modes. The in-memory editor still works.
    }
  }, []);

  useEffect(() => {
    if (!doc) return;
    const timer = window.setTimeout(() => { void persistLocal(doc, cloud); }, 300);
    return () => window.clearTimeout(timer);
  }, [cloud, doc, persistLocal]);

  const firstSave = useCallback(async (document: GridDocument) => {
    if (!user) return;
    if (!user.username) {
      toast.info("Finish your public profile once before using cloud projects.");
      window.location.assign("/me/setup");
      return;
    }
    setBusy(true);
    savingRef.current = true;
    try {
      const result = await communityApi<SaveResponse>("/api/creations", {
        method: "POST",
        body: jsonBody({ project: document, title: document.meta.name }),
      });
      const creationId = result.data.id ?? result.data.creationId;
      if (!creationId) throw new Error("The server did not return a project identifier.");
      const next: CloudProjectState = {
        userId: user.id,
        creationId,
        slug: result.data.slug,
        revision: result.data.revision,
        etag: result.etag ?? quotedRevision(result.data.revision),
        saveState: "saved",
        lastSavedAt: Date.now(),
        lastSyncedModifiedAt: document.meta.modifiedAt,
      };
      lastSavedModifiedRef.current = document.meta.modifiedAt;
      setCloud(next);
      await persistLocal(document, next);
      toast.success("Private cloud save created. Publishing is still separate.");
    } catch (error) {
      toast.error(messageFromError(error));
      setCloud((current) => current ? { ...current, saveState: "error", error: messageFromError(error) } : null);
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }, [persistLocal, user]);

  useEffect(() => {
    if (status === "loading" || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    let canceled = false;

    void (async () => {
      const cloudId = new URLSearchParams(window.location.search).get("cloud");
      if (cloudId) {
        if (!user) {
          toast.info("Sign in to open this private cloud project. Your current local draft was left untouched.");
          return;
        }
        setBusy(true);
        try {
          const result = await communityApi<CreationDetail>(`/api/creations/${encodeURIComponent(cloudId)}`);
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
          });
        } catch (error) {
          if (!canceled) toast.error(messageFromError(error));
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
        const restoredState = current.cloud.saveState === "conflict"
          ? "conflict"
          : current.cloud.saveState === "error"
            ? "error"
            : dirty && !navigator.onLine
              ? "offline"
              : "saved";
        setCloud({
          ...current.cloud,
          saveState: restoredState,
          error: restoredState === "saved" ? undefined : current.cloud.error,
        });
      }
      toast.info(user && current.cloud?.userId === user.id ? "Restored your local draft and cloud sync status." : "Restored your local Studio draft.");
    })().catch(() => {
      // IndexedDB may be unavailable; the editor remains usable in memory.
    });

    return () => { canceled = true; };
  }, [onLoadDocument, status, user]);

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
    setCloud((current) => current ? { ...current, saveState: navigator.onLine ? "saving" : "offline" } : current);
    if (!navigator.onLine) {
      savingRef.current = false;
      return false;
    }
    try {
      const result = await communityApi<SaveResponse>(`/api/creations/${cloud.creationId}/project`, {
        method: "PUT",
        headers: { "If-Match": cloud.etag },
        body: jsonBody({ project: document }),
      });
      const revision = result.data.revision;
      const next: CloudProjectState = { ...cloud, revision, etag: result.etag ?? quotedRevision(revision), saveState: "saved", lastSavedAt: Date.now(), lastSyncedModifiedAt: document.meta.modifiedAt, error: undefined };
      lastSavedModifiedRef.current = document.meta.modifiedAt;
      setCloud(next);
      await persistLocal(document, next);
      return true;
    } catch (error) {
      if (error instanceof CommunityApiError && error.status === 409) {
        setCloud((current) => current ? { ...current, saveState: "conflict", error: "A newer cloud revision exists." } : current);
      } else {
        setCloud((current) => current ? { ...current, saveState: "error", error: messageFromError(error) } : current);
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
    ) return;
    const timer = window.setTimeout(() => { void saveRevision(); }, 1500);
    return () => window.clearTimeout(timer);
  }, [cloud, doc, saveRevision]);

  useEffect(() => {
    if (!cloud) return;
    const flush = () => { void saveRevision(); };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") void saveRevision();
    };
    window.addEventListener("blur", flush);
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("blur", flush);
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [cloud, saveRevision]);

  const requestFirstSave = async () => {
    if (!doc) return;
    if (status !== "authenticated" || !user) {
      try {
        await markDraftForAuthResume(doc);
        const form = document.createElement("form");
        form.method = "post";
        form.action = "/api/auth/google/start";
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "returnTo";
        input.value = "/studio";
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
      } catch {
        toast.error("This browser could not preserve the draft for sign-in. Export JSON before leaving the page.");
      }
      return;
    }
    await firstSave(doc);
  };

  const reloadCloud = async () => {
    if (!cloud) return;
    setBusy(true);
    try {
      const result = await communityApi<CreationDetail>(`/api/creations/${cloud.creationId}`);
      if (!result.data.project) throw new Error("The cloud project has no document data.");
      onLoadDocument(result.data.project);
      lastSavedModifiedRef.current = result.data.project.meta.modifiedAt;
      setCloud({ ...cloud, revision: result.data.revision, etag: result.etag ?? quotedRevision(result.data.revision), saveState: "saved", lastSavedAt: Date.now(), lastSyncedModifiedAt: result.data.project.meta.modifiedAt, error: undefined });
      toast.success("Loaded the cloud version");
    } catch (error) { toast.error(messageFromError(error)); } finally { setBusy(false); }
  };

  const saveCopy = async () => {
    if (!doc) return;
    setCloud(null);
    await firstSave({ ...doc, meta: { ...doc.meta, name: `${doc.meta.name} (copy)` } });
  };

  if (!doc) return null;
  if (!cloud) {
    return <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" disabled={busy} onClick={() => void requestFirstSave()}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />} <span className="hidden sm:inline">Save to account</span><span className="sm:hidden">Save</span></Button>;
  }

  const hasUnsavedChanges = lastSavedModifiedRef.current !== doc.meta.modifiedAt;
  const canPublish = navigator.onLine && cloud.saveState === "saved" && !hasUnsavedChanges;

  return (
    <div className="flex items-center gap-1.5">
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-muted-foreground" role="status" aria-live="polite">
        {cloud.saveState === "saving" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : cloud.saveState === "offline" ? <CloudOff className="h-3.5 w-3.5" /> : cloud.saveState === "conflict" ? <TriangleAlert className="h-3.5 w-3.5 text-amber-600" /> : <Cloud className="h-3.5 w-3.5 text-[var(--island-mint-dark)]" />}
        {cloud.saveState === "saving" ? "Saving…" : cloud.saveState === "offline" ? "Offline" : cloud.saveState === "conflict" ? "Conflict" : cloud.saveState === "error" ? "Save failed" : hasUnsavedChanges ? "Saving soon…" : `Saved · v${cloud.revision}`}
      </span>
      {cloud.saveState === "conflict" ? <><Button type="button" size="sm" variant="outline" onClick={() => void reloadCloud()} disabled={busy}>Use cloud</Button><Button type="button" size="sm" onClick={() => void saveCopy()} disabled={busy}>Save copy</Button></> : (
        <>{cloud.saveState === "error" ? <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => void saveRevision()}>Retry save</Button> : null}<PublishDialog creationId={cloud.creationId} project={doc} beforePublish={() => {
          const currentDocument = docRef.current;
          const ready = Boolean(currentDocument)
            && navigator.onLine
            && cloud.saveState === "saved"
            && lastSavedModifiedRef.current === currentDocument?.meta.modifiedAt;
          if (!ready) toast.error("Wait for the private cloud save to finish before publishing.");
          return ready;
        }} initial={{ title: doc.meta.name, slug: cloud.slug, revision: cloud.revision }} onPublished={(creation: CreationSummary) => setCloud((current) => current ? { ...current, slug: creation.slug } : current)} trigger={<Button type="button" size="sm" className="h-8 rounded-full text-xs" disabled={!canPublish} title={canPublish ? "Review and publish" : "Wait for the private cloud save to finish"}>{hasUnsavedChanges ? "Saving first…" : "Publish"}</Button>} /></>
      )}
    </div>
  );
}
