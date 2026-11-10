"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useId, useSyncExternalStore, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp, Copy, Eye, EyeOff, Globe, GripVertical, History, Image as ImageIcon, LoaderCircle, Menu, Monitor, MoreHorizontal, Plus, Redo2, RefreshCw, Save, Search, Smartphone, Sparkles, Tablet, Trash2, Undo2, Upload, UserRound, UsersRound, X } from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { ApiError } from "@/core/api/api-error";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
// eslint-disable-next-line architecture/boundaries -- Template access uses the shared wedding plan entitlement contract.
import { FeatureLimitNotice, useWeddingPlan } from "@/features/plans";
import { applyStoryBuilderV4Template, createStoryBuilderV4Document, createV4Section, isStoryBuilderV4Document, summarizeStoryBuilderV4TemplateChange } from "../schemas/story-builder-v4.document";
import { describeV4Issue, describeV4ValidationIssues, moveV4Page } from "../schemas/story-builder-v4.helpers";
import { storyBuilderV4DocumentSchema, storyTemplateConfigSchema, type StoryBuilderV4Document, type StoryBuilderV4Section, type StorySectionType, type StoryTemplateSummaryV4 } from "../schemas/story-builder-v4.schema";
import type { Website } from "../api/website.api";
import { createWeddingEvent, deleteWeddingEvent, deleteWeddingMedia, getWebsite, getWebsiteVersion, listStoryTemplates, listWeddingEvents, listWeddingMedia, listWebsiteVersions, mediaUrl, publishWebsite, restoreWebsiteVersion, saveWebsite, updateWeddingEvent, unpublishWebsite, uploadWeddingMedia, type WebsiteVersion, type WeddingEvent, type WeddingEventInput } from "../api/website.api";
import { isoToLocalDateTime, localDateTimeToIso, type WeddingSetup } from "../schemas/wedding.schema";
import { StoryBuilderV4Renderer } from "./story-builder-v4-renderer";
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
function validateBuilderDocument(document: StoryBuilderV4Document, template?: StoryTemplateSummaryV4): BuilderIssue[] {
  const parsed = storyBuilderV4DocumentSchema.safeParse(document);
  if (!parsed.success) return parsed.error.issues;
  if (!template) return [];
  const issues: BuilderIssue[] = [];
  if (document.appearance.paletteId && !template.config.palettes.some(palette => palette.id === document.appearance.paletteId))
    issues.push({ path: ["appearance", "paletteId"], message: "Selected color palette is not part of this template." });
  if (document.appearance.fontHeading && !template.config.allowedFonts.includes(document.appearance.fontHeading))
    issues.push({ path: ["appearance", "fontHeading"], message: "Selected heading font is not supported by this template." });
  if (document.appearance.fontBody && !template.config.allowedFonts.includes(document.appearance.fontBody))
    issues.push({ path: ["appearance", "fontBody"], message: "Selected body font is not supported by this template." });
  return issues;
}
const sectionNames: Record<SectionType, string> = { hero: "Ảnh bìa", couple: "Cặp đôi", countdown: "Đếm ngược", loveStory: "Chuyện tình", events: "Sự kiện", weddingParty: "Phù dâu & phù rể", gallery: "Album ảnh", rsvp: "Xác nhận tham dự", wishes: "Lời chúc", gift: "Mừng cưới" };
const presenceFieldNames: Record<string, string> = {
  title: "Tiêu đề", subtitle: "Lời dẫn", intro: "Giới thiệu", description: "Mô tả", image: "Ảnh",
  eyebrow: "Dòng nhấn", ctaLabel: "Nhãn nút", submitLabel: "Nhãn nút gửi", displayName: "Tên hiển thị",
  bio: "Lời giới thiệu", fatherName: "Tên cha", motherName: "Tên mẹ", targetDate: "Ngày giờ mục tiêu",
  date: "Ngày hoặc dấu mốc", startsAt: "Ngày giờ", venueName: "Địa điểm", address: "Địa chỉ",
  mapUrl: "Liên kết bản đồ", imageUrl: "Ảnh", photoUrl: "Ảnh chân dung", alt: "Mô tả ảnh",
  name: "Họ tên", role: "Vai trò", navigationLabel: "Tiêu đề điều hướng", slug: "Đường dẫn",
  paletteId: "Bảng màu", fontHeading: "Phông tiêu đề", fontBody: "Phông nội dung", tools: "Tiện ích khách mời",
  decoration: "Hiệu ứng trang trí", intensity: "Mức độ hiệu ứng", animation: "Hiệu ứng chuyển động", background: "Nền phần",
};
const presenceFieldLabel = (fieldPath: string | null) => {
  const parts = fieldPath?.split(".") ?? [];
  const key = parts.at(-1);
  if (!key) return null;
  const label = presenceFieldNames[key] ?? "Nội dung";
  if (parts.includes("couple")) return `${label} · ${parts.includes("bride") ? "Cô dâu" : "Chú rể"}`;
  if (parts.includes("loveStory") && parts.includes("items")) return `${label} · Dấu mốc`;
  if (parts.includes("gallery") && parts.includes("images")) return `${label} · Ảnh album`;
  if (parts.includes("weddingParty") && (parts.includes("groom") || parts.includes("bride"))) return `${label} · ${parts.includes("bride") ? "Phù dâu" : "Phù rể"}`;
  if (parts.includes("events")) return `${label} · Sự kiện`;
  return label;
};
const builderFieldPath = (...parts: (string | number)[]) => parts
  .map(part => String(part).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""))
  .filter(Boolean).join(".").slice(0, 160);
const canonicalBuilderFieldPath = (path: string) => path.split(".").filter(part => part && part !== "content")
  .map((part, index, parts) => part === "event" && parts[index - 1] === "events" ? "events" : part).join(".");
const sectionDescriptions: Record<SectionType, string> = { hero: "Mở đầu website với tên hai bạn, lời dẫn và ảnh bìa.", couple: "Giới thiệu cô dâu, chú rể và câu chuyện riêng.", countdown: "Đếm số ngày còn lại tới ngày vui.", loveStory: "Kể lại các dấu mốc đáng nhớ của hai bạn.", events: "Quản lý nhiều buổi lễ và chọn buổi hiển thị trên website.", weddingParty: "Giới thiệu những người đồng hành trong ngày cưới.", gallery: "Chia sẻ album ảnh cưới với khách mời.", rsvp: "Đưa khách tới luồng xác nhận tham dự an toàn.", wishes: "Hiển thị lời chúc khách gửi qua thiệp.", gift: "Hiển thị thông tin mừng cưới đã cấu hình." };
const templateCategoryLabels: Record<string, string> = { garden: "Vườn hoa", editorial: "Tạp chí", traditional: "Truyền thống", minimal: "Tối giản", outdoor: "Ngoài trời", royal: "Dạ tiệc", romantic: "Lãng mạn" };
const categoryLabel = (value?: string | null) => value ? templateCategoryLabels[value.toLowerCase()] ?? value : "Website cưới";
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
const conflictLocation = (path: string[], document: StoryBuilderV4Document) => {
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
    ? typeof itemName === "string" ? `“${itemName.slice(0, 54)}”` : `Mục ${itemIndex >= 0 ? itemIndex + 1 : "đã thay đổi"}`
    : undefined;
  const tail = sectionMarkerIndex >= 0 ? path.slice(sectionMarkerIndex + 2) : pageMarkerIndex >= 0 ? path.slice(pageMarkerIndex + 2) : path;
  const fieldKey = orderConflict ? "$order" : [...tail].reverse().find(part => part !== "content" && !part.startsWith("@"));
  const fieldLabel = fieldKey === "$order" ? "Thứ tự các mục" : fieldKey ? presenceFieldNames[fieldKey] ?? "Nội dung" : "Cấu trúc website";
  const sectionLabel = section ? sectionNames[section.type] : undefined;
  const location = [page?.title, sectionLabel, itemLabel, fieldLabel].filter(Boolean).join(" · ");
  return { pageId, sectionId, label: location || "Nội dung website" };
};
const conflictValuePreview = (exists: boolean, value: unknown, path: string[], document: StoryBuilderV4Document) => {
  if (!exists) return "Trường này đã bị xóa";
  if (value === null || value === undefined) return "Chưa có nội dung";
  if (path.at(-1) === "$order" && Array.isArray(value)) {
    const names = value.map(id => {
      if (typeof id !== "string") return null;
      for (const page of document.pages) {
        if (page.id === id) return page.title;
        const section = page.sections.find(candidate => candidate.id === id);
        if (section) return section.title || sectionNames[section.type];
        for (const candidate of page.sections) {
          const collections = Object.values(record(candidate.content)).filter(Array.isArray) as unknown[][];
          for (const collection of collections) {
            const match = collection.find(entry => record(entry).id === id);
            if (match) {
              const value = record(match);
              return [value.title, value.name, value.displayName, value.date].find(item => typeof item === "string" && item.trim()) as string | undefined ?? "Mục";
            }
          }
        }
      }
      return null;
    }).filter((name): name is string => Boolean(name));
    return names.length ? names.slice(0, 4).join(" → ") + (names.length > 4 ? ` · +${names.length - 4} mục` : "") : `Thứ tự của ${value.length} mục`;
  }
  if (typeof value === "string") {
    if (!value.trim()) return "Để trống";
    if (/^https?:\/\//i.test(value)) return "Đã thay đổi liên kết hoặc ảnh";
    return value.length > 180 ? `${value.slice(0, 177)}…` : value;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Đã bật" : "Đã tắt";
  if (Array.isArray(value)) return `Danh sách gồm ${value.length} mục`;
  if (typeof value === "object") {
    const item = record(value);
    const name = [item.title, item.name, item.displayName].find(candidate => typeof candidate === "string" && candidate.trim());
    const detailsCount = Object.keys(item).filter(key => key !== "id").length;
    return typeof name === "string" ? `“${name.slice(0, 80)}” · ${detailsCount} thông tin` : `Nội dung gồm ${detailsCount} trường`;
  }
  return "Nội dung đã được cập nhật";
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
const errText = (error: unknown) => {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      STORY_TEMPLATE_UNAVAILABLE: "Mẫu website này không còn khả dụng. Hãy chọn mẫu khác; nội dung hiện tại sẽ được giữ lại.",
      WEBSITE_OWNER_REQUIRED: "Chỉ chủ tiệc mới có quyền chỉnh sửa hoặc xuất bản website này.",
      WEBSITE_VERSION_INVALID: "Phiên bản bản nháp không hợp lệ. Hãy tải lại website mới nhất rồi thử lại.",
      WEBSITE_DRAFT_INVALID: "Máy chủ chưa chấp nhận bản nháp. Hãy xem các lỗi được đánh dấu; nếu không có lỗi nào, tải lại bản mới nhất rồi thử lại.",
      WEBSITE_DRAFT_REQUIRED: "Chưa có bản nháp hợp lệ để xuất bản. Hãy lưu bản nháp rồi thử lại.",
      WEBSITE_DOCUMENT_INVALID: "Một phần nội dung không khớp với cấu trúc mẫu. Hãy mở kiểm tra xuất bản để xem trang và trường cần sửa.",
      WEBSITE_UNAVAILABLE: "Website chưa được xuất bản hoặc hiện không khả dụng.",
      WEBSITE_NOT_PUBLISHED: "Website chưa được xuất bản nên chưa thể gỡ xuất bản.",
      WEBSITE_MEDIA_TEMPORARY: "Ảnh đang dùng là ảnh tạm. Hãy tải ảnh đó vào thư viện đám cưới trước khi lưu.",
      WEBSITE_MEDIA_NOT_OWNED: "Có ảnh không thuộc thư viện của đám cưới này. Hãy chọn ảnh từ thư viện cưới hoặc tải ảnh mới lên.",
      WEBSITE_MEDIA_MISSING: "Một ảnh trong website không còn tồn tại. Hãy chọn hoặc tải ảnh thay thế.",
      MEDIA_IN_USE: "Ảnh vẫn đang được dùng trong Wedding Setup, website hoặc thiệp mời. Hãy gỡ/thay ảnh ở đó và đợi lưu xong trước khi xóa khỏi thư viện.",
      MEDIA_NOT_FOUND: "Ảnh không còn trong thư viện. Hãy tải lại danh sách ảnh.",
      WEBSITE_VERSION_CONFLICT: "Website đã được cập nhật ở phiên khác. Hãy tải bản mới nhất trước khi tiếp tục.",
    };
    const mappedMessage = error.backendCode ? messages[error.backendCode] : undefined;
    if (mappedMessage) return mappedMessage;
    if (error.backendCode?.startsWith("WEBSITE_"))
      return `Máy chủ chưa thể hoàn tất thao tác website. Hãy kiểm tra nội dung rồi thử lại. Mã lỗi: ${error.backendCode}.`;
    if (error.status === 400) return "Máy chủ chưa chấp nhận dữ liệu website. Hãy mở kiểm tra xuất bản để xem các vị trí cần sửa.";
    if (error.status === 409) return "Website đã thay đổi ở nơi khác. Hãy tải bản mới nhất rồi thử lại.";
  }
  return error instanceof Error ? error.message : "Không thể hoàn tất thao tác.";
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

  if (templates.isPending) return <LoadingState label="Đang tải thư viện mẫu website…" />;
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
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-8">
    <Link href="../" className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Quay lại không gian cưới</Link>
    <section className="border-y border-border py-8 sm:py-10">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Website phiên bản cũ</p>
      <h1 className="mt-3 font-display text-3xl text-foreground sm:text-4xl">Chuyển sang trình dựng website mới</h1>
      <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">Website này được tạo bằng trình dựng trước đây. Bạn có thể xem lại website hiện tại và tạo một bản nháp V4 mới. Website đã xuất bản tiếp tục hoạt động cho đến khi bạn chủ động xuất bản bản mới.</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {published && <Button variant="outline" asChild><Link href={`/wedding/${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer"><Eye className="mr-2 size-4" />Xem website hiện tại</Link></Button>}
        <Button onClick={onStart}>Chọn mẫu để chuyển đổi<ChevronRight className="ml-2 size-4" /></Button>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Trạng thái hiện tại: {status === "PUBLISHED" ? "Đã xuất bản" : status === "UNPUBLISHED" ? "Đã gỡ xuất bản" : "Bản nháp"}. Dữ liệu cũ không bị xóa hoặc tự chuyển đổi.</p>
    </section>
    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-foreground"><CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" /><p>Khi chọn mẫu, bạn sẽ xem trước nội dung có thể mang sang và xác nhận trước khi tạo bản nháp V4. Bản website công khai cũ chỉ đổi khi bạn xuất bản bản V4.</p></div>
  </main>;
}

