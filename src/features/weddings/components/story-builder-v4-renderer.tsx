"use client";

/* eslint-disable @next/next/no-img-element -- Wedding media is served from the wedding-owned media API. */
import { createElement, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { StoryBuilderV4Document, StoryBuilderV4Section } from "../schemas/story-builder-v4.schema";
import { StoryRsvp } from "./story-rsvp";
import { StoryWishes } from "./story-wishes";

type InlineEdit = (sectionId: string, key: string, value: unknown) => void;
type Props = { document: StoryBuilderV4Document; slug?: string; pagePath?: string; showHidden?: boolean; editable?: boolean; selectedSectionId?: string; onInlineEdit?: InlineEdit; onSelectSection?: (sectionId: string) => void; onNavigatePage?: (pagePath: string) => void };
type Colors = { primary: string; background: string; accent: string; text: string };
const fallbackColors: Colors = { primary: "#e98ca3", background: "#fffaf8", accent: "#9d4d62", text: "#34242a" };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const array = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record) : [];

function templateColors(document: StoryBuilderV4Document): { colors: Colors; heading: string; body: string } {
  const snapshot = record(document.templateSnapshot);
  const theme = record(snapshot.theme);
  const palettes = Array.isArray(snapshot.palettes) ? snapshot.palettes.map(record) : [];
  const palette = palettes.find(item => item.id === document.appearance.paletteId);
  const colors = record(palette ? palette.colors : theme.colors);
  return {
    colors: {
      primary: text(colors.primary) || fallbackColors.primary,
      background: text(colors.background) || fallbackColors.background,
      accent: text(colors.accent) || fallbackColors.accent,
      text: text(colors.text) || fallbackColors.text,
    },
    heading: document.appearance.fontHeading || text(theme.fontHeading) || "Georgia",
    body: document.appearance.fontBody || text(theme.fontBody) || "Be Vietnam Pro",
  };
}

function dateLabel(value: string, locale = "vi-VN", timeZone?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: value.includes("T") ? "short" : undefined, timeZone }).format(date);
}

function Countdown({ target, variant }: { target: string; variant: string }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const targetMs = Date.parse(target);
  if (!Number.isFinite(targetMs)) return null;
  const days = Math.max(0, Math.ceil((targetMs - now) / 86_400_000));
  if (variant === "banner") return <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--site-rule)] bg-[var(--site-primary)]/25 px-5 py-5 sm:px-7"><span className="grid size-16 place-items-center rounded-full border border-[var(--site-rule)] bg-[var(--site-background)] font-serif text-3xl tabular-nums text-[var(--site-text)]" aria-label={`Còn ${days} ngày`}>{days}</span><span><strong className="block font-serif text-xl" style={{ fontFamily: "var(--site-heading)" }}>Ngày hẹn đang đến gần</strong><span className="mt-1 block text-sm opacity-75">Còn {days} ngày nữa</span></span></div>;
  if (variant === "inline") return <div className="mt-5 inline-flex items-baseline gap-3 border-y border-[var(--site-rule)] py-3"><strong className="font-serif text-5xl tabular-nums" style={{ color: "var(--site-accent)", fontFamily: "var(--site-heading)" }} aria-label={`Còn ${days} ngày`}>{days}</strong><span className="max-w-24 text-xs uppercase leading-5 tracking-[0.16em] opacity-70">ngày đến ngày vui</span></div>;
  return <div className="mt-6 inline-flex items-center gap-4 rounded-full border border-[var(--site-rule)] px-5 py-3"><strong className="font-serif text-4xl tabular-nums" style={{ color: "var(--site-accent)", fontFamily: "var(--site-heading)" }} aria-label={`Còn ${days} ngày`}>{days}</strong><span className="text-sm opacity-75">ngày nữa</span></div>;
}

