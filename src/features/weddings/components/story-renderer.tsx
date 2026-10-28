"use client";
/* eslint-disable @next/next/no-img-element -- Wedding media URLs are provided by the API. */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { WeddingStoryDocument } from "../schemas/wedding-story.schema";
import { builtinStoryTemplateCatalog, storyPalettes, type StoryPaletteKey } from "../templates/story-templates";
import { resolveMediaUrl } from "@/core/config/media-url";
import { StoryWishes } from "./story-wishes";
import { StoryRsvp } from "./story-rsvp";
import styles from "./story-classic.module.css";

function displayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  return match ? `${match[4] ? `${match[4]}:${match[5]} · ` : ""}${match[3]}.${match[2]}.${match[1]}` : value;
}

function Countdown({ date, banner }: { date: string; banner: boolean }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, new Date(date).getTime() - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [date]);
  if (remaining === null || !Number.isFinite(remaining)) return null;
  const seconds = Math.floor(remaining / 1000);
  const values = [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
  return <section className={`${styles.countdown} ${banner ? styles.countdownBanner : ""}`} aria-label="Đếm ngược đến ngày cưới">
    {values.map((value, index) => <div className={styles.countdownBox} key={index}>
      <strong>{String(value).padStart(2, "0")}</strong><span>{["Ngày", "Giờ", "Phút", "Giây"][index]}</span>
    </div>)}
  </section>;
}

