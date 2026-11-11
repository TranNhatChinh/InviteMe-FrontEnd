"use client";

/* eslint-disable @next/next/no-img-element -- Wedding media is served from the wedding-owned media API. */
import { createElement, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowUp, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Copy, Facebook, Gift, Heart, Instagram, MessageCircle, Pause, Play, Share2, X } from "lucide-react";
import { resolveMediaUrl } from "@/core/config/media-url";
import type { StoryBuilderV4Document, StoryBuilderV4Section } from "../schemas/story-builder-v4.schema";
import { isImageFilename } from "../schemas/story-builder-v4.helpers";
import { StoryRsvp } from "./story-rsvp";
import { StoryWishes } from "./story-wishes";
import { StoryGalleryLightbox } from "./story-gallery-lightbox";
// eslint-disable-next-line architecture/boundaries -- The website renderer uses the shared public gift-account DTO shape.
import type { GiftBankAccount } from "@/features/gifts";

type InlineEdit = (sectionId: string, key: string, value: unknown) => void;
type GiftAccountCard = Pick<GiftBankAccount, "bankName" | "accountNumber" | "accountName" | "label"> & { id?: string; bankBin?: string; role?: "groom" | "bride"; displayLabel?: string };
type Props = { document: StoryBuilderV4Document; slug?: string; pagePath?: string; showHidden?: boolean; editable?: boolean; showGuestExperiencePreview?: boolean; giftAccounts?: GiftBankAccount[]; selectedSectionId?: string; onInlineEdit?: InlineEdit; onSelectSection?: (sectionId: string) => void; onNavigatePage?: (pagePath: string) => void };
type Colors = { primary: string; background: string; accent: string; text: string };
type GuestTool = "rsvp" | "calendar" | "gift" | "wishes" | "share";
type GuestDecoration = "none" | "petals" | "sparkles" | "hearts" | "fireflies";
type GuestIntensity = "light" | "medium" | "vivid";
type GuestExperienceSettings = { tools: GuestTool[]; decoration: GuestDecoration; intensity: GuestIntensity };
const fallbackColors: Colors = { primary: "#e98ca3", background: "#fffaf8", accent: "#9d4d62", text: "#34242a" };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const array = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record) : [];
const safeSocialHref = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
};
const personInitials = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "♡";
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : parts[0]?.[1] ?? ""}`.toLocaleUpperCase("vi-VN");
};
const vietQrAccountImageUrl = (account: GiftAccountCard) => {
  const bankBin = text(account.bankBin);
  const accountNumber = text(account.accountNumber);
  if (!bankBin || !accountNumber) return null;
  const accountName = text(account.accountName).trim().replace(/[đĐ]/g, value => value === "đ" ? "d" : "D")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ");
  return `https://img.vietqr.io/image/${encodeURIComponent(bankBin)}-${encodeURIComponent(accountNumber)}-compact2.png?accountName=${encodeURIComponent(accountName)}`;
};
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

