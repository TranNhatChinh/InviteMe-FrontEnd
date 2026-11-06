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
  return <div className={`mt-4 ${variant === "banner" ? "rounded-2xl bg-[var(--site-primary)]/15 px-6 py-5" : variant === "inline" ? "inline-flex items-baseline gap-2 border-b border-[var(--site-rule)] pb-2" : ""}`}><strong className="font-serif text-4xl tabular-nums text-[var(--site-accent)]" aria-label={`Còn ${days} ngày`}>{days}</strong><span className="ml-2 text-sm opacity-75">ngày nữa</span></div>;
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

function SectionView({ section, slug, showHidden, gift, editable, selected, onInlineEdit, onSelectSection }: {
  section: StoryBuilderV4Section; slug?: string; showHidden: boolean; gift?: StoryBuilderV4Document["content"]["gift"];
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
      body = <div className={`relative isolate flex min-h-[440px] items-center overflow-hidden rounded-[28px] px-7 py-16 sm:min-h-[590px] sm:px-16 ${section.variant === "split" || section.variant === "editorial" ? "text-left" : "text-center"} ${section.variant === "dark" || section.variant === "ceremonial" ? "bg-[#281c21] text-white" : "bg-[#f8e8eb] text-[var(--site-text)]"}`}>
        {imageUrl && <img src={imageUrl} alt="Ảnh bìa đám cưới" className="absolute inset-0 -z-20 size-full object-cover" />}
        {imageUrl && <div className="absolute inset-0 -z-10 bg-black/25" />}
        <div className={`max-w-3xl ${section.variant === "split" || section.variant === "editorial" ? "mr-auto" : "mx-auto"}`}>
          {text(content.eyebrow) && <p className="mb-5 text-xs uppercase tracking-[0.28em] opacity-75">{text(content.eyebrow)}</p>}
          <InlineText tag="h1" editable={editable} value={text(content.title) || "Ngày vui của chúng mình"} onSave={value => onInlineEdit?.(section.id, "title", value)} className="font-serif text-4xl leading-tight sm:text-6xl" style={{ fontFamily: "var(--site-heading)" }} />
          {text(content.subtitle) && <InlineText tag="p" editable={editable} value={text(content.subtitle)} onSave={value => onInlineEdit?.(section.id, "subtitle", value)} className={`mt-5 max-w-2xl text-base leading-7 opacity-85 sm:text-xl ${section.variant === "split" || section.variant === "editorial" ? "" : "mx-auto"}`} />}
          {slug && <a href="#events" className="mt-8 inline-flex min-h-11 items-center rounded-full bg-[var(--site-accent)] px-6 text-sm font-medium text-white">Xem ngày vui</a>}
        </div>
      </div>;
      break;
    }
    case "couple": {
      const groom = record(content.groom); const bride = record(content.bride);
      const couple = ([{ key: "groom", person: groom }, { key: "bride", person: bride }] as const).filter(({ person }) => text(person.displayName || person.fullName));
      body = <div className="grid gap-10 sm:grid-cols-2">
        {couple.map(({ key, person }, index) => <article key={key} className={`flex flex-col ${section.variant === "alternating" && index === 1 ? "sm:mt-16" : ""}`}>
          {text(person.photoUrl) && <img className="aspect-[4/5] w-full rounded-[22px] object-cover" src={text(person.photoUrl)} alt={text(person.displayName || person.fullName)} />}
          <InlineText tag="h3" editable={editable} value={text(person.displayName || person.fullName)} onSave={value => onInlineEdit?.(section.id, key, { ...person, displayName: value })} className="mt-5 font-serif text-3xl" style={{ fontFamily: "var(--site-heading)" }} />
          {text(person.bio) && <p className="mt-3 max-w-prose whitespace-pre-line leading-7 opacity-80">{text(person.bio)}</p>}
        </article>)}
        {!couple.length && <p className="text-sm opacity-65">Thêm tên và thông tin hai bạn trong phần chỉnh sửa.</p>}
      </div>;
      break;
    }
    case "countdown":
      body = content.targetDate ? <Countdown target={text(content.targetDate)} variant={section.variant} /> : <p className="mt-4 text-sm opacity-65">Chưa có ngày tổ chức.</p>;
      break;
    case "loveStory":
      body = <ol className={`grid gap-6 ${section.variant === "editorial" ? "md:grid-cols-2" : ""}`}>
        {array(content.items).map((item, index) => <li key={text(item.id) || index} className="grid gap-5 border-t border-[var(--site-rule)] pt-5 sm:grid-cols-[150px_1fr]">
          {text(item.imageUrl) && <img src={text(item.imageUrl)} alt={text(item.title)} className="aspect-square w-full rounded-2xl object-cover" />}
          <div><p className="text-xs uppercase tracking-[0.16em] opacity-60">{text(item.date)}</p><InlineText tag="h3" editable={editable} value={text(item.title)} onSave={value => onInlineEdit?.(section.id, "items", array(content.items).map((entry, itemIndex) => itemIndex === index ? { ...entry, title: value } : entry))} className="mt-2 font-serif text-2xl" style={{ fontFamily: "var(--site-heading)" }} /><InlineText tag="p" editable={editable} value={text(item.body)} onSave={value => onInlineEdit?.(section.id, "items", array(content.items).map((entry, itemIndex) => itemIndex === index ? { ...entry, body: value } : entry))} className="mt-3 whitespace-pre-line leading-7 opacity-80" /></div>
        </li>)}
        {!array(content.items).length && <li className="text-sm opacity-65">Thêm những dấu mốc hai bạn muốn chia sẻ.</li>}
      </ol>;
      break;
    case "events":
      body = <div className={`grid gap-5 ${section.variant === "minimal" ? "" : "sm:grid-cols-2"}`}>
        {array(content.events).map((event, index) => <article key={text(event.id) || index} className={section.variant === "minimal" ? "border-t border-[var(--site-rule)] py-5" : "rounded-2xl border border-[var(--site-rule)] bg-white/70 p-5 sm:p-6"}>
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
      body = <div className={`grid gap-3 ${section.variant === "masonry" ? "sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
        {array(content.images).map((image, index) => <img key={text(image.id) || index} src={text(image.imageUrl)} alt={text(image.alt) || `Ảnh cưới ${index + 1}`} className={`w-full rounded-2xl object-cover ${section.variant === "masonry" && index % 3 === 0 ? "aspect-[3/4]" : "aspect-square"}`} />)}
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
      body = <div className="grid gap-5 sm:grid-cols-2">
        {(["Chú rể", "Cô dâu"] as const).map((label, index) => {
          const prefix = index === 0 ? "groom" : "bride";
          return <article className="border-t border-[var(--site-rule)] py-5" key={label}><h3 className="font-serif text-2xl">{label}</h3>
            {text(giftData[`${prefix}Bank`]) && <p className="mt-3">{text(giftData[`${prefix}Bank`])}</p>}
            {text(giftData[`${prefix}Holder`]) && <p className="mt-1">{text(giftData[`${prefix}Holder`])}</p>}
            {text(giftData[`${prefix}Account`]) && <p className="mt-1 font-mono text-sm">{text(giftData[`${prefix}Account`])}</p>}
          </article>;
        })}
        {!giftData.enabled && <p className="col-span-full text-sm opacity-65">Thông tin mừng cưới chưa được bật.</p>}
      </div>;
      break;
    }
  }
  const spacing = section.style?.spacing === "compact" ? "py-10 sm:py-14" : section.style?.spacing === "spacious" ? "py-24 sm:py-32" : "";
  const surface = section.style?.background === "soft" ? "bg-[var(--site-primary)]/10" : section.style?.background === "accent" ? "bg-[var(--site-accent)]/5" : "";
  return <section id={section.id} tabIndex={editable ? 0 : undefined} aria-label={editable ? `${title || section.type}, chọn để chỉnh sửa` : undefined} onClick={editable ? event => { if (event.target instanceof Element && event.target.closest("a, button, input, textarea, select, [contenteditable='true']")) return; onSelectSection?.(section.id); } : undefined} onKeyDown={editable ? event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectSection?.(section.id); } } : undefined} className={`${classes} ${spacing} ${surface} ${editable ? "cursor-pointer outline-offset-[-1px] hover:outline hover:outline-1 hover:outline-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" : ""} ${editable && selected ? "outline outline-2 outline-primary" : ""}`}>
    {hidden && <span className="absolute right-5 top-4 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Đang ẩn</span>}
    {section.type !== "hero" && <header className="mb-8 max-w-2xl">
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
  const style = {
    "--site-primary": colors.primary, "--site-background": colors.background, "--site-accent": colors.accent,
    "--site-text": colors.text, "--site-rule": `${colors.text}26`, "--site-heading": heading, "--site-body": body,
    background: "var(--site-background)", color: "var(--site-text)", fontFamily: "var(--site-body)",
  } as CSSProperties;
  const visiblePages = document.pages.filter(item => item.visible !== false);
  return <div style={style} className="min-h-full">
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
      {page.sections.map(section => <SectionView key={section.id} section={section} slug={slug} showHidden={showHidden} gift={document.content.gift} editable={editable} selected={selectedSectionId === section.id} onInlineEdit={onInlineEdit} onSelectSection={onSelectSection} />)}
    </main>
    <footer className="border-t border-[var(--site-rule)] px-5 py-9 text-center text-xs tracking-wide opacity-65">Được tạo cùng InviteMe</footer>
  </div>;
}
