import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  communityApi,
  jsonBody,
  messageFromError,
  CommunityApiError,
} from "@/lib/community/api";
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  CreationShowcaseImage,
} from "@/lib/community/types";

const MAX_SHOWCASE_IMAGES = 4;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

interface UploadTicket {
  uploadId: string;
  uploadToken: string;
  uploadUrl: string;
  expiresAt: number;
  maximumBytes: number;
}

interface UploadResult {
  image: CreationShowcaseImage;
  images: CreationShowcaseImage[];
}

interface GalleryMutationResult {
  images: CreationShowcaseImage[];
}

interface GalleryDeleteResult extends GalleryMutationResult {
  deletedImageId: string;
}

function normalizedContentType(file: File): string | null {
  const type = file.type.toLowerCase();
  if (ACCEPTED_TYPES.has(type)) return type;
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  return null;
}

async function uploadWithTicket(
  ticket: UploadTicket,
  file: File,
  contentType: string,
): Promise<UploadResult> {
  let response: Response;
  try {
    response = await fetch(ticket.uploadUrl, {
      method: "PUT",
      body: file,
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${ticket.uploadToken}`,
        "Content-Type": contentType,
      },
    });
  } catch {
    throw new CommunityApiError(
      "The image upload could not reach the community service. Your project is still safe.",
      { code: "NETWORK_ERROR" },
    );
  }

  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const body = isJson
    ? await response.json() as ApiEnvelope<UploadResult> | ApiErrorEnvelope
    : null;
  if (!response.ok || !body || "error" in body) {
    const error = body && "error" in body ? body.error : null;
    throw new CommunityApiError(
      error?.message ?? "The image could not be processed. Try a different file.",
      {
        code: error?.code ?? `HTTP_${response.status}`,
        fields: error?.fields,
        status: response.status,
      },
    );
  }
  return body.data;
}

export function ShowcaseImageManager({
  creationId,
  onImagesChange,
  onBusyChange,
  readOnly = false,
}: {
  creationId: string;
  onImagesChange?: (images: CreationShowcaseImage[]) => void;
  onBusyChange?: (busy: boolean) => void;
  readOnly?: boolean;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<CreationShowcaseImage[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const busy = loading || loadError !== null || uploading || updating !== null;

  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  const replaceImages = (next: CreationShowcaseImage[]) => {
    setImages(next);
    onImagesChange?.(next);
  };

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setLoadError(null);
    void communityApi<CreationShowcaseImage[]>(`/api/creations/${creationId}/images`)
      .then((result) => {
        if (!canceled) replaceImages(result.data);
      })
      .catch((error) => {
        if (!canceled) setLoadError(messageFromError(error));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => { canceled = true; };
    // `replaceImages` intentionally remains a local state adapter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creationId, loadNonce]);

  const chooseFile = (nextFile: File | null) => {
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!normalizedContentType(nextFile)) {
      setFile(null);
      toast.error("Choose a JPEG, PNG, WebP, HEIC, or HEIF image.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (nextFile.size < 1 || nextFile.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      toast.error("Showcase images must be smaller than 8 MiB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(nextFile);
  };

  const upload = async () => {
    const cleanAlt = altText.trim();
    const contentType = file ? normalizedContentType(file) : null;
    if (!file || !contentType) {
      toast.error("Choose an image first.");
      return;
    }
    if (!cleanAlt) {
      toast.error("Describe the image for people who cannot see it.");
      return;
    }
    setUploading(true);
    try {
      const ticket = await communityApi<UploadTicket>(
        `/api/creations/${creationId}/images/uploads`,
        {
          method: "POST",
          body: jsonBody({
            contentType,
            byteSize: file.size,
            altText: cleanAlt,
          }),
        },
      );
      const result = await uploadWithTicket(ticket.data, file, contentType);
      replaceImages(result.images);
      setFile(null);
      setAltText("");
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Showcase image added");
    } catch (error) {
      toast.error(messageFromError(error));
    } finally {
      setUploading(false);
    }
  };

  const saveOrder = async (ordered: CreationShowcaseImage[], coverImageId: string) => {
    setUpdating(coverImageId);
    try {
      const result = await communityApi<GalleryMutationResult>(
        `/api/creations/${creationId}/images`,
        {
          method: "PATCH",
          body: jsonBody({
            orderedImageIds: ordered.map((image) => image.id),
            coverImageId,
          }),
        },
      );
      replaceImages(result.data.images);
    } catch (error) {
      toast.error(messageFromError(error));
    } finally {
      setUpdating(null);
    }
  };

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const cover = reordered.find((image) => image.isCover)?.id ?? reordered[0].id;
    void saveOrder(reordered, cover);
  };

  const remove = async (image: CreationShowcaseImage) => {
    setUpdating(image.id);
    try {
      const result = await communityApi<GalleryDeleteResult>(
        `/api/creations/${creationId}/images/${image.id}`,
        { method: "DELETE", body: jsonBody({}) },
      );
      replaceImages(result.data.images);
      toast.success("Showcase image removed");
    } catch (error) {
      toast.error(messageFromError(error));
    } finally {
      setUpdating(null);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby={`${inputId}-heading`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`${inputId}-heading`} className="text-sm font-black text-[var(--island-ink)]">
            Showcase images <span className="font-medium text-muted-foreground">(optional)</span>
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Add up to four photos or screenshots. We remove metadata and keep optimized copies only.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold">
          {images.length}/{MAX_SHOWCASE_IMAGES}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-xs" role="status">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Loading showcase images…
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-xl border border-destructive/30 bg-red-50 p-3 text-xs text-red-950" role="alert">
          <p>The showcase gallery could not be loaded: {loadError}</p>
          <Button type="button" size="sm" variant="outline" className="mt-2 bg-white" onClick={() => setLoadNonce((value) => value + 1)}>
            Retry gallery
          </Button>
        </div>
      ) : null}

      {images.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {images.map((image, index) => (
            <article key={image.id} className="overflow-hidden rounded-xl border-2 border-[var(--island-ink)] bg-white">
              <div className="relative aspect-[4/3] bg-[var(--island-paper)]">
                <img
                  src={image.thumbnailUrl}
                  alt={image.altText}
                  width={512}
                  height={512}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                {image.isCover ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-[var(--island-ink)] bg-[var(--island-yellow)] px-2 py-1 text-[0.65rem] font-black uppercase tracking-wide">
                    <Star className="h-3 w-3 fill-current" /> Cover
                  </span>
                ) : null}
              </div>
              <div className="space-y-2 p-3">
                <p className="line-clamp-2 min-h-8 text-xs font-medium leading-4">{image.altText}</p>
                {!readOnly ? <div className="flex flex-wrap gap-1" aria-label={`Manage image ${index + 1}`}>
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={index === 0 || updating !== null} onClick={() => move(index, -1)} aria-label="Move image earlier"><ArrowLeft /></Button>
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={index === images.length - 1 || updating !== null} onClick={() => move(index, 1)} aria-label="Move image later"><ArrowRight /></Button>
                  {!image.isCover ? <Button type="button" variant="outline" size="sm" className="h-8" disabled={updating !== null} onClick={() => void saveOrder(images, image.id)}><Star /> Make cover</Button> : null}
                  <Button type="button" variant="ghost" size="icon" className="ml-auto h-8 w-8 text-destructive" disabled={updating !== null} onClick={() => void remove(image)} aria-label="Remove image"><Trash2 /></Button>
                </div> : null}
              </div>
            </article>
          ))}
        </div>
      ) : !loading ? (
        <div className="rounded-xl border border-dashed border-[var(--island-ink)]/30 bg-[var(--island-paper)] p-4 text-center text-xs text-muted-foreground">
          Your generated pixel preview will be used until you add a showcase image.
        </div>
      ) : null}

      {readOnly ? (
        <p className="rounded-xl border border-[var(--island-blue)]/30 bg-[var(--island-blue-soft)] p-3 text-xs font-semibold leading-5 text-[var(--island-ink)]/70">
          This gallery is live. Unpublish the creation from Your projects before adding, removing, or rearranging images, then publish again to review the complete gallery.
        </p>
      ) : images.length < MAX_SHOWCASE_IMAGES ? (
        <div className="space-y-3 rounded-xl border border-[var(--island-blue)]/30 bg-[var(--island-blue-soft)] p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${inputId}-file`}>Choose a photo or screenshot</Label>
            <Input
              ref={fileRef}
              id={`${inputId}-file`}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
              disabled={uploading}
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-[0.7rem] leading-4 text-muted-foreground">JPEG, PNG, WebP, HEIC, or HEIF · maximum 8 MiB. Animations are flattened to a still; vector files are not accepted.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${inputId}-alt`}>Image description</Label>
            <Input
              id={`${inputId}-alt`}
              value={altText}
              maxLength={200}
              placeholder="Example: A smiling islander in a blue cap"
              disabled={uploading}
              onChange={(event) => setAltText(event.target.value.slice(0, 200))}
            />
            <p className="text-right text-[0.7rem] text-muted-foreground">{altText.length}/200</p>
          </div>
          <Button type="button" onClick={() => void upload()} disabled={!file || !altText.trim() || uploading}>
            {uploading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <ImagePlus />}
            {uploading ? "Optimizing image…" : "Add showcase image"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