function Countdown({ target, timeZoneId, variant, showSeconds, completedMessage }: { target: string; timeZoneId: string; variant: string; showSeconds: boolean; completedMessage: string }) {
  const [now, setNow] = useState<number | null>(null);
  const targetMs = Date.parse(target);
  useEffect(() => {
    if (!Number.isFinite(targetMs)) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, showSeconds ? 1_000 : 60_000);
    return () => window.clearInterval(timer);
  }, [targetMs, showSeconds]);
  if (!Number.isFinite(targetMs)) return null;

  const remaining = now === null ? 0 : Math.max(0, targetMs - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  const timeZone = timeZoneId || "Asia/Ho_Chi_Minh";
  const targetDateLabel = (() => {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(targetMs));
      const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
      return `Ngày ${value("day")}/${value("month")}/${value("year")} · ${value("hour")}:${value("minute")}`;
    } catch { return ""; }
  })();
  const complete = now !== null && now >= targetMs;
  const localDay = (value: number) => {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
      return `${part("year")}-${part("month")}-${part("day")}`;
    } catch { return new Date(value).toISOString().slice(0, 10); }
  };
  const sameDay = now !== null && localDay(targetMs) === localDay(now);
  const completeText = completedMessage.trim() || (sameDay ? "Hôm nay là ngày vui của chúng mình!" : "Ngày vui đã diễn ra. Cảm ơn bạn đã cùng chúng mình tạo nên kỷ niệm.");
  if (complete) return <div className={`story-countdown__panel story-countdown__panel--complete story-countdown__panel--${variant} relative mt-6 overflow-hidden rounded-[1.5rem] border border-[var(--site-rule)] bg-[var(--site-primary)]/10 px-5 py-7 text-center sm:px-8`}>
    <span aria-hidden="true" className="story-countdown__ornament">✦</span>
    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--site-accent)]">{sameDay ? "NGÀY VUI ĐÃ ĐẾN" : "MỘT NGÀY ĐÁNG NHỚ"}</p>
    <p className="mt-3 font-serif text-xl leading-8 text-[var(--site-text)] sm:text-2xl" style={{ fontFamily: "var(--site-heading)" }}>{completeText}</p>
    {targetDateLabel && <p className="mt-3 text-xs tracking-wide text-[var(--site-text)] opacity-65"><CalendarDays className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden="true" />{targetDateLabel}</p>}
  </div>;

  const units = [
    { key: "days", value: now === null ? "–" : String(days), label: "Ngày" },
    { key: "hours", value: now === null ? "–" : String(hours).padStart(2, "0"), label: "Giờ" },
    { key: "minutes", value: now === null ? "–" : String(minutes).padStart(2, "0"), label: "Phút" },
    ...(showSeconds ? [{ key: "seconds", value: now === null ? "–" : String(seconds).padStart(2, "0"), label: "Giây" }] : []),
  ];
  const accessibleCountdown = now === null ? "Đang tải đồng hồ đếm ngược" : `Còn ${days} ngày, ${hours} giờ, ${minutes} phút${showSeconds ? `, ${seconds} giây` : ""}`;
  const unitClass = variant === "banner"
    ? "story-countdown__unit rounded-xl border border-[var(--site-rule)]/70 bg-[var(--site-background)]/80 px-3 py-3.5 shadow-sm sm:px-4 sm:py-4"
    : variant === "inline"
      ? "story-countdown__unit min-w-[4.5rem] px-2 py-2 sm:min-w-[5.5rem]"
      : "story-countdown__unit rounded-xl border border-[var(--site-rule)] bg-[var(--site-background)]/85 px-3 py-4 shadow-[0_8px_22px_rgba(65,35,45,0.055)] sm:px-5 sm:py-5";
  const unitGrid = showSeconds ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3";
  const unitList = <div className={`story-countdown__units grid ${unitGrid} gap-2.5 sm:gap-3 ${variant === "inline" ? "sm:gap-5" : ""}`} role="timer" aria-label={accessibleCountdown} aria-live="off">
    {units.map(unit => <div className={`${unitClass} text-center`} key={unit.key}>
      <strong key={`${unit.key}-${unit.value}`} className="story-countdown__value block font-serif text-[clamp(1.25rem,7vw,3rem)] leading-none tabular-nums text-[var(--site-accent)] sm:text-5xl" style={{ fontFamily: "var(--site-heading)" }}>{unit.value}</strong>
      <span className="mt-2 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--site-text)]/65 sm:text-[10px]">{unit.label}</span>
    </div>)}
  </div>;
  if (variant === "banner") return <div className="story-countdown__panel story-countdown__panel--banner relative mt-6 overflow-hidden rounded-[1.5rem] border border-[var(--site-rule)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--site-primary)_38%,var(--site-background)),var(--site-background)_75%)] px-4 py-5 sm:px-7 sm:py-7">
    <span aria-hidden="true" className="story-countdown__ornament">✦</span>
    <p className="mb-4 text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--site-accent)]">NGÀY VUI ĐANG ĐẾN GẦN</p>
    {unitList}
    {targetDateLabel && <p className="mt-4 text-center text-xs tracking-wide text-[var(--site-text)] opacity-70"><CalendarDays className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden="true" />{targetDateLabel}</p>}
  </div>;
  if (variant === "inline") return <div className="story-countdown__panel story-countdown__panel--inline mt-6 border-y border-[var(--site-rule)] py-4 sm:py-5">{unitList}{targetDateLabel && <p className="mt-3 text-center text-xs tracking-wide text-[var(--site-text)] opacity-65"><CalendarDays className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden="true" />{targetDateLabel}</p>}</div>;
  return <div className="story-countdown__panel story-countdown__panel--classic relative mt-6 rounded-[1.35rem] border border-[var(--site-rule)] bg-[var(--site-primary)]/10 p-3 sm:p-5">
    <span aria-hidden="true" className="story-countdown__ornament">✦</span>
    {unitList}
    {targetDateLabel && <p className="mt-4 text-center text-xs tracking-wide text-[var(--site-text)] opacity-65"><CalendarDays className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden="true" />{targetDateLabel}</p>}
  </div>;
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

