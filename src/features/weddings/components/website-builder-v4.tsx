"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useId, useSyncExternalStore, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp, Copy, Eye, EyeOff, Globe, GripVertical, History, Image as ImageIcon, Languages, LoaderCircle, Menu, Monitor, MoreHorizontal, Plus, Redo2, RefreshCw, Save, Search, Smartphone, Sparkles, Tablet, Trash2, Undo2, Upload, UserRound, UsersRound, X } from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { ApiError } from "@/core/api/api-error";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { useLanguage, useLocale } from "@/i18n/language-context";
// eslint-disable-next-line architecture/boundaries -- Template access uses the shared wedding plan entitlement contract.
import { FeatureLimitNotice, useWeddingPlan } from "@/features/plans";
import { applyStoryBuilderV4Template, createStoryBuilderV4Document, createV4Section, isStoryBuilderV4Document, summarizeStoryBuilderV4TemplateChange } from "../schemas/story-builder-v4.document";
import { describeV4Issue, describeV4ValidationIssues, isImageFilename, moveV4Page } from "../schemas/story-builder-v4.helpers";
import { storyBuilderV4DocumentSchema, storyTemplateConfigSchema, type StoryBuilderV4Document, type StoryBuilderV4Section, type StorySectionType, type StoryTemplateSummaryV4 } from "../schemas/story-builder-v4.schema";
import type { Website } from "../api/website.api";
import { createWeddingEvent, deleteWeddingEvent, deleteWeddingMedia, getWebsite, getWebsiteVersion, listStoryTemplates, listWeddingEvents, listWeddingMedia, listWebsiteVersions, mediaUrl, publishWebsite, restoreWebsiteVersion, saveWebsite, updateWeddingEvent, unpublishWebsite, uploadWeddingMedia, type WebsiteVersion, type WeddingEvent, type WeddingEventInput } from "../api/website.api";
import { isoToLocalDateTime, localDateTimeToIso, type WeddingSetup } from "../schemas/wedding.schema";
import { StoryBuilderV4Renderer } from "./story-builder-v4-renderer";
// eslint-disable-next-line architecture/boundaries -- Website gift inspector reuses the wedding's existing gift-account API and DTO.
import { getGiftAccounts, type GiftBankAccount } from "@/features/gifts";
import { mergeStoryDocuments, resolveStoryMergeConflict, type StoryMergeConflict } from "../schemas/story-builder-v4-collaboration";
import { applyStoryHistoryOperation, type StoryHistoryOperation } from "../schemas/story-builder-v4-collaboration";
import type { BuilderPresence } from "@/core/realtime/signalr-client";
import { clearWebsiteBuilderRecovery, readWebsiteBuilderRecovery, writeWebsiteBuilderRecovery } from "../schemas/website-builder-recovery";

type BuilderProps = { weddingId: string; site: Website; setup: WeddingSetup };
type Viewport = "desktop" | "tablet" | "mobile";
type SectionType = StorySectionType;
type BuilderIssue = { path: readonly PropertyKey[]; message: string };
type GuestTool = "rsvp" | "calendar" | "gift" | "wishes" | "share";
type GuestExperienceSettings = { tools: GuestTool[]; decoration: "none" | "petals" | "sparkles" | "hearts" | "fireflies"; intensity: "light" | "medium" | "vivid" };
function validateBuilderDocument(document: StoryBuilderV4Document, template: StoryTemplateSummaryV4 | undefined, t: (key: string) => string): BuilderIssue[] {
  const parsed = storyBuilderV4DocumentSchema.safeParse(document);
  if (!parsed.success) return parsed.error.issues;
  if (!template) return [];
  const issues: BuilderIssue[] = [];
  if (document.appearance.paletteId && !template.config.palettes.some(palette => palette.id === document.appearance.paletteId))
    issues.push({ path: ["appearance", "paletteId"], message: t("builderV4.errors.paletteNotInTemplate") });
  if (document.appearance.fontHeading && !template.config.allowedFonts.includes(document.appearance.fontHeading))
    issues.push({ path: ["appearance", "fontHeading"], message: t("builderV4.errors.headingFontNotSupported") });
  if (document.appearance.fontBody && !template.config.allowedFonts.includes(document.appearance.fontBody))
    issues.push({ path: ["appearance", "fontBody"], message: t("builderV4.errors.bodyFontNotSupported") });
  return issues;
}
const sectionNames: Record<SectionType, string> = { hero: "Ảnh bìa", couple: "Cặp đôi", countdown: "Đếm ngược", loveStory: "Chuyện tình", events: "Sự kiện", weddingParty: "Phù dâu & phù rể", gallery: "Album ảnh", rsvp: "Xác nhận tham dự", wishes: "Lời chúc", gift: "Mừng cưới" };
const presenceFieldNames: Record<string, string> = {
  title: "Tiêu đề", subtitle: "Lời dẫn", intro: "Giới thiệu", description: "Mô tả", image: "Ảnh",
  eyebrow: "Dòng nhấn", ctaLabel: "Nhãn nút", submitLabel: "Nhãn nút gửi", displayName: "Tên hiển thị",
  bio: "Lời giới thiệu", fatherName: "Tên cha", motherName: "Tên mẹ", targetDate: "Ngày giờ mục tiêu", x: "Ngang", y: "Dọc",
  date: "Ngày hoặc dấu mốc", startsAt: "Ngày giờ", venueName: "Địa điểm", address: "Địa chỉ",
  mapUrl: "Liên kết bản đồ", imageUrl: "Ảnh", photoUrl: "Ảnh chân dung", alt: "Mô tả ảnh", caption: "Chú thích ảnh",
  name: "Họ tên", role: "Vai trò", navigationLabel: "Tiêu đề điều hướng", slug: "Đường dẫn",
  paletteId: "Bảng màu", fontHeading: "Phông tiêu đề", fontBody: "Phông nội dung", tools: "Tiện ích khách mời",
  decoration: "Hiệu ứng trang trí", intensity: "Mức độ hiệu ứng", animation: "Hiệu ứng chuyển động", background: "Nền phần",
};
const builderFieldTranslationKeys: Record<string, string> = {
  "Tiêu đề": "title", "Tiêu đề lớn": "largeTitle", "Lời dẫn": "subtitle", "Giới thiệu": "intro", "Mô tả": "description", "Câu chuyện": "story",
  "Ảnh": "image", "Ảnh bìa": "coverImage", "Ảnh bìa website": "websiteCover", "Ảnh từ Wedding Setup": "setupCover", "Ảnh riêng": "customImage", "Ảnh album": "albumImage", "Ảnh chân dung": "portrait", "Ảnh thành viên": "memberImage", "Ảnh dấu mốc": "milestoneImage",
  "Dòng nhấn": "eyebrow", "Nhãn nút": "buttonLabel", "Nhãn nút chính": "primaryButtonLabel", "Nhãn nút gửi": "submitButtonLabel", "Tên hiển thị": "displayName", "Lời giới thiệu": "bio", "Tên cha": "fatherName", "Tên mẹ": "motherName", "Ngày giờ mục tiêu": "targetDate", "Ngày hoặc dấu mốc": "dateOrMilestone", "Ngày giờ": "dateTime", "Địa điểm": "venue", "Tên sự kiện": "eventName", "Địa chỉ": "address", "Link bản đồ HTTPS": "mapLink", "Giới thiệu album": "galleryIntro",
  "Liên kết bản đồ": "mapLink", "Liên kết ảnh": "imageUrl", "Văn bản mô tả ảnh": "imageAlt", "Mô tả ảnh": "imageAlt", "Mô tả ảnh cho trình đọc màn hình": "screenReaderImageDescription", "Chú thích ảnh": "imageCaption", "Chú thích hiển thị dưới ảnh (không bắt buộc)": "optionalImageCaption", "Họ tên": "fullName", "Vai trò": "role", "Tiêu đề điều hướng": "navigationTitle", "Đường dẫn": "urlSlug", "Bảng màu": "palette", "Phông tiêu đề": "headingFont", "Phông nội dung": "bodyFont", "Tiện ích khách mời": "guestTools", "Hiệu ứng trang trí": "decoration", "Mức độ hiệu ứng": "effectIntensity", "Hiệu ứng chuyển động": "motion", "Nền phần": "sectionBackground", "Khoảng cách": "spacing", "Lớp phủ ảnh": "imageOverlay", "Điểm lấy nét": "focusPoint", "Ngang": "horizontal", "Dọc": "vertical", "Nội dung": "content", "Ảnh trình chiếu": "slideshow", "Tên trang": "pageName", "Nhãn hiển thị": "displayLabel", "Số tài khoản": "accountNumber", "Chủ tài khoản": "accountHolder", "Ngân hàng": "bank", "Ngân hàng chú rể": "groomBank", "Chủ tài khoản chú rể": "groomAccountHolder", "Số tài khoản chú rể": "groomAccountNumber", "Ngân hàng cô dâu": "brideBank", "Chủ tài khoản cô dâu": "brideAccountHolder", "Số tài khoản cô dâu": "brideAccountNumber"
};
const builderPlaceholderTranslationKeys: Record<string, string> = {
  "Tên hai bạn hoặc tên đám cưới": "coupleNames", "Lời mời ngắn": "shortInvitation", "Ví dụ: Xem lịch trình": "viewSchedule", "Dán liên kết ảnh hoặc tải từ thiết bị": "imageUrlOrUpload", "Ví dụ: Cô dâu và chú rể trong bộ ảnh cưới": "coupleCoverAlt", "Ví dụ: Cô dâu và chú rể trong vườn hoa": "coupleInGarden", "Ví dụ: Ngày đầu tiên cùng nhau": "firstDayTogether", "Ví dụ: Ngày đầu gặp nhau": "firstMeeting", "Ví dụ: Tháng 6, 2022": "monthYear", "Kể ngắn gọn điều hai bạn muốn lưu lại…": "storyPrompt", "Lễ gia tiên, tiệc cưới…": "eventExamples", "Bạn thân chú rể": "groomFriend", "Bạn thân cô dâu": "brideFriend", "Mặc định: Hôm nay là ngày vui của chúng mình!": "defaultWeddingDayMessage", "Dán liên kết ảnh": "pasteImageUrl", "Tên chú rể": "groomName", "Tên cô dâu": "brideName", "Sở thích, tính cách hoặc một điều muốn chia sẻ…": "coupleBio", "Ví dụ: Chúng mình rất mong được gặp bạn.": "eventIntroduction"
};
const presenceFieldLabel = (fieldPath: string | null, t: (key: string, options?: { defaultValue?: string; name?: string }) => string) => {
  const parts = fieldPath?.split(".") ?? [];
  const key = parts.at(-1);
  if (!key) return null;
  const label = t(`builderV4.collaboration.fieldNames.${key}`, { defaultValue: presenceFieldNames[key] ?? "Content" });
  if (parts.includes("couple")) return `${label} · ${t(`builderV4.collaboration.fieldSuffix.${parts.includes("bride") ? "bride" : "groom"}`)}`;
  if (parts.includes("loveStory") && parts.includes("items")) return `${label} · ${t("builderV4.collaboration.fieldSuffix.moment")}`;
  if (parts.includes("gallery") && parts.includes("images")) return `${label} · ${t("builderV4.collaboration.fieldSuffix.album")}`;
  if (parts.includes("weddingParty") && (parts.includes("groom") || parts.includes("bride"))) return `${label} · ${t(`builderV4.collaboration.fieldSuffix.${parts.includes("bride") ? "bridesmaid" : "groomsman"}`)}`;
  if (parts.includes("events")) return `${label} · ${t("builderV4.collaboration.fieldSuffix.event")}`;
  return label;
};
const builderFieldPath = (...parts: (string | number)[]) => parts
  .map(part => String(part).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""))
  .filter(Boolean).join(".").slice(0, 160);
const canonicalBuilderFieldPath = (path: string) => path.split(".").filter(part => part && part !== "content")
  .map((part, index, parts) => part === "event" && parts[index - 1] === "events" ? "events" : part).join(".");
const templateCategoryLabels: Record<string, string> = { garden: "Vườn hoa", editorial: "Tạp chí", traditional: "Truyền thống", minimal: "Tối giản", outdoor: "Ngoài trời", royal: "Dạ tiệc", romantic: "Lãng mạn" };
const sectionTypes = Object.keys(sectionNames) as SectionType[];
const setupBindings: Partial<Record<SectionType, Array<{ target: string; source: string; label: string }>>> = {
  hero: [{ target: "heroImageUrl", source: "wedding.coverImageUrl", label: "Ảnh bìa" }],
  events: [
    { target: "mainEvent.startsAt", source: "wedding.mainEventAt", label: "Ngày giờ sự kiện" },
    { target: "mainEvent.timeZoneId", source: "wedding.timeZoneId", label: "Múi giờ sự kiện" },
    { target: "mainEvent.venueName", source: "wedding.venueName", label: "Tên địa điểm" },
    { target: "mainEvent.address", source: "wedding.venueAddress", label: "Địa chỉ" },
  ],
  countdown: [{ target: "countdown.targetDate", source: "wedding.mainEventAt", label: "Ngày đếm ngược" }],
};
const id = () => globalThis.crypto?.randomUUID?.() ?? `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const clone = (value: StoryBuilderV4Document) => structuredClone(value);
const sameDocument = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const conflictLocation = (path: string[], document: StoryBuilderV4Document, t: (key: string, options?: Record<string, unknown>) => string) => {
  const pageMarkerIndex = path.findIndex((part, index) => part === "pages" && path[index + 1]?.startsWith("@"));
  const pageId = pageMarkerIndex >= 0 ? path[pageMarkerIndex + 1]?.slice(1) : undefined;
  const page = document.pages.find(item => item.id === pageId);
  const sectionMarkerIndex = path.findIndex((part, index) => part === "sections" && path[index + 1]?.startsWith("@"));
  const sectionId = sectionMarkerIndex >= 0 ? path[sectionMarkerIndex + 1]?.slice(1) : undefined;
  const section = page?.sections.find(item => item.id === sectionId);
  const orderConflict = path.at(-1) === "$order";
  const markerSearchFrom = sectionMarkerIndex >= 0 ? sectionMarkerIndex + 2 : pageMarkerIndex >= 0 ? pageMarkerIndex + 2 : 0;
  const markerIndex = path.findIndex((part, index) => index >= markerSearchFrom && part.startsWith("@"));
  const markerId = markerIndex >= 0 ? path[markerIndex]?.slice(1) : undefined;
  const arrayPath = markerIndex >= 0 ? path.slice(0, markerIndex) : [];
  let arrayValue: unknown = document;
  for (const part of arrayPath) {
    if (part.startsWith("@")) arrayValue = Array.isArray(arrayValue) ? arrayValue.find(item => record(item).id === part.slice(1)) : undefined;
    else arrayValue = record(arrayValue)[part];
  }
  const arrayItems = Array.isArray(arrayValue) ? arrayValue : [];
  const itemIndex = arrayItems.findIndex(item => record(item).id === markerId);
  const item = itemIndex >= 0 ? record(arrayItems[itemIndex]) : {};
  const itemName = [item.title, item.name, item.displayName, item.date].find(value => typeof value === "string" && value.trim());
  const itemLabel = markerIndex >= 0
    ? typeof itemName === "string" ? `“${itemName.slice(0, 54)}”` : t("builderV4.banners.itemLabel", { number: itemIndex >= 0 ? itemIndex + 1 : t("builderV4.banners.changedItem") })
    : undefined;
  const tail = sectionMarkerIndex >= 0 ? path.slice(sectionMarkerIndex + 2) : pageMarkerIndex >= 0 ? path.slice(pageMarkerIndex + 2) : path;
  const fieldKey = orderConflict ? "$order" : [...tail].reverse().find(part => part !== "content" && !part.startsWith("@"));
  const fieldLabel = fieldKey === "$order" ? t("builderV4.banners.orderLabel") : fieldKey ? t(`builderV4.collaboration.fieldNames.${fieldKey}`, { defaultValue: t("builderV4.inspector.content") }) : t("builderV4.banners.structureLabel");
  const sectionLabel = section ? t(`builderV4.sectionNames.${section.type}`) : undefined;
  const location = [page?.title, sectionLabel, itemLabel, fieldLabel].filter(Boolean).join(" · ");
  return { pageId, sectionId, label: location || t("builderV4.banners.websiteContent") };
};
const conflictValuePreview = (exists: boolean, value: unknown, path: string[], document: StoryBuilderV4Document, t: (key: string, options?: Record<string, unknown>) => string) => {
  if (!exists) return t("builderV4.banners.fieldRemoved");
  if (value === null || value === undefined) return t("builderV4.banners.noContent");
  if (path.at(-1) === "$order" && Array.isArray(value)) {
    const names = value.map(id => {
      if (typeof id !== "string") return null;
      for (const page of document.pages) {
        if (page.id === id) return page.title;
        const section = page.sections.find(candidate => candidate.id === id);
        if (section) return section.title || t(`builderV4.sectionNames.${section.type}`);
        for (const candidate of page.sections) {
          const collections = Object.values(record(candidate.content)).filter(Array.isArray) as unknown[][];
          for (const collection of collections) {
            const match = collection.find(entry => record(entry).id === id);
            if (match) {
              const value = record(match);
              return [value.title, value.name, value.displayName, value.date].find(item => typeof item === "string" && item.trim()) as string | undefined ?? t("builderV4.banners.item");
            }
          }
        }
      }
      return null;
    }).filter((name): name is string => Boolean(name));
    return names.length ? names.slice(0, 4).join(" → ") + (names.length > 4 ? ` · +${names.length - 4} ${t("builderV4.banners.items")}` : "") : t("builderV4.banners.orderOfItems", { count: value.length });
  }
  if (typeof value === "string") {
    if (!value.trim()) return t("builderV4.banners.emptyValue");
    if (/^https?:\/\//i.test(value)) return t("builderV4.banners.changedLinkOrImage");
    return value.length > 180 ? `${value.slice(0, 177)}…` : value;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? t("builderV4.banners.enabled") : t("builderV4.banners.disabled");
  if (Array.isArray(value)) return t("builderV4.banners.listCount", { count: value.length });
  if (typeof value === "object") {
    const item = record(value);
    const name = [item.title, item.name, item.displayName].find(candidate => typeof candidate === "string" && candidate.trim());
    const detailsCount = Object.keys(item).filter(key => key !== "id").length;
    return typeof name === "string" ? `“${name.slice(0, 80)}” · ${t("builderV4.banners.detailCount", { count: detailsCount })}` : t("builderV4.banners.fieldCount", { count: detailsCount });
  }
  return t("builderV4.banners.updatedContent");
};
const displayFieldName = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return null;
  const field = target.closest<HTMLElement>("input:not([type=hidden]):not([type=file]), textarea, select, [contenteditable='true']");
  if (!field) return null;
  if (field.dataset.builderFieldPath) return field.dataset.builderFieldPath;
  const raw = field.getAttribute("aria-label") || field.getAttribute("name") || field.id || field.closest("label")?.textContent || "field";
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return normalized || "field";
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const errText = (error: unknown, t: (key: string, options?: Record<string, unknown>) => string) => {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      STORY_TEMPLATE_UNAVAILABLE: "templateUnavailable",
      WEBSITE_OWNER_REQUIRED: "ownerRequired",
      WEBSITE_VERSION_INVALID: "versionInvalid",
      WEBSITE_DRAFT_INVALID: "draftInvalid",
      WEBSITE_DRAFT_REQUIRED: "draftRequired",
      WEBSITE_DOCUMENT_INVALID: "documentInvalid",
      WEBSITE_UNAVAILABLE: "unavailable",
      WEBSITE_NOT_PUBLISHED: "notPublished",
      WEBSITE_MEDIA_TEMPORARY: "mediaTemporary",
      WEBSITE_MEDIA_NOT_OWNED: "mediaNotOwned",
      WEBSITE_MEDIA_MISSING: "mediaMissing",
      MEDIA_IN_USE: "mediaInUse",
      MEDIA_NOT_FOUND: "mediaNotFound",
      WEBSITE_VERSION_CONFLICT: "versionConflict",
    };
    const mappedMessage = error.backendCode ? messages[error.backendCode] : undefined;
    if (mappedMessage) return t(`builderV4.errors.${mappedMessage}`);
    if (error.backendCode === "PLAN_LIMIT_REACHED") return t("builderV4.errors.planLimit");
    if (error.status === 429) return t("builderV4.errors.rateLimited");
    if (error.backendCode?.startsWith("WEBSITE_"))
      return t("builderV4.errors.websiteErrorWithCode", { code: error.backendCode });
    if (error.status === 400) return t("builderV4.errors.documentInvalid");
    if (error.status === 409) return t("builderV4.errors.versionConflict");
  }
  if (error instanceof Error && /JPEG, PNG|JPG, PNG|WebP/i.test(error.message)) return t("builderV4.errors.invalidImage");
  return t("builderV4.errors.actionFailed");
};
function templateGalleryPreview(document: StoryBuilderV4Document): StoryBuilderV4Document {
  const home = document.pages.find(page => page.isHome);
  if (!home) return document;
  const hero = home.sections.find(section => section.type === "hero") ?? home.sections[0];
  if (!hero) return document;
  const supportingSections = home.sections.filter(section => section.id !== hero.id && section.visible !== false).slice(0, 2);
  return { ...document, navigationMode: "one-page", pages: [{ ...home, visible: true, sections: [{ ...hero, visible: true }, ...supportingSections] }] };
}
function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const destination = index + direction;
  const copy = [...items];
  const current = copy[index]; const adjacent = copy[destination];
  if (current === undefined || adjacent === undefined) return items;
  copy[index] = adjacent; copy[destination] = current;
  return copy;
}

export function WeddingWebsiteBuilderV4({ weddingId, site, setup }: BuilderProps) {
  const { t } = useTranslation("weddingEditor");
  const { api } = useRuntime();
  const templates = useQuery({ queryKey: ["story-templates"], queryFn: () => listStoryTemplates(api), staleTime: 60_000 });
  const [createdSite, setCreatedSite] = useState<Website | null>(null);
  const [recoveryDraftNeedsSave, setRecoveryDraftNeedsSave] = useState(false);
  const activeSite = createdSite ?? site;
  const activeIsV4 = isStoryBuilderV4Document(activeSite.document);
  const [showGallery, setShowGallery] = useState(!activeSite.document);
  const [migrationGallery, setMigrationGallery] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<StoryTemplateSummaryV4 | null>(null);
  const legacyDocument = activeSite.document && !activeIsV4 ? activeSite.document : undefined;
  const publishedLegacy = Boolean(legacyDocument && activeSite.status === "PUBLISHED" && setup.slug);

  if (templates.isPending) return <LoadingState label={t("builderV4.loadingTemplates", "Loading website templates…")} />;
  if (templates.isError) return <ErrorState error={templates.error} retry={() => void templates.refetch()} />;

  if (activeIsV4 && !showGallery) return <V4Studio key={weddingId} weddingId={weddingId} initialSite={activeSite} initialDirty={recoveryDraftNeedsSave} setup={setup} onChooseOtherTemplate={(savedSite, needsSave) => { setCreatedSite(savedSite); setRecoveryDraftNeedsSave(Boolean(needsSave)); setShowGallery(true); }} />;

  if (legacyDocument && !migrationGallery) {
    return <LegacyMigrationScreen
      slug={setup.slug}
      published={publishedLegacy}
      status={activeSite.status}
      onStart={() => setMigrationGallery(true)}
    />;
  }

  return <V4TemplateGallery
    weddingId={weddingId}
    setup={setup}
    templates={templates.data}
    siteVersion={activeSite.version}
    currentDocument={isStoryBuilderV4Document(activeSite.document) ? activeSite.document : undefined}
    legacyDocument={migrationGallery ? legacyDocument : undefined}
    hasActiveDraft={activeIsV4}
    recoveryDraftNeedsSave={recoveryDraftNeedsSave}
    onBack={() => { setMigrationGallery(false); setShowGallery(false); }}
    onCreated={(saved) => {
      setCreatedSite(saved);
      setRecoveryDraftNeedsSave(false);
      setSelectedTemplate(null);
      setShowGallery(false);
    }}
    selectedTemplate={selectedTemplate}
    setSelectedTemplate={setSelectedTemplate}
  />;
}

function LegacyMigrationScreen({ slug, published, status, onStart }: { slug: string; published: boolean; status: string; onStart: () => void }) {
  const { t } = useTranslation("weddingEditor");
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-8">
    <Link href="../" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t("builderV4.actions.backToWedding", "Back to wedding")}</Link>
    <section className="border-y border-border py-8 sm:py-10">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{t("builderV4.legacy.title", "Legacy website")}</p>
      <h1 className="mt-3 font-display text-3xl text-foreground sm:text-4xl">{t("builderV4.legacy.heading", "Move to the new website builder")}</h1>
      <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{t("builderV4.legacy.description", "This website was created with the previous builder. You can review it and create a new V4 draft. The published website will keep working until you publish the new version.")}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {published && <Button variant="outline" asChild><Link href={`/wedding/${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer"><Eye className="mr-2 size-4" />{t("builderV4.legacy.viewCurrent", "View current website")}</Link></Button>}
        <Button onClick={onStart}>{t("builderV4.legacy.chooseTemplate", "Choose a template to migrate")}<ChevronRight className="ml-2 size-4" /></Button>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{t("builderV4.legacy.currentStatus", "Current status")}: {status === "PUBLISHED" ? t("builderV4.status.published") : status === "UNPUBLISHED" ? t("builderV4.legacy.unpublished", "Unpublished") : t("builderV4.status.draft")}. {t("builderV4.legacy.dataNote", "Legacy data isn't deleted or migrated automatically.")}</p>
    </section>
    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-foreground"><CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" /><p>{t("builderV4.legacy.migrationNote", "Preview the content that can be carried over before creating a V4 draft. The current public website changes only after you publish V4.")}</p></div>
  </main>;
}

