"use client";

/* eslint-disable @next/next/no-img-element -- Wedding media is served by the wedding-owned media API. */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type GalleryImage = { id: string; imageUrl: string; alt?: string };

export function StoryGalleryLightbox({ images, variant, enabled = true }: {
  images: GalleryImage[]; variant: string; enabled?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeImage = activeIndex === null ? null : images[activeIndex] ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (activeImage && !dialog.open) dialog.showModal();
    if (!activeImage && dialog.open) dialog.close();
  }, [activeImage]);

  const move = (direction: -1 | 1) => {
    setActiveIndex(current => current === null ? null : (current + direction + images.length) % images.length);
  };

  return <>
    <div className={`story-gallery story-gallery--${variant} ${variant === "masonry" ? "columns-2 gap-3 sm:columns-3 sm:gap-4" : "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"}`}>
      {images.map((image, index) => {
        const imageClass = `story-gallery__image w-full object-cover ${variant === "masonry" ? `mb-3 break-inside-avoid sm:mb-4 ${index % 3 === 1 ? "aspect-[4/5]" : "aspect-square"}` : `rounded-xl ${index % 4 === 0 ? "aspect-[4/5]" : "aspect-square"}`}`;
        return enabled ? <button key={image.id || index} type="button" onClick={() => setActiveIndex(index)} className="group relative block w-full overflow-hidden rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]" aria-label={`Mở ảnh ${image.alt || `Ảnh cưới ${index + 1}`}`}>
          <img loading="lazy" decoding="async" src={image.imageUrl} alt={image.alt || `Ảnh cưới ${index + 1}`} className={imageClass} />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100 group-focus-visible:bg-black/20 group-focus-visible:opacity-100">Xem ảnh</span>
        </button> : <img key={image.id || index} loading="lazy" decoding="async" src={image.imageUrl} alt={image.alt || `Ảnh cưới ${index + 1}`} className={imageClass} />;
      })}
      {!images.length && <p className="col-span-full text-sm opacity-65">Thêm ảnh để tạo album cưới.</p>}
    </div>

    <dialog
      ref={dialogRef}
      aria-label="Xem ảnh cưới"
      className="fixed inset-0 m-auto max-h-[92dvh] w-[min(96vw,1200px)] max-w-none overflow-visible bg-transparent p-0 text-white backdrop:bg-black/90"
      onClose={() => setActiveIndex(null)}
      onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
      onKeyDown={event => {
        if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
      }}
    >
      {activeImage && <div className="relative mx-auto grid max-h-[92dvh] place-items-center">
        <img src={activeImage.imageUrl} alt={activeImage.alt || `Ảnh cưới ${(activeIndex ?? 0) + 1}`} className="max-h-[86dvh] max-w-full rounded-xl object-contain shadow-2xl" />
        <button type="button" autoFocus onClick={() => dialogRef.current?.close()} className="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Đóng ảnh"><X className="size-5" /></button>
        {images.length > 1 && <>
          <button type="button" onClick={() => move(-1)} className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Ảnh trước"><ChevronLeft className="size-6" /></button>
          <button type="button" onClick={() => move(1)} className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Ảnh tiếp theo"><ChevronRight className="size-6" /></button>
          <p aria-live="polite" className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 text-xs">{(activeIndex ?? 0) + 1} / {images.length}</p>
        </>}
      </div>}
    </dialog>
  </>;
}