function SectionView({ section, family, sectionIndex, slug, ctaTarget, ctaLabel, showHidden, gift, giftAccounts, editable, selected, onInlineEdit, onSelectSection }: {
  section: StoryBuilderV4Section; family: string; sectionIndex: number; slug?: string; ctaTarget?: string; ctaLabel?: string; showHidden: boolean; gift?: StoryBuilderV4Document["content"]["gift"]; giftAccounts?: GiftBankAccount[];
  editable: boolean; selected: boolean; onInlineEdit?: InlineEdit; onSelectSection?: (id: string) => void;
}) {
  const [copiedRole, setCopiedRole] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");
  const [activeGiftRole, setActiveGiftRole] = useState<"groom" | "bride" | null>(null);
  const [giftQrFailed, setGiftQrFailed] = useState(false);
  const [failedProfilePhotos, setFailedProfilePhotos] = useState<Record<string, string>>({});
  const [heroSlideSelection, setHeroSlideSelection] = useState<{ key: string; index: number }>({ key: "", index: 0 });
  const [failedHeroImages, setFailedHeroImages] = useState<Record<string, boolean>>({});
  const [heroPlayback, setHeroPlayback] = useState<{ key: string; paused: boolean }>({ key: "", paused: false });
  const [heroPointerPaused, setHeroPointerPaused] = useState(false);
  useEffect(() => {
    if (!activeGiftRole) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setActiveGiftRole(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeGiftRole]);
  const content = record(section.content);
  const heroSlideSignature = section.type === "hero"
    ? [text(content.imageUrl), ...array(content.slides).map(slide => `${text(slide.id)}:${text(slide.imageUrl)}`)].join("|")
    : "";
  const selectedHeroSlide = heroSlideSelection.key === heroSlideSignature ? heroSlideSelection.index : 0;
  const heroSlideCount = section.type === "hero"
    ? Math.min(3, [text(content.imageUrl), ...array(content.slides).map(slide => text(slide.imageUrl))].filter(Boolean).length)
    : 0;
  const heroPausedByUser = heroPlayback.key === heroSlideSignature && heroPlayback.paused;
  useEffect(() => {
    if (heroSlideCount < 2 || heroPausedByUser || heroPointerPaused) return;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    const stop = () => { if (timer) window.clearInterval(timer); timer = undefined; };
    const start = () => {
      if (timer || motionPreference.matches || document.visibilityState !== "visible") return;
      timer = window.setInterval(() => setHeroSlideSelection(current => {
        const currentIndex = current.key === heroSlideSignature ? current.index : 0;
        return { key: heroSlideSignature, index: (currentIndex + 1) % heroSlideCount };
      }), 6000);
    };
    const syncMotionPreference = () => motionPreference.matches ? stop() : start();
    const syncVisibility = () => document.visibilityState === "visible" ? start() : stop();
    start();
    motionPreference.addEventListener("change", syncMotionPreference);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      stop();
      motionPreference.removeEventListener("change", syncMotionPreference);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, [heroSlideCount, heroPausedByUser, heroPointerPaused, heroSlideSignature]);
  const hidden = section.visible === false;
  const configuredEffect = section.style?.animation;
  const revealEffect = configuredEffect === "none" ? undefined : configuredEffect ??
    ((section.type === "wishes" && section.variant === "fountain") || (section.type === "loveStory" && section.variant === "photo-journal") ? "stagger" : defaultRevealEffect(family, section.type));
  const classes = `story-section story-section--${section.type} relative mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24 ${hidden ? "opacity-45" : ""}`;
  const title = text(content.title || section.title);
  const intro = text(content.intro || section.intro);
  if (hidden && !showHidden) return null;

  let body = null;
  switch (section.type) {
    case "hero": {
      const heroSlides = [
        ...(text(content.imageUrl) ? [{ id: "cover", imageUrl: text(content.imageUrl), alt: text(content.imageAlt) }] : []),
        ...array(content.slides).map((slide, index) => ({ id: text(slide.id) || `slide-${index}`, imageUrl: text(slide.imageUrl), alt: text(slide.alt) })),
      ].filter(slide => slide.imageUrl).slice(0, 3);
      const activeSlideIndex = heroSlides.length ? selectedHeroSlide % heroSlides.length : 0;
      const activeSlide = heroSlides[activeSlideIndex];
      const imageUrl = activeSlide?.imageUrl ?? "";
      const focus = record(content.imageFocus);
      const focusX = typeof focus.x === "number" ? Math.min(100, Math.max(0, focus.x)) : 50;
      const focusY = typeof focus.y === "number" ? Math.min(100, Math.max(0, focus.y)) : 50;
      const overlayConfigured = ["none", "soft", "strong"].includes(text(content.overlayStrength));
      const overlayAlpha = overlayConfigured
        ? content.overlayStrength === "strong" ? 0.58 : content.overlayStrength === "soft" ? 0.24 : 0
        : section.variant === "dark" ? 0.65 : section.variant === "ceremonial" ? 0.08 : 0;
      const legacyImageOpacity = overlayConfigured ? 1 : section.variant === "ceremonial" ? 0.15
        : section.variant === "dark" || section.variant === "split" || section.variant === "editorial" || family === "garden" ? 1 : 0.3;
      const controls = heroSlides.length > 1 && <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-2 px-3" role="group" aria-label="Chuyển ảnh bìa" onMouseEnter={() => setHeroPointerPaused(true)} onMouseLeave={() => setHeroPointerPaused(false)} onFocusCapture={() => setHeroPointerPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeroPointerPaused(false); }}>
        <button type="button" aria-label={heroPausedByUser ? "Tiếp tục trình chiếu ảnh" : "Tạm dừng trình chiếu ảnh"} aria-pressed={heroPausedByUser} className="grid size-9 shrink-0 place-items-center rounded-full border border-white/60 bg-black/35 text-white shadow-sm backdrop-blur transition hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => setHeroPlayback({ key: heroSlideSignature, paused: !heroPausedByUser })}>{heroPausedByUser ? <Play className="size-3.5" aria-hidden="true" /> : <Pause className="size-3.5" aria-hidden="true" />}</button>
        <button type="button" aria-label="Xem ảnh bìa trước" className="grid size-9 shrink-0 place-items-center rounded-full border border-white/60 bg-black/35 text-white shadow-sm backdrop-blur transition hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => setHeroSlideSelection({ key: heroSlideSignature, index: (activeSlideIndex - 1 + heroSlides.length) % heroSlides.length })}><ChevronLeft className="size-4" aria-hidden="true" /></button>
        <div className="flex min-h-9 items-center gap-1.5 rounded-full border border-white/60 bg-black/35 px-2.5 shadow-sm backdrop-blur" aria-label={`Ảnh ${activeSlideIndex + 1} trên ${heroSlides.length}`}>
          {heroSlides.map((slide, index) => <button key={slide.id} type="button" aria-label={`Hiện ảnh bìa ${index + 1}`} aria-pressed={index === activeSlideIndex} className={`size-2.5 rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${index === activeSlideIndex ? "scale-110 bg-white" : "bg-white/55 hover:bg-white/80"}`} onClick={() => setHeroSlideSelection({ key: heroSlideSignature, index })} />)}
        </div>
        <button type="button" aria-label="Xem ảnh bìa tiếp theo" className="grid size-9 shrink-0 place-items-center rounded-full border border-white/60 bg-black/35 text-white shadow-sm backdrop-blur transition hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" onClick={() => setHeroSlideSelection({ key: heroSlideSignature, index: (activeSlideIndex + 1) % heroSlides.length })}><ChevronRight className="size-4" aria-hidden="true" /></button>
      </div>;
      const copy = <div className="story-hero__copy relative z-10 max-w-3xl">
        {text(content.eyebrow) && <p className="mb-5 text-xs uppercase tracking-[0.24em] opacity-75">{text(content.eyebrow)}</p>}
        <InlineText tag="h1" editable={editable} value={text(content.title) || "Ngày vui của chúng mình"} onSave={value => onInlineEdit?.(section.id, "title", value)} presencePath={builderFieldPath(section.id, "hero", "title")} className="font-serif text-4xl leading-[1.06] sm:text-6xl" style={{ fontFamily: "var(--site-heading)" }} />
        {text(content.subtitle) && <InlineText tag="p" editable={editable} value={text(content.subtitle)} onSave={value => onInlineEdit?.(section.id, "subtitle", value)} presencePath={builderFieldPath(section.id, "hero", "subtitle")} className="mt-5 max-w-2xl text-base leading-7 opacity-80 sm:text-lg" />}
        {ctaTarget && <a href={`#${ctaTarget}`} className="mt-8 inline-flex min-h-11 items-center rounded-full bg-[var(--site-text)] px-6 text-sm font-medium text-[var(--site-background)] transition hover:opacity-85">{text(content.ctaLabel) || ctaLabel || "Xem ngày vui"}</a>}
      </div>;
      const hasHeroImages = heroSlides.length > 0;
      const image = <div className="relative size-full" role={activeSlide ? "group" : undefined} aria-roledescription={activeSlide ? "slide" : undefined} aria-label={activeSlide ? `Ảnh ${activeSlideIndex + 1} trên ${heroSlides.length}` : undefined} onMouseEnter={() => setHeroPointerPaused(true)} onMouseLeave={() => setHeroPointerPaused(false)} onFocusCapture={() => setHeroPointerPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeroPointerPaused(false); }}>
        {imageUrl && !failedHeroImages[imageUrl]
          ? <img src={resolveMediaUrl(imageUrl) ?? imageUrl} alt={activeSlide?.alt || "Ảnh cưới của hai bạn"} decoding="async" className="story-hero__image size-full object-cover" style={{ objectPosition: `${focusX}% ${focusY}%`, opacity: legacyImageOpacity }} onError={() => setFailedHeroImages(current => ({ ...current, [imageUrl]: true }))} />
          : <div role={imageUrl ? "img" : undefined} aria-label={imageUrl ? "Không tải được ảnh bìa" : undefined} aria-hidden={imageUrl ? undefined : true} className="story-hero__image grid size-full min-h-64 place-items-center bg-[var(--site-primary)]/30"><span className="size-24 rounded-full border border-[var(--site-accent)]/40" /></div>}
        {overlayAlpha > 0 && hasHeroImages && <div aria-hidden="true" className="story-hero__veil pointer-events-none absolute inset-0" style={{ backgroundColor: "var(--site-background)", opacity: overlayAlpha }} />}
        {section.variant !== "dark" && controls}
      </div>;
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
          {hasHeroImages && <div className="story-hero__media absolute inset-0 z-0">{image}</div>}
          <div className="relative z-10 max-w-3xl">{copy}</div>
          {hasHeroImages && controls}
        </div>;
      } else if (section.variant === "ceremonial") {
        body = <div className={`story-hero relative mx-auto flex min-h-[480px] max-w-6xl items-center justify-center px-5 py-8 text-center sm:min-h-[580px] sm:px-10 ${family === "traditional" ? "story-hero--traditional bg-[var(--site-primary)]/20" : "story-hero--ceremonial bg-[var(--site-primary)]/15"}`}>
          <div className="relative grid min-h-[420px] w-full place-items-center border border-[var(--site-accent)]/45 px-6 py-16 sm:min-h-[500px] sm:px-14">
            <div aria-hidden="true" className="absolute inset-2 border border-[var(--site-accent)]/20" />
            {hasHeroImages && <div className="story-hero__media absolute inset-2 overflow-hidden">{image}</div>}
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
          {hasHeroImages && <div className="story-hero__media absolute inset-0">{image}</div>}
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
      body = <div className={`story-couple story-couple--${section.variant} relative grid ${section.variant === "two-columns" ? "gap-5 sm:grid-cols-2 sm:gap-8" : section.variant === "editorial" ? "grid-cols-1 gap-0" : "gap-8 sm:grid-cols-2 sm:gap-10"}`}>
        {couple.map(({ key, person }, index) => {
          const name = text(person.displayName || person.fullName);
          const photoUrl = text(person.photoUrl);
          const photoFailed = Boolean(photoUrl && failedProfilePhotos[key] === photoUrl);
          const social = record(person.social);
          const facebook = safeSocialHref(social.facebook);
          const instagram = safeSocialHref(social.instagram);
          const isTwoColumns = section.variant === "two-columns";
          const isEditorial = section.variant === "editorial";
          const reverseOnDesktop = (isEditorial || section.variant === "alternating") && index === 1;
          return <article key={key} className={`story-couple__person story-couple__person--${key} ${isTwoColumns
            ? "flex min-w-0 flex-col items-center rounded-[1.35rem] border border-[var(--site-rule)] bg-[var(--site-primary)]/12 p-4 text-center sm:p-6"
            : isEditorial
              ? "grid min-w-0 grid-cols-1 items-center gap-5 border-b border-[var(--site-rule)] py-7 last:border-b-0 sm:grid-cols-2 sm:gap-9 sm:py-10"
              : `grid min-w-0 grid-cols-1 items-center gap-5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-8 ${index === 1 ? "sm:mt-12" : ""}`}`}>
            <div className={`story-couple__portrait relative mx-auto w-full overflow-hidden bg-[var(--site-primary)]/20 ${isTwoColumns ? "aspect-[4/5] max-w-[340px] rounded-[1.1rem]" : isEditorial ? "aspect-[4/5] max-w-[560px] rounded-sm" : "aspect-[4/5] max-w-[460px] rounded-[1.4rem]"} ${reverseOnDesktop ? "sm:order-2" : ""}`}>
              {photoUrl && !photoFailed
                ? <img loading="lazy" decoding="async" className="story-couple__image absolute inset-0 size-full object-cover" src={photoUrl} alt={`Chân dung ${name}`} onError={() => setFailedProfilePhotos(current => ({ ...current, [key]: photoUrl }))} />
                : <div role="img" aria-label={`${photoFailed ? "Không tải được ảnh" : "Chưa có ảnh chân dung"} ${name}`} className="story-couple__fallback grid size-full place-items-center border border-[var(--site-accent)]/20">
                  <span aria-hidden="true" className="font-serif text-6xl tracking-wide text-[var(--site-accent)]/75 sm:text-7xl" style={{ fontFamily: "var(--site-heading)" }}>{personInitials(name)}</span>
                </div>}
              {isEditorial && <span aria-hidden="true" className="absolute bottom-3 left-3 border border-white/70 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white">{key === "groom" ? "Chú rể" : "Cô dâu"}</span>}
            </div>
            <div className={`min-w-0 ${isTwoColumns ? "w-full pt-5" : "py-2 sm:py-5"} ${reverseOnDesktop ? "sm:order-1" : ""}`}>
              {!isEditorial && <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--site-accent)]">{key === "groom" ? "Chú rể" : "Cô dâu"}</p>}
              <InlineText tag="h3" editable={editable} value={name} onSave={value => onInlineEdit?.(section.id, key, { ...person, displayName: value })} presencePath={builderFieldPath(section.id, "couple", key, "displayName")} className={`mt-2 break-words font-serif ${isTwoColumns ? "text-3xl sm:text-4xl" : "text-3xl sm:text-4xl md:text-5xl"}`} style={{ fontFamily: "var(--site-heading)" }} />
              {text(person.bio) && <p className={`mt-3 whitespace-pre-line leading-7 opacity-80 ${isTwoColumns ? "mx-auto max-w-prose" : "max-w-prose"}`}>{text(person.bio)}</p>}
              {(text(person.fatherName) || text(person.motherName)) && <p className="mt-4 border-t border-[var(--site-rule)] pt-3 text-sm leading-6 opacity-70">{text(person.fatherName) && <>Cha: {text(person.fatherName)}</>}{text(person.fatherName) && text(person.motherName) ? " · " : ""}{text(person.motherName) && <>Mẹ: {text(person.motherName)}</>}</p>}
              {(facebook || instagram) && <div className={`mt-4 flex flex-wrap gap-2 ${isTwoColumns ? "justify-center" : ""}`} aria-label={`Liên kết mạng xã hội của ${name}`}>
                {facebook && <a href={facebook} target="_blank" rel="noopener noreferrer" aria-label={`Facebook của ${name}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--site-rule)] px-3 text-xs transition-colors hover:bg-[var(--site-primary)]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)]"><Facebook className="size-4" aria-hidden="true" />Facebook</a>}
                {instagram && <a href={instagram} target="_blank" rel="noopener noreferrer" aria-label={`Instagram của ${name}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--site-rule)] px-3 text-xs transition-colors hover:bg-[var(--site-primary)]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)]"><Instagram className="size-4" aria-hidden="true" />Instagram</a>}
              </div>}
            </div>
          </article>;
        })}
        {section.variant === "two-columns" && couple.length === 2 && <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[46%] z-[1] hidden size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[var(--site-rule)] bg-[var(--site-background)] font-serif text-xl text-[var(--site-accent)] sm:grid">&amp;</span>}
        {!couple.length && <p className="text-sm opacity-65">Thêm tên và thông tin hai bạn trong phần chỉnh sửa.</p>}
      </div>;
      break;
    }
    case "countdown":
      body = <div className={`story-countdown story-countdown--${section.variant}`}>
        {content.targetDate ? <Countdown target={text(content.targetDate)} timeZoneId={text(content.timeZoneId)} variant={section.variant} showSeconds={content.showSeconds === true} completedMessage={text(content.completedMessage)} /> : <p className="mt-4 rounded-xl border border-dashed border-[var(--site-rule)] px-4 py-5 text-center text-sm opacity-65">Chưa có ngày tổ chức.</p>}
      </div>;
      break;
    case "loveStory": {
      const moments = array(content.items);
      const photoJournal = section.variant === "photo-journal";
      body = <ol aria-label="Các dấu mốc chuyện tình" className={`story-timeline story-timeline--${section.variant} relative grid ${photoJournal ? "gap-8 sm:gap-12" : `gap-5 ${section.variant === "editorial" ? "md:grid-cols-2 md:gap-8" : "pl-6 sm:pl-9"}`}`}>
        {section.variant === "timeline" && <span aria-hidden="true" className="absolute bottom-4 left-[7px] top-2 w-px bg-[var(--site-accent)]/35 sm:left-[11px]" />}
        {moments.map((item, index) => {
          const momentId = text(item.id) || String(index);
          const title = text(item.title);
          const imageUrl = text(item.imageUrl);
          const image = imageUrl ? <img loading="lazy" decoding="async" src={imageUrl} alt={title} className={`w-full object-cover ${photoJournal ? `aspect-[4/3] ${index === 0 ? "md:aspect-[5/4]" : ""}` : section.variant === "editorial" ? "mb-5 aspect-[4/3]" : "aspect-square max-h-56 rounded-xl sm:max-h-none"}`} /> : null;
          return <li id={`story-moment-${section.id}-${momentId}`} key={momentId} tabIndex={editable ? -1 : undefined} data-story-moment-index={index} className={`story-moment relative min-w-0 ${photoJournal ? `grid gap-5 border-b border-[var(--site-rule)]/80 pb-8 sm:gap-8 md:items-center md:gap-12 ${imageUrl ? "md:grid-cols-2" : ""}` : section.variant === "editorial" ? "overflow-hidden border-t border-[var(--site-rule)] pt-5" : "grid gap-4 border-t border-[var(--site-rule)] py-5 sm:grid-cols-[120px_1fr]"}`}>
            {section.variant === "timeline" && <span aria-hidden="true" className="absolute -left-[25px] top-7 size-3 rounded-full border-2 border-[var(--site-background)] bg-[var(--site-accent)] sm:-left-[35px]" />}
            {image && <div className={`story-moment__image min-w-0 overflow-hidden ${photoJournal && index % 2 === 1 ? "md:order-2" : ""} ${photoJournal ? "bg-[var(--site-primary)]/10" : ""}`}>{image}</div>}
            <div className={`story-moment__copy min-w-0 ${section.variant === "editorial" ? "pb-4" : ""} ${photoJournal && index % 2 === 1 ? "md:order-1" : ""} ${photoJournal && index === 0 ? "md:py-8" : ""}`}>
              <p className={`text-xs uppercase tracking-[0.16em] text-[var(--site-accent)] ${photoJournal ? "font-medium tracking-[0.2em]" : ""}`}>{text(item.date) || String(index + 1).padStart(2, "0")}</p>
              <InlineText tag="h3" editable={editable} value={title} onSave={value => onInlineEdit?.(section.id, "items", moments.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: value } : entry))} presencePath={builderFieldPath(section.id, "loveStory", "items", momentId, "title")} className={`mt-2 font-serif ${section.variant === "editorial" || photoJournal ? "text-3xl sm:text-4xl" : "text-2xl"} ${photoJournal && index === 0 ? "md:text-5xl" : ""}`} style={{ fontFamily: "var(--site-heading)" }} />
              <InlineText tag="p" editable={editable} value={text(item.body)} onSave={value => onInlineEdit?.(section.id, "items", moments.map((entry, itemIndex) => itemIndex === index ? { ...entry, body: value } : entry))} presencePath={builderFieldPath(section.id, "loveStory", "items", momentId, "body")} className={`mt-3 whitespace-pre-line leading-7 opacity-80 ${photoJournal ? "max-w-prose text-base sm:leading-8" : ""}`} />
            </div>
          </li>;
        })}
        {!moments.length && <li className="text-sm opacity-65">Thêm những dấu mốc hai bạn muốn chia sẻ.</li>}
      </ol>;
      break;
    }
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
        images={array(content.images).map((image, index) => { const alt = text(image.alt); return { id: text(image.id) || `gallery-${index}`, imageUrl: text(image.imageUrl), alt: isImageFilename(alt) ? undefined : alt || undefined, caption: text(image.caption) || undefined }; }).filter(image => image.imageUrl)}
        variant={section.variant}
        enabled={!editable && Boolean(slug)}
        sectionId={section.id}
        title={text(content.title)}
        intro={text(content.intro)}
      />;
      break;
    case "rsvp":
      body = <StoryRsvp label={text(content.submitLabel) || undefined} />;
      break;
    case "wishes":
      body = <StoryWishes slug={slug} variant={section.variant === "fountain" ? "fountain" : "default"} displayLimit={typeof content.displayLimit === "number" ? content.displayLimit : 3} allowLikes={content.allowLikes === true} allowComments={content.allowComments === true} />;
      break;
    case "gift": {
      const giftData = record(gift);
      const selectedAccounts = array(giftData.selectedAccounts);
      const publishedAccounts = array(giftData.publicAccounts) as GiftAccountCard[];
      const managedAccounts: GiftAccountCard[] = selectedAccounts.map(selection => {
        const role = text(selection.role) === "bride" ? "bride" : "groom";
        const accountId = text(selection.accountId);
        const account = giftAccounts?.find(item => item.id === accountId);
        const published = publishedAccounts.find(item => item.role === role);
        return account
          ? { ...account, role, displayLabel: text(giftData[`${role}Label`]) || account.label || (role === "bride" ? "Cô dâu" : "Chú rể") }
          : published
            ? { ...published, role, displayLabel: text(giftData[`${role}Label`]) || published.displayLabel }
            : { role, displayLabel: text(giftData[`${role}Label`]) || (role === "bride" ? "Cô dâu" : "Chú rể") } as GiftAccountCard;
      });
      const cards: GiftAccountCard[] = selectedAccounts.length > 0 ? managedAccounts : giftData.accountsManaged === true ? publishedAccounts : publishedAccounts.length > 0 ? publishedAccounts : (["groom", "bride"] as const).map(role => ({
        role,
        displayLabel: text(giftData[`${role}Label`]) || (role === "bride" ? "Cô dâu" : "Chú rể"),
        bankName: text(giftData[`${role}Bank`]), accountName: text(giftData[`${role}Holder`]), accountNumber: text(giftData[`${role}Account`]), label: null,
      })).filter(account => account.bankName || account.accountName || account.accountNumber);
      async function copyAccount(accountNumber: string, role: string) {
        if (!accountNumber) return;
        setCopyError("");
        try { await navigator.clipboard.writeText(accountNumber); setCopiedRole(role); }
        catch { setCopyError("Không thể sao chép tự động. Bạn có thể bôi đen số tài khoản để sao chép."); }
      }
      const activeGiftAccount = activeGiftRole ? cards.find(account => account.role === activeGiftRole) : undefined;
      const qrImageUrl = activeGiftAccount ? vietQrAccountImageUrl(activeGiftAccount) : null;
      body = <>
        <div className="story-gift">
        {giftData.enabled ? cards.length > 0 ? <div className={`grid gap-4 ${cards.length === 1 ? "mx-auto max-w-xl" : "sm:grid-cols-2"}`}>
          {cards.map((account, index) => {
            const role = account.role ?? (index === 1 ? "bride" : "groom");
            const roleName = role === "bride" ? "Cô dâu" : "Chú rể";
            return <button type="button" key={`${role}-${index}`} onClick={() => { setActiveGiftRole(role); setGiftQrFailed(false); setCopyError(""); }} aria-label={`Mở mã QR mừng cưới ${roleName.toLocaleLowerCase()}`} className={`group relative isolate flex min-h-44 w-full items-center gap-5 overflow-hidden rounded-[1.6rem] border border-[var(--site-accent)]/20 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--site-primary)_30%,var(--site-background)),var(--site-background)_72%)] p-5 text-left shadow-[0_12px_35px_color-mix(in_srgb,var(--site-accent)_8%,transparent)] transition duration-300 hover:-translate-y-1 hover:border-[var(--site-accent)]/45 hover:shadow-[0_18px_42px_color-mix(in_srgb,var(--site-accent)_14%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--site-accent)] motion-reduce:transform-none sm:p-7`}>
              <span aria-hidden="true" className="relative grid size-[4.5rem] shrink-0 place-items-center rounded-[1.3rem] border border-[var(--site-accent)]/20 bg-[var(--site-background)]/85 text-[var(--site-accent)] shadow-sm transition-transform duration-300 group-hover:rotate-[-4deg] group-hover:scale-105 motion-reduce:transform-none sm:size-20"><Gift className="size-8 sm:size-9" /><span className="absolute -right-1 -top-1 size-3 rounded-full bg-[var(--site-primary)] ring-2 ring-[var(--site-background)]" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--site-accent)]">Hộp quà · {roleName}</span><span className="mt-1 block truncate font-serif text-2xl" style={{ fontFamily: "var(--site-heading)" }}>{account.displayLabel || roleName}</span>{account.bankName && <span className="mt-1 block truncate text-sm opacity-70">{account.bankName}{account.accountName ? ` · ${account.accountName}` : ""}</span>}<span className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--site-accent)]/25 bg-[var(--site-background)]/80 px-3 text-xs font-medium text-[var(--site-accent)] transition group-hover:bg-[var(--site-primary)]/20">Mở hộp xem QR <span aria-hidden="true">→</span></span></span>
              <span aria-hidden="true" className="pointer-events-none absolute -bottom-10 -right-6 -z-10 size-32 rounded-full border border-[var(--site-accent)]/10" />
            </button>;
          })}
        </div> : <p className="rounded-xl border border-dashed border-[var(--site-rule)] p-5 text-sm opacity-70">Thông tin tài khoản mừng cưới chưa được cấu hình hoặc tài khoản đã bị gỡ.</p> : <p className="text-sm opacity-65">Thông tin mừng cưới chưa được bật.</p>}
        </div>
        {activeGiftAccount && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setActiveGiftRole(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby={`gift-qr-title-${section.id}`} className="relative max-h-[94dvh] w-full overflow-y-auto rounded-t-[1.7rem] border border-[var(--site-rule)] bg-[var(--site-background)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 text-[var(--site-text)] shadow-2xl sm:max-h-[90dvh] sm:max-w-md sm:rounded-[1.7rem] sm:p-7" onMouseDown={event => event.stopPropagation()}>
            <button type="button" aria-label="Đóng mã QR" className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-[var(--site-rule)] bg-[var(--site-background)]/80 transition hover:bg-[var(--site-primary)]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--site-accent)]" onClick={() => setActiveGiftRole(null)}><X className="size-4" /></button>
            <div className="pr-12"><p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--site-accent)]">Mừng cưới · {activeGiftAccount.role === "bride" ? "Cô dâu" : "Chú rể"}</p><h3 id={`gift-qr-title-${section.id}`} className="mt-2 font-serif text-2xl" style={{ fontFamily: "var(--site-heading)" }}>{activeGiftAccount.displayLabel || (activeGiftAccount.role === "bride" ? "Cô dâu" : "Chú rể")}</h3></div>
            {qrImageUrl && !giftQrFailed ? <div className="mx-auto mt-5 grid w-full max-w-[280px] place-items-center rounded-2xl border border-[var(--site-rule)] bg-white p-3 shadow-sm"><img src={qrImageUrl} alt={`Mã QR chuyển khoản ${activeGiftAccount.displayLabel || "mừng cưới"}`} className="aspect-square w-full object-contain" onError={() => setGiftQrFailed(true)} /></div> : <div role="status" className="mt-5 rounded-xl border border-dashed border-[var(--site-rule)] bg-[var(--site-primary)]/10 p-5 text-center text-sm leading-6 opacity-80">{giftQrFailed ? "Chưa tải được mã QR. Bạn vẫn có thể sao chép thông tin tài khoản bên dưới." : "Tài khoản cũ chưa có mã ngân hàng để tạo QR. Hãy chọn tài khoản trong mục Quà mừng để bật mã QR."}</div>}
            <div className="mt-5 space-y-1 text-center"><p className="font-medium">{activeGiftAccount.bankName || "Tài khoản ngân hàng"}</p><p className="text-sm opacity-75">{activeGiftAccount.accountName}</p><p className="break-all font-mono text-sm tracking-wide">{activeGiftAccount.accountNumber}</p></div>
            <button type="button" className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--site-accent)] px-4 text-sm font-medium text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-accent)]" onClick={() => void copyAccount(activeGiftAccount.accountNumber, activeGiftAccount.role ?? "gift") }><Copy className="size-4" />{copiedRole === (activeGiftAccount.role ?? "gift") ? "Đã sao chép số tài khoản" : "Sao chép số tài khoản"}</button>
            {copyError && <p role="status" className="mt-2 text-center text-sm text-[var(--site-accent)]">{copyError}</p>}
            <p className="mt-4 text-center text-xs leading-5 opacity-65">Mã QR dùng để chuyển khoản. Website công khai không tự ghi nhận trạng thái giao dịch.</p>
          </section>
        </div>, document.body)}
      </>;
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

