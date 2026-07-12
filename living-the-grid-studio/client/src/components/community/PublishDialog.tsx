import { useEffect, useState } from "react";
import { Eye, Send } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { communityApi, jsonBody, messageFromError } from "@/lib/community/api";
import type { GridDocument } from "@/lib/engine/grid";
import { TOMODACHI_PALETTE } from "@/lib/engine/palette";
import type { CreationSummary, CreationVisibility, PublishInput } from "@/lib/community/types";

const PALETTE_HEX = new Map(TOMODACHI_PALETTE.map((color) => [color.id, color.hex]));

interface GovernedTag {
  description: string;
  name: string;
  slug: string;
}

function createProjectPreview(document: GridDocument): string {
  const canvas = window.document.createElement("canvas");
  const size = 640;
  const margin = 24;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#f8f5ed";
  context.fillRect(0, 0, size, size);
  const scale = Math.min((size - margin * 2) / document.width, (size - margin * 2) / document.height);
  const artWidth = document.width * scale;
  const artHeight = document.height * scale;
  const offsetX = (size - artWidth) / 2;
  const offsetY = (size - artHeight) / 2;
  for (let y = 0; y < document.height; y += 1) {
    for (let x = 0; x < document.width; x += 1) {
      const colorId = document.cells[y * document.width + x];
      if (!colorId) continue;
      context.fillStyle = PALETTE_HEX.get(colorId) ?? "#20202a";
      context.fillRect(
        Math.floor(offsetX + x * scale),
        Math.floor(offsetY + y * scale),
        Math.ceil(scale),
        Math.ceil(scale),
      );
    }
  }
  return canvas.toDataURL("image/png");
}

