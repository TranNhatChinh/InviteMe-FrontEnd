"use client";

/* eslint-disable @next/next/no-img-element -- Wedding media is served by the wedding-owned media API. */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronLeft, ChevronRight, X } from "lucide-react";

export type GalleryImage = { id: string; imageUrl: string; alt?: string; caption?: string };

type GalleryProps = {
  images: GalleryImage[];
  variant: string;
  enabled?: boolean;
  sectionId?: string;
  title?: string;
  intro?: string;
};

export function StoryGalleryLightbox(props: GalleryProps) {
  if (props.variant === "flipbook") return <StoryGalleryFlipbook {...props} />;
  return <StoryGalleryGrid {...props} />;
}

function StoryGalleryGrid({ images, variant, enabled = true, sectionId }: GalleryProps) {
  const { t } = useTranslation("public");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeImage = activeIndex === null ? null : images[activeIndex] ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (activeImage && !dialog.open) dialog.showModal();
    if (!activeImage && dialog.open) dialog.close();
  }, [activeImage]);

  const move = (direction: -1 | 1) => setActiveIndex(current => current === null ? null : (current + direction + images.length) % images.length);
  const layout = variant === "masonry" ? "columns-2 gap-3 sm:columns-3 sm:gap-4" : "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4";

  return <>
    <div className={`story-gallery story-gallery--${variant} ${layout}`}>
      {images.map((image, index) => {
        const featured = variant === "featured" && index === 0;
        const imageClass = `story-gallery__image w-full object-cover ${variant === "masonry" ? (index % 3 === 1 ? "aspect-[4/5]" : "aspect-square") : featured ? "aspect-[16/9]" : `rounded-xl ${index % 4 === 0 ? "aspect-[4/5]" : "aspect-square"}`}`;
        const focusId = sectionId ? `story-gallery-image-${sectionId}-${image.id}` : undefined;
        return <figure id={focusId} tabIndex={-1} key={image.id || index} className={`story-gallery__item min-w-0 ${variant === "masonry" ? "mb-3 break-inside-avoid sm:mb-4" : ""} ${featured ? "col-span-2 sm:col-span-3" : ""}`}>
          {enabled ? <button type="button" onClick={() => setActiveIndex(index)} className="group relative block w-full overflow-hidden rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]" aria-label={`${t("storyGallery.openPhoto", { number: index + 1 })}: ${image.alt || t("storyGallery.galleryPhoto", { number: index + 1 })}`}>
            <img loading="lazy" decoding="async" src={image.imageUrl} alt={image.alt || t("storyGallery.galleryPhoto", { number: index + 1 })} className={imageClass} />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100 group-focus-visible:bg-black/20 group-focus-visible:opacity-100">{t("storyGallery.viewPhoto")}</span>
          </button> : <img loading="lazy" decoding="async" src={image.imageUrl} alt={image.alt || t("storyGallery.galleryPhoto", { number: index + 1 })} className={`${imageClass} rounded-xl`} />}
          {image.caption && <figcaption className="story-gallery__caption mt-2 px-1 text-sm leading-6 text-[var(--site-accent)]">{image.caption}</figcaption>}
        </figure>;
      })}
      {!images.length && <p className="col-span-full text-sm opacity-65">{t("storyGallery.emptyGallery")}</p>}
    </div>

    <dialog
      ref={dialogRef}
      aria-label={t("storyGallery.openGallery")}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[min(96vw,1200px)] max-w-none overflow-visible bg-transparent p-0 text-white backdrop:bg-black/90"
      onClose={() => setActiveIndex(null)}
      onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
      onKeyDown={event => {
        if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
      }}
    >
      {activeImage && <div className="relative mx-auto grid max-h-[92dvh] place-items-center">
        <img src={activeImage.imageUrl} alt={activeImage.alt || t("storyGallery.galleryPhoto", { number: (activeIndex ?? 0) + 1 })} className="max-h-[82dvh] max-w-full rounded-xl object-contain shadow-2xl" />
        <button type="button" autoFocus onClick={() => dialogRef.current?.close()} className="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={t("storyGallery.closePhoto")}><X className="size-5" /></button>
        {images.length > 1 && <>
          <button type="button" onClick={() => move(-1)} className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={t("storyGallery.previousPhoto")}><ChevronLeft className="size-6" /></button>
          <button type="button" onClick={() => move(1)} className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={t("storyGallery.nextPhoto")}><ChevronRight className="size-6" /></button>
          <p aria-live="polite" className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 text-xs">{(activeIndex ?? 0) + 1} / {images.length}</p>
        </>}
        {activeImage.caption && <p className="absolute bottom-12 left-1/2 max-w-[min(80vw,42rem)] -translate-x-1/2 rounded-full bg-black/65 px-4 py-2 text-center text-sm">{activeImage.caption}</p>}
      </div>}
    </dialog>
  </>;
}