function V4TemplateGallery({ weddingId, setup, templates, siteVersion, currentDocument, legacyDocument, hasActiveDraft, recoveryDraftNeedsSave, onBack, onCreated, selectedTemplate, setSelectedTemplate }: {
  weddingId: string; setup: WeddingSetup; templates: StoryTemplateSummaryV4[]; siteVersion: number; currentDocument?: StoryBuilderV4Document; legacyDocument?: unknown;
  hasActiveDraft: boolean; recoveryDraftNeedsSave: boolean; onBack: () => void; onCreated: (site: Website) => void;
  selectedTemplate: StoryTemplateSummaryV4 | null; setSelectedTemplate: (value: StoryTemplateSummaryV4 | null) => void;
}) {
  const { t } = useTranslation("weddingEditor");
  const { api } = useRuntime(); const queryClient = useQueryClient();
  const sectionLabel = (type: SectionType) => t(`builderV4.sectionNames.${type}`);
  const localizedCategory = (value?: string | null) => {
    if (!value || value === "uncategorized") return t("builderV4.category.default");
    const key = value.toLowerCase();
    return templateCategoryLabels[key] ? t(`builderV4.category.${key}`) : value;
  };
  const plan = useWeddingPlan(weddingId, true);
  const [search, setSearch] = useState(""); const [category, setCategory] = useState("all");
  const [tier, setTier] = useState("all"); const [viewport, setViewport] = useState<Viewport>("desktop");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [compareKeys, setCompareKeys] = useState<string[]>([]); const [compareOpen, setCompareOpen] = useState(false);
  const compareTemplates = compareKeys.map(key => templates.find(template => template.key === key)).filter((template): template is StoryTemplateSummaryV4 => Boolean(template));
  const filtered = useMemo(() => templates.filter(template => {
    const matchesSearch = `${template.name} ${template.key} ${template.config.category ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    const matchesCategory = category === "all" || (template.config.category || "uncategorized") === category;
    const matchesTier = tier === "all" || template.config.accessTier === tier;
    return matchesSearch && matchesCategory && matchesTier;
  }), [templates, search, category, tier]);
  const categories = [...new Set(templates.map(template => template.config.category || "uncategorized"))];
  const premiumLocked = (template: StoryTemplateSummaryV4) => template.config.accessTier === "PREMIUM" && plan.data && !plan.data.legacy && !plan.data.limits.premiumTemplates;
  const premiumUnknown = (template: StoryTemplateSummaryV4) => template.config.accessTier === "PREMIUM" && !plan.data;

  async function createDraft(template: StoryTemplateSummaryV4, expectedVersion = siteVersion, preparedDocument?: StoryBuilderV4Document) {
    if (busy || premiumLocked(template) || premiumUnknown(template)) return;
    if (legacyDocument && !window.confirm(t("builderV4.legacy.confirmCreate", "Create a V4 draft from this template? The old website remains available until you publish the new one."))) return;
    setBusy(true); setMessage("");
    try {
      const initial = preparedDocument ?? (currentDocument
        ? applyStoryBuilderV4Template(template, currentDocument, setup)
        : createStoryBuilderV4Document(template, setup, legacyDocument));
      const saved = await saveWebsite(api, weddingId, expectedVersion, initial);
      queryClient.setQueryData(["website", weddingId], saved);
      onCreated(saved);
    } catch (error) { setMessage(errText(error, t)); void queryClient.invalidateQueries({ queryKey: ["website", weddingId] }); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-[1480px] space-y-7 px-4 py-8 sm:px-7">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">InviteMe · Website</p><h1 className="mt-2 font-display text-3xl text-foreground">{t("builderV4.gallery.title")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{hasActiveDraft ? t("builderV4.gallery.subtitleCurrent") : t("builderV4.gallery.subtitleNew")}</p></div>
      {hasActiveDraft && <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 size-4" />{t("builderV4.gallery.continueEditing")}</Button>}
    </div>
    <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px_190px]">
      <input className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder={t("builderV4.gallery.search")} value={search} onChange={event => setSearch(event.target.value)} aria-label={t("builderV4.gallery.searchTemplate", "Search templates")} />
      <select className="h-11 rounded-xl border border-input bg-background px-3 text-sm" value={category} onChange={event => setCategory(event.target.value)} aria-label={t("builderV4.gallery.filterCategory")}><option value="all">{t("builderV4.gallery.allStyles")}</option>{categories.map(value => <option key={value} value={value}>{localizedCategory(value)}</option>)}</select>
      <select className="h-11 rounded-xl border border-input bg-background px-3 text-sm" value={tier} onChange={event => setTier(event.target.value)} aria-label={t("builderV4.gallery.filterPlan")}><option value="all">{t("builderV4.gallery.allPlans")}</option><option value="FREE">{t("builderV4.gallery.free")}</option><option value="PREMIUM">Premium</option><option value="UNCLASSIFIED">{t("builderV4.gallery.unclassified")}</option></select>
    </div>
    {plan.isError && <FeatureLimitNotice title={t("builderV4.plan.verifyFailed", "Couldn't verify plan benefits")} description={t("builderV4.plan.premiumHint", "Premium templates will unlock after plan verification. You can still preview other templates.")} status="unavailable" variant="compact" onRetry={() => void plan.refetch()} retryLabel={t("builderV4.actions.retry")} />}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
      <p className="text-sm text-muted-foreground">{t("builderV4.gallery.compareHint", "Choose two templates to compare their layout, colors, and content side by side.")} <span className="font-medium text-foreground">{t("builderV4.gallery.selectedCount", "Selected {{count}}/2", { count: compareKeys.length })}</span></p>
      <div className="flex items-center gap-2">
        {compareKeys.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setCompareKeys([])}>{t("builderV4.gallery.clearSelection")}</Button>}
        <Button type="button" size="sm" disabled={compareTemplates.length !== 2} onClick={() => setCompareOpen(true)}>{t("builderV4.gallery.compareTwo")}</Button>
      </div>
    </div>
    {message && <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{message}</p>}
    {filtered.length === 0 ? <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">{t("builderV4.gallery.noResults")}</p> : <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map(template => {
        const preview = currentDocument
          ? applyStoryBuilderV4Template(template, currentDocument, setup)
          : createStoryBuilderV4Document(template, setup, legacyDocument);
        const galleryPreview = templateGalleryPreview(preview);
        const locked = Boolean(premiumLocked(template) || premiumUnknown(template));
        const isCurrent = currentDocument?.templateKey === template.key && currentDocument.templateVersion === template.version;
        return <article key={template.key} className="min-w-0">
          <button type="button" onClick={() => setSelectedTemplate(template)} className="group relative block w-full overflow-hidden rounded-[18px] border border-border bg-[#f5f1f0] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={t("builderV4.gallery.previewTemplateNamed", { name: template.name })}>
            <div className="story-gallery-preview" aria-hidden="true" style={{ width: viewport === "mobile" ? "72%" : viewport === "tablet" ? "88%" : "100%", marginInline: "auto" }}><div className="story-gallery-preview__canvas pointer-events-none"><StoryBuilderV4Renderer document={galleryPreview} /></div></div>
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/65 to-transparent px-4 pb-4 pt-12 text-sm text-white"><span>{localizedCategory(template.config.category)}</span>{isCurrent ? <span className="rounded-full bg-white/20 px-2 py-1 text-xs">{t("builderV4.gallery.inUse")}</span> : <Eye className="size-4 opacity-0 transition group-hover:opacity-100" />}</div>
          </button>
          <div className="mt-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="font-display text-xl text-foreground">{template.name}</h2><p className="mt-1 text-xs text-muted-foreground">{template.config.accessTier === "PREMIUM" ? "Premium" : template.config.accessTier === "FREE" ? t("builderV4.gallery.free") : t("builderV4.gallery.unclassified")} · {t("builderV4.gallery.suggestedSections", "{{count}} suggested sections", { count: template.config.sections.length })}</p><div className="mt-3 flex items-center gap-2"><span className="flex gap-1.5" aria-label={t("builderV4.gallery.templatePalette", "Template color palette")}>{[template.config.theme.colors.primary, template.config.theme.colors.background, template.config.theme.colors.accent].map((color, index) => <span key={`${color}-${index}`} className="size-4 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}</span><span className="truncate text-[11px] text-muted-foreground">{template.config.theme.fontHeading} · {localizedCategory(template.config.category)}</span></div></div>
            </div>
            <p className="truncate text-xs text-muted-foreground">{template.config.sections.slice(0, 4).map(section => sectionLabel(section.type as SectionType)).join(" · ")}</p>
            <div className="flex flex-wrap gap-2">
              {premiumLocked(template) ? <Button asChild size="sm"><Link href={`/weddings/${encodeURIComponent(weddingId)}/plan`}>{t("builderV4.gallery.viewPlans", "View plans")}</Link></Button> : <Button size="sm" disabled={busy || locked || isCurrent} onClick={() => { setMessage(""); setSelectedTemplate(template); }}>{locked ? t("builderV4.gallery.premiumCheck") : isCurrent ? t("builderV4.gallery.inUse") : currentDocument ? t("builderV4.gallery.viewAndChange") : legacyDocument ? t("builderV4.gallery.viewAndConvert") : t("builderV4.gallery.viewTemplate")}</Button>}
              <Button type="button" size="sm" variant="outline" aria-pressed={compareKeys.includes(template.key)} disabled={!compareKeys.includes(template.key) && compareKeys.length >= 2} onClick={() => setCompareKeys(current => current.includes(template.key) ? current.filter(key => key !== template.key) : [...current, template.key])}><Check className={`mr-1.5 size-3.5 ${compareKeys.includes(template.key) ? "opacity-100" : "opacity-35"}`} />{compareKeys.includes(template.key) ? t("builderV4.gallery.selected") : t("builderV4.gallery.compare")}</Button>
            </div>
          </div>
          {template.config.accessTier === "UNCLASSIFIED" && <p className="mt-2 text-xs text-muted-foreground">{t("builderV4.gallery.adminUnclassified", "This template has not been assigned to a plan by an admin.")}</p>}
        </article>;
      })}
    </div>}
    {selectedTemplate && <TemplatePreviewDialog template={selectedTemplate} setup={setup} siteVersion={siteVersion} currentDocument={currentDocument} recoveryDraftNeedsSave={recoveryDraftNeedsSave} oldDocument={legacyDocument} error={message} viewport={viewport} setViewport={setViewport} busy={busy} locked={Boolean(premiumLocked(selectedTemplate) || premiumUnknown(selectedTemplate))} canUpgrade={Boolean(premiumLocked(selectedTemplate))} weddingId={weddingId} onClose={() => { setSelectedTemplate(null); setMessage(""); }} onChoose={(version, document) => void createDraft(selectedTemplate, version, document)} />}
    <TemplateCompareDialog open={compareOpen} onClose={() => setCompareOpen(false)} templates={compareTemplates} setup={setup} currentDocument={currentDocument} oldDocument={legacyDocument} viewport={viewport} setViewport={setViewport} onOpenTemplate={template => { setCompareOpen(false); setSelectedTemplate(template); }} />
  </main>;
}

function TemplateCompareDialog({ open, onClose, templates, setup, currentDocument, oldDocument, viewport, setViewport, onOpenTemplate }: {
  open: boolean; onClose: () => void; templates: StoryTemplateSummaryV4[]; setup: WeddingSetup; currentDocument?: StoryBuilderV4Document; oldDocument?: unknown;
  viewport: Viewport; setViewport: (viewport: Viewport) => void; onOpenTemplate: (template: StoryTemplateSummaryV4) => void;
}) {
  const { t } = useTranslation("weddingEditor");
  const sectionLabel = (type: SectionType) => t(`builderV4.sectionNames.${type}`);
  const localizedCategory = (value?: string | null) => value && templateCategoryLabels[value.toLowerCase()] ? t(`builderV4.category.${value.toLowerCase()}`) : value || t("builderV4.category.default");
  return <Modal open={open} onClose={onClose} title={t("builderV4.gallery.compareTitle")} description={t("builderV4.gallery.compareDescription")} size="wide">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{t("builderV4.gallery.comparePreviewHint", "The preview uses your current names, wedding date, and photos so you can compare how each template presents them.")}</p>
      <div className="flex items-center gap-1" aria-label={t("builderV4.gallery.previewSize")}>
        <ViewportButton label={t("builderV4.workspace.desktop")} active={viewport === "desktop"} onClick={() => setViewport("desktop")}><Monitor className="size-4" /></ViewportButton>
        <ViewportButton label={t("builderV4.workspace.tablet")} active={viewport === "tablet"} onClick={() => setViewport("tablet")}><Tablet className="size-4" /></ViewportButton>
        <ViewportButton label={t("builderV4.gallery.phone")} active={viewport === "mobile"} onClick={() => setViewport("mobile")}><Smartphone className="size-4" /></ViewportButton>
      </div>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      {templates.map(template => {
        const document = currentDocument ? applyStoryBuilderV4Template(template, currentDocument, setup) : createStoryBuilderV4Document(template, setup, oldDocument);
        const preview = templateGalleryPreview(document);
        const width = viewport === "mobile" ? "72%" : viewport === "tablet" ? "88%" : "100%";
        return <article key={template.key} className="min-w-0 overflow-hidden rounded-xl border border-border bg-background">
          <header className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0"><p className="text-xs uppercase tracking-wide text-primary">{localizedCategory(template.config.category)}</p><h3 className="mt-1 truncate font-display text-xl">{template.name}</h3><p className="mt-1 text-xs text-muted-foreground">{template.config.theme.fontHeading} · {t("builderV4.gallery.suggestedSections", "{{count}} suggested sections", { count: template.config.sections.length })}</p></div>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenTemplate(template)}>{t("builderV4.gallery.details")}</Button>
          </header>
          <div className="story-gallery-preview" style={{ width, marginInline: "auto" }}><div className="story-gallery-preview__canvas pointer-events-none"><StoryBuilderV4Renderer document={preview} /></div></div>
          <div className="border-t border-border p-4"><div className="flex items-center gap-2"><span className="flex gap-1.5" aria-label={t("builderV4.gallery.templatePalette", "Template color palette")}>{[template.config.theme.colors.primary, template.config.theme.colors.background, template.config.theme.colors.accent].map((color, index) => <span key={`${color}-${index}`} className="size-4 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}</span><span className="text-xs text-muted-foreground">{template.config.theme.fontBody}</span></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{template.config.sections.slice(0, 5).map(section => sectionLabel(section.type as SectionType)).join(" → ")}</p></div>
        </article>;
      })}
    </div>
  </Modal>;
}

// Gallery may be opened before a document exists; GET supplies the optimistic concurrency version.
// Keeping this query inside the gallery makes template selection use the latest server version.
function TemplatePreviewDialog({ template, setup, siteVersion, currentDocument, recoveryDraftNeedsSave, oldDocument, error, viewport, setViewport, busy, locked, canUpgrade, weddingId, onClose, onChoose }: {
  template: StoryTemplateSummaryV4; setup: WeddingSetup; siteVersion: number; currentDocument?: StoryBuilderV4Document; recoveryDraftNeedsSave: boolean; oldDocument?: unknown; error: string; viewport: Viewport; setViewport: (v: Viewport) => void;
  busy: boolean; locked: boolean; canUpgrade: boolean; weddingId: string; onClose: () => void; onChoose: (expectedVersion: number, document?: StoryBuilderV4Document) => void;
}) {
  const { t } = useTranslation("weddingEditor");
  const { api } = useRuntime(); const siteQuery = useQuery({ queryKey: ["website", setup.id], queryFn: () => getWebsite(api, setup.id), staleTime: 0, refetchOnMount: "always" });
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);
  const [viewingCurrent, setViewingCurrent] = useState(false);
  const site = siteQuery.data;
  const staleVersion = Boolean(site && site.version !== siteVersion);
  const remoteCurrentDocument = site && isStoryBuilderV4Document(site.document) ? site.document : undefined;
  // Preserve the in-memory recovery copy when its server version is still current. A remote
  // version change is shown as a conflict instead of silently replacing either document.
  const latestCurrentDocument = staleVersion
    ? currentDocument
    : recoveryDraftNeedsSave ? currentDocument : remoteCurrentDocument ?? currentDocument;
  const previewSource = latestCurrentDocument ?? currentDocument;
  const preparedDocument = previewSource ? applyStoryBuilderV4Template(template, previewSource, setup) : undefined;
  const preview = preparedDocument
    ? preparedDocument
    : createStoryBuilderV4Document(template, setup, oldDocument);
  const impact = previewSource && preparedDocument ? summarizeStoryBuilderV4TemplateChange(previewSource, preparedDocument) : undefined;
  const currentTemplateName = typeof record(previewSource?.templateSnapshot).name === "string" ? String(record(previewSource?.templateSnapshot).name) : t("builderV4.gallery.currentTemplate", "current template");
  const draftIsUnavailable = Boolean(currentDocument && site && !remoteCurrentDocument && !recoveryDraftNeedsSave);
  const canApplyTemplate = Boolean(site && !staleVersion && !draftIsUnavailable);
  return <div role="dialog" aria-modal="true" aria-label={`${t("builderV4.gallery.previewTemplate", "Preview template")} ${template.name}`} className="fixed inset-0 z-[120] flex flex-col bg-background">
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border px-3 sm:px-5">
      <div className="flex items-center gap-2">{confirmingSwitch ? <Button variant="ghost" size="sm" onClick={() => setConfirmingSwitch(false)}><ArrowLeft className="mr-1 size-4" />{t("builderV4.gallery.continuePreview")}</Button> : <Button variant="ghost" size="sm" onClick={onClose}><X className="mr-1 size-4" />{t("builderV4.actions.close")}</Button>}<span className="font-medium">{confirmingSwitch ? t("builderV4.gallery.confirmChange") : template.name}</span></div>
      {!confirmingSwitch && <div className="flex flex-wrap items-center gap-2">
        {latestCurrentDocument && <div role="group" aria-label={t("builderV4.gallery.compareTitle")} className="flex rounded-lg bg-muted p-1 text-xs">
          <button type="button" aria-pressed={viewingCurrent} className={`min-h-9 rounded-md px-2.5 ${viewingCurrent ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setViewingCurrent(true)}>{t("builderV4.gallery.previewCurrent")}</button>
          <button type="button" aria-pressed={!viewingCurrent} className={`min-h-9 rounded-md px-2.5 ${!viewingCurrent ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setViewingCurrent(false)}>{t("builderV4.gallery.previewNew")}</button>
        </div>}
        <div className="flex items-center gap-1" aria-label={t("builderV4.gallery.previewSize")}>
          <ViewportButton label={t("builderV4.workspace.desktop")} active={viewport === "desktop"} onClick={() => setViewport("desktop")}><Monitor className="size-4" /></ViewportButton>
          <ViewportButton label={t("builderV4.workspace.tablet")} active={viewport === "tablet"} onClick={() => setViewport("tablet")}><Tablet className="size-4" /></ViewportButton>
          <ViewportButton label={t("builderV4.gallery.phone")} active={viewport === "mobile"} onClick={() => setViewport("mobile")}><Smartphone className="size-4" /></ViewportButton>
        </div>
      </div>}
      {siteQuery.isError ? <Button variant="outline" onClick={() => void siteQuery.refetch()}><RefreshCw className="mr-1.5 size-4" />{t("builderV4.actions.retry")}</Button>
        : locked && canUpgrade ? <Button asChild><Link href={`/weddings/${encodeURIComponent(weddingId)}/plan`}>{t("builderV4.gallery.viewPlans", "View plans")}</Link></Button>
          : <Button disabled={busy || locked || siteQuery.isPending || siteQuery.isFetching || siteQuery.isError || !canApplyTemplate || Boolean(previewSource && previewSource.templateKey === template.key && previewSource.templateVersion === template.version)} onClick={() => { if (!site || !canApplyTemplate) return; if (previewSource) setConfirmingSwitch(true); else onChoose(site.version); }}>{busy ? t("builderV4.gallery.applying", "Applying…") : locked ? t("builderV4.gallery.premiumCheck") : siteQuery.isPending || siteQuery.isFetching ? t("builderV4.gallery.checkingDraft", "Checking draft…") : previewSource ? t("builderV4.gallery.switch", "Switch template") : oldDocument ? t("builderV4.gallery.createDraft", "Create V4 draft") : t("builderV4.gallery.useTemplate", "Use this template")}</Button>}
    </header>
    {(error || draftIsUnavailable || staleVersion || recoveryDraftNeedsSave) && <div role={staleVersion || draftIsUnavailable ? "alert" : "status"} className={`border-b px-4 py-3 text-sm ${staleVersion || draftIsUnavailable ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
      {error || (staleVersion ? t("builderV4.gallery.staleVersion", "The website was updated elsewhere after you opened the template library. Load the latest version before continuing.") : draftIsUnavailable ? t("builderV4.gallery.draftUnavailable", "The current draft could not be verified. Reload before switching templates to avoid overwriting another version.") : t("builderV4.gallery.recoveryWillSave", "Your edits are temporarily saved on this device. They will be saved with the new template when you confirm."))}
    </div>}
    {confirmingSwitch && previewSource ? <main className="flex flex-1 items-center justify-center overflow-auto bg-muted/40 p-4 sm:p-8"><section className="w-full max-w-2xl rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t("builderV4.gallery.draftWillUpdate", "The draft will be updated")}</p>
      <h2 className="mt-2 font-display text-2xl">{t("builderV4.gallery.changeFromTo", "Switch from {{current}} to {{next}}?", { current: currentTemplateName, next: template.name })}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("builderV4.gallery.switchDescription", "InviteMe will apply the new template’s layout and style. Compatible content, pages, photos, RSVP, wishes, and gift flows will be kept.")}</p>
      {impact && <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[[t("builderV4.gallery.pagesPreserved"), impact.pagesPreserved], [t("builderV4.gallery.sectionsPreserved"), impact.sectionsPreserved], [t("builderV4.gallery.sectionsHidden"), impact.hiddenSections.length], [t("builderV4.gallery.variantsChanged"), impact.changedVariants]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}
      </div>}
      <ul className="mt-5 space-y-3 border-y border-border py-5 text-sm leading-6">
        <li>• {impact?.themeChanged ? t("builderV4.gallery.themeWillChange", "Colors and fonts will change to match the new template.") : t("builderV4.gallery.themeStays", "The overall style will stay mostly the same.")}</li>
        <li>• {impact?.addedSections.length ? t("builderV4.gallery.sectionsWillBeAdded", "{{count}} new layout sections will be added to your pages.", { count: impact.addedSections.length }) : t("builderV4.gallery.noSectionsToAdd", "No new layout sections need to be added.")}{impact?.addedSections.length ? <details className="mt-1"><summary className="cursor-pointer font-medium text-foreground">{t("builderV4.gallery.viewSectionsToAdd", "View sections to add")}</summary><ul className="mt-2 space-y-1 pl-5 text-muted-foreground">{impact.addedSections.map(item => <li key={item.sectionId}>{item.pageTitle} · {t(`builderV4.sectionNames.${item.sectionType}`)}</li>)}</ul></details> : null}</li>
        {Boolean(impact?.changedVariants) && <li>• {t("builderV4.gallery.sectionsUseNewLayout", "{{count}} sections will use the new template layout.", { count: impact?.changedVariants })}</li>}
        {impact?.hiddenSections.length ? <li><details><summary className="cursor-pointer font-medium text-foreground">{t("builderV4.gallery.viewSectionsToHide", "View sections to hide ({{count}})", { count: impact.hiddenSections.length })}</summary><ul className="mt-2 space-y-1 pl-5 text-muted-foreground">{impact.hiddenSections.map(item => <li key={item.sectionId}>{item.pageTitle} · {t(`builderV4.sectionNames.${item.sectionType}`)}</li>)}</ul></details></li> : <li>• {t("builderV4.gallery.noVisibleSectionsToHide", "No visible sections need to be hidden.")}</li>}
        <li>• {t("builderV4.gallery.publicChangesAfterPublish", "The public website stays unchanged until you publish again.")}</li>
      </ul>
      <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button variant="outline" onClick={() => setConfirmingSwitch(false)}>{t("builderV4.gallery.continuePreview")}</Button><Button disabled={busy || siteQuery.isPending || siteQuery.isFetching || siteQuery.isError || !canApplyTemplate || !latestCurrentDocument || !preparedDocument} onClick={() => site && preparedDocument && canApplyTemplate && onChoose(site.version, preparedDocument)}>{busy ? t("builderV4.gallery.applying", "Applying…") : t("builderV4.gallery.applyTemplate", "Apply template")}</Button></div>
    </section></main> : <div className="flex-1 overflow-auto bg-muted/50 p-3 sm:p-6"><div className="mx-auto min-h-full overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-[width]" style={{ width: viewport === "desktop" ? "100%" : viewport === "tablet" ? 768 : 390, maxWidth: "100%" }}><StoryBuilderV4Renderer document={viewingCurrent && latestCurrentDocument ? latestCurrentDocument : preview} /></div></div>}
    {siteQuery.isError && <p role="alert" className="border-t border-destructive/20 bg-destructive/5 px-4 py-3 text-center text-sm text-destructive">{t("builderV4.gallery.versionCheckFailed", "Could not verify the current website version. Reload before using this template to avoid overwriting new changes.")}</p>}
    {Boolean(oldDocument) && <p className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground">{t("builderV4.gallery.oldSitePreserved", "The old published website stays available until you publish the V4 version.")}</p>}
  </div>;
}

function ViewportButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} className={`grid size-9 place-items-center rounded-lg ${active ? "bg-primary/15 text-primary-hover" : "text-muted-foreground hover:bg-muted"}`}>{children}</button>;
}

function PublishCheckItem({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return <div role={ok ? "status" : "alert"} className={`flex min-h-[76px] items-start gap-3 rounded-xl border p-3 ${ok ? "border-emerald-700/15 bg-emerald-50/60" : "border-amber-300/70 bg-amber-50/60"}`}>
    {ok ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" /> : <CircleHelp className="mt-0.5 size-4 shrink-0 text-amber-800" aria-hidden="true" />}
    <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>
  </div>;
}

function V4Studio({ weddingId, initialSite, initialDirty, setup, onChooseOtherTemplate }: { weddingId: string; initialSite: Website; initialDirty: boolean; setup: WeddingSetup; onChooseOtherTemplate: (site: Website, needsSave?: boolean) => void }) {
  const { t, i18n } = useTranslation("weddingEditor");
  const { language } = useLanguage();
  const { setLanguage } = useLocale();
  const { api, realtime } = useRuntime(); const cache = useQueryClient();
  const realtimeStatus = useSyncExternalStore(realtime.subscribe, realtime.getStatus, realtime.getServerStatus);
  const { isOwner } = usePermission();
  const initial = isStoryBuilderV4Document(initialSite.document) ? initialSite.document : null;
  const [doc, setDoc] = useState<StoryBuilderV4Document | null>(initial);
  const docRef = useRef<StoryBuilderV4Document | null>(initial);
  const baseDocumentRef = useRef<StoryBuilderV4Document | null>(initial);
  const remoteDocumentRef = useRef<StoryBuilderV4Document | null>(null);
  const versionRef = useRef(initialSite.version);
  const [version, setVersion] = useState(initialSite.version);
  const [dirty, setDirty] = useState(initialDirty); const dirtyRef = useRef(initialDirty);
  const [busy, setBusy] = useState(false); const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(initialDirty ? "error" : "saved");
  const [error, setError] = useState(""); const [conflict, setConflict] = useState(false);
  const [mergeConflicts, setMergeConflicts] = useState<StoryMergeConflict[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [suggestedDisplayName, setSuggestedDisplayName] = useState("");
  const [identityPromptOpen, setIdentityPromptOpen] = useState(false);
  const [customDisplayName, setCustomDisplayName] = useState("");
  const [presenceSessionId, setPresenceSessionId] = useState("");
  const [builderPresence, setBuilderPresence] = useState<BuilderPresence[]>([]);
  const [builderJoinedKey, setBuilderJoinedKey] = useState("");
  const [focusedFieldPath, setFocusedFieldPath] = useState<string | null>(null);
  const [presenceStatus, setPresenceStatus] = useState<"viewing" | "editing" | "idle">("viewing");
  const focusedFieldRef = useRef<string | null>(null);
  const presenceStatusRef = useRef(presenceStatus);
  const lastPresenceActivityRef = useRef(0);
  const [offline, setOffline] = useState(false);
  const [recoveryLoadedSessionId, setRecoveryLoadedSessionId] = useState("");
  const [recoveredRecovery, setRecoveredRecovery] = useState(false);
  const builderInstanceId = useRef(id());
  const joinedBuilderKey = useRef("");
  const displayNameRef = useRef("");
  const presenceSessionRef = useRef("");
  const recoveryLoaded = Boolean(presenceSessionId && recoveryLoadedSessionId === presenceSessionId);
  const [selectedPageId, setSelectedPageId] = useState(initial?.pages[0]?.id ?? "");
  const [selectedSectionId, setSelectedSectionId] = useState(initial?.pages[0]?.sections[0]?.id ?? "");
  const selectedPageIdRef = useRef(selectedPageId);
  const selectedSectionIdRef = useRef(selectedSectionId);
  const [viewport, setViewport] = useState<Viewport>("desktop"); const [preview, setPreview] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true); const [rightOpen, setRightOpen] = useState(true);
  const [experienceSettingsOpen, setExperienceSettingsOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"structure" | "inspector" | null>(null);
  const [toolbarActionsOpen, setToolbarActionsOpen] = useState(false);
  const [languageOptionsOpen, setLanguageOptionsOpen] = useState(false);
  const toolbarActionsRef = useRef<HTMLDivElement>(null);
  const saveInFlight = useRef(false);
  const autoSaveTimer = useRef<number | null>(null);
  const lastPersistBackendCodeRef = useRef<string | undefined>(undefined);
  const persistRef = useRef<(next: StoryBuilderV4Document, showIssues?: boolean) => Promise<Website | null>>(async () => null);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [shareSettingsOpen, setShareSettingsOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaPickerTarget, setMediaPickerTarget] = useState<((url: string) => void) | null>(null);
  const [mediaDeleteTarget, setMediaDeleteTarget] = useState<{ id: string; url: string } | null>(null);
  const [mediaDeleteBusy, setMediaDeleteBusy] = useState(false);
  const [mediaDeleteError, setMediaDeleteError] = useState("");
  const [showQuickStart, setShowQuickStart] = useState(true);
  const [sectionLibraryOpen, setSectionLibraryOpen] = useState(false);
  const [sectionLibraryType, setSectionLibraryType] = useState<SectionType>("hero");
  const [sectionLibraryVariant, setSectionLibraryVariant] = useState("floral");
  const [undoStack, setUndoStack] = useState<Array<StoryHistoryOperation<StoryBuilderV4Document>>>([]); const [redoStack, setRedoStack] = useState<Array<StoryHistoryOperation<StoryBuilderV4Document>>>([]);
  const [dragSectionId, setDragSectionId] = useState<string | null>(null);
  const [dropSectionId, setDropSectionId] = useState<string | null>(null);
  const [pageName, setPageName] = useState(""); const [pageSlug, setPageSlug] = useState("");
  const [status, setStatus] = useState(initialSite.status);
  const hasEventsSection = Boolean(doc?.pages.some(page => page.sections.some(section => section.type === "events")));
  const hasCountdownSection = Boolean(doc?.pages.some(page => page.sections.some(section => section.type === "countdown")));
  const hasGiftSection = Boolean(doc?.pages.some(page => page.sections.some(section => section.type === "gift")));
  const weddingEventsQuery = useQuery({ queryKey: ["wedding-events", weddingId], queryFn: () => listWeddingEvents(api, weddingId), enabled: hasEventsSection || hasCountdownSection, staleTime: 30_000 });
  const giftAccountsQuery = useQuery({ queryKey: ["gift-accounts", weddingId], queryFn: ({ signal }) => getGiftAccounts(api, weddingId, signal), enabled: hasGiftSection, staleTime: 0, refetchOnMount: "always" });
  const templateQuery = useQuery({ queryKey: ["story-templates"], queryFn: () => listStoryTemplates(api), staleTime: 60_000 });
  const mediaLibrary = useQuery({ queryKey: ["wedding-media", weddingId], queryFn: () => listWeddingMedia(api, weddingId), enabled: mediaPickerOpen });
  const templateKey = doc?.templateKey;
  const templateSnapshot = doc?.templateSnapshot;
  const templateVersion = doc?.templateVersion;
  const currentTemplate = useMemo(() => {
    const published = templateQuery.data?.find(item => item.key === templateKey);
    if (published) return published;
    if (!templateSnapshot) return undefined;
    const snapshot = storyTemplateConfigSchema.safeParse(templateSnapshot);
    if (!snapshot.success || snapshot.data.key !== templateKey) return undefined;
    return {
      key: templateKey,
      name: snapshot.data.name,
      version: templateVersion ?? 1,
      config: snapshot.data,
    } satisfies StoryTemplateSummaryV4;
  }, [templateQuery.data, templateKey, templateSnapshot, templateVersion]);
  const templateNotInNewSelections = Boolean(
    doc && templateQuery.isSuccess && !templateQuery.data.some(item => item.key === doc.templateKey),
  );
  const sectionLibraryConfig = currentTemplate?.config.sections.find(item => item.type === sectionLibraryType);
  const sectionLibraryDefaults = sectionLibraryConfig?.defaultContent;

  useEffect(() => {
    displayNameRef.current = displayName;
    presenceSessionRef.current = presenceSessionId;
  }, [displayName, presenceSessionId]);
  useEffect(() => {
    selectedPageIdRef.current = selectedPageId;
    selectedSectionIdRef.current = selectedSectionId;
  }, [selectedPageId, selectedSectionId]);
  useEffect(() => { presenceStatusRef.current = presenceStatus; }, [presenceStatus]);
  const currentTier = currentTemplate?.config.accessTier ?? record(doc?.templateSnapshot).accessTier;
  const currentPage = doc?.pages.find(page => page.id === selectedPageId) ?? doc?.pages.find(page => page.isHome);
  const currentSection = currentPage?.sections.find(section => section.id === selectedSectionId);
  const currentSectionId = currentSection?.id;
  const builderPresenceDetails = builderPresence.map(presence => {
    const page = doc?.pages.find(item => item.id === presence.pageId);
    const section = page?.sections.find(item => item.id === presence.sectionId);
    return {
      presence,
      pageTitle: page?.navigationLabel || page?.title || t("builderV4.collaboration.openingWebsite"),
    sectionTitle: section ? t(`builderV4.sectionNames.${section.type}`) : null,
    fieldTitle: presence.status === "editing" ? presenceFieldLabel(presence.fieldPath, t) : null,
    statusTitle: presence.status === "editing" ? t("builderV4.collaboration.editing") : presence.status === "idle" ? t("builderV4.collaboration.idle") : t("builderV4.collaboration.viewing"),
    };
  });
  const presenceBySection = new Map<string, BuilderPresence[]>();
  for (const presence of builderPresence) {
    if (presence.pageId !== currentPage?.id || !presence.sectionId) continue;
    presenceBySection.set(presence.sectionId, [...(presenceBySection.get(presence.sectionId) ?? []), presence]);
  }
  const sitePlan = useWeddingPlan(weddingId, true);
  const premiumLocked = currentTier === "PREMIUM" && Boolean(sitePlan.data && !sitePlan.data.legacy && !sitePlan.data.limits.premiumTemplates);
  const premiumUnknown = currentTier === "PREMIUM" && (sitePlan.isPending || sitePlan.isError || !sitePlan.data);
  const validationIssues = useMemo<BuilderIssue[]>(() => {
    if (!showFieldErrors || !doc) return [];
    return validateBuilderDocument(doc, currentTemplate, t);
  }, [currentTemplate, doc, showFieldErrors, t]);
  const publishIssues = useMemo(() => doc ? validateBuilderDocument(doc, currentTemplate, t) : [], [currentTemplate, doc, t]);
  const hiddenPages = doc?.pages.filter(page => page.visible === false) ?? [];
  const hiddenSections = doc?.pages.flatMap(page => page.sections.filter(section => section.visible === false).map(section => ({ pageId: page.id, sectionId: section.id, page: page.title, section: t(`builderV4.sectionNames.${section.type}`) }))) ?? [];
  const missingGalleryDescriptions = doc?.pages.flatMap(page => page.sections.filter((section): section is Extract<StoryBuilderV4Section, { type: "gallery" }> => section.type === "gallery").flatMap(section => {
    const content = record(section.content);
    const images = Array.isArray(content.images) ? content.images.map(record) : [];
      return images.flatMap((image, index) => String(image.imageUrl ?? "").trim() && (!String(image.alt ?? "").trim() || isImageFilename(String(image.alt))) ? [{ pageId: page.id, sectionId: section.id, page: page.title, section: t("builderV4.sectionNames.gallery"), imageIndex: index + 1 }] : []);
  })) ?? [];
  const publicSections = doc?.pages.filter(page => page.visible !== false).flatMap(page => page.sections.filter(section => section.visible !== false).map(section => ({ page, section }))) ?? [];
  const needsRsvp = !publicSections.some(({ section }) => section.type === "rsvp");
  const eventSectionsNeedingDetails = publicSections.filter(({ section }) => section.type === "events").filter(({ section }) => {
    if (section.type !== "events") return false;
    const sectionContent = record(section.content);
    const events = Array.isArray(sectionContent.events) ? sectionContent.events.map(record) : doc?.content.events ?? [];
    const usesDateBinding = section.bindings?.some(binding => binding.target === "mainEvent.startsAt" && binding.mode !== "manual");
    const usesVenueBinding = section.bindings?.some(binding => ["mainEvent.venueName", "mainEvent.address"].includes(binding.target) && binding.mode !== "manual");
    const hasDate = events.some(event => Boolean(event.startsAt)) || Boolean(setup.eventDateTime && usesDateBinding);
    const hasPlace = events.some(event => Boolean(event.venueName || event.address)) || Boolean((setup.venueName || setup.venueAddress) && usesVenueBinding);
    return !hasDate || !hasPlace;
  });
  const hasShareImage = Boolean(doc?.seo?.imageUrl || doc?.content.heroImageUrl || publicSections.some(({ section }) => section.type === "hero" && (Boolean(record(section.content).imageUrl) || Boolean(setup.coverImageUrl && section.bindings?.some(binding => binding.target === "heroImageUrl" && binding.mode !== "manual")))));
  const sectionLibraryPreviewDocument = useMemo(() => {
    if (!doc) return null;
    const previewDocument = clone(doc);
    const page = previewDocument.pages.find(item => item.id === currentPage?.id);
    if (!page) return previewDocument;
    const section = createV4Section(sectionLibraryType, previewDocument.content, setup, sectionLibraryDefaults, sectionLibraryConfig?.style);
    section.variant = sectionLibraryVariant as typeof section.variant;
    page.sections = [section];
    return previewDocument;
  }, [doc, currentPage?.id, sectionLibraryType, sectionLibraryVariant, sectionLibraryDefaults, sectionLibraryConfig?.style, setup]);
  const pageIndex = doc?.pages.findIndex(page => page.id === currentPage?.id) ?? -1;
  const sectionIndex = currentPage?.sections.findIndex(section => section.id === currentSection?.id) ?? -1;
  const selectSection = (sectionId: string) => {
    setExperienceSettingsOpen(false);
    setSelectedSectionId(sectionId);
    setRightOpen(true);
    if (window.matchMedia("(max-width: 767px)").matches) setMobilePanel("inspector");
  };
  const selectPage = (pageId: string) => {
    const page = doc?.pages.find(item => item.id === pageId);
    if (!page) return;
    setSelectedPageId(page.id);
    setSelectedSectionId(page.sections[0]?.id ?? "");
    setRightOpen(true);
  };
  const goToPresence = (presence: BuilderPresence) => {
    const page = doc?.pages.find(item => item.id === presence.pageId);
    if (!page) return;
    const section = page.sections.find(item => item.id === presence.sectionId);
    setPreview(false);
    setExperienceSettingsOpen(false);
    setSelectedPageId(page.id);
    setSelectedSectionId(section?.id ?? page.sections[0]?.id ?? "");
    setRightOpen(true);
    if (window.matchMedia("(max-width: 767px)").matches) setMobilePanel("inspector");
    if (presence.status !== "editing" || !presence.fieldPath) return;
    const requestedPath = canonicalBuilderFieldPath(presence.fieldPath);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const matches = Array.from(document.querySelectorAll<HTMLElement>("[data-builder-field-path]"))
        .filter(target => target.getClientRects().length > 0 && canonicalBuilderFieldPath(target.dataset.builderFieldPath ?? "") === requestedPath);
      const target = matches.find(element => element.matches("input:not([type=hidden]), textarea, select")) ?? matches[0];
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      target.classList.add("outline", "outline-2", "outline-primary", "outline-offset-4", "bg-primary/10");
      window.setTimeout(() => target.classList.remove("outline", "outline-2", "outline-primary", "outline-offset-4", "bg-primary/10"), 2400);
    }));
  };

  function reconcileRemoteSite(remote: Website) {
    if (!isStoryBuilderV4Document(remote.document)) {
      setConflict(true); setSaveState("error"); setError(t("builderV4.errors.versionInvalid")); return;
    }
    if (remote.version <= versionRef.current) return;
    const remoteDocument = remote.document;
    const base = baseDocumentRef.current ?? remoteDocument;
    const local = docRef.current ?? base;
    const merged = mergeStoryDocuments(base, local, remoteDocument);
    baseDocumentRef.current = remoteDocument;
    remoteDocumentRef.current = remoteDocument;
    versionRef.current = remote.version;
    setVersion(remote.version);
    setStatus(remote.status);
    docRef.current = merged.document;
    setDoc(merged.document);
    setMergeConflicts(merged.conflicts);
    const needsSave = !sameDocument(merged.document, remoteDocument);
    dirtyRef.current = needsSave;
    setDirty(needsSave);
    setConflict(merged.conflicts.length > 0);
    setSaveState(merged.conflicts.length > 0 ? "error" : needsSave ? "saving" : "saved");
    setError(merged.conflicts.length ? t("builderV4.banners.conflictDescription") : "");
    cache.setQueryData(["website", weddingId], remote);
  }

  useEffect(() => {
    if (initialSite.version > versionRef.current) reconcileRemoteSite(initialSite);
    // The website query is the authoritative notification channel; each version is reconciled once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSite.version, initialSite.document]);

  useEffect(() => {
    const sessionKey = `inviteme:builder:${weddingId}:session`;
    const labelKey = `inviteme:builder:${weddingId}:label`;
    let candidate = sessionStorage.getItem(sessionKey) || id();
    const storedLabel = sessionStorage.getItem(labelKey);
    const suggestion = localStorage.getItem(labelKey) || "";

    let channel: BroadcastChannel | undefined;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(`inviteme:builder-tabs:${weddingId}`);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data as { type?: string; sessionId?: string; instanceId?: string } | null;
        if (data?.type !== "hello" || data.sessionId !== candidate || !data.instanceId || data.instanceId === builderInstanceId.current) return;
        // sessionStorage can be cloned when a browser duplicates a tab; deterministically keep one ID.
        if (builderInstanceId.current.localeCompare(data.instanceId) > 0) {
          candidate = id();
          sessionStorage.setItem(sessionKey, candidate);
          sessionStorage.removeItem(labelKey);
          setPresenceSessionId(candidate);
          setDisplayName(""); setCustomDisplayName(localStorage.getItem(labelKey) || "");
          setIdentityPromptOpen(true);
        }
      };
      channel.postMessage({ type: "hello", sessionId: candidate, instanceId: builderInstanceId.current });
    }
    const settle = window.setTimeout(() => {
      sessionStorage.setItem(sessionKey, candidate);
      if (storedLabel) { setDisplayName(storedLabel); setCustomDisplayName(storedLabel); }
      else { setSuggestedDisplayName(suggestion); setCustomDisplayName(suggestion); setIdentityPromptOpen(true); }
      setPresenceSessionId(candidate);
    }, 250);
    return () => { window.clearTimeout(settle); channel?.close(); };
  }, [weddingId]);

  useEffect(() => {
    if (!presenceSessionId) return;
    let cancelled = false;
    void readWebsiteBuilderRecovery(weddingId, presenceSessionId).then(recovery => {
      if (cancelled || !recovery || !isStoryBuilderV4Document(initialSite.document)) return;
      const local = storyBuilderV4DocumentSchema.safeParse(recovery.document);
      const savedBase = storyBuilderV4DocumentSchema.safeParse(recovery.baseDocument);
      if (!local.success || !savedBase.success) return;
      const remote = initialSite.document;
      const merged = mergeStoryDocuments(savedBase.data, local.data, remote);
      baseDocumentRef.current = remote; remoteDocumentRef.current = remote;
      versionRef.current = initialSite.version; setVersion(initialSite.version); setStatus(initialSite.status);
      docRef.current = merged.document; setDoc(merged.document); setMergeConflicts(merged.conflicts);
      const needsSave = !sameDocument(merged.document, remote);
      dirtyRef.current = needsSave; setDirty(needsSave); setConflict(merged.conflicts.length > 0);
      setSaveState(merged.conflicts.length ? "error" : needsSave ? "saving" : "saved");
      setError(merged.conflicts.length ? t("builderV4.banners.conflictDescription") : "");
      setRecoveredRecovery(needsSave || merged.conflicts.length > 0);
    }).catch(() => undefined).finally(() => { if (!cancelled) setRecoveryLoadedSessionId(presenceSessionId); });
    return () => { cancelled = true; };
  }, [presenceSessionId, weddingId, initialSite.version, initialSite.document, initialSite.status, t]);

  useEffect(() => {
    if (!recoveryLoaded || !presenceSessionId) return;
    if (!dirty || !doc) {
      if (!dirty) void clearWebsiteBuilderRecovery(weddingId, presenceSessionId).catch(() => undefined);
      return;
    }
    const timer = window.setTimeout(() => {
      void writeWebsiteBuilderRecovery({ weddingId, sessionId: presenceSessionId, version: versionRef.current,
        baseDocument: baseDocumentRef.current ?? doc, document: doc, savedAt: Date.now() }).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [recoveryLoaded, presenceSessionId, weddingId, dirty, doc]);

  useEffect(() => {
    const refresh = () => setOffline(!navigator.onLine);
    refresh();
    window.addEventListener("online", refresh); window.addEventListener("offline", refresh);
    return () => { window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); };
  }, []);

  useEffect(() => {
    lastPresenceActivityRef.current = Date.now();
    const idleAfterMs = 60_000;
    const markActivity = () => {
      lastPresenceActivityRef.current = Date.now();
      setPresenceStatus(document.visibilityState === "hidden" ? "idle" : focusedFieldRef.current ? "editing" : "viewing");
    };
    const updateVisibility = () => {
      if (document.visibilityState === "hidden") setPresenceStatus("idle");
      else if (Date.now() - lastPresenceActivityRef.current < idleAfterMs)
        setPresenceStatus(focusedFieldRef.current ? "editing" : "viewing");
    };
    const updateIdle = () => {
      const idle = document.visibilityState === "hidden" || Date.now() - lastPresenceActivityRef.current >= idleAfterMs;
      const nextStatus = idle ? "idle" : focusedFieldRef.current ? "editing" : "viewing";
      setPresenceStatus(current => current === nextStatus ? current : nextStatus);
    };
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("input", markActivity, true);
    window.addEventListener("scroll", markActivity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", updateVisibility);
    const timer = window.setInterval(updateIdle, 10_000);
    return () => {
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("input", markActivity, true);
      window.removeEventListener("scroll", markActivity, true);
      document.removeEventListener("visibilitychange", updateVisibility);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const subscriptions = [
      realtime.onBuilderPresenceSnapshot(snapshot => setBuilderPresence(snapshot.filter(item => item.sessionId !== presenceSessionRef.current))),
      realtime.onBuilderPresenceChanged(presence => setBuilderPresence(items => [
        ...items.filter(item => item.sessionId !== presence.sessionId && item.sessionId !== presenceSessionRef.current), presence,
      ])),
      realtime.onBuilderPresenceLeft(sessionId => setBuilderPresence(items => items.filter(item => item.sessionId !== sessionId))),
    ];
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, [realtime]);

  const sessionPresenceKey = presenceSessionId && displayName ? `${presenceSessionId}:${displayName}` : "";
  useEffect(() => {
    if (!sessionPresenceKey || realtimeStatus !== "connected") { joinedBuilderKey.current = ""; return; }
    const current = docRef.current;
    const pageId = current?.pages.find(page => page.id === selectedPageIdRef.current)?.id ?? current?.pages[0]?.id ?? null;
    const sectionId = current?.pages.find(page => page.id === pageId)?.sections.find(section => section.id === selectedSectionIdRef.current)?.id ?? null;
    let cancelled = false;
    void realtime.invokeBuilder<BuilderPresence[]>("JoinBuilder", weddingId, presenceSessionId, displayName, pageId, sectionId)
      .then(async snapshot => {
        if (cancelled) return;
        joinedBuilderKey.current = sessionPresenceKey;
        setBuilderJoinedKey(sessionPresenceKey);
        setBuilderPresence(snapshot.filter(item => item.sessionId !== presenceSessionId));
        const latest = docRef.current;
        const latestPageId = latest?.pages.find(page => page.id === selectedPageIdRef.current)?.id ?? latest?.pages[0]?.id ?? null;
        const latestSectionId = latest?.pages.find(page => page.id === latestPageId)?.sections.find(section => section.id === selectedSectionIdRef.current)?.id ?? null;
        await realtime.invokeBuilder("UpdateBuilderPresence", weddingId, presenceSessionId, displayName,
          latestPageId, latestSectionId, focusedFieldRef.current, presenceStatusRef.current).catch(() => undefined);
      })
      .catch(() => { if (!cancelled) { joinedBuilderKey.current = ""; setBuilderJoinedKey(""); } });
    return () => { cancelled = true; };
  }, [sessionPresenceKey, realtimeStatus, realtime, weddingId, presenceSessionId, displayName]);

  const activePageForPresence = doc?.pages.find(page => page.id === selectedPageId)?.id ?? doc?.pages[0]?.id ?? null;
  useEffect(() => {
    if (!sessionPresenceKey || builderJoinedKey !== sessionPresenceKey || realtimeStatus !== "connected") return;
    const timer = window.setTimeout(() => {
      void realtime.invokeBuilder("UpdateBuilderPresence", weddingId, presenceSessionId, displayName,
        activePageForPresence, currentSectionId ?? null, focusedFieldPath, presenceStatus).catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [sessionPresenceKey, builderJoinedKey, realtimeStatus, realtime, weddingId, presenceSessionId, displayName, activePageForPresence, currentSectionId, focusedFieldPath, presenceStatus]);

  useEffect(() => {
    if (!sessionPresenceKey || builderJoinedKey !== sessionPresenceKey || realtimeStatus !== "connected") return;
    const timer = window.setInterval(() => {
      void realtime.invokeBuilder<BuilderPresence[]>("HeartbeatBuilder", weddingId, presenceSessionId)
        .then(snapshot => setBuilderPresence(snapshot.filter(item => item.sessionId !== presenceSessionId)))
        .catch(() => {
          joinedBuilderKey.current = "";
          setBuilderJoinedKey("");
          void realtime.invokeBuilder<BuilderPresence[]>("JoinBuilder", weddingId, presenceSessionId, displayName,
            selectedPageIdRef.current || null, selectedSectionIdRef.current || null)
            .then(async snapshot => {
              joinedBuilderKey.current = sessionPresenceKey;
              setBuilderJoinedKey(sessionPresenceKey);
              setBuilderPresence(snapshot.filter(item => item.sessionId !== presenceSessionId));
              const latest = docRef.current;
              const pageId = latest?.pages.find(page => page.id === selectedPageIdRef.current)?.id ?? latest?.pages[0]?.id ?? null;
              const sectionId = latest?.pages.find(page => page.id === pageId)?.sections.find(section => section.id === selectedSectionIdRef.current)?.id ?? null;
              await realtime.invokeBuilder("UpdateBuilderPresence", weddingId, presenceSessionId, displayName,
                pageId, sectionId, focusedFieldRef.current, presenceStatusRef.current).catch(() => undefined);
            })
            .catch(() => undefined);
        });
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [sessionPresenceKey, builderJoinedKey, realtimeStatus, realtime, weddingId, presenceSessionId, displayName]);

  useEffect(() => () => {
    if (realtime.getStatus() === "connected" && presenceSessionRef.current)
      void realtime.invokeBuilder("LeaveBuilder", weddingId, presenceSessionRef.current).catch(() => undefined);
  }, [realtime, weddingId]);

  function chooseDisplayName(value: string) {
    const normalized = value.trim().slice(0, 40);
    if (!normalized) return;
    const labelKey = `inviteme:builder:${weddingId}:label`;
    sessionStorage.setItem(labelKey, normalized);
    localStorage.setItem(labelKey, normalized);
    setDisplayName(normalized); setCustomDisplayName(normalized); setIdentityPromptOpen(false);
  }

  async function clearLocalRecovery() {
    if (!presenceSessionId) return;
    await clearWebsiteBuilderRecovery(weddingId, presenceSessionId).catch(() => undefined);
    setRecoveredRecovery(false);
  }

  function resolveMerge(conflictIndex: number, side: "local" | "remote") {
    const issue = mergeConflicts[conflictIndex];
    const current = docRef.current;
    const remote = remoteDocumentRef.current;
    if (!issue || !current || !remote) return;
    const resolved = resolveStoryMergeConflict(current, issue, side);
    const remaining = mergeConflicts.filter((_, index) => index !== conflictIndex);
    docRef.current = resolved; setDoc(resolved); setMergeConflicts(remaining);
    const needsSave = !sameDocument(resolved, remote);
    dirtyRef.current = needsSave; setDirty(needsSave); setConflict(remaining.length > 0);
    setSaveState(remaining.length > 0 ? "error" : needsSave ? "saving" : "saved");
    setError(remaining.length ? t("builderV4.errors.conflictsRemaining") : "");
  }
  useEffect(() => {
    if (preview || !currentSectionId) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(currentSectionId)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }));
    return () => window.cancelAnimationFrame(frame);
  }, [currentSectionId, preview]);
  useEffect(() => {
    if (!recoveryLoaded || !dirty || !doc || conflict || !isOwner || offline) return;
    if (autoSaveTimer.current !== null) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      autoSaveTimer.current = null;
      void persistRef.current(doc);
    }, 900);
    return () => {
      if (autoSaveTimer.current !== null) window.clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    };
  }, [doc, dirty, conflict, isOwner, premiumLocked, premiumUnknown, recoveryLoaded, offline]);
  useEffect(() => {
    if (!dirty) return;
    const preventClose = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [dirty]);
  useEffect(() => {
    if (!toolbarActionsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !toolbarActionsRef.current?.contains(event.target)) { setToolbarActionsOpen(false); setLanguageOptionsOpen(false); }
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setToolbarActionsOpen(false); setLanguageOptionsOpen(false); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [toolbarActionsOpen]);
  useEffect(() => {
    if (!mobilePanel) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobilePanel(null); };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", closeOnEscape); };
  }, [mobilePanel]);

  async function persist(next: StoryBuilderV4Document, showIssues = false): Promise<Website | null> {
    if (saveInFlight.current || conflict || !isOwner || premiumLocked || premiumUnknown || offline || !recoveryLoaded) return null;
    lastPersistBackendCodeRef.current = undefined;
    const validationIssues = validateBuilderDocument(next, currentTemplate, t);
    if (validationIssues.length > 0) {
      if (showIssues) setShowFieldErrors(true);
      setError(describeV4ValidationIssues(validationIssues, next));
      setSaveState("error");
      return null;
    }
    setShowFieldErrors(false);
    saveInFlight.current = true;
    setBusy(true); setError(""); setSaveState("saving");
    let saved = false;
    let blockedByConflict = false;
    let candidate = next;
    try {
      let result: Website | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await saveWebsite(api, weddingId, versionRef.current, candidate);
          break;
        } catch (cause) {
          if (!(cause instanceof ApiError) || cause.status !== 409) throw cause;
          const latest = await getWebsite(api, weddingId);
          if (!isStoryBuilderV4Document(latest.document)) throw cause;
          const baseline = baseDocumentRef.current ?? candidate;
          const local = docRef.current ?? candidate;
          const merged = mergeStoryDocuments(baseline, local, latest.document);
          baseDocumentRef.current = latest.document; remoteDocumentRef.current = latest.document;
          versionRef.current = latest.version; setVersion(latest.version); setStatus(latest.status);
          cache.setQueryData(["website", weddingId], latest);
          docRef.current = merged.document; setDoc(merged.document); setMergeConflicts(merged.conflicts);
          const needsSave = !sameDocument(merged.document, latest.document);
          dirtyRef.current = needsSave; setDirty(needsSave);
          if (merged.conflicts.length) {
            blockedByConflict = true;
            setConflict(true); setSaveState("error"); setError(t("builderV4.banners.conflictDescription"));
            return null;
          }
          if (!needsSave) {
            setConflict(false); setSaveState("saved"); setError("");
            return latest;
          }
          candidate = merged.document;
          if (attempt === 2) {
            setSaveState("error"); setError(t("builderV4.errors.saveRace"));
            return null;
          }
          await new Promise(resolve => window.setTimeout(resolve, 150 * (attempt + 1)));
        }
      }
      if (!result) return null;
      lastPersistBackendCodeRef.current = undefined;
      saved = true;
      const savedDocument = isStoryBuilderV4Document(result.document) ? result.document : candidate;
      baseDocumentRef.current = savedDocument; remoteDocumentRef.current = savedDocument;
      versionRef.current = result.version; setVersion(result.version); setStatus(result.status);
      cache.setQueryData(["website", weddingId], result);
      const liveDocument = docRef.current ?? candidate;
      const rebased = sameDocument(liveDocument, candidate)
        ? { document: savedDocument, conflicts: [] as StoryMergeConflict[] }
        : mergeStoryDocuments(candidate, liveDocument, savedDocument);
      docRef.current = rebased.document; setDoc(rebased.document); setMergeConflicts(rebased.conflicts);
      const needsSave = !sameDocument(rebased.document, savedDocument);
      dirtyRef.current = needsSave; setDirty(needsSave); setConflict(rebased.conflicts.length > 0);
      setSaveState(rebased.conflicts.length ? "error" : needsSave ? "saving" : "saved");
      blockedByConflict = rebased.conflicts.length > 0;
      setError(rebased.conflicts.length ? t("builderV4.banners.conflictDescription") : "");
      if (!needsSave && presenceSessionId) {
        setRecoveredRecovery(false);
        void clearWebsiteBuilderRecovery(weddingId, presenceSessionId).catch(() => undefined);
      }
      return result;
    } catch (cause) {
      lastPersistBackendCodeRef.current = cause instanceof ApiError ? cause.backendCode : undefined;
      const message = errText(cause, t); setError(message); setSaveState("error");
      if (cause instanceof ApiError && cause.status === 409) setError(t("builderV4.errors.versionConflict"));
      return null;
    } finally {
      saveInFlight.current = false;
      setBusy(false);
      if (saved && dirtyRef.current && docRef.current && !blockedByConflict) {
        window.setTimeout(() => { const latest = docRef.current; if (latest) void persistRef.current(latest); }, 0);
      }
    }
  }
  useEffect(() => { persistRef.current = persist; });

  const update = useCallback((next: StoryBuilderV4Document, withHistory = true) => {
    const previous = docRef.current;
    if (withHistory && previous) { setUndoStack(stack => [...stack.slice(-39), { before: clone(previous), after: clone(next) }]); setRedoStack([]); }
    docRef.current = next; dirtyRef.current = true; setDoc(next); setDirty(true); setError("");
  }, []);
  function mutate(mutator: (copy: StoryBuilderV4Document) => void) { if (!doc) return; const next = clone(doc); mutator(next); update(next); }
  function replaceSection(sectionId: string, patch: Partial<StoryBuilderV4Section>) {
    mutate(copy => { const page = copy.pages.find(item => item.id === selectedPageId); const section = page?.sections.find(item => item.id === sectionId); if (section) Object.assign(section, patch); });
  }
  function editContent(sectionId: string, key: string, value: unknown) {
    mutate(copy => { const section = copy.pages.find(item => item.id === selectedPageId)?.sections.find(item => item.id === sectionId); if (section) section.content = { ...section.content, [key]: value } as typeof section.content; });
  }
  function editNested(sectionId: string, key: string, field: string, value: unknown) {
    const content = record(currentPage?.sections.find(item => item.id === sectionId)?.content);
    editContent(sectionId, key, { ...record(content[key]), [field]: value });
  }
  function editSeo(key: "title" | "description" | "imageUrl", value: string) {
    mutate(copy => {
      const seo = { ...copy.seo };
      if (value.trim()) seo[key] = value;
      else delete seo[key];
      copy.seo = Object.values(seo).some(item => typeof item === "string" && item.trim().length > 0) ? seo : undefined;
    });
  }
  function openMediaPicker(onChoose: (url: string) => void) {
    setMediaPickerTarget(() => onChoose);
    setMediaSearch("");
    setMediaPickerOpen(true);
  }
  async function confirmMediaDelete() {
    if (!mediaDeleteTarget || mediaDeleteBusy) return;
    setMediaDeleteBusy(true);
    setMediaDeleteError("");
    try {
      await deleteWeddingMedia(api, weddingId, mediaDeleteTarget.id);
      await cache.invalidateQueries({ queryKey: ["wedding-media", weddingId] });
      setMediaDeleteTarget(null);
    } catch (cause) {
      setMediaDeleteError(errText(cause, t));
    } finally {
      setMediaDeleteBusy(false);
    }
  }
  function appendGalleryImages(sectionId: string, images: Record<string, unknown>[]) {
    const latest = docRef.current;
    if (!latest) return 0;
    const next = clone(latest);
    const section = next.pages.flatMap(page => page.sections).find(item => item.id === sectionId && item.type === "gallery");
    if (!section || section.type !== "gallery") return 0;
    const content = record(section.content);
    const current = Array.isArray(content.images) ? content.images as Record<string, unknown>[] : [];
    const accepted = images.slice(0, Math.max(0, 30 - current.length));
    if (!accepted.length) return 0;
    section.content = { ...content, images: [...current, ...accepted] } as typeof section.content;
    update(next);
    return accepted.length;
  }
  function reorderSection(sourceId: string, targetId: string) {
    if (!currentPage || sourceId === targetId) return;
    mutate(copy => {
      const page = copy.pages.find(item => item.id === currentPage.id); if (!page) return;
      const from = page.sections.findIndex(item => item.id === sourceId); const to = page.sections.findIndex(item => item.id === targetId);
      if (from < 0 || to < 0) return;
      const [item] = page.sections.splice(from, 1);
      if (!item) return;
      page.sections.splice(to, 0, item);
      const hero = page.sections.findIndex(item => item.type === "hero");
      if (hero > 0) { const [heroSection] = page.sections.splice(hero, 1); if (heroSection) page.sections.unshift(heroSection); }
    });
  }
  function openSectionLibrary() {
    const available = sectionTypes.filter(type => type !== "hero" || !currentPage?.sections.some(section => section.type === "hero"));
    const initialType = available[0] ?? "hero";
    setSectionLibraryType(initialType);
    setSectionLibraryVariant(variantOptions[initialType][0] ?? "default");
    setSectionLibraryOpen(true);
  }
  function addSection(type: SectionType, variant?: string): boolean {
    const totalSections = doc?.pages.reduce((total, page) => total + page.sections.length, 0) ?? 0;
    if (!doc || !currentPage || currentPage.sections.length >= 24 || totalSections >= 80) return false;
    const templateSection = currentTemplate?.config.sections.find(item => item.type === type);
    const nextSection = createV4Section(type, doc.content, setup, templateSection?.defaultContent, templateSection?.style);
    if (variant) nextSection.variant = variant as typeof nextSection.variant;
    if (type === "hero" && currentPage.sections.some(item => item.type === "hero")) return false;
    mutate(copy => {
      const page = copy.pages.find(item => item.id === currentPage.id);
      if (!page) return;
      if (type === "hero") page.sections.unshift(nextSection);
      else {
        const selectedIndex = page.sections.findIndex(item => item.id === selectedSectionId);
        page.sections.splice(selectedIndex >= 0 ? selectedIndex + 1 : page.sections.length, 0, nextSection);
      }
    });
    selectSection(nextSection.id);
    return true;
  }
  function duplicateSection(section: StoryBuilderV4Section) {
    if (!currentPage || currentPage.sections.length >= 24 || section.type === "hero") return;
    const duplicate = { ...structuredClone(section), id: id() } as StoryBuilderV4Section;
    mutate(copy => { const page = copy.pages.find(item => item.id === currentPage.id); if (!page) return; const index = page.sections.findIndex(item => item.id === section.id); if (index >= 0) page.sections.splice(index + 1, 0, duplicate); });
    selectSection(duplicate.id);
  }
  function deleteSection(section: StoryBuilderV4Section) {
    if (!currentPage || currentPage.sections.length <= 1) return;
    mutate(copy => { const page = copy.pages.find(item => item.id === currentPage.id); if (page) page.sections = page.sections.filter(item => item.id !== section.id); });
    setSelectedSectionId(currentPage.sections.find(item => item.id !== section.id)?.id ?? "");
  }
  function addPage() {
    if (!doc || doc.pages.length >= 8 || !pageName.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pageSlug.trim())) return;
    if (doc.pages.some(page => page.slug.toLowerCase() === pageSlug.trim().toLowerCase())) { setError(t("builderV4.errors.duplicatePageSlug")); return; }
    const heroTemplateSection = currentTemplate?.config.sections.find(item => item.type === "hero");
    const rsvpTemplateSection = currentTemplate?.config.sections.find(item => item.type === "rsvp");
    const hero = createV4Section("hero", doc.content, setup, heroTemplateSection?.defaultContent, heroTemplateSection?.style);
    const rsvp = createV4Section("rsvp", doc.content, setup, rsvpTemplateSection?.defaultContent, rsvpTemplateSection?.style);
    const page = { id: id(), slug: pageSlug.trim(), title: pageName.trim(), navigationLabel: pageName.trim(), isHome: false, visible: true, sections: [hero, rsvp] };
    mutate(copy => { copy.pages.push(page); if (copy.navigationMode === "one-page") copy.navigationMode = "multi-page"; });
    setSelectedPageId(page.id); setSelectedSectionId(hero.id); setPageName(""); setPageSlug("");
  }
  function removePage(pageId: string) {
    if (!doc || doc.pages.length <= 1 || doc.pages.find(page => page.id === pageId)?.isHome) return;
    if (!window.confirm(t("builderV4.inspector.deletePageConfirm"))) return;
    mutate(copy => { copy.pages = copy.pages.filter(page => page.id !== pageId); if (copy.pages.length === 1 && copy.navigationMode === "multi-page") copy.navigationMode = "one-page"; });
    const home = doc.pages.find(page => page.isHome); if (home) { setSelectedPageId(home.id); setSelectedSectionId(home.sections[0]?.id ?? ""); }
  }
  function reorderPage(index: number, direction: -1 | 1) {
    if (!doc || moveV4Page(doc.pages, index, direction) === doc.pages) return;
    mutate(copy => { copy.pages = moveV4Page(copy.pages, index, direction); });
  }
  async function chooseOtherTemplate() {
    if (busy || conflict || saveState === "saving") return;
    let currentSite: Website = { ...initialSite, document: docRef.current, version: versionRef.current, status };
    let needsSave = false;
    if (dirtyRef.current && docRef.current) {
      const saved = await persistRef.current(docRef.current, true);
      if (saved) currentSite = saved;
      else if (lastPersistBackendCodeRef.current === "STORY_TEMPLATE_UNAVAILABLE") {
        // Keep the user's working copy in memory so a new template can be applied and saved in one operation.
        currentSite = { ...currentSite, document: clone(docRef.current) };
        needsSave = true;
      } else return;
    }
    cache.setQueryData(["website", weddingId], currentSite);
    onChooseOtherTemplate(currentSite, needsSave);
  }
  const history = useCallback((direction: "undo" | "redo") => {
    const from = direction === "undo" ? undoStack : redoStack; const to = direction === "undo" ? redoStack : undoStack;
    const operation = from.at(-1); if (!operation || !doc) return;
    const applied = applyStoryHistoryOperation(doc, operation, direction);
    if (direction === "undo") { setUndoStack(from.slice(0, -1)); setRedoStack([...to, operation]); }
    else { setRedoStack(from.slice(0, -1)); setUndoStack([...to, operation]); }
    docRef.current = applied.document; dirtyRef.current = true; setDoc(applied.document); setDirty(true);
    setError(applied.skippedChanges ? t("builderV4.errors.undoConflict") : "");
  }, [doc, undoStack, redoStack, t]);
  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || busy) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [role='textbox']"))) return;
      const key = event.key.toLocaleLowerCase();
      const direction = key === "z" && event.shiftKey || key === "y" ? "redo" : key === "z" ? "undo" : null;
      if (!direction || (direction === "undo" ? undoStack.length === 0 : redoStack.length === 0)) return;
      event.preventDefault();
      history(direction);
    };
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [busy, history, undoStack.length, redoStack.length]);
  async function uploadImage(file: File): Promise<string | null> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error(t("builderV4.errors.invalidImage"));
    setBusy(true); setError("");
    try { const result = await uploadWeddingMedia(api, weddingId, file); void cache.invalidateQueries({ queryKey: ["wedding-media", weddingId] }); return mediaUrl(result.url) ?? result.url; }
    catch (cause) { setError(errText(cause, t)); throw cause; }
    finally { setBusy(false); }
  }
  async function publish() {
    const publishDocument = docRef.current;
    if (!doc || !publishDocument || !isOwner || conflict || premiumLocked || premiumUnknown || busy || saveInFlight.current) return;
    const validationIssues = validateBuilderDocument(publishDocument, currentTemplate, t);
    if (validationIssues.length > 0) { setShowFieldErrors(true); setError(describeV4ValidationIssues(validationIssues, publishDocument)); return; }
    setShowFieldErrors(false);
    if (autoSaveTimer.current !== null) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = null;
    saveInFlight.current = true;
    setBusy(true); setError("");
    try {
      let currentVersion = versionRef.current;
      if (dirtyRef.current) {
        const saved = await saveWebsite(api, weddingId, currentVersion, publishDocument);
        currentVersion = saved.version; versionRef.current = currentVersion; setVersion(currentVersion); cache.setQueryData(["website", weddingId], saved);
        if (JSON.stringify(docRef.current) !== JSON.stringify(publishDocument)) { setError(t("builderV4.errors.pendingChanges")); return; }
        dirtyRef.current = false; setDirty(false); setSaveState("saved");
      }
      const result = await publishWebsite(api, weddingId, currentVersion);
      versionRef.current = result.version; setVersion(result.version); setStatus(result.status); cache.setQueryData(["website", weddingId], result);
      setPublishReviewOpen(false);
    } catch (cause) { setError(errText(cause, t)); void cache.invalidateQueries({ queryKey: ["website", weddingId] }); }
    finally { saveInFlight.current = false; setBusy(false); }
  }
  function dismissQuickStart() {
    setShowQuickStart(false);
  }
  function jumpToPublishIssue(issue: BuilderIssue) {
    if (!doc) return;
    const pageIndexInPath = issue.path.indexOf("pages");
    const pagePosition = pageIndexInPath >= 0 ? issue.path[pageIndexInPath + 1] : undefined;
    const page = typeof pagePosition === "number" ? doc.pages[pagePosition] : undefined;
    if (!page) return;
    const sectionIndexInPath = issue.path.indexOf("sections");
    const sectionPosition = sectionIndexInPath >= 0 ? issue.path[sectionIndexInPath + 1] : undefined;
    const section = typeof sectionPosition === "number" ? page.sections[sectionPosition] : undefined;
    setSelectedPageId(page.id);
    setSelectedSectionId(section?.id ?? page.sections[0]?.id ?? "");
    setLeftOpen(true);
    setRightOpen(true);
    if (window.matchMedia("(max-width: 767px)").matches) setMobilePanel(section ? "inspector" : "structure");
    setShowFieldErrors(true);
    setPublishReviewOpen(false);
  }
  function jumpToHiddenSection(pageId: string, sectionId?: string) {
    const page = doc?.pages.find(item => item.id === pageId);
    if (!page) return;
    setSelectedPageId(page.id);
    setSelectedSectionId(sectionId ?? page.sections[0]?.id ?? "");
    setLeftOpen(true);
    setRightOpen(true);
    if (window.matchMedia("(max-width: 767px)").matches) setMobilePanel(sectionId ? "inspector" : "structure");
    setShowFieldErrors(false);
    setPublishReviewOpen(false);
  }
  async function unpublish() {
    if (!isOwner || busy) return; setBusy(true); setError("");
    try { const result = await unpublishWebsite(api, weddingId, versionRef.current); versionRef.current = result.version; setVersion(result.version); setStatus(result.status); cache.setQueryData(["website", weddingId], result); }
    catch (cause) { setError(errText(cause, t)); } finally { setBusy(false); }
  }
  async function reloadLatest() {
    const latest = await getWebsite(api, weddingId);
    if (!isStoryBuilderV4Document(latest.document)) { setError(t("builderV4.errors.versionInvalid")); return; }
    docRef.current = latest.document; baseDocumentRef.current = latest.document; remoteDocumentRef.current = latest.document; setDoc(latest.document); setVersion(latest.version); versionRef.current = latest.version; setStatus(latest.status); setConflict(false); setMergeConflicts([]); setDirty(false); dirtyRef.current = false; setSaveState("saved"); setUndoStack([]); setRedoStack([]);
    setSelectedPageId(latest.document.pages[0]?.id ?? ""); setSelectedSectionId(latest.document.pages[0]?.sections[0]?.id ?? ""); cache.setQueryData(["website", weddingId], latest);
  }
  function applyRestoredWebsite(result: Website) {
    if (!isStoryBuilderV4Document(result.document)) { setError(t("builderV4.errors.versionInvalid")); return; }
    docRef.current = result.document; baseDocumentRef.current = result.document; remoteDocumentRef.current = result.document;
    versionRef.current = result.version;
    setDoc(result.document); setVersion(result.version); setStatus(result.status); setConflict(false); setMergeConflicts([]);
    dirtyRef.current = false; setDirty(false); setSaveState("saved"); setError(""); setShowFieldErrors(false);
    setUndoStack([]); setRedoStack([]); setRecoveredRecovery(false);
    setSelectedPageId(result.document.pages[0]?.id ?? ""); setSelectedSectionId(result.document.pages[0]?.sections[0]?.id ?? "");
    void clearLocalRecovery();
    cache.setQueryData(["website", weddingId], result);
  }

  if (!recoveryLoaded) return <div className="fixed inset-0 z-40 grid place-items-center bg-background p-6 text-center"><div><LoaderCircle className="mx-auto size-6 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">{t("builderV4.errors.checkingRecovery")}</p></div></div>;
  if (!doc) return <p className="p-6 text-sm text-muted-foreground">{t("builderV4.errors.noDraft")}</p>;
  if (!isOwner) return <div className="mx-auto max-w-3xl p-8"><FeatureLimitNotice title={t("builderV4.errors.ownerOnlyTitle")} description={t("builderV4.errors.ownerOnlyDescription")} status="unavailable" variant="full" /></div>;
  const viewportWidth = viewport === "desktop" ? 1120 : viewport === "tablet" ? 768 : 390;
  const renderedDocument = clone(doc);
  const mainWeddingEvent: WeddingEvent = { id: "main", title: t("builderV4.inspector.weddingEventFallback"), startsAt: setup.eventDateTime, timeZoneId: setup.timeZoneId, venueName: setup.venueName, address: setup.venueAddress, sortOrder: 0 };
  const eventById = new Map([[mainWeddingEvent.id, mainWeddingEvent], ...(weddingEventsQuery.data ?? []).map(event => [event.id, event] as const)]);
  for (const page of renderedDocument.pages) for (const section of page.sections) {
    if (section.type === "hero") {
      const binding = section.bindings?.find(item => item.target === "heroImageUrl");
      if (binding && binding.mode !== "manual") section.content.imageUrl = setup.coverImageUrl ?? "";
      continue;
    }
    if (section.type === "countdown") {
      const targetEventId = section.content.targetEventId;
      if (targetEventId) {
        const targetEvent = eventById.get(targetEventId);
        section.content.targetDate = targetEvent?.startsAt ?? undefined;
        section.content.timeZoneId = targetEvent?.timeZoneId ?? setup.timeZoneId;
      }
      else if (section.bindings?.some(binding => binding.target === "countdown.targetDate" && (binding.mode === undefined || binding.mode === "dynamic")))
        { section.content.targetDate = setup.eventDateTime || undefined; section.content.timeZoneId = setup.timeZoneId; }
      else section.content.timeZoneId ??= setup.timeZoneId;
      continue;
    }
    if (section.type !== "events") continue;
    const content = section.content;
    const ids = content.eventIds ?? (content.events?.length ? null : ["main"]);
    if (ids) content.events = ids.map(eventId => eventById.get(eventId)).filter((event): event is WeddingEvent => Boolean(event)).map(event => ({
      id: event.id, title: event.title, timeZoneId: event.timeZoneId,
      ...(event.description ? { description: event.description } : {}), ...(event.startsAt ? { startsAt: event.startsAt } : {}),
      ...(event.endsAt ? { endsAt: event.endsAt } : {}), ...(event.venueName ? { venueName: event.venueName } : {}),
      ...(event.address ? { address: event.address } : {}), ...(event.mapUrl ? { mapUrl: event.mapUrl } : {}), sortOrder: event.sortOrder,
    }));
  }
  const publishCanProceed = Boolean(doc && publishIssues.length === 0 && !busy && !offline && recoveryLoaded && isOwner && !conflict && !premiumLocked && !premiumUnknown);
  const saveBlockedReason = !dirty ? t("builderV4.save.noChanges", "There are no new changes to save.") : !isOwner ? t("builderV4.errors.ownerRequired") : offline ? t("builderV4.save.offline", "You're offline. Changes are kept on this device and will sync when you're back online.") : conflict ? t("builderV4.save.resolveConflict", "Resolve the content conflict before saving.") : premiumLocked ? t("builderV4.save.premiumLocked", "Your current plan doesn't include this website template.") : premiumUnknown ? t("builderV4.save.premiumUnknown", "Plan access for this Premium template couldn't be verified.") : !recoveryLoaded ? t("builderV4.save.restoring", "Restoring your saved edits on this device.") : busy ? t("builderV4.save.busy", "Another website action is in progress. Please wait.") : saveState === "saving" ? t("builderV4.save.saving", "Saving website.") : "";
  const saveActionDisabled = Boolean(saveBlockedReason);
  const publishBlockedReason = busy ? t("builderV4.publish.busy", "Website action in progress.") : offline ? t("builderV4.publish.offline", "You're offline. Reconnect before publishing.") : conflict ? t("builderV4.publish.resolveConflict", "Resolve the content conflict before publishing.") : premiumLocked ? t("builderV4.save.premiumLocked", "Your current plan doesn't include this website template.") : premiumUnknown ? t("builderV4.save.premiumUnknown", "Plan access for this Premium template couldn't be verified.") : !recoveryLoaded ? t("builderV4.save.restoring", "Restoring your saved edits on this device.") : "";
  const publishActionDisabled = Boolean(publishBlockedReason);
  const saveActionLabel = saveState === "saving" ? t("builderV4.status.saving") : dirty ? t("builderV4.actions.save") : t("builderV4.actions.saveDone");
  const saveStatusLabel = offline ? t("builderV4.status.offline") : conflict ? t("builderV4.status.conflict") : saveState === "saving" ? t("builderV4.status.savingWebsite", "Saving website…") : dirty && saveState === "error" ? t("builderV4.status.saveError") : dirty ? t("builderV4.status.dirty") : t("builderV4.status.saved");
  const paletteValue = doc.appearance.paletteId ?? currentTemplate?.config.palettes[0]?.id ?? "";
  const currentGuestExperience: GuestExperienceSettings = {
    tools: doc.appearance.guestExperience?.tools ?? [],
    decoration: doc.appearance.guestExperience?.decoration ?? "none",
    intensity: doc.appearance.guestExperience?.intensity ?? "light",
  };
  const inspectorPanel = experienceSettingsOpen
    ? <GuestExperienceInspector document={renderedDocument} settings={currentGuestExperience} onChange={settings => mutate(copy => {
        copy.appearance = { ...copy.appearance, guestExperience: settings };
      })} />
    : <Inspector
    section={currentSection}
    page={currentPage}
    sectionName={currentSection ? t(`builderV4.sectionNames.${currentSection.type}`) : undefined}
    onSection={(patch) => currentSection && replaceSection(currentSection.id, patch)}
    onContent={(key, value) => currentSection && editContent(currentSection.id, key, value)}
    onNested={(key, field, value) => currentSection && editNested(currentSection.id, key, field, value)}
    onAppendGalleryImages={images => currentSection ? appendGalleryImages(currentSection.id, images) : 0}
    onUpload={uploadImage}
    onChooseMedia={openMediaPicker}
    setup={setup}
    onBinding={(target, mode) => {
      if (!currentSection) return;
      const bindings = currentSection.bindings ?? [];
      const nextBindings = mode === null
        ? bindings.filter(binding => binding.target !== target)
        : bindings.some(binding => binding.target === target)
          ? bindings.map(binding => binding.target === target ? { ...binding, mode } : binding)
          : [...bindings, { target, source: setupBindings[currentSection.type]?.find(item => item.target === target)?.source ?? "", mode }];
      replaceSection(currentSection.id, { bindings: nextBindings } as Partial<StoryBuilderV4Section>);
    }}
    onDuplicate={() => currentSection && duplicateSection(currentSection)}
    onDelete={() => currentSection && deleteSection(currentSection)}
    pageChange={(patch) => mutate(copy => { const page = copy.pages.find(item => item.id === currentPage?.id); if (page) Object.assign(page, patch); })}
    pageDelete={() => currentPage && removePage(currentPage.id)}
    appearance={doc.appearance}
    paletteId={paletteValue}
    template={currentTemplate}
    onAppearance={(patch) => mutate(copy => { copy.appearance = { ...copy.appearance, ...patch }; })}
    gift={doc.content.gift}
    giftAccounts={giftAccountsQuery.data ?? []}
    giftAccountsLoading={giftAccountsQuery.isLoading}
    giftAccountsError={giftAccountsQuery.isError ? t("builderV4.errors.giftAccountsUnavailable") : ""}
    onReloadGiftAccounts={() => void giftAccountsQuery.refetch()}
    onGift={(patch) => mutate(copy => { copy.content.gift = { ...copy.content.gift, ...patch, enabled: patch.enabled ?? copy.content.gift?.enabled ?? false }; })}
    issues={validationIssues}
    pageIndex={pageIndex}
    sectionIndex={sectionIndex}
    weddingId={weddingId}
    selectedEventIds={currentSection?.type === "events" ? currentSection.content.eventIds ?? (currentSection.content.events?.length ? [] : ["main"]) : []}
    onEventIds={ids => currentSection?.type === "events" && editContent(currentSection.id, "eventIds", ids)}
    onFocusStoryItem={(sectionId, itemId) => {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(`story-moment-${sectionId}-${itemId}`) ?? document.getElementById(`story-gallery-image-${sectionId}-${itemId}`) ?? document.getElementById(sectionId);
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        target?.classList.add("story-moment--inspector-focus");
        window.setTimeout(() => target?.classList.remove("story-moment--inspector-focus"), 1800);
      });
    }}
    onCountdownSource={(sourceId, targetDate) => {
      if (currentSection?.type !== "countdown") return;
      mutate(copy => {
        const targetSection = copy.pages.find(page => page.id === selectedPageId)?.sections.find(section => section.id === currentSection.id);
        if (targetSection?.type !== "countdown") return;
        const content = { ...targetSection.content };
        const nextBindings = (targetSection.bindings ?? []).filter(binding => binding.target !== "countdown.targetDate");
        if (sourceId === "main") {
          delete content.targetEventId;
          content.timeZoneId = setup.timeZoneId;
          targetSection.bindings = [...nextBindings, { target: "countdown.targetDate", source: "wedding.mainEventAt", mode: "dynamic" }];
        } else {
          if (sourceId === "manual") delete content.targetEventId;
          else content.targetEventId = sourceId;
          content.timeZoneId = sourceId === "manual" ? setup.timeZoneId : eventById.get(sourceId)?.timeZoneId ?? setup.timeZoneId;
          if (targetDate) content.targetDate = targetDate;
          else delete content.targetDate;
          targetSection.bindings = nextBindings.length ? nextBindings : undefined;
        }
        targetSection.content = content;
      });
    }}
    countdownEvents={[...eventById.values()]}
    countdownEventsLoading={weddingEventsQuery.isLoading}
    countdownEventsError={weddingEventsQuery.isError}
    onReloadCountdownEvents={() => void weddingEventsQuery.refetch()}
  />;
  function openGuestExperienceSettings() {
    setExperienceSettingsOpen(true);
    setRightOpen(true);
    if (window.matchMedia("(max-width: 767px)").matches) setMobilePanel("inspector");
  }

  return <div className="fixed inset-0 z-40 flex w-full min-w-0 max-w-[100vw] flex-col overflow-x-hidden bg-[#faf8f7] text-foreground"
    onFocusCapture={event => {
      const field = displayFieldName(event.target);
      focusedFieldRef.current = field;
      if (field) lastPresenceActivityRef.current = Date.now();
      setFocusedFieldPath(field);
      setPresenceStatus(document.visibilityState === "hidden" ? "idle" : field ? "editing" : "viewing");
    }}
    onBlurCapture={event => {
      const next = event.relatedTarget;
      if (!(next instanceof HTMLElement) || !displayFieldName(next)) {
        focusedFieldRef.current = null;
        setFocusedFieldPath(null);
        setPresenceStatus(document.visibilityState === "hidden" ? "idle" : "viewing");
      }
    }}>
    <header className="z-20 flex h-14 min-h-14 shrink-0 flex-nowrap items-center gap-2 border-b border-border bg-background px-3 sm:gap-3 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3"><Link href={`/weddings/${encodeURIComponent(weddingId)}`} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={t("builderV4.actions.exit")}><ArrowLeft className="size-4" /></Link><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-sm font-semibold sm:text-base">{setup.name}</h1><span title={status === "PUBLISHED" ? t("builderV4.status.published") : t("builderV4.status.draft")} aria-label={status === "PUBLISHED" ? t("builderV4.status.published") : t("builderV4.status.draft")} className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] max-[420px]:size-2 max-[420px]:rounded-full max-[420px]:p-0 ${status === "PUBLISHED" ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}><span className="max-[420px]:hidden">{status === "PUBLISHED" ? t("builderV4.status.published") : t("builderV4.status.draft")}</span><span aria-hidden="true" className="hidden size-1.5 rounded-full bg-current max-[420px]:inline" /></span></div><p aria-live="polite" className="truncate text-xs text-muted-foreground">{saveStatusLabel}</p></div>
      </div>
      <div role="group" aria-label={t("builderV4.actions.commonWebsiteActions", "Common website actions")} className="relative flex shrink-0 items-center gap-1 sm:gap-1.5" ref={toolbarActionsRef}>
        <button type="button" aria-label={t("builderV4.actions.undo")} title={`${t("builderV4.actions.undo")} · Ctrl/⌘+Z`} disabled={!undoStack.length || busy} className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-35 min-[640px]:inline-flex" onClick={() => history("undo")}><Undo2 className="size-4" /></button>
        <button type="button" aria-label={t("builderV4.actions.redo")} title={`${t("builderV4.actions.redo")} · Ctrl/⌘+Shift+Z`} disabled={!redoStack.length || busy} className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-35 min-[640px]:inline-flex" onClick={() => history("redo")}><Redo2 className="size-4" /></button>
        <span aria-hidden="true" className="mx-0.5 hidden h-6 border-l border-border min-[640px]:block" />
        <button type="button" aria-label={preview ? t("builderV4.actions.editWebsite", "Edit website") : t("builderV4.actions.previewWebsite", "Preview website")} title={preview ? t("builderV4.actions.edit") : t("builderV4.actions.preview")} aria-pressed={preview} className={`inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg border bg-background text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-[1100px]:w-auto min-[1100px]:px-3 ${preview ? "border-primary text-primary-hover" : "border-border"}`} onClick={() => setPreview(value => !value)}>
          {preview ? <X className="size-4" /> : <Eye className="size-4" />}<span className="hidden min-[1100px]:inline">{preview ? t("builderV4.actions.edit") : t("builderV4.actions.preview")}</span>
        </button>
        <button type="button" aria-label={t("builderV4.guestExperience.title")} title={t("builderV4.guestExperience.title")} aria-pressed={experienceSettingsOpen} className={`inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg border bg-background text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-[1100px]:w-auto min-[1100px]:px-3 ${experienceSettingsOpen ? "border-primary text-primary-hover" : "border-border"}`} onClick={() => experienceSettingsOpen ? setExperienceSettingsOpen(false) : openGuestExperienceSettings()}>
          <Sparkles className="size-4" /><span className="hidden min-[1100px]:inline">{t("builderV4.guestExperience.title")}</span>
        </button>
        <button type="button" aria-label={saveActionDisabled ? saveBlockedReason : t("builderV4.save.saveNowAuto", "Save now; autosave remains on.")} title={saveActionDisabled ? saveBlockedReason : t("builderV4.save.saveNowAuto", "Save now · autosave remains on")} disabled={saveActionDisabled} className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45 min-[1100px]:min-w-[104px] min-[1100px]:px-3" onClick={() => { const latest = docRef.current; if (latest) void persist(latest, true); }}>
          {saveState === "saving" ? <LoaderCircle className="size-4 animate-spin" /> : saveState === "saved" && !dirty ? <Check className="size-4" /> : <Save className="size-4" />}<span className="hidden min-[1100px]:inline">{saveActionLabel}</span>
        </button>
        <button type="button" aria-label={publishActionDisabled ? publishBlockedReason : status === "PUBLISHED" ? t("builderV4.publish.republishCheck", "Review and republish website") : t("builderV4.publish.publishCheck", "Review and publish website")} title={publishActionDisabled ? publishBlockedReason : status === "PUBLISHED" ? t("builderV4.publish.republishCheck", "Review and republish") : t("builderV4.publish.publishCheck", "Review and publish")} disabled={publishActionDisabled} className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-0 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-[1100px]:w-auto min-[1100px]:min-w-[132px] min-[1100px]:px-3" onClick={() => setPublishReviewOpen(true)}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}<span className="hidden min-[1100px]:inline">{status === "PUBLISHED" ? t("builderV4.actions.republish") : t("builderV4.actions.publish")}</span>
        </button>
        <button type="button" aria-label={t("builderV4.actions.more")} title={t("builderV4.actions.more")} aria-expanded={toolbarActionsOpen} aria-haspopup="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => { if (toolbarActionsOpen) setLanguageOptionsOpen(false); setToolbarActionsOpen(!toolbarActionsOpen); }}><MoreHorizontal className="size-4" /></button>
        {toolbarActionsOpen && <div role="group" aria-label={t("builderV4.actions.otherActions")} className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh-4.5rem)] min-w-56 overflow-y-auto rounded-xl border border-border bg-background p-2 shadow-xl">
          <div className="flex gap-1 border-b border-border pb-2 min-[640px]:hidden">
            <button type="button" title="Ctrl/⌘+Z" className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40" disabled={!undoStack.length || busy} onClick={() => { history("undo"); setToolbarActionsOpen(false); }}><Undo2 className="size-4" />{t("builderV4.actions.undo")}</button>
            <button type="button" title="Ctrl/⌘+Shift+Z" className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40" disabled={!redoStack.length || busy} onClick={() => { history("redo"); setToolbarActionsOpen(false); }}><Redo2 className="size-4" />{t("builderV4.actions.redo")}</button>
          </div>
          <button type="button" aria-expanded={languageOptionsOpen} aria-controls="builder-language-options" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setLanguageOptionsOpen(open => !open)}>
            <Languages aria-hidden="true" className="size-4 text-muted-foreground" />
            <span>{language === "en" ? "Language" : "Ngôn ngữ"}</span>
            <ChevronDown aria-hidden="true" className={`ml-auto size-4 text-muted-foreground transition-transform ${languageOptionsOpen ? "rotate-180" : ""}`} />
          </button>
          <div id="builder-language-options" role="group" aria-label={language === "en" ? "Language" : "Ngôn ngữ"} hidden={!languageOptionsOpen} className="space-y-1 px-1 pb-1 pt-1">
            <button type="button" aria-pressed={language === "en"} className={`flex min-h-10 w-full items-center rounded-lg px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${language === "en" ? "bg-primary/10 font-semibold text-primary-hover" : "hover:bg-muted"}`} onClick={() => { setLanguage("en"); setLanguageOptionsOpen(false); setToolbarActionsOpen(false); }}>
              <span>English</span>{language === "en" && <Check aria-hidden="true" className="ml-auto size-4" />}
            </button>
            <button type="button" aria-pressed={language === "vi"} className={`flex min-h-10 w-full items-center rounded-lg px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${language === "vi" ? "bg-primary/10 font-semibold text-primary-hover" : "hover:bg-muted"}`} onClick={() => { setLanguage("vi"); setLanguageOptionsOpen(false); setToolbarActionsOpen(false); }}>
              <span>Tiếng Việt</span>{language === "vi" && <Check aria-hidden="true" className="ml-auto size-4" />}
            </button>
          </div>
          <div className="my-1 border-t border-border" />
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground min-[640px]:hidden">{t("builderV4.inspector.contentTab")}</p>
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.actions.website", "Website")}</p>
          <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40" disabled={busy || conflict || saveState === "saving"} onClick={() => { setToolbarActionsOpen(false); void chooseOtherTemplate(); }}><Eye className="size-4" />{t("builderV4.actions.changeTemplate")}</button>
          <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => { setToolbarActionsOpen(false); setVersionHistoryOpen(true); }}><History className="size-4" />{t("builderV4.actions.history")}</button>
          {status === "PUBLISHED" && setup.slug && <Link className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href={`/wedding/${encodeURIComponent(setup.slug)}`} target="_blank" rel="noreferrer" onClick={() => setToolbarActionsOpen(false)}><Globe className="size-4" />{t("builderV4.actions.openWebsite")}</Link>}
          <div className="my-1 border-t border-border" />
          <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.actions.share", "Share")}</p>
          <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => { setToolbarActionsOpen(false); setShareSettingsOpen(true); }}><Globe className="size-4" />{t("builderV4.actions.shareSeo")}</button>
          {status === "PUBLISHED" && <><div className="my-1 border-t border-border" /><p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.publish.management", "Publishing")}</p><button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40" disabled={busy} onClick={() => { setToolbarActionsOpen(false); void unpublish(); }}>{t("builderV4.actions.unpublish")}</button></>}
        </div>}
      </div>
    </header>
    {conflict && <section role="alert" aria-label={t("builderV4.banners.conflictTitle")} className="z-10 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{t("builderV4.banners.conflictTitle")}</p><p className="mt-0.5">{t("builderV4.banners.conflictDescription")}</p></div>{mergeConflicts.length === 0 && <Button size="sm" variant="outline" onClick={() => void reloadLatest()}><RefreshCw className="mr-1.5 size-3.5" />{t("builderV4.banners.reloadLatest")}</Button>}</div>
      {mergeConflicts.length > 0 && <ul className="mt-3 grid gap-2 lg:grid-cols-2">{mergeConflicts.map((issue, index) => {
        const location = doc ? conflictLocation(issue.path, doc, t) : { pageId: undefined, sectionId: undefined, label: t("builderV4.banners.websiteContent") };
        const remoteEditor = builderPresence.find(presence => presence.status === "editing" &&
          (!location.pageId || presence.pageId === location.pageId) && (!location.sectionId || presence.sectionId === location.sectionId));
        return <li key={`${issue.path.join("/")}-${index}`} className="rounded-lg border border-amber-300/80 bg-white/75 p-3"><p className="font-medium" title={location.label}>{location.label}</p><div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="min-w-0 rounded-md bg-primary/[0.06] p-2"><p className="text-[11px] font-semibold uppercase tracking-wide">{t("builderV4.banners.localVersion")} · {displayName || t("builderV4.banners.thisSession")}</p><p className="mt-1 break-words text-xs">{doc ? conflictValuePreview(issue.localExists, issue.localValue, issue.path, doc, t) : t("builderV4.banners.updatedContent")}</p><Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => resolveMerge(index, "local")}>{t("builderV4.banners.keepLocal")}</Button></div>
          <div className="min-w-0 rounded-md bg-muted/70 p-2"><p className="text-[11px] font-semibold uppercase tracking-wide">{t("builderV4.banners.latestSaved")}</p>{remoteEditor && <p className="mt-1 text-[11px] text-muted-foreground">{t("builderV4.banners.remoteEditing", { name: remoteEditor.displayName })}</p>}<p className="mt-1 break-words text-xs">{doc ? conflictValuePreview(issue.remoteExists, issue.remoteValue, issue.path, doc, t) : t("builderV4.banners.savedContent")}</p><Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => resolveMerge(index, "remote")}>{t("builderV4.banners.useRemote")}</Button></div>
        </div></li>;
      })}</ul>}
    </section>}
    {recoveredRecovery && <div role="status" className="z-10 flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 bg-primary/[0.05] px-4 py-2 text-sm"><span>{t("builderV4.banners.restoredRecovery")}</span><Button size="sm" variant="outline" onClick={() => void clearLocalRecovery()}>{t("builderV4.banners.clearRecovery")}</Button></div>}
    {offline && <div role="status" className="z-10 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">{t("builderV4.banners.offline")}</div>}
    {error && <div role="alert" className="z-10 flex items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive"><span>{error}</span><button aria-label={t("builderV4.banners.close")} onClick={() => setError("")}><X className="size-4" /></button></div>}
    <section aria-label={t("builderV4.collaboration.sectionLabel")} aria-live="polite" className="z-10 border-b border-primary/20 bg-primary/[0.055] px-3 py-2 sm:px-5 md:py-2.5">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-x-3 md:gap-y-2">
        <div className="flex min-w-0 items-center justify-between gap-2 md:contents">
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-primary-hover"><UsersRound className="size-4 shrink-0" /><span className="truncate">{builderPresenceDetails.length > 0 ? <><span className="md:hidden">{t("builderV4.collaboration.withOthersShort")}</span><span className="hidden md:inline">{t("builderV4.collaboration.withOthers")}</span></> : t("builderV4.collaboration.none")}</span>{builderPresenceDetails.length > 0 && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5">{builderPresenceDetails.length}</span>}</div>
          <button type="button" onClick={() => { setSuggestedDisplayName(localStorage.getItem(`inviteme:builder:${weddingId}:label`) || displayName); setCustomDisplayName(displayName); setIdentityPromptOpen(true); }} className="inline-flex min-h-8 max-w-[150px] shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-background/80 px-2.5 text-xs text-foreground hover:bg-primary/10 sm:max-w-[190px]" aria-label={t("builderV4.collaboration.changeDisplayName")}><UserRound className="size-3.5 shrink-0 text-primary" /><span className="truncate">{displayName || t("builderV4.collaboration.setName")}</span></button>
        </div>
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-1 md:flex-wrap md:overflow-visible md:pb-0 md:snap-none">
          {builderPresenceDetails.length === 0 && <span className="max-w-full py-1 text-xs leading-5 text-muted-foreground"><span className="md:hidden">{t("builderV4.collaboration.openAnotherTab")}</span><span className="hidden md:inline">{t("builderV4.collaboration.openAnotherTabDesktop")}</span></span>}
          {builderPresenceDetails.map(({ presence, pageTitle, sectionTitle, fieldTitle, statusTitle }) => {
            const canNavigate = Boolean(doc?.pages.some(page => page.id === presence.pageId));
            const location = [pageTitle, sectionTitle, fieldTitle].filter(Boolean).join(" · ");
            const destination = [pageTitle, sectionTitle, fieldTitle].filter(Boolean).join(", ");
            return <button key={presence.sessionId} type="button" disabled={!canNavigate} onClick={() => goToPresence(presence)} aria-label={canNavigate ? t("builderV4.collaboration.goTo", { name: presence.displayName, destination }) : t("builderV4.collaboration.missingLocation", { name: presence.displayName })} title={canNavigate ? `${presence.displayName} · ${statusTitle} · ${location || t("builderV4.collaboration.website")}` : t("builderV4.collaboration.pageChanged")} className="group flex min-h-12 w-[min(78vw,290px)] shrink-0 snap-start items-center gap-2 rounded-xl border border-primary/15 bg-background/90 px-2.5 py-2 text-left shadow-sm transition hover:border-primary/35 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-55 md:min-h-11 md:w-auto md:max-w-[310px] md:flex-1 md:rounded-lg md:py-1.5">
              <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${presence.status === "editing" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>{presence.displayName.slice(0, 1).toLocaleUpperCase("vi-VN")}</span>
              <span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-1.5"><span className="truncate text-xs font-semibold text-foreground">{presence.displayName}</span><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${presence.status === "editing" ? "bg-primary/10 text-primary-hover" : "bg-muted text-muted-foreground"}`}>{statusTitle}</span></span><span className="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground">{location || t("builderV4.collaboration.atWebsite")}</span></span>
              <ChevronRight className="size-4 shrink-0 text-primary/70 transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>;
          })}
        </div>
      </div>
    </section>
    {templateNotInNewSelections && <div role="status" className="z-10 flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"><span>{t("builderV4.banners.archivedTemplate")}</span><Button size="sm" variant="outline" disabled={busy || conflict || saveState === "saving"} onClick={() => void chooseOtherTemplate()}><Eye className="mr-1.5 size-4" />{t("builderV4.gallery.chooseTemplate")}</Button></div>}
    {showQuickStart && !preview && <section aria-label={t("builderV4.banners.quickStart", "Quick start guide")} className="z-10 border-b border-primary/15 bg-primary/[0.045] px-3 py-2.5 sm:px-5">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2">
        <p className="shrink-0 text-xs font-semibold text-foreground">{t("builderV4.banners.quickStart")}</p>
        <ol className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li><span className="mr-1 font-semibold text-primary">1</span>{t("builderV4.banners.step1")}</li>
          <li><span className="mr-1 font-semibold text-primary">2</span>{t("builderV4.banners.step2")}</li>
          <li><span className="mr-1 font-semibold text-primary">3</span>{t("builderV4.banners.step3")}</li>
        </ol>
        <button type="button" className="min-h-10 rounded-lg px-3 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={dismissQuickStart}>{t("builderV4.banners.gotIt")}</button>
      </div>
    </section>}
    <div className="flex min-h-0 flex-1">
      {!preview && leftOpen && <aside className="hidden w-[254px] shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.workspace.pagesAndContent")}</span><button className="text-xs text-primary" onClick={() => setLeftOpen(false)}>{t("builderV4.workspace.collapse")}</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">{t("builderV4.workspace.pages")}</div>
          {doc.pages.map((page, index) => <div key={page.id} className={`group mb-1 flex items-center gap-0.5 rounded-lg ${page.id === currentPage?.id ? "bg-primary/10 text-primary-hover" : "hover:bg-muted"}`}>
            <button type="button" className="min-h-10 min-w-0 flex-1 truncate px-3 text-left text-sm" onClick={() => selectPage(page.id)} aria-current={page.id === currentPage?.id ? "page" : undefined}>{page.isHome ? "⌂  " : "　"}{page.navigationLabel || page.title}</button>
            {!page.isHome && <>
              <button type="button" className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-25" title={t("builderV4.workspace.movePageUp")} aria-label={`${t("builderV4.workspace.movePageUp")} · ${page.title}`} disabled={index === 0 || doc.pages[index - 1]?.isHome} onClick={() => reorderPage(index, -1)}><ChevronUp className="size-3.5" /></button>
              <button type="button" className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-25" title={t("builderV4.workspace.movePageDown")} aria-label={`${t("builderV4.workspace.movePageDown")} · ${page.title}`} disabled={index === doc.pages.length - 1 || doc.pages[index + 1]?.isHome} onClick={() => reorderPage(index, 1)}><ChevronDown className="size-3.5" /></button>
              <button type="button" className="mr-1 grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100 focus-visible:opacity-100" aria-label={t("builderV4.workspace.deletePage", { title: page.title })} onClick={() => removePage(page.id)}><Trash2 className="size-3.5" /></button>
            </>}
          </div>)}
          {doc.pages.length < 8 && <div className="my-3 space-y-2 border-b border-border pb-4">
            <input className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm" value={pageName} onChange={event => { setPageName(event.target.value); if (!pageSlug) setPageSlug(event.target.value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} placeholder={t("builderV4.workspace.newPageName")} aria-label={t("builderV4.workspace.newPageName")} />
            <div className="flex gap-2"><input className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm" value={pageSlug} onChange={event => setPageSlug(event.target.value)} placeholder={t("builderV4.workspace.slugPlaceholder")} aria-label={t("builderV4.workspace.newPageSlug")} /><button className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40" disabled={!pageName.trim() || !pageSlug.trim()} onClick={addPage} aria-label={t("builderV4.workspace.addPageTitle")}><Plus className="size-4" /></button></div>
          </div>}
          <div className="mb-2 mt-4 flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{t("builderV4.workspace.sectionList")}</span><Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={!currentPage || currentPage.sections.length >= 24 || doc.pages.reduce((total, page) => total + page.sections.length, 0) >= 80} onClick={openSectionLibrary}><Plus className="mr-1 size-3.5" />{t("builderV4.workspace.addSection")}</Button></div>
          {currentPage?.sections.map((section, index) => {
            const sectionPeers = presenceBySection.get(section.id) ?? [];
            return <div key={section.id}
            onDragOver={event => { event.preventDefault(); setDropSectionId(section.id); }}
            onDrop={event => { event.preventDefault(); if (dragSectionId) reorderSection(dragSectionId, section.id); setDragSectionId(null); setDropSectionId(null); }}
            className={`group mb-1 flex items-center gap-0.5 rounded-lg border ${section.id === currentSection?.id ? "border-primary/40 bg-primary/5" : sectionPeers.length ? "border-primary/25 bg-primary/[0.035]" : "border-transparent hover:border-border hover:bg-muted/50"} ${dropSectionId === section.id && dragSectionId !== section.id ? "border-b-2 border-b-primary" : ""} ${dragSectionId === section.id ? "opacity-45" : ""}`}>
            <button type="button" draggable={section.type !== "hero"} className={`grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background ${section.type === "hero" ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}`} aria-label={t("builderV4.workspace.dragSection", { section: t(`builderV4.sectionNames.${section.type}`) })} title={section.type === "hero" ? t("builderV4.workspace.heroAlwaysFirst") : t("builderV4.workspace.dragToSort")} onDragStart={event => { if (section.type === "hero") { event.preventDefault(); return; } setDragSectionId(section.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", section.id); }} onDragEnd={() => { setDragSectionId(null); setDropSectionId(null); }}><GripVertical className="size-4" /></button>
            <button type="button" className="min-h-10 min-w-0 flex-1 truncate px-2 text-left text-sm" onClick={() => selectSection(section.id)} aria-current={section.id === currentSection?.id ? "true" : undefined}><span className="mr-2 text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>{t(`builderV4.sectionNames.${section.type}`)}</button>
            {sectionPeers.length > 0 && <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${sectionPeers.some(peer => peer.status === "editing") ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`} title={sectionPeers.map(peer => `${peer.displayName} · ${peer.status === "editing" ? t("builderV4.collaboration.editing") : peer.status === "idle" ? t("builderV4.collaboration.idle") : t("builderV4.collaboration.viewing")}${peer.status === "editing" && peer.fieldPath ? ` · ${presenceFieldLabel(peer.fieldPath, t)}` : ""}`).join("; ")} aria-label={`${sectionPeers.map(peer => peer.displayName).join(", ")} · ${t("builderV4.collaboration.atSection", { section: t(`builderV4.sectionNames.${section.type}`) })}`}>{sectionPeers.length > 1 ? sectionPeers.length : sectionPeers[0]?.displayName.slice(0, 1).toLocaleUpperCase(i18n.language)}</span>}
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background" title={section.visible === false ? t("builderV4.workspace.hiddenSection") : t("builderV4.workspace.visibleSection")} onClick={() => replaceSection(section.id, { visible: section.visible === false })} aria-label={section.visible === false ? t("builderV4.workspace.showSection", { section: t(`builderV4.sectionNames.${section.type}`) }) : t("builderV4.workspace.hideSection", { section: t(`builderV4.sectionNames.${section.type}`) })}>{section.visible === false ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button>
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 pointer-events-none hover:bg-background group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto disabled:opacity-30" aria-label={t("builderV4.workspace.moveSectionUp", { section: t(`builderV4.sectionNames.${section.type}`) })} disabled={index === 0 || section.type === "hero" || currentPage?.sections[index - 1]?.type === "hero"} onClick={() => { const target = currentPage?.sections[index - 1]; if (target) reorderSection(section.id, target.id); }}><ChevronUp className="size-3.5" /></button>
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 pointer-events-none hover:bg-background group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto disabled:opacity-30" aria-label={t("builderV4.workspace.moveSectionDown", { section: t(`builderV4.sectionNames.${section.type}`) })} disabled={index === (currentPage?.sections.length ?? 0) - 1 || section.type === "hero"} onClick={() => { const target = currentPage?.sections[index + 1]; if (target) reorderSection(section.id, target.id); }}><ChevronDown className="size-3.5" /></button>
          </div>;
          })}
          <label className="mt-5 grid gap-1 text-xs text-muted-foreground">{t("builderV4.workspace.navigationMode")}
            <select className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground" value={doc.navigationMode} onChange={event => mutate(copy => { copy.navigationMode = event.target.value as StoryBuilderV4Document["navigationMode"]; })}>
              {doc.pages.length === 1 && <option value="one-page">{t("builderV4.workspace.onePage")}</option>}{doc.pages.length >= 2 && <option value="multi-page">{t("builderV4.workspace.multiPage")}</option>}<option value="hybrid">{t("builderV4.workspace.hybrid")}</option>
            </select>
          </label>
        </div>
      </aside>}
      {!preview && !leftOpen && <button type="button" className="hidden w-9 shrink-0 place-items-center border-r border-border bg-background text-muted-foreground hover:text-foreground md:grid" onClick={() => setLeftOpen(true)} aria-label={t("builderV4.actions.openPageList")}><ChevronRight className="size-4" /></button>}
      <main className="relative min-w-0 flex-1 overflow-hidden">
        {!preview && <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2"><select className="h-9 max-w-[135px] truncate rounded-lg border border-input bg-background px-2 text-sm sm:max-w-[170px]" value={currentPage?.id ?? ""} onChange={event => selectPage(event.target.value)} aria-label={t("builderV4.workspace.pageBeingViewed")}>{doc.pages.map(page => <option key={page.id} value={page.id}>{page.title}</option>)}</select><span className="hidden text-xs text-muted-foreground lg:inline">{t("builderV4.workspace.selectSectionHint")} · v{version}</span></div>
          <div className="flex items-center gap-1" aria-label={t("builderV4.workspace.canvasSize")}><ViewportButton label={t("builderV4.workspace.desktop")} active={viewport === "desktop"} onClick={() => setViewport("desktop")}><Monitor className="size-4" /></ViewportButton><ViewportButton label={t("builderV4.workspace.tablet")} active={viewport === "tablet"} onClick={() => setViewport("tablet")}><Tablet className="size-4" /></ViewportButton><ViewportButton label={t("builderV4.workspace.phone")} active={viewport === "mobile"} onClick={() => setViewport("mobile")}><Smartphone className="size-4" /></ViewportButton></div>
        </div>}
        {preview && <div className="flex min-h-12 items-center justify-between border-b border-border bg-background px-4"><span className="text-sm font-medium">{t("builderV4.workspace.previewTitle", { title: currentPage?.title ?? t("builderV4.workspace.currentPage") })}</span><Button variant="outline" size="sm" onClick={() => setPreview(false)}><X className="mr-1.5 size-4" />{t("builderV4.workspace.closePreview")}</Button></div>}
        <div className="h-full overflow-auto bg-[#f1eeed] p-3 pb-20 sm:p-6 sm:pb-6">
          <div className="mx-auto min-h-full overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-[width]" style={{ width: viewportWidth, maxWidth: "100%" }}>
            <StoryBuilderV4Renderer
              document={renderedDocument}
              slug={status === "PUBLISHED" ? setup.slug : undefined}
              weddingId={weddingId}
              giftAccounts={giftAccountsQuery.data ?? []}
              pagePath={currentPage?.slug}
              showHidden={!preview}
              editable={!preview}
              showGuestExperiencePreview={preview || experienceSettingsOpen}
              selectedSectionId={currentSection?.id}
              onSelectSection={selectSection}
              onInlineEdit={(sectionId, key, value) => {
                const activeSection = currentPage?.sections.find(item => item.id === sectionId);
                if (activeSection) editContent(sectionId, key, value);
              }}
              onNavigatePage={preview || experienceSettingsOpen ? pagePath => {
                const page = doc.pages.find(item => item.slug === pagePath);
                if (!page) return;
                setSelectedPageId(page.id);
                setSelectedSectionId(page.sections.find(section => section.visible !== false)?.id ?? page.sections[0]?.id ?? "");
              } : undefined}
            />
          </div>
        </div>
      </main>
      {!preview && rightOpen && <aside className="hidden w-[310px] min-w-0 shrink-0 flex-col overflow-x-hidden overflow-y-auto border-l border-border bg-background md:flex">{inspectorPanel}</aside>}
      {!preview && !rightOpen && <button type="button" className="hidden w-9 shrink-0 place-items-center border-l border-border bg-background text-muted-foreground hover:text-foreground md:grid" onClick={() => setRightOpen(true)} aria-label={t("builderV4.workspace.openInspector")}><ChevronLeft className="size-4" /></button>}
    </div>
    {!preview && <nav aria-label={t("builderV4.workspace.mobileTools")} className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(55,35,40,0.08)] backdrop-blur md:hidden">
      <button type="button" className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs text-muted-foreground" aria-label={t("builderV4.workspace.mobileStructure")} onClick={() => setMobilePanel("structure")}><Menu className="size-4" />{t("builderV4.workspace.mobileStructure")}</button>
      <button type="button" className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs text-muted-foreground" aria-label={t("builderV4.workspace.mobileEdit")} onClick={() => { setExperienceSettingsOpen(false); setMobilePanel("inspector"); }}><ImageIcon className="size-4" />{t("builderV4.workspace.mobileEdit")}</button>
      <button type="button" className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${experienceSettingsOpen ? "text-primary" : "text-muted-foreground"}`} aria-label={t("builderV4.workspace.mobileGuest")} aria-pressed={experienceSettingsOpen} onClick={openGuestExperienceSettings}><Sparkles className="size-4" />{t("builderV4.workspace.mobileGuest")}</button>
      <button type="button" className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs text-primary" aria-label={t("builderV4.workspace.mobilePreview")} onClick={() => setPreview(true)}><Eye className="size-4" />{t("builderV4.actions.preview")}</button>
    </nav>}
    {mobilePanel && !preview && <div className="fixed inset-0 z-30 w-full max-w-[100vw] overflow-x-hidden bg-black/30 md:hidden" role="presentation" onClick={() => setMobilePanel(null)}><section role="dialog" aria-modal="true" aria-label={mobilePanel === "structure" ? t("builderV4.workspace.pageAndSectionDialog") : experienceSettingsOpen ? t("builderV4.guestExperience.title") : t("builderV4.actions.editWebsite")} className="absolute inset-x-0 bottom-0 flex w-full min-w-0 max-w-[100vw] max-h-[78dvh] flex-col overflow-x-hidden overflow-y-hidden rounded-t-2xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border px-2 py-3"><div className="flex min-w-0 flex-1 gap-1 overflow-hidden rounded-lg bg-muted p-1"><button type="button" aria-pressed={mobilePanel === "structure"} className={`min-w-0 flex-1 truncate rounded-md px-2 py-2 text-xs sm:text-sm ${mobilePanel === "structure" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setMobilePanel("structure")}>{t("builderV4.workspace.mobileStructure")}</button><button type="button" aria-pressed={mobilePanel === "inspector" && !experienceSettingsOpen} className={`min-w-0 flex-1 truncate rounded-md px-2 py-2 text-xs sm:text-sm ${mobilePanel === "inspector" && !experienceSettingsOpen ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => { setExperienceSettingsOpen(false); setMobilePanel("inspector"); }}>{t("builderV4.workspace.mobileEdit")}</button><button type="button" aria-pressed={mobilePanel === "inspector" && experienceSettingsOpen} className={`min-w-0 flex-1 truncate rounded-md px-2 py-2 text-xs sm:text-sm ${mobilePanel === "inspector" && experienceSettingsOpen ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={openGuestExperienceSettings}>{t("builderV4.workspace.mobileGuest")}</button></div><Button className="shrink-0" variant="ghost" size="sm" onClick={() => setMobilePanel(null)} aria-label={t("builderV4.workspace.closeEditorPanel")}><X className="size-4" /></Button></div>
      {mobilePanel === "structure" ? <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
       <p className="mb-2 text-xs font-medium text-muted-foreground">{t("builderV4.workspace.pages")}</p>
      {doc.pages.map((page, index) => <div key={page.id} className={`mb-1 flex items-center gap-1 rounded-lg ${page.id === currentPage?.id ? "bg-primary/10" : ""}`}>
         <button type="button" className="min-h-11 min-w-0 flex-1 truncate px-3 text-left text-sm" onClick={() => selectPage(page.id)} aria-current={page.id === currentPage?.id ? "page" : undefined}>{page.navigationLabel || page.title}{page.isHome ? ` · ${t("builderV4.workspace.homePageMarker")}` : ""}</button>
        {!page.isHome && <>
           <button type="button" className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-background disabled:opacity-30" aria-label={`${t("builderV4.workspace.movePageUp")} · ${page.title}`} disabled={index === 0 || doc.pages[index - 1]?.isHome} onClick={() => reorderPage(index, -1)}><ChevronUp className="size-4" /></button>
           <button type="button" className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-background disabled:opacity-30" aria-label={`${t("builderV4.workspace.movePageDown")} · ${page.title}`} disabled={index === doc.pages.length - 1 || doc.pages[index + 1]?.isHome} onClick={() => reorderPage(index, 1)}><ChevronDown className="size-4" /></button>
           <Button size="sm" variant="ghost" className="min-h-11 text-destructive" onClick={() => removePage(page.id)}>{t("builderV4.actions.delete")}</Button>
        </>}
      </div>)}
       {doc.pages.length < 8 && <div className="my-3 grid gap-2 border-b border-border pb-4"><input className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={pageName} onChange={event => { setPageName(event.target.value); if (!pageSlug) setPageSlug(event.target.value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} placeholder={t("builderV4.workspace.newPageName")} aria-label={t("builderV4.workspace.newPageName")} /><div className="flex gap-2"><input className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm" value={pageSlug} onChange={event => setPageSlug(event.target.value)} placeholder={t("builderV4.workspace.slugPlaceholder")} aria-label={t("builderV4.workspace.newPageSlug")} /><Button size="sm" disabled={!pageName.trim() || !pageSlug.trim()} onClick={addPage}>{t("builderV4.workspace.addPage")}</Button></div></div>}
       <div className="mb-2 flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">{t("builderV4.workspace.sectionList")}</p><Button type="button" size="sm" variant="outline" className="min-h-10" disabled={!currentPage || currentPage.sections.length >= 24 || doc.pages.reduce((total, page) => total + page.sections.length, 0) >= 80} onClick={openSectionLibrary}><Plus className="mr-1 size-3.5" />{t("builderV4.workspace.addSection")}</Button></div>
       {currentPage?.sections.map((section, index) => <div key={section.id} className={`mb-1 flex items-center gap-1 rounded-lg border px-1 ${section.id === currentSection?.id ? "border-primary/40 bg-primary/5" : "border-transparent"}`}><button type="button" className="min-h-11 min-w-0 flex-1 truncate px-2 text-left text-sm" onClick={() => selectSection(section.id)} aria-current={section.id === currentSection?.id ? "true" : undefined}>{t(`builderV4.sectionNames.${section.type}`)}{section.visible === false ? ` · ${t("builderV4.workspace.hidden")}` : ""}</button><button type="button" className="grid size-9 place-items-center rounded-md" aria-label={t("builderV4.workspace.moveSectionUp", { section: t(`builderV4.sectionNames.${section.type}`) })} disabled={index === 0 || section.type === "hero" || currentPage.sections[index - 1]?.type === "hero"} onClick={() => { const target = currentPage.sections[index - 1]; if (target) reorderSection(section.id, target.id); }}><ChevronUp className="size-4" /></button><button type="button" className="grid size-9 place-items-center rounded-md" aria-label={t("builderV4.workspace.moveSectionDown", { section: t(`builderV4.sectionNames.${section.type}`) })} disabled={index === currentPage.sections.length - 1 || section.type === "hero"} onClick={() => { const target = currentPage.sections[index + 1]; if (target) reorderSection(section.id, target.id); }}><ChevronDown className="size-4" /></button><button type="button" className="grid size-9 place-items-center rounded-md" onClick={() => replaceSection(section.id, { visible: section.visible === false })} aria-label={section.visible === false ? t("builderV4.workspace.showSection", { section: t(`builderV4.sectionNames.${section.type}`) }) : t("builderV4.workspace.hideSection", { section: t(`builderV4.sectionNames.${section.type}`) })}>{section.visible === false ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>)}
       <label className="mt-4 grid gap-1 text-xs text-muted-foreground">{t("builderV4.workspace.navigationMode")}<select className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" value={doc.navigationMode} onChange={event => mutate(copy => { copy.navigationMode = event.target.value as StoryBuilderV4Document["navigationMode"]; })}>{doc.pages.length === 1 && <option value="one-page">{t("builderV4.workspace.onePage")}</option>}{doc.pages.length >= 2 && <option value="multi-page">{t("builderV4.workspace.multiPage")}</option>}<option value="hybrid">{t("builderV4.workspace.hybrid")}</option></select></label>
      </div> : <div className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto">{inspectorPanel}</div>}
    </section></div>}
    <WebsiteVersionHistoryDialog
      open={versionHistoryOpen}
      onClose={() => setVersionHistoryOpen(false)}
      weddingId={weddingId}
      currentVersion={version}
      restoreBlocked={dirty || conflict || offline || busy || recoveredRecovery || saveState === "saving"}
      restoreBlockedReason={conflict ? t("builderV4.errors.conflictsRemaining") : dirty || recoveredRecovery || saveState === "saving" ? t("builderV4.history.unsavedRestoreBlocked") : offline ? t("builderV4.history.offlineRestoreBlocked") : busy ? t("builderV4.history.busyRestoreBlocked") : ""}
      onRestored={applyRestoredWebsite}
    />
      <Modal open={identityPromptOpen} onClose={() => {}} title={t("builderV4.collaboration.identityTitle")} description={t("builderV4.collaboration.identityDescription")}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">{[t("builderV4.collaboration.brideName"), t("builderV4.collaboration.groomName"), t("builderV4.collaboration.editorName")].map(label => <Button key={label} type="button" variant={suggestedDisplayName === label ? "default" : "outline"} className="min-h-11 px-2 text-xs sm:text-sm" onClick={() => chooseDisplayName(label)}><UserRound className="mr-1.5 size-4" />{label}</Button>)}</div>
        <label className="grid gap-1.5 text-sm">{t("builderV4.collaboration.otherName")}<input autoFocus className="h-11 rounded-lg border border-input bg-background px-3" value={customDisplayName} maxLength={40} placeholder={t("builderV4.collaboration.nameExample")} onChange={event => setCustomDisplayName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") chooseDisplayName(customDisplayName); }} /></label>
        <Button type="button" className="w-full" disabled={!customDisplayName.trim()} onClick={() => chooseDisplayName(customDisplayName)}>{t("builderV4.collaboration.continueWithName")}</Button>
        <p className="text-xs leading-5 text-muted-foreground">{t("builderV4.collaboration.recoveryPrivacy")}</p>
        {recoveredRecovery && <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => void clearLocalRecovery()}>{t("builderV4.collaboration.clearRecovery")}</Button>}
      </div>
    </Modal>
    <Modal open={sectionLibraryOpen} onClose={() => setSectionLibraryOpen(false)} title={t("builderV4.sectionLibrary.title")} description={t("builderV4.sectionLibrary.description")}>
      <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.15fr)]">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.sectionLibrary.content")}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {sectionTypes.filter(type => type !== "hero" || !currentPage?.sections.some(section => section.type === "hero")).map((type, index) => <button key={type} type="button" aria-pressed={sectionLibraryType === type} onClick={() => { setSectionLibraryType(type); setSectionLibraryVariant(variantOptions[type][0] ?? "default"); }} className={`min-h-[66px] rounded-xl border p-3 text-left transition ${sectionLibraryType === type ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/30 hover:bg-muted/40"}`}>
              <span className="flex items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span><span className="font-medium">{t(`builderV4.sectionNames.${type}`)}</span></span>
              <span className="mt-1 block pl-8 text-xs leading-5 text-muted-foreground">{t(`builderV4.sectionDescriptions.${type}`)}</span>
            </button>)}
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.sectionLibrary.preview")}</p><h3 className="mt-1 font-display text-lg">{t(`builderV4.sectionNames.${sectionLibraryType}`)}</h3></div><span className="text-xs text-muted-foreground">{t("builderV4.sectionLibrary.page", { title: currentPage?.title ?? t("builderV4.sectionLibrary.currentPage") })}</span></div>
          <div className="h-[300px] overflow-auto rounded-xl border border-border bg-[#f1eeed] p-3 sm:h-[340px]">
            <div className="mx-auto min-h-full max-w-[520px] overflow-hidden rounded-lg bg-background shadow-sm">{sectionLibraryPreviewDocument && <StoryBuilderV4Renderer document={sectionLibraryPreviewDocument} pagePath={currentPage?.slug} />}</div>
          </div>
          <fieldset><legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.sectionLibrary.layout")}</legend><div className="flex flex-wrap gap-2">{variantOptions[sectionLibraryType].map(variant => <button key={variant} type="button" aria-pressed={sectionLibraryVariant === variant} onClick={() => setSectionLibraryVariant(variant)} className={`min-h-10 rounded-full border px-3 text-xs ${sectionLibraryVariant === variant ? "border-primary bg-primary/10 font-semibold text-primary-hover" : "border-border text-muted-foreground hover:border-primary/40"}`}>{t(`builderV4.variantNames.${variant}`, { defaultValue: variantNames[variant] ?? variant })}</button>)}</div></fieldset>
        </div>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">{t("builderV4.sectionLibrary.addedNote")}</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setSectionLibraryOpen(false)}>{t("builderV4.sectionLibrary.cancel")}</Button><Button type="button" disabled={!currentPage || (currentPage?.sections.length ?? 24) >= 24 || doc.pages.reduce((total, page) => total + page.sections.length, 0) >= 80} onClick={() => { if (addSection(sectionLibraryType, sectionLibraryVariant)) setSectionLibraryOpen(false); }}><Plus className="mr-1.5 size-4" />{t("builderV4.sectionLibrary.addSection", { section: t(`builderV4.sectionNames.${sectionLibraryType}`) })}</Button></div></div>
    </Modal>
    <Modal open={publishReviewOpen} onClose={() => setPublishReviewOpen(false)} title={status === "PUBLISHED" ? t("builderV4.publishReview.republishTitle") : t("builderV4.publishReview.publishTitle")} description={t("builderV4.publishReview.description")}>
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <PublishCheckItem ok={publishIssues.length === 0} title={t("builderV4.publishReview.structure")} detail={publishIssues.length === 0 ? t("builderV4.publishReview.noBlockingIssues") : t("builderV4.publishReview.locationsToReview", { count: publishIssues.length })} />
          <PublishCheckItem ok={!dirty && saveState === "saved" && !conflict} title={t("builderV4.publishReview.draftSaved")} detail={conflict ? t("builderV4.publishReview.newerVersion") : dirty ? t("builderV4.publishReview.unsavedDraft") : saveState !== "saved" ? t("builderV4.publishReview.savingDraft") : t("builderV4.publishReview.savedVersion", { version })} />
        </div>
        {publishIssues.length > 0 && <section aria-labelledby="publish-errors-title" className="rounded-xl border border-destructive/25 bg-destructive/[0.04] p-4">
          <h3 id="publish-errors-title" className="font-semibold text-destructive">{t("builderV4.publishReview.fixBeforePublish")}</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {publishIssues.slice(0, 8).map((issue, index) => {
              const pagePathIndex = issue.path.indexOf("pages");
              const pagePosition = pagePathIndex >= 0 ? issue.path[pagePathIndex + 1] : undefined;
              const hasPage = typeof pagePosition === "number" && Boolean(doc.pages[pagePosition]);
              const message = describeV4ValidationIssues([issue], doc);
              return <li key={`${issue.path.join(".")}-${index}`}>{hasPage ? <button type="button" className="min-h-10 text-left text-destructive underline decoration-destructive/40 underline-offset-2 hover:decoration-destructive" onClick={() => jumpToPublishIssue(issue)}>{message} · {t("builderV4.publishReview.goToFix")}</button> : <span className="block py-1 text-destructive">{message}</span>}</li>;
            })}
            {publishIssues.length > 8 && <li className="pt-1 text-xs text-muted-foreground">{t("builderV4.publishReview.moreErrors", { count: publishIssues.length - 8 })}</li>}
          </ul>
        </section>}
        {(hiddenPages.length > 0 || hiddenSections.length > 0) && <section className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">{t("builderV4.publishReview.hiddenContentTitle")}</h3>
          <p className="mt-1 leading-6">{hiddenPages.length > 0 && t("builderV4.publishReview.hiddenPages", { count: hiddenPages.length })}{hiddenPages.length > 0 && hiddenSections.length > 0 ? " · " : ""}{hiddenSections.length > 0 && t("builderV4.publishReview.hiddenSections", { count: hiddenSections.length })}. {t("builderV4.publishReview.hiddenHint")}</p>
          <details className="mt-2"><summary className="min-h-10 cursor-pointer py-2 font-medium underline underline-offset-2">{t("builderV4.publishReview.viewHidden")}</summary><ul className="space-y-1 pl-4">
            {hiddenPages.map(page => <li key={`page-${page.id}`}><button type="button" className="min-h-10 text-left underline underline-offset-2" onClick={() => jumpToHiddenSection(page.id)}>{t("builderV4.publishReview.pageOpenReview", { title: page.title })}</button></li>)}
            {hiddenSections.map(section => <li key={`section-${section.sectionId}`}><button type="button" className="min-h-10 text-left underline underline-offset-2" onClick={() => jumpToHiddenSection(section.pageId, section.sectionId)}>{t("builderV4.publishReview.sectionOpenReview", { page: section.page, section: section.section })}</button></li>)}
          </ul></details>
        </section>}
        {missingGalleryDescriptions.length > 0 && <section className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">{t("builderV4.publishReview.galleryMissingAltTitle")}</h3>
          <p className="mt-1 leading-6">{t("builderV4.publishReview.galleryMissingAltHint", { count: missingGalleryDescriptions.length })}</p>
          <details className="mt-2"><summary className="min-h-10 cursor-pointer py-2 font-medium underline underline-offset-2">{t("builderV4.publishReview.viewPhotosToDescribe")}</summary><ul className="space-y-1 pl-4">
            {missingGalleryDescriptions.slice(0, 20).map((image, index) => <li key={`${image.sectionId}-${image.imageIndex}-${index}`}><button type="button" className="min-h-10 text-left underline underline-offset-2" onClick={() => jumpToHiddenSection(image.pageId, image.sectionId)}>{t("builderV4.publishReview.photoToDescribe", { page: image.page, number: image.imageIndex })}</button></li>)}
            {missingGalleryDescriptions.length > 20 && <li className="py-1 text-xs">{t("builderV4.publishReview.morePhotos", { count: missingGalleryDescriptions.length - 20 })}</li>}
          </ul></details>
        </section>}
        {needsRsvp && <section className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">{t("builderV4.publishReview.noRsvpTitle")}</h3>
          <p className="mt-1 leading-6">{t("builderV4.publishReview.noRsvpHint")}</p>
          <button type="button" className="mt-2 min-h-10 rounded-lg px-2 font-medium underline underline-offset-2" onClick={() => { const type: SectionType = "rsvp"; setSectionLibraryType(type); setSectionLibraryVariant("default"); setPublishReviewOpen(false); setSectionLibraryOpen(true); }}>{t("builderV4.publishReview.addRsvp")}</button>
        </section>}
        {eventSectionsNeedingDetails.length > 0 && <section className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">{t("builderV4.publishReview.eventDetailsTitle")}</h3>
          <p className="mt-1 leading-6">{t("builderV4.publishReview.eventDetailsHint")}</p>
          <ul className="mt-2 space-y-1">{eventSectionsNeedingDetails.slice(0, 5).map(({ page, section }) => <li key={section.id}><button type="button" className="min-h-10 text-left underline underline-offset-2" onClick={() => jumpToHiddenSection(page.id, section.id)}>{t("builderV4.publishReview.openEventSection", { page: page.title })}</button></li>)}</ul>
        </section>}
        {!hasShareImage && <section className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">{t("builderV4.publishReview.noShareImageTitle")}</h3>
          <p className="mt-1 leading-6">{t("builderV4.publishReview.noShareImageHint")}</p>
          <button type="button" className="mt-2 min-h-10 rounded-lg px-2 font-medium underline underline-offset-2" onClick={() => { setPublishReviewOpen(false); setShareSettingsOpen(true); }}>{t("builderV4.publishReview.shareImageSettings")}</button>
        </section>}
        {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[0.04] p-3 text-sm text-destructive">{error}</p>}
        {!publishCanProceed && publishIssues.length === 0 && <p role="status" className="text-sm text-muted-foreground">{busy ? t("builderV4.errors.actionInProgress") : !isOwner ? t("builderV4.errors.ownerRequired") : conflict ? t("builderV4.errors.versionConflict") : premiumLocked ? t("builderV4.plan.premiumHint") : premiumUnknown ? t("builderV4.plan.premiumUnknownDescription") : t("builderV4.errors.publishFailed")}</p>}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => { setPublishReviewOpen(false); setPreview(true); }}><Eye className="mr-2 size-4" />{t("builderV4.actions.preview")}</Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="ghost" onClick={() => setPublishReviewOpen(false)}>{t("builderV4.publish.backToEdit")}</Button><Button type="button" disabled={!publishCanProceed} onClick={() => void publish()}>{busy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}{status === "PUBLISHED" ? t("builderV4.publish.confirmAgain") : t("builderV4.publish.confirm")}</Button></div>
        </div>
      </div>
    </Modal>
    <Modal open={shareSettingsOpen} onClose={() => setShareSettingsOpen(false)} title={t("builderV4.actions.shareSeo")} description={t("builderV4.publish.reviewDescription")}>
      <div className="space-y-4">
        <Field label={t("builderV4.publish.title")} value={doc.seo?.title ?? ""} maxLength={70} placeholder={t("builderV4.publish.shareTitlePlaceholder")} error={showFieldErrors && doc.seo?.title && doc.seo.title.length > 70 ? t("builderV4.publish.characterLimit", { count: 70 }) : undefined} onChange={value => editSeo("title", value)} />
        <p className="-mt-3 text-right text-xs text-muted-foreground">{(doc.seo?.title ?? "").length}/70</p>
        <Field label={t("builderV4.publish.description")} value={doc.seo?.description ?? ""} maxLength={200} multiline placeholder={t("builderV4.publish.shareDescriptionPlaceholder")} error={showFieldErrors && doc.seo?.description && doc.seo.description.length > 200 ? t("builderV4.publish.characterLimit", { count: 200 }) : undefined} onChange={value => editSeo("description", value)} />
        <p className="-mt-3 text-right text-xs text-muted-foreground">{(doc.seo?.description ?? "").length}/200</p>
        <ImageField label={t("builderV4.publish.shareImage")} value={doc.seo?.imageUrl ?? ""} onChange={value => editSeo("imageUrl", value)} onUpload={uploadImage} onChooseMedia={openMediaPicker} />
        <section aria-label={t("builderV4.publish.sharePreview")} className="overflow-hidden rounded-xl border border-border bg-muted/20">
          {doc.seo?.imageUrl ? <div className="relative aspect-[1.91/1] bg-muted"><Image src={mediaUrl(doc.seo.imageUrl) ?? doc.seo.imageUrl} alt="" fill sizes="(max-width: 640px) 100vw, 520px" unoptimized className="object-cover" /></div> : <div className="grid aspect-[1.91/1] place-items-center bg-primary/5 text-primary"><ImageIcon className="size-8" /></div>}
          <div className="space-y-1 p-3"><p className="truncate text-xs text-muted-foreground">{setup.slug ? `inviteme.asia/wedding/${setup.slug}` : t("builderV4.publish.seoPreviewUrlPending")}</p><p className="line-clamp-1 font-semibold">{doc.seo?.title || setup.name || t("builderV4.publish.weddingInviteTitle")}</p><p className="line-clamp-2 text-sm text-muted-foreground">{doc.seo?.description || t("builderV4.publish.seoDefaultDescription")}</p></div>
        </section>
        <p aria-live="polite" className="text-xs text-muted-foreground">{dirty ? t("builderV4.publish.savingDraft") : t("builderV4.publish.savedDraft")}</p>
        <div className="flex justify-end border-t border-border pt-3"><Button type="button" onClick={() => setShareSettingsOpen(false)}>{t("builderV4.publish.finish")}</Button></div>
      </div>
    </Modal>
    <Modal open={mediaPickerOpen && !mediaDeleteTarget} onClose={() => { setMediaPickerOpen(false); setMediaPickerTarget(null); }} title={t("builderV4.mediaLibrary.title")} description={t("builderV4.mediaLibrary.description")}>
      <div className="space-y-4">
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={mediaSearch} onChange={event => setMediaSearch(event.target.value)} placeholder={t("builderV4.mediaLibrary.searchPlaceholder")} aria-label={t("builderV4.mediaLibrary.searchLabel")} /></label>
        {mediaLibrary.isPending && <LoadingState label={t("builderV4.mediaLibrary.loading")} />}
        {mediaLibrary.isError && <ErrorState error={mediaLibrary.error} retry={() => void mediaLibrary.refetch()} />}
        {mediaLibrary.data && (() => {
          const assets = mediaLibrary.data.filter(asset => `${asset.id} ${asset.url}`.toLocaleLowerCase().includes(mediaSearch.toLocaleLowerCase()));
          return assets.length ? <div className="grid max-h-[55dvh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">{assets.map(asset => <div key={asset.id} className="group relative overflow-hidden rounded-xl border border-border transition hover:border-primary hover:ring-2 hover:ring-primary/20"><button type="button" className="block w-full text-left" onClick={() => { mediaPickerTarget?.(asset.url); setMediaPickerTarget(null); setMediaPickerOpen(false); }}><div className="relative aspect-square bg-muted"><Image src={mediaUrl(asset.url) ?? asset.url} alt="" fill sizes="(max-width: 640px) 50vw, 180px" unoptimized className="object-cover transition group-hover:scale-[1.02]" /></div><span className="block truncate px-2.5 py-2 pr-11 text-xs text-muted-foreground">{t("builderV4.mediaLibrary.choosePhoto")} · {asset.id}</span></button><button type="button" aria-label={t("builderV4.mediaLibrary.deletePhoto", { id: asset.id })} title={t("builderV4.mediaLibrary.deletePhotoTitle")} className="absolute bottom-1.5 right-1.5 grid size-8 place-items-center rounded-lg border border-border bg-background/95 text-destructive shadow-sm transition hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setMediaDeleteError(""); setMediaDeleteTarget(asset); }}><Trash2 className="size-4" /></button></div>)}</div> : <div className="rounded-xl border border-dashed border-border p-6 text-center"><ImageIcon className="mx-auto size-6 text-muted-foreground" /><p className="mt-2 text-sm font-medium">{mediaSearch ? t("builderV4.mediaLibrary.noResults") : t("builderV4.mediaLibrary.emptyTitle")}</p><p className="mt-1 text-xs text-muted-foreground">{t("builderV4.mediaLibrary.emptyHint")}</p></div>;
        })()}
      </div>
    </Modal>
    <Modal open={Boolean(mediaDeleteTarget)} onClose={() => { if (!mediaDeleteBusy) { setMediaDeleteTarget(null); setMediaDeleteError(""); } }} title={t("builderV4.mediaLibrary.deleteTitle")} description={t("builderV4.mediaLibrary.deleteDescription")}>
      <div className="space-y-4">
        {mediaDeleteTarget && <div className="flex items-center gap-3 rounded-xl border border-border p-3"><div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted"><Image src={mediaUrl(mediaDeleteTarget.url) ?? mediaDeleteTarget.url} alt="" fill sizes="64px" unoptimized className="object-cover" /></div><p className="min-w-0 break-all text-xs text-muted-foreground">{mediaDeleteTarget.id}</p></div>}
        {mediaDeleteError && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[0.04] p-3 text-sm text-destructive">{mediaDeleteError}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={mediaDeleteBusy} onClick={() => { setMediaDeleteTarget(null); setMediaDeleteError(""); }}>{t("builderV4.mediaLibrary.deleteCancel")}</Button><Button type="button" variant="destructive" disabled={mediaDeleteBusy || !mediaDeleteTarget} onClick={() => void confirmMediaDelete()}>{mediaDeleteBusy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}{mediaDeleteBusy ? t("builderV4.mediaLibrary.deleting") : t("builderV4.mediaLibrary.deleteConfirm")}</Button></div>
      </div>
    </Modal>
    {premiumLocked && <div className="border-t border-primary/20 bg-primary/5 p-3"><FeatureLimitNotice title={t("builderV4.plan.premiumLockedTitle")} description={t("builderV4.plan.premiumLockedDescription")} upgradeHref={`/weddings/${encodeURIComponent(weddingId)}/plan`} upgradeLabel={t("builderV4.plan.viewPlans")} /></div>}
    {premiumUnknown && <div className="border-t border-border p-3"><FeatureLimitNotice title={t("builderV4.plan.premiumUnknownTitle")} description={t("builderV4.plan.premiumUnknownDescription")} status="unavailable" variant="compact" retryLabel={t("builderV4.actions.retry")} onRetry={() => void sitePlan.refetch()} /></div>}
    {sitePlan.isError && !premiumUnknown && <p className="border-t border-border px-3 py-1 text-xs text-muted-foreground">{t("builderV4.plan.planCheckFailedPublicUnchanged")}</p>}
  </div>;
}

function WebsiteVersionHistoryDialog({ open, onClose, weddingId, currentVersion, restoreBlocked, restoreBlockedReason, onRestored }: {
  open: boolean;
  onClose: () => void;
  weddingId: string;
  currentVersion: number;
  restoreBlocked: boolean;
  restoreBlockedReason: string;
  onRestored: (website: Website) => void;
}) {
  const { t, i18n } = useTranslation("weddingEditor");
  const { api } = useRuntime();
  const cache = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const versionsQuery = useQuery({
    queryKey: ["website", weddingId, "versions"],
    queryFn: () => listWebsiteVersions(api, weddingId),
    enabled: open,
    staleTime: 0,
  });
  const versions = versionsQuery.data;
  const selected = versions?.find(version => version.id === selectedId) ?? versions?.[0];
  const detailQuery = useQuery({
    queryKey: ["website", weddingId, "versions", selected?.id],
    queryFn: () => selected ? getWebsiteVersion(api, weddingId, selected.id) : Promise.reject(new Error(t("builderV4.history.selectVersion"))),
    enabled: open && Boolean(selected?.id),
  });
  const detail = detailQuery.data;
  const canRestore = Boolean(detail && isStoryBuilderV4Document(detail.document) && !restoreBlocked && !restoring);
  const kindLabels: Record<WebsiteVersion["kind"], string> = {
    BASELINE: t("builderV4.history.base"),
    AUTO_SAVE: t("builderV4.history.autosaved"),
    PUBLISHED: t("builderV4.history.published"),
    RESTORED: t("builderV4.history.restored"),
  };
  const dateLocale = i18n.language.startsWith("en") ? "en-US" : "vi-VN";
  async function restore() {
    if (!selected?.id || !canRestore) return;
    setRestoring(true); setRestoreError("");
    try {
      const result = await restoreWebsiteVersion(api, weddingId, selected.id, currentVersion);
      await cache.invalidateQueries({ queryKey: ["website", weddingId, "versions"] });
      onRestored(result);
      onClose();
    } catch (cause) {
      setConfirming(false);
      setRestoreError(errText(cause, t));
      await cache.invalidateQueries({ queryKey: ["website", weddingId, "versions"] });
    } finally { setRestoring(false); }
  }
  return <Modal open={open} onClose={() => { if (!restoring) { setConfirming(false); setRestoreError(""); onClose(); } }} title={t("builderV4.history.title")} description={t("builderV4.history.description")} size="wide">
    <div className="grid min-h-[min(68dvh,680px)] gap-3 lg:grid-cols-[minmax(250px,0.34fr)_minmax(0,1fr)]">
      <section aria-label={t("builderV4.history.versionList", "Version history list")} className="min-h-0 overflow-hidden rounded-xl border border-border bg-background">
        <div className="border-b border-border px-4 py-3"><h3 className="text-sm font-semibold">{t("builderV4.history.recentSaves", "Recent saves")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("builderV4.history.limit", "Up to 20 versions for this wedding")}</p></div>
        <div className="max-h-[30dvh] divide-y divide-border overflow-y-auto lg:max-h-[60dvh]">
          {versionsQuery.isPending && <p className="p-4 text-sm text-muted-foreground">{t("builderV4.history.loading")}</p>}
          {versionsQuery.isError && <div className="p-4"><p role="alert" className="text-sm text-destructive">{errText(versionsQuery.error, t)}</p><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void versionsQuery.refetch()}>{t("builderV4.history.retryLoad", "Retry loading")}</Button></div>}
          {versionsQuery.isSuccess && versions?.length === 0 && <p className="p-4 text-sm leading-6 text-muted-foreground">{t("builderV4.history.empty")}</p>}
          {versions?.map((item, index) => <button key={item.id} type="button" aria-current={item.id === selected?.id ? "true" : undefined} onClick={() => { setSelectedId(item.id); setConfirming(false); setRestoreError(""); }} className={`block min-h-[76px] w-full px-4 py-3 text-left transition hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${item.id === selected?.id ? "bg-primary/[0.07]" : ""}`}>
            <span className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{kindLabels[item.kind]}</span>{index === 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary-hover">{t("builderV4.history.latest")}</span>}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{t("builderV4.history.versionLabel", "Version {{version}}", { version: item.version })} · {new Date(item.createdAt).toLocaleString(dateLocale)}</span>
          </button>)}
        </div>
      </section>
      <section aria-label={t("builderV4.history.preview", "Version preview")} className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-muted/30">
        {!selected && <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">{t("builderV4.history.selectVersion")}</div>}
        {selected && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-4 py-3"><div><p className="text-sm font-semibold">{kindLabels[selected.kind]} · {t("builderV4.history.versionLabel", "Version {{version}}", { version: selected.version })}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(selected.createdAt).toLocaleString(dateLocale)}</p></div><History className="size-4 text-primary" aria-hidden="true" /></div>}
        {detailQuery.isPending && selected && <div className="grid min-h-[260px] flex-1 place-items-center text-sm text-muted-foreground">{t("builderV4.history.previewLoading", "Loading preview…")}</div>}
        {detailQuery.isError && selected && <div className="grid min-h-[260px] flex-1 place-items-center p-5 text-center"><div><p role="alert" className="text-sm text-destructive">{errText(detailQuery.error, t)}</p><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void detailQuery.refetch()}>{t("builderV4.actions.retry")}</Button></div></div>}
        {detail && isStoryBuilderV4Document(detail.document) && <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4"><div className="mx-auto min-h-full max-w-[900px] overflow-hidden rounded-xl border border-border bg-background shadow-sm"><div className="pointer-events-none"><StoryBuilderV4Renderer document={detail.document} /></div></div></div>}
        {detail && !isStoryBuilderV4Document(detail.document) && <div className="grid min-h-[260px] flex-1 place-items-center p-6 text-center"><div><History className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{t("builderV4.history.legacyTitle", "This saved version has no V4 preview")}</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{t("builderV4.history.legacyDescription", "This version uses the old website structure. You can view its save details, but it cannot be restored from the V4 builder.")}</p></div></div>}
        <div className="shrink-0 space-y-3 border-t border-border bg-background p-3 sm:px-4">
          {restoreBlocked && selected && <p className="text-xs leading-5 text-amber-800">{restoreBlockedReason}</p>}
          {restoreError && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/[0.04] p-2.5 text-xs text-destructive">{restoreError}</p>}
          {confirming && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">{t("builderV4.history.restoreWarning", "This will replace the current draft. The published website stays unchanged; you can review and publish again later.")}</div>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] leading-4 text-muted-foreground">{t("builderV4.history.restoreRecorded", "Restoring creates a new version so you can return to this one.")}</p><div className="flex gap-2 sm:justify-end">{confirming && <Button type="button" variant="outline" disabled={restoring} onClick={() => setConfirming(false)}>{t("builderV4.actions.cancel")}</Button>}<Button type="button" disabled={!canRestore} title={restoreBlocked ? restoreBlockedReason : undefined} onClick={() => confirming ? void restore() : setConfirming(true)}>{restoring ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <History className="mr-2 size-4" />}{restoring ? t("builderV4.history.restoring", "Restoring…") : confirming ? t("builderV4.history.confirmRestore") : t("builderV4.history.restore")}</Button></div></div>
        </div>
      </section>
    </div>
  </Modal>;
}

function GuestExperienceInspector({ document, settings, onChange }: {
  document: StoryBuilderV4Document;
  settings: GuestExperienceSettings;
  onChange: (settings: GuestExperienceSettings) => void;
}) {
  const { t } = useTranslation("weddingEditor");
  const visibleSections = document.pages.filter(page => page.visible !== false)
    .flatMap(page => page.sections.filter(section => section.visible !== false));
  const snapshot = record(document.templateSnapshot);
  const themeColors = record(record(snapshot.theme).colors);
  const palettes = Array.isArray(snapshot.palettes) ? snapshot.palettes.map(record) : [];
  const selectedPaletteColors = record(palettes.find(palette => palette.id === document.appearance.paletteId)?.colors);
  const previewStyle = {
    "--site-primary": String(selectedPaletteColors.primary ?? themeColors.primary ?? "#e98ca3"),
    "--site-accent": String(selectedPaletteColors.accent ?? themeColors.accent ?? "#9d4d62"),
    "--site-background": String(selectedPaletteColors.background ?? themeColors.background ?? "#fffaf8"),
    "--site-text": String(selectedPaletteColors.text ?? themeColors.text ?? "#34242a"),
  } as CSSProperties;
  const events = visibleSections.filter(section => section.type === "events")
    .flatMap(section => Array.isArray(record(section.content).events) ? record(section.content).events as Record<string, unknown>[] : []);
  const availability: Record<GuestTool, boolean> = {
    rsvp: visibleSections.some(section => section.type === "rsvp"),
    calendar: events.some(event => Number.isFinite(Date.parse(String(event.startsAt ?? "")))),
    gift: document.content.gift?.enabled === true && visibleSections.some(section => section.type === "gift"),
    wishes: visibleSections.some(section => section.type === "wishes"),
    share: true,
  };
  const options: { id: GuestTool; label: string; unavailable: string }[] = [
    { id: "rsvp", label: t("builderV4.guestExperience.rsvp"), unavailable: t("builderV4.guestExperience.rsvpUnavailable", "Add a visible RSVP section to enable this shortcut.") },
    { id: "calendar", label: t("builderV4.guestExperience.calendar"), unavailable: t("builderV4.guestExperience.calendarUnavailable", "A visible event section with a valid date is required.") },
    { id: "gift", label: t("builderV4.guestExperience.gift"), unavailable: t("builderV4.guestExperience.giftUnavailable", "Enable gift details and show the Gift section.") },
    { id: "wishes", label: t("builderV4.guestExperience.wishes"), unavailable: t("builderV4.guestExperience.wishesUnavailable", "Add a visible Wishes section to enable this shortcut.") },
    { id: "share", label: t("builderV4.guestExperience.share"), unavailable: "" },
  ];
  const inputClass = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const toggleTool = (tool: GuestTool, checked: boolean) => {
    const tools = checked
      ? [...settings.tools, tool].slice(0, 4)
      : settings.tools.filter(item => item !== tool);
    onChange({ ...settings, tools });
  };
  const moveTool = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= settings.tools.length) return;
    const tools = [...settings.tools];
    const currentTool = tools[index];
    const destinationTool = tools[destination];
    if (!currentTool || !destinationTool) return;
    tools[index] = destinationTool;
    tools[destination] = currentTool;
    onChange({ ...settings, tools });
  };
  return <div className="min-h-[300px] w-full min-w-0 max-w-full overflow-x-hidden">
    <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3"><p className="text-xs text-muted-foreground">{t("builderV4.guestExperience.websiteSettings", "WEBSITE SETTINGS")}</p><h2 className="mt-1 text-sm font-semibold">{t("builderV4.guestExperience.title")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("builderV4.guestExperience.description")}</p></div>
    <div className="space-y-6 p-4">
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">{t("builderV4.guestExperience.tools")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("builderV4.guestExperience.toolsHint")}</p></div><span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{settings.tools.length}/4</span></div>
        <div className="divide-y divide-border rounded-xl border border-border">
          {options.map(option => {
            const checked = settings.tools.includes(option.id);
            const unavailable = !availability[option.id];
            const disabled = (unavailable && !checked) || (!checked && settings.tools.length >= 4);
            const selectedIndex = settings.tools.indexOf(option.id);
            return <div key={option.id} className="flex items-center gap-2 px-3 py-2.5">
              <label className={`flex min-h-10 min-w-0 flex-1 items-center gap-2.5 text-sm ${disabled ? "opacity-50" : ""}`}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={event => toggleTool(option.id, event.target.checked)} className="size-4 shrink-0 accent-primary" />
                <span className="min-w-0"><span className="block font-medium">{option.label}</span>{unavailable && !checked && <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{option.unavailable}</span>}</span>
              </label>
              {checked && <div className="flex shrink-0 gap-1"><button type="button" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`${t("builderV4.guestExperience.moveUp")} · ${option.label}`} disabled={selectedIndex <= 0} onClick={() => moveTool(selectedIndex, -1)}><ChevronUp className="size-4" /></button><button type="button" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`${t("builderV4.guestExperience.moveDown")} · ${option.label}`} disabled={selectedIndex === settings.tools.length - 1} onClick={() => moveTool(selectedIndex, 1)}><ChevronDown className="size-4" /></button></div>}
            </div>;
          })}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{t("builderV4.guestExperience.mobileHint")}</p>
      </section>
      <section className="space-y-3 border-t border-border pt-5">
        <div><h3 className="text-sm font-semibold">{t("builderV4.guestExperience.decoration")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("builderV4.guestExperience.decorationHint")}</p></div>
        <label className="grid gap-1 text-xs text-muted-foreground">{t("builderV4.guestExperience.effect", "Effect")}
          <select className={inputClass} value={settings.decoration} onChange={event => onChange({ ...settings, decoration: event.target.value as GuestExperienceSettings["decoration"] })}>
            <option value="none">{t("builderV4.guestExperience.none")}</option><option value="petals">{t("builderV4.guestExperience.petals")}</option><option value="sparkles">{t("builderV4.guestExperience.sparkles")}</option><option value="hearts">{t("builderV4.guestExperience.hearts")}</option><option value="fireflies">{t("builderV4.guestExperience.fireflies")}</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">{t("builderV4.guestExperience.intensityLabel", "Intensity")}
          <select className={inputClass} disabled={settings.decoration === "none"} value={settings.intensity} onChange={event => onChange({ ...settings, intensity: event.target.value as GuestExperienceSettings["intensity"] })}>
            <option value="light">{t("builderV4.guestExperience.light")}</option><option value="medium">{t("builderV4.guestExperience.medium")}</option><option value="vivid">{t("builderV4.guestExperience.vivid")}</option>
          </select>
        </label>
        {settings.decoration !== "none" && <div className="space-y-2 rounded-xl border border-border bg-muted/25 p-3">
          <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-foreground">{t("builderV4.guestExperience.preview")}</p><span className="text-[11px] text-muted-foreground">{t("builderV4.guestExperience.livePreview")}</span></div>
          <div className="relative isolate h-24 overflow-hidden rounded-lg border border-primary/20" style={previewStyle}>
            <div aria-hidden="true" className="absolute inset-0 overflow-hidden" data-effect={settings.decoration} data-intensity={settings.intensity}>
              {Array.from({ length: settings.intensity === "vivid" ? 14 : settings.intensity === "medium" ? 10 : 7 }, (_, index) => <span key={index} className={`inviteme-decoration-preview__particle inviteme-decoration-preview__particle--${settings.decoration}`} style={{ "--particle-x": `${(index * 37 + 9) % 96}%`, "--particle-y": `${(index * 31 + 8) % 78}%`, "--particle-delay": `${(index * 0.57) % 3}s`, "--particle-duration": `${3.6 + index % 4}s`, "--particle-scale": `${0.8 + (index % 4) * 0.15}`, "--particle-drift": `${((index * 13) % 38) - 19}px` } as CSSProperties} />)}
            </div>
            <div className="absolute inset-0 -z-[1] bg-[radial-gradient(ellipse_at_50%_120%,color-mix(in_srgb,var(--site-primary)_18%,transparent),transparent_68%),var(--site-background)]" />
            <div className="absolute inset-x-4 bottom-3 z-[1] text-center"><span className="font-serif text-sm" style={{ color: "var(--site-text)" }}>{t("builderV4.guestExperience.previewSampleTitle")}</span><span className="mx-auto mt-1 block h-px w-12" style={{ backgroundColor: "var(--site-accent)" }} /></div>
          </div>
        </div>}
      </section>
    </div>
  </div>;
}

type StoryMoment = NonNullable<Extract<StoryBuilderV4Section, { type: "loveStory" }>['content']['items']>[number];
type GalleryItem = NonNullable<Extract<StoryBuilderV4Section, { type: "gallery" }>['content']['images']>[number];

function StoryMomentsEditor({ sectionId, items, onChange, onUpload, onChooseMedia, getError, onFocusItem }: {
  sectionId: string;
  items: StoryMoment[];
  onChange: (items: StoryMoment[]) => void;
  onUpload: (file: File) => Promise<string | null>;
  onChooseMedia: (onChoose: (url: string) => void) => void;
  getError: (index: number, field: "title" | "date" | "body" | "imageUrl") => string | undefined;
  onFocusItem: (itemId: string) => void;
}) {
  const { t } = useTranslation("weddingEditor");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(items[0]?.id ?? null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  const patchItem = (index: number, patch: Partial<StoryMoment>) =>
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  const addItem = () => {
    const nextItem: StoryMoment = { id: id(), title: t("builderV4.storyMoments.newMoment"), date: "", body: "" };
    onChange([...items, nextItem]);
    setExpandedItemId(nextItem.id);
  };

  const duplicateItem = (index: number) => {
    const source = items[index];
    if (!source || items.length >= 20) return;
    const copy: StoryMoment = { ...source, id: id() };
    const next = [...items];
    next.splice(index + 1, 0, copy);
    onChange(next);
    setExpandedItemId(copy.id);
  };

  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    onChange(next);
  };

  const dropOn = (event: React.DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggedItemId;
    const sourceIndex = items.findIndex(item => item.id === sourceId);
    moveTo(sourceIndex, targetIndex);
    setDraggedItemId(null);
  };

  return <div className="space-y-3">
    <div className="flex items-end justify-between gap-3">
      <div><h3 className="text-sm font-semibold text-foreground">{t("builderV4.storyMoments.title")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("builderV4.storyMoments.hint")}</p></div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{items.length}/20</span>
    </div>

    {items.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5">
      <p className="text-sm font-medium text-foreground">{t("builderV4.storyMoments.emptyTitle")}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("builderV4.storyMoments.emptyHint")}</p>
      <Button type="button" size="sm" variant="outline" className="mt-3" onClick={addItem}><Plus className="mr-1.5 size-3.5" />{t("builderV4.storyMoments.addFirst")}</Button>
    </div> : <ol className="divide-y divide-border/70 border-y border-border/70">
      {items.map((item, index) => {
        const itemId = String(item.id);
        const itemTitle = String(item.title ?? "").trim() || t("builderV4.storyMoments.momentNumber", { number: index + 1 });
        const imageUrl = String(item.imageUrl ?? "");
        return <li key={itemId} onDragOver={event => { if (draggedItemId) event.preventDefault(); }} onDrop={event => dropOn(event, index)} className={`py-2.5 transition-colors ${draggedItemId === itemId ? "opacity-45" : ""}`}>
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" draggable aria-label={t("builderV4.storyMoments.dragToReorder", { number: index + 1 })} title={t("builderV4.storyMoments.dragHint")} onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", itemId); setDraggedItemId(itemId); }} onDragEnd={() => setDraggedItemId(null)} className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"><GripVertical className="size-4" /></button>
            <details open={expandedItemId === itemId} onToggle={event => { const isOpen = event.currentTarget.open; setExpandedItemId(current => isOpen ? itemId : current === itemId ? null : current); }} className="group min-w-0 flex-1">
              <summary className="flex min-h-14 list-none cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 marker:hidden hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                {imageUrl ? <Image src={mediaUrl(imageUrl) ?? imageUrl} alt="" width={52} height={52} unoptimized className="size-12 shrink-0 rounded-md object-cover" /> : <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-md bg-primary/10 font-serif text-lg text-primary">{String(index + 1).padStart(2, "0")}</span>}
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{itemTitle}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{String(item.date ?? "").trim() || t("builderV4.storyMoments.noDate")}</span></span>
                <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-3 px-1 pb-2 pt-3">
                <Field label="Tiêu đề" maxLength={150} presencePath={builderFieldPath(sectionId, "loveStory", "items", itemId, "title")} value={String(item.title ?? "")} placeholder="Ví dụ: Ngày đầu gặp nhau" error={getError(index, "title")} onChange={value => patchItem(index, { title: value })} />
                <Field label="Ngày hoặc dấu mốc" maxLength={50} presencePath={builderFieldPath(sectionId, "loveStory", "items", itemId, "date")} value={String(item.date ?? "")} placeholder="Ví dụ: Tháng 6, 2022" error={getError(index, "date")} onChange={value => patchItem(index, { date: value })} />
                <Field label="Câu chuyện" maxLength={3000} presencePath={builderFieldPath(sectionId, "loveStory", "items", itemId, "body")} value={String(item.body ?? "")} placeholder="Kể ngắn gọn điều hai bạn muốn lưu lại…" multiline error={getError(index, "body")} onChange={value => patchItem(index, { body: value })} />
                <ImageField label="Ảnh dấu mốc" presencePath={builderFieldPath(sectionId, "loveStory", "items", itemId, "imageUrl")} value={imageUrl} error={getError(index, "imageUrl")} onChange={value => patchItem(index, { imageUrl: value || undefined })} onUpload={onUpload} onChooseMedia={onChooseMedia} />
              </div>
            </details>
          </div>
          <div className="ml-11 mt-1 flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onFocusItem(itemId)}><Eye className="mr-1 size-3.5" />{t("builderV4.storyMoments.view")}</Button>
            <Button type="button" size="sm" variant="ghost" className="size-8 p-0" aria-label={`${t("builderV4.storyMoments.moveUp")} · ${itemTitle}`} title={t("builderV4.storyMoments.moveUp")} disabled={index === 0} onClick={() => moveTo(index, index - 1)}><ChevronUp className="size-4" /></Button>
            <Button type="button" size="sm" variant="ghost" className="size-8 p-0" aria-label={`${t("builderV4.storyMoments.moveDown")} · ${itemTitle}`} title={t("builderV4.storyMoments.moveDown")} disabled={index === items.length - 1} onClick={() => moveTo(index, index + 1)}><ChevronDown className="size-4" /></Button>
            <Button type="button" size="sm" variant="ghost" className="size-8 p-0" aria-label={`${t("builderV4.storyMoments.duplicate")} · ${itemTitle}`} title={t("builderV4.storyMoments.duplicate")} disabled={items.length >= 20} onClick={() => duplicateItem(index)}><Copy className="size-3.5" /></Button>
            <Button type="button" size="sm" variant="ghost" className="size-8 p-0 text-destructive hover:bg-destructive/5 hover:text-destructive" aria-label={`${t("builderV4.storyMoments.delete")} · ${itemTitle}`} title={t("builderV4.storyMoments.delete")} onClick={() => { const next = items.filter((_, itemIndex) => itemIndex !== index); onChange(next); if (expandedItemId === itemId) setExpandedItemId(next[Math.min(index, next.length - 1)]?.id ?? null); }}><Trash2 className="size-3.5" /></Button>
          </div>
        </li>;
      })}
    </ol>}

    {items.length > 0 && <Button type="button" size="sm" variant="outline" disabled={items.length >= 20} onClick={addItem}><Plus className="mr-1.5 size-3.5" />{items.length >= 20 ? t("builderV4.storyMoments.maxReached") : t("builderV4.storyMoments.addMoment")}</Button>}
  </div>;
}

function GalleryImagesEditor({ sectionId, images, onChange, onAppend, onUpload, onChooseMedia, getError, onFocusItem }: {
  sectionId: string;
  images: GalleryItem[];
  onChange: (images: GalleryItem[]) => void;
  onAppend: (images: Record<string, unknown>[]) => number;
  onUpload: (file: File) => Promise<string | null>;
  onChooseMedia: (onChoose: (url: string) => void) => void;
  getError: (index: number, field: "imageUrl" | "alt" | "caption") => string | undefined;
  onFocusItem: (itemId: string) => void;
}) {
  const { t } = useTranslation("weddingEditor");
  const [selectedId, setSelectedId] = useState<string | null>(images[0]?.id ?? null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState("");
  const inputId = useId();
  const activeId = selectedId && images.some(image => image.id === selectedId) ? selectedId : images[0]?.id ?? null;
  const selectedIndex = Math.max(0, images.findIndex(image => image.id === activeId));
  const selected = images[selectedIndex];

  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const from = images.findIndex(image => image.id === fromId);
    const to = images.findIndex(image => image.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    onChange(next);
  }

  async function uploadFiles(files: File[]) {
    const remaining = Math.max(0, 30 - images.length);
    const selectedFiles = files.slice(0, remaining);
    if (!selectedFiles.length) {
      setUploadStatus(t("builderV4.galleryEditor.albumFull"));
      return;
    }
    setUploading(true);
    setUploadStatus("");
    const added: Record<string, unknown>[] = [];
    const failed: File[] = [];
    const validFiles = selectedFiles.filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 5 * 1024 * 1024);
    const invalidCount = selectedFiles.length - validFiles.length;
    let failureReason = "";
    let current = 0;
    let completed = 0;
    const worker = async () => {
      while (current < validFiles.length) {
        const index = current++;
        const file = validFiles[index];
        if (!file) continue;
        setUploadStatus(t("builderV4.galleryEditor.uploadProgress", { current: Math.min(completed + 1, validFiles.length), total: validFiles.length }));
        try {
          const imageUrl = await onUpload(file);
          if (imageUrl) added[index] = { id: id(), imageUrl };
          else failed.push(file);
        } catch (cause) { failed.push(file); failureReason ||= errText(cause, t); }
        completed += 1;
        setUploadStatus(t("builderV4.galleryEditor.processedProgress", { current: completed, total: validFiles.length }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, validFiles.length) }, () => worker()));
    const successful = added.filter(Boolean);
    const appended = successful.length ? onAppend(successful) : 0;
    setFailedFiles(failed);
    const skipped = files.length - selectedFiles.length;
    if (appended > 0) setSelectedId(String(successful[0]?.id ?? images[0]?.id ?? ""));
    setUploadStatus([
      appended ? t("builderV4.galleryEditor.addedCount", { count: appended }) : "",
      failed.length ? `${t("builderV4.galleryEditor.failedCount", { count: failed.length })}${failureReason ? ` ${failureReason}` : ""}` : "",
      invalidCount ? t("builderV4.galleryEditor.invalidCount", { count: invalidCount }) : "",
      skipped > 0 ? t("builderV4.galleryEditor.skippedCount", { count: skipped }) : "",
      appended < successful.length ? t("builderV4.galleryEditor.trimmedCount") : "",
    ].filter(Boolean).join(" ") || t("builderV4.galleryEditor.nothingAdded"));
    setUploading(false);
  }

  function patchSelected(patch: Partial<GalleryItem>) {
    onChange(images.map((image, index) => index === selectedIndex ? { ...image, ...patch } : image));
  }

  function removeSelected() {
    if (!selected) return;
    const next = images.filter(image => image.id !== selected.id);
    onChange(next);
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id ?? null);
  }

  return <div className="space-y-4">
    <div className="flex items-end justify-between gap-3">
      <div><h3 className="text-sm font-semibold text-foreground">{t("builderV4.galleryEditor.title")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("builderV4.galleryEditor.hint")}</p></div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{images.length}/30</span>
    </div>

    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
      {images.map((image, index) => <button key={image.id} type="button" draggable={!uploading} onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", image.id); setDraggedId(image.id); }} onDragEnd={() => setDraggedId(null)} onDragOver={event => { if (draggedId) event.preventDefault(); }} onDrop={event => { event.preventDefault(); reorder(event.dataTransfer.getData("text/plain") || draggedId || "", image.id); setDraggedId(null); }} onClick={() => setSelectedId(image.id)} aria-pressed={activeId === image.id} aria-label={`${t("builderV4.galleryEditor.photoNumber", { number: index + 1 })}${image.caption ? `: ${image.caption}` : ""}`} className={`group relative aspect-square min-w-0 touch-none overflow-hidden rounded-lg border-2 bg-muted/30 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeId === image.id ? "border-primary ring-2 ring-primary/20" : "border-transparent hover:border-primary/40"} ${draggedId === image.id ? "opacity-45" : ""}`}>
        <Image src={mediaUrl(image.imageUrl) ?? image.imageUrl} alt="" fill sizes="80px" unoptimized className="object-cover" />
        <span className="absolute left-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-[10px] text-white">{index + 1}</span>
      </button>)}
      {images.length > 0 && images.length < 30 && <label htmlFor={inputId} className={`grid aspect-square cursor-pointer place-items-center rounded-lg border border-dashed border-border bg-muted/15 text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-within:ring-2 focus-within:ring-ring ${uploading ? "pointer-events-none opacity-50" : ""}`}><span className="grid justify-items-center gap-1 text-[11px]"><Plus className="size-5" />{t("builderV4.galleryEditor.addPhoto")}</span></label>}
    </div>
    <input id={inputId} type="file" multiple disabled={uploading || images.length >= 30} accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void uploadFiles(files); }} />
    {images.length > 0 && images.length < 30 && <div onDragOver={event => { if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault(); }} onDrop={event => { const files = Array.from(event.dataTransfer.files ?? []); if (!files.length) return; event.preventDefault(); void uploadFiles(files); }} className={`flex min-h-11 items-center justify-center rounded-lg border border-dashed border-border/80 px-3 text-center text-xs text-muted-foreground transition-colors ${uploading ? "opacity-50" : "hover:border-primary/45 hover:bg-primary/[0.03]"}`}>
      <span>{t("builderV4.galleryEditor.dropPhotos")} <label htmlFor={inputId} className="cursor-pointer font-medium text-primary underline underline-offset-2">{t("builderV4.galleryEditor.chooseFromDevice")}</label>.</span>
    </div>}
    {uploading && <p role="status" aria-live="polite" className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">{uploadStatus}</p>}
    {!uploading && uploadStatus && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/35 px-3 py-2.5"><p role="status" aria-live="polite" className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">{uploadStatus}</p>{failedFiles.length > 0 && images.length < 30 && <Button type="button" size="sm" variant="outline" onClick={() => void uploadFiles(failedFiles)}>{t("builderV4.galleryEditor.retryFailed", { count: failedFiles.length })}</Button>}</div>}
    {!images.length ? <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-5"><p className="text-sm font-medium text-foreground">{t("builderV4.galleryEditor.emptyTitle")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("builderV4.galleryEditor.emptyHint")}</p><label htmlFor={inputId} className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary-hover"><Upload className="size-4" />{t("builderV4.galleryEditor.choosePhoto")}</label></div> : selected && <section className="space-y-3 rounded-xl border border-border bg-background p-3" aria-label={t("builderV4.galleryEditor.editPhoto", { number: selectedIndex + 1 })}>
      <div className="flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">{t("builderV4.galleryEditor.selectedPhoto", { number: selectedIndex + 1, total: images.length })}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{selected.caption || (selected.alt && !isImageFilename(selected.alt) ? selected.alt : t("builderV4.galleryEditor.noCaption"))}</p></div><button type="button" className="grid size-9 shrink-0 place-items-center rounded-lg text-destructive transition hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("builderV4.galleryEditor.removePhoto", { number: selectedIndex + 1 })} title={t("builderV4.galleryEditor.removeFromAlbum")} onClick={removeSelected}><Trash2 className="size-4" /></button></div>
      <ImageField label="Ảnh album" presencePath={builderFieldPath(sectionId, "gallery", "images", selected.id, "imageUrl")} value={selected.imageUrl} error={getError(selectedIndex, "imageUrl")} onChange={value => value ? patchSelected({ imageUrl: value }) : removeSelected()} onUpload={onUpload} onChooseMedia={onChooseMedia} />
      <Field label="Mô tả ảnh cho trình đọc màn hình" maxLength={200} presencePath={builderFieldPath(sectionId, "gallery", "images", selected.id, "alt")} value={isImageFilename(selected.alt ?? "") ? "" : selected.alt ?? ""} placeholder={t("builderV4.galleryEditor.coupleInGarden")} error={getError(selectedIndex, "alt")} onChange={value => patchSelected({ alt: value || undefined })} />
      <Field label="Chú thích hiển thị dưới ảnh (không bắt buộc)" maxLength={200} presencePath={builderFieldPath(sectionId, "gallery", "images", selected.id, "caption")} value={selected.caption ?? ""} placeholder={t("builderV4.galleryEditor.firstDayTogether")} error={getError(selectedIndex, "caption")} onChange={value => patchSelected({ caption: value || undefined })} />
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2"><Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => onFocusItem(selected.id)}><Eye className="mr-1 size-3.5" />{t("builderV4.galleryEditor.viewOnPage")}</Button><Button type="button" size="sm" variant="ghost" className="size-8 p-0" aria-label={t("builderV4.galleryEditor.movePhotoUp")} title={t("builderV4.galleryEditor.moveUp")} disabled={selectedIndex === 0} onClick={() => onChange(moveItem(images, selectedIndex, -1))}><ChevronUp className="size-4" /></Button><Button type="button" size="sm" variant="ghost" className="size-8 p-0" aria-label={t("builderV4.galleryEditor.movePhotoDown")} title={t("builderV4.galleryEditor.moveDown")} disabled={selectedIndex === images.length - 1} onClick={() => onChange(moveItem(images, selectedIndex, 1))}><ChevronDown className="size-4" /></Button><span className="ml-auto text-[11px] text-muted-foreground">{t("builderV4.galleryEditor.dragThumbnail")}</span></div>
    </section>}
  </div>;
}

function Inspector({ section, page, sectionName, onSection, onContent, onNested, onAppendGalleryImages, onUpload, onChooseMedia, setup, onBinding, onDuplicate, onDelete, pageChange, pageDelete, appearance, paletteId, template, onAppearance, gift, giftAccounts, giftAccountsLoading, giftAccountsError, onReloadGiftAccounts, onGift, issues, pageIndex, sectionIndex, weddingId, selectedEventIds, onEventIds, countdownEvents, countdownEventsLoading, countdownEventsError, onReloadCountdownEvents, onCountdownSource, onFocusStoryItem }: {
  section?: StoryBuilderV4Section; page?: StoryBuilderV4Document["pages"][number]; sectionName?: string;
  onSection: (patch: Partial<StoryBuilderV4Section>) => void; onContent: (key: string, value: unknown) => void;
  onNested: (key: string, field: string, value: unknown) => void;
  onAppendGalleryImages: (images: Record<string, unknown>[]) => number;
  onUpload: (file: File) => Promise<string | null>;
  onChooseMedia: (onChoose: (url: string) => void) => void;
  setup: WeddingSetup;
  onBinding: (target: string, mode: "dynamic" | "manual" | "static" | null) => void;
  onDuplicate: () => void; onDelete: () => void;
  pageChange: (patch: Partial<StoryBuilderV4Document["pages"][number]>) => void; pageDelete: () => void;
  appearance: StoryBuilderV4Document["appearance"]; paletteId: string; template?: StoryTemplateSummaryV4;
  onAppearance: (patch: Partial<StoryBuilderV4Document["appearance"]>) => void;
  gift?: StoryBuilderV4Document["content"]["gift"]; giftAccounts: GiftBankAccount[]; giftAccountsLoading: boolean; giftAccountsError: string; onReloadGiftAccounts: () => void;
  onGift: (patch: Partial<NonNullable<StoryBuilderV4Document["content"]["gift"]>>) => void;
  issues: readonly BuilderIssue[]; pageIndex: number; sectionIndex: number;
  weddingId: string; selectedEventIds: string[]; onEventIds: (ids: string[]) => void;
  countdownEvents: WeddingEvent[]; countdownEventsLoading: boolean; countdownEventsError: boolean; onReloadCountdownEvents: () => void;
  onCountdownSource: (sourceId: string, targetDate?: string) => void;
  onFocusStoryItem: (sectionId: string, itemId: string) => void;
}) {
  const { t } = useTranslation("weddingEditor");
  const content = record(section?.content); const [tab, setTab] = useState<"content" | "style">("content");
  const [addingHeroSlideFor, setAddingHeroSlideFor] = useState<string | null>(null);
  if (!section) return <div className="p-5 text-sm text-muted-foreground">{t("builderV4.inspector.chooseAccount")}</div>;
  const addingHeroSlide = addingHeroSlideFor === section.id;
  const errorAt = (path: readonly PropertyKey[]) => {
    const issue = issues.find(item => item.path.length === path.length && path.every((part, index) => item.path[index] === part));
    return issue ? describeV4Issue(issue) : undefined;
  };
  const sectionPath = ["pages", pageIndex, "sections", sectionIndex] as const;
  const contentError = (key: string, ...nested: (string | number)[]) => errorAt([...sectionPath, "content", key, ...nested]);
  const field = (label: string, key: string, placeholder = "", multiline = false) => <Field label={label} presencePath={builderFieldPath(section.id, section.type, "content", key)} value={String(content[key] ?? "")} placeholder={placeholder} multiline={multiline} error={contentError(key)} onChange={value => onContent(key, value)} />;
  const inputClass = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const availableBindings = setupBindings[section.type] ?? [];
  const bindingLabel = (target: string) => {
    const labels: Record<string, string> = {
      heroImageUrl: t("builderV4.inspector.bindingCover"),
      "mainEvent.startsAt": t("builderV4.inspector.bindingEventDate"),
      "mainEvent.timeZoneId": t("builderV4.inspector.bindingTimezone"),
      "mainEvent.venueName": t("builderV4.inspector.bindingVenue"),
      "mainEvent.address": t("builderV4.inspector.bindingAddress"),
      "countdown.targetDate": t("builderV4.inspector.bindingCountdownDate"),
    };
    return labels[target] ?? target;
  };
  const bindings = section.bindings ?? [];
  const list = (key: "items" | "images" | "events" | "slides" | "groom" | "bride") => Array.isArray(content[key]) ? content[key] as Record<string, unknown>[] : [];
  const giftSelections = gift?.selectedAccounts ?? [];
  const selectGiftAccount = (role: "groom" | "bride", accountId: string) => {
    const next = giftSelections.filter(item => item.role !== role && (!accountId || item.accountId !== accountId));
    if (accountId) next.push({ role, accountId });
    // Keep the role order stable for predictable drafts and previews.
    next.sort((left, right) => left.role === "groom" ? -1 : right.role === "groom" ? 1 : 0);
    onGift({ selectedAccounts: next });
  };
  return <div className="min-h-[300px] w-full min-w-0 max-w-full overflow-x-hidden">
    <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3"><p className="text-xs text-muted-foreground">{t("builderV4.inspector.editing")}</p><h2 className="mt-1 text-sm font-semibold">{sectionName}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t(`builderV4.sectionDescriptions.${section.type}`)}</p>{errorAt(sectionPath) && <p role="alert" className="mt-2 text-xs font-medium text-destructive">{errorAt(sectionPath)}</p>}</div>
    <div className="flex w-full min-w-0 border-b border-border px-4" role="group" aria-label={t("builderV4.inspector.editSection", "Edit {{section}}", { section: sectionName })}><button type="button" aria-pressed={tab === "content"} className={`min-w-0 flex-1 border-b-2 px-2 py-2.5 text-xs sm:px-3 sm:text-sm ${tab === "content" ? "border-primary text-primary-hover" : "border-transparent text-muted-foreground"}`} onClick={() => setTab("content")}>{t("builderV4.inspector.contentTab")}</button><button type="button" aria-pressed={tab === "style"} className={`min-w-0 flex-1 border-b-2 px-2 py-2.5 text-xs sm:px-3 sm:text-sm ${tab === "style" ? "border-primary text-primary-hover" : "border-transparent text-muted-foreground"}`} onClick={() => setTab("style")}>{t("builderV4.inspector.displayTab")}</button></div>
    <div className="w-full min-w-0 max-w-full space-y-5 overflow-x-hidden p-4">
      {page && tab === "content" && <details className="border-b border-border pb-4" open={issues.some(issue => issue.path[0] === "pages" && issue.path[1] === pageIndex && issue.path[2] !== "sections")}>
        <summary className="min-h-10 cursor-pointer py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.inspector.pageSettings")} · {page.title}</summary>
        <div className="mt-3 space-y-3">
          <Field label={t("builderV4.inspector.pageName")} presencePath={builderFieldPath(page.id, "page", "title")} value={page.title} error={errorAt(["pages", pageIndex, "title"])} onChange={value => pageChange({ title: value, navigationLabel: page.navigationLabel || value })} />
          <Field label={t("builderV4.inspector.navigationLabel")} presencePath={builderFieldPath(page.id, "page", "navigationLabel")} value={page.navigationLabel ?? page.title} error={errorAt(["pages", pageIndex, "navigationLabel"])} onChange={value => pageChange({ navigationLabel: value })} />
          {page.isHome ? <p className="text-xs text-muted-foreground">{t("builderV4.inspector.pageHomeHint")}</p> : <Field label="Đường dẫn" presencePath={builderFieldPath(page.id, "page", "slug")} value={page.slug} placeholder="our-story" error={errorAt(["pages", pageIndex, "slug"])} onChange={value => pageChange({ slug: value.toLocaleLowerCase() })} />}
          <label className="flex min-h-10 items-center justify-between text-sm">{t("builderV4.inspector.showPage")}<input type="checkbox" checked={page.visible !== false} onChange={event => pageChange({ visible: event.target.checked })} /></label>
          {errorAt(["pages", pageIndex, "visible"]) && <p className="text-xs text-destructive">{errorAt(["pages", pageIndex, "visible"])}</p>}
          {errorAt(["pages", pageIndex, "sections"]) && <p className="text-xs text-destructive">{errorAt(["pages", pageIndex, "sections"])}</p>}
          {!page.isHome && <Button size="sm" variant="outline" className="text-destructive" onClick={pageDelete}><Trash2 className="mr-1.5 size-3.5" />{t("builderV4.inspector.deletePage")}</Button>}
        </div>
      </details>}
      {tab === "content" ? <>
        <Field label={t("builderV4.inspector.sectionNavigationTitle", "Section navigation title")} value={section.navigationLabel ?? ""} error={errorAt([...sectionPath, "navigationLabel"])} onChange={value => onSection({ navigationLabel: value })} placeholder={sectionName} />
        {section.type === "hero" && (() => {
          const setupBinding = bindings.find(binding => binding.target === "heroImageUrl");
          const usingWeddingSetup = Boolean(setupBinding && setupBinding.mode !== "manual");
          const coverUrl = usingWeddingSetup ? setup.coverImageUrl ?? "" : String(content.imageUrl ?? "");
          const coverFocus = record(content.imageFocus);
          const focusX = typeof coverFocus.x === "number" ? coverFocus.x : 50;
          const focusY = typeof coverFocus.y === "number" ? coverFocus.y : 50;
          const heroSlides = list("slides");
          return <>
            {field("Tiêu đề lớn", "title", "Tên hai bạn hoặc tên đám cưới")}{field("Lời dẫn", "subtitle", "Lời mời ngắn")}{field("Nhãn nút chính", "ctaLabel", "Ví dụ: Xem lịch trình")}{field("Dòng nhấn", "eyebrow", "")}
            <fieldset className="w-full min-w-0 max-w-full space-y-3 rounded-xl border border-border p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.media.coverSource")}</legend>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("builderV4.media.chooseCoverSource")}>
                <button type="button" aria-pressed={usingWeddingSetup} className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${usingWeddingSetup ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover" : "border-border bg-background font-medium text-foreground hover:bg-muted"}`} onClick={() => onBinding("heroImageUrl", "dynamic")}>{usingWeddingSetup && <Check className="size-3.5" aria-hidden="true" />}{t("builderV4.media.fromSetup")}</button>
                <button type="button" aria-pressed={!usingWeddingSetup} className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${!usingWeddingSetup ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover" : "border-border bg-background font-medium text-foreground hover:bg-muted"}`} onClick={() => { if (setupBinding) onBinding("heroImageUrl", null); }}>{!usingWeddingSetup && <Check className="size-3.5" aria-hidden="true" />}{t("builderV4.media.customImage")}</button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{usingWeddingSetup ? t("builderV4.media.setupShared") : t("builderV4.media.customHint")}</p>
              {usingWeddingSetup && !coverUrl && <p role="status" className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{t("builderV4.media.setupNoCover")}</p>}
              <ImageField display="cover" label={usingWeddingSetup ? t("builderV4.media.setupSource") : t("builderV4.media.websiteCover")} presencePath={builderFieldPath(section.id, "hero", "content", "imageUrl")} value={coverUrl} previewPosition={`${focusX}% ${focusY}%`} readOnly={usingWeddingSetup} placeholder={t("builderV4.placeholders.imageUrlOrUpload")} error={contentError("imageUrl")} onChange={value => onContent("imageUrl", value)} onUpload={onUpload} onChooseMedia={onChooseMedia} />
              <Field label="Văn bản mô tả ảnh" maxLength={200} presencePath={builderFieldPath(section.id, "hero", "content", "imageAlt")} value={String(content.imageAlt ?? "")} placeholder="Ví dụ: Cô dâu và chú rể trong bộ ảnh cưới" error={contentError("imageAlt")} onChange={value => onContent("imageAlt", value)} />
            </fieldset>
            <fieldset className="w-full min-w-0 max-w-full space-y-3 rounded-xl border border-border p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.inspector.focalPoint")}</legend>
              <p className="text-xs leading-5 text-muted-foreground">{t("builderV4.inspector.focalPointHint")}</p>
              {([ ["x", t("builderV4.inspector.horizontal"), focusX], ["y", t("builderV4.inspector.vertical"), focusY] ] as const).map(([axis, label, value]) => <label key={axis} className="grid gap-2 text-xs font-medium text-foreground">{label} · {value}%<input aria-label={`${t("builderV4.inspector.focalPoint")} · ${label}`} type="range" min={0} max={100} value={value} className="w-full accent-primary" onChange={event => onContent("imageFocus", { x: axis === "x" ? Number(event.target.value) : focusX, y: axis === "y" ? Number(event.target.value) : focusY })} /></label>)}
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("builderV4.inspector.overlay")}
                <select className={inputClass} value={String(content.overlayStrength ?? "template")} onChange={event => onContent("overlayStrength", event.target.value === "template" ? undefined : event.target.value)}>
                  <option value="template">{t("builderV4.inspector.templateStyle")}</option><option value="none">{t("builderV4.inspector.noOverlay")}</option><option value="soft">{t("builderV4.inspector.lightOverlay")}</option><option value="strong">{t("builderV4.inspector.strongOverlay")}</option>
                </select>
              </label>
            </fieldset>
            <section className="w-full min-w-0 max-w-full space-y-3 overflow-x-hidden rounded-xl border border-border p-3">
              <div><h3 className="text-sm font-semibold">{t("builderV4.inspector.slideshow")} · {Math.min(3, heroSlides.length + (coverUrl ? 1 : 0))}/3</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("builderV4.inspector.slideshowDescription")}</p></div>
              {heroSlides.slice(0, 3).map((slide, index) => <fieldset key={String(slide.id)} className="space-y-3 rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{t("builderV4.inspector.secondaryImage", { number: index + 1 })}</span><button type="button" className="grid size-9 place-items-center rounded-lg text-destructive hover:bg-destructive/5" aria-label={t("builderV4.inspector.removeSecondaryImage", { number: index + 1 })} onClick={() => onContent("slides", heroSlides.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-4" /></button></div>
                <ImageField label={t("builderV4.inspector.slideshow")} presencePath={builderFieldPath(section.id, "hero", "slides", String(slide.id), "imageUrl")} value={String(slide.imageUrl ?? "")} error={contentError("slides", index, "imageUrl")} onChange={value => onContent("slides", heroSlides.map((item, itemIndex) => itemIndex === index ? { ...item, imageUrl: value } : item))} onUpload={onUpload} onChooseMedia={onChooseMedia} />
                <Field label="Mô tả ảnh" maxLength={200} presencePath={builderFieldPath(section.id, "hero", "slides", String(slide.id), "alt")} value={String(slide.alt ?? "")} error={contentError("slides", index, "alt")} onChange={value => onContent("slides", heroSlides.map((item, itemIndex) => itemIndex === index ? { ...item, alt: value } : item))} />
                <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => onContent("slides", moveItem(heroSlides, index, -1))}><ChevronUp className="mr-1 size-3.5" />{t("builderV4.inspector.moveUp")}</Button><Button type="button" size="sm" variant="outline" disabled={index === heroSlides.length - 1} onClick={() => onContent("slides", moveItem(heroSlides, index, 1))}><ChevronDown className="mr-1 size-3.5" />{t("builderV4.inspector.moveDown")}</Button></div>
              </fieldset>)}
              {addingHeroSlide && heroSlides.length < 3 && <fieldset className="space-y-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold">{t("builderV4.inspector.newSecondaryImage")}</span><button type="button" className="min-h-9 px-2 text-xs text-muted-foreground" onClick={() => setAddingHeroSlideFor(null)}>{t("builderV4.actions.cancel")}</button></div><ImageField label={t("builderV4.inspector.chooseSecondaryImage")} onChange={value => { if (value) onContent("slides", [...heroSlides, { id: id(), imageUrl: value, alt: "" }]); setAddingHeroSlideFor(null); }} value="" onUpload={onUpload} onChooseMedia={onChooseMedia} /></fieldset>}
              {!addingHeroSlide && heroSlides.length < 2 && <Button type="button" size="sm" variant="outline" onClick={() => setAddingHeroSlideFor(section.id)}><Plus className="mr-1.5 size-3.5" />{t("builderV4.inspector.addSecondaryImage")}</Button>}
              {heroSlides.length >= 2 && <p className="text-xs text-muted-foreground">{t("builderV4.inspector.maxSecondaryImages")}</p>}
            </section>
          </>;
        })()}
        {section.type === "couple" && <>{field("Giới thiệu", "intro", "Một câu ngắn về hai bạn", true)}{(["groom", "bride"] as const).map((personKey, index) => {
          const person = record(content[personKey]);
          const social = record(person.social);
          const personPath = (...keys: string[]) => builderFieldPath(section.id, "couple", personKey, ...keys);
          const roleLabel = index === 0 ? t("builderV4.inspector.groom") : t("builderV4.inspector.bride");
          return <fieldset key={personKey} className="space-y-3 rounded-xl border border-border p-3 sm:p-4">
            <legend className="px-2 text-sm font-semibold text-foreground">{roleLabel}</legend>
            <Field label="Tên hiển thị" maxLength={50} presencePath={personPath("displayName")} value={String(person.displayName ?? person.fullName ?? "")} placeholder={index === 0 ? "Tên chú rể" : "Tên cô dâu"} error={contentError(personKey, "displayName")} onChange={value => onNested(personKey, "displayName", value)} />
            <ImageField label="Ảnh chân dung" presencePath={personPath("photoUrl")} value={String(person.photoUrl ?? "")} error={contentError(personKey, "photoUrl")} onChange={value => onNested(personKey, "photoUrl", value)} onUpload={onUpload} onChooseMedia={onChooseMedia} />
            <Field label="Lời giới thiệu" maxLength={2000} presencePath={personPath("bio")} value={String(person.bio ?? "")} placeholder="Sở thích, tính cách hoặc một điều muốn chia sẻ…" multiline error={contentError(personKey, "bio")} onChange={value => onNested(personKey, "bio", value)} />
            <details className="border-t border-border pt-3">
              <summary className="min-h-10 cursor-pointer py-2 text-xs font-medium text-muted-foreground">{t("builderV4.inspector.familyDetails")}</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Tên cha" maxLength={100} presencePath={personPath("fatherName")} value={String(person.fatherName ?? "")} error={contentError(personKey, "fatherName")} onChange={value => onNested(personKey, "fatherName", value)} />
                <Field label="Tên mẹ" maxLength={100} presencePath={personPath("motherName")} value={String(person.motherName ?? "")} error={contentError(personKey, "motherName")} onChange={value => onNested(personKey, "motherName", value)} />
              </div>
            </details>
            <details className="border-t border-border pt-3" open={Boolean(contentError(personKey, "social", "facebook") || contentError(personKey, "social", "instagram"))}>
              <summary className="min-h-10 cursor-pointer py-2 text-xs font-medium text-muted-foreground">{t("builderV4.inspector.socialMedia")}</summary>
              <div className="mt-3 grid gap-3">
                <Field label="Facebook" type="url" maxLength={500} presencePath={personPath("social", "facebook")} value={String(social.facebook ?? "")} placeholder="https://facebook.com/..." error={contentError(personKey, "social", "facebook")} onChange={value => onNested(personKey, "social", { ...social, facebook: value })} />
                <Field label="Instagram" type="url" maxLength={500} presencePath={personPath("social", "instagram")} value={String(social.instagram ?? "")} placeholder="https://instagram.com/..." error={contentError(personKey, "social", "instagram")} onChange={value => onNested(personKey, "social", { ...social, instagram: value })} />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("builderV4.inspector.secureSocialHint")}</p>
            </details>
          </fieldset>;
        })}</>}
        {section.type === "countdown" && (() => {
          const dateBinding = bindings.find(binding => binding.target === "countdown.targetDate");
          const targetEventId = String(content.targetEventId ?? (dateBinding && dateBinding.mode !== "manual" ? "main" : "manual"));
          const targetEvent = countdownEvents.find(event => event.id === targetEventId);
          const targetZone = (targetEventId === "main" ? setup.timeZoneId : targetEvent?.timeZoneId || setup.timeZoneId) ?? undefined;
          const targetValue = (targetEventId === "main" ? dateBinding?.mode === "static" ? String(content.targetDate ?? "") : setup.eventDateTime : targetEvent?.startsAt) ?? undefined;
          const formatLocal = (value?: string, zone = targetZone) => value ? isoToLocalDateTime(value, zone).replace("T", " · ") : t("builderV4.inspector.noDateTime");
          const changeTarget = (nextId: string) => {
            if (nextId === "main") {
              onCountdownSource("main");
              return;
            }
            if (nextId === "manual") {
              const currentDate = targetValue || (targetEventId === "manual" ? String(content.targetDate ?? "") : "");
              onCountdownSource("manual", currentDate || undefined);
              return;
            }
            const event = countdownEvents.find(item => item.id === nextId);
            onCountdownSource(nextId, event?.startsAt || undefined);
          };
          return <>
            {field("Tiêu đề", "title")}
            {field("Lời dẫn", "intro", "Ví dụ: Chúng mình rất mong được gặp bạn.", true)}
            <fieldset className="space-y-3 rounded-xl border border-border bg-primary/[0.025] p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.inspector.targetDateSection")}</legend>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("builderV4.inspector.countDownTo")}
                <select className={inputClass} value={targetEventId} onChange={event => changeTarget(event.target.value)}>
                  <option value="main">{t("builderV4.inspector.mainDateSetup")}</option>
                  {countdownEvents.filter(event => event.id !== "main").map(event => <option key={event.id} value={event.id} disabled={!event.startsAt}>{event.title}{event.startsAt ? ` · ${formatLocal(event.startsAt, event.timeZoneId)}` : ` · ${t("builderV4.inspector.noDateTime")}`}</option>)}
                  {targetEventId !== "main" && targetEventId !== "manual" && !targetEvent && <option value={targetEventId}>{t("builderV4.inspector.missingEvent")}</option>}
                  <option value="manual">{t("builderV4.inspector.manualDateTime")}</option>
                </select>
              </label>
              {targetEventId === "manual" ? <DateTimeField label={t("builderV4.fields.targetDate")} presencePath={builderFieldPath(section.id, "countdown", "content", "targetDate")} value={String(content.targetDate ?? "")} timeZone={setup.timeZoneId ?? undefined} error={contentError("targetDate")} onChange={value => onContent("targetDate", value)} /> : <div className="rounded-lg border border-primary/10 bg-background px-3 py-2.5"><p className="text-xs font-medium text-foreground">{targetEventId === "main" ? t("builderV4.inspector.setupSyncMainDate") : targetEvent?.title ?? t("builderV4.inspector.selectedEvent")}</p><p className="mt-1 text-xs text-muted-foreground">{formatLocal(targetValue)} · {t("builderV4.inspector.timezone")} {targetZone ?? "Asia/Ho_Chi_Minh"}</p>{!targetValue && <p className="mt-1 text-xs text-amber-700">{t("builderV4.inspector.completeEventDate")}</p>}</div>}
              {countdownEventsError && <div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/5 p-2.5 text-xs text-destructive"><span>{t("builderV4.inspector.eventListFailed")}</span><Button type="button" size="sm" variant="outline" onClick={onReloadCountdownEvents}>{t("builderV4.inspector.retry")}</Button></div>}
              {countdownEventsLoading && <p role="status" className="text-xs text-muted-foreground">{t("builderV4.inspector.loadingEventsShort")}</p>}
            </fieldset>
            <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm"><span><span className="block font-medium text-foreground">{t("builderV4.inspector.showSeconds")}</span><span className="block text-xs text-muted-foreground">{t("builderV4.inspector.lighterClock")}</span></span><input type="checkbox" checked={content.showSeconds === true} onChange={event => onContent("showSeconds", event.target.checked)} /></label>
            <Field label={t("builderV4.inspector.weddingDayMessage")} maxLength={200} value={String(content.completedMessage ?? "")} placeholder={t("builderV4.placeholders.defaultWeddingDayMessage")} error={contentError("completedMessage")} onChange={value => onContent("completedMessage", value || undefined)} />
          </>;
        })()}
        {section.type === "loveStory" && <div className="space-y-4">{field("Giới thiệu", "intro", "", true)}<StoryMomentsEditor sectionId={section.id} items={list("items") as StoryMoment[]} onChange={items => onContent("items", items)} onUpload={onUpload} onChooseMedia={onChooseMedia} getError={(index, key) => contentError("items", index, key)} onFocusItem={itemId => onFocusStoryItem(section.id, itemId)} /></div>}
        {section.type === "gallery" && <div className="space-y-4">{field("Giới thiệu album", "intro", "", true)}<GalleryImagesEditor sectionId={section.id} images={list("images") as GalleryItem[]} onChange={images => onContent("images", images)} onAppend={onAppendGalleryImages} onUpload={onUpload} onChooseMedia={onChooseMedia} getError={(index, key) => contentError("images", index, key)} onFocusItem={itemId => onFocusStoryItem(section.id, itemId)} /></div>}
        {section.type === "events" && <><Field label={t("builderV4.fields.intro")} presencePath={builderFieldPath(section.id, "events", "content", "intro")} value={String(content.intro ?? "")} multiline error={contentError("intro")} onChange={value => onContent("intro", value)} /><WeddingEventPicker weddingId={weddingId} setup={setup} selectedIds={selectedEventIds} onChange={onEventIds} presencePrefix={builderFieldPath(section.id, "events", "event")} /><details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">{t("builderV4.inspector.oldWebsiteEvents")}</summary><p className="mt-2 text-xs leading-5 text-muted-foreground">{t("builderV4.inspector.eventLegacyData")}</p>{list("events").map(event => <p key={String(event.id)} className="mt-2 text-sm">{String(event.title ?? t("builderV4.inspector.noEvent"))}</p>)}</details></>}
        {section.type === "weddingParty" && <>{field("Giới thiệu", "intro", "", true)}{(["groom", "bride"] as const).map((side, sideIndex) => { const members = list(side); return <fieldset key={side} className="space-y-3 border-t border-border pt-4"><legend className="px-1 text-xs font-semibold text-muted-foreground">{sideIndex === 0 ? t("builderV4.inspector.groomsmen") : t("builderV4.inspector.bridesmaids")}</legend>{members.map((member, index) => <div key={String(member.id)} className="space-y-3 rounded-xl border border-border p-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">{t("builderV4.inspector.memberNumber", { number: index + 1 })}</span><button type="button" className="min-h-10 px-2 text-sm text-destructive" onClick={() => onContent(side, members.filter((_, i) => i !== index))}>{t("builderV4.inspector.delete")}</button></div><Field label="Họ tên" presencePath={builderFieldPath(section.id, "weddingParty", side, String(member.id), "name")} value={String(member.name ?? "")} error={contentError(side, index, "name")} onChange={value => onContent(side, members.map((item, i) => i === index ? { ...item, name: value } : item))} /><Field label="Vai trò" presencePath={builderFieldPath(section.id, "weddingParty", side, String(member.id), "role")} value={String(member.role ?? "")} placeholder={side === "groom" ? t("builderV4.placeholders.groomFriend") : t("builderV4.placeholders.brideFriend")} error={contentError(side, index, "role")} onChange={value => onContent(side, members.map((item, i) => i === index ? { ...item, role: value } : item))} /><Field label="Lời giới thiệu" presencePath={builderFieldPath(section.id, "weddingParty", side, String(member.id), "bio")} value={String(member.bio ?? "")} multiline error={contentError(side, index, "bio")} onChange={value => onContent(side, members.map((item, i) => i === index ? { ...item, bio: value } : item))} /><ImageField label="Ảnh thành viên" presencePath={builderFieldPath(section.id, "weddingParty", side, String(member.id), "photoUrl")} value={String(member.photoUrl ?? "")} error={contentError(side, index, "photoUrl")} onChange={value => onContent(side, members.map((item, i) => i === index ? { ...item, photoUrl: value } : item))} onUpload={onUpload} onChooseMedia={onChooseMedia} /><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => onContent(side, moveItem(members, index, -1))}><ChevronUp className="mr-1 size-3.5" />{t("builderV4.inspector.moveUp")}</Button><Button type="button" size="sm" variant="outline" disabled={index === members.length - 1} onClick={() => onContent(side, moveItem(members, index, 1))}><ChevronDown className="mr-1 size-3.5" />{t("builderV4.inspector.moveDown")}</Button></div></div>)}<Button type="button" size="sm" variant="outline" disabled={members.length >= 12} onClick={() => onContent(side, [...members, { id: id(), name: "", role: "" }])}><Plus className="mr-1 size-3.5" />{sideIndex === 0 ? t("builderV4.inspector.addGroomsman") : t("builderV4.inspector.addBridesmaid")}</Button></fieldset>; })}</>}
        {section.type === "rsvp" && <>{field("Tiêu đề", "title")}{field("Mô tả", "intro", "", true)}{field("Nhãn nút", "submitLabel")}</>}
        {section.type === "wishes" && <>{field("Tiêu đề", "title")}{field("Mô tả", "intro", "", true)}<label className="grid gap-1.5 text-sm"><span className="font-medium">{t("builderV4.inspector.wishesInitialCount")}</span><select className={inputClass} value={typeof content.displayLimit === "number" ? String(content.displayLimit) : "3"} onChange={event => onContent("displayLimit", Number(event.target.value))}><option value="3">{t("builderV4.inspector.wishesCompact", { count: 3 })}</option><option value="6">{t("builderV4.inspector.wishesCount", { count: 6 })}</option><option value="9">{t("builderV4.inspector.wishesCount", { count: 9 })}</option><option value="12">{t("builderV4.inspector.wishesCount", { count: 12 })}</option><option value="0">{t("builderV4.inspector.allWishes")}</option></select><span className="text-xs text-muted-foreground">{t("builderV4.inspector.showMoreAnytime")}</span></label><fieldset className="space-y-3 border-t border-border pt-4"><legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.inspector.wishesInteractions")}</legend><label className="flex min-h-11 items-center justify-between gap-3 text-sm"><span><span className="block font-medium text-foreground">{t("builderV4.inspector.allowLikes")}</span><span className="block text-xs text-muted-foreground">{t("builderV4.inspector.allowLikesHint")}</span></span><input type="checkbox" checked={content.allowLikes === true} onChange={event => onContent("allowLikes", event.target.checked)} /></label><label className="flex min-h-11 items-center justify-between gap-3 text-sm"><span><span className="block font-medium text-foreground">{t("builderV4.inspector.allowComments")}</span><span className="block text-xs text-muted-foreground">{t("builderV4.inspector.allowCommentsHint")}</span></span><input type="checkbox" checked={content.allowComments === true} onChange={event => onContent("allowComments", event.target.checked)} /></label></fieldset></>}
        {section.type === "gift" && <>{field("Tiêu đề", "title")}{field("Mô tả", "intro", "", true)}<label className="flex min-h-10 items-center justify-between border-t border-border pt-3 text-sm">{t("builderV4.inspector.showWeddingGift")}<input type="checkbox" checked={gift?.enabled ?? false} onChange={event => onGift({ enabled: event.target.checked })} /></label><div className="space-y-4 border-t border-border pt-4">
          {!gift?.enabled && <p className="rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{t("builderV4.inspector.giftOffHint")}</p>}
          <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-foreground">{t("builderV4.inspector.recipientAccounts")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("builderV4.inspector.chooseOneAccountEach")}</p></div><Button type="button" size="sm" variant="outline" disabled={giftAccountsLoading} onClick={onReloadGiftAccounts}>{giftAccountsLoading ? t("builderV4.inspector.loading") : t("builderV4.inspector.refresh")}</Button></div>
          {giftAccountsLoading ? <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{t("builderV4.inspector.loadingAccounts")}</p> : giftAccountsError ? <div className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs"><p>{giftAccountsError}</p><Button type="button" size="sm" variant="outline" onClick={onReloadGiftAccounts}>{t("builderV4.inspector.retry")}</Button></div> : giftAccounts.length === 0 ? <div className="space-y-2 rounded-lg border border-dashed border-border p-3 text-xs"><p className="leading-5 text-muted-foreground">{t("builderV4.inspector.noGiftAccount")}</p><Button asChild type="button" size="sm" variant="outline"><Link href={`/weddings/${encodeURIComponent(weddingId)}/gifts`}>{t("builderV4.inspector.manageGiftAccounts")}</Link></Button></div> : <>
            {(["groom", "bride"] as const).map(role => {
              const selectedId = giftSelections.find(item => item.role === role)?.accountId ?? "";
              const selectedExists = !selectedId || giftAccounts.some(account => account.id === selectedId);
              const otherId = giftSelections.find(item => item.role !== role)?.accountId;
              const personLabel = t(`builderV4.inspector.${role}`);
              return <fieldset key={role} className="space-y-2 rounded-xl bg-muted/20 p-3">
                <label className="grid gap-1.5 text-xs font-medium text-foreground">{t("builderV4.inspector.giftAccount", { person: personLabel })}
                  <select className={inputClass} value={selectedId} onChange={event => selectGiftAccount(role, event.target.value)}><option value="">{t("builderV4.inspector.chooseAccount")}</option>{giftAccounts.map(account => <option key={account.id} value={account.id} disabled={account.id === otherId}>{account.label ? `${account.label} · ` : ""}${account.bankName} · ${account.accountNumber}</option>)}</select>
                </label>
                {selectedId && !selectedExists && <p className="text-xs text-amber-700">{t("builderV4.inspector.accountRemoved")}</p>}
                <Field label={t("builderV4.fields.displayLabel")} value={gift?.[`${role}Label`] ?? ""} placeholder={role === "groom" ? t("builderV4.inspector.groomOrFamily") : t("builderV4.inspector.brideOrFamily")} error={errorAt(["content", "gift", `${role}Label`])} onChange={value => onGift({ [`${role}Label`]: value })} />
              </fieldset>;
            })}
          </>}
          {!giftSelections.length && <details className="rounded-lg border border-border px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">{t("builderV4.inspector.legacyGiftDetails")}</summary><div className="mt-3 space-y-3">{(["groomBank", "groomHolder", "groomAccount", "brideBank", "brideHolder", "brideAccount"] as const).map(key => <Field key={key} label={{ groomBank: t("builderV4.fields.groomBank"), groomHolder: t("builderV4.fields.groomAccountHolder"), groomAccount: t("builderV4.fields.groomAccountNumber"), brideBank: t("builderV4.fields.brideBank"), brideHolder: t("builderV4.fields.brideAccountHolder"), brideAccount: t("builderV4.fields.brideAccountNumber") }[key]} value={gift?.[key] ?? ""} error={errorAt(["content", "gift", key])} onChange={value => onGift({ [key]: value })} />)}</div></details>}
          {giftSelections.length > 0 && <p className="text-xs leading-5 text-muted-foreground">{t("builderV4.inspector.selectedGiftValidation")}</p>}
        </div></>}
        {availableBindings.length > 0 && section.type !== "hero" && <fieldset className="space-y-3 border-t border-border pt-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("builderV4.inspector.websiteData")}</legend>
          <p className="text-xs leading-5 text-muted-foreground">{t("builderV4.inspector.websiteDataHint")}</p>
          {bindings.map(binding => {
            const option = availableBindings.find(item => item.target === binding.target);
            if (!option) return null;
            const currentValue = setupBindingValue(binding.target, setup);
            return <div key={binding.target} className="grid gap-2 rounded-lg bg-muted/40 p-3">
              <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-medium text-foreground">{bindingLabel(binding.target)}</p><p className="mt-1 break-words text-xs text-muted-foreground">{currentValue || t("builderV4.inspector.notFilledInSetup")}</p></div><button type="button" className="min-h-9 shrink-0 rounded-md px-2 text-xs text-destructive hover:bg-destructive/5" aria-label={t("builderV4.inspector.removeBinding", { label: bindingLabel(binding.target) })} onClick={() => onBinding(binding.target, null)}>{t("builderV4.inspector.removeLink")}</button></div>
              <select className={inputClass} aria-label={t("builderV4.inspector.howToUse", { label: bindingLabel(binding.target) })} value={binding.mode ?? "dynamic"} onChange={event => onBinding(binding.target, event.target.value as "dynamic" | "manual" | "static")}><option value="dynamic">{t("builderV4.inspector.syncAutomatically")}</option><option value="manual">{t("builderV4.inspector.preferEdited")}</option><option value="static">{t("builderV4.inspector.keepAtPublish")}</option></select>
            </div>;
          })}
          {availableBindings.some(option => !bindings.some(binding => binding.target === option.target)) && <select className={inputClass} value="" aria-label={t("builderV4.inspector.addSetupData")} onChange={event => { if (event.target.value) onBinding(event.target.value, "dynamic"); }}><option value="">{t("builderV4.inspector.addSetupData")}</option>{availableBindings.filter(option => !bindings.some(binding => binding.target === option.target)).map(option => <option key={option.target} value={option.target}>{bindingLabel(option.target)}</option>)}</select>}
        </fieldset>}
      </> : <>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("builderV4.inspector.siteEffects")}
          <select className={inputClass} value={appearance.motion ?? "template"} onChange={event => onAppearance({ motion: event.target.value as "template" | "off" })}>
            <option value="template">{t("builderV4.inspector.useTemplateEffects")}</option>
            <option value="off">{t("builderV4.inspector.turnOffEffects")}</option>
          </select>
          <span className="text-[11px] font-normal leading-5">{t("builderV4.inspector.reducedMotion")}</span>
        </label>
        {template && <>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("builderV4.inspector.colorPalette")}
            <select className={inputClass} value={paletteId} onChange={event => onAppearance({ paletteId: event.target.value })}>{template.config.palettes.map(palette => <option key={palette.id} value={palette.id}>{palette.label}</option>)}</select>
            {errorAt(["appearance", "paletteId"]) && <span className="text-xs text-destructive">{errorAt(["appearance", "paletteId"])}</span>}
          </label>
          {(["fontHeading", "fontBody"] as const).map(key => <label key={key} className="grid gap-1.5 text-xs font-medium text-muted-foreground">{key === "fontHeading" ? t("builderV4.inspector.headingFont") : t("builderV4.inspector.bodyFont")}
            <select className={inputClass} value={appearance[key] ?? template.config.theme[key]} onChange={event => onAppearance({ [key]: event.target.value })}>{template.config.allowedFonts.map(font => <option key={font} value={font}>{font}</option>)}</select>
            {errorAt(["appearance", key]) && <span className="text-xs text-destructive">{errorAt(["appearance", key])}</span>}
          </label>)}
        </>}
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("builderV4.inspector.displayStyle")}
          <select className={inputClass} value={section.variant} onChange={event => onSection({ variant: event.target.value } as Partial<StoryBuilderV4Section>)}>{variantOptions[section.type].map(value => <option key={value} value={value}>{t(`builderV4.variantNames.${value}`, { defaultValue: variantNames[value] ?? value })}</option>)}</select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("builderV4.inspector.spacing")}
          <select className={inputClass} value={section.style?.spacing ?? "normal"} onChange={event => onSection({ style: { ...section.style, spacing: event.target.value as "compact" | "normal" | "spacious" } })}><option value="compact">{t("builderV4.inspector.compact")}</option><option value="normal">{t("builderV4.inspector.standard")}</option><option value="spacious">{t("builderV4.inspector.spacious")}</option></select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("builderV4.inspector.sectionBackground")}
          <select className={inputClass} value={section.style?.background ?? "default"} onChange={event => onSection({ style: { ...section.style, background: event.target.value as "default" | "soft" | "accent" } })}><option value="default">{t("builderV4.inspector.backgroundDefault")}</option><option value="soft">{t("builderV4.inspector.backgroundSoft")}</option><option value="accent">{t("builderV4.inspector.backgroundAccent")}</option></select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{t("builderV4.inspector.motion")}
          <select className={inputClass} value={section.style?.animation ?? "none"} onChange={event => onSection({ style: { ...section.style, animation: event.target.value as "none" | "fade" | "rise" | "stagger" | "zoom" } })}><option value="none">{t("builderV4.inspector.motionNone")}</option><option value="fade">{t("builderV4.inspector.motionFade")}</option><option value="rise">{t("builderV4.inspector.motionRise")}</option><option value="stagger">{t("builderV4.inspector.motionStagger")}</option><option value="zoom">{t("builderV4.inspector.motionZoom")}</option></select>
          <span className="text-[11px] font-normal leading-5">{t("builderV4.inspector.motionReducedHint")}</span>
        </label>
      </>}
      <div className="flex gap-2 border-t border-border pt-4"><Button type="button" size="sm" variant="outline" onClick={onDuplicate} disabled={section.type === "hero"}><Copy className="mr-1.5 size-3.5" />{t("builderV4.inspector.duplicate")}</Button><Button type="button" size="sm" variant="outline" className="text-destructive" onClick={onDelete} disabled={section.type === "hero" && page?.sections.length === 1}><Trash2 className="mr-1.5 size-3.5" />{t("builderV4.inspector.deleteThisSection")}</Button></div>
    </div>
  </div>;
}