function InlineText({ value, editable, onSave, className, tag = "p", style }: {
  value: string; editable: boolean; onSave?: (value: string) => void; className?: string; tag?: "h1" | "h2" | "h3" | "p"; style?: CSSProperties;
}) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(value);
  const cancelEdit = useRef(false);
  if (editing) return <input autoFocus aria-label="Chỉnh sửa nội dung trên website" className={`${className ?? ""} w-full rounded-md border border-primary bg-background/90 px-2 py-1 text-inherit outline-none focus-visible:ring-2 focus-visible:ring-primary`} style={style} value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => { if (cancelEdit.current) { cancelEdit.current = false; setDraft(value); } else onSave?.(draft); setEditing(false); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); cancelEdit.current = true; event.currentTarget.blur(); } }} />;
  return createElement(tag, {
    className: `${className ?? ""} ${editable ? "cursor-text rounded-sm outline-none hover:outline hover:outline-1 hover:outline-primary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" : ""}`,
    style,
    tabIndex: editable ? 0 : undefined,
    onDoubleClick: editable ? () => { setDraft(value); setEditing(true); } : undefined,
    onKeyDown: editable ? (event: React.KeyboardEvent<HTMLElement>) => { if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); setDraft(value); setEditing(true); } } : undefined,
    title: editable ? "Nhấp đúp hoặc nhấn Enter để sửa nhanh" : undefined,
    "aria-label": editable ? `${value || "Nội dung"}. Nhấp đúp hoặc nhấn Enter để chỉnh sửa` : undefined,
  }, value);
}