function StoryGalleryFlipbook({ images, enabled = true, sectionId, title, intro }: GalleryProps) {
  const { t } = useTranslation("public");
  const [opened, setOpened] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [turn, setTurn] = useState<"next" | "previous" | null>(null);
  const turnRef = useRef<"next" | "previous" | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<number | null>(null);
  const activeImage = images[pageIndex] ?? null;
  const previousImage = pageIndex > 0 ? images[pageIndex - 1] : null;
  const revealedImage = turn ? images[turn === "next" ? pageIndex + 1 : Math.max(0, pageIndex - 1)] ?? activeImage : activeImage;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (lightboxOpen && !dialog.open) dialog.showModal();
    if (!lightboxOpen && dialog.open) dialog.close();
  }, [lightboxOpen]);

  useEffect(() => () => { if (fallbackTimer.current) clearTimeout(fallbackTimer.current); }, []);

  function completeTurn() {
    const direction = turnRef.current;
    if (!direction) return;
    setPageIndex(index => direction === "next" ? Math.min(images.length - 1, index + 1) : Math.max(0, index - 1));
    turnRef.current = null;
    setTurn(null);
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
  }

  function turnPage(direction: "next" | "previous") {
    if (!opened || turn || (direction === "next" ? pageIndex >= images.length - 1 : pageIndex <= 0)) return;
    turnRef.current = direction;
    setTurn(direction);
    fallbackTimer.current = setTimeout(completeTurn, 850);
  }

  if (!images.length) return <p className="story-flipbook__empty text-sm opacity-65">{t("storyGallery.emptyGallery")}</p>;
  const focusId = activeImage && sectionId ? `story-gallery-image-${sectionId}-${activeImage.id}` : undefined;

  return <section className={`story-flipbook ${opened ? "is-open" : "is-closed"}`} aria-label={title || t("storyGallery.openGallery")}>
    {!opened ? <button type="button" className="story-flipbook__cover group" onClick={() => setOpened(true)} aria-label={t("storyGallery.openGallery")}>
      <span className="story-flipbook__cover-image"><img src={activeImage?.imageUrl} alt="" />
        <span className="story-flipbook__cover-veil" />
      </span>
      <span className="story-flipbook__cover-frame" aria-hidden="true" />
      <span className="story-flipbook__cover-copy"><BookOpen aria-hidden="true" className="mx-auto mb-4 size-7" /><span className="block text-[10px] uppercase tracking-[0.28em]">{t("storyGallery.albumCover")}</span><span className="mt-3 block font-serif text-3xl sm:text-4xl">{title || t("storySection")}</span><span className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/55 px-4 text-xs transition group-hover:bg-white/15"><BookOpen className="size-4" />{t("storyGallery.openAlbum")}</span></span>
    </button> : <div className="story-flipbook__open" onKeyDown={event => {
      if (event.key === "ArrowRight") { event.preventDefault(); turnPage("next"); }
      if (event.key === "ArrowLeft") { event.preventDefault(); turnPage("previous"); }
    }} onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={event => {
      const start = touchStart.current; const end = event.changedTouches[0]?.clientX ?? start;
      if (start !== null && end !== null && Math.abs(end - start) > 50) turnPage(end < start ? "next" : "previous");
      touchStart.current = null;
    }}>
      <div className="story-flipbook__binding" aria-hidden="true" />
      <div className="story-flipbook__spread">
        <div className="story-flipbook__left-page">
          {previousImage ? <><img src={previousImage.imageUrl} alt={previousImage.alt || ""} className="story-flipbook__previous-image" /><p className="story-flipbook__caption">{previousImage.caption || t("storyGallery.photoCaptionFallback")}</p></> : <div className="story-flipbook__dedication"><span aria-hidden="true" className="text-3xl text-[var(--site-accent)]">♡</span><p className="mt-5 font-serif text-xl">{title || t("storySection")}</p><p className="mt-3 text-sm leading-6 opacity-70">{intro || t("storyGallery.flipbookIntro")}</p><span className="mt-8 text-xs tracking-[0.24em] text-[var(--site-accent)]">{String(pageIndex + 1).padStart(2, "0")}</span></div>}
        </div>
        <figure id={focusId} tabIndex={-1} className="story-flipbook__right-page">
          {revealedImage && <><button type="button" className="story-flipbook__image-button" onClick={() => { if (enabled) setLightboxOpen(true); }} aria-label={enabled ? t("storyGallery.zoomPhoto", { number: pageIndex + 1 }) : t("storyGallery.galleryPhoto", { number: pageIndex + 1 })}><img src={revealedImage.imageUrl} alt={revealedImage.alt || t("storyGallery.galleryPhoto", { number: pageIndex + 1 })} className="story-flipbook__active-image" /></button>{revealedImage.caption && <figcaption className="story-flipbook__caption">{revealedImage.caption}</figcaption>}</>}
        </figure>
        {turn && <div key={`${turn}-${pageIndex}`} onAnimationEnd={completeTurn} className={`story-flipbook__turning-page story-flipbook__turning-page--${turn}`} aria-hidden="true">
          <div className="story-flipbook__leaf-face story-flipbook__leaf-face--front"><img src={activeImage?.imageUrl} alt="" /></div>
          <div className="story-flipbook__leaf-face story-flipbook__leaf-face--back"><img src={images[turn === "next" ? pageIndex + 1 : Math.max(0, pageIndex - 1)]?.imageUrl} alt="" /></div>
        </div>}
      </div>
      <div className="story-flipbook__controls">
        <button type="button" className="story-flipbook__control" onClick={() => turnPage("previous")} disabled={pageIndex === 0 || Boolean(turn)} aria-label={t("storyGallery.previousPage")}><ChevronLeft className="size-4" /><span>{t("storyGallery.previous")}</span></button>
        <p aria-live="polite" className="story-flipbook__counter">{pageIndex + 1} / {images.length}</p>
        <button type="button" className="story-flipbook__control" onClick={() => turnPage("next")} disabled={pageIndex >= images.length - 1 || Boolean(turn)} aria-label={t("storyGallery.nextPage")}><span>{t("storyGallery.next")}</span><ChevronRight className="size-4" /></button>
        <button type="button" className="story-flipbook__close" onClick={() => { setOpened(false); setPageIndex(0); }} aria-label={t("storyGallery.closeAlbum")}><X className="size-4" /><span>{t("storyGallery.closeAlbum")}</span></button>
      </div>
    </div>}
    <dialog ref={dialogRef} aria-label={t("storyGallery.zoomAlbumPhoto")} className="story-flipbook__dialog fixed inset-0 m-auto max-h-[92dvh] w-[min(96vw,1200px)] max-w-none overflow-visible bg-transparent p-0 text-white backdrop:bg-black/90" onClose={() => setLightboxOpen(false)} onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }} onKeyDown={event => {
      if (event.key === "ArrowLeft") { event.preventDefault(); setPageIndex(index => Math.max(0, index - 1)); }
      if (event.key === "ArrowRight") { event.preventDefault(); setPageIndex(index => Math.min(images.length - 1, index + 1)); }
    }}>
      {lightboxOpen && activeImage && <div className="relative mx-auto grid max-h-[92dvh] place-items-center"><img src={activeImage.imageUrl} alt={activeImage.alt || t("storyGallery.galleryPhoto", { number: pageIndex + 1 })} className="max-h-[82dvh] max-w-full rounded-xl object-contain shadow-2xl" /><button type="button" autoFocus onClick={() => dialogRef.current?.close()} className="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={t("storyGallery.closePhoto")}><X className="size-5" /></button>{images.length > 1 && <><button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex(index => Math.max(0, index - 1))} className="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white disabled:opacity-40" aria-label={t("storyGallery.previousPhoto")}><ChevronLeft className="size-6" /></button><button type="button" disabled={pageIndex === images.length - 1} onClick={() => setPageIndex(index => Math.min(images.length - 1, index + 1))} className="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white disabled:opacity-40" aria-label={t("storyGallery.nextPhoto")}><ChevronRight className="size-6" /></button></>}{activeImage.caption && <p className="absolute bottom-4 left-1/2 max-w-[min(80vw,42rem)] -translate-x-1/2 rounded-full bg-black/65 px-4 py-2 text-center text-sm">{activeImage.caption}</p>}</div>}
    </dialog>
  </section>;
}