function V4TemplateGallery({ weddingId, setup, templates, siteVersion, currentDocument, legacyDocument, hasActiveDraft, recoveryDraftNeedsSave, onBack, onCreated, selectedTemplate, setSelectedTemplate }: {
  weddingId: string; setup: WeddingSetup; templates: StoryTemplateSummaryV4[]; siteVersion: number; currentDocument?: StoryBuilderV4Document; legacyDocument?: unknown;
  hasActiveDraft: boolean; recoveryDraftNeedsSave: boolean; onBack: () => void; onCreated: (site: Website) => void;
  selectedTemplate: StoryTemplateSummaryV4 | null; setSelectedTemplate: (value: StoryTemplateSummaryV4 | null) => void;
}) {
  const { api } = useRuntime(); const queryClient = useQueryClient();
  const plan = useWeddingPlan(weddingId, true);
  const [search, setSearch] = useState(""); const [category, setCategory] = useState("all");
  const [tier, setTier] = useState("all"); const [viewport, setViewport] = useState<Viewport>("desktop");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [compareKeys, setCompareKeys] = useState<string[]>([]); const [compareOpen, setCompareOpen] = useState(false);
  const compareTemplates = compareKeys.map(key => templates.find(template => template.key === key)).filter((template): template is StoryTemplateSummaryV4 => Boolean(template));
  const filtered = useMemo(() => templates.filter(template => {
    const matchesSearch = `${template.name} ${template.key} ${template.config.category ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    const matchesCategory = category === "all" || (template.config.category ?? "Chưa phân loại") === category;
    const matchesTier = tier === "all" || template.config.accessTier === tier;
    return matchesSearch && matchesCategory && matchesTier;
  }), [templates, search, category, tier]);
  const categories = [...new Set(templates.map(template => template.config.category || "Chưa phân loại"))];
  const premiumLocked = (template: StoryTemplateSummaryV4) => template.config.accessTier === "PREMIUM" && plan.data && !plan.data.legacy && !plan.data.limits.premiumTemplates;
  const premiumUnknown = (template: StoryTemplateSummaryV4) => template.config.accessTier === "PREMIUM" && !plan.data;

  async function createDraft(template: StoryTemplateSummaryV4, expectedVersion = siteVersion, preparedDocument?: StoryBuilderV4Document) {
    if (busy || premiumLocked(template) || premiumUnknown(template)) return;
    if (legacyDocument && !window.confirm("Tạo bản nháp V4 từ mẫu này? Website cũ vẫn được giữ nguyên và tiếp tục hoạt động cho đến khi bạn xuất bản website mới.")) return;
    setBusy(true); setMessage("");
    try {
      const initial = preparedDocument ?? (currentDocument
        ? applyStoryBuilderV4Template(template, currentDocument, setup)
        : createStoryBuilderV4Document(template, setup, legacyDocument));
      const saved = await saveWebsite(api, weddingId, expectedVersion, initial);
      queryClient.setQueryData(["website", weddingId], saved);
      onCreated(saved);
    } catch (error) { setMessage(errText(error)); void queryClient.invalidateQueries({ queryKey: ["website", weddingId] }); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-[1480px] space-y-7 px-4 py-8 sm:px-7">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">InviteMe · Website</p><h1 className="mt-2 font-display text-3xl text-foreground">Chọn mẫu website cưới</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{hasActiveDraft ? "Xem cách các mẫu khác sẽ áp dụng lên website hiện tại. Bản nháp vẫn được giữ nguyên cho đến khi bạn xác nhận đổi mẫu." : "Bắt đầu với một thiết kế, sau đó tùy chỉnh từng trang và từng phần nội dung."}</p></div>
      {hasActiveDraft && <Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 size-4" />Tiếp tục chỉnh sửa mẫu hiện tại</Button>}
    </div>
    <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px_190px]">
      <input className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Tìm theo tên hoặc phong cách" value={search} onChange={event => setSearch(event.target.value)} aria-label="Tìm mẫu website" />
      <select className="h-11 rounded-xl border border-input bg-background px-3 text-sm" value={category} onChange={event => setCategory(event.target.value)} aria-label="Lọc danh mục"><option value="all">Tất cả phong cách</option>{categories.map(value => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select>
      <select className="h-11 rounded-xl border border-input bg-background px-3 text-sm" value={tier} onChange={event => setTier(event.target.value)} aria-label="Lọc theo gói"><option value="all">Tất cả gói</option><option value="FREE">Miễn phí</option><option value="PREMIUM">Premium</option><option value="UNCLASSIFIED">Chưa phân loại</option></select>
    </div>
    {plan.isError && <FeatureLimitNotice title="Chưa xác minh được quyền lợi gói" description="Mẫu Premium sẽ được mở khi kiểm tra quyền lợi thành công. Các mẫu còn lại vẫn có thể xem." status="unavailable" variant="compact" onRetry={() => void plan.refetch()} retryLabel="Thử lại" />}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
      <p className="text-sm text-muted-foreground">Chọn hai mẫu để xem trước bố cục, màu sắc và nội dung cạnh nhau. <span className="font-medium text-foreground">Đã chọn {compareKeys.length}/2</span></p>
      <div className="flex items-center gap-2">
        {compareKeys.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setCompareKeys([])}>Bỏ chọn</Button>}
        <Button type="button" size="sm" disabled={compareTemplates.length !== 2} onClick={() => setCompareOpen(true)}>So sánh hai mẫu</Button>
      </div>
    </div>
    {message && <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{message}</p>}
    {filtered.length === 0 ? <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">Không tìm thấy mẫu phù hợp.</p> : <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map(template => {
        const preview = currentDocument
          ? applyStoryBuilderV4Template(template, currentDocument, setup)
          : createStoryBuilderV4Document(template, setup, legacyDocument);
        const galleryPreview = templateGalleryPreview(preview);
        const locked = Boolean(premiumLocked(template) || premiumUnknown(template));
        const isCurrent = currentDocument?.templateKey === template.key && currentDocument.templateVersion === template.version;
        return <article key={template.key} className="min-w-0">
          <button type="button" onClick={() => setSelectedTemplate(template)} className="group relative block w-full overflow-hidden rounded-[18px] border border-border bg-[#f5f1f0] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Xem trước ${template.name}`}>
            <div className="story-gallery-preview" aria-hidden="true" style={{ width: viewport === "mobile" ? "72%" : viewport === "tablet" ? "88%" : "100%", marginInline: "auto" }}><div className="story-gallery-preview__canvas pointer-events-none"><StoryBuilderV4Renderer document={galleryPreview} /></div></div>
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/65 to-transparent px-4 pb-4 pt-12 text-sm text-white"><span>{categoryLabel(template.config.category)}</span>{isCurrent ? <span className="rounded-full bg-white/20 px-2 py-1 text-xs">Đang dùng</span> : <Eye className="size-4 opacity-0 transition group-hover:opacity-100" />}</div>
          </button>
          <div className="mt-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="font-display text-xl text-foreground">{template.name}</h2><p className="mt-1 text-xs text-muted-foreground">{template.config.accessTier === "PREMIUM" ? "Premium" : template.config.accessTier === "FREE" ? "Miễn phí" : "Chưa phân loại"} · {template.config.sections.length} phần gợi ý</p><div className="mt-3 flex items-center gap-2"><span className="flex gap-1.5" aria-label="Bảng màu của mẫu">{[template.config.theme.colors.primary, template.config.theme.colors.background, template.config.theme.colors.accent].map((color, index) => <span key={`${color}-${index}`} className="size-4 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}</span><span className="truncate text-[11px] text-muted-foreground">{template.config.theme.fontHeading} · {categoryLabel(template.config.category)}</span></div></div>
            </div>
            <p className="truncate text-xs text-muted-foreground">{template.config.sections.slice(0, 4).map(section => sectionNames[section.type as SectionType] ?? section.type).join(" · ")}</p>
            <div className="flex flex-wrap gap-2">
              {premiumLocked(template) ? <Button asChild size="sm"><Link href={`/weddings/${encodeURIComponent(weddingId)}/plan`}>Xem các gói</Link></Button> : <Button size="sm" disabled={busy || locked || isCurrent} onClick={() => { setMessage(""); setSelectedTemplate(template); }}>{locked ? "Đang kiểm tra gói" : isCurrent ? "Mẫu đang dùng" : currentDocument ? "Xem & đổi mẫu" : legacyDocument ? "Xem & chuyển" : "Xem mẫu"}</Button>}
              <Button type="button" size="sm" variant="outline" aria-pressed={compareKeys.includes(template.key)} disabled={!compareKeys.includes(template.key) && compareKeys.length >= 2} onClick={() => setCompareKeys(current => current.includes(template.key) ? current.filter(key => key !== template.key) : [...current, template.key])}><Check className={`mr-1.5 size-3.5 ${compareKeys.includes(template.key) ? "opacity-100" : "opacity-35"}`} />{compareKeys.includes(template.key) ? "Đã chọn" : "So sánh"}</Button>
            </div>
          </div>
          {template.config.accessTier === "UNCLASSIFIED" && <p className="mt-2 text-xs text-muted-foreground">Mẫu chưa được Admin phân loại gói.</p>}
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
  return <Modal open={open} onClose={onClose} title="So sánh mẫu website" description="Xem cùng nội dung cưới trong hai thiết kế trước khi chọn mẫu." size="wide">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">Preview dùng chung tên, ngày cưới và ảnh hiện có để bạn dễ so sánh cách mỗi mẫu trình bày.</p>
      <div className="flex items-center gap-1" aria-label="Kích thước xem trước">
        <ViewportButton label="Desktop" active={viewport === "desktop"} onClick={() => setViewport("desktop")}><Monitor className="size-4" /></ViewportButton>
        <ViewportButton label="Tablet" active={viewport === "tablet"} onClick={() => setViewport("tablet")}><Tablet className="size-4" /></ViewportButton>
        <ViewportButton label="Điện thoại" active={viewport === "mobile"} onClick={() => setViewport("mobile")}><Smartphone className="size-4" /></ViewportButton>
      </div>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      {templates.map(template => {
        const document = currentDocument ? applyStoryBuilderV4Template(template, currentDocument, setup) : createStoryBuilderV4Document(template, setup, oldDocument);
        const preview = templateGalleryPreview(document);
        const width = viewport === "mobile" ? "72%" : viewport === "tablet" ? "88%" : "100%";
        return <article key={template.key} className="min-w-0 overflow-hidden rounded-xl border border-border bg-background">
          <header className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0"><p className="text-xs uppercase tracking-wide text-primary">{categoryLabel(template.config.category)}</p><h3 className="mt-1 truncate font-display text-xl">{template.name}</h3><p className="mt-1 text-xs text-muted-foreground">{template.config.theme.fontHeading} · {template.config.sections.length} phần gợi ý</p></div>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenTemplate(template)}>Xem chi tiết</Button>
          </header>
          <div className="story-gallery-preview" style={{ width, marginInline: "auto" }}><div className="story-gallery-preview__canvas pointer-events-none"><StoryBuilderV4Renderer document={preview} /></div></div>
          <div className="border-t border-border p-4"><div className="flex items-center gap-2"><span className="flex gap-1.5" aria-label="Bảng màu của mẫu">{[template.config.theme.colors.primary, template.config.theme.colors.background, template.config.theme.colors.accent].map((color, index) => <span key={`${color}-${index}`} className="size-4 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}</span><span className="text-xs text-muted-foreground">{template.config.theme.fontBody}</span></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{template.config.sections.slice(0, 5).map(section => sectionNames[section.type as SectionType] ?? section.type).join(" → ")}</p></div>
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
  const currentTemplateName = typeof record(previewSource?.templateSnapshot).name === "string" ? String(record(previewSource?.templateSnapshot).name) : "mẫu hiện tại";
  const draftIsUnavailable = Boolean(currentDocument && site && !remoteCurrentDocument && !recoveryDraftNeedsSave);
  const canApplyTemplate = Boolean(site && !staleVersion && !draftIsUnavailable);
  return <div role="dialog" aria-modal="true" aria-label={`Xem trước ${template.name}`} className="fixed inset-0 z-[120] flex flex-col bg-background">
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border px-3 sm:px-5">
      <div className="flex items-center gap-2">{confirmingSwitch ? <Button variant="ghost" size="sm" onClick={() => setConfirmingSwitch(false)}><ArrowLeft className="mr-1 size-4" />Quay lại xem trước</Button> : <Button variant="ghost" size="sm" onClick={onClose}><X className="mr-1 size-4" />Đóng</Button>}<span className="font-medium">{confirmingSwitch ? "Xác nhận đổi mẫu" : template.name}</span></div>
      {!confirmingSwitch && <div className="flex flex-wrap items-center gap-2">
        {latestCurrentDocument && <div role="group" aria-label="So sánh mẫu website" className="flex rounded-lg bg-muted p-1 text-xs">
          <button type="button" aria-pressed={viewingCurrent} className={`min-h-9 rounded-md px-2.5 ${viewingCurrent ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setViewingCurrent(true)}>Đang dùng</button>
          <button type="button" aria-pressed={!viewingCurrent} className={`min-h-9 rounded-md px-2.5 ${!viewingCurrent ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setViewingCurrent(false)}>Mẫu mới</button>
        </div>}
        <div className="flex items-center gap-1" aria-label="Kích thước xem trước">
          <ViewportButton label="Desktop" active={viewport === "desktop"} onClick={() => setViewport("desktop")}><Monitor className="size-4" /></ViewportButton>
          <ViewportButton label="Tablet" active={viewport === "tablet"} onClick={() => setViewport("tablet")}><Tablet className="size-4" /></ViewportButton>
          <ViewportButton label="Điện thoại" active={viewport === "mobile"} onClick={() => setViewport("mobile")}><Smartphone className="size-4" /></ViewportButton>
        </div>
      </div>}
      {siteQuery.isError ? <Button variant="outline" onClick={() => void siteQuery.refetch()}><RefreshCw className="mr-1.5 size-4" />Thử tải lại</Button>
        : locked && canUpgrade ? <Button asChild><Link href={`/weddings/${encodeURIComponent(weddingId)}/plan`}>Xem các gói</Link></Button>
          : <Button disabled={busy || locked || siteQuery.isPending || siteQuery.isFetching || siteQuery.isError || !canApplyTemplate || Boolean(previewSource && previewSource.templateKey === template.key && previewSource.templateVersion === template.version)} onClick={() => { if (!site || !canApplyTemplate) return; if (previewSource) setConfirmingSwitch(true); else onChoose(site.version); }}>{busy ? "Đang áp dụng…" : locked ? "Đang kiểm tra gói" : siteQuery.isPending || siteQuery.isFetching ? "Đang kiểm tra bản nháp…" : previewSource ? "Đổi mẫu" : oldDocument ? "Tạo bản nháp V4" : "Dùng mẫu này"}</Button>}
    </header>
    {(error || draftIsUnavailable || staleVersion || recoveryDraftNeedsSave) && <div role={staleVersion || draftIsUnavailable ? "alert" : "status"} className={`border-b px-4 py-3 text-sm ${staleVersion || draftIsUnavailable ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
      {error || (staleVersion ? "Website đã được cập nhật ở nơi khác sau khi bạn mở thư viện mẫu. Hãy quay lại tải bản mới nhất trước khi tiếp tục." : draftIsUnavailable ? "Không thể xác minh bản nháp hiện tại. Hãy tải lại trước khi đổi mẫu để tránh ghi đè phiên bản khác." : "Bản chỉnh sửa đang được giữ tạm. Nội dung sẽ được lưu cùng lúc khi bạn xác nhận áp dụng mẫu mới.")}
    </div>}
    {confirmingSwitch && previewSource ? <main className="flex flex-1 items-center justify-center overflow-auto bg-muted/40 p-4 sm:p-8"><section className="w-full max-w-2xl rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Bản nháp sẽ được cập nhật</p>
      <h2 className="mt-2 font-display text-2xl">Đổi từ {currentTemplateName} sang {template.name}?</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">InviteMe sẽ dùng bố cục và phong cách của mẫu mới. Nội dung tương thích, trang, hình ảnh và các luồng RSVP/lời chúc/quà được giữ lại.</p>
      {impact && <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Trang giữ lại", impact.pagesPreserved], ["Phần giữ nội dung", impact.sectionsPreserved], ["Phần sẽ ẩn", impact.hiddenSections.length], ["Bố cục đổi", impact.changedVariants]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}
      </div>}
      <ul className="mt-5 space-y-3 border-y border-border py-5 text-sm leading-6">
        <li>• {impact?.themeChanged ? "Màu sắc và kiểu chữ sẽ chuyển theo mẫu mới." : "Phong cách chung không thay đổi đáng kể."}</li>
        <li>• {impact?.addedSections.length ? `${impact.addedSections.length} phần bố cục mới sẽ được thêm vào các trang.` : "Không cần thêm phần bố cục mới."}{impact?.addedSections.length ? <details className="mt-1"><summary className="cursor-pointer font-medium text-foreground">Xem phần sẽ thêm</summary><ul className="mt-2 space-y-1 pl-5 text-muted-foreground">{impact.addedSections.map(item => <li key={item.sectionId}>{item.pageTitle} · {sectionNames[item.sectionType]}</li>)}</ul></details> : null}</li>
        {Boolean(impact?.changedVariants) && <li>• {impact?.changedVariants} phần sẽ dùng kiểu bố cục của mẫu mới.</li>}
        {impact?.hiddenSections.length ? <li><details><summary className="cursor-pointer font-medium text-foreground">Xem các phần sẽ được ẩn ({impact.hiddenSections.length})</summary><ul className="mt-2 space-y-1 pl-5 text-muted-foreground">{impact.hiddenSections.map(item => <li key={item.sectionId}>{item.pageTitle} · {sectionNames[item.sectionType]}</li>)}</ul></details></li> : <li>• Không có phần đang hiển thị nào cần ẩn.</li>}
        <li>• Website đang công khai không đổi cho đến khi bạn xuất bản lại.</li>
      </ul>
      <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button variant="outline" onClick={() => setConfirmingSwitch(false)}>Tiếp tục xem mẫu</Button><Button disabled={busy || siteQuery.isPending || siteQuery.isFetching || siteQuery.isError || !canApplyTemplate || !latestCurrentDocument || !preparedDocument} onClick={() => site && preparedDocument && canApplyTemplate && onChoose(site.version, preparedDocument)}>{busy ? "Đang áp dụng…" : "Xác nhận áp dụng mẫu"}</Button></div>
    </section></main> : <div className="flex-1 overflow-auto bg-muted/50 p-3 sm:p-6"><div className="mx-auto min-h-full overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-[width]" style={{ width: viewport === "desktop" ? "100%" : viewport === "tablet" ? 768 : 390, maxWidth: "100%" }}><StoryBuilderV4Renderer document={viewingCurrent && latestCurrentDocument ? latestCurrentDocument : preview} /></div></div>}
    {siteQuery.isError && <p role="alert" className="border-t border-destructive/20 bg-destructive/5 px-4 py-3 text-center text-sm text-destructive">Không thể kiểm tra phiên bản website hiện tại. Hãy thử tải lại trước khi dùng mẫu để tránh ghi đè thay đổi mới.</p>}
    {Boolean(oldDocument) && <p className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground">Website đã xuất bản cũ được giữ nguyên cho đến khi bạn chủ động xuất bản bản V4.</p>}
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
  const weddingEventsQuery = useQuery({ queryKey: ["wedding-events", weddingId], queryFn: () => listWeddingEvents(api, weddingId), enabled: hasEventsSection, staleTime: 30_000 });
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
      pageTitle: page?.navigationLabel || page?.title || "Đang mở website",
      sectionTitle: section ? sectionNames[section.type] : null,
      fieldTitle: presence.status === "editing" ? presenceFieldLabel(presence.fieldPath) : null,
      statusTitle: presence.status === "editing" ? "Đang chỉnh sửa" : presence.status === "idle" ? "Tạm rời" : "Đang xem",
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
    return validateBuilderDocument(doc, currentTemplate);
  }, [currentTemplate, doc, showFieldErrors]);
  const publishIssues = useMemo(() => doc ? validateBuilderDocument(doc, currentTemplate) : [], [currentTemplate, doc]);
  const hiddenPages = doc?.pages.filter(page => page.visible === false) ?? [];
  const hiddenSections = doc?.pages.flatMap(page => page.sections.filter(section => section.visible === false).map(section => ({ pageId: page.id, sectionId: section.id, page: page.title, section: sectionNames[section.type] }))) ?? [];
  const missingGalleryDescriptions = doc?.pages.flatMap(page => page.sections.filter((section): section is Extract<StoryBuilderV4Section, { type: "gallery" }> => section.type === "gallery").flatMap(section => {
    const content = record(section.content);
    const images = Array.isArray(content.images) ? content.images.map(record) : [];
    return images.flatMap((image, index) => String(image.imageUrl ?? "").trim() && !String(image.alt ?? "").trim() ? [{ pageId: page.id, sectionId: section.id, page: page.title, section: sectionNames.gallery, imageIndex: index + 1 }] : []);
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
      setConflict(true); setSaveState("error"); setError("Bản mới nhất không còn là website V4. Tải lại để tránh ghi đè."); return;
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
    setError(merged.conflicts.length ? "Hai phiên đã sửa cùng một nội dung. Chọn bản cần giữ cho từng mục." : "");
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
      setError(merged.conflicts.length ? "Đã khôi phục thay đổi trên thiết bị. Chọn nội dung cần giữ để tiếp tục." : "");
      setRecoveredRecovery(needsSave || merged.conflicts.length > 0);
    }).catch(() => undefined).finally(() => { if (!cancelled) setRecoveryLoadedSessionId(presenceSessionId); });
    return () => { cancelled = true; };
  }, [presenceSessionId, weddingId, initialSite.version, initialSite.document, initialSite.status]);

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
    setError(remaining.length ? "Còn nội dung cần chọn phiên bản sẽ giữ." : "");
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
      if (event.target instanceof Node && !toolbarActionsRef.current?.contains(event.target)) setToolbarActionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setToolbarActionsOpen(false); };
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
    const validationIssues = validateBuilderDocument(next, currentTemplate);
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
            setConflict(true); setSaveState("error"); setError("Hai phiên đã sửa cùng một nội dung. Chọn bản cần giữ cho từng mục.");
            return null;
          }
          if (!needsSave) {
            setConflict(false); setSaveState("saved"); setError("");
            return latest;
          }
          candidate = merged.document;
          if (attempt === 2) {
            setSaveState("error"); setError("Website tiếp tục thay đổi khi đang lưu. Nội dung của bạn vẫn được giữ; nhấn Lưu để thử lại.");
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
      setError(rebased.conflicts.length ? "Một thay đổi khác vừa được lưu cùng trường bạn đang sửa. Chọn nội dung cần giữ." : "");
      if (!needsSave && presenceSessionId) {
        setRecoveredRecovery(false);
        void clearWebsiteBuilderRecovery(weddingId, presenceSessionId).catch(() => undefined);
      }
      return result;
    } catch (cause) {
      lastPersistBackendCodeRef.current = cause instanceof ApiError ? cause.backendCode : undefined;
      const message = errText(cause); setError(message); setSaveState("error");
      if (cause instanceof ApiError && cause.status === 409) setError("Website vẫn được cập nhật ở phiên khác. Thay đổi chưa bị xóa; tải mới nhất rồi thử lại.");
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
      setMediaDeleteError(errText(cause));
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
    if (doc.pages.some(page => page.slug.toLowerCase() === pageSlug.trim().toLowerCase())) { setError("Đường dẫn trang này đã được dùng."); return; }
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
    if (!window.confirm("Xóa trang này khỏi bản nháp website?")) return;
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
    setError(applied.skippedChanges ? "Một số nội dung đã được phiên kia cập nhật nên không bị hoàn tác để tránh ghi đè." : "");
  }, [doc, undoStack, redoStack]);
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
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB."); return null; }
    setBusy(true); setError("");
    try { const result = await uploadWeddingMedia(api, weddingId, file); void cache.invalidateQueries({ queryKey: ["wedding-media", weddingId] }); return mediaUrl(result.url) ?? result.url; }
    catch (cause) { setError(errText(cause)); return null; }
    finally { setBusy(false); }
  }
  async function publish() {
    const publishDocument = docRef.current;
    if (!doc || !publishDocument || !isOwner || conflict || premiumLocked || premiumUnknown || busy || saveInFlight.current) return;
    const validationIssues = validateBuilderDocument(publishDocument, currentTemplate);
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
        if (JSON.stringify(docRef.current) !== JSON.stringify(publishDocument)) { setError("Có thay đổi mới trong lúc lưu. Đợi tự động lưu trước khi xuất bản."); return; }
        dirtyRef.current = false; setDirty(false); setSaveState("saved");
      }
      const result = await publishWebsite(api, weddingId, currentVersion);
      versionRef.current = result.version; setVersion(result.version); setStatus(result.status); cache.setQueryData(["website", weddingId], result);
      setPublishReviewOpen(false);
    } catch (cause) { setError(errText(cause)); void cache.invalidateQueries({ queryKey: ["website", weddingId] }); }
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
    catch (cause) { setError(errText(cause)); } finally { setBusy(false); }
  }
  async function reloadLatest() {
    const latest = await getWebsite(api, weddingId);
    if (!isStoryBuilderV4Document(latest.document)) { setError("Bản mới nhất không còn là website V4."); return; }
    docRef.current = latest.document; baseDocumentRef.current = latest.document; remoteDocumentRef.current = latest.document; setDoc(latest.document); setVersion(latest.version); versionRef.current = latest.version; setStatus(latest.status); setConflict(false); setMergeConflicts([]); setDirty(false); dirtyRef.current = false; setSaveState("saved"); setUndoStack([]); setRedoStack([]);
    setSelectedPageId(latest.document.pages[0]?.id ?? ""); setSelectedSectionId(latest.document.pages[0]?.sections[0]?.id ?? ""); cache.setQueryData(["website", weddingId], latest);
  }
  function applyRestoredWebsite(result: Website) {
    if (!isStoryBuilderV4Document(result.document)) { setError("Phiên bản đã khôi phục không còn đúng định dạng Website Builder V4."); return; }
    docRef.current = result.document; baseDocumentRef.current = result.document; remoteDocumentRef.current = result.document;
    versionRef.current = result.version;
    setDoc(result.document); setVersion(result.version); setStatus(result.status); setConflict(false); setMergeConflicts([]);
    dirtyRef.current = false; setDirty(false); setSaveState("saved"); setError(""); setShowFieldErrors(false);
    setUndoStack([]); setRedoStack([]); setRecoveredRecovery(false);
    setSelectedPageId(result.document.pages[0]?.id ?? ""); setSelectedSectionId(result.document.pages[0]?.sections[0]?.id ?? "");
    void clearLocalRecovery();
    cache.setQueryData(["website", weddingId], result);
  }

  if (!recoveryLoaded) return <div className="fixed inset-0 z-40 grid place-items-center bg-background p-6 text-center"><div><LoaderCircle className="mx-auto size-6 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Đang kiểm tra bản chỉnh sửa còn lưu trên thiết bị…</p></div></div>;
  if (!doc) return <p className="p-6 text-sm text-muted-foreground">Website chưa có bản nháp V4. Quay lại thư viện mẫu để bắt đầu.</p>;
  if (!isOwner) return <div className="mx-auto max-w-3xl p-8"><FeatureLimitNotice title="Chỉ chủ tiệc mới có thể chỉnh sửa website" description="Bạn vẫn có thể xem website đã xuất bản. Hãy nhờ chủ tiệc mở trình dựng website." status="unavailable" variant="full" /></div>;
  const viewportWidth = viewport === "desktop" ? 1120 : viewport === "tablet" ? 768 : 390;
  const renderedDocument = clone(doc);
  const mainWeddingEvent: WeddingEvent = { id: "main", title: "Lễ cưới", startsAt: setup.eventDateTime, timeZoneId: setup.timeZoneId, venueName: setup.venueName, address: setup.venueAddress, sortOrder: 0 };
  const eventById = new Map([[mainWeddingEvent.id, mainWeddingEvent], ...(weddingEventsQuery.data ?? []).map(event => [event.id, event] as const)]);
  for (const page of renderedDocument.pages) for (const section of page.sections) {
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
  const saveBlockedReason = !dirty ? "Không có thay đổi mới cần lưu." : !isOwner ? "Chỉ chủ tiệc mới có thể lưu website." : offline ? "Đang ngoại tuyến; thay đổi được giữ trên thiết bị và sẽ tự lưu khi có mạng." : conflict ? "Hãy xử lý nội dung đang xung đột trước khi lưu." : premiumLocked ? "Gói hiện tại chưa hỗ trợ mẫu website này." : premiumUnknown ? "Chưa xác minh được quyền dùng mẫu Premium." : !recoveryLoaded ? "Đang khôi phục bản chỉnh sửa trên thiết bị." : busy ? "Đang có thao tác khác; hãy đợi hoàn tất." : saveState === "saving" ? "Đang lưu website." : "";
  const saveActionDisabled = Boolean(saveBlockedReason);
  const publishBlockedReason = busy ? "Đang xử lý website." : offline ? "Đang ngoại tuyến; hãy kết nối lại trước khi xuất bản." : conflict ? "Hãy xử lý nội dung đang xung đột trước khi xuất bản." : premiumLocked ? "Gói hiện tại chưa hỗ trợ mẫu website này." : premiumUnknown ? "Chưa xác minh được quyền dùng mẫu Premium." : !recoveryLoaded ? "Đang khôi phục bản chỉnh sửa trên thiết bị." : "";
  const publishActionDisabled = Boolean(publishBlockedReason);
  const saveActionLabel = saveState === "saving" ? "Đang lưu" : dirty ? "Lưu ngay" : "Đã lưu";
  const saveStatusLabel = offline ? "Ngoại tuyến · thay đổi đang giữ trên thiết bị" : conflict ? "Có xung đột · cần chọn nội dung sẽ giữ" : saveState === "saving" ? "Đang lưu website…" : dirty && saveState === "error" ? "Chưa lưu được · có thể thử lưu lại" : dirty ? "Có thay đổi chưa lưu" : "Đã lưu";
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
    sectionName={currentSection ? sectionNames[currentSection.type] : undefined}
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
    onGift={(patch) => mutate(copy => { copy.content.gift = { ...copy.content.gift, ...patch, enabled: copy.content.gift?.enabled ?? true }; })}
    issues={validationIssues}
    pageIndex={pageIndex}
    sectionIndex={sectionIndex}
    weddingId={weddingId}
    selectedEventIds={currentSection?.type === "events" ? currentSection.content.eventIds ?? (currentSection.content.events?.length ? [] : ["main"]) : []}
    onEventIds={ids => currentSection?.type === "events" && editContent(currentSection.id, "eventIds", ids)}
  />;
  function openGuestExperienceSettings() {
    setExperienceSettingsOpen(true);
    setRightOpen(true);
    if (window.matchMedia("(max-width: 767px)").matches) setMobilePanel("inspector");
  }

  return <div className="fixed inset-0 z-40 flex flex-col bg-[#faf8f7] text-foreground"
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
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3"><Link href={`/weddings/${encodeURIComponent(weddingId)}`} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Thoát trình dựng"><ArrowLeft className="size-4" /></Link><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-sm font-semibold sm:text-base">{setup.name}</h1><span title={status === "PUBLISHED" ? "Đã xuất bản" : "Bản nháp"} aria-label={status === "PUBLISHED" ? "Đã xuất bản" : "Bản nháp"} className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] max-[420px]:size-2 max-[420px]:rounded-full max-[420px]:p-0 ${status === "PUBLISHED" ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}><span className="max-[420px]:hidden">{status === "PUBLISHED" ? "Đã xuất bản" : "Bản nháp"}</span><span aria-hidden="true" className="hidden size-1.5 rounded-full bg-current max-[420px]:inline" /></span></div><p aria-live="polite" className="truncate text-xs text-muted-foreground">{saveStatusLabel}</p></div>
      </div>
      <div role="group" aria-label="Thao tác website thường dùng" className="relative flex shrink-0 items-center gap-1 sm:gap-1.5" ref={toolbarActionsRef}>
        <button type="button" aria-label="Hoàn tác" title="Hoàn tác · Ctrl/⌘+Z" disabled={!undoStack.length || busy} className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-35 min-[640px]:inline-flex" onClick={() => history("undo")}><Undo2 className="size-4" /></button>
        <button type="button" aria-label="Làm lại" title="Làm lại · Ctrl/⌘+Shift+Z" disabled={!redoStack.length || busy} className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-35 min-[640px]:inline-flex" onClick={() => history("redo")}><Redo2 className="size-4" /></button>
        <span aria-hidden="true" className="mx-0.5 hidden h-6 border-l border-border min-[640px]:block" />
        <button type="button" aria-label={preview ? "Chỉnh sửa website" : "Xem trước website"} title={preview ? "Chỉnh sửa" : "Xem trước"} aria-pressed={preview} className={`inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg border bg-background text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-[1100px]:w-auto min-[1100px]:px-3 ${preview ? "border-primary text-primary-hover" : "border-border"}`} onClick={() => setPreview(value => !value)}>
          {preview ? <X className="size-4" /> : <Eye className="size-4" />}<span className="hidden min-[1100px]:inline">{preview ? "Chỉnh sửa" : "Xem trước"}</span>
        </button>
        <button type="button" aria-label="Trải nghiệm khách mời" title="Trải nghiệm khách" aria-pressed={experienceSettingsOpen} className={`inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg border bg-background text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-[1100px]:w-auto min-[1100px]:px-3 ${experienceSettingsOpen ? "border-primary text-primary-hover" : "border-border"}`} onClick={() => experienceSettingsOpen ? setExperienceSettingsOpen(false) : openGuestExperienceSettings()}>
          <Sparkles className="size-4" /><span className="hidden min-[1100px]:inline">Trải nghiệm khách</span>
        </button>
        <button type="button" aria-label={saveActionDisabled ? saveBlockedReason : "Lưu ngay; tự động lưu vẫn bật."} title={saveActionDisabled ? saveBlockedReason : "Lưu ngay · tự động lưu vẫn bật"} disabled={saveActionDisabled} className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45 min-[1100px]:min-w-[104px] min-[1100px]:px-3" onClick={() => { const latest = docRef.current; if (latest) void persist(latest, true); }}>
          {saveState === "saving" ? <LoaderCircle className="size-4 animate-spin" /> : saveState === "saved" && !dirty ? <Check className="size-4" /> : <Save className="size-4" />}<span className="hidden min-[1100px]:inline">{saveActionLabel}</span>
        </button>
        <button type="button" aria-label={publishActionDisabled ? publishBlockedReason : status === "PUBLISHED" ? "Kiểm tra và xuất bản lại website" : "Kiểm tra và xuất bản website"} title={publishActionDisabled ? publishBlockedReason : status === "PUBLISHED" ? "Kiểm tra và xuất bản lại" : "Kiểm tra và xuất bản"} disabled={publishActionDisabled} className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-0 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-[1100px]:w-auto min-[1100px]:min-w-[132px] min-[1100px]:px-3" onClick={() => setPublishReviewOpen(true)}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}<span className="hidden min-[1100px]:inline">{status === "PUBLISHED" ? "Xuất bản lại" : "Xuất bản"}</span>
        </button>
        <button type="button" aria-label="Thêm thao tác" title="Thêm thao tác" aria-expanded={toolbarActionsOpen} aria-haspopup="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setToolbarActionsOpen(open => !open)}><MoreHorizontal className="size-4" /></button>
        {toolbarActionsOpen && <div role="group" aria-label="Các thao tác khác" className="absolute right-0 top-full z-50 mt-2 min-w-56 rounded-xl border border-border bg-background p-2 shadow-xl">
          <div className="flex gap-1 border-b border-border pb-2 min-[640px]:hidden">
            <button type="button" title="Ctrl/⌘+Z" className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40" disabled={!undoStack.length || busy} onClick={() => { history("undo"); setToolbarActionsOpen(false); }}><Undo2 className="size-4" />Hoàn tác</button>
            <button type="button" title="Ctrl/⌘+Shift+Z" className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40" disabled={!redoStack.length || busy} onClick={() => { history("redo"); setToolbarActionsOpen(false); }}><Redo2 className="size-4" />Làm lại</button>
          </div>
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground min-[640px]:hidden">Chỉnh sửa</p>
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mẫu & website</p>
          <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40" disabled={busy || conflict || saveState === "saving"} onClick={() => { setToolbarActionsOpen(false); void chooseOtherTemplate(); }}><Eye className="size-4" />Chọn mẫu website khác</button>
          <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => { setToolbarActionsOpen(false); setVersionHistoryOpen(true); }}><History className="size-4" />Lịch sử phiên bản</button>
          {status === "PUBLISHED" && setup.slug && <Link className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href={`/wedding/${encodeURIComponent(setup.slug)}`} target="_blank" rel="noreferrer" onClick={() => setToolbarActionsOpen(false)}><Globe className="size-4" />Mở website</Link>}
          <div className="my-1 border-t border-border" />
          <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Chia sẻ</p>
          <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => { setToolbarActionsOpen(false); setShareSettingsOpen(true); }}><Globe className="size-4" />Chia sẻ & SEO</button>
          {status === "PUBLISHED" && <><div className="my-1 border-t border-border" /><p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Quản lý xuất bản</p><button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40" disabled={busy} onClick={() => { setToolbarActionsOpen(false); void unpublish(); }}>Gỡ xuất bản</button></>}
        </div>}
      </div>
    </header>
    {conflict && <section role="alert" aria-label="Giải quyết nội dung chỉnh sửa trùng nhau" className="z-10 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">Có thay đổi trùng nhau</p><p className="mt-0.5">Chọn nội dung cần giữ. Các phần hai bạn sửa riêng đã được ghép tự động.</p></div>{mergeConflicts.length === 0 && <Button size="sm" variant="outline" onClick={() => void reloadLatest()}><RefreshCw className="mr-1.5 size-3.5" />Tải bản mới nhất</Button>}</div>
      {mergeConflicts.length > 0 && <ul className="mt-3 grid gap-2 lg:grid-cols-2">{mergeConflicts.map((issue, index) => {
        const location = doc ? conflictLocation(issue.path, doc) : { pageId: undefined, sectionId: undefined, label: "Nội dung website" };
        const remoteEditor = builderPresence.find(presence => presence.status === "editing" &&
          (!location.pageId || presence.pageId === location.pageId) && (!location.sectionId || presence.sectionId === location.sectionId));
        return <li key={`${issue.path.join("/")}-${index}`} className="rounded-lg border border-amber-300/80 bg-white/75 p-3"><p className="font-medium" title={location.label}>{location.label}</p><div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="min-w-0 rounded-md bg-primary/[0.06] p-2"><p className="text-[11px] font-semibold uppercase tracking-wide">Bản hiện tại trên thiết bị này · {displayName || "Phiên này"}</p><p className="mt-1 break-words text-xs">{doc ? conflictValuePreview(issue.localExists, issue.localValue, issue.path, doc) : "Nội dung đã được cập nhật"}</p><Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => resolveMerge(index, "local")}>Giữ bản hiện tại</Button></div>
          <div className="min-w-0 rounded-md bg-muted/70 p-2"><p className="text-[11px] font-semibold uppercase tracking-wide">Bản đã lưu mới nhất</p>{remoteEditor && <p className="mt-1 text-[11px] text-muted-foreground">{remoteEditor.displayName} đang chỉnh phần này</p>}<p className="mt-1 break-words text-xs">{doc ? conflictValuePreview(issue.remoteExists, issue.remoteValue, issue.path, doc) : "Nội dung đã lưu"}</p><Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => resolveMerge(index, "remote")}>Dùng bản đã lưu</Button></div>
        </div></li>;
      })}</ul>}
    </section>}
    {recoveredRecovery && <div role="status" className="z-10 flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 bg-primary/[0.05] px-4 py-2 text-sm"><span>Đã khôi phục thay đổi chưa đồng bộ từ thiết bị này. Bản nháp sẽ được lưu khi kết nối ổn định.</span><Button size="sm" variant="outline" onClick={() => void clearLocalRecovery()}>Xóa bản khôi phục trên thiết bị</Button></div>}
    {offline && <div role="status" className="z-10 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">Đang ngoại tuyến. Nội dung bạn sửa vẫn nằm trong trình duyệt; InviteMe sẽ lưu khi mạng hoạt động trở lại.</div>}
    {error && <div role="alert" className="z-10 flex items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive"><span>{error}</span><button aria-label="Đóng thông báo" onClick={() => setError("")}><X className="size-4" /></button></div>}
    <section aria-label="Người đang cùng chỉnh sửa website" aria-live="polite" className="z-10 border-b border-primary/20 bg-primary/[0.055] px-3 py-2 sm:px-5 md:py-2.5">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-x-3 md:gap-y-2">
        <div className="flex min-w-0 items-center justify-between gap-2 md:contents">
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-primary-hover"><UsersRound className="size-4 shrink-0" /><span className="truncate">{builderPresenceDetails.length > 0 ? <><span className="md:hidden">Cùng chỉnh sửa</span><span className="hidden md:inline">Đang cùng chỉnh sửa</span></> : "Chưa có phiên khác"}</span>{builderPresenceDetails.length > 0 && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5">{builderPresenceDetails.length}</span>}</div>
          <button type="button" onClick={() => { setSuggestedDisplayName(localStorage.getItem(`inviteme:builder:${weddingId}:label`) || displayName); setCustomDisplayName(displayName); setIdentityPromptOpen(true); }} className="inline-flex min-h-8 max-w-[150px] shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-background/80 px-2.5 text-xs text-foreground hover:bg-primary/10 sm:max-w-[190px]" aria-label="Đổi tên hiển thị trong danh sách người đang chỉnh sửa"><UserRound className="size-3.5 shrink-0 text-primary" /><span className="truncate">{displayName || "Đặt tên"}</span></button>
        </div>
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-1 md:flex-wrap md:overflow-visible md:pb-0 md:snap-none">
          {builderPresenceDetails.length === 0 && <span className="max-w-full py-1 text-xs leading-5 text-muted-foreground"><span className="md:hidden">Mở website ở tab khác bằng cùng tài khoản để thấy nhau.</span><span className="hidden md:inline">Mở website này trong tab khác bằng cùng tài khoản và chọn tên hiển thị để thấy hoạt động của nhau.</span></span>}
          {builderPresenceDetails.map(({ presence, pageTitle, sectionTitle, fieldTitle, statusTitle }) => {
            const canNavigate = Boolean(doc?.pages.some(page => page.id === presence.pageId));
            const location = [pageTitle, sectionTitle, fieldTitle].filter(Boolean).join(" · ");
            const destination = [pageTitle, sectionTitle, fieldTitle].filter(Boolean).join(", ");
            return <button key={presence.sessionId} type="button" disabled={!canNavigate} onClick={() => goToPresence(presence)} aria-label={canNavigate ? `Đi tới vị trí ${destination} của ${presence.displayName}` : `Vị trí của ${presence.displayName} không còn tồn tại`} title={canNavigate ? `${presence.displayName} · ${statusTitle} · ${location || "Website"}` : "Trang đã thay đổi hoặc không còn tồn tại"} className="group flex min-h-12 w-[min(78vw,290px)] shrink-0 snap-start items-center gap-2 rounded-xl border border-primary/15 bg-background/90 px-2.5 py-2 text-left shadow-sm transition hover:border-primary/35 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-55 md:min-h-11 md:w-auto md:max-w-[310px] md:flex-1 md:rounded-lg md:py-1.5">
              <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${presence.status === "editing" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>{presence.displayName.slice(0, 1).toLocaleUpperCase("vi-VN")}</span>
              <span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-1.5"><span className="truncate text-xs font-semibold text-foreground">{presence.displayName}</span><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${presence.status === "editing" ? "bg-primary/10 text-primary-hover" : "bg-muted text-muted-foreground"}`}>{statusTitle}</span></span><span className="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground">{location || "Đang ở website"}</span></span>
              <ChevronRight className="size-4 shrink-0 text-primary/70 transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>;
          })}
        </div>
      </div>
    </section>
    {templateNotInNewSelections && <div role="status" className="z-10 flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"><span>Mẫu hiện tại đã được lưu trữ hoặc gỡ khỏi thư viện chọn mới. Website đang công khai vẫn được giữ nguyên; nếu không thể lưu hoặc xuất bản bản nháp, hãy chọn mẫu thay thế.</span><Button size="sm" variant="outline" disabled={busy || conflict || saveState === "saving"} onClick={() => void chooseOtherTemplate()}><Eye className="mr-1.5 size-4" />Chọn mẫu khác</Button></div>}
    {showQuickStart && !preview && <section aria-label="Hướng dẫn nhanh" className="z-10 border-b border-primary/15 bg-primary/[0.045] px-3 py-2.5 sm:px-5">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2">
        <p className="shrink-0 text-xs font-semibold text-foreground">Bắt đầu nhanh</p>
        <ol className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li><span className="mr-1 font-semibold text-primary">1</span>Chọn trang và phần cần sửa</li>
          <li><span className="mr-1 font-semibold text-primary">2</span>Chỉnh nội dung ở bảng bên cạnh</li>
          <li><span className="mr-1 font-semibold text-primary">3</span>Xem trước rồi xuất bản</li>
        </ol>
        <button type="button" className="min-h-10 rounded-lg px-3 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={dismissQuickStart}>Đã hiểu</button>
      </div>
    </section>}
    <div className="flex min-h-0 flex-1">
      {!preview && leftOpen && <aside className="hidden w-[254px] shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trang & nội dung</span><button className="text-xs text-primary" onClick={() => setLeftOpen(false)}>Thu gọn</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">TRANG</div>
          {doc.pages.map((page, index) => <div key={page.id} className={`group mb-1 flex items-center gap-0.5 rounded-lg ${page.id === currentPage?.id ? "bg-primary/10 text-primary-hover" : "hover:bg-muted"}`}>
            <button type="button" className="min-h-10 min-w-0 flex-1 truncate px-3 text-left text-sm" onClick={() => selectPage(page.id)} aria-current={page.id === currentPage?.id ? "page" : undefined}>{page.isHome ? "⌂  " : "　"}{page.navigationLabel || page.title}</button>
            {!page.isHome && <>
              <button type="button" className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-25" title="Chuyển trang lên" aria-label={`Chuyển trang ${page.title} lên`} disabled={index === 0 || doc.pages[index - 1]?.isHome} onClick={() => reorderPage(index, -1)}><ChevronUp className="size-3.5" /></button>
              <button type="button" className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-25" title="Chuyển trang xuống" aria-label={`Chuyển trang ${page.title} xuống`} disabled={index === doc.pages.length - 1 || doc.pages[index + 1]?.isHome} onClick={() => reorderPage(index, 1)}><ChevronDown className="size-3.5" /></button>
              <button type="button" className="mr-1 grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Xóa trang ${page.title}`} onClick={() => removePage(page.id)}><Trash2 className="size-3.5" /></button>
            </>}
          </div>)}
          {doc.pages.length < 8 && <div className="my-3 space-y-2 border-b border-border pb-4">
            <input className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm" value={pageName} onChange={event => { setPageName(event.target.value); if (!pageSlug) setPageSlug(event.target.value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} placeholder="Tên trang mới" aria-label="Tên trang mới" />
            <div className="flex gap-2"><input className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm" value={pageSlug} onChange={event => setPageSlug(event.target.value)} placeholder="duong-dan" aria-label="Đường dẫn trang mới" /><button className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40" disabled={!pageName.trim() || !pageSlug.trim()} onClick={addPage} aria-label="Thêm trang"><Plus className="size-4" /></button></div>
          </div>}
          <div className="mb-2 mt-4 flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">CÁC PHẦN</span><Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={!currentPage || currentPage.sections.length >= 24 || doc.pages.reduce((total, page) => total + page.sections.length, 0) >= 80} onClick={openSectionLibrary}><Plus className="mr-1 size-3.5" />Thêm phần</Button></div>
          {currentPage?.sections.map((section, index) => {
            const sectionPeers = presenceBySection.get(section.id) ?? [];
            return <div key={section.id}
            onDragOver={event => { event.preventDefault(); setDropSectionId(section.id); }}
            onDrop={event => { event.preventDefault(); if (dragSectionId) reorderSection(dragSectionId, section.id); setDragSectionId(null); setDropSectionId(null); }}
            className={`group mb-1 flex items-center gap-0.5 rounded-lg border ${section.id === currentSection?.id ? "border-primary/40 bg-primary/5" : sectionPeers.length ? "border-primary/25 bg-primary/[0.035]" : "border-transparent hover:border-border hover:bg-muted/50"} ${dropSectionId === section.id && dragSectionId !== section.id ? "border-b-2 border-b-primary" : ""} ${dragSectionId === section.id ? "opacity-45" : ""}`}>
            <button type="button" draggable={section.type !== "hero"} className={`grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background ${section.type === "hero" ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}`} aria-label={`Kéo để sắp xếp ${sectionNames[section.type]}`} title={section.type === "hero" ? "Ảnh bìa luôn ở đầu trang" : "Kéo để sắp xếp"} onDragStart={event => { if (section.type === "hero") { event.preventDefault(); return; } setDragSectionId(section.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", section.id); }} onDragEnd={() => { setDragSectionId(null); setDropSectionId(null); }}><GripVertical className="size-4" /></button>
            <button type="button" className="min-h-10 min-w-0 flex-1 truncate px-2 text-left text-sm" onClick={() => selectSection(section.id)} aria-current={section.id === currentSection?.id ? "true" : undefined}><span className="mr-2 text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>{sectionNames[section.type]}</button>
            {sectionPeers.length > 0 && <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${sectionPeers.some(peer => peer.status === "editing") ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`} title={sectionPeers.map(peer => `${peer.displayName} · ${peer.status === "editing" ? "đang chỉnh sửa" : peer.status === "idle" ? "tạm rời" : "đang xem"}${peer.status === "editing" && peer.fieldPath ? ` · ${presenceFieldLabel(peer.fieldPath)}` : ""}`).join("; ")} aria-label={`${sectionPeers.map(peer => peer.displayName).join(", ")} đang ở phần ${sectionNames[section.type]}`}>{sectionPeers.length > 1 ? sectionPeers.length : sectionPeers[0]?.displayName.slice(0, 1).toLocaleUpperCase("vi-VN")}</span>}
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background" title={section.visible === false ? "Phần đang ẩn" : "Phần đang hiển thị"} onClick={() => replaceSection(section.id, { visible: section.visible === false })} aria-label={section.visible === false ? `Hiện ${sectionNames[section.type]}` : `Ẩn ${sectionNames[section.type]}`}>{section.visible === false ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button>
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 pointer-events-none hover:bg-background group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto disabled:opacity-30" aria-label={`Đưa ${sectionNames[section.type]} lên`} disabled={index === 0 || section.type === "hero" || currentPage?.sections[index - 1]?.type === "hero"} onClick={() => { const target = currentPage?.sections[index - 1]; if (target) reorderSection(section.id, target.id); }}><ChevronUp className="size-3.5" /></button>
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 pointer-events-none hover:bg-background group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto disabled:opacity-30" aria-label={`Đưa ${sectionNames[section.type]} xuống`} disabled={index === (currentPage?.sections.length ?? 0) - 1 || section.type === "hero"} onClick={() => { const target = currentPage?.sections[index + 1]; if (target) reorderSection(section.id, target.id); }}><ChevronDown className="size-3.5" /></button>
          </div>;
          })}
          <label className="mt-5 grid gap-1 text-xs text-muted-foreground">Kiểu điều hướng
            <select className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground" value={doc.navigationMode} onChange={event => mutate(copy => { copy.navigationMode = event.target.value as StoryBuilderV4Document["navigationMode"]; })}>
              {doc.pages.length === 1 && <option value="one-page">Một trang</option>}{doc.pages.length >= 2 && <option value="multi-page">Nhiều trang</option>}<option value="hybrid">Kết hợp</option>
            </select>
          </label>
        </div>
      </aside>}
      {!preview && !leftOpen && <button type="button" className="hidden w-9 shrink-0 place-items-center border-r border-border bg-background text-muted-foreground hover:text-foreground md:grid" onClick={() => setLeftOpen(true)} aria-label="Mở danh sách trang"><ChevronRight className="size-4" /></button>}
      <main className="relative min-w-0 flex-1 overflow-hidden">
        {!preview && <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2"><select className="h-9 max-w-[135px] truncate rounded-lg border border-input bg-background px-2 text-sm sm:max-w-[170px]" value={currentPage?.id ?? ""} onChange={event => selectPage(event.target.value)} aria-label="Trang đang xem">{doc.pages.map(page => <option key={page.id} value={page.id}>{page.title}</option>)}</select><span className="hidden text-xs text-muted-foreground lg:inline">Bấm vào phần để chọn · Nhấp đúp hoặc nhấn Enter trên tiêu đề để sửa nhanh · v{version}</span></div>
          <div className="flex items-center gap-1" aria-label="Kích thước canvas"><ViewportButton label="Desktop" active={viewport === "desktop"} onClick={() => setViewport("desktop")}><Monitor className="size-4" /></ViewportButton><ViewportButton label="Tablet" active={viewport === "tablet"} onClick={() => setViewport("tablet")}><Tablet className="size-4" /></ViewportButton><ViewportButton label="Điện thoại" active={viewport === "mobile"} onClick={() => setViewport("mobile")}><Smartphone className="size-4" /></ViewportButton></div>
        </div>}
        {preview && <div className="flex min-h-12 items-center justify-between border-b border-border bg-background px-4"><span className="text-sm font-medium">Xem trước · {currentPage?.title}</span><Button variant="outline" size="sm" onClick={() => setPreview(false)}><X className="mr-1.5 size-4" />Đóng xem trước</Button></div>}
        <div className="h-full overflow-auto bg-[#f1eeed] p-3 pb-20 sm:p-6 sm:pb-6">
          <div className="mx-auto min-h-full overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-[width]" style={{ width: viewportWidth, maxWidth: "100%" }}>
            <StoryBuilderV4Renderer
              document={renderedDocument}
              pagePath={currentPage?.slug}
              showHidden={!preview}
              editable={!preview}
              showGuestExperiencePreview
              selectedSectionId={currentSection?.id}
              onSelectSection={selectSection}
              onInlineEdit={(sectionId, key, value) => {
                const activeSection = currentPage?.sections.find(item => item.id === sectionId);
                if (activeSection) editContent(sectionId, key, value);
              }}
              onNavigatePage={preview ? pagePath => {
                const page = doc.pages.find(item => item.slug === pagePath);
                if (!page) return;
                setSelectedPageId(page.id);
                setSelectedSectionId(page.sections.find(section => section.visible !== false)?.id ?? page.sections[0]?.id ?? "");
              } : undefined}
            />
          </div>
        </div>
      </main>
      {!preview && rightOpen && <aside className="hidden w-[310px] shrink-0 flex-col overflow-y-auto border-l border-border bg-background md:flex">{inspectorPanel}</aside>}
      {!preview && !rightOpen && <button type="button" className="hidden w-9 shrink-0 place-items-center border-l border-border bg-background text-muted-foreground hover:text-foreground md:grid" onClick={() => setRightOpen(true)} aria-label="Mở thanh chỉnh sửa"><ChevronLeft className="size-4" /></button>}
    </div>
    {!preview && <nav aria-label="Công cụ website trên điện thoại" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(55,35,40,0.08)] backdrop-blur md:hidden">
      <button type="button" className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs text-muted-foreground" aria-label="Mở trang và nội dung" onClick={() => setMobilePanel("structure")}><Menu className="size-4" />Trang & phần</button>
      <button type="button" className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs text-muted-foreground" aria-label="Chỉnh sửa phần đang chọn" onClick={() => { setExperienceSettingsOpen(false); setMobilePanel("inspector"); }}><ImageIcon className="size-4" />Chỉnh sửa</button>
      <button type="button" className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${experienceSettingsOpen ? "text-primary" : "text-muted-foreground"}`} aria-label="Cài đặt trải nghiệm khách mời" aria-pressed={experienceSettingsOpen} onClick={openGuestExperienceSettings}><Sparkles className="size-4" />Khách mời</button>
      <button type="button" className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs text-primary" aria-label="Xem trước website" onClick={() => setPreview(true)}><Eye className="size-4" />Xem trước</button>
    </nav>}
    {mobilePanel && !preview && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" role="presentation" onClick={() => setMobilePanel(null)}><section role="dialog" aria-modal="true" aria-label={mobilePanel === "structure" ? "Trang và phần website" : experienceSettingsOpen ? "Trải nghiệm khách mời" : "Chỉnh sửa nội dung website"} className="absolute inset-x-0 bottom-0 flex max-h-[78dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3"><div className="flex gap-1 rounded-lg bg-muted p-1"><button type="button" aria-pressed={mobilePanel === "structure"} className={`rounded-md px-3 py-2 text-sm ${mobilePanel === "structure" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setMobilePanel("structure")}>Trang & phần</button><button type="button" aria-pressed={mobilePanel === "inspector" && !experienceSettingsOpen} className={`rounded-md px-3 py-2 text-sm ${mobilePanel === "inspector" && !experienceSettingsOpen ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => { setExperienceSettingsOpen(false); setMobilePanel("inspector"); }}>Chỉnh sửa</button><button type="button" aria-pressed={mobilePanel === "inspector" && experienceSettingsOpen} className={`rounded-md px-3 py-2 text-sm ${mobilePanel === "inspector" && experienceSettingsOpen ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={openGuestExperienceSettings}>Khách mời</button></div><Button variant="ghost" size="sm" onClick={() => setMobilePanel(null)} aria-label="Đóng bảng chỉnh sửa"><X className="size-4" /></Button></div>
      {mobilePanel === "structure" ? <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <p className="mb-2 text-xs font-medium text-muted-foreground">TRANG</p>
      {doc.pages.map((page, index) => <div key={page.id} className={`mb-1 flex items-center gap-1 rounded-lg ${page.id === currentPage?.id ? "bg-primary/10" : ""}`}>
        <button type="button" className="min-h-11 min-w-0 flex-1 truncate px-3 text-left text-sm" onClick={() => selectPage(page.id)} aria-current={page.id === currentPage?.id ? "page" : undefined}>{page.navigationLabel || page.title}{page.isHome ? " · Trang chủ" : ""}</button>
        {!page.isHome && <>
          <button type="button" className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-background disabled:opacity-30" aria-label={`Chuyển trang ${page.title} lên`} disabled={index === 0 || doc.pages[index - 1]?.isHome} onClick={() => reorderPage(index, -1)}><ChevronUp className="size-4" /></button>
          <button type="button" className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-background disabled:opacity-30" aria-label={`Chuyển trang ${page.title} xuống`} disabled={index === doc.pages.length - 1 || doc.pages[index + 1]?.isHome} onClick={() => reorderPage(index, 1)}><ChevronDown className="size-4" /></button>
          <Button size="sm" variant="ghost" className="min-h-11 text-destructive" onClick={() => removePage(page.id)}>Xóa</Button>
        </>}
      </div>)}
      {doc.pages.length < 8 && <div className="my-3 grid gap-2 border-b border-border pb-4"><input className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={pageName} onChange={event => { setPageName(event.target.value); if (!pageSlug) setPageSlug(event.target.value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} placeholder="Tên trang mới" aria-label="Tên trang mới" /><div className="flex gap-2"><input className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm" value={pageSlug} onChange={event => setPageSlug(event.target.value)} placeholder="duong-dan" aria-label="Đường dẫn trang mới" /><Button size="sm" disabled={!pageName.trim() || !pageSlug.trim()} onClick={addPage}>Thêm trang</Button></div></div>}
      <div className="mb-2 flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">CÁC PHẦN</p><Button type="button" size="sm" variant="outline" className="min-h-10" disabled={!currentPage || currentPage.sections.length >= 24 || doc.pages.reduce((total, page) => total + page.sections.length, 0) >= 80} onClick={openSectionLibrary}><Plus className="mr-1 size-3.5" />Thêm phần</Button></div>
      {currentPage?.sections.map((section, index) => <div key={section.id} className={`mb-1 flex items-center gap-1 rounded-lg border px-1 ${section.id === currentSection?.id ? "border-primary/40 bg-primary/5" : "border-transparent"}`}><button type="button" className="min-h-11 min-w-0 flex-1 truncate px-2 text-left text-sm" onClick={() => selectSection(section.id)} aria-current={section.id === currentSection?.id ? "true" : undefined}>{sectionNames[section.type]}{section.visible === false ? " · Đang ẩn" : ""}</button><button type="button" className="grid size-9 place-items-center rounded-md" aria-label={`Chuyển ${sectionNames[section.type]} lên`} disabled={index === 0 || section.type === "hero" || currentPage.sections[index - 1]?.type === "hero"} onClick={() => { const target = currentPage.sections[index - 1]; if (target) reorderSection(section.id, target.id); }}><ChevronUp className="size-4" /></button><button type="button" className="grid size-9 place-items-center rounded-md" aria-label={`Chuyển ${sectionNames[section.type]} xuống`} disabled={index === currentPage.sections.length - 1 || section.type === "hero"} onClick={() => { const target = currentPage.sections[index + 1]; if (target) reorderSection(section.id, target.id); }}><ChevronDown className="size-4" /></button><button type="button" className="grid size-9 place-items-center rounded-md" onClick={() => replaceSection(section.id, { visible: section.visible === false })} aria-label={section.visible === false ? `Hiện ${sectionNames[section.type]}` : `Ẩn ${sectionNames[section.type]}`}>{section.visible === false ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>)}
      <label className="mt-4 grid gap-1 text-xs text-muted-foreground">Kiểu điều hướng<select className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" value={doc.navigationMode} onChange={event => mutate(copy => { copy.navigationMode = event.target.value as StoryBuilderV4Document["navigationMode"]; })}>{doc.pages.length === 1 && <option value="one-page">Một trang</option>}{doc.pages.length >= 2 && <option value="multi-page">Nhiều trang</option>}<option value="hybrid">Kết hợp</option></select></label>
      </div> : <div className="min-h-0 flex-1 overflow-y-auto">{inspectorPanel}</div>}
    </section></div>}
    <WebsiteVersionHistoryDialog
      open={versionHistoryOpen}
      onClose={() => setVersionHistoryOpen(false)}
      weddingId={weddingId}
      currentVersion={version}
      restoreBlocked={dirty || conflict || offline || busy || recoveredRecovery || saveState === "saving"}
      restoreBlockedReason={conflict ? "Hãy xử lý nội dung xung đột trước khi khôi phục." : dirty || recoveredRecovery || saveState === "saving" ? "Hãy lưu xong các thay đổi hiện tại trước khi khôi phục phiên bản." : offline ? "Cần có kết nối mạng để khôi phục phiên bản." : busy ? "Đang có thao tác khác; hãy đợi hoàn tất." : ""}
      onRestored={applyRestoredWebsite}
    />
    <Modal open={identityPromptOpen} onClose={() => {}} title="Ai đang chỉnh website?" description="Tên hiển thị giúp cô dâu và chú rể nhận ra phiên đang xem hoặc sửa nội dung. Tên này chỉ dùng trong trình dựng.">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">{["Cô dâu", "Chú rể", "Người chỉnh sửa"].map(label => <Button key={label} type="button" variant={suggestedDisplayName === label ? "default" : "outline"} className="min-h-11 px-2 text-xs sm:text-sm" onClick={() => chooseDisplayName(label)}><UserRound className="mr-1.5 size-4" />{label}</Button>)}</div>
        <label className="grid gap-1.5 text-sm">Tên khác<input autoFocus className="h-11 rounded-lg border border-input bg-background px-3" value={customDisplayName} maxLength={40} placeholder="Ví dụ: Minh" onChange={event => setCustomDisplayName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") chooseDisplayName(customDisplayName); }} /></label>
        <Button type="button" className="w-full" disabled={!customDisplayName.trim()} onClick={() => chooseDisplayName(customDisplayName)}>Tiếp tục với tên này</Button>
        <p className="text-xs leading-5 text-muted-foreground">Nội dung khôi phục chỉ lưu trên thiết bị này tối đa 24 giờ; không chứa thông tin đăng nhập.</p>
        {recoveredRecovery && <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => void clearLocalRecovery()}>Xóa bản khôi phục khỏi thiết bị này</Button>}
      </div>
    </Modal>
    <Modal open={sectionLibraryOpen} onClose={() => setSectionLibraryOpen(false)} title="Thêm phần vào website" description="Chọn nội dung, xem thử bố cục rồi thêm ngay sau phần đang chọn.">
      <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.15fr)]">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nội dung</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {sectionTypes.filter(type => type !== "hero" || !currentPage?.sections.some(section => section.type === "hero")).map((type, index) => <button key={type} type="button" aria-pressed={sectionLibraryType === type} onClick={() => { setSectionLibraryType(type); setSectionLibraryVariant(variantOptions[type][0] ?? "default"); }} className={`min-h-[66px] rounded-xl border p-3 text-left transition ${sectionLibraryType === type ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border hover:border-primary/30 hover:bg-muted/40"}`}>
              <span className="flex items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{String(index + 1).padStart(2, "0")}</span><span className="font-medium">{sectionNames[type]}</span></span>
              <span className="mt-1 block pl-8 text-xs leading-5 text-muted-foreground">{sectionDescriptions[type]}</span>
            </button>)}
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Xem thử</p><h3 className="mt-1 font-display text-lg">{sectionNames[sectionLibraryType]}</h3></div><span className="text-xs text-muted-foreground">Trang: {currentPage?.title ?? "Trang hiện tại"}</span></div>
          <div className="h-[300px] overflow-auto rounded-xl border border-border bg-[#f1eeed] p-3 sm:h-[340px]">
            <div className="mx-auto min-h-full max-w-[520px] overflow-hidden rounded-lg bg-background shadow-sm">{sectionLibraryPreviewDocument && <StoryBuilderV4Renderer document={sectionLibraryPreviewDocument} pagePath={currentPage?.slug} />}</div>
          </div>
          <fieldset><legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kiểu bố cục</legend><div className="flex flex-wrap gap-2">{variantOptions[sectionLibraryType].map(variant => <button key={variant} type="button" aria-pressed={sectionLibraryVariant === variant} onClick={() => setSectionLibraryVariant(variant)} className={`min-h-10 rounded-full border px-3 text-xs ${sectionLibraryVariant === variant ? "border-primary bg-primary/10 font-semibold text-primary-hover" : "border-border text-muted-foreground hover:border-primary/40"}`}>{variantNames[variant] ?? variant}</button>)}</div></fieldset>
        </div>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Phần mới được thêm sau phần đang chọn và tự lưu như các chỉnh sửa khác.</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setSectionLibraryOpen(false)}>Hủy</Button><Button type="button" disabled={!currentPage || (currentPage?.sections.length ?? 24) >= 24 || doc.pages.reduce((total, page) => total + page.sections.length, 0) >= 80} onClick={() => { if (addSection(sectionLibraryType, sectionLibraryVariant)) setSectionLibraryOpen(false); }}><Plus className="mr-1.5 size-4" />Thêm {sectionNames[sectionLibraryType]}</Button></div></div>
    </Modal>
    <Modal open={publishReviewOpen} onClose={() => setPublishReviewOpen(false)} title={status === "PUBLISHED" ? "Kiểm tra trước khi xuất bản lại" : "Kiểm tra trước khi xuất bản"} description="Xem lại nội dung website. Bản công khai chỉ thay đổi sau khi bạn xác nhận và máy chủ hoàn tất xuất bản.">
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <PublishCheckItem ok={publishIssues.length === 0} title="Cấu trúc và nội dung" detail={publishIssues.length === 0 ? "Không phát hiện lỗi cần chặn xuất bản." : `${publishIssues.length} vị trí cần kiểm tra.`} />
          <PublishCheckItem ok={!dirty && saveState === "saved" && !conflict} title="Bản nháp đã lưu" detail={conflict ? "Có phiên bản mới hơn; hãy tải lại trước." : dirty ? "Còn thay đổi chưa lưu. Khi xác nhận, hệ thống sẽ lưu bản nháp rồi mới xuất bản." : saveState !== "saved" ? "Đang lưu bản nháp; đợi hoàn tất rồi xác nhận." : `Phiên bản ${version} đã được lưu.`} />
        </div>
        {publishIssues.length > 0 && <section aria-labelledby="publish-errors-title" className="rounded-xl border border-destructive/25 bg-destructive/[0.04] p-4">
          <h3 id="publish-errors-title" className="font-semibold text-destructive">Cần sửa trước khi xuất bản</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {publishIssues.slice(0, 8).map((issue, index) => {
              const pagePathIndex = issue.path.indexOf("pages");
              const pagePosition = pagePathIndex >= 0 ? issue.path[pagePathIndex + 1] : undefined;
              const hasPage = typeof pagePosition === "number" && Boolean(doc.pages[pagePosition]);
              const message = describeV4ValidationIssues([issue], doc);
              return <li key={`${issue.path.join(".")}-${index}`}>{hasPage ? <button type="button" className="min-h-10 text-left text-destructive underline decoration-destructive/40 underline-offset-2 hover:decoration-destructive" onClick={() => jumpToPublishIssue(issue)}>{message} · Đi tới phần cần sửa</button> : <span className="block py-1 text-destructive">{message}</span>}</li>;
            })}
            {publishIssues.length > 8 && <li className="pt-1 text-xs text-muted-foreground">Còn {publishIssues.length - 8} lỗi khác; danh sách đầy đủ sẽ hiện trong trình chỉnh sửa.</li>}
          </ul>
        </section>}
        {(hiddenPages.length > 0 || hiddenSections.length > 0) && <section className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">Một số nội dung sẽ không xuất hiện công khai</h3>
          <p className="mt-1 leading-6">{hiddenPages.length > 0 && `${hiddenPages.length} trang đang ẩn`}{hiddenPages.length > 0 && hiddenSections.length > 0 ? " · " : ""}{hiddenSections.length > 0 && `${hiddenSections.length} phần đang ẩn`}. Đây là cảnh báo để bạn rà soát; không tự bật lại nội dung.</p>
          <details className="mt-2"><summary className="min-h-10 cursor-pointer py-2 font-medium underline underline-offset-2">Xem nội dung đang ẩn</summary><ul className="space-y-1 pl-4">
            {hiddenPages.map(page => <li key={`page-${page.id}`}><button type="button" className="min-h-10 text-left underline underline-offset-2" onClick={() => jumpToHiddenSection(page.id)}>Trang · {page.title} — mở để kiểm tra</button></li>)}
            {hiddenSections.map(section => <li key={`section-${section.sectionId}`}><button type="button" className="min-h-10 text-left underline underline-offset-2" onClick={() => jumpToHiddenSection(section.pageId, section.sectionId)}>{section.page} · {section.section} — mở để bật lại</button></li>)}
          </ul></details>
        </section>}
        {missingGalleryDescriptions.length > 0 && <section className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">Album có ảnh chưa được mô tả</h3>
          <p className="mt-1 leading-6">{missingGalleryDescriptions.length} ảnh chưa có mô tả thay thế. Mô tả giúp khách dùng trình đọc màn hình hiểu nội dung ảnh; bạn vẫn có thể xuất bản mà không cần điền.</p>
          <details className="mt-2"><summary className="min-h-10 cursor-pointer py-2 font-medium underline underline-offset-2">Xem ảnh cần mô tả</summary><ul className="space-y-1 pl-4">
            {missingGalleryDescriptions.slice(0, 20).map((image, index) => <li key={`${image.sectionId}-${image.imageIndex}-${index}`}><button type="button" className="min-h-10 text-left underline underline-offset-2" onClick={() => jumpToHiddenSection(image.pageId, image.sectionId)}>{image.page} · Ảnh {image.imageIndex} — mở album để bổ sung mô tả</button></li>)}
            {missingGalleryDescriptions.length > 20 && <li className="py-1 text-xs">Còn {missingGalleryDescriptions.length - 20} ảnh khác.</li>}
          </ul></details>
        </section>}
        {needsRsvp && <section className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">Chưa có phần xác nhận tham dự</h3>
          <p className="mt-1 leading-6">Khách vẫn có thể xem website, nhưng chưa có lối tắt RSVP trên trang. Bạn có thể thêm phần này trước khi xuất bản.</p>
          <button type="button" className="mt-2 min-h-10 rounded-lg px-2 font-medium underline underline-offset-2" onClick={() => { const type: SectionType = "rsvp"; setSectionLibraryType(type); setSectionLibraryVariant("default"); setPublishReviewOpen(false); setSectionLibraryOpen(true); }}>Thêm phần RSVP</button>
        </section>}
        {eventSectionsNeedingDetails.length > 0 && <section className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">Kiểm tra thông tin sự kiện</h3>
          <p className="mt-1 leading-6">Một phần sự kiện chưa có đủ ngày giờ hoặc địa điểm. Hãy rà soát để khách biết chính xác nơi và thời gian diễn ra.</p>
          <ul className="mt-2 space-y-1">{eventSectionsNeedingDetails.slice(0, 5).map(({ page, section }) => <li key={section.id}><button type="button" className="min-h-10 text-left underline underline-offset-2" onClick={() => jumpToHiddenSection(page.id, section.id)}>{page.title} · Mở phần sự kiện</button></li>)}</ul>
        </section>}
        {!hasShareImage && <section className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">Chưa có ảnh xem trước khi chia sẻ</h3>
          <p className="mt-1 leading-6">Bạn vẫn có thể xuất bản. Thêm ảnh để đường dẫn trông đầy đủ hơn khi gửi qua mạng xã hội hoặc ứng dụng chat.</p>
          <button type="button" className="mt-2 min-h-10 rounded-lg px-2 font-medium underline underline-offset-2" onClick={() => { setPublishReviewOpen(false); setShareSettingsOpen(true); }}>Thiết lập ảnh chia sẻ</button>
        </section>}
        {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[0.04] p-3 text-sm text-destructive">{error}</p>}
        {!publishCanProceed && publishIssues.length === 0 && <p role="status" className="text-sm text-muted-foreground">{busy ? "Đang xử lý; vui lòng đợi." : !isOwner ? "Chỉ chủ tiệc mới có quyền xuất bản website." : conflict ? "Tải phiên bản mới nhất để tiếp tục." : premiumLocked ? "Gói hiện tại chưa hỗ trợ mẫu này." : premiumUnknown ? "Chưa xác minh được quyền dùng mẫu Premium." : "Chưa thể xuất bản ở trạng thái hiện tại."}</p>}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => { setPublishReviewOpen(false); setPreview(true); }}><Eye className="mr-2 size-4" />Xem trước</Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="ghost" onClick={() => setPublishReviewOpen(false)}>Quay lại chỉnh sửa</Button><Button type="button" disabled={!publishCanProceed} onClick={() => void publish()}>{busy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}{status === "PUBLISHED" ? "Xác nhận xuất bản lại" : "Xác nhận xuất bản"}</Button></div>
        </div>
      </div>
    </Modal>
    <Modal open={shareSettingsOpen} onClose={() => setShareSettingsOpen(false)} title="Chia sẻ & SEO" description="Thiết lập tiêu đề, mô tả và ảnh đại diện khi gửi đường dẫn website. Thay đổi được tự lưu cùng bản nháp.">
      <div className="space-y-4">
        <Field label="Tiêu đề khi chia sẻ" value={doc.seo?.title ?? ""} maxLength={70} placeholder={`${setup.name} · Thiệp cưới`} error={showFieldErrors && doc.seo?.title && doc.seo.title.length > 70 ? "Tối đa 70 ký tự." : undefined} onChange={value => editSeo("title", value)} />
        <p className="-mt-3 text-right text-xs text-muted-foreground">{(doc.seo?.title ?? "").length}/70</p>
        <Field label="Mô tả ngắn" value={doc.seo?.description ?? ""} maxLength={200} multiline placeholder="Một lời giới thiệu ngắn về ngày vui của hai bạn." error={showFieldErrors && doc.seo?.description && doc.seo.description.length > 200 ? "Tối đa 200 ký tự." : undefined} onChange={value => editSeo("description", value)} />
        <p className="-mt-3 text-right text-xs text-muted-foreground">{(doc.seo?.description ?? "").length}/200</p>
        <ImageField label="Ảnh xem trước khi chia sẻ" value={doc.seo?.imageUrl ?? ""} onChange={value => editSeo("imageUrl", value)} onUpload={uploadImage} onChooseMedia={openMediaPicker} />
        <section aria-label="Xem trước thẻ chia sẻ" className="overflow-hidden rounded-xl border border-border bg-muted/20">
          {doc.seo?.imageUrl ? <div className="relative aspect-[1.91/1] bg-muted"><Image src={mediaUrl(doc.seo.imageUrl) ?? doc.seo.imageUrl} alt="" fill sizes="(max-width: 640px) 100vw, 520px" unoptimized className="object-cover" /></div> : <div className="grid aspect-[1.91/1] place-items-center bg-primary/5 text-primary"><ImageIcon className="size-8" /></div>}
          <div className="space-y-1 p-3"><p className="truncate text-xs text-muted-foreground">{setup.slug ? `inviteme.asia/wedding/${setup.slug}` : "Đường dẫn website sẽ hiển thị sau khi tạo slug"}</p><p className="line-clamp-1 font-semibold">{doc.seo?.title || setup.name || "Thiệp cưới InviteMe"}</p><p className="line-clamp-2 text-sm text-muted-foreground">{doc.seo?.description || "Lưu giữ những khoảnh khắc đẹp và chia sẻ ngày vui với khách mời."}</p></div>
        </section>
        <p aria-live="polite" className="text-xs text-muted-foreground">{dirty ? "Thay đổi đang được tự động lưu trước khi xuất bản." : "Thông tin chia sẻ hiện đã lưu trong bản nháp."}</p>
        <div className="flex justify-end border-t border-border pt-3"><Button type="button" onClick={() => setShareSettingsOpen(false)}>Hoàn tất</Button></div>
      </div>
    </Modal>
    <Modal open={mediaPickerOpen && !mediaDeleteTarget} onClose={() => { setMediaPickerOpen(false); setMediaPickerTarget(null); }} title="Thư viện ảnh cưới" description="Chọn ảnh cho website hoặc xóa ảnh không còn được sử dụng.">
      <div className="space-y-4">
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={mediaSearch} onChange={event => setMediaSearch(event.target.value)} placeholder="Tìm theo tên ảnh hoặc đường dẫn" aria-label="Tìm ảnh trong thư viện" /></label>
        {mediaLibrary.isPending && <LoadingState label="Đang tải thư viện ảnh…" />}
        {mediaLibrary.isError && <ErrorState error={mediaLibrary.error} retry={() => void mediaLibrary.refetch()} />}
        {mediaLibrary.data && (() => {
          const assets = mediaLibrary.data.filter(asset => `${asset.id} ${asset.url}`.toLocaleLowerCase().includes(mediaSearch.toLocaleLowerCase()));
          return assets.length ? <div className="grid max-h-[55dvh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">{assets.map(asset => <div key={asset.id} className="group relative overflow-hidden rounded-xl border border-border transition hover:border-primary hover:ring-2 hover:ring-primary/20"><button type="button" className="block w-full text-left" onClick={() => { mediaPickerTarget?.(asset.url); setMediaPickerTarget(null); setMediaPickerOpen(false); }}><div className="relative aspect-square bg-muted"><Image src={mediaUrl(asset.url) ?? asset.url} alt="" fill sizes="(max-width: 640px) 50vw, 180px" unoptimized className="object-cover transition group-hover:scale-[1.02]" /></div><span className="block truncate px-2.5 py-2 pr-11 text-xs text-muted-foreground">Chọn ảnh · {asset.id}</span></button><button type="button" aria-label={`Xóa ảnh ${asset.id} khỏi thư viện`} title="Xóa khỏi thư viện" className="absolute bottom-1.5 right-1.5 grid size-8 place-items-center rounded-lg border border-border bg-background/95 text-destructive shadow-sm transition hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setMediaDeleteError(""); setMediaDeleteTarget(asset); }}><Trash2 className="size-4" /></button></div>)}</div> : <div className="rounded-xl border border-dashed border-border p-6 text-center"><ImageIcon className="mx-auto size-6 text-muted-foreground" /><p className="mt-2 text-sm font-medium">{mediaSearch ? "Không tìm thấy ảnh phù hợp" : "Thư viện chưa có ảnh"}</p><p className="mt-1 text-xs text-muted-foreground">Tải ảnh từ phần chỉnh sửa để ảnh xuất hiện tại đây.</p></div>;
        })()}
      </div>
    </Modal>
    <Modal open={Boolean(mediaDeleteTarget)} onClose={() => { if (!mediaDeleteBusy) { setMediaDeleteTarget(null); setMediaDeleteError(""); } }} title="Xóa ảnh khỏi thư viện?" description="Ảnh bị xóa sẽ không thể chọn lại. Ảnh đang được dùng trong Wedding Setup, website hoặc thiệp mời sẽ được giữ lại.">
      <div className="space-y-4">
        {mediaDeleteTarget && <div className="flex items-center gap-3 rounded-xl border border-border p-3"><div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted"><Image src={mediaUrl(mediaDeleteTarget.url) ?? mediaDeleteTarget.url} alt="" fill sizes="64px" unoptimized className="object-cover" /></div><p className="min-w-0 break-all text-xs text-muted-foreground">{mediaDeleteTarget.id}</p></div>}
        {mediaDeleteError && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/[0.04] p-3 text-sm text-destructive">{mediaDeleteError}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={mediaDeleteBusy} onClick={() => { setMediaDeleteTarget(null); setMediaDeleteError(""); }}>Hủy</Button><Button type="button" variant="destructive" disabled={mediaDeleteBusy || !mediaDeleteTarget} onClick={() => void confirmMediaDelete()}>{mediaDeleteBusy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}{mediaDeleteBusy ? "Đang xóa…" : "Xóa khỏi thư viện"}</Button></div>
      </div>
    </Modal>
    {premiumLocked && <div className="border-t border-primary/20 bg-primary/5 p-3"><FeatureLimitNotice title="Mẫu này cần gói hỗ trợ Premium" description="Website đã xuất bản vẫn hoạt động. Hãy nâng cấp gói để lưu hoặc xuất bản thay đổi cho mẫu Premium." upgradeHref={`/weddings/${encodeURIComponent(weddingId)}/plan`} upgradeLabel="Xem các gói" /></div>}
    {premiumUnknown && <div className="border-t border-border p-3"><FeatureLimitNotice title="Chưa xác minh được quyền dùng mẫu Premium" description="Thử lại kiểm tra gói trước khi lưu hoặc xuất bản. Website đang công khai vẫn được giữ nguyên." status="unavailable" variant="compact" retryLabel="Thử lại" onRetry={() => void sitePlan.refetch()} /></div>}
    {sitePlan.isError && !premiumUnknown && <p className="border-t border-border px-3 py-1 text-xs text-muted-foreground">Không thể kiểm tra quyền lợi gói. Website đã xuất bản vẫn giữ nguyên.</p>}
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
    queryFn: () => selected ? getWebsiteVersion(api, weddingId, selected.id) : Promise.reject(new Error("Chưa chọn phiên bản website.")),
    enabled: open && Boolean(selected?.id),
  });
  const detail = detailQuery.data;
  const canRestore = Boolean(detail && isStoryBuilderV4Document(detail.document) && !restoreBlocked && !restoring);
  const kindLabels: Record<WebsiteVersion["kind"], string> = {
    BASELINE: "Bản nền",
    AUTO_SAVE: "Bản tự lưu",
    PUBLISHED: "Lúc xuất bản",
    RESTORED: "Bản đã khôi phục",
  };
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
      setRestoreError(errText(cause));
      await cache.invalidateQueries({ queryKey: ["website", weddingId, "versions"] });
    } finally { setRestoring(false); }
  }
  return <Modal open={open} onClose={() => { if (!restoring) { setConfirming(false); setRestoreError(""); onClose(); } }} title="Lịch sử phiên bản" description="Xem các mốc đã lưu và khôi phục bản nháp khi cần. Mỗi đám cưới giữ tối đa 20 phiên bản; khôi phục không tự xuất bản website." size="wide">
    <div className="grid min-h-[min(68dvh,680px)] gap-3 lg:grid-cols-[minmax(250px,0.34fr)_minmax(0,1fr)]">
      <section aria-label="Danh sách phiên bản" className="min-h-0 overflow-hidden rounded-xl border border-border bg-background">
        <div className="border-b border-border px-4 py-3"><h3 className="text-sm font-semibold">Các lần lưu gần đây</h3><p className="mt-1 text-xs text-muted-foreground">Tối đa 20 mốc cho đám cưới này</p></div>
        <div className="max-h-[30dvh] divide-y divide-border overflow-y-auto lg:max-h-[60dvh]">
          {versionsQuery.isPending && <p className="p-4 text-sm text-muted-foreground">Đang tải lịch sử…</p>}
          {versionsQuery.isError && <div className="p-4"><p role="alert" className="text-sm text-destructive">{errText(versionsQuery.error)}</p><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void versionsQuery.refetch()}>Thử tải lại</Button></div>}
          {versionsQuery.isSuccess && versions?.length === 0 && <p className="p-4 text-sm leading-6 text-muted-foreground">Chưa có phiên bản nào. Website sẽ tạo mốc đầu tiên khi bạn lưu thay đổi hoặc xuất bản.</p>}
          {versions?.map((item, index) => <button key={item.id} type="button" aria-current={item.id === selected?.id ? "true" : undefined} onClick={() => { setSelectedId(item.id); setConfirming(false); setRestoreError(""); }} className={`block min-h-[76px] w-full px-4 py-3 text-left transition hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${item.id === selected?.id ? "bg-primary/[0.07]" : ""}`}>
            <span className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{kindLabels[item.kind]}</span>{index === 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary-hover">Mới nhất</span>}</span>
            <span className="mt-1 block text-xs text-muted-foreground">Phiên bản {item.version} · {new Date(item.createdAt).toLocaleString("vi-VN")}</span>
          </button>)}
        </div>
      </section>
      <section aria-label="Xem trước phiên bản" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-muted/30">
        {!selected && <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">Chọn một phiên bản để xem trước.</div>}
        {selected && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-4 py-3"><div><p className="text-sm font-semibold">{kindLabels[selected.kind]} · phiên bản {selected.version}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(selected.createdAt).toLocaleString("vi-VN")}</p></div><History className="size-4 text-primary" aria-hidden="true" /></div>}
        {detailQuery.isPending && selected && <div className="grid min-h-[260px] flex-1 place-items-center text-sm text-muted-foreground">Đang tải bản xem trước…</div>}
        {detailQuery.isError && selected && <div className="grid min-h-[260px] flex-1 place-items-center p-5 text-center"><div><p role="alert" className="text-sm text-destructive">{errText(detailQuery.error)}</p><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void detailQuery.refetch()}>Thử lại</Button></div></div>}
        {detail && isStoryBuilderV4Document(detail.document) && <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4"><div className="mx-auto min-h-full max-w-[900px] overflow-hidden rounded-xl border border-border bg-background shadow-sm"><div className="pointer-events-none"><StoryBuilderV4Renderer document={detail.document} /></div></div></div>}
        {detail && !isStoryBuilderV4Document(detail.document) && <div className="grid min-h-[260px] flex-1 place-items-center p-6 text-center"><div><History className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Bản lưu cũ không có xem trước V4</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Phiên bản này dùng cấu trúc website cũ. Có thể xem thông tin mốc lưu, nhưng không thể khôi phục từ trình dựng V4.</p></div></div>}
        <div className="shrink-0 space-y-3 border-t border-border bg-background p-3 sm:px-4">
          {restoreBlocked && selected && <p className="text-xs leading-5 text-amber-800">{restoreBlockedReason}</p>}
          {restoreError && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/[0.04] p-2.5 text-xs text-destructive">{restoreError}</p>}
          {confirming && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">Bản này sẽ thay thế bản nháp hiện tại. Bản website đang công khai được giữ nguyên; bạn có thể kiểm tra rồi xuất bản lại sau.</div>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] leading-4 text-muted-foreground">Khôi phục sẽ ghi nhận một phiên bản mới để bạn có thể quay lại.</p><div className="flex gap-2 sm:justify-end">{confirming && <Button type="button" variant="outline" disabled={restoring} onClick={() => setConfirming(false)}>Hủy</Button>}<Button type="button" disabled={!canRestore} title={restoreBlocked ? restoreBlockedReason : undefined} onClick={() => confirming ? void restore() : setConfirming(true)}>{restoring ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <History className="mr-2 size-4" />}{restoring ? "Đang khôi phục…" : confirming ? "Xác nhận khôi phục" : "Khôi phục bản nháp"}</Button></div></div>
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
    { id: "rsvp", label: "Xác nhận tham dự", unavailable: "Thêm một phần RSVP đang hiển thị để bật." },
    { id: "calendar", label: "Thêm vào lịch", unavailable: "Cần phần sự kiện có ngày giờ hợp lệ." },
    { id: "gift", label: "Quà mừng", unavailable: "Bật thông tin quà và hiển thị phần Quà mừng." },
    { id: "wishes", label: "Gửi lời chúc", unavailable: "Thêm một phần Lời chúc đang hiển thị để bật." },
    { id: "share", label: "Chia sẻ website", unavailable: "" },
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
  return <div className="min-h-[300px]">
    <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3"><p className="text-xs text-muted-foreground">CÀI ĐẶT WEBSITE</p><h2 className="mt-1 text-sm font-semibold">Trải nghiệm khách mời</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Chọn lối tắt và hiệu ứng cho khách. Thay đổi xem được ngay trong bản xem trước và tự lưu cùng website.</p></div>
    <div className="space-y-6 p-4">
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">Nút tiện ích</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Tối đa 4 nút. Chỉ hiện nút có chức năng tương ứng trên website.</p></div><span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{settings.tools.length}/4</span></div>
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
              {checked && <div className="flex shrink-0 gap-1"><button type="button" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Đưa ${option.label} lên`} disabled={selectedIndex <= 0} onClick={() => moveTool(selectedIndex, -1)}><ChevronUp className="size-4" /></button><button type="button" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label={`Đưa ${option.label} xuống`} disabled={selectedIndex === settings.tools.length - 1} onClick={() => moveTool(selectedIndex, 1)}><ChevronDown className="size-4" /></button></div>}
            </div>;
          })}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Trên điện thoại, nút nằm ở cạnh dưới và chừa vùng an toàn màn hình. RSVP sẽ giữ liên kết thiệp cá nhân; chia sẻ loại bỏ mã khách khỏi đường dẫn.</p>
      </section>
      <section className="space-y-3 border-t border-border pt-5">
        <div><h3 className="text-sm font-semibold">Hiệu ứng trang trí</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Dùng màu của mẫu, không chặn thao tác; khi bật giảm chuyển động, hiệu ứng sẽ chuyển thành trang trí tĩnh.</p></div>
        <label className="grid gap-1 text-xs text-muted-foreground">Hiệu ứng
          <select className={inputClass} value={settings.decoration} onChange={event => onChange({ ...settings, decoration: event.target.value as GuestExperienceSettings["decoration"] })}>
            <option value="none">Không hiệu ứng</option><option value="petals">Cánh hoa rơi</option><option value="sparkles">Ánh sáng lấp lánh nhẹ</option><option value="hearts">Trái tim bay nhẹ</option><option value="fireflies">Đom đóm phát sáng</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">Mức độ
          <select className={inputClass} disabled={settings.decoration === "none"} value={settings.intensity} onChange={event => onChange({ ...settings, intensity: event.target.value as GuestExperienceSettings["intensity"] })}>
            <option value="light">Nhẹ</option><option value="medium">Vừa</option><option value="vivid">Nổi bật</option>
          </select>
        </label>
        {settings.decoration !== "none" && <div className="space-y-2 rounded-xl border border-border bg-muted/25 p-3">
          <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-foreground">Xem thử hiệu ứng</p><span className="text-[11px] text-muted-foreground">Cập nhật trực tiếp trên website</span></div>
          <div className="relative isolate h-24 overflow-hidden rounded-lg border border-primary/20" style={previewStyle}>
            <div aria-hidden="true" className="absolute inset-0 overflow-hidden" data-effect={settings.decoration} data-intensity={settings.intensity}>
              {Array.from({ length: settings.intensity === "vivid" ? 14 : settings.intensity === "medium" ? 10 : 7 }, (_, index) => <span key={index} className={`inviteme-decoration-preview__particle inviteme-decoration-preview__particle--${settings.decoration}`} style={{ "--particle-x": `${(index * 37 + 9) % 96}%`, "--particle-y": `${(index * 31 + 8) % 78}%`, "--particle-delay": `${(index * 0.57) % 3}s`, "--particle-duration": `${3.6 + index % 4}s`, "--particle-scale": `${0.8 + (index % 4) * 0.15}`, "--particle-drift": `${((index * 13) % 38) - 19}px` } as CSSProperties} />)}
            </div>
            <div className="absolute inset-0 -z-[1] bg-[radial-gradient(ellipse_at_50%_120%,color-mix(in_srgb,var(--site-primary)_18%,transparent),transparent_68%),var(--site-background)]" />
            <div className="absolute inset-x-4 bottom-3 z-[1] text-center"><span className="font-serif text-sm" style={{ color: "var(--site-text)" }}>Ngày vui của chúng mình</span><span className="mx-auto mt-1 block h-px w-12" style={{ backgroundColor: "var(--site-accent)" }} /></div>
          </div>
        </div>}
      </section>
    </div>
  </div>;
}

function Inspector({ section, page, sectionName, onSection, onContent, onNested, onAppendGalleryImages, onUpload, onChooseMedia, setup, onBinding, onDuplicate, onDelete, pageChange, pageDelete, appearance, paletteId, template, onAppearance, gift, onGift, issues, pageIndex, sectionIndex, weddingId, selectedEventIds, onEventIds }: {
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
  gift?: StoryBuilderV4Document["content"]["gift"]; onGift: (patch: Partial<NonNullable<StoryBuilderV4Document["content"]["gift"]>>) => void;
  issues: readonly BuilderIssue[]; pageIndex: number; sectionIndex: number;
  weddingId: string; selectedEventIds: string[]; onEventIds: (ids: string[]) => void;
}) {
  const content = record(section?.content); const [tab, setTab] = useState<"content" | "style">("content");
  const [batchUploading, setBatchUploading] = useState(false); const [batchStatus, setBatchStatus] = useState("");
  if (!section) return <div className="p-5 text-sm text-muted-foreground">Chọn một phần trên canvas hoặc trong danh sách để chỉnh nội dung.</div>;
  const errorAt = (path: readonly PropertyKey[]) => {
    const issue = issues.find(item => item.path.length === path.length && path.every((part, index) => item.path[index] === part));
    return issue ? describeV4Issue(issue) : undefined;
  };
  const sectionPath = ["pages", pageIndex, "sections", sectionIndex] as const;
  const contentError = (key: string, ...nested: (string | number)[]) => errorAt([...sectionPath, "content", key, ...nested]);
  const field = (label: string, key: string, placeholder = "", multiline = false) => <Field label={label} presencePath={builderFieldPath(section.id, section.type, "content", key)} value={String(content[key] ?? "")} placeholder={placeholder} multiline={multiline} error={contentError(key)} onChange={value => onContent(key, value)} />;
  const inputClass = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const availableBindings = setupBindings[section.type] ?? [];
  const bindings = section.bindings ?? [];
  const list = (key: "items" | "images" | "events" | "groom" | "bride") => Array.isArray(content[key]) ? content[key] as Record<string, unknown>[] : [];
  async function uploadGalleryBatch(files: File[]) {
    const remaining = Math.max(0, 30 - list("images").length);
    const selected = files.slice(0, remaining);
    if (!selected.length) { setBatchStatus("Album đã đạt tối đa 30 ảnh."); return; }
    setBatchUploading(true);
    setBatchStatus(selected.length < files.length ? `Chỉ nhận ${selected.length} ảnh để không vượt giới hạn 30 ảnh.` : "");
    const added: Record<string, unknown>[] = [];
    let failed = false;
    for (const [index, file] of selected.entries()) {
      setBatchStatus(`Đang tải ảnh ${index + 1}/${selected.length}: ${file.name}`);
      const url = await onUpload(file);
      if (!url) { failed = true; break; }
      added.push({ id: id(), imageUrl: url, alt: file.name });
    }
    const appended = added.length ? onAppendGalleryImages(added) : 0;
    const capped = appended < added.length;
    setBatchStatus(failed ? `Đã thêm ${appended} ảnh. Một ảnh tải lỗi; bạn có thể chọn lại ảnh đó.` : capped ? `Đã thêm ${appended} ảnh. Album vừa đạt giới hạn 30 ảnh.` : `Đã thêm ${appended} ảnh vào album.`);
    setBatchUploading(false);
  }
  return <div className="min-h-[300px]">
    <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3"><p className="text-xs text-muted-foreground">ĐANG CHỈNH SỬA</p><h2 className="mt-1 text-sm font-semibold">{sectionName}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{sectionDescriptions[section.type]}</p>{errorAt(sectionPath) && <p role="alert" className="mt-2 text-xs font-medium text-destructive">{errorAt(sectionPath)}</p>}</div>
    <div className="flex border-b border-border px-4" role="group" aria-label={`Chỉnh ${sectionName}`}><button type="button" aria-pressed={tab === "content"} className={`border-b-2 px-3 py-2.5 text-sm ${tab === "content" ? "border-primary text-primary-hover" : "border-transparent text-muted-foreground"}`} onClick={() => setTab("content")}>Nội dung</button><button type="button" aria-pressed={tab === "style"} className={`border-b-2 px-3 py-2.5 text-sm ${tab === "style" ? "border-primary text-primary-hover" : "border-transparent text-muted-foreground"}`} onClick={() => setTab("style")}>Kiểu hiển thị</button></div>
    <div className="space-y-5 p-4">
      {page && tab === "content" && <details className="border-b border-border pb-4" open={issues.some(issue => issue.path[0] === "pages" && issue.path[1] === pageIndex && issue.path[2] !== "sections")}>
        <summary className="min-h-10 cursor-pointer py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cài đặt trang · {page.title}</summary>
        <div className="mt-3 space-y-3">
          <Field label="Tên trang" presencePath={builderFieldPath(page.id, "page", "title")} value={page.title} error={errorAt(["pages", pageIndex, "title"])} onChange={value => pageChange({ title: value, navigationLabel: page.navigationLabel || value })} />
          <Field label="Nhãn điều hướng" presencePath={builderFieldPath(page.id, "page", "navigationLabel")} value={page.navigationLabel ?? page.title} error={errorAt(["pages", pageIndex, "navigationLabel"])} onChange={value => pageChange({ navigationLabel: value })} />
          {page.isHome ? <p className="text-xs text-muted-foreground">Trang chủ dùng đường dẫn gốc của website.</p> : <Field label="Đường dẫn" presencePath={builderFieldPath(page.id, "page", "slug")} value={page.slug} placeholder="our-story" error={errorAt(["pages", pageIndex, "slug"])} onChange={value => pageChange({ slug: value.toLocaleLowerCase() })} />}
          <label className="flex min-h-10 items-center justify-between text-sm">Hiển thị trang<input type="checkbox" checked={page.visible !== false} onChange={event => pageChange({ visible: event.target.checked })} /></label>
          {errorAt(["pages", pageIndex, "visible"]) && <p className="text-xs text-destructive">{errorAt(["pages", pageIndex, "visible"])}</p>}
          {errorAt(["pages", pageIndex, "sections"]) && <p className="text-xs text-destructive">{errorAt(["pages", pageIndex, "sections"])}</p>}
          {!page.isHome && <Button size="sm" variant="outline" className="text-destructive" onClick={pageDelete}><Trash2 className="mr-1.5 size-3.5" />Xóa trang</Button>}
        </div>
      </details>}
      {tab === "content" ? <>
        <Field label="Tiêu đề điều hướng" value={section.navigationLabel ?? ""} error={errorAt([...sectionPath, "navigationLabel"])} onChange={value => onSection({ navigationLabel: value })} placeholder={sectionName} />
        {section.type === "hero" && <>{field("Tiêu đề lớn", "title", "Tên hai bạn hoặc tên đám cưới")}{field("Lời dẫn", "subtitle", "Lời mời ngắn")}{field("Nhãn nút chính", "ctaLabel", "Ví dụ: Xem lịch trình")}{field("Dòng nhấn", "eyebrow", "")}
          <ImageField label="Ảnh bìa" presencePath={builderFieldPath(section.id, "hero", "content", "imageUrl")} value={String(content.imageUrl ?? "")} placeholder="Dán liên kết ảnh hoặc tải từ thiết bị" error={contentError("imageUrl")} onChange={value => onContent("imageUrl", value)} onUpload={onUpload} onChooseMedia={onChooseMedia} />
        </>}
        {section.type === "couple" && <>{field("Giới thiệu", "intro", "", true)}{(["groom", "bride"] as const).map((personKey, index) => { const person = record(content[personKey]); const personPath = (key: string) => builderFieldPath(section.id, "couple", personKey, key); return <fieldset key={personKey} className="space-y-3 border-t border-border pt-4"><legend className="px-1 text-xs font-semibold text-muted-foreground">{index === 0 ? "Chú rể" : "Cô dâu"}</legend><Field label="Tên hiển thị" presencePath={personPath("displayName")} value={String(person.displayName ?? person.fullName ?? "")} error={contentError(personKey, "displayName")} onChange={value => onNested(personKey, "displayName", value)} /><Field label="Giới thiệu" presencePath={personPath("bio")} value={String(person.bio ?? "")} multiline error={contentError(personKey, "bio")} onChange={value => onNested(personKey, "bio", value)} /><Field label="Tên cha" presencePath={personPath("fatherName")} value={String(person.fatherName ?? "")} error={contentError(personKey, "fatherName")} onChange={value => onNested(personKey, "fatherName", value)} /><Field label="Tên mẹ" presencePath={personPath("motherName")} value={String(person.motherName ?? "")} error={contentError(personKey, "motherName")} onChange={value => onNested(personKey, "motherName", value)} /><ImageField label="Ảnh chân dung" presencePath={personPath("photoUrl")} value={String(person.photoUrl ?? "")} error={contentError(personKey, "photoUrl")} onChange={value => onNested(personKey, "photoUrl", value)} onUpload={onUpload} onChooseMedia={onChooseMedia} /></fieldset>; })}</>}
        {section.type === "countdown" && <>{field("Tiêu đề", "title")}<DateTimeField label="Ngày giờ mục tiêu" presencePath={builderFieldPath(section.id, "countdown", "content", "targetDate")} value={String(content.targetDate ?? "")} timeZone={setup.timeZoneId} error={contentError("targetDate")} onChange={value => onContent("targetDate", value)} /></>}
        {section.type === "loveStory" && <>{field("Giới thiệu", "intro", "", true)}<div className="space-y-3">{list("items").map((item, index) => <fieldset key={String(item.id)} className="space-y-3 rounded-xl border border-border p-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Dấu mốc {index + 1} / {list("items").length}</span><button type="button" className="min-h-10 rounded-lg px-2 text-sm text-destructive hover:bg-destructive/5" onClick={() => onContent("items", list("items").filter((_, i) => i !== index))}>Xóa</button></div><Field label="Tiêu đề" presencePath={builderFieldPath(section.id, "loveStory", "items", String(item.id), "title")} value={String(item.title ?? "")} error={contentError("items", index, "title")} onChange={value => onContent("items", list("items").map((entry, i) => i === index ? { ...entry, title: value } : entry))} /><Field label="Ngày hoặc dấu mốc" presencePath={builderFieldPath(section.id, "loveStory", "items", String(item.id), "date")} value={String(item.date ?? "")} error={contentError("items", index, "date")} onChange={value => onContent("items", list("items").map((entry, i) => i === index ? { ...entry, date: value } : entry))} /><Field label="Mô tả" presencePath={builderFieldPath(section.id, "loveStory", "items", String(item.id), "body")} value={String(item.body ?? "")} multiline error={contentError("items", index, "body")} onChange={value => onContent("items", list("items").map((entry, i) => i === index ? { ...entry, body: value } : entry))} /><ImageField label="Ảnh dấu mốc" presencePath={builderFieldPath(section.id, "loveStory", "items", String(item.id), "imageUrl")} value={String(item.imageUrl ?? "")} error={contentError("items", index, "imageUrl")} onChange={value => onContent("items", list("items").map((entry, i) => i === index ? { ...entry, imageUrl: value } : entry))} onUpload={onUpload} onChooseMedia={onChooseMedia} /><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => onContent("items", moveItem(list("items"), index, -1))}><ChevronUp className="mr-1 size-3.5" />Lên</Button><Button type="button" size="sm" variant="outline" disabled={index === list("items").length - 1} onClick={() => onContent("items", moveItem(list("items"), index, 1))}><ChevronDown className="mr-1 size-3.5" />Xuống</Button></div></fieldset>)}<Button type="button" size="sm" variant="outline" disabled={list("items").length >= 20} onClick={() => onContent("items", [...list("items"), { id: id(), title: "", date: "", body: "" }])}><Plus className="mr-1 size-3.5" />{list("items").length >= 20 ? "Đã đạt tối đa 20 dấu mốc" : "Thêm dấu mốc"}</Button></div></>}
        {section.type === "gallery" && <>{field("Giới thiệu album", "intro", "", true)}<div className="space-y-3">{list("images").map((image, index) => <fieldset key={String(image.id)} className="rounded-xl border border-border p-3"><div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">Ảnh {index + 1} / {list("images").length}</span><button type="button" className="grid size-9 place-items-center rounded-lg text-destructive hover:bg-destructive/5" aria-label={`Xóa ảnh ${index + 1}`} onClick={() => onContent("images", list("images").filter((_, i) => i !== index))}><Trash2 className="size-4" /></button></div><ImageField label="Ảnh album" presencePath={builderFieldPath(section.id, "gallery", "images", String(image.id), "imageUrl")} value={String(image.imageUrl ?? "")} error={contentError("images", index, "imageUrl")} onChange={value => onContent("images", list("images").map((entry, i) => i === index ? { ...entry, imageUrl: value } : entry))} onUpload={onUpload} onChooseMedia={onChooseMedia} /><Field label="Mô tả ảnh (văn bản thay thế)" presencePath={builderFieldPath(section.id, "gallery", "images", String(image.id), "alt")} value={String(image.alt ?? "")} placeholder="Mô tả ngắn nội dung ảnh" error={contentError("images", index, "alt")} onChange={value => onContent("images", list("images").map((entry, i) => i === index ? { ...entry, alt: value } : entry))} /><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => onContent("images", moveItem(list("images"), index, -1))}><ChevronUp className="mr-1 size-3.5" />Lên</Button><Button type="button" size="sm" variant="outline" disabled={index === list("images").length - 1} onClick={() => onContent("images", moveItem(list("images"), index, 1))}><ChevronDown className="mr-1 size-3.5" />Xuống</Button></div></fieldset>)}{list("images").length < 30 && <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted ${batchUploading ? "pointer-events-none opacity-60" : ""}`}><Upload className="size-4" />{batchUploading ? "Đang tải album…" : "Chọn ảnh cho album"}<input type="file" multiple disabled={batchUploading} accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void uploadGalleryBatch(files); }} /></label>}{list("images").length >= 30 && <p className="text-xs text-muted-foreground">Album đã đạt giới hạn 30 ảnh.</p>}{batchStatus && <p aria-live="polite" role="status" className="text-xs text-muted-foreground">{batchStatus}</p>}</div></>}
        {section.type === "events" && <><Field label="Giới thiệu" presencePath={builderFieldPath(section.id, "events", "content", "intro")} value={String(content.intro ?? "")} multiline error={contentError("intro")} onChange={value => onContent("intro", value)} /><WeddingEventPicker weddingId={weddingId} setup={setup} selectedIds={selectedEventIds} onChange={onEventIds} presencePrefix={builderFieldPath(section.id, "events", "event")} /><details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">Dữ liệu sự kiện cũ của website</summary><p className="mt-2 text-xs leading-5 text-muted-foreground">Các sự kiện đã lưu trực tiếp trong bản V4 cũ vẫn được giữ nguyên. Hãy dùng danh sách phía trên cho sự kiện mới.</p>{list("events").map(event => <p key={String(event.id)} className="mt-2 text-sm">{String(event.title ?? "Sự kiện")}</p>)}</details></>}
        {section.type === "weddingParty" && <>{field("Giới thiệu", "intro", "", true)}{(["groom", "bride"] as const).map((side, sideIndex) => { const members = list(side); return <fieldset key={side} className="space-y-3 border-t border-border pt-4"><legend className="px-1 text-xs font-semibold text-muted-foreground">{sideIndex === 0 ? "Phù rể" : "Phù dâu"}</legend>{members.map((member, index) => <div key={String(member.id)} className="space-y-3 rounded-xl border border-border p-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">Thành viên {index + 1}</span><button type="button" className="min-h-10 px-2 text-sm text-destructive" onClick={() => onContent(side, members.filter((_, i) => i !== index))}>Xóa</button></div><Field label="Họ tên" presencePath={builderFieldPath(section.id, "weddingParty", side, String(member.id), "name")} value={String(member.name ?? "")} error={contentError(side, index, "name")} onChange={value => onContent(side, members.map((item, i) => i === index ? { ...item, name: value } : item))} /><Field label="Vai trò" presencePath={builderFieldPath(section.id, "weddingParty", side, String(member.id), "role")} value={String(member.role ?? "")} placeholder={side === "groom" ? "Bạn thân chú rể" : "Bạn thân cô dâu"} error={contentError(side, index, "role")} onChange={value => onContent(side, members.map((item, i) => i === index ? { ...item, role: value } : item))} /><Field label="Lời giới thiệu" presencePath={builderFieldPath(section.id, "weddingParty", side, String(member.id), "bio")} value={String(member.bio ?? "")} multiline error={contentError(side, index, "bio")} onChange={value => onContent(side, members.map((item, i) => i === index ? { ...item, bio: value } : item))} /><ImageField label="Ảnh thành viên" presencePath={builderFieldPath(section.id, "weddingParty", side, String(member.id), "photoUrl")} value={String(member.photoUrl ?? "")} error={contentError(side, index, "photoUrl")} onChange={value => onContent(side, members.map((item, i) => i === index ? { ...item, photoUrl: value } : item))} onUpload={onUpload} onChooseMedia={onChooseMedia} /><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => onContent(side, moveItem(members, index, -1))}><ChevronUp className="mr-1 size-3.5" />Lên</Button><Button type="button" size="sm" variant="outline" disabled={index === members.length - 1} onClick={() => onContent(side, moveItem(members, index, 1))}><ChevronDown className="mr-1 size-3.5" />Xuống</Button></div></div>)}<Button type="button" size="sm" variant="outline" disabled={members.length >= 12} onClick={() => onContent(side, [...members, { id: id(), name: "", role: "" }])}><Plus className="mr-1 size-3.5" />Thêm {sideIndex === 0 ? "phù rể" : "phù dâu"}</Button></fieldset>; })}</>}
        {section.type === "rsvp" && <>{field("Tiêu đề", "title")}{field("Mô tả", "intro", "", true)}{field("Nhãn nút", "submitLabel")}</>}
        {section.type === "wishes" && <>{field("Tiêu đề", "title")}{field("Mô tả", "intro", "", true)}</>}
        {section.type === "gift" && <>{field("Tiêu đề", "title")}{field("Mô tả", "intro", "", true)}<label className="flex min-h-10 items-center justify-between border-t border-border pt-3 text-sm">Hiển thị thông tin mừng cưới<input type="checkbox" checked={gift?.enabled ?? false} onChange={event => onGift({ enabled: event.target.checked })} /></label>{gift?.enabled && (["groomBank", "groomHolder", "groomAccount", "brideBank", "brideHolder", "brideAccount"] as const).map(key => <Field key={key} label={{ groomBank: "Ngân hàng chú rể", groomHolder: "Chủ tài khoản chú rể", groomAccount: "Số tài khoản chú rể", brideBank: "Ngân hàng cô dâu", brideHolder: "Chủ tài khoản cô dâu", brideAccount: "Số tài khoản cô dâu" }[key]} value={gift[key] ?? ""} error={errorAt(["content", "gift", key])} onChange={value => onGift({ [key]: value })} />)}</>}
        {availableBindings.length > 0 && <fieldset className="space-y-3 border-t border-border pt-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dữ liệu Wedding Setup</legend>
          <p className="text-xs leading-5 text-muted-foreground">Liên kết để đồng bộ ngày giờ, địa điểm hoặc ảnh bìa từ thông tin đám cưới. Có thể đổi về nội dung riêng bất cứ lúc nào.</p>
          {bindings.map(binding => {
            const option = availableBindings.find(item => item.target === binding.target);
            if (!option) return null;
            const currentValue = setupBindingValue(binding.target, setup);
            return <div key={binding.target} className="grid gap-2 rounded-lg bg-muted/40 p-3">
              <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-medium text-foreground">{option.label}</p><p className="mt-1 break-words text-xs text-muted-foreground">{currentValue || "Chưa điền trong Wedding Setup"}</p></div><button type="button" className="min-h-9 shrink-0 rounded-md px-2 text-xs text-destructive hover:bg-destructive/5" aria-label={`Bỏ liên kết ${option.label}`} onClick={() => onBinding(binding.target, null)}>Bỏ liên kết</button></div>
              <select className={inputClass} aria-label={`Cách dùng ${option.label}`} value={binding.mode ?? "dynamic"} onChange={event => onBinding(binding.target, event.target.value as "dynamic" | "manual" | "static")}><option value="dynamic">Tự đồng bộ từ Wedding Setup</option><option value="manual">Ưu tiên nội dung tự chỉnh sửa</option><option value="static">Chốt giá trị hiện tại khi xuất bản</option></select>
            </div>;
          })}
          {availableBindings.some(option => !bindings.some(binding => binding.target === option.target)) && <select className={inputClass} value="" aria-label="Thêm liên kết Wedding Setup" onChange={event => { if (event.target.value) onBinding(event.target.value, "dynamic"); }}><option value="">+ Thêm dữ liệu từ Wedding Setup</option>{availableBindings.filter(option => !bindings.some(binding => binding.target === option.target)).map(option => <option key={option.target} value={option.target}>{option.label}</option>)}</select>}
        </fieldset>}
      </> : <>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Hiệu ứng toàn website
          <select className={inputClass} value={appearance.motion ?? "template"} onChange={event => onAppearance({ motion: event.target.value as "template" | "off" })}>
            <option value="template">Theo hiệu ứng của mẫu và từng phần</option>
            <option value="off">Tắt toàn bộ hiệu ứng</option>
          </select>
          <span className="text-[11px] font-normal leading-5">Hiệu ứng luôn được tắt nếu thiết bị yêu cầu giảm chuyển động.</span>
        </label>
        {template && <>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Bảng màu
            <select className={inputClass} value={paletteId} onChange={event => onAppearance({ paletteId: event.target.value })}>{template.config.palettes.map(palette => <option key={palette.id} value={palette.id}>{palette.label}</option>)}</select>
            {errorAt(["appearance", "paletteId"]) && <span className="text-xs text-destructive">{errorAt(["appearance", "paletteId"])}</span>}
          </label>
          {(["fontHeading", "fontBody"] as const).map(key => <label key={key} className="grid gap-1.5 text-xs font-medium text-muted-foreground">{key === "fontHeading" ? "Phông tiêu đề" : "Phông nội dung"}
            <select className={inputClass} value={appearance[key] ?? template.config.theme[key]} onChange={event => onAppearance({ [key]: event.target.value })}>{template.config.allowedFonts.map(font => <option key={font} value={font}>{font}</option>)}</select>
            {errorAt(["appearance", key]) && <span className="text-xs text-destructive">{errorAt(["appearance", key])}</span>}
          </label>)}
        </>}
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Biến thể
          <select className={inputClass} value={section.variant} onChange={event => onSection({ variant: event.target.value } as Partial<StoryBuilderV4Section>)}>{variantOptions[section.type].map(value => <option key={value} value={value}>{variantNames[value] ?? value}</option>)}</select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Khoảng cách
          <select className={inputClass} value={section.style?.spacing ?? "normal"} onChange={event => onSection({ style: { ...section.style, spacing: event.target.value as "compact" | "normal" | "spacious" } })}><option value="compact">Gọn</option><option value="normal">Tiêu chuẩn</option><option value="spacious">Thoáng</option></select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Nền phần
          <select className={inputClass} value={section.style?.background ?? "default"} onChange={event => onSection({ style: { ...section.style, background: event.target.value as "default" | "soft" | "accent" } })}><option value="default">Mặc định</option><option value="soft">Nền dịu</option><option value="accent">Nền nhấn</option></select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Chuyển động
          <select className={inputClass} value={section.style?.animation ?? "none"} onChange={event => onSection({ style: { ...section.style, animation: event.target.value as "none" | "fade" | "rise" | "stagger" | "zoom" } })}><option value="none">Không dùng</option><option value="fade">Mờ dần khi cuộn đến</option><option value="rise">Mờ dần và trượt nhẹ</option><option value="stagger">Nội dung hiện lần lượt</option><option value="zoom">Thu phóng nhẹ</option></select>
          <span className="text-[11px] font-normal leading-5">Tự tắt nếu chủ website chọn tắt hiệu ứng hoặc thiết bị bật giảm chuyển động.</span>
        </label>
      </>}
      <div className="flex gap-2 border-t border-border pt-4"><Button type="button" size="sm" variant="outline" onClick={onDuplicate} disabled={section.type === "hero"}><Copy className="mr-1.5 size-3.5" />Nhân bản</Button><Button type="button" size="sm" variant="outline" className="text-destructive" onClick={onDelete} disabled={section.type === "hero" && page?.sections.length === 1}><Trash2 className="mr-1.5 size-3.5" />Xóa phần</Button></div>
    </div>
  </div>;
}

const variantOptions: Record<SectionType, string[]> = { hero: ["floral", "dark", "split", "editorial", "ceremonial"], couple: ["alternating", "two-columns", "editorial"], countdown: ["classic", "banner", "inline"], loveStory: ["timeline", "editorial"], events: ["cards", "minimal"], weddingParty: ["classic", "editorial"], gallery: ["grid", "masonry"], rsvp: ["default"], wishes: ["default"], gift: ["default", "minimal"] };
const variantNames: Record<string, string> = { floral: "Hoa nhẹ nhàng", dark: "Nền trầm", split: "Chia đôi", editorial: "Biên tập", ceremonial: "Trang trọng", alternating: "Xen kẽ", "two-columns": "Hai cột", classic: "Cổ điển", banner: "Dải ngang", inline: "Ngang gọn", timeline: "Dòng thời gian", cards: "Thẻ sự kiện", minimal: "Tối giản", grid: "Lưới", masonry: "So le", default: "Mặc định" };

function WeddingEventPicker({ weddingId, setup, selectedIds, onChange, presencePrefix }: { weddingId: string; setup: WeddingSetup; selectedIds: string[]; onChange: (ids: string[]) => void; presencePrefix?: string }) {
  const { api } = useRuntime(); const cache = useQueryClient(); const checkboxPrefix = useId();
  const events = useQuery({ queryKey: ["wedding-events", weddingId], queryFn: () => listWeddingEvents(api, weddingId), staleTime: 30_000 });
  const [editingId, setEditingId] = useState<string | null>(null); const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [startsAt, setStartsAt] = useState("");
  const [venueName, setVenueName] = useState(""); const [address, setAddress] = useState(""); const [mapUrl, setMapUrl] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const main: WeddingEvent = { id: "main", title: "Lễ cưới chính", startsAt: setup.eventDateTime, timeZoneId: setup.timeZoneId, venueName: setup.venueName, address: setup.venueAddress, sortOrder: 0 };
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
    } catch (error) { setMessage(errText(error)); }
    finally { setBusy(false); }
  }
  async function removeEvent(item: WeddingEvent) {
    if (item.id === "main" || !window.confirm(`Xóa sự kiện “${item.title}”?`)) return;
    setMessage(""); setBusy(true);
    try { await deleteWeddingEvent(api, weddingId, item.id); onChange(selectedIds.filter(id => id !== item.id)); await cache.invalidateQueries({ queryKey: ["wedding-events", weddingId] }); }
    catch (error) { setMessage(errText(error)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3 rounded-xl border border-border p-3">
    <div><p className="text-sm font-medium">Chọn lịch trình hiển thị</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Ngày và địa điểm chính được đồng bộ từ Wedding Setup. Bạn có thể bổ sung lễ gia tiên, tiệc cưới hoặc buổi gặp mặt.</p></div>
    {events.isPending && <p className="text-xs text-muted-foreground">Đang tải lịch trình…</p>}
    {events.isError && <div role="alert" className="rounded-lg bg-destructive/5 p-3 text-xs text-destructive">Không tải được lịch trình. <button type="button" className="underline" onClick={() => void events.refetch()}>Thử lại</button></div>}
    <div className="space-y-2">{rows.map((item, index) => { const checkboxId = `${checkboxPrefix}-event-${index}`; return <div key={item.id} className="flex items-start gap-3 rounded-lg bg-muted/35 p-3">
      <input id={checkboxId} type="checkbox" className="mt-1 accent-primary" checked={selectedIds.includes(item.id)} onChange={event => toggle(item.id, event.target.checked)} />
      <div className="min-w-0 flex-1"><label htmlFor={checkboxId} className="block cursor-pointer text-sm font-medium">{item.title}{item.id === "main" ? " · Wedding Setup" : ""}</label><span className="mt-1 block text-xs leading-5 text-muted-foreground">{[item.startsAt ? new Date(item.startsAt).toLocaleString("vi-VN") : "", item.venueName, item.address].filter(Boolean).join(" · ") || "Chưa có ngày hoặc địa điểm"}</span></div>
      {item.id !== "main" && <span className="flex shrink-0 gap-2"><button type="button" className="text-xs text-primary underline" onClick={() => beginEdit(item)}>Sửa</button><button type="button" className="text-xs text-destructive underline" onClick={() => void removeEvent(item)}>Xóa</button></span>}
    </div>; })}</div>
    {!formOpen ? <Button type="button" size="sm" variant="outline" onClick={() => { resetForm(); setFormOpen(true); }}><Plus className="mr-1.5 size-3.5" />Thêm sự kiện</Button> : <fieldset className="space-y-3 border-t border-border pt-3"><legend className="px-1 text-xs font-semibold">{editingId ? "Chỉnh sửa sự kiện" : "Sự kiện mới"}</legend><Field label="Tên sự kiện" presencePath={builderFieldPath(presencePrefix ?? "event", editingId ?? "new", "title")} value={title} onChange={setTitle} placeholder="Lễ gia tiên, tiệc cưới…" /><Field label="Mô tả" presencePath={builderFieldPath(presencePrefix ?? "event", editingId ?? "new", "description")} value={description} multiline onChange={setDescription} /><DateTimeField label="Ngày giờ" presencePath={builderFieldPath(presencePrefix ?? "event", editingId ?? "new", "startsAt")} value={startsAt} timeZone={setup.timeZoneId} onChange={value => setStartsAt(value ?? "")} /><Field label="Địa điểm" presencePath={builderFieldPath(presencePrefix ?? "event", editingId ?? "new", "venueName")} value={venueName} onChange={setVenueName} /><Field label="Địa chỉ" presencePath={builderFieldPath(presencePrefix ?? "event", editingId ?? "new", "address")} value={address} onChange={setAddress} /><Field label="Link bản đồ HTTPS" presencePath={builderFieldPath(presencePrefix ?? "event", editingId ?? "new", "mapUrl")} value={mapUrl} onChange={setMapUrl} /><div className="flex gap-2"><Button type="button" size="sm" disabled={busy || !title.trim()} onClick={() => void saveEvent()}>{busy ? "Đang lưu…" : "Lưu sự kiện"}</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={resetForm}>Hủy</Button></div></fieldset>}
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

function Field({ label, value, placeholder, multiline, maxLength, error, presencePath, onChange }: { label: string; value: string; placeholder?: string; multiline?: boolean; maxLength?: number; error?: string; presencePath?: string; onChange: (value: string) => void }) {
  const errorId = useId();
  const className = `w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${error ? "border-destructive focus-visible:ring-destructive" : "border-input"}`;
  const normalizedPath = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{label}{multiline ? <textarea data-builder-field-path={presencePath ?? `field.${normalizedPath}`} maxLength={maxLength} className={`${className} min-h-20 resize-y`} value={value} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => onChange(event.target.value)} /> : <input data-builder-field-path={presencePath ?? `field.${normalizedPath}`} maxLength={maxLength} className={`${className} h-10`} value={value} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => onChange(event.target.value)} />}{error && <span id={errorId} role="alert" className="font-normal text-destructive">{error}</span>}</label>;
}

function DateTimeField({ label, value, timeZone, error, presencePath, onChange }: { label: string; value: string; timeZone?: string; error?: string; presencePath?: string; onChange: (value: string | undefined) => void }) {
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
      catch { setDraft(current => ({ ...current, localValue: next, conversionError: "Thời điểm này không hợp lệ theo múi giờ của đám cưới." })); }
    }} />
    <span className="font-normal">Múi giờ: {timeZone || "Asia/Ho_Chi_Minh"}</span>
    {displayedError && <span id={errorId} role="alert" className="font-normal text-destructive">{displayedError}</span>}
  </label>;
}

function ImageField({ label, value, placeholder, error, presencePath, onChange, onUpload, onChooseMedia }: { label: string; value: string; placeholder?: string; error?: string; presencePath?: string; onChange: (value: string) => void; onUpload: (file: File) => Promise<string | null>; onChooseMedia: (onChoose: (url: string) => void) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [previewFailedFor, setPreviewFailedFor] = useState("");
  const inputId = useId();
  const previewFailed = previewFailedFor === value;
  const fileName = value ? (() => {
    try { return decodeURIComponent(new URL(value, "https://inviteme.invalid").pathname.split("/").pop() || "Ảnh đã chọn"); }
    catch { return value.split("/").pop()?.split("?")[0] || "Ảnh đã chọn"; }
  })() : "";
  async function selectImage(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setUploadError("Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const url = await onUpload(file);
      if (url) onChange(url);
      else setUploadError("Tải ảnh chưa thành công. Hãy thử lại.");
    } catch {
      setUploadError("Tải ảnh chưa thành công. Hãy thử lại.");
    } finally {
      setUploading(false);
    }
  }
  return <div className="space-y-2">
    <span className="block text-sm font-medium text-foreground">{label}</span>
    {value.trim() ? <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="relative grid size-[4.5rem] shrink-0 place-items-center overflow-hidden rounded-lg bg-primary/10 text-primary">
        {!previewFailed
          ? <Image src={mediaUrl(value) ?? value} alt={label} fill sizes="72px" unoptimized className="object-cover" onError={() => setPreviewFailedFor(value)} />
          : <ImageIcon className="size-6" aria-hidden="true" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Ảnh đã được thêm</p>
        <p className="mt-1 truncate text-xs text-muted-foreground" title={fileName}>{fileName}</p>
        {previewFailed && <p role="status" className="mt-1 text-xs text-amber-700">Không tải được ảnh xem trước. Bạn có thể chọn ảnh khác.</p>}
      </div>
    </div> : <div className="flex min-h-20 items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><ImageIcon className="size-5" aria-hidden="true" /></span>
      <span>Chưa chọn ảnh. Tải ảnh lên hoặc chọn từ thư viện của đám cưới.</span>
    </div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={inputId} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium transition hover:bg-muted focus-within:ring-2 focus-within:ring-ring ${uploading ? "pointer-events-none opacity-60" : ""}`}><Upload className="size-3.5" />{uploading ? "Đang tải ảnh…" : value ? "Thay ảnh" : "Tải ảnh lên"}</label>
      <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void selectImage(file); }} />
      <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => onChooseMedia(onChange)}><ImageIcon className="mr-1.5 size-3.5" />Chọn từ thư viện</Button>
      {value && <Button type="button" size="sm" variant="ghost" className="text-destructive hover:bg-destructive/5 hover:text-destructive" disabled={uploading} onClick={() => { onChange(""); setUploadError(""); }}><Trash2 className="mr-1.5 size-3.5" />Gỡ khỏi mục này</Button>}
      {uploading && <span role="status" aria-live="polite" className="text-xs text-muted-foreground">Đang tải ảnh lên…</span>}
    </div>
    <p className="text-xs leading-5 text-muted-foreground">Gỡ ảnh chỉ bỏ ảnh khỏi mục này; tệp vẫn được giữ trong thư viện ảnh.</p>
    <details className="group rounded-lg border border-border/70 px-3 py-2">
      <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground marker:hidden">Nhập liên kết ảnh thủ công <ChevronDown className="ml-1 inline size-3.5 transition group-open:rotate-180" /></summary>
      <div className="mt-3"><Field label="Liên kết ảnh" presencePath={presencePath} value={value} placeholder={placeholder ?? "Dán liên kết ảnh"} onChange={onChange} /></div>
    </details>
    {uploadError && <p role="alert" className="text-xs text-destructive">{uploadError}</p>}
  </div>;
}