export function StoryBuilderV4Renderer({ document, slug, pagePath, showHidden = false, editable = false, showGuestExperiencePreview = false, giftAccounts, selectedSectionId, onInlineEdit, onSelectSection, onNavigatePage }: Props) {
  const motionRoot = useRef<HTMLDivElement>(null);
  const mobilePagesId = useId();
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [mobilePagesFor, setMobilePagesFor] = useState<string | null>(null);
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
  const mobilePagesOpen = mobilePagesFor === page?.id;
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
  // In the builder's guest-experience mode, keep the actual guest utility bar
  // interactive so the owner can verify its navigation and gift QR flow.
  const showGuestTools = (Boolean(slug) && !editable || showGuestExperiencePreview) && guestTools.length > 0;
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
  const groomName = document.content.groom?.displayName || document.content.groom?.fullName || "";
  const brideName = document.content.bride?.displayName || document.content.bride?.fullName || "";
  const coupleName = [groomName, brideName].filter(Boolean).join(" & ") || "Ngày vui";
  const coupleMonogram = groomName && brideName ? `${personInitials(groomName)}·${personInitials(brideName)}` : "♡";
  const renderPageItem = (item: typeof visiblePages[number], mobile = false) => {
    const active = item.id === page.id;
    const label = item.navigationLabel || item.title;
    const href = item.isHome ? `/wedding/${encodeURIComponent(slug ?? "")}` : `/wedding/${encodeURIComponent(slug ?? "")}/${item.slug}`;
    const className = mobile
      ? `flex min-h-11 w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors ${active ? "bg-[var(--site-primary)]/20 font-medium text-[var(--site-accent)]" : "hover:bg-[var(--site-primary)]/10"}`
      : `rounded-full px-4 py-2 text-sm transition-colors ${active ? "bg-[var(--site-primary)]/25 font-medium text-[var(--site-accent)] shadow-sm" : "opacity-75 hover:bg-[var(--site-primary)]/10 hover:opacity-100"}`;
    const onSelect = () => {
      setMobilePagesFor(null);
      onNavigatePage?.(item.slug);
    };
    if (onNavigatePage) return <button key={item.id} type="button" className={className} aria-current={active ? "page" : undefined} onClick={onSelect}>{label}{mobile && active ? <span className="text-xs">Đang xem</span> : null}</button>;
    if (slug) return <Link key={item.id} href={href} className={className} aria-current={active ? "page" : undefined} onClick={() => setMobilePagesFor(null)}>{label}{mobile && active ? <span className="text-xs">Đang xem</span> : null}</Link>;
    return <span key={item.id} className={mobile ? `${className} cursor-default` : className} aria-current={active ? "page" : undefined}>{label}{mobile && active ? <span className="text-xs">Đang xem</span> : null}</span>;
  };
  return <div ref={motionRoot} style={style} data-design-family={family} data-motion-mode={document.appearance.motion ?? "template"} className={`template-canvas relative min-h-full ${showGuestTools ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-0" : ""}`}>
    {showDecoration && <GuestDecoration effect={guestExperience.decoration} intensity={guestExperience.intensity} fixed={Boolean(slug)} />}
    {visiblePages.length > 1 && <nav aria-label="Các trang website cưới" className="sticky top-0 z-10 border-b border-[var(--site-rule)] bg-[var(--site-background)]/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-14 max-w-[1440px] items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-10">
        <div className="hidden min-w-0 flex-1 items-center gap-2.5 md:flex">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--site-rule)] bg-[var(--site-primary)]/15 font-serif text-xs text-[var(--site-accent)]">{coupleMonogram}</span>
          <span className="max-w-56 truncate text-sm font-medium tracking-wide">{coupleName}</span>
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-center overflow-x-auto md:flex">
          <div className="flex w-max items-center gap-1 whitespace-nowrap rounded-full border border-[var(--site-rule)] bg-[var(--site-background)]/60 p-1">
            {visiblePages.map(item => renderPageItem(item))}
          </div>
        </div>
        <div aria-hidden="true" className="hidden flex-1 md:block" />
        <div className="flex w-full min-w-0 items-center justify-between gap-3 md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--site-rule)] bg-[var(--site-primary)]/15 font-serif text-[10px] text-[var(--site-accent)]">{coupleMonogram}</span>
            <span className="max-w-[42vw] truncate text-xs font-medium">{coupleName}</span>
          </div>
          <button type="button" aria-expanded={mobilePagesOpen} aria-controls={mobilePagesId} onClick={() => setMobilePagesFor(open => open === page.id ? null : page.id)} className="inline-flex min-h-10 max-w-[58%] shrink-0 items-center gap-2 rounded-full border border-[var(--site-rule)] bg-[var(--site-background)]/70 px-3.5 text-sm font-medium text-[var(--site-accent)] transition-colors hover:bg-[var(--site-primary)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-accent)]">
            <span className="truncate">{page?.navigationLabel || page?.title || "Chọn trang"}</span>
            <ChevronDown className={`size-4 shrink-0 transition-transform ${mobilePagesOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </div>
      {mobilePagesOpen && <div id={mobilePagesId} onKeyDown={event => { if (event.key === "Escape") setMobilePagesFor(null); }} className="absolute inset-x-0 top-full max-h-[min(65vh,28rem)] overflow-y-auto border-b border-[var(--site-rule)] bg-[var(--site-background)] px-4 py-3 shadow-lg md:hidden">
        <div className="mx-auto grid max-w-lg gap-1 rounded-2xl border border-[var(--site-rule)] bg-[var(--site-background)] p-2 shadow-lg">
          {visiblePages.map(item => renderPageItem(item, true))}
        </div>
      </div>}
    </nav>}
    <main className="relative z-[1]">
      {page.sections.map((section, index) => <SectionView key={section.id} section={section} family={family} sectionIndex={index} slug={slug} ctaTarget={ctaTarget} ctaLabel={ctaLabel} showHidden={showHidden} gift={document.content.gift} giftAccounts={giftAccounts} editable={editable} selected={selectedSectionId === section.id} onInlineEdit={onInlineEdit} onSelectSection={onSelectSection} />)}
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
