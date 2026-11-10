"use client";

/* eslint-disable @next/next/no-img-element -- Wedding media is served from the wedding-owned media API. */
import { createElement, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowUp, CalendarDays, Gift, Heart, MessageCircle, Share2 } from "lucide-react";
import type { StoryBuilderV4Document, StoryBuilderV4Section } from "../schemas/story-builder-v4.schema";
import { StoryRsvp } from "./story-rsvp";
import { StoryWishes } from "./story-wishes";
import { StoryGalleryLightbox } from "./story-gallery-lightbox";

type InlineEdit = (sectionId: string, key: string, value: unknown) => void;
type Props = { document: StoryBuilderV4Document; slug?: string; pagePath?: string; showHidden?: boolean; editable?: boolean; showGuestExperiencePreview?: boolean; selectedSectionId?: string; onInlineEdit?: InlineEdit; onSelectSection?: (sectionId: string) => void; onNavigatePage?: (pagePath: string) => void };
type Colors = { primary: string; background: string; accent: string; text: string };
type GuestTool = "rsvp" | "calendar" | "gift" | "wishes" | "share";
type GuestDecoration = "none" | "petals" | "sparkles" | "hearts" | "fireflies";
type GuestIntensity = "light" | "medium" | "vivid";
type GuestExperienceSettings = { tools: GuestTool[]; decoration: GuestDecoration; intensity: GuestIntensity };
const fallbackColors: Colors = { primary: "#e98ca3", background: "#fffaf8", accent: "#9d4d62", text: "#34242a" };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const array = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record) : [];
const builderFieldPath = (...parts: (string | number)[]) => parts.map(part => String(part).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")).filter(Boolean).join(".").slice(0, 160);

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

function templateFamily(document: StoryBuilderV4Document) {
  const category = text(record(document.templateSnapshot).category).trim().toLowerCase();
  return /^[a-z0-9-]{1,80}$/.test(category) ? category : "classic";
}

function defaultRevealEffect(family: string, sectionType: string): "fade" | "rise" | "stagger" | "zoom" {
  if (sectionType === "hero" && ["garden", "outdoor", "royal"].includes(family)) return "zoom";
  if (["garden", "outdoor", "autumn"].includes(family) && ["gallery", "events", "weddingParty", "loveStory"].includes(sectionType)) return "stagger";
  if (["editorial", "minimal"].includes(family)) return "fade";
  if (["traditional", "royal"].includes(family)) return sectionType === "gallery" ? "stagger" : "rise";
  return "rise";
}

function dateLabel(value: string, locale = "vi-VN", timeZone?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: value.includes("T") ? "short" : undefined, timeZone }).format(date);
}

