import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Expand, Images, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CreationShowcaseImage } from "@/lib/community/types";

interface CreationShowcaseGalleryProps {
  fallbackAlt: string;
  fallbackImageUrl?: string | null;
  images?: CreationShowcaseImage[];
  title: string;
}

function orderedImages(images: CreationShowcaseImage[]): CreationShowcaseImage[] {
  return [...images].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function CreationShowcaseGallery({
  fallbackAlt,
  fallbackImageUrl,
  images,
  title,
}: CreationShowcaseGalleryProps) {
  const galleryImages = useMemo(() => orderedImages(images ?? []), [images]);
  const preferredImageId = galleryImages.find((image) => image.isCover)?.id
    ?? galleryImages[0]?.id
    ?? null;
  const [selectedImageId, setSelectedImageId] = useState<string | null>(preferredImageId);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSelectedImageId((current) => (
      current && galleryImages.some((image) => image.id === current)
        ? current
        : preferredImageId
    ));
  }, [galleryImages, preferredImageId]);

  const selectedIndex = Math.max(
    0,
    galleryImages.findIndex((image) => image.id === selectedImageId),
  );
  const selectedImage = galleryImages[selectedIndex];
  const selectedSource = selectedImage?.displayUrl ?? fallbackImageUrl;
  const selectedAlt = selectedImage?.altText ?? fallbackAlt;

  const selectRelativeImage = (offset: number) => {
    if (galleryImages.length < 2) return;
    const nextIndex = (selectedIndex + offset + galleryImages.length) % galleryImages.length;
    setSelectedImageId(galleryImages[nextIndex].id);
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectRelativeImage(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      selectRelativeImage(1);
    }
  };

  return (
    <div className="space-y-3">
      {selectedSource ? (
        selectedImage ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="group relative block w-full rounded-[1.75rem] text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 focus-visible:ring-offset-4"
                aria-label={`Open image ${selectedIndex + 1} of ${galleryImages.length} in full-screen gallery: ${selectedAlt}`}
              >
                <span className="community-art-frame block">
                  <img
                    src={selectedSource}
                    alt={selectedAlt}
                    width={selectedImage.width}
                    height={selectedImage.height}
                    loading="eager"
                    className="aspect-square w-full object-contain"
                    decoding="async"
                  />
                </span>
                <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full border border-white/40 bg-[var(--island-ink)]/85 px-3 py-2 text-xs font-black text-white shadow-lg transition-transform group-hover:-translate-y-0.5 motion-reduce:transition-none">
                  <Expand className="h-4 w-4" aria-hidden="true" /> Open gallery
                </span>
              </button>
            </DialogTrigger>
            <DialogContent
              showCloseButton={false}
              onKeyDown={handleDialogKeyDown}
              className="inset-0 left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-x-hidden overflow-y-auto rounded-none border-0 bg-[#101016]/98 p-0 text-white shadow-none duration-150 motion-reduce:animate-none motion-reduce:transition-none sm:max-w-none"
            >
              <DialogHeader className="sr-only">
                <DialogTitle>{`Showcase gallery for ${title}`}</DialogTitle>
                <DialogDescription>
                  Use the previous and next buttons, the thumbnails, or the left and right arrow keys to browse. Press Escape to close.
                </DialogDescription>
              </DialogHeader>

              <div className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-3 py-3 sm:px-6 sm:py-5">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black sm:text-base">{title}</p>
                    <p className="text-xs font-bold text-white/65" aria-live="polite" aria-atomic="true">
                      Image {selectedIndex + 1} of {galleryImages.length}
                    </p>
                  </div>
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                    >
                      <X aria-hidden="true" /> Close
                    </Button>
                  </DialogClose>
                </div>

                <div className="flex min-h-0 flex-1 flex-col justify-center py-3 sm:py-5">
                  <figure className="flex min-h-0 flex-col items-center justify-center gap-3">
                    <img
                      key={selectedImage.id}
                      src={selectedImage.displayUrl}
                      alt={selectedImage.altText}
                      width={selectedImage.width}
                      height={selectedImage.height}
                      decoding="async"
                      className="h-[min(66dvh,52rem)] w-full rounded-xl object-contain shadow-2xl motion-reduce:animate-none"
                    />
                    <figcaption className="max-w-3xl text-center text-xs font-medium leading-5 text-white/75 sm:text-sm">
                      {selectedImage.altText}
                    </figcaption>
                  </figure>
                </div>

                <div className="flex flex-col gap-3 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
                  {galleryImages.length > 1 ? (
                    <div className="flex items-center justify-between gap-2" role="group" aria-label="Gallery navigation">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-w-0 flex-1 border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:flex-none"
                        onClick={() => selectRelativeImage(-1)}
                        aria-label="Previous showcase image"
                      >
                        <ChevronLeft aria-hidden="true" /> Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-w-0 flex-1 border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:flex-none"
                        onClick={() => selectRelativeImage(1)}
                        aria-label="Next showcase image"
                      >
                        Next <ChevronRight aria-hidden="true" />
                      </Button>
                    </div>
                  ) : null}

                  <div className="max-w-full overflow-x-auto overscroll-x-contain pb-1" role="group" aria-label="Showcase image thumbnails">
                    <div className="mx-auto flex w-max min-w-full justify-center gap-2">
                      {galleryImages.map((image, index) => (
                        <button
                          key={image.id}
                          type="button"
                          aria-label={`View image ${index + 1}: ${image.altText}`}
                          aria-current={selectedImage.id === image.id ? "true" : undefined}
                          onClick={() => setSelectedImageId(image.id)}
                          className="w-14 shrink-0 overflow-hidden rounded-lg border-2 border-white/25 bg-white/10 p-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 data-[selected=true]:border-[var(--island-mint)] sm:w-16"
                          data-selected={selectedImage.id === image.id}
                        >
                          <img
                            src={image.thumbnailUrl}
                            alt=""
                            width={image.width}
                            height={image.height}
                            loading="lazy"
                            decoding="async"
                            className="aspect-square w-full rounded-md object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <figure className="community-art-frame">
            <img
              src={selectedSource}
              alt={selectedAlt}
              width={1600}
              height={1600}
              loading="eager"
              className="aspect-square w-full object-contain"
              decoding="async"
            />
          </figure>
        )
      ) : (
        <figure className="community-art-frame">
          <div className="pixel-placeholder aspect-square">
            <span /><span /><span /><span /><span /><span /><span /><span /><span />
          </div>
        </figure>
      )}

      {galleryImages.length ? (
        <section aria-labelledby="showcase-gallery-title" className="rounded-2xl border border-[var(--island-ink)]/10 bg-white/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="showcase-gallery-title" className="flex items-center gap-2 text-sm font-black">
              <Images className="h-4 w-4" aria-hidden="true" /> Showcase gallery
            </h2>
            <span className="text-xs font-bold text-[var(--island-ink)]/45">
              {galleryImages.length} image{galleryImages.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {galleryImages.map((image, index) => (
              <button
                key={image.id}
                type="button"
                aria-label={`Show image ${index + 1}: ${image.altText}`}
                aria-pressed={selectedImage.id === image.id}
                onClick={() => setSelectedImageId(image.id)}
                className="overflow-hidden rounded-xl border-2 border-transparent bg-[var(--island-paper)] transition data-[selected=true]:border-[var(--island-blue)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 motion-reduce:transition-none"
                data-selected={selectedImage.id === image.id}
              >
                <img
                  src={image.thumbnailUrl}
                  alt=""
                  width={image.width}
                  height={image.height}
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