const variantOptions: Record<SectionType, string[]> = { hero: ["floral", "dark", "split", "editorial", "ceremonial"], couple: ["alternating", "two-columns", "editorial"], countdown: ["classic", "banner", "inline"], loveStory: ["timeline", "editorial", "photo-journal"], events: ["cards", "minimal"], weddingParty: ["classic", "editorial"], gallery: ["grid", "masonry", "featured", "flipbook"], rsvp: ["default"], wishes: ["default", "fountain"], gift: ["default", "minimal"] };
const variantNames: Record<string, string> = { floral: "Hoa nhẹ nhàng", dark: "Nền trầm", split: "Chia đôi", editorial: "Biên tập", ceremonial: "Trang trọng", alternating: "Xen kẽ", "two-columns": "Hai cột", classic: "Cổ điển", banner: "Dải ngang", inline: "Ngang gọn", timeline: "Dòng thời gian", "photo-journal": "Album hành trình", cards: "Thẻ sự kiện", minimal: "Tối giản", grid: "Lưới", masonry: "So le", featured: "Ảnh nổi bật", flipbook: "Sách lật", fountain: "Bong bóng bay lên", default: "Danh sách gọn" };

function WeddingEventPicker({ weddingId, setup, selectedIds, onChange, presencePrefix }: { weddingId: string; setup: WeddingSetup; selectedIds: string[]; onChange: (ids: string[]) => void; presencePrefix?: string }) {
  const { t, i18n } = useTranslation("weddingEditor");
  const { api } = useRuntime(); const cache = useQueryClient(); const checkboxPrefix = useId();
  const events = useQuery({ queryKey: ["wedding-events", weddingId], queryFn: () => listWeddingEvents(api, weddingId), staleTime: 30_000 });
  const [editingId, setEditingId] = useState<string | null>(null); const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [startsAt, setStartsAt] = useState("");
  const [venueName, setVenueName] = useState(""); const [address, setAddress] = useState(""); const [mapUrl, setMapUrl] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const main: WeddingEvent = { id: "main", title: t("builderV4.events.main", "Main wedding event"), startsAt: setup.eventDateTime, timeZoneId: setup.timeZoneId, venueName: setup.venueName, address: setup.venueAddress, sortOrder: 0 };
  const rows = [main, ...(events.data ?? [])];
  const resetForm = () => { setEditingId(null); setTitle(""); setDescription(""); setStartsAt(""); setVenueName(""); setAddress(""); setMapUrl(""); setFormOpen(false); };
  const beginEdit = (item: WeddingEvent) => { setEditingId(item.id); setTitle(item.title); setDescription(item.description ?? ""); setStartsAt(item.startsAt ?? ""); setVenueName(item.venueName ?? ""); setAddress(item.address ?? ""); setMapUrl(item.mapUrl ?? ""); setFormOpen(true); setMessage(""); };
  const toggle = (eventId: string, checked: boolean) => onChange(checked ? [...new Set([...selectedIds, eventId])] : selectedIds.filter(item => item !== eventId));
  async function saveEvent() {
    if (busy) return;
    setMessage(""); setBusy(true);
    const input: WeddingEventInput = { title, description: description || null, startsAt: startsAt || null, endsAt: null,
      timeZoneId: setup.timeZoneId || "Asia/Ho_Chi_Minh", venueName: venueName || null, address: address || null,
      mapUrl: mapUrl || null, sortOrder: (events.data?.length ?? 0) + 1 };
    try {
      const saved = editingId ? await updateWeddingEvent(api, weddingId, editingId, input) : await createWeddingEvent(api, weddingId, input);
      await cache.invalidateQueries({ queryKey: ["wedding-events", weddingId] });
      if (!editingId) onChange([...new Set([...selectedIds, saved.id])]);
      resetForm();
    } catch (error) { setMessage(errText(error, t)); }
    finally { setBusy(false); }
  }
  async function removeEvent(item: WeddingEvent) {
    if (item.id === "main" || !window.confirm(t("builderV4.inspector.deleteEventConfirm", "Delete event “{{title}}”?", { title: item.title }))) return;
    setMessage(""); setBusy(true);
    try { await deleteWeddingEvent(api, weddingId, item.id); onChange(selectedIds.filter(id => id !== item.id)); await cache.invalidateQueries({ queryKey: ["wedding-events", weddingId] }); }
    catch (error) { setMessage(errText(error, t)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3 rounded-xl border border-border p-3">
    <div><p className="text-sm font-medium">{t("builderV4.inspector.chooseEvents", "Choose events to display")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("builderV4.inspector.eventPickerHint", "The main date and venue sync from Wedding Setup. You can add a family ceremony, reception, or gathering.")}</p></div>
    {events.isPending && <p className="text-xs text-muted-foreground">{t("builderV4.inspector.loadingEvents", "Loading events…")}</p>}
    {events.isError && <div role="alert" className="rounded-lg bg-destructive/5 p-3 text-xs text-destructive">{t("builderV4.inspector.loadEventsFailed", "Could not load events.")} <button type="button" className="underline" onClick={() => void events.refetch()}>{t("builderV4.inspector.retry", "Retry")}</button></div>}
    <div className="space-y-2">{rows.map((item, index) => { const checkboxId = `${checkboxPrefix}-event-${index}`; return <div key={item.id} className="flex items-start gap-3 rounded-lg bg-muted/35 p-3">
      <input id={checkboxId} type="checkbox" className="mt-1 accent-primary" checked={selectedIds.includes(item.id)} onChange={event => toggle(item.id, event.target.checked)} />
      <div className="min-w-0 flex-1"><label htmlFor={checkboxId} className="block cursor-pointer text-sm font-medium">{item.title}{item.id === "main" ? " · Wedding Setup" : ""}</label><span className="mt-1 block text-xs leading-5 text-muted-foreground">{[item.startsAt ? new Date(item.startsAt).toLocaleString(i18n.language.startsWith("en") ? "en-US" : "vi-VN") : "", item.venueName, item.address].filter(Boolean).join(" · ") || t("builderV4.inspector.noEventDetails", "No date or venue yet")}</span></div>
      {item.id !== "main" && <span className="flex shrink-0 gap-2"><button type="button" className="text-xs text-primary underline" onClick={() => beginEdit(item)}>{t("builderV4.inspector.edit", "Edit")}</button><button type="button" className="text-xs text-destructive underline" onClick={() => void removeEvent(item)}>{t("builderV4.inspector.delete", "Delete")}</button></span>}
    </div>; })}</div>
    {!formOpen ? <Button type="button" size="sm" variant="outline" onClick={() => { resetForm(); setFormOpen(true); }}><Plus className="mr-1.5 size-3.5" />{t("builderV4.inspector.addEvent", "Add event")}</Button> : <fieldset className="space-y-3 border-t border-border pt-3"><legend className="px-1 text-xs font-semibold">{editingId ? t("builderV4.inspector.editEvent", "Edit event") : t("builderV4.inspector.newEvent", "New event")}</legend><Field label={t("builderV4.inspector.eventTitle", "Event name")} presencePath={builderFieldPath(presencePrefix ?? "event", editingId ?? "new", "title")} value={title} onChange={setTitle} placeholder={t("builderV4.placeholders.eventExamples", "Family ceremony, reception…")} /><Field label={t("builderV4.inspector.eventDescription", "Description")} presencePath={builderFieldPath(presencePrefix ?? "event", editingId ?? "new", "description")} value={description} multiline onChange={setDescription} /><DateTimeField label={t("builderV4.inspector.eventDate", "Date and time")} presencePath={builderFieldPath(presencePrefix ?? "event", editingId ?? "new", "startsAt")} value={startsAt} timeZone={setup.timeZoneId} onChange={value => setStartsAt(value ?? "")} /><Field label={t("builderV4.inspector.venue", "Venue")} presencePath={builderFieldPath(presencePrefix ?? "event", editingId ?? "new", "venueName")} value={venueName} onChange={setVenueName} /><Field label={t("builderV4.inspector.address", "Address")} presencePath={builderFieldPath(presencePrefix ?? "event", editingId ?? "new", "address")} value={address} onChange={setAddress} /><Field label={t("builderV4.inspector.mapUrl", "HTTPS map link")} presencePath={builderFieldPath(presencePrefix ?? "event", editingId ?? "new", "mapUrl")} value={mapUrl} onChange={setMapUrl} /><div className="flex gap-2"><Button type="button" size="sm" disabled={busy || !title.trim()} onClick={() => void saveEvent()}>{busy ? t("builderV4.save.saving", "Saving…") : t("builderV4.inspector.saveEvent", "Save event")}</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={resetForm}>{t("builderV4.actions.cancel")}</Button></div></fieldset>}
    {message && <p role="alert" className="text-xs text-destructive">{message}</p>}
  </div>;
}
function setupBindingValue(target: string, setup: WeddingSetup) {
  switch (target) {
    case "heroImageUrl": return setup.coverImageUrl || "";
    case "mainEvent.startsAt":
    case "countdown.targetDate": return setup.eventDateTime || "";
    case "mainEvent.timeZoneId": return setup.timeZoneId || "Asia/Ho_Chi_Minh";
    case "mainEvent.venueName": return setup.venueName || "";
    case "mainEvent.address": return setup.venueAddress || "";
    default: return "";
  }
}

function Field({ label, value, placeholder, multiline, maxLength, error, presencePath, type = "text", onChange }: { label: string; value: string; placeholder?: string; multiline?: boolean; maxLength?: number; error?: string; presencePath?: string; type?: "text" | "url"; onChange: (value: string) => void }) {
  const { t } = useTranslation("weddingEditor");
  const errorId = useId();
  const className = `w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${error ? "border-destructive focus-visible:ring-destructive" : "border-input"}`;
  const normalizedPath = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const localizedLabel = builderFieldTranslationKeys[label] ? t(`builderV4.fields.${builderFieldTranslationKeys[label]}`, label) : label;
  const localizedPlaceholder = placeholder && builderPlaceholderTranslationKeys[placeholder] ? t(`builderV4.placeholders.${builderPlaceholderTranslationKeys[placeholder]}`, placeholder) : placeholder;
  return <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{localizedLabel}{multiline ? <textarea data-builder-field-path={presencePath ?? `field.${normalizedPath}`} maxLength={maxLength} className={`${className} min-h-20 resize-y`} value={value} placeholder={localizedPlaceholder} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => onChange(event.target.value)} /> : <input data-builder-field-path={presencePath ?? `field.${normalizedPath}`} type={type} maxLength={maxLength} className={`${className} h-10`} value={value} placeholder={localizedPlaceholder} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => onChange(event.target.value)} />}{error && <span id={errorId} role="alert" className="font-normal text-destructive">{error}</span>}</label>;
}

function DateTimeField({ label, value, timeZone, error, presencePath, onChange }: { label: string; value: string; timeZone?: string; error?: string; presencePath?: string; onChange: (value: string | undefined) => void }) {
  const { t } = useTranslation("weddingEditor");
  const [draft, setDraft] = useState(() => ({ sourceValue: value, sourceTimeZone: timeZone, localValue: isoToLocalDateTime(value, timeZone), conversionError: "" }));
  const errorId = useId();
  if (draft.sourceValue !== value || draft.sourceTimeZone !== timeZone) {
    setDraft({ sourceValue: value, sourceTimeZone: timeZone, localValue: isoToLocalDateTime(value, timeZone), conversionError: "" });
  }
  const displayedError = error ?? draft.conversionError;
  return <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{label}
    <input data-builder-field-path={presencePath ?? `field.${label}`} type="datetime-local" value={draft.localValue} aria-invalid={Boolean(displayedError)} aria-describedby={displayedError ? errorId : undefined} className={`h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${displayedError ? "border-destructive focus-visible:ring-destructive" : "border-input"}`} onChange={event => {
      const next = event.target.value;
      if (!next) { setDraft(current => ({ ...current, localValue: "", conversionError: "" })); onChange(undefined); return; }
      try { onChange(localDateTimeToIso(next, timeZone)); setDraft(current => ({ ...current, localValue: next, conversionError: "" })); }
      catch { setDraft(current => ({ ...current, localValue: next, conversionError: t("validation.dateTimeNotInTimeZone") })); }
    }} />
    <span className="font-normal">{t("builderV4.fields.timeZone", "Time zone")}: {timeZone || "Asia/Ho_Chi_Minh"}</span>
    {displayedError && <span id={errorId} role="alert" className="font-normal text-destructive">{displayedError}</span>}
  </label>;
}

function ImageField({ label, value, placeholder, error, presencePath, onChange, onUpload, onChooseMedia, display = "thumbnail", previewPosition, readOnly = false }: { label: string; value: string; placeholder?: string; error?: string; presencePath?: string; onChange: (value: string) => void; onUpload: (file: File) => Promise<string | null>; onChooseMedia: (onChoose: (url: string) => void) => void; display?: "thumbnail" | "cover"; previewPosition?: string; readOnly?: boolean }) {
  const { t } = useTranslation("weddingEditor");
  const localizedLabel = builderFieldTranslationKeys[label] ? t(`builderV4.fields.${builderFieldTranslationKeys[label]}`, label) : label;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [previewFailedFor, setPreviewFailedFor] = useState("");
  const inputId = useId();
  const previewFailed = previewFailedFor === value;
  const fileName = value ? (() => {
    try { return decodeURIComponent(new URL(value, "https://inviteme.invalid").pathname.split("/").pop() || t("builderV4.inspector.imageSelected", "Selected image")); }
    catch { return value.split("/").pop()?.split("?")[0] || t("builderV4.inspector.imageSelected", "Selected image"); }
  })() : "";
  async function selectImage(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setUploadError(t("builderV4.errors.invalidImage"));
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const url = await onUpload(file);
      if (url) onChange(url);
      else setUploadError(t("builderV4.inspector.imageUploadFailed", "Image upload failed. Please try again."));
    } catch (cause) {
      setUploadError(errText(cause, t));
    } finally {
      setUploading(false);
    }
  }
  return <div className="w-full min-w-0 max-w-full space-y-2">
    <span className="block text-sm font-medium text-foreground">{localizedLabel}</span>
    {value.trim() ? <div className={`w-full min-w-0 overflow-hidden rounded-xl border border-border bg-muted/30 ${display === "cover" ? "max-w-[280px]" : "grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 p-3"}`}>
      <div className={`relative grid place-items-center overflow-hidden bg-primary/10 text-primary ${display === "cover" ? "aspect-video w-full" : "size-[4.5rem] shrink-0 rounded-lg"}`}>
        {!previewFailed
          ? <Image src={mediaUrl(value) ?? value} alt={label} fill sizes={display === "cover" ? "(max-width: 768px) 100vw, 420px" : "72px"} unoptimized className="object-cover" style={previewPosition ? { objectPosition: previewPosition } : undefined} onError={() => setPreviewFailedFor(value)} />
          : <ImageIcon className="size-6" aria-hidden="true" />}
      </div>
      <div className={`min-w-0 ${display === "cover" ? "p-3" : ""}`}>
        <p className="text-sm font-medium text-foreground">{readOnly ? t("builderV4.inspector.imageSynced", "Synced from Wedding Setup") : t("builderV4.inspector.imageAdded", "Image added")}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground" title={fileName}>{fileName}</p>
        {previewFailed && <p role="status" className="mt-1 text-xs text-amber-700">{t("builderV4.inspector.imagePreviewFailed", "Could not load the image preview. You can choose another image.")}</p>}
      </div>
    </div> : <div className={`w-full min-w-0 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground ${display === "cover" ? "grid aspect-video max-w-[280px] place-items-center text-center" : "flex min-h-20 items-center gap-3"}`}>
      <span className={`grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary ${display === "cover" ? "mb-2" : ""}`}><ImageIcon className="size-5" aria-hidden="true" /></span>
      <span>{readOnly ? t("builderV4.inspector.imagePreviewEmpty", "No image to preview yet.") : t("builderV4.inspector.imageEmpty", "No image selected. Upload one or choose from your wedding library.")}</span>
    </div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {!readOnly && <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={inputId} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium transition hover:bg-muted focus-within:ring-2 focus-within:ring-ring ${uploading ? "pointer-events-none opacity-60" : ""}`}><Upload className="size-3.5" />{uploading ? t("builderV4.inspector.imageUploading", "Uploading image…") : value ? t("builderV4.inspector.imageReplacing", "Replace image") : t("builderV4.inspector.uploadImage", "Upload image")}</label>
      <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void selectImage(file); }} />
      <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => onChooseMedia(onChange)}><ImageIcon className="mr-1.5 size-3.5" />{t("builderV4.inspector.chooseImageLibrary", "Choose from library")}</Button>
      {value && <Button type="button" size="sm" variant="ghost" className="text-destructive hover:bg-destructive/5 hover:text-destructive" disabled={uploading} onClick={() => { onChange(""); setUploadError(""); }}><Trash2 className="mr-1.5 size-3.5" />{t("builderV4.inspector.imageRemove", "Remove from this section")}</Button>}
      {uploading && <span role="status" aria-live="polite" className="text-xs text-muted-foreground">{t("builderV4.inspector.imageUploading", "Uploading image…")}</span>}
    </div>}
    {!readOnly && <p className="text-xs leading-5 text-muted-foreground">{t("builderV4.inspector.imageKept", "Removing an image here only removes it from this section. The file stays in your media library.")}</p>}
    {!readOnly && <details className="group rounded-lg border border-border/70 px-3 py-2">
      <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground marker:hidden">{t("builderV4.inspector.imageManualUrl", "Enter image URL manually")} <ChevronDown className="ml-1 inline size-3.5 transition group-open:rotate-180" /></summary>
      <div className="mt-3"><Field label={t("builderV4.fields.imageUrl")} presencePath={presencePath} value={value} placeholder={placeholder ?? t("builderV4.placeholders.pasteImageUrl", "Paste an image URL")} onChange={onChange} /></div>
    </details>}
    {uploadError && <p role="alert" className="text-xs text-destructive">{uploadError}</p>}
  </div>;
}