function calendarLinks(event: Record<string, unknown>) {
  const start = Date.parse(text(event.startsAt));
  if (!Number.isFinite(start)) return null;
  const endValue = Date.parse(text(event.endsAt));
  const end = Number.isFinite(endValue) && endValue > start ? endValue : start + 60 * 60 * 1000;
  const stamp = (value: number) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const title = text(event.title) || "Ngày vui";
  const location = [text(event.venueName), text(event.address)].filter(Boolean).join(", ");
  const details = text(event.description);
  const google = new URL("https://calendar.google.com/calendar/render");
  google.searchParams.set("action", "TEMPLATE");
  google.searchParams.set("text", title);
  google.searchParams.set("dates", `${stamp(start)}/${stamp(end)}`);
  if (location) google.searchParams.set("location", location);
  if (details) google.searchParams.set("details", details);
  const escapeIcs = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InviteMe//Wedding Event//VI", "BEGIN:VEVENT",
    `UID:${encodeURIComponent(text(event.id) || `${start}`)}@inviteme.asia`, `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escapeIcs(title)}`,
    ...(location ? [`LOCATION:${escapeIcs(location)}`] : []), ...(details ? [`DESCRIPTION:${escapeIcs(details)}`] : []),
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return { google: google.toString(), ics: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}` };
}

function GuestDecoration({ effect, intensity, fixed }: { effect: GuestDecoration; intensity: GuestIntensity; fixed: boolean }) {
  if (effect === "none") return null;
  const count = effect === "petals"
    ? (intensity === "vivid" ? 30 : intensity === "medium" ? 20 : 13)
    : (intensity === "vivid" ? 26 : intensity === "medium" ? 18 : 11);
  return <div className={`inviteme-guest-decoration ${fixed ? "inviteme-guest-decoration--fixed" : ""}`} data-effect={effect} data-intensity={intensity} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => {
      const style = {
        "--particle-x": `${(index * 37 + 11) % 100}%`,
        "--particle-y": `${(index * 29 + 7) % 88}%`,
        "--particle-delay": `${-((index * 1.13) % 8)}s`,
        "--particle-duration": `${13 + (index % 7) * 1.8}s`,
        "--particle-drift": `${((index * 19) % 120) - 60}px`,
        "--particle-scale": `${0.7 + (index % 4) * 0.16}`,
      } as CSSProperties;
      return <span key={index} className="inviteme-guest-decoration__particle" style={style} />;
    })}
  </div>;
}

const guestToolLabels: Record<GuestTool, { label: string; short: string; Icon: typeof Heart }> = {
  rsvp: { label: "Xác nhận tham dự", short: "Xác nhận", Icon: Heart },
  calendar: { label: "Thêm vào lịch", short: "Lịch", Icon: CalendarDays },
  gift: { label: "Quà mừng", short: "Quà mừng", Icon: Gift },
  wishes: { label: "Gửi lời chúc", short: "Lời chúc", Icon: MessageCircle },
  share: { label: "Chia sẻ website", short: "Chia sẻ", Icon: Share2 },
};

function GuestUtilityBar({
  tools, targets, events, slug, onNavigatePage,
}: {
  tools: GuestTool[];
  targets: Partial<Record<Exclude<GuestTool, "calendar" | "share">, { sectionId: string; pageSlug: string }>>;
  events: Record<string, unknown>[];
  slug?: string;
  onNavigatePage?: (pagePath: string) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const event = events.find(item => Boolean(calendarLinks(item)));
  const calendar = event ? calendarLinks(event) : null;
  const visibleTools = tools.filter(tool => tool === "share" ? true : tool === "calendar" ? Boolean(calendar) : Boolean(targets[tool]));
  const [shareStatus, setShareStatus] = useState("");
  if (!visibleTools.length) return null;

  function goToSection(tool: Exclude<GuestTool, "calendar" | "share">) {
    const target = targets[tool];
    if (!target) return;
    if (slug) {
      const path = target.pageSlug
        ? `/wedding/${encodeURIComponent(slug)}/${target.pageSlug}`
        : `/wedding/${encodeURIComponent(slug)}`;
      const url = new URL(path, window.location.origin);
      if (tool === "rsvp") {
        const inviteToken = new URLSearchParams(window.location.search).get("inviteToken");
        if (inviteToken) url.searchParams.set("inviteToken", inviteToken);
      }
      url.hash = target.sectionId;
      window.location.assign(url.toString());
      return;
    }
    if (target.pageSlug && onNavigatePage) {
      onNavigatePage(target.pageSlug);
      window.setTimeout(() => document.getElementById(target.sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      return;
    }
    document.getElementById(target.sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function shareWebsite() {
    if (!slug) {
      setShareStatus("Chia sẻ liên kết công khai sau khi xuất bản website.");
      window.setTimeout(() => setShareStatus(""), 2500);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("inviteToken");
    try {
      if (navigator.share) await navigator.share({ title: document.title || "Website cưới", url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); setShareStatus("Đã sao chép liên kết website."); }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try { await navigator.clipboard.writeText(url.toString()); setShareStatus("Đã sao chép liên kết website."); }
      catch { setShareStatus("Không thể chia sẻ liên kết trên thiết bị này."); }
    }
    window.setTimeout(() => setShareStatus(""), 2500);
  }

  return <nav aria-label="Tiện ích cho khách mời" style={{ gridTemplateColumns: `repeat(${visibleTools.length}, minmax(0, 1fr))` }} className="inviteme-guest-tools fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 grid gap-1 rounded-2xl border border-[var(--site-rule)] bg-[var(--site-background)]/95 p-1.5 shadow-[0_12px_36px_rgba(52,36,42,0.16)] backdrop-blur sm:inset-x-auto sm:bottom-6 sm:right-5 sm:flex sm:flex-col sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
    {visibleTools.map(tool => {
      const { label, short, Icon } = guestToolLabels[tool];
      const buttonClass = "flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium text-[var(--site-text)] transition hover:bg-[var(--site-primary)]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)] sm:min-h-11 sm:flex-row sm:justify-start sm:gap-2 sm:rounded-full sm:border sm:border-[var(--site-rule)] sm:bg-[var(--site-background)] sm:px-4 sm:text-xs sm:shadow-md";
      if (tool === "calendar") return <div key={tool} className="relative">
        <button type="button" className={`${buttonClass} w-full`} aria-label={label} aria-expanded={calendarOpen} onClick={() => setCalendarOpen(open => !open)}><Icon className="size-4 shrink-0" /><span>{short}</span></button>
        {calendarOpen && calendar && <div className="absolute bottom-full right-0 mb-2 grid min-w-48 gap-1 rounded-xl border border-[var(--site-rule)] bg-[var(--site-background)] p-2 text-[var(--site-text)] shadow-xl sm:right-full sm:bottom-0 sm:mr-2 sm:mb-0">
          <a className="rounded-lg px-3 py-2 text-sm hover:bg-[var(--site-primary)]/20" href={calendar.google} target="_blank" rel="noopener noreferrer">Mở Google Calendar</a>
          <a className="rounded-lg px-3 py-2 text-sm hover:bg-[var(--site-primary)]/20" href={calendar.ics} download="ngay-cuoi.ics">Tải tệp lịch (.ics)</a>
        </div>}
      </div>;
      if (tool === "share") return <button key={tool} type="button" className={buttonClass} aria-label={label} onClick={() => void shareWebsite()}><Icon className="size-4 shrink-0" /><span>{short}</span></button>;
      return <button key={tool} type="button" className={buttonClass} aria-label={label} onClick={() => goToSection(tool)}><Icon className="size-4 shrink-0" /><span>{short}</span></button>;
    })}
    {shareStatus && <span role="status" aria-live="polite" className="absolute bottom-full right-0 mb-2 rounded-lg bg-[var(--site-text)] px-3 py-2 text-xs text-[var(--site-background)] shadow-lg">{shareStatus}</span>}
  </nav>;
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

function InlineText({ value, editable, onSave, className, tag = "p", style, presencePath }: {
  value: string; editable: boolean; onSave?: (value: string) => void; className?: string; tag?: "h1" | "h2" | "h3" | "p"; style?: CSSProperties; presencePath?: string;
}) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(value);
  const cancelEdit = useRef(false);
  if (editing) return <input autoFocus aria-label="Chỉnh sửa nội dung trên website" data-builder-field-path={presencePath} className={`${className ?? ""} w-full rounded-md border border-primary bg-background/90 px-2 py-1 text-inherit outline-none focus-visible:ring-2 focus-visible:ring-primary`} style={style} value={draft} onChange={event => setDraft(event.target.value)} onBlur={() => { if (cancelEdit.current) { cancelEdit.current = false; setDraft(value); } else onSave?.(draft); setEditing(false); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); cancelEdit.current = true; event.currentTarget.blur(); } }} />;
  return createElement(tag, {
    className: `${className ?? ""} ${editable ? "cursor-text rounded-sm outline-none hover:outline hover:outline-1 hover:outline-primary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" : ""}`,
    "data-builder-field-path": presencePath,
    style,
    tabIndex: editable ? 0 : undefined,
    onDoubleClick: editable ? () => { setDraft(value); setEditing(true); } : undefined,
    onKeyDown: editable ? (event: React.KeyboardEvent<HTMLElement>) => { if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); setDraft(value); setEditing(true); } } : undefined,
    title: editable ? "Nhấp đúp hoặc nhấn Enter để sửa nhanh" : undefined,
    "aria-label": editable ? `${value || "Nội dung"}. Nhấp đúp hoặc nhấn Enter để chỉnh sửa` : undefined,
  }, value);
}

function SectionView({ section, family, sectionIndex, slug, ctaTarget, ctaLabel, showHidden, gift, editable, selected, onInlineEdit, onSelectSection }: {
  section: StoryBuilderV4Section; family: string; sectionIndex: number; slug?: string; ctaTarget?: string; ctaLabel?: string; showHidden: boolean; gift?: StoryBuilderV4Document["content"]["gift"];
  editable: boolean; selected: boolean; onInlineEdit?: InlineEdit; onSelectSection?: (id: string) => void;
}) {
  const content = record(section.content);
  const hidden = section.visible === false;
  const configuredEffect = section.style?.animation;
  const revealEffect = configuredEffect === "none" ? undefined : configuredEffect ?? defaultRevealEffect(family, section.type);
  const classes = `story-section story-section--${section.type} relative mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24 ${hidden ? "opacity-45" : ""}`;
  const title = text(content.title || section.title);
  const intro = text(content.intro || section.intro);
  if (hidden && !showHidden) return null;

  let body = null;
  switch (section.type) {
    case "hero": {
      const imageUrl = text(content.imageUrl);
      const copy = <div className="story-hero__copy relative z-10 max-w-3xl">
        {text(content.eyebrow) && <p className="mb-5 text-xs uppercase tracking-[0.24em] opacity-75">{text(content.eyebrow)}</p>}
        <InlineText tag="h1" editable={editable} value={text(content.title) || "Ngày vui của chúng mình"} onSave={value => onInlineEdit?.(section.id, "title", value)} presencePath={builderFieldPath(section.id, "hero", "title")} className="font-serif text-4xl leading-[1.06] sm:text-6xl" style={{ fontFamily: "var(--site-heading)" }} />
        {text(content.subtitle) && <InlineText tag="p" editable={editable} value={text(content.subtitle)} onSave={value => onInlineEdit?.(section.id, "subtitle", value)} presencePath={builderFieldPath(section.id, "hero", "subtitle")} className="mt-5 max-w-2xl text-base leading-7 opacity-80 sm:text-lg" />}
        {ctaTarget && <a href={`#${ctaTarget}`} className="mt-8 inline-flex min-h-11 items-center rounded-full bg-[var(--site-text)] px-6 text-sm font-medium text-[var(--site-background)] transition hover:opacity-85">{text(content.ctaLabel) || ctaLabel || "Xem ngày vui"}</a>}
      </div>;
      const image = imageUrl ? <img src={imageUrl} alt="Ảnh bìa đám cưới" decoding="async" className="story-hero__image size-full object-cover" /> : <div aria-hidden="true" className="story-hero__image grid size-full min-h-64 place-items-center bg-[var(--site-primary)]/30"><span className="size-24 rounded-full border border-[var(--site-accent)]/40" /></div>;
      if (section.variant === "split") {
        body = family === "outdoor"
          ? <div className="story-hero story-hero--coastal overflow-hidden border border-[var(--site-rule)] bg-[var(--site-background)]">
            <div className="story-hero__media h-56 overflow-hidden bg-[var(--site-primary)]/20 sm:h-72">{image}</div>
            <div className="story-hero__copy-wrap relative -mt-7 mx-4 bg-[var(--site-background)] px-6 py-8 sm:mx-10 sm:px-10 sm:py-10">{copy}</div>
          </div>
          : family === "editorial"
            ? <div className="story-hero story-hero--magazine grid overflow-hidden border-y border-[var(--site-rule)] bg-[var(--site-background)] md:min-h-[560px] md:grid-cols-[0.95fr_1.05fr]">
              <div className="story-hero__copy-wrap order-2 flex items-center px-7 py-10 sm:px-12 md:order-1 md:py-14">{copy}</div>
              <div className="story-hero__media order-1 h-64 overflow-hidden bg-[var(--site-primary)]/20 sm:h-80 md:order-2 md:h-full">{image}</div>
            </div>
            : <div className="story-hero story-hero--split grid min-h-[480px] overflow-hidden rounded-[28px] border border-[var(--site-rule)] bg-[var(--site-background)] md:min-h-[560px] md:grid-cols-[1.08fr_0.92fr]">
              <div className="story-hero__media min-h-64 overflow-hidden bg-[var(--site-primary)]/20 md:min-h-full">{image}</div>
              <div className="story-hero__copy-wrap flex items-center px-7 py-12 sm:px-12 md:px-10 lg:px-14">{copy}</div>
            </div>;
      } else if (section.variant === "editorial") {
        body = <div className="story-hero story-hero--editorial relative grid min-h-[480px] items-end overflow-hidden border-y border-[var(--site-rule)] bg-[var(--site-background)] px-6 py-10 sm:min-h-[560px] sm:px-12 sm:py-14 md:grid-cols-[1fr_0.65fr] md:items-center">
          <div className="story-hero__copy-wrap relative z-10 max-w-3xl py-8 md:py-12">{copy}</div>
          <div className="story-hero__media relative mt-8 h-64 overflow-hidden bg-[var(--site-primary)]/20 sm:h-80 md:mt-0 md:h-[440px]">{image}</div>
          <span aria-hidden="true" className="absolute left-6 top-4 text-7xl font-serif leading-none text-[var(--site-primary)] sm:left-12 sm:top-8 sm:text-9xl">“</span>
        </div>;
      } else if (section.variant === "dark") {
        body = <div className="story-hero story-hero--dark relative isolate flex min-h-[500px] items-center justify-center overflow-hidden rounded-[28px] bg-[var(--site-background)] px-7 py-16 text-center text-[var(--site-text)] sm:min-h-[620px] sm:px-16">
          {imageUrl && <div className="story-hero__media absolute inset-0 -z-20">{image}</div>}
          {imageUrl && <div className="story-hero__veil absolute inset-0 -z-10 bg-[var(--site-background)]/65" />}
          <div className="max-w-3xl">{copy}</div>
        </div>;
      } else if (section.variant === "ceremonial") {
        body = <div className={`story-hero relative mx-auto flex min-h-[480px] max-w-6xl items-center justify-center px-5 py-8 text-center sm:min-h-[580px] sm:px-10 ${family === "traditional" ? "story-hero--traditional bg-[var(--site-primary)]/20" : "story-hero--ceremonial bg-[var(--site-primary)]/15"}`}>
          <div className="relative grid min-h-[420px] w-full place-items-center border border-[var(--site-accent)]/45 px-6 py-16 sm:min-h-[500px] sm:px-14">
            <div aria-hidden="true" className="absolute inset-2 border border-[var(--site-accent)]/20" />
            {imageUrl && <div className="story-hero__media absolute inset-2 overflow-hidden opacity-15">{image}<div className="absolute inset-0 bg-[var(--site-background)]/50" /></div>}
            <div className="relative z-10 max-w-3xl">{copy}</div>
            <span aria-hidden="true" className="story-hero__ornament absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--site-background)] px-4 text-lg text-[var(--site-accent)]">{family === "traditional" ? "❖" : "✦"}</span>
          </div>
        </div>;
      } else {
        body = family === "garden"
          ? <div className="story-hero story-hero--garden relative grid items-center gap-6 overflow-hidden rounded-[36px] border border-[var(--site-accent)]/20 bg-[var(--site-primary)]/10 p-5 sm:p-8 md:grid-cols-[0.9fr_1.1fr] md:p-10">
            <div className="story-hero__media relative mx-auto h-72 w-full max-w-sm overflow-hidden rounded-t-[48%] rounded-b-[22px] border-[7px] border-[var(--site-background)] shadow-xl sm:h-96">{image}</div>
            <div className="story-hero__copy-wrap relative z-10 px-2 py-5 sm:px-6 sm:py-10">{copy}</div>
            <span aria-hidden="true" className="absolute -right-8 -top-10 size-40 rounded-full border border-[var(--site-accent)]/20" />
            <span aria-hidden="true" className="absolute -bottom-14 left-1/3 size-36 rounded-full border border-[var(--site-accent)]/15" />
          </div>
          : <div className={`story-hero relative flex min-h-[460px] items-center justify-center overflow-hidden px-7 py-16 text-center sm:min-h-[590px] sm:px-16 ${family === "autumn" ? "story-hero--autumn rounded-[42%_42%_22px_22px] bg-[var(--site-primary)]/20" : "story-hero--floral rounded-[48%_48%_24px_24px] bg-[var(--site-primary)]/20"}`}>
          {imageUrl && <div className="story-hero__media absolute inset-0 opacity-30">{image}</div>}
          <div className="story-hero__frame absolute inset-4 rounded-[48%_48%_20px_20px] border border-[var(--site-accent)]/35" />
          <div className="relative z-10 mx-auto max-w-3xl">{copy}</div>
          {family === "romantic" && <span aria-hidden="true" className="story-hero__ornament absolute bottom-8 text-2xl text-[var(--site-accent)]">♡</span>}
        </div>;
      }
      break;
    }
    case "couple": {
      const groom = record(content.groom); const bride = record(content.bride);
      const couple = ([{ key: "groom", person: groom }, { key: "bride", person: bride }] as const).filter(({ person }) => text(person.displayName || person.fullName));
      body = <div className={`story-couple story-couple--${section.variant} relative grid gap-7 ${section.variant === "editorial" ? "md:grid-cols-[0.82fr_1.18fr] md:gap-12" : "sm:grid-cols-2 sm:gap-10"}`}>
        {couple.map(({ key, person }, index) => <article key={key} className={`story-couple__person flex flex-col ${section.variant === "alternating" && index === 1 ? "sm:mt-16" : ""} ${section.variant === "two-columns" ? "items-center rounded-2xl bg-[var(--site-primary)]/15 px-5 pb-6 text-center sm:px-7" : section.variant === "editorial" ? "grid grid-cols-1 items-center gap-5 sm:grid-cols-[0.8fr_1fr]" : ""}`}>
          {text(person.photoUrl) && <img loading="lazy" decoding="async" className={`story-couple__image w-full object-cover ${section.variant === "two-columns" ? "-mt-2 aspect-[4/5] rounded-xl sm:mt-0 sm:aspect-[5/4]" : section.variant === "editorial" ? "aspect-[4/5]" : "aspect-[4/5] rounded-[22px]"}`} src={text(person.photoUrl)} alt={text(person.displayName || person.fullName)} />}
          <div className={section.variant === "two-columns" ? "pt-5" : ""}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--site-accent)]">{key === "groom" ? "Chú rể" : "Cô dâu"}</p>
            <InlineText tag="h3" editable={editable} value={text(person.displayName || person.fullName)} onSave={value => onInlineEdit?.(section.id, key, { ...person, displayName: value })} presencePath={builderFieldPath(section.id, "couple", key, "displayName")} className="mt-2 font-serif text-3xl sm:text-4xl" style={{ fontFamily: "var(--site-heading)" }} />
            {text(person.bio) && <p className="mt-3 max-w-prose whitespace-pre-line leading-7 opacity-80">{text(person.bio)}</p>}
            {(text(person.fatherName) || text(person.motherName)) && <p className="mt-3 text-sm leading-6 opacity-70">{text(person.fatherName) && <>Cha: {text(person.fatherName)}</>}{text(person.fatherName) && text(person.motherName) ? " · " : ""}{text(person.motherName) && <>Mẹ: {text(person.motherName)}</>}</p>}
          </div>
        </article>)}
        {section.variant === "two-columns" && <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 font-serif text-3xl text-[var(--site-accent)] sm:block">&</span>}
        {!couple.length && <p className="text-sm opacity-65">Thêm tên và thông tin hai bạn trong phần chỉnh sửa.</p>}
      </div>;
      break;
    }
    case "countdown":
      body = <div className={`story-countdown story-countdown--${section.variant}`}>
        {content.targetDate ? <Countdown target={text(content.targetDate)} variant={section.variant} /> : <p className="mt-4 text-sm opacity-65">Chưa có ngày tổ chức.</p>}
      </div>;
      break;
    case "loveStory":
      body = <ol className={`story-timeline story-timeline--${section.variant} relative grid gap-5 ${section.variant === "editorial" ? "md:grid-cols-2 md:gap-8" : "pl-6 sm:pl-9"}`}>
        {section.variant === "timeline" && <span aria-hidden="true" className="absolute bottom-4 left-[7px] top-2 w-px bg-[var(--site-accent)]/35 sm:left-[11px]" />}
        {array(content.items).map((item, index) => <li key={text(item.id) || index} className={section.variant === "editorial" ? "overflow-hidden border-t border-[var(--site-rule)] pt-5" : "relative grid gap-4 border-t border-[var(--site-rule)] py-5 sm:grid-cols-[120px_1fr]"}>
          {section.variant === "timeline" && <span aria-hidden="true" className="absolute -left-[25px] top-7 size-3 rounded-full border-2 border-[var(--site-background)] bg-[var(--site-accent)] sm:-left-[35px]" />}
          {text(item.imageUrl) && <img loading="lazy" decoding="async" src={text(item.imageUrl)} alt={text(item.title)} className={`w-full object-cover ${section.variant === "editorial" ? "mb-5 aspect-[4/3]" : "aspect-square max-h-56 rounded-xl sm:max-h-none"}`} />}
          <div className={section.variant === "editorial" ? "pb-4" : ""}><p className="text-xs uppercase tracking-[0.16em] text-[var(--site-accent)]">{text(item.date) || String(index + 1).padStart(2, "0")}</p><InlineText tag="h3" editable={editable} value={text(item.title)} onSave={value => onInlineEdit?.(section.id, "items", array(content.items).map((entry, itemIndex) => itemIndex === index ? { ...entry, title: value } : entry))} presencePath={builderFieldPath(section.id, "loveStory", "items", text(item.id) || index, "title")} className={`mt-2 font-serif ${section.variant === "editorial" ? "text-3xl sm:text-4xl" : "text-2xl"}`} style={{ fontFamily: "var(--site-heading)" }} /><InlineText tag="p" editable={editable} value={text(item.body)} onSave={value => onInlineEdit?.(section.id, "items", array(content.items).map((entry, itemIndex) => itemIndex === index ? { ...entry, body: value } : entry))} presencePath={builderFieldPath(section.id, "loveStory", "items", text(item.id) || index, "body")} className="mt-3 whitespace-pre-line leading-7 opacity-80" /></div>
        </li>)}
        {!array(content.items).length && <li className="text-sm opacity-65">Thêm những dấu mốc hai bạn muốn chia sẻ.</li>}
      </ol>;
      break;
    case "events":
      body = <div className={`story-events story-events--${section.variant} grid gap-5 ${section.variant === "minimal" ? "" : "sm:grid-cols-2"}`}>
        {array(content.events).map((event, index) => { const links = calendarLinks(event); return <article key={text(event.id) || index} className={`story-event ${section.variant === "minimal" ? "border-t border-[var(--site-rule)] py-5" : "rounded-2xl border border-[var(--site-rule)] bg-[var(--site-background)]/80 p-5 sm:p-6"}`}>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--site-accent)]">{dateLabel(text(event.startsAt), "vi-VN", text(event.timeZoneId) || undefined)}</p>
          <InlineText tag="h3" editable={editable && !Array.isArray(content.eventIds)} value={text(event.title)} onSave={value => onInlineEdit?.(section.id, "events", array(content.events).map((entry, eventIndex) => eventIndex === index ? { ...entry, title: value } : entry))} presencePath={builderFieldPath(section.id, "events", "events", text(event.id) || index, "title")} className="mt-2 font-serif text-2xl" style={{ fontFamily: "var(--site-heading)" }} />
          {text(event.venueName) && <p className="mt-2 font-medium">{text(event.venueName)}</p>}
          {text(event.address) && <p className="mt-1 opacity-75">{text(event.address)}</p>}
          {text(event.mapUrl).startsWith("https://") && <a className="mt-3 inline-block text-sm text-[var(--site-accent)] underline" href={text(event.mapUrl)} target="_blank" rel="noreferrer">Mở bản đồ</a>}
          {links && <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--site-rule)] pt-3 text-sm"><a className="text-[var(--site-accent)] underline underline-offset-4" href={links.google} target="_blank" rel="noreferrer">Google Calendar</a><a className="text-[var(--site-accent)] underline underline-offset-4" href={links.ics} download="inviteme-event.ics">Tải lịch (.ics)</a></div>}
        </article>; })}
        {!array(content.events).length && <p className="text-sm opacity-65">Chưa có thông tin sự kiện.</p>}
      </div>;
      break;
    case "weddingParty":
      body = <div className={`story-wedding-party grid gap-10 ${section.variant === "editorial" ? "md:grid-cols-2 md:gap-14" : "sm:grid-cols-2"}`}>
        {([ ["groom", "Phù rể"], ["bride", "Phù dâu"] ] as const).map(([side, label]) => <section key={side} aria-label={label}>
          <h3 className="mb-5 border-b border-[var(--site-rule)] pb-3 font-serif text-2xl" style={{ fontFamily: "var(--site-heading)" }}>{label}</h3>
          <div className={`grid gap-4 ${section.variant === "editorial" ? "sm:grid-cols-2" : ""}`}>
            {array(content[side]).map((member, index) => <article key={text(member.id) || index} className={`flex items-center gap-4 ${section.variant === "classic" ? "border-b border-[var(--site-rule)] pb-4" : "flex-col items-start"}`}>
              {text(member.photoUrl) ? <img loading="lazy" decoding="async" src={text(member.photoUrl)} alt={text(member.name)} className={`shrink-0 object-cover ${section.variant === "editorial" ? "aspect-[4/3] w-full rounded-xl" : "size-16 rounded-full"}`} /> : <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-full bg-[var(--site-primary)]/25 font-serif text-xl text-[var(--site-accent)]">{text(member.name).slice(0, 1)}</span>}
              <div><p className="font-medium">{text(member.name) || "Tên thành viên"}</p>{text(member.role) && <p className="mt-1 text-sm text-[var(--site-accent)]">{text(member.role)}</p>}{text(member.bio) && <p className="mt-2 text-sm leading-6 opacity-75">{text(member.bio)}</p>}</div>
            </article>)}
            {!array(content[side]).length && <p className="text-sm opacity-65">Chưa thêm thành viên.</p>}
          </div>
        </section>)}
      </div>;
      break;
    case "gallery":
      body = <StoryGalleryLightbox
        images={array(content.images).map((image, index) => ({ id: text(image.id) || `gallery-${index}`, imageUrl: text(image.imageUrl), alt: text(image.alt) || undefined })).filter(image => image.imageUrl)}
        variant={section.variant}
        enabled={!editable && Boolean(slug)}
      />;
      break;
    case "rsvp":
      body = <StoryRsvp label={text(content.submitLabel) || undefined} />;
      break;
    case "wishes":
      body = <StoryWishes slug={slug} displayLimit={typeof content.displayLimit === "number" ? content.displayLimit : 3} allowLikes={content.allowLikes === true} allowComments={content.allowComments === true} />;
      break;
    case "gift": {
      const giftData = record(gift);
      body = <div className="story-gift grid gap-4 sm:grid-cols-2">
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
  const sectionHeaderClass = `story-section__header ${section.variant === "editorial" ? "mx-auto mb-10 max-w-3xl text-center" : "mb-8 max-w-2xl"}`;
  return <section id={section.id} data-section-type={section.type} data-variant={section.variant} data-section-number={String(sectionIndex + 1).padStart(2, "0")} data-reveal-effect={revealEffect} tabIndex={editable ? 0 : undefined} aria-label={editable ? `${title || section.type}, chọn để chỉnh sửa` : undefined} onClick={editable ? event => { if (event.target instanceof Element && event.target.closest("a, button, input, textarea, select, [contenteditable='true']")) return; onSelectSection?.(section.id); } : undefined} onKeyDown={editable ? event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelectSection?.(section.id); } } : undefined} className={`${classes} ${spacing} ${surface} ${editable ? "cursor-pointer outline-offset-[-1px] hover:outline hover:outline-1 hover:outline-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" : ""} ${editable && selected ? "outline outline-2 outline-primary" : ""}`}>
    {hidden && <span className="absolute right-5 top-4 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Đang ẩn</span>}
    {section.type !== "hero" && <header className={sectionHeaderClass}>
      {family === "editorial" && <span className="story-section__number mb-2 block text-xs font-semibold tracking-[0.24em] text-[var(--site-accent)]">{String(sectionIndex + 1).padStart(2, "0")}</span>}
      {title && <InlineText tag="h2" editable={editable} value={title} onSave={value => onInlineEdit?.(section.id, "title", value)} presencePath={builderFieldPath(section.id, section.type, "title")} className="story-section__title font-serif text-3xl sm:text-4xl" style={{ fontFamily: "var(--site-heading)" }} />}
      {intro && <InlineText tag="p" editable={editable} value={intro} onSave={value => onInlineEdit?.(section.id, "intro", value)} presencePath={builderFieldPath(section.id, section.type, "intro")} className="mt-3 leading-7 opacity-75" />}
    </header>}
    {body}
  </section>;
}

