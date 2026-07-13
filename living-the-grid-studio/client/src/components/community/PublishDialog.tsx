import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  ImagePlus,
  ListChecks,
  Send,
  Settings2,
} from "lucide-react";
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
import type {
  CreationShowcaseImage,
  CreationSummary,
  CreationVisibility,
  PublishInput,
} from "@/lib/community/types";
import type { GridDocument } from "@/lib/engine/grid";
import { TOMODACHI_PALETTE } from "@/lib/engine/palette";
import { ShareCreationActions } from "./ShareCreationActions";
import { ShowcaseImageManager } from "./ShowcaseImageManager";

const PALETTE_HEX = new Map(TOMODACHI_PALETTE.map((color) => [color.id, color.hex]));

const PUBLISH_STEPS = [
  { label: "Details", description: "Name your creation", icon: ListChecks },
  { label: "Showcase", description: "Choose its best view", icon: ImagePlus },
  { label: "Sharing", description: "Review who can see it", icon: Settings2 },
] as const;

type PublishStep = 0 | 1 | 2;

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

function PublishingProgress({ step }: { step: PublishStep }) {
  return (
    <nav aria-label="Publishing progress" className="border-y border-[var(--island-ink)]/10 bg-[var(--island-paper)]/75 px-4 py-3 sm:px-6">
      <p className="sr-only" aria-live="polite">Step {step + 1} of {PUBLISH_STEPS.length}: {PUBLISH_STEPS[step].label}</p>
      <ol className="grid grid-cols-3 gap-2">
        {PUBLISH_STEPS.map((item, index) => {
          const Icon = item.icon;
          const complete = index < step;
          const active = index === step;
          return (
            <li key={item.label} aria-current={active ? "step" : undefined} className="min-w-0">
              <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors sm:px-3 ${
                active
                  ? "border-[var(--island-ink)] bg-white shadow-[2px_2px_0_var(--island-ink)]"
                  : complete
                    ? "border-[var(--island-mint-dark)]/35 bg-[var(--island-mint)]/20"
                    : "border-transparent text-[var(--island-ink)]/45"
              }`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                  complete
                    ? "bg-[var(--island-mint-dark)] text-white"
                    : active
                      ? "bg-[var(--island-blue)] text-[var(--island-ink)]"
                      : "bg-black/5"
                }`} aria-hidden="true">
                  {complete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black sm:text-sm">{index + 1}. {item.label}</span>
                  <span className="hidden truncate text-[0.65rem] font-medium opacity-60 md:block">{item.description}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function LiveProjectCard({
  description,
  previewSource,
  project,
  selectedTags,
  tagNames,
  title,
  visibility,
}: {
  description: string;
  previewSource?: string | null;
  project?: GridDocument;
  selectedTags: string[];
  tagNames: Map<string, string>;
  title: string;
  visibility: "public" | "unlisted";
}) {
  const displayTitle = title.trim() || "Untitled creation";
  return (
    <aside className="lg:sticky lg:top-0" aria-label="Live project card preview">
      <p className="island-kicker mb-2">Live card preview</p>
      <article className="overflow-hidden rounded-2xl border-2 border-[var(--island-ink)] bg-white shadow-[4px_4px_0_var(--island-ink)]">
        <div className="relative aspect-square bg-[var(--island-paper)]">
          {previewSource ? (
            <img
              src={previewSource}
              alt={`Project card preview for ${displayTitle}`}
              width={640}
              height={640}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="grid h-full place-items-center p-6 text-center text-xs font-bold text-muted-foreground">
              Your generated project preview will appear here.
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-full border border-[var(--island-ink)] bg-white/95 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wide">
            {visibility}
          </span>
        </div>
        <div className="space-y-2 border-t-2 border-[var(--island-ink)] p-4">
          <h3 className="break-words text-lg font-black leading-tight text-[var(--island-ink)]">{displayTitle}</h3>
          {description.trim() ? (
            <p className="line-clamp-3 text-xs font-medium leading-5 text-[var(--island-ink)]/60">{description.trim()}</p>
          ) : (
            <p className="text-xs font-medium italic text-[var(--island-ink)]/45">Add a description to tell the story behind it.</p>
          )}
          {selectedTags.length ? (
            <div className="flex flex-wrap gap-1.5" aria-label="Selected tags">
              {selectedTags.map((tag) => (
                <span key={tag} className="rounded-full bg-[var(--island-blue-soft)] px-2 py-1 text-[0.65rem] font-bold">
                  #{tagNames.get(tag) ?? tag}
                </span>
              ))}
            </div>
          ) : null}
          <p className="border-t pt-2 text-[0.65rem] font-mono text-muted-foreground">
            {project ? `${project.width}×${project.height} cells` : "Cloud-generated preview"}
          </p>
        </div>
      </article>
    </aside>
  );
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
  const titleRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<PublishStep>(0);
  const [title, setTitle] = useState(initial?.title ?? "Untitled creation");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(initial?.tags ?? []);
  const [availableTags, setAvailableTags] = useState<GovernedTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [tagRequestNonce, setTagRequestNonce] = useState(0);
  const [visibility, setVisibility] = useState<Exclude<CreationVisibility, "private">>(initialVisibility);
  const [commentsEnabled, setCommentsEnabled] = useState(
    firstPublish ? initialVisibility === "public" : (initial?.commentsEnabled ?? true),
  );
  const [commentsTouched, setCommentsTouched] = useState(false);
  const [downloadEnabled, setDownloadEnabled] = useState(initial?.downloadEnabled ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [publishedResult, setPublishedResult] = useState<CreationSummary | null>(null);
  const [showcaseBusy, setShowcaseBusy] = useState(true);
  const [showcaseImages, setShowcaseImages] = useState<CreationShowcaseImage[]>(initial?.images ?? []);

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
  }, [availableTags.length, open, tagRequestNonce]);

  useEffect(() => {
    if (!open || !project) return;
    setPreviewDataUrl(createProjectPreview(project));
  }, [open, project]);

  const generatedPreviewSource = previewDataUrl ?? initial?.previewUrl ?? initial?.thumbnailUrl;
  const showcaseCover = showcaseImages.find((image) => image.isCover) ?? showcaseImages[0];
  const previewSource = showcaseCover?.thumbnailUrl ?? generatedPreviewSource;
  const tagNames = new Map(availableTags.map((tag) => [tag.slug, tag.name]));

  const validateDetails = () => {
    if (title.trim()) {
      setTitleError(null);
      return true;
    }
    setTitleError("Give your creation a title before continuing.");
    window.setTimeout(() => titleRef.current?.focus(), 0);
    return false;
  };

  const advance = () => {
    if (step === 0 && !validateDetails()) return;
    if (step < 2) setStep((step + 1) as PublishStep);
  };

  const publish = async () => {
    if (!validateDetails()) {
      setStep(0);
      return;
    }
    if (showcaseBusy) {
      toast.error("Wait for the showcase image change to finish before publishing.");
      setStep(1);
      return;
    }
    const payload: PublishInput = {
      title: title.trim(),
      description: description.trim(),
      tags: selectedTags,
      visibility,
      commentsEnabled,
      downloadEnabled,
    };
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
      setPublishedResult(result.data);
      toast.success(firstPublish
        ? visibility === "public" ? "Published to Discover" : "Unlisted share link is ready"
        : "Publishing settings updated");
    } catch (error) {
      toast.error(messageFromError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForOpen = () => {
    const nextVisibility = initial?.visibility === "unlisted" ? "unlisted" : "public";
    setStep(0);
    setTitle(initial?.title ?? "Untitled creation");
    setTitleError(null);
    setDescription(initial?.description ?? "");
    setSelectedTags(initial?.tags ?? []);
    setVisibility(nextVisibility);
    setCommentsEnabled(firstPublish ? nextVisibility === "public" : (initial?.commentsEnabled ?? true));
    setCommentsTouched(false);
    setDownloadEnabled(initial?.downloadEnabled ?? false);
    setPublishedResult(null);
    setShowcaseImages(initial?.images ?? []);
    setShowcaseBusy(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) resetForOpen();
        else setPublishedResult(null);
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? <Button type="button"><Send /> Review & publish</Button>}
      </DialogTrigger>
      <DialogContent className={publishedResult
        ? "max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-xl"
        : "h-[min(92vh,54rem)] max-h-[92vh] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl"}
      >
        {publishedResult ? (
          <div className="col-span-full m-auto w-full max-w-xl space-y-5 overflow-y-auto p-5 sm:p-7">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="text-[var(--island-mint-dark)]" /> Your share page is ready</DialogTitle>
              <DialogDescription>
                {publishedResult.visibility === "public"
                  ? "It can now appear in Discover, search, and your creator profile."
                  : "It stays out of search and profiles, but anyone with the link can view it."}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-2xl border-2 border-[var(--island-ink)] bg-[var(--island-blue-soft)] p-5 shadow-[4px_4px_0_var(--island-ink)]">
              <p className="island-kicker">Published successfully</p>
              <h3 className="mt-2 text-2xl font-black text-[var(--island-ink)]">{publishedResult.title}</h3>
              <p className="mt-2 text-sm font-medium leading-6 text-[var(--island-ink)]/65">Open the creation page, copy its stable link, or use your device share sheet.</p>
              <div className="mt-5">
                <ShareCreationActions
                  path={`/creation/${encodeURIComponent(publishedResult.slug)}`}
                  title={publishedResult.title}
                  socialCardUrl={publishedResult.socialImageUrl}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setPublishedResult(null); setOpen(false); }}>Continue editing</Button>
              <Button type="button" onClick={() => { setShowcaseBusy(true); setPublishedResult(null); setStep(0); }}>Edit publishing settings</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
              <DialogTitle>{firstPublish ? "Review before publishing" : "Edit publishing settings"}</DialogTitle>
              <DialogDescription>
                {firstPublish
                  ? "Your cloud save stays private until you complete all three steps and choose publish."
                  : "Walk through the steps to update how this creation appears and which community features are available."}
              </DialogDescription>
            </DialogHeader>

            <PublishingProgress step={step} />

            <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="min-w-0">
                  <section hidden={step !== 0} aria-labelledby={`publish-details-heading-${creationId}`} className="space-y-5">
                    <div>
                      <p className="island-kicker">Step 1 · Details</p>
                      <h2 id={`publish-details-heading-${creationId}`} className="mt-1 text-xl font-black text-[var(--island-ink)]">Tell people what you made</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">A clear title and a few useful tags make your work easier to find.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`publish-title-${creationId}`}>Title</Label>
                      <Input
                        ref={titleRef}
                        id={`publish-title-${creationId}`}
                        value={title}
                        aria-invalid={Boolean(titleError)}
                        aria-describedby={titleError ? `publish-title-error-${creationId}` : undefined}
                        onChange={(event) => {
                          const nextTitle = event.target.value.slice(0, 80);
                          setTitle(nextTitle);
                          if (nextTitle.trim()) setTitleError(null);
                        }}
                        maxLength={80}
                      />
                      <div className="flex items-start justify-between gap-3 text-xs">
                        {titleError ? <p id={`publish-title-error-${creationId}`} className="font-semibold text-destructive" role="alert">{titleError}</p> : <span />}
                        <p className="shrink-0 text-muted-foreground">{title.length}/80</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`publish-description-${creationId}`}>Description</Label>
                      <Textarea id={`publish-description-${creationId}`} value={description} onChange={(event) => setDescription(event.target.value.slice(0, 2000))} rows={5} maxLength={2000} />
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
                  </section>

                  <section hidden={step !== 1} aria-labelledby={`publish-showcase-heading-${creationId}`} className="space-y-5">
                    <div>
                      <p className="island-kicker">Step 2 · Showcase</p>
                      <h2 id={`publish-showcase-heading-${creationId}`} className="mt-1 text-xl font-black text-[var(--island-ink)]">Choose how your creation is seen</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">The generated pixel preview is always available. Photos and screenshots are optional.</p>
                    </div>
                    <ShowcaseImageManager
                      creationId={creationId}
                      readOnly={initial?.status === "published"}
                      onBusyChange={setShowcaseBusy}
                      onImagesChange={setShowcaseImages}
                    />
                  </section>

                  <section hidden={step !== 2} aria-labelledby={`publish-sharing-heading-${creationId}`} className="space-y-5">
                    <div>
                      <p className="island-kicker">Step 3 · Sharing</p>
                      <h2 id={`publish-sharing-heading-${creationId}`} className="mt-1 text-xl font-black text-[var(--island-ink)]">Review the audience and permissions</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">Nothing goes live until you use the final button below.</p>
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
                        <span><span className="block font-bold">Allow Studio project download</span><span className="block text-xs text-muted-foreground">Shares editable Tomodachi Studio JSON only—not a Nintendo game or save file.</span></span>
                        <Switch checked={downloadEnabled} onCheckedChange={setDownloadEnabled} />
                      </label>
                    </div>
                    <div className="flex gap-3 rounded-xl border border-[var(--island-blue)]/30 bg-[var(--island-blue-soft)] p-3 text-xs leading-5 text-[var(--island-ink)]/70">
                      <Eye className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{visibility === "public" ? "This creation can appear in search, Discover, and your public profile." : "This creation stays out of search and profiles, but anyone with its stable link can view it."} Tomodachi shares a web page only; it does not use Living the Dream's local-wireless exchange or transfer anything to a console.</p>
                    </div>
                    <dl className="grid gap-3 rounded-xl border border-[var(--island-ink)]/15 bg-white p-4 text-sm sm:grid-cols-2">
                      <div><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Title</dt><dd className="mt-1 break-words font-black">{title.trim()}</dd></div>
                      <div><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Showcase</dt><dd className="mt-1 font-black">{showcaseImages.length ? `${showcaseImages.length} image${showcaseImages.length === 1 ? "" : "s"}` : "Generated preview"}</dd></div>
                      <div><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Comments</dt><dd className="mt-1 font-black">{commentsEnabled ? "Allowed" : "Off"}</dd></div>
                      <div><dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Studio project</dt><dd className="mt-1 font-black">{downloadEnabled ? "JSON download on" : "Private"}</dd></div>
                    </dl>
                  </section>
                </div>

                <LiveProjectCard
                  description={description}
                  previewSource={previewSource}
                  project={project}
                  selectedTags={selectedTags}
                  tagNames={tagNames}
                  title={title}
                  visibility={visibility}
                />
              </div>
            </div>

            <DialogFooter className="items-center border-t border-[var(--island-ink)]/10 bg-white px-5 py-4 sm:px-6">
              <div className="mr-auto hidden text-xs font-bold text-muted-foreground sm:block">Step {step + 1} of {PUBLISH_STEPS.length}</div>
              {step === 0 ? (
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>{firstPublish ? "Keep private" : "Cancel"}</Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => setStep((step - 1) as PublishStep)}><ChevronLeft /> Back</Button>
              )}
              {step < 2 ? (
                <Button type="button" onClick={advance} disabled={step === 1 && showcaseBusy}>
                  {step === 0 ? "Continue to showcase" : "Continue to sharing"} <ChevronRight />
                </Button>
              ) : (
                <Button type="button" onClick={() => void publish()} disabled={submitting || showcaseBusy}>
                  {submitting
                    ? firstPublish ? "Publishing…" : "Saving…"
                    : firstPublish
                      ? visibility === "public" ? "Publish publicly" : "Create unlisted link"
                      : "Save publishing settings"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