function SectionView({ section, slug, ctaTarget, ctaLabel, showHidden, gift, editable, selected, onInlineEdit, onSelectSection }: {
  section: StoryBuilderV4Section; slug?: string; ctaTarget?: string; ctaLabel?: string; showHidden: boolean; gift?: StoryBuilderV4Document["content"]["gift"];
  editable: boolean; selected: boolean; onInlineEdit?: InlineEdit; onSelectSection?: (id: string) => void;
}) {
  const content = record(section.content);
  const hidden = section.visible === false;
  const classes = `relative mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24 ${hidden ? "opacity-45" : ""}`;
  const title = text(content.title || section.title);
  const intro = text(content.intro || section.intro);
  if (hidden && !showHidden) return null;

  let body = null;
  switch (section.type) {
    case "hero": {
      const imageUrl = text(content.imageUrl);
      const copy = <div className="relative z-10 max-w-3xl">
        {text(content.eyebrow) && <p className="mb-5 text-xs uppercase tracking-[0.24em] opacity-75">{text(content.eyebrow)}</p>}
        <InlineText tag="h1" editable={editable} value={text(content.title) || "Ngày vui của chúng mình"} onSave={value => onInlineEdit?.(section.id, "title", value)} className="font-serif text-4xl leading-[1.06] sm:text-6xl" style={{ fontFamily: "var(--site-heading)" }} />
        {text(content.subtitle) && <InlineText tag="p" editable={editable} value={text(content.subtitle)} onSave={value => onInlineEdit?.(section.id, "subtitle", value)} className="mt-5 max-w-2xl text-base leading-7 opacity-80 sm:text-lg" />}
        {slug && ctaTarget && <a href={`#${ctaTarget}`} className="mt-8 inline-flex min-h-11 items-center rounded-full bg-[var(--site-text)] px-6 text-sm font-medium text-[var(--site-background)] transition hover:opacity-85">{ctaLabel ?? "Xem ngày vui"}</a>}
      </div>;
      const image = imageUrl ? <img src={imageUrl} alt="Ảnh bìa đám cưới" className="size-full object-cover" /> : <div aria-hidden="true" className="grid size-full min-h-64 place-items-center bg-[var(--site-primary)]/30"><span className="size-24 rounded-full border border-[var(--site-accent)]/40" /></div>;
      if (section.variant === "split") {
        body = <div className="grid min-h-[480px] overflow-hidden rounded-[28px] border border-[var(--site-rule)] bg-[var(--site-background)] md:min-h-[560px] md:grid-cols-[1.08fr_0.92fr]">
          <div className="min-h-64 overflow-hidden bg-[var(--site-primary)]/20 md:min-h-full">{image}</div>
          <div className="flex items-center px-7 py-12 sm:px-12 md:px-10 lg:px-14">{copy}</div>
        </div>;
      } else if (section.variant === "editorial") {
        body = <div className="relative grid min-h-[480px] items-end overflow-hidden border-y border-[var(--site-rule)] bg-[var(--site-background)] px-6 py-10 sm:min-h-[560px] sm:px-12 sm:py-14 md:grid-cols-[1fr_0.65fr] md:items-center">
          <div className="relative z-10 max-w-3xl py-8 md:py-12">{copy}</div>
          <div className="relative mt-8 h-64 overflow-hidden bg-[var(--site-primary)]/20 sm:h-80 md:mt-0 md:h-[440px]">{image}</div>
          <span aria-hidden="true" className="absolute left-6 top-4 text-7xl font-serif leading-none text-[var(--site-primary)] sm:left-12 sm:top-8 sm:text-9xl">“</span>
        </div>;
      } else if (section.variant === "dark") {
        body = <div className="relative isolate flex min-h-[500px] items-center justify-center overflow-hidden rounded-[28px] bg-[#261b20] px-7 py-16 text-center text-white sm:min-h-[620px] sm:px-16">
          {imageUrl && <div className="absolute inset-0 -z-20">{image}</div>}
          {imageUrl && <div className="absolute inset-0 -z-10 bg-[#1c1115]/65" />}
          <div className="max-w-3xl">{copy}</div>
        </div>;
      } else if (section.variant === "ceremonial") {
        body = <div className="relative mx-auto flex min-h-[480px] max-w-6xl items-center justify-center bg-[var(--site-primary)]/15 px-5 py-8 text-center sm:min-h-[580px] sm:px-10">
          <div className="relative grid min-h-[420px] w-full place-items-center border border-[var(--site-accent)]/45 px-6 py-16 sm:min-h-[500px] sm:px-14">
            <div aria-hidden="true" className="absolute inset-2 border border-[var(--site-accent)]/20" />
            {imageUrl && <div className="absolute inset-2 overflow-hidden opacity-15">{image}<div className="absolute inset-0 bg-[var(--site-background)]/50" /></div>}
            <div className="relative z-10 max-w-3xl">{copy}</div>
            <span aria-hidden="true" className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--site-background)] px-4 text-lg text-[var(--site-accent)]">✦</span>
          </div>
        </div>;
      } else {
        body = <div className="relative flex min-h-[460px] items-center justify-center overflow-hidden rounded-[48%_48%_24px_24px] bg-[var(--site-primary)]/20 px-7 py-16 text-center sm:min-h-[590px] sm:px-16">
          {imageUrl && <div className="absolute inset-0 opacity-30">{image}</div>}
          <div className="absolute inset-4 rounded-[48%_48%_20px_20px] border border-[var(--site-accent)]/35" />
          <div className="relative z-10 mx-auto max-w-3xl">{copy}</div>
        </div>;
      }
      break;
    }
    case "couple": {
      const groom = record(content.groom); const bride = record(content.bride);
      const couple = ([{ key: "groom", person: groom }, { key: "bride", person: bride }] as const).filter(({ person }) => text(person.displayName || person.fullName));
      body = <div className={`relative grid gap-7 ${section.variant === "editorial" ? "md:grid-cols-[0.82fr_1.18fr] md:gap-12" : "sm:grid-cols-2 sm:gap-10"}`}>
        {couple.map(({ key, person }, index) => <article key={key} className={`flex flex-col ${section.variant === "alternating" && index === 1 ? "sm:mt-16" : ""} ${section.variant === "two-columns" ? "items-center rounded-2xl bg-[var(--site-primary)]/15 px-5 pb-6 text-center sm:px-7" : section.variant === "editorial" ? "grid grid-cols-1 items-center gap-5 sm:grid-cols-[0.8fr_1fr]" : ""}`}>
          {text(person.photoUrl) && <img className={`w-full object-cover ${section.variant === "two-columns" ? "-mt-2 aspect-[4/5] rounded-xl sm:mt-0 sm:aspect-[5/4]" : section.variant === "editorial" ? "aspect-[4/5]" : "aspect-[4/5] rounded-[22px]"}`} src={text(person.photoUrl)} alt={text(person.displayName || person.fullName)} />}
          <div className={section.variant === "two-columns" ? "pt-5" : ""}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--site-accent)]">{key === "groom" ? "Chú rể" : "Cô dâu"}</p>
            <InlineText tag="h3" editable={editable} value={text(person.displayName || person.fullName)} onSave={value => onInlineEdit?.(section.id, key, { ...person, displayName: value })} className="mt-2 font-serif text-3xl sm:text-4xl" style={{ fontFamily: "var(--site-heading)" }} />
            {text(person.bio) && <p className="mt-3 max-w-prose whitespace-pre-line leading-7 opacity-80">{text(person.bio)}</p>}
          </div>
        </article>)}
        {section.variant === "two-columns" && <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 font-serif text-3xl text-[var(--site-accent)] sm:block">&</span>}
        {!couple.length && <p className="text-sm opacity-65">Thêm tên và thông tin hai bạn trong phần chỉnh sửa.</p>}
      </div>;
      break;
    }
    case "countdown":
      body = content.targetDate ? <Countdown target={text(content.targetDate)} variant={section.variant} /> : <p className="mt-4 text-sm opacity-65">Chưa có ngày tổ chức.</p>;
      break;
    case "loveStory":
      body = <ol className={`relative grid gap-5 ${section.variant === "editorial" ? "md:grid-cols-2 md:gap-8" : "pl-6 sm:pl-9"}`}>
        {section.variant === "timeline" && <span aria-hidden="true" className="absolute bottom-4 left-[7px] top-2 w-px bg-[var(--site-accent)]/35 sm:left-[11px]" />}
        {array(content.items).map((item, index) => <li key={text(item.id) || index} className={section.variant === "editorial" ? "overflow-hidden border-t border-[var(--site-rule)] pt-5" : "relative grid gap-4 border-t border-[var(--site-rule)] py-5 sm:grid-cols-[120px_1fr]"}>
          {section.variant === "timeline" && <span aria-hidden="true" className="absolute -left-[25px] top-7 size-3 rounded-full border-2 border-[var(--site-background)] bg-[var(--site-accent)] sm:-left-[35px]" />}
          {text(item.imageUrl) && <img src={text(item.imageUrl)} alt={text(item.title)} className={`w-full object-cover ${section.variant === "editorial" ? "mb-5 aspect-[4/3]" : "aspect-square max-h-56 rounded-xl sm:max-h-none"}`} />}
          <div className={section.variant === "editorial" ? "pb-4" : ""}><p className="text-xs uppercase tracking-[0.16em] text-[var(--site-accent)]">{text(item.date) || String(index + 1).padStart(2, "0")}</p><InlineText tag="h3" editable={editable} value={text(item.title)} onSave={value => onInlineEdit?.(section.id, "items", array(content.items).map((entry, itemIndex) => itemIndex === index ? { ...entry, title: value } : entry))} className={`mt-2 font-serif ${section.variant === "editorial" ? "text-3xl sm:text-4xl" : "text-2xl"}`} style={{ fontFamily: "var(--site-heading)" }} /><InlineText tag="p" editable={editable} value={text(item.body)} onSave={value => onInlineEdit?.(section.id, "items", array(content.items).map((entry, itemIndex) => itemIndex === index ? { ...entry, body: value } : entry))} className="mt-3 whitespace-pre-line leading-7 opacity-80" /></div>
        </li>)}
        {!array(content.items).length && <li className="text-sm opacity-65">Thêm những dấu mốc hai bạn muốn chia sẻ.</li>}
      </ol>;
      break;
    case "events":
      body = <div className={`grid gap-5 ${section.variant === "minimal" ? "" : "sm:grid-cols-2"}`}>
        {array(content.events).map((event, index) => <article key={text(event.id) || index} className={section.variant === "minimal" ? "border-t border-[var(--site-rule)] py-5" : "rounded-2xl border border-[var(--site-rule)] bg-[var(--site-background)]/80 p-5 sm:p-6"}>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--site-accent)]">{dateLabel(text(event.startsAt), "vi-VN", text(event.timeZoneId) || undefined)}</p>
          <InlineText tag="h3" editable={editable} value={text(event.title)} onSave={value => onInlineEdit?.(section.id, "events", array(content.events).map((entry, eventIndex) => eventIndex === index ? { ...entry, title: value } : entry))} className="mt-2 font-serif text-2xl" style={{ fontFamily: "var(--site-heading)" }} />
          {text(event.venueName) && <p className="mt-2 font-medium">{text(event.venueName)}</p>}
          {text(event.address) && <p className="mt-1 opacity-75">{text(event.address)}</p>}
          {text(event.mapUrl).startsWith("https://") && <a className="mt-3 inline-block text-sm text-[var(--site-accent)] underline" href={text(event.mapUrl)} target="_blank" rel="noreferrer">Mở bản đồ</a>}
        </article>)}
        {!array(content.events).length && <p className="text-sm opacity-65">Chưa có thông tin sự kiện.</p>}
      </div>;
      break;
    case "gallery":
      body = <div className={section.variant === "masonry" ? "columns-2 gap-3 sm:columns-3 sm:gap-4" : "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"}>
        {array(content.images).map((image, index) => <img key={text(image.id) || index} src={text(image.imageUrl)} alt={text(image.alt) || `Ảnh cưới ${index + 1}`} className={`w-full object-cover ${section.variant === "masonry" ? `mb-3 break-inside-avoid sm:mb-4 ${index % 3 === 1 ? "aspect-[4/5]" : "aspect-square"}` : `rounded-xl ${index % 4 === 0 ? "aspect-[4/5]" : "aspect-square"}`}`} />)}
        {!array(content.images).length && <p className="col-span-full text-sm opacity-65">Thêm ảnh để tạo album cưới.</p>}
      </div>;
      break;
    case "rsvp":
      body = <StoryRsvp label={text(content.submitLabel) || undefined} />;
      break;
    case "wishes":
      body = <StoryWishes slug={slug} />;
      break;
    case "gift": {
      const giftData = record(gift);
      body = <div className="grid gap-4 sm:grid-cols-2">
        {(["Chú rể", "Cô dâu"] as const).map((label, index) => {
          const prefix = index === 0 ? "groom" : "bride";
          return <article className={section.variant === "minimal" ? "border-t border-[var(--site-rule)] py-5" : "rounded-2xl border border-[var(--site-rule)] bg-[var(--site-primary)]/15 p-5 sm:p-6"} key={label}><h3 className="font-serif text-2xl" style={{ fontFamily: "var(--site-heading)" }}>{label}</h3>
            {text(giftData[`${prefix}Bank`]) && <p className="mt-3">{text(giftData[`${prefix}Bank`])}</p>}
            {text(giftData[`${prefix}Holder`]) && <p className="mt-1">{text(giftData[`${prefix}Holder`])}</p>}
            {text(giftData[`${prefix}Account`]) && <p className="mt-2 break-all border-t border-[var(--site-rule)] pt-2 font-mono text-sm">{text(giftData[`${prefix}Account`])}</p>}
          </article>;
        })}
        {!giftData.enabled && <p className="col-span-full text-sm opacity-65">Thông tin mừng cưới chưa được bật.</p>}
      </div>;
      break;
    }
  }
  const spacing = section.style?.spacing === "compact" ? "py-10 sm:py-14" : section.style?.spacing === "spacious" ? "py-24 sm:py-32" : "";
  const surface = section.style?.background === "soft" ? "bg-[var(--site-primary)]/10" : section.style?.background === "accent" ? "bg-[var(--site-accent)]/5" : "";
  const sectionHeaderClass = section.variant === "editorial" ? "mx-auto mb-10 max-w-3xl text-center" : "mb-8 max-w-2xl";
  return <section id={section.id} tabIndex={editable ? 0 : undefined} aria-label={editable ? `${title || section.type}, chọn để chỉnh sửa` : undefined} onClick={editable ? event => { if (event.target instanceof Element && event.target.closest("a, button, input, textarea, select, [contenteditable='true']")) return; onSelectSection?.(section.id); } : undefined} onKeyDown={editable ? event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectSection?.(section.id); } } : undefined} className={`${classes} ${spacing} ${surface} ${section.style?.animation === "fade" ? "story-section--fade" : ""} ${editable ? "cursor-pointer outline-offset-[-1px] hover:outline hover:outline-1 hover:outline-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" : ""} ${editable && selected ? "outline outline-2 outline-primary" : ""}`}>
    {hidden && <span className="absolute right-5 top-4 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Đang ẩn</span>}
    {section.type !== "hero" && <header className={sectionHeaderClass}>
      {title && <InlineText tag="h2" editable={editable} value={title} onSave={value => onInlineEdit?.(section.id, "title", value)} className="font-serif text-3xl sm:text-4xl" style={{ fontFamily: "var(--site-heading)" }} />}
      {intro && <InlineText tag="p" editable={editable} value={intro} onSave={value => onInlineEdit?.(section.id, "intro", value)} className="mt-3 leading-7 opacity-75" />}
    </header>}
    {body}
  </section>;
}