export function StoryBuilderV4Renderer({ document, slug, pagePath, showHidden = false, editable = false, showGuestExperiencePreview = false, selectedSectionId, onInlineEdit, onSelectSection, onNavigatePage }: Props) {
  const motionRoot = useRef<HTMLDivElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const page = useMemo(() => pagePath === undefined ? document.pages.find(item => item.isHome) : document.pages.find(item => item.slug === pagePath), [document.pages, pagePath]);
  const { colors, heading, body } = templateColors(document);
  const family = templateFamily(document);
  const guestExperience: GuestExperienceSettings = {
    tools: document.appearance.guestExperience?.tools ?? [],
    decoration: document.appearance.guestExperience?.decoration ?? "none",
    intensity: document.appearance.guestExperience?.intensity ?? "light",
  };
  useEffect(() => {
    const root = motionRoot.current;
    if (!root || editable || document.appearance.motion === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal-effect]"));
    if (!targets.length) return;

    root.dataset.motionReady = "true";
    if (!("IntersectionObserver" in window)) {
      targets.forEach(target => { target.dataset.revealed = "true"; });
      return () => {
        delete root.dataset.motionReady;
        targets.forEach(target => { delete target.dataset.revealed; });
      };
    }

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.revealed = "true";
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -36px 0px" });
    targets.forEach(target => observer.observe(target));
    return () => {
      observer.disconnect();
      delete root.dataset.motionReady;
      targets.forEach(target => { delete target.dataset.revealed; });
    };
  }, [document.appearance.motion, editable, page]);
  useEffect(() => {
    if (editable || !slug) return;
    const updateVisibility = () => setShowBackToTop(window.scrollY > 640);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, [editable, slug]);
  async function shareWebsite() {
    const title = document.seo?.title || "Website cưới";
    const url = new URL(window.location.href);
    url.searchParams.delete("inviteToken");
    try {
      if (navigator.share) {
        await navigator.share({ title, url: url.toString() });
        setShareStatus("Đã mở chia sẻ.");
      } else {
        await navigator.clipboard.writeText(url.toString());
        setShareStatus("Đã sao chép liên kết website.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url.toString());
        setShareStatus("Đã sao chép liên kết website.");
      } catch {
        setShareStatus("Không thể chia sẻ liên kết trên thiết bị này.");
      }
    }
    window.setTimeout(() => setShareStatus(""), 2500);
  }
  if (!page) return <main className="mx-auto max-w-xl px-6 py-24 text-center"><h1 className="font-serif text-3xl">Không tìm thấy trang</h1><p className="mt-3 opacity-70">Trang này có thể chưa được xuất bản.</p></main>;
  const eventsTarget = page.sections.find(section => section.type === "events" && section.visible !== false)?.id;
  const rsvpTarget = page.sections.find(section => section.type === "rsvp" && section.visible !== false)?.id;
  const ctaTarget = eventsTarget ?? rsvpTarget;
  const ctaLabel = eventsTarget ? "Xem ngày vui" : "Xác nhận tham dự";
  const visibleSections = document.pages.filter(item => item.visible !== false)
    .flatMap(item => item.sections.filter(section => section.visible !== false).map(section => ({ section, pageSlug: item.slug })));
  const findTarget = (type: "rsvp" | "gift" | "wishes") => {
    const match = visibleSections.find(item => item.section.type === type);
    return match ? { sectionId: match.section.id, pageSlug: match.pageSlug } : undefined;
  };
  const hasEnabledGift = document.content.gift?.enabled === true;
  const eventList = visibleSections.filter(item => item.section.type === "events")
    .flatMap(item => array(record(item.section.content).events));
  const toolTargets = {
    rsvp: findTarget("rsvp"),
    gift: hasEnabledGift ? findTarget("gift") : undefined,
    wishes: findTarget("wishes"),
  };
  const rsvpAlreadyLinkedFromHero = Boolean(rsvpTarget && ctaTarget === rsvpTarget &&
    page.sections.some(section => section.type === "hero" && section.visible !== false));
  const guestTools = guestExperience.tools.filter(tool => !(tool === "rsvp" && rsvpAlreadyLinkedFromHero));
  const showGuestTools = !editable && (Boolean(slug) || showGuestExperiencePreview) && guestTools.length > 0;
  const backToTopPosition = showGuestTools
    ? "bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-5 sm:bottom-6 sm:right-[11rem]"
    : "bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-5 sm:bottom-6 sm:right-5";
  const showDecoration = guestExperience.decoration !== "none" && (Boolean(slug) || showGuestExperiencePreview);
  const showLegacyFooterShare = Boolean(slug) && !editable && !document.appearance.guestExperience && !guestTools.includes("share");
  const style = {
    "--site-primary": colors.primary, "--site-background": colors.background, "--site-accent": colors.accent,
    "--site-text": colors.text, "--site-rule": `${colors.text}26`, "--site-heading": heading, "--site-body": body,
    background: "var(--site-background)", color: "var(--site-text)", fontFamily: "var(--site-body)",
  } as CSSProperties;
  const visiblePages = document.pages.filter(item => item.visible !== false);
  return <div ref={motionRoot} style={style} data-design-family={family} data-motion-mode={document.appearance.motion ?? "template"} className={`template-canvas relative min-h-full ${showGuestTools ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-0" : ""}`}>
    {showDecoration && <GuestDecoration effect={guestExperience.decoration} intensity={guestExperience.intensity} fixed={Boolean(slug)} />}
    {visiblePages.length > 1 && <nav aria-label="Các trang website cưới" className="sticky top-0 z-10 flex justify-center gap-4 border-b border-[var(--site-rule)] bg-[var(--site-background)]/95 px-4 py-3 backdrop-blur sm:gap-8">
      {visiblePages.map(item => {
        const href = item.isHome ? `/wedding/${encodeURIComponent(slug ?? "")}` : `/wedding/${encodeURIComponent(slug ?? "")}/${item.slug}`;
        const className = item.id === page.id ? "border-b-2 border-[var(--site-accent)] pb-1 text-[var(--site-accent)]" : "pb-1 opacity-70 hover:opacity-100";
        if (onNavigatePage) return <button key={item.id} type="button" className={className} aria-current={item.id === page.id ? "page" : undefined} onClick={() => onNavigatePage(item.slug)}>{item.navigationLabel || item.title}</button>;
        return slug ? <Link key={item.id} href={href} className={className} aria-current={item.id === page.id ? "page" : undefined}>{item.navigationLabel || item.title}</Link>
          : <span key={item.id} className="pb-1 opacity-75" aria-current={item.id === page.id ? "page" : undefined}>{item.navigationLabel || item.title}</span>;
      })}
    </nav>}
    <main className="relative z-[1]">
      {page.sections.map((section, index) => <SectionView key={section.id} section={section} family={family} sectionIndex={index} slug={slug} ctaTarget={ctaTarget} ctaLabel={ctaLabel} showHidden={showHidden} gift={document.content.gift} editable={editable} selected={selectedSectionId === section.id} onInlineEdit={onInlineEdit} onSelectSection={onSelectSection} />)}
    </main>
    <footer className="relative z-[1] border-t border-[var(--site-rule)] px-5 py-8 text-center">
      {showLegacyFooterShare && <div className="mb-5 flex flex-col items-center gap-2">
        <button type="button" onClick={() => void shareWebsite()} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--site-rule)] px-4 text-sm transition hover:bg-[var(--site-primary)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]"><Share2 className="size-4" />Chia sẻ website</button>
        {shareStatus && <p role="status" aria-live="polite" className="text-xs opacity-70">{shareStatus}</p>}
      </div>}
      <p className="text-xs tracking-wide opacity-65">Được tạo cùng InviteMe</p>
    </footer>
    {showGuestTools && <GuestUtilityBar tools={guestTools} targets={toolTargets} events={eventList} slug={slug} onNavigatePage={onNavigatePage} />}
    {showBackToTop && !editable && <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })} className={`fixed ${backToTopPosition} z-20 grid size-11 place-items-center rounded-full border border-[var(--site-rule)] bg-[var(--site-background)] text-[var(--site-text)] shadow-lg transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]`} aria-label="Lên đầu trang"><ArrowUp className="size-5" /></button>}
  </div>;
}