export function PublishDialog({
  creationId,
  initial,
  onPublished,
  trigger,
  project,
  beforePublish,
}: {
  creationId: string;
  initial?: Partial<CreationSummary>;
  onPublished?: (creation: CreationSummary) => void;
  trigger?: React.ReactNode;
  project?: GridDocument;
  beforePublish?: () => boolean | Promise<boolean>;
}) {
  const firstPublish = initial?.status !== "published";
  const initialVisibility = initial?.visibility === "unlisted" ? "unlisted" : "public";
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? "Untitled creation");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(initial?.tags ?? []);
  const [availableTags, setAvailableTags] = useState<GovernedTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [tagRequestNonce, setTagRequestNonce] = useState(0);
  const [visibility, setVisibility] = useState<Exclude<CreationVisibility, "private">>(
    initialVisibility,
  );
  const [commentsEnabled, setCommentsEnabled] = useState(
    firstPublish ? initialVisibility === "public" : (initial?.commentsEnabled ?? true),
  );
  const [commentsTouched, setCommentsTouched] = useState(false);
  const [downloadEnabled, setDownloadEnabled] = useState(initial?.downloadEnabled ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (firstPublish && !commentsTouched) setCommentsEnabled(visibility === "public");
  }, [commentsTouched, firstPublish, visibility]);

  useEffect(() => {
    if (!open || availableTags.length) return;
    let canceled = false;
    setTagsLoading(true);
    setTagsError(null);
    void communityApi<GovernedTag[]>("/api/tags")
      .then((result) => {
        if (!canceled) {
          setAvailableTags(result.data);
          const active = new Set(result.data.map((tag) => tag.slug));
          setSelectedTags((current) => current.filter((slug) => active.has(slug)));
        }
      })
      .catch((error) => {
        if (!canceled) setTagsError(messageFromError(error));
      })
      .finally(() => {
        if (!canceled) setTagsLoading(false);
      });
    return () => { canceled = true; };
  }, [open, tagRequestNonce]);

  useEffect(() => {
    if (!open || !project) return;
    setPreviewDataUrl(createProjectPreview(project));
  }, [open, project]);

  const previewSource = previewDataUrl ?? initial?.previewUrl ?? initial?.thumbnailUrl;

  const publish = async () => {
    const payload: PublishInput = {
      title: title.trim(),
      description: description.trim(),
      tags: selectedTags,
      visibility,
      commentsEnabled,
      downloadEnabled,
    };
    if (!payload.title) {
      toast.error("Give your creation a title before publishing.");
      return;
    }
    if (beforePublish && !(await beforePublish())) return;
    setSubmitting(true);
    try {
      const result = await communityApi<CreationSummary>(`/api/creations/${creationId}/publish`, {
        method: "POST",
        body: jsonBody({
          title: payload.title,
          description: payload.description,
          tags: payload.tags,
          visibility: payload.visibility,
          commentsEnabled: payload.commentsEnabled,
          projectDownloadEnabled: payload.downloadEnabled,
        }),
      });
      onPublished?.(result.data);
      toast.success(firstPublish
        ? visibility === "public" ? "Published to Discover" : "Unlisted share link is ready"
        : "Publishing settings updated");
      setOpen(false);
    } catch (error) {
      toast.error(messageFromError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button type="button"><Send /> Review & publish</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{firstPublish ? "Review before publishing" : "Edit publishing settings"}</DialogTitle>
          <DialogDescription>
            {firstPublish
              ? "Saving is private. Publishing is a separate action and always uses the choices below."
              : "Update how this creation appears and which community features are available."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {previewSource ? (
            <figure className="overflow-hidden rounded-2xl border-2 border-[var(--island-ink)] bg-[var(--island-paper)] shadow-[4px_4px_0_var(--island-ink)]">
              <img
                src={previewSource}
                alt={`Generated publishing preview of ${title || "this creation"}`}
                width={640}
                height={640}
                loading="lazy"
                decoding="async"
                className="aspect-square w-full object-contain"
              />
              <figcaption className="flex items-center justify-between gap-3 border-t-2 border-[var(--island-ink)] bg-white px-4 py-2 text-xs font-bold text-[var(--island-ink)]/60">
                <span>Publishing preview</span>
                {project ? <span className="font-mono">{project.width}×{project.height} cells</span> : <span>Generated cloud preview</span>}
              </figcaption>
            </figure>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={`publish-title-${creationId}`}>Title</Label>
            <Input id={`publish-title-${creationId}`} value={title} onChange={(event) => setTitle(event.target.value.slice(0, 80))} maxLength={80} />
            <p className="text-right text-xs text-muted-foreground">{title.length}/80</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`publish-description-${creationId}`}>Description</Label>
            <Textarea id={`publish-description-${creationId}`} value={description} onChange={(event) => setDescription(event.target.value.slice(0, 2000))} rows={4} maxLength={2000} />
            <p className="text-right text-xs text-muted-foreground">{description.length}/2000</p>
          </div>
          <div className="space-y-2">
            <Label id={`publish-tags-${creationId}`}>Tags</Label>
            <p className="text-xs text-muted-foreground">Choose up to five governed community tags. Free-form tags are not stored or indexed.</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`publish-tags-${creationId}`} aria-busy={tagsLoading}>
              {availableTags.map((tag) => {
                const selected = selectedTags.includes(tag.slug);
                const limitReached = !selected && selectedTags.length >= 5;
                return (
                  <button
                    key={tag.slug}
                    type="button"
                    aria-pressed={selected}
                    title={tag.description}
                    disabled={limitReached}
                    onClick={() => setSelectedTags((current) => selected
                      ? current.filter((slug) => slug !== tag.slug)
                      : [...current, tag.slug])}
                    className="rounded-full border-2 border-[var(--island-ink)] px-3 py-1.5 text-xs font-black transition-colors disabled:cursor-not-allowed disabled:opacity-35"
                    style={{ background: selected ? "var(--island-blue)" : "white" }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
            {tagsLoading ? <p className="text-xs text-muted-foreground" role="status">Loading the community tag list…</p> : null}
            {tagsError ? <p className="text-xs text-destructive" role="alert">Tags are temporarily unavailable: {tagsError} <button type="button" className="font-bold underline" onClick={() => { setTagsError(null); setTagRequestNonce((value) => value + 1); }}>Retry</button></p> : null}
            <p className="text-right text-xs text-muted-foreground">{selectedTags.length}/5 selected</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`publish-visibility-${creationId}`}>Visibility</Label>
            <Select value={visibility} onValueChange={(value) => setVisibility(value as "public" | "unlisted")}>
              <SelectTrigger id={`publish-visibility-${creationId}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public · profile, search, and Discover</SelectItem>
                <SelectItem value="unlisted">Unlisted · anyone with the link</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3 rounded-xl bg-muted/60 p-4">
            <label className="flex items-center justify-between gap-4 text-sm font-medium">
              <span><span className="block font-bold">Allow comments</span><span className="block text-xs text-muted-foreground">You can turn these off later.</span></span>
              <Switch checked={commentsEnabled} onCheckedChange={(checked) => { setCommentsEnabled(checked); setCommentsTouched(true); }} />
            </label>
            <label className="flex items-center justify-between gap-4 text-sm font-medium">
              <span><span className="block font-bold">Allow project download</span><span className="block text-xs text-muted-foreground">Off by default. Previewing is always available.</span></span>
              <Switch checked={downloadEnabled} onCheckedChange={setDownloadEnabled} />
            </label>
          </div>
          <div className="flex gap-3 rounded-xl border border-[var(--island-blue)]/30 bg-[var(--island-blue-soft)] p-3 text-xs leading-5 text-[var(--island-ink)]/70">
            <Eye className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{visibility === "public" ? "This creation can appear in search, Discover, and your public profile." : "This creation stays out of search and profiles, but anyone with its stable link can view it."}</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>{firstPublish ? "Keep private" : "Cancel"}</Button>
          <Button type="button" onClick={publish} disabled={submitting}>
            {submitting
              ? firstPublish ? "Publishing…" : "Saving…"
              : firstPublish
                ? visibility === "public" ? "Publish publicly" : "Create unlisted link"
                : "Save publishing settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