export function StoryClassic({ document, slug }: { document: WeddingStoryDocument; slug?: string }) {
  const { couple, story, events, gallery, wishes, gift } = document;
  const fallback = builtinStoryTemplateCatalog.find((template) => template.key === document.templateId) ?? builtinStoryTemplateCatalog[0];
  const sections = document.storyTemplate?.sections ?? fallback?.config.sections ?? [];
  const variant = (type: string) => sections.find((section) => section.type === type)?.variant;
  const twoColumns = variant("couple") === "two-columns";
  const floral = variant("hero") === "floral";
  const paletteId = document.paletteId ?? (twoColumns ? "burgundy" : "blush");
  const palette = document.storyTemplate?.theme ?? storyPalettes[paletteId as StoryPaletteKey] ?? storyPalettes.blush;
  const mainEvent = events.items.find((event) => event.id === document.mainEventId) ?? events.items[0];
  const weddingDate = mainEvent?.date || couple.date;
  const cover = couple.coverImage
    ? `url("${(resolveMediaUrl(couple.coverImage) ?? couple.coverImage).replaceAll('"', "%22")}")` : "none";
  const slides = couple.slides ?? [];

  const coupleSection = <section className={styles.section} id="couple" key="couple">
    <h2 className={styles.sectionTitle}>Cặp đôi</h2>
    <div className={styles.couple}>{([couple.groom, couple.bride] as const).map((person, index) =>
      <article className={styles.person} key={index}>
        {person.photo ? <img className={styles.portrait} src={resolveMediaUrl(person.photo) ?? person.photo} alt={person.name} />
          : <div className={styles.portrait} aria-hidden="true" />}
        <h3>{person.name}</h3>
        {(person.father || person.mother) && <p className={styles.parents}>
          {person.father && <>Con ông: {person.father}<br /></>}{person.mother && <>Con bà: {person.mother}</>}
        </p>}
        <p>{person.bio}</p>
        {person.social && <div className={styles.social}>{(["facebook", "instagram"] as const).map((network) => {
          const url = person.social?.[network];
          return url?.startsWith("https://") ? <a key={network} href={url} target="_blank" rel="noopener noreferrer">{network}</a> : null;
        })}</div>}
      </article>)}</div>
  </section>;

  const loveStorySection = story.enabled && story.items.length > 0 ?
    <section className={`${styles.section} ${styles.loveStorySection} ${variant("loveStory") === "editorial" ? styles.storyEditorial : ""}`}
      id="love-story" aria-labelledby="love-story-title" key="loveStory">
      <p className={styles.storyEyebrow}>Our love story</p>
      <h2 className={styles.sectionTitle} id="love-story-title">Chuyện tình của chúng mình</h2>
      {document.quote && <p className={styles.storyIntroduction}>{document.quote}</p>}
      <div className={styles.storyList}>{story.items.map((item, index) =>
        <article className={styles.storyItem} key={item.id}>
          <div className={styles.storyPhoto}>{item.image
            ? <img className={styles.storyImage} src={resolveMediaUrl(item.image) ?? item.image} alt={`Kỷ niệm: ${item.title}`} />
            : <div className={styles.storyImagePlaceholder} aria-hidden="true" />}</div>
          <span className={styles.storyMarker} aria-hidden="true">♥</span>
          <div className={styles.storyCopy}>
            <span className={styles.storyNumber}>Chương {String(index + 1).padStart(2, "0")}</span>
            <time className={styles.storyDate}>{item.date}</time>
            <h3>{item.title}</h3><p>{item.body}</p>
          </div>
        </article>)}</div>
    </section> : null;

  const eventSection = events.enabled && events.items.length > 0 ? <section className={styles.section} id="events" key="events">
    <h2 className={styles.sectionTitle}>Sự kiện cưới</h2>
    <div className={styles.eventList}>{events.items.map((item) =>
      <article className={styles.event} key={item.id}>
        <h3>{item.title}</h3><p>{displayDate(item.date)}</p><p>{item.venue}</p><p>{item.address}</p>
        {/^https:\/\//i.test(item.mapUrl) && <a href={item.mapUrl} target="_blank" rel="noopener noreferrer">Xem bản đồ</a>}
      </article>)}</div>
  </section> : null;

  const gallerySection = gallery.enabled && gallery.images.length > 0 ? <section className={styles.section} id="gallery" key="gallery">
    <h2 className={styles.sectionTitle}>Album hình cưới</h2>
    <div className={styles.gallery}>{gallery.images.slice(0, 12).map((src, index) =>
      <img src={resolveMediaUrl(src) ?? src} alt={`Ảnh cưới ${index + 1}`} key={`${src}-${index}`} />)}</div>
  </section> : null;

  const sectionContent: Record<string, ReactNode> = {
    couple: coupleSection,
    countdown: <Countdown date={weddingDate} banner={variant("countdown") === "banner"} />,
    loveStory: loveStorySection,
    events: eventSection,
    gallery: gallerySection,
    rsvp: <section className={styles.section} id="rsvp" key="rsvp"><h2 className={styles.sectionTitle}>Xác nhận tham dự</h2><StoryRsvp /></section>,
    wishes: wishes.enabled ? <section className={styles.section} id="wishes" key="wishes"><h2 className={styles.sectionTitle}>Lời chúc</h2><StoryWishes slug={slug} /></section> : null,
    gift: gift.enabled ? <section className={styles.section} id="gift" key="gift"><h2 className={styles.sectionTitle}>Mừng cưới</h2>
      <div className={styles.gift}><div><strong>Chú rể</strong><p>{gift.groomBank}</p><p>{gift.groomHolder}</p><p>{gift.groomAccount}</p></div>
        <div><strong>Cô dâu</strong><p>{gift.brideBank}</p><p>{gift.brideHolder}</p><p>{gift.brideAccount}</p></div></div>
    </section> : null,
  };

  const visible = (type: string) => sectionContent[type] !== null && sectionContent[type] !== undefined;
  const navSections = sections.filter((section) => ["couple", "loveStory", "events", "gallery"].includes(section.type) && visible(section.type));
  const navLabels: Record<string, string> = { couple: "Cặp đôi", loveStory: "Chuyện tình", events: "Sự kiện", gallery: "Album" };
  const navIds: Record<string, string> = { couple: "couple", loveStory: "love-story", events: "events", gallery: "gallery" };

  return <div className={`${styles.page} ${twoColumns ? styles.royal : styles.romantic} ${document.motion === "template" ? styles.motion : ""}`}
    style={{ "--story-accent": palette.accent, "--story-background": palette.background, "--story-text": palette.text,
      "--story-primary": palette.primary, "--story-heading-font": document.storyTemplate?.theme.fontHeading ?? document.fontHeading ?? "Georgia",
      "--story-body-font": document.storyTemplate?.theme.fontBody ?? document.fontBody ?? "Georgia" } as CSSProperties}>
    <nav className={styles.nav} aria-label="Điều hướng website cưới">{navSections.map((section) =>
      <a href={`#${navIds[section.type]}`} key={section.type}>{navLabels[section.type]}</a>)}</nav>
    <header className={`${styles.hero} ${!floral ? styles.heroDark : ""}`} style={{ "--cover": cover } as CSSProperties}>
      {floral && slides.length > 0 && <div className={styles.slides} aria-hidden="true">{slides.map((src, index) =>
        <img key={`${src}-${index}`} src={resolveMediaUrl(src) ?? src} alt="" style={{ animationDelay: `${index * 5}s`,
          animationDuration: `${slides.length * 5}s`, ...(slides.length === 1 ? { animation: "none", opacity: 1 } : {}) }} />)}</div>}
      <div className={styles.heroInner}><p className={styles.eyebrow}>Together forever</p>
        <h1>{couple.groom.name} <span aria-hidden="true">&</span> {couple.bride.name}</h1>
        <p className={styles.heroDate}>{displayDate(weddingDate) || "Ngày cưới của chúng mình"}</p></div>
    </header>
    <main>{sections.filter((section) => section.type !== "hero").map((section) =>
      <div key={section.type}>{sectionContent[section.type]}</div>)}</main>
    <footer className={styles.footer}>Thank you for celebrating with us</footer>
  </div>;
}