export function StoryBuilderV4Renderer({ document, slug, pagePath, showHidden = false, editable = false, selectedSectionId, onInlineEdit, onSelectSection, onNavigatePage }: Props) {
  const page = useMemo(() => pagePath === undefined ? document.pages.find(item => item.isHome) : document.pages.find(item => item.slug === pagePath), [document.pages, pagePath]);
  const { colors, heading, body } = templateColors(document);
  if (!page) return <main className="mx-auto max-w-xl px-6 py-24 text-center"><h1 className="font-serif text-3xl">Không tìm thấy trang</h1><p className="mt-3 opacity-70">Trang này có thể chưa được xuất bản.</p></main>;
  const eventsTarget = page.sections.find(section => section.type === "events" && section.visible !== false)?.id;
  const rsvpTarget = page.sections.find(section => section.type === "rsvp" && section.visible !== false)?.id;
  const ctaTarget = eventsTarget ?? rsvpTarget;
  const ctaLabel = eventsTarget ? "Xem ngày vui" : "Xác nhận tham dự";
  const style = {
    "--site-primary": colors.primary, "--site-background": colors.background, "--site-accent": colors.accent,
    "--site-text": colors.text, "--site-rule": `${colors.text}26`, "--site-heading": heading, "--site-body": body,
    background: "var(--site-background)", color: "var(--site-text)", fontFamily: "var(--site-body)",
  } as CSSProperties;
  const visiblePages = document.pages.filter(item => item.visible !== false);
  return <div style={style} className="template-canvas min-h-full">
    {visiblePages.length > 1 && <nav aria-label="Các trang website cưới" className="sticky top-0 z-10 flex justify-center gap-4 border-b border-[var(--site-rule)] bg-[var(--site-background)]/95 px-4 py-3 backdrop-blur sm:gap-8">
      {visiblePages.map(item => {
        const href = item.isHome ? `/wedding/${encodeURIComponent(slug ?? "")}` : `/wedding/${encodeURIComponent(slug ?? "")}/${item.slug}`;
        const className = item.id === page.id ? "border-b-2 border-[var(--site-accent)] pb-1 text-[var(--site-accent)]" : "pb-1 opacity-70 hover:opacity-100";
        if (onNavigatePage) return <button key={item.id} type="button" className={className} aria-current={item.id === page.id ? "page" : undefined} onClick={() => onNavigatePage(item.slug)}>{item.navigationLabel || item.title}</button>;
        return slug ? <Link key={item.id} href={href} className={className} aria-current={item.id === page.id ? "page" : undefined}>{item.navigationLabel || item.title}</Link>
          : <span key={item.id} className="pb-1 opacity-75" aria-current={item.id === page.id ? "page" : undefined}>{item.navigationLabel || item.title}</span>;
      })}
    </nav>}
    <main>
      {page.sections.map(section => <SectionView key={section.id} section={section} slug={slug} ctaTarget={ctaTarget} ctaLabel={ctaLabel} showHidden={showHidden} gift={document.content.gift} editable={editable} selected={selectedSectionId === section.id} onInlineEdit={onInlineEdit} onSelectSection={onSelectSection} />)}
    </main>
    <footer className="border-t border-[var(--site-rule)] px-5 py-9 text-center text-xs tracking-wide opacity-65">Được tạo cùng InviteMe</footer>
  </div>;
}
