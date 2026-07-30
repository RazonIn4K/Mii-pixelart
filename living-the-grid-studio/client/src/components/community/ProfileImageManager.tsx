import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  communityApi,
  CommunityApiError,
  jsonBody,
  messageFromError,
} from "@/lib/community/api";
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  CommunityUser,
} from "@/lib/community/types";
import { toast } from "@/lib/toast";
import {
  COMMUNITY_IMAGE_CONTENT_TYPES,
  COMMUNITY_LIMITS,
} from "@shared/community";

const MAX_PROFILE_IMAGE_BYTES = COMMUNITY_LIMITS.profileImageInputBytes;
const ACCEPTED_PROFILE_IMAGE_TYPES = new Set<string>(
  COMMUNITY_IMAGE_CONTENT_TYPES,
);
const PROFILE_IMAGE_ACCEPT = [
  ...COMMUNITY_IMAGE_CONTENT_TYPES,
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
].join(",");

interface AvatarUploadTicket {
  expiresAt: number;
  maximumBytes: number;
  uploadId: string;
  uploadToken: string;
  uploadUrl: string;
}

function normalizedProfileImageType(file: File): string | null {
  const declared = file.type.trim().toLowerCase();
  if (ACCEPTED_PROFILE_IMAGE_TYPES.has(declared)) return declared;
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  return null;
}

async function uploadProfileImage(
  ticket: AvatarUploadTicket,
  file: File,
  contentType: string,
): Promise<CommunityUser> {
  let response: Response;
  try {
    response = await fetch(ticket.uploadUrl, {
      body: file,
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${ticket.uploadToken}`,
        "Content-Type": contentType,
      },
      method: "PUT",
    });
  } catch {
    throw new CommunityApiError(
      "The profile photo upload could not reach the community service.",
      { code: "NETWORK_ERROR" },
    );
  }

  const isJson = (response.headers.get("content-type") ?? "").includes(
    "application/json",
  );
  const body = isJson
    ? ((await response.json()) as ApiEnvelope<CommunityUser> | ApiErrorEnvelope)
    : null;
  if (!response.ok || !body || "error" in body) {
    const error = body && "error" in body ? body.error : null;
    throw new CommunityApiError(
      error?.message ??
        "The profile photo could not be processed. Try a different file.",
      {
        code: error?.code ?? `HTTP_${response.status}`,
        fields: error?.fields,
        status: response.status,
      },
    );
  }
  return body.data;
}

export function ProfileImageManager() {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const { applyAccountUpdate, communityMutationsEnabled, user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [focusX, setFocusX] = useState(50);
  const [focusY, setFocusY] = useState(50);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setPreviewFailed(false);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPreviewFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const chooseFile = (next: File | null) => {
    if (!next) return;
    if (!normalizedProfileImageType(next)) {
      toast.error("Choose a JPEG, PNG, WebP, or HEIC image.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (next.size < 1 || next.size > MAX_PROFILE_IMAGE_BYTES) {
      toast.error("Profile images must be smaller than 8 MiB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(next);
    setFocusX(50);
    setFocusY(50);
  };

  const clearSelection = () => {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const upload = async () => {
    const contentType = file ? normalizedProfileImageType(file) : null;
    if (!file || !contentType || uploading) return;
    setUploading(true);
    try {
      const ticket = await communityApi<AvatarUploadTicket>(
        "/api/me/avatar/uploads",
        {
          body: jsonBody({
            byteSize: file.size,
            contentType,
            focusX,
            focusY,
          }),
          method: "POST",
        },
      );
      const account = await uploadProfileImage(ticket.data, file, contentType);
      applyAccountUpdate({
        avatarUrl: account.avatarUrl ?? null,
        id: account.id,
      });
      clearSelection();
      toast.success("Profile photo updated");
    } catch (error) {
      toast.error(messageFromError(error));
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      const result = await communityApi<CommunityUser>("/api/me/avatar", {
        body: jsonBody({}),
        method: "DELETE",
      });
      applyAccountUpdate({
        avatarUrl: result.data.avatarUrl ?? null,
        id: result.data.id,
      });
      toast.success("Generated avatar restored");
    } catch (error) {
      toast.error(messageFromError(error));
    } finally {
      setRemoving(false);
    }
  };

  const disabled = !communityMutationsEnabled || uploading || removing;

  return (
    <section
      className="mt-5 rounded-2xl border border-border bg-muted/25 p-4"
      aria-labelledby={`${inputId}-heading`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`${inputId}-heading`} className="text-sm font-black">
            Profile photo{" "}
            <span className="font-medium text-muted-foreground">
              (optional)
            </span>
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Upload your own square photo or keep the generated Island avatar.
            Raw files and metadata are discarded after a safe WebP copy is made.
          </p>
        </div>
        <ImagePlus className="size-5 shrink-0 text-primary" />
      </div>

      <label htmlFor={inputId} className="sr-only">
        Choose a profile photo
      </label>
      <input
        ref={fileRef}
        id={inputId}
        type="file"
        className="sr-only"
        accept={PROFILE_IMAGE_ACCEPT}
        disabled={disabled}
        tabIndex={-1}
        onChange={(event) => chooseFile(event.target.files?.item(0) ?? null)}
      />

      {file && previewUrl ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-[8rem_1fr] sm:items-start">
          <div className="mx-auto aspect-square w-32 overflow-hidden rounded-full border-2 border-[var(--island-ink)] bg-white shadow-[3px_3px_0_var(--island-ink)]">
            {previewFailed ? (
              <div className="flex h-full items-center justify-center p-3 text-center text-xs font-bold text-muted-foreground">
                Preview unavailable. The server can still process supported HEIC
                files.
              </div>
            ) : (
              <img
                src={previewUrl}
                alt="Profile photo crop preview"
                className="size-full object-cover"
                style={{ objectPosition: `${focusX}% ${focusY}%` }}
                onError={() => setPreviewFailed(true)}
              />
            )}
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-bold">
              Horizontal focus · {focusX}%
              <input
                type="range"
                min="0"
                max="100"
                value={focusX}
                className="mt-1 block w-full accent-primary"
                disabled={disabled}
                onChange={(event) => setFocusX(Number(event.target.value))}
              />
            </label>
            <label className="block text-xs font-bold">
              Vertical focus · {focusY}%
              <input
                type="range"
                min="0"
                max="100"
                value={focusY}
                className="mt-1 block w-full accent-primary"
                disabled={disabled}
                onChange={(event) => setFocusY(Number(event.target.value))}
              />
            </label>
            <p className="text-[0.68rem] leading-5 text-muted-foreground">
              Drag the focus sliders until the important part is centered in the
              circle.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="size-3.5" />
          {file
            ? "Choose a different photo"
            : user?.avatarUrl
              ? "Replace photo"
              : "Choose photo"}
        </Button>
        {file ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => void upload()}
            >
              {uploading ? (
                <Loader2 className="size-3.5 motion-safe:animate-spin" />
              ) : (
                <UploadCloud className="size-3.5" />
              )}
              {uploading ? "Processing…" : "Upload photo"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={clearSelection}
            >
              <X className="size-3.5" /> Cancel
            </Button>
          </>
        ) : null}
        {user?.avatarUrl ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => void remove()}
          >
            {removing ? (
              <Loader2 className="size-3.5 motion-safe:animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            {removing ? "Restoring…" : "Use generated avatar"}
          </Button>
        ) : null}
      </div>

      <p className="mt-3 text-[0.68rem] leading-5 text-muted-foreground">
        JPEG, PNG, WebP, or HEIC · up to 8 MiB · never copied from Google
        automatically
      </p>
    </section>
  );
}
