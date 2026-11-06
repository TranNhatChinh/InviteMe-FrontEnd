"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleHelp, Copy, Eye, EyeOff, Globe, GripVertical, Image as ImageIcon, LoaderCircle, Menu, Monitor, MoreHorizontal, Plus, Redo2, RefreshCw, Save, Search, Smartphone, Tablet, Trash2, Undo2, Upload, X } from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
// eslint-disable-next-line architecture/boundaries -- Template access uses the shared wedding plan entitlement contract.
import { FeatureLimitNotice, useWeddingPlan } from "@/features/plans";
import { applyStoryBuilderV4Template, createStoryBuilderV4Document, createV4Section, isStoryBuilderV4Document, summarizeStoryBuilderV4TemplateChange } from "../schemas/story-builder-v4.document";
import { describeV4ValidationIssues, moveV4Page } from "../schemas/story-builder-v4.helpers";
import { storyBuilderV4DocumentSchema, type StoryBuilderV4Document, type StoryBuilderV4Section, type StorySectionType, type StoryTemplateSummaryV4 } from "../schemas/story-builder-v4.schema";
import type { Website } from "../api/website.api";
import { getWebsite, listStoryTemplates, listWeddingMedia, mediaUrl, publishWebsite, saveWebsite, unpublishWebsite, uploadWeddingMedia } from "../api/website.api";
import { isoToLocalDateTime, localDateTimeToIso, type WeddingSetup } from "../schemas/wedding.schema";
import { StoryBuilderV4Renderer } from "./story-builder-v4-renderer";

type BuilderProps = { weddingId: string; site: Website; setup: WeddingSetup };
type Viewport = "desktop" | "tablet" | "mobile";
type SectionType = StorySectionType;
type BuilderIssue = { path: readonly PropertyKey[]; message: string };
const sectionNames: Record<SectionType, string> = { hero: "Ảnh bìa", couple: "Cặp đôi", countdown: "Đếm ngược", loveStory: "Chuyện tình", events: "Sự kiện", gallery: "Album ảnh", rsvp: "Xác nhận tham dự", wishes: "Lời chúc", gift: "Mừng cưới" };
const sectionDescriptions: Record<SectionType, string> = { hero: "Mở đầu website với tên hai bạn, lời dẫn và ảnh bìa.", couple: "Giới thiệu cô dâu, chú rể và câu chuyện riêng.", countdown: "Đếm số ngày còn lại tới ngày vui.", loveStory: "Kể lại các dấu mốc đáng nhớ của hai bạn.", events: "Cung cấp thời gian, địa điểm và bản đồ sự kiện.", gallery: "Chia sẻ album ảnh cưới với khách mời.", rsvp: "Đưa khách tới luồng xác nhận tham dự an toàn.", wishes: "Hiển thị lời chúc khách gửi qua thiệp.", gift: "Hiển thị thông tin mừng cưới đã cấu hình." };
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
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const errText = (error: unknown) => error instanceof Error ? error.message : "Không thể hoàn tất thao tác.";
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
  const activeSite = createdSite ?? site;
  const activeIsV4 = isStoryBuilderV4Document(activeSite.document);
  const [showGallery, setShowGallery] = useState(!activeSite.document);
  const [migrationGallery, setMigrationGallery] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<StoryTemplateSummaryV4 | null>(null);
  const legacyDocument = activeSite.document && !activeIsV4 ? activeSite.document : undefined;
  const publishedLegacy = Boolean(legacyDocument && activeSite.status === "PUBLISHED" && setup.slug);

  if (templates.isPending) return <LoadingState label="Đang tải thư viện mẫu website…" />;
  if (templates.isError) return <ErrorState error={templates.error} retry={() => void templates.refetch()} />;

  if (activeIsV4 && !showGallery) return <V4Studio key={weddingId} weddingId={weddingId} initialSite={activeSite} setup={setup} onChooseOtherTemplate={savedSite => { setCreatedSite(savedSite); setShowGallery(true); }} />;

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
    onBack={() => { setMigrationGallery(false); setShowGallery(false); }}
    onCreated={(saved) => {
      setCreatedSite(saved);
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

function V4TemplateGallery({ weddingId, setup, templates, siteVersion, currentDocument, legacyDocument, hasActiveDraft, onBack, onCreated, selectedTemplate, setSelectedTemplate }: {
  weddingId: string; setup: WeddingSetup; templates: StoryTemplateSummaryV4[]; siteVersion: number; currentDocument?: StoryBuilderV4Document; legacyDocument?: unknown;
  hasActiveDraft: boolean; onBack: () => void; onCreated: (site: Website) => void;
  selectedTemplate: StoryTemplateSummaryV4 | null; setSelectedTemplate: (value: StoryTemplateSummaryV4 | null) => void;
}) {
  const { api } = useRuntime(); const queryClient = useQueryClient();
  const plan = useWeddingPlan(weddingId, true);
  const [search, setSearch] = useState(""); const [category, setCategory] = useState("all");
  const [tier, setTier] = useState("all"); const [viewport, setViewport] = useState<Viewport>("desktop");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
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
      <select className="h-11 rounded-xl border border-input bg-background px-3 text-sm" value={category} onChange={event => setCategory(event.target.value)} aria-label="Lọc danh mục"><option value="all">Tất cả phong cách</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select>
      <select className="h-11 rounded-xl border border-input bg-background px-3 text-sm" value={tier} onChange={event => setTier(event.target.value)} aria-label="Lọc theo gói"><option value="all">Tất cả gói</option><option value="FREE">Miễn phí</option><option value="PREMIUM">Premium</option><option value="UNCLASSIFIED">Chưa phân loại</option></select>
    </div>
    {plan.isError && <FeatureLimitNotice title="Chưa xác minh được quyền lợi gói" description="Mẫu Premium sẽ được mở khi kiểm tra quyền lợi thành công. Các mẫu còn lại vẫn có thể xem." status="unavailable" variant="compact" onRetry={() => void plan.refetch()} retryLabel="Thử lại" />}
    {message && <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{message}</p>}
    {filtered.length === 0 ? <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">Không tìm thấy mẫu phù hợp.</p> : <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map(template => {
        const preview = currentDocument
          ? applyStoryBuilderV4Template(template, currentDocument, setup)
          : createStoryBuilderV4Document(template, setup, legacyDocument);
        const locked = Boolean(premiumLocked(template) || premiumUnknown(template));
        const isCurrent = currentDocument?.templateKey === template.key && currentDocument.templateVersion === template.version;
        return <article key={template.key} className="min-w-0">
          <button type="button" onClick={() => setSelectedTemplate(template)} className="group relative block w-full overflow-hidden rounded-[18px] border border-border bg-[#f5f1f0] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Xem trước ${template.name}`}>
            <div className="h-[250px] overflow-hidden" style={{ width: viewport === "mobile" ? "55%" : viewport === "tablet" ? "80%" : "100%", marginInline: "auto" }}><div className="h-[620px] origin-top scale-[0.42]" style={{ width: "238%", transformOrigin: "top left", pointerEvents: "none" }}><StoryBuilderV4Renderer document={preview} /></div></div>
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/65 to-transparent px-4 pb-4 pt-12 text-sm text-white"><span>{template.config.category || "Website cưới"}</span>{isCurrent ? <span className="rounded-full bg-white/20 px-2 py-1 text-xs">Đang dùng</span> : <Eye className="size-4 opacity-0 transition group-hover:opacity-100" />}</div>
          </button>
          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="min-w-0"><h2 className="font-display text-xl text-foreground">{template.name}</h2><p className="mt-1 text-xs text-muted-foreground">{template.config.accessTier === "PREMIUM" ? "Premium" : template.config.accessTier === "FREE" ? "Miễn phí" : "Chưa phân loại"} · {template.config.sections.length} phần gợi ý</p><div className="mt-3 flex items-center gap-2"><span className="flex gap-1.5" aria-label="Bảng màu của mẫu">{[template.config.theme.colors.primary, template.config.theme.colors.background, template.config.theme.colors.accent].map((color, index) => <span key={`${color}-${index}`} className="size-4 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}</span><span className="truncate text-[11px] text-muted-foreground">{template.config.theme.fontHeading} · {template.config.category || "Website cưới"}</span></div></div>
            {premiumLocked(template) ? <Button asChild size="sm"><Link href={`/weddings/${encodeURIComponent(weddingId)}/plan`}>Xem các gói</Link></Button> : <Button size="sm" disabled={busy || locked || isCurrent} onClick={() => { setMessage(""); setSelectedTemplate(template); }}>{locked ? "Đang kiểm tra gói" : isCurrent ? "Mẫu đang dùng" : currentDocument ? "Xem & đổi mẫu" : legacyDocument ? "Xem & chuyển" : "Xem mẫu"}</Button>}
          </div>
          {template.config.accessTier === "UNCLASSIFIED" && <p className="mt-2 text-xs text-muted-foreground">Mẫu chưa được Admin phân loại gói.</p>}
        </article>;
      })}
    </div>}
    {selectedTemplate && <TemplatePreviewDialog template={selectedTemplate} setup={setup} currentDocument={currentDocument} oldDocument={legacyDocument} error={message} viewport={viewport} setViewport={setViewport} busy={busy} locked={Boolean(premiumLocked(selectedTemplate) || premiumUnknown(selectedTemplate))} canUpgrade={Boolean(premiumLocked(selectedTemplate))} weddingId={weddingId} onClose={() => { setSelectedTemplate(null); setMessage(""); }} onChoose={(version, document) => void createDraft(selectedTemplate, version, document)} />}
  </main>;
}

// Gallery may be opened before a document exists; GET supplies the optimistic concurrency version.
// Keeping this query inside the gallery makes template selection use the latest server version.
function TemplatePreviewDialog({ template, setup, currentDocument, oldDocument, error, viewport, setViewport, busy, locked, canUpgrade, weddingId, onClose, onChoose }: {
  template: StoryTemplateSummaryV4; setup: WeddingSetup; currentDocument?: StoryBuilderV4Document; oldDocument?: unknown; error: string; viewport: Viewport; setViewport: (v: Viewport) => void;
  busy: boolean; locked: boolean; canUpgrade: boolean; weddingId: string; onClose: () => void; onChoose: (expectedVersion: number, document?: StoryBuilderV4Document) => void;
}) {
  const { api } = useRuntime(); const siteQuery = useQuery({ queryKey: ["website", setup.id], queryFn: () => getWebsite(api, setup.id), staleTime: 0, refetchOnMount: "always" });
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);
  const [viewingCurrent, setViewingCurrent] = useState(false);
  const site = siteQuery.data;
  const latestCurrentDocument = currentDocument && site && isStoryBuilderV4Document(site.document) ? site.document : undefined;
  const previewSource = latestCurrentDocument ?? currentDocument;
  const preparedDocument = previewSource ? applyStoryBuilderV4Template(template, previewSource, setup) : undefined;
  const preview = preparedDocument
    ? preparedDocument
    : createStoryBuilderV4Document(template, setup, oldDocument);
  const impact = previewSource && preparedDocument ? summarizeStoryBuilderV4TemplateChange(previewSource, preparedDocument) : undefined;
  const currentTemplateName = typeof record(previewSource?.templateSnapshot).name === "string" ? String(record(previewSource?.templateSnapshot).name) : "mẫu hiện tại";
  const draftIsUnavailable = Boolean(currentDocument && site && !latestCurrentDocument);
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
          : <Button disabled={busy || locked || siteQuery.isPending || siteQuery.isFetching || siteQuery.isError || !site || draftIsUnavailable || Boolean(previewSource && previewSource.templateKey === template.key && previewSource.templateVersion === template.version)} onClick={() => { if (!site) return; if (previewSource) setConfirmingSwitch(true); else onChoose(site.version); }}>{busy ? "Đang áp dụng…" : locked ? "Đang kiểm tra gói" : siteQuery.isPending || siteQuery.isFetching ? "Đang kiểm tra bản nháp…" : previewSource ? "Đổi mẫu" : oldDocument ? "Tạo bản nháp V4" : "Dùng mẫu này"}</Button>}
    </header>
    {(error || draftIsUnavailable) && <div role="alert" className="border-b border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error || "Không thể xác minh bản nháp hiện tại. Hãy tải lại trước khi đổi mẫu để tránh ghi đè phiên bản khác."}</div>}
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
      <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button variant="outline" onClick={() => setConfirmingSwitch(false)}>Tiếp tục xem mẫu</Button><Button disabled={busy || siteQuery.isPending || siteQuery.isFetching || siteQuery.isError || !site || !latestCurrentDocument || !preparedDocument} onClick={() => site && preparedDocument && onChoose(site.version, preparedDocument)}>{busy ? "Đang áp dụng…" : "Xác nhận áp dụng mẫu"}</Button></div>
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

function V4Studio({ weddingId, initialSite, setup, onChooseOtherTemplate }: { weddingId: string; initialSite: Website; setup: WeddingSetup; onChooseOtherTemplate: (site: Website) => void }) {
  const { api } = useRuntime(); const cache = useQueryClient();
  const { isOwner } = usePermission();
  const initial = isStoryBuilderV4Document(initialSite.document) ? initialSite.document : null;
  const [doc, setDoc] = useState<StoryBuilderV4Document | null>(initial);
  const docRef = useRef<StoryBuilderV4Document | null>(initial);
  const versionRef = useRef(initialSite.version);
  const [version, setVersion] = useState(initialSite.version);
  const [dirty, setDirty] = useState(false); const dirtyRef = useRef(false);
  const [busy, setBusy] = useState(false); const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState(""); const [conflict, setConflict] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState(initial?.pages[0]?.id ?? "");
  const [selectedSectionId, setSelectedSectionId] = useState(initial?.pages[0]?.sections[0]?.id ?? "");
  const [viewport, setViewport] = useState<Viewport>("desktop"); const [preview, setPreview] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true); const [rightOpen, setRightOpen] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<"structure" | "inspector" | null>(null);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const mobileActionsRef = useRef<HTMLDivElement>(null);
  const saveInFlight = useRef(false);
  const persistRef = useRef<(next: StoryBuilderV4Document, showIssues?: boolean) => Promise<Website | null>>(async () => null);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  const [shareSettingsOpen, setShareSettingsOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaPickerTarget, setMediaPickerTarget] = useState<((url: string) => void) | null>(null);
  const [showQuickStart, setShowQuickStart] = useState(true);
  const [sectionLibraryOpen, setSectionLibraryOpen] = useState(false);
  const [sectionLibraryType, setSectionLibraryType] = useState<SectionType>("hero");
  const [sectionLibraryVariant, setSectionLibraryVariant] = useState("floral");
  const [undoStack, setUndoStack] = useState<StoryBuilderV4Document[]>([]); const [redoStack, setRedoStack] = useState<StoryBuilderV4Document[]>([]);
  const [dragSectionId, setDragSectionId] = useState<string | null>(null);
  const [dropSectionId, setDropSectionId] = useState<string | null>(null);
  const [pageName, setPageName] = useState(""); const [pageSlug, setPageSlug] = useState("");
  const [status, setStatus] = useState(initialSite.status);
  const templateQuery = useQuery({ queryKey: ["story-templates"], queryFn: () => listStoryTemplates(api), staleTime: 60_000 });
  const mediaLibrary = useQuery({ queryKey: ["wedding-media", weddingId], queryFn: () => listWeddingMedia(api, weddingId), enabled: mediaPickerOpen });
  const currentTemplate = templateQuery.data?.find(item => item.key === doc?.templateKey);
  const currentTier = currentTemplate?.config.accessTier ?? record(doc?.templateSnapshot).accessTier;
  const currentPage = doc?.pages.find(page => page.id === selectedPageId) ?? doc?.pages.find(page => page.isHome);
  const currentSection = currentPage?.sections.find(section => section.id === selectedSectionId);
  const currentSectionId = currentSection?.id;
  const remoteVersion = initialSite.version;
  const sitePlan = useWeddingPlan(weddingId, true);
  const premiumLocked = currentTier === "PREMIUM" && Boolean(sitePlan.data && !sitePlan.data.legacy && !sitePlan.data.limits.premiumTemplates);
  const premiumUnknown = currentTier === "PREMIUM" && (sitePlan.isPending || sitePlan.isError || !sitePlan.data);
  const validationIssues = useMemo<BuilderIssue[]>(() => {
    if (!showFieldErrors || !doc) return [];
    const result = storyBuilderV4DocumentSchema.safeParse(doc);
    return result.success ? [] : result.error.issues;
  }, [doc, showFieldErrors]);
  const publishCheck = useMemo(() => doc ? storyBuilderV4DocumentSchema.safeParse(doc) : null, [doc]);
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
    const section = createV4Section(sectionLibraryType, previewDocument.content, setup);
    section.variant = sectionLibraryVariant as typeof section.variant;
    page.sections = [section];
    return previewDocument;
  }, [doc, currentPage?.id, sectionLibraryType, sectionLibraryVariant, setup]);
  const pageIndex = doc?.pages.findIndex(page => page.id === currentPage?.id) ?? -1;
  const sectionIndex = currentPage?.sections.findIndex(section => section.id === currentSection?.id) ?? -1;
  const selectSection = (sectionId: string) => {
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

  useEffect(() => {
    if (remoteVersion > versionRef.current && !dirtyRef.current) {
      setConflict(true);
      setSaveState("error");
    }
  }, [remoteVersion]);
  useEffect(() => {
    if (preview || !currentSectionId) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(currentSectionId)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }));
    return () => window.cancelAnimationFrame(frame);
  }, [currentSectionId, preview]);
  useEffect(() => {
    if (!dirty || !doc || conflict || !isOwner) return;
    const timer = window.setTimeout(() => { void persistRef.current(doc); }, 900);
    return () => window.clearTimeout(timer);
  }, [doc, dirty, conflict, isOwner, premiumLocked, premiumUnknown]);
  useEffect(() => {
    if (!dirty) return;
    const preventClose = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [dirty]);
  useEffect(() => {
    if (!mobileActionsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !mobileActionsRef.current?.contains(event.target)) setMobileActionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileActionsOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [mobileActionsOpen]);
  useEffect(() => {
    if (!mobilePanel) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobilePanel(null); };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", closeOnEscape); };
  }, [mobilePanel]);

  async function persist(next: StoryBuilderV4Document, showIssues = false): Promise<Website | null> {
    if (saveInFlight.current || conflict || !isOwner || premiumLocked || premiumUnknown) return null;
    const validation = storyBuilderV4DocumentSchema.safeParse(next);
    if (!validation.success) {
      if (showIssues) setShowFieldErrors(true);
      setError(describeV4ValidationIssues(validation.error.issues, next));
      setSaveState("error");
      return null;
    }
    setShowFieldErrors(false);
    saveInFlight.current = true;
    setBusy(true); setError(""); setSaveState("saving");
    let saved = false;
    try {
      const result = await saveWebsite(api, weddingId, versionRef.current, next);
      saved = true;
      versionRef.current = result.version; setVersion(result.version);
      cache.setQueryData(["website", weddingId], result);
      if (JSON.stringify(docRef.current) === JSON.stringify(next)) { dirtyRef.current = false; setDirty(false); setSaveState("saved"); }
      else setSaveState("saving");
      return result;
    } catch (cause) {
      const message = errText(cause); setError(message); setSaveState("error");
      if (/conflict|version|409/i.test(message)) setConflict(true);
      return null;
    } finally {
      saveInFlight.current = false;
      setBusy(false);
      if (saved && dirtyRef.current && docRef.current && JSON.stringify(docRef.current) !== JSON.stringify(next)) {
        window.setTimeout(() => { const latest = docRef.current; if (latest) void persistRef.current(latest); }, 0);
      }
    }
  }
  useEffect(() => { persistRef.current = persist; });

  const update = useCallback((next: StoryBuilderV4Document, withHistory = true) => {
    const previous = docRef.current;
    if (withHistory && previous) { setUndoStack(stack => [...stack.slice(-39), clone(previous)]); setRedoStack([]); }
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
    const nextSection = createV4Section(type, doc.content, setup);
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
    const hero = createV4Section("hero", doc.content, setup); const rsvp = createV4Section("rsvp", doc.content, setup);
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
    if (dirtyRef.current && docRef.current) {
      const saved = await persistRef.current(docRef.current, true);
      if (!saved) return;
      currentSite = saved;
    }
    cache.setQueryData(["website", weddingId], currentSite);
    onChooseOtherTemplate(currentSite);
  }
  const history = useCallback((direction: "undo" | "redo") => {
    const from = direction === "undo" ? undoStack : redoStack; const to = direction === "undo" ? redoStack : undoStack;
    const previous = from.at(-1); if (!previous || !doc) return;
    if (direction === "undo") { setUndoStack(from.slice(0, -1)); setRedoStack([...to, clone(doc)]); }
    else { setRedoStack(from.slice(0, -1)); setUndoStack([...to, clone(doc)]); }
    docRef.current = clone(previous); dirtyRef.current = true; setDoc(clone(previous)); setDirty(true);
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
    if (!doc || !publishDocument || !isOwner || conflict || premiumLocked || premiumUnknown) return;
    const validation = storyBuilderV4DocumentSchema.safeParse(publishDocument);
    if (!validation.success) { setShowFieldErrors(true); setError(describeV4ValidationIssues(validation.error.issues, publishDocument)); return; }
    setShowFieldErrors(false);
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
    finally { setBusy(false); }
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
    docRef.current = latest.document; setDoc(latest.document); setVersion(latest.version); versionRef.current = latest.version; setStatus(latest.status); setConflict(false); setDirty(false); dirtyRef.current = false; setSaveState("saved"); setUndoStack([]); setRedoStack([]);
    setSelectedPageId(latest.document.pages[0]?.id ?? ""); setSelectedSectionId(latest.document.pages[0]?.sections[0]?.id ?? ""); cache.setQueryData(["website", weddingId], latest);
  }

  if (!doc) return <p className="p-6 text-sm text-muted-foreground">Website chưa có bản nháp V4. Quay lại thư viện mẫu để bắt đầu.</p>;
  if (!isOwner) return <div className="mx-auto max-w-3xl p-8"><FeatureLimitNotice title="Chỉ chủ tiệc mới có thể chỉnh sửa website" description="Bạn vẫn có thể xem website đã xuất bản. Hãy nhờ chủ tiệc mở trình dựng website." status="unavailable" variant="full" /></div>;
  const viewportWidth = viewport === "desktop" ? 1120 : viewport === "tablet" ? 768 : 390;
  const renderedDocument = doc;
  const publishIssues = publishCheck && !publishCheck.success ? publishCheck.error.issues : [];
  const publishCanProceed = Boolean(publishCheck?.success && !busy && !dirty && saveState === "saved" && !conflict && !premiumLocked && !premiumUnknown);
  const paletteValue = doc.appearance.paletteId ?? currentTemplate?.config.palettes[0]?.id ?? "";
  const inspectorPanel = <Inspector
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
  />;

  return <div className="fixed inset-0 z-40 flex flex-col bg-[#faf8f7] text-foreground">
    <header className="z-20 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border bg-background px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3"><Link href={`/weddings/${encodeURIComponent(weddingId)}`} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Thoát trình dựng"><ArrowLeft className="size-4" /></Link><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-sm font-semibold sm:text-base">{setup.name}</h1><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${status === "PUBLISHED" ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{status === "PUBLISHED" ? "Đã xuất bản" : "Bản nháp"}</span></div><p aria-live="polite" className="text-xs text-muted-foreground">{saveState === "saving" ? "Đang lưu…" : saveState === "saved" && !dirty ? "Đã lưu" : "Có thay đổi chưa lưu"}</p></div></div>
      <div className="hidden items-center gap-1 sm:flex sm:gap-2">
        <button type="button" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-35" aria-label="Hoàn tác" disabled={!undoStack.length || busy} onClick={() => history("undo")}><Undo2 className="size-4" /></button>
        <button type="button" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-35" aria-label="Làm lại" disabled={!redoStack.length || busy} onClick={() => history("redo")}><Redo2 className="size-4" /></button>
        <span className="mx-1 hidden h-6 border-l border-border sm:block" />
        <Button variant="outline" className={preview ? "border-primary text-primary-hover" : ""} size="sm" onClick={() => setPreview(!preview)}><Eye className="mr-1.5 size-4" />{preview ? "Chỉnh sửa" : "Xem trước"}</Button>
        <Button size="sm" variant="outline" disabled={busy || conflict || saveState === "saving"} onClick={() => void chooseOtherTemplate()}>Đổi mẫu</Button>
        {status === "PUBLISHED" && setup.slug && <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex"><Link href={`/wedding/${encodeURIComponent(setup.slug)}`} target="_blank" rel="noreferrer"><Globe className="mr-1.5 size-4" />Website</Link></Button>}
        <Button size="sm" variant="outline" onClick={() => setShareSettingsOpen(true)}><Globe className="mr-1.5 size-4" />Chia sẻ & SEO</Button>
        {status === "PUBLISHED" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void unpublish()}>Gỡ</Button>}
        {dirty && <Button size="sm" variant="outline" disabled={busy || conflict} onClick={() => docRef.current && void persist(docRef.current, true)}><Save className="mr-1.5 size-4" />Lưu</Button>}
        <Button size="sm" disabled={busy || conflict || dirty || saveState === "saving"} onClick={() => setPublishReviewOpen(true)}>{busy ? <LoaderCircle className="mr-1.5 size-4 animate-spin" /> : <Check className="mr-1.5 size-4" />}{status === "PUBLISHED" ? "Xuất bản lại" : "Xuất bản"}</Button>
      </div>
      <div className="relative flex items-center gap-1 sm:hidden" ref={mobileActionsRef}>
        <Button aria-label={preview ? "Chỉnh sửa" : "Xem trước"} title={preview ? "Chỉnh sửa" : "Xem trước"} variant="outline" size="icon" onClick={() => setPreview(!preview)}>{preview ? <X className="size-4" /> : <Eye className="size-4" />}</Button>
        <Button aria-label="Mở thao tác khác" aria-expanded={mobileActionsOpen} aria-haspopup="true" variant="outline" size="icon" onClick={() => setMobileActionsOpen(open => !open)}><MoreHorizontal className="size-4" /></Button>
        {mobileActionsOpen && <div role="group" aria-label="Thao tác website" className="absolute right-0 top-full z-50 mt-2 min-w-52 rounded-xl border border-border bg-background p-2 shadow-xl">
          <div className="flex gap-1 border-b border-border pb-2">
            <button type="button" className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm hover:bg-muted disabled:opacity-40" disabled={!undoStack.length || busy} onClick={() => { history("undo"); setMobileActionsOpen(false); }}><Undo2 className="size-4" />Hoàn tác</button>
            <button type="button" className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm hover:bg-muted disabled:opacity-40" disabled={!redoStack.length || busy} onClick={() => { history("redo"); setMobileActionsOpen(false); }}><Redo2 className="size-4" />Làm lại</button>
          </div>
          <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-primary hover:bg-primary/5 disabled:opacity-40" disabled={busy || conflict || saveState === "saving"} onClick={() => { setMobileActionsOpen(false); void chooseOtherTemplate(); }}><Eye className="size-4" />Chọn mẫu website khác</button>
          <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted" onClick={() => { setMobileActionsOpen(false); setShareSettingsOpen(true); }}><Globe className="size-4" />Chia sẻ & SEO</button>
          {status === "PUBLISHED" && setup.slug && <Link className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted" href={`/wedding/${encodeURIComponent(setup.slug)}`} target="_blank" rel="noreferrer" onClick={() => setMobileActionsOpen(false)}><Globe className="size-4" />Mở website</Link>}
          {dirty && <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted disabled:opacity-40" disabled={busy || conflict} onClick={() => { const latest = docRef.current; setMobileActionsOpen(false); if (latest) void persist(latest, true); }}><Save className="size-4" />Lưu thay đổi</button>}
          {status === "PUBLISHED" && <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40" disabled={busy} onClick={() => { setMobileActionsOpen(false); void unpublish(); }}>Gỡ xuất bản</button>}
        </div>}
        <Button size="sm" className="px-2.5" aria-label={status === "PUBLISHED" ? "Xuất bản lại website" : "Xuất bản website"} title={status === "PUBLISHED" ? "Xuất bản lại website" : "Xuất bản website"} disabled={busy || conflict || dirty || saveState === "saving"} onClick={() => setPublishReviewOpen(true)}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}<span className="ml-1 hidden min-[430px]:inline">{status === "PUBLISHED" ? "Xuất bản lại" : "Xuất bản"}</span></Button>
      </div>
    </header>
    {conflict && <div role="alert" className="z-10 flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950"><span>Website đã được cập nhật ở phiên khác. Tải bản mới nhất để tiếp tục chỉnh sửa.</span><Button size="sm" variant="outline" onClick={() => void reloadLatest()}><RefreshCw className="mr-1.5 size-3.5" />Tải bản mới nhất</Button></div>}
    {error && <div role="alert" className="z-10 flex items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive"><span>{error}</span><button aria-label="Đóng thông báo" onClick={() => setError("")}><X className="size-4" /></button></div>}
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
          {currentPage?.sections.map((section, index) => <div key={section.id}
            onDragOver={event => { event.preventDefault(); setDropSectionId(section.id); }}
            onDrop={event => { event.preventDefault(); if (dragSectionId) reorderSection(dragSectionId, section.id); setDragSectionId(null); setDropSectionId(null); }}
            className={`group mb-1 flex items-center gap-0.5 rounded-lg border ${section.id === currentSection?.id ? "border-primary/40 bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/50"} ${dropSectionId === section.id && dragSectionId !== section.id ? "border-b-2 border-b-primary" : ""} ${dragSectionId === section.id ? "opacity-45" : ""}`}>
            <button type="button" draggable={section.type !== "hero"} className={`grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background ${section.type === "hero" ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}`} aria-label={`Kéo để sắp xếp ${sectionNames[section.type]}`} title={section.type === "hero" ? "Ảnh bìa luôn ở đầu trang" : "Kéo để sắp xếp"} onDragStart={event => { if (section.type === "hero") { event.preventDefault(); return; } setDragSectionId(section.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", section.id); }} onDragEnd={() => { setDragSectionId(null); setDropSectionId(null); }}><GripVertical className="size-4" /></button>
            <button type="button" className="min-h-10 min-w-0 flex-1 truncate px-2 text-left text-sm" onClick={() => selectSection(section.id)} aria-current={section.id === currentSection?.id ? "true" : undefined}><span className="mr-2 text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>{sectionNames[section.type]}</button>
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background" title={section.visible === false ? "Phần đang ẩn" : "Phần đang hiển thị"} onClick={() => replaceSection(section.id, { visible: section.visible === false })} aria-label={section.visible === false ? `Hiện ${sectionNames[section.type]}` : `Ẩn ${sectionNames[section.type]}`}>{section.visible === false ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button>
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 pointer-events-none hover:bg-background group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto disabled:opacity-30" aria-label={`Đưa ${sectionNames[section.type]} lên`} disabled={index === 0 || section.type === "hero" || currentPage?.sections[index - 1]?.type === "hero"} onClick={() => { const target = currentPage?.sections[index - 1]; if (target) reorderSection(section.id, target.id); }}><ChevronUp className="size-3.5" /></button>
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 pointer-events-none hover:bg-background group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto disabled:opacity-30" aria-label={`Đưa ${sectionNames[section.type]} xuống`} disabled={index === (currentPage?.sections.length ?? 0) - 1 || section.type === "hero"} onClick={() => { const target = currentPage?.sections[index + 1]; if (target) reorderSection(section.id, target.id); }}><ChevronDown className="size-3.5" /></button>
          </div>)}
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
    {!preview && <nav aria-label="Công cụ website trên điện thoại" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(55,35,40,0.08)] backdrop-blur md:hidden">
      <button type="button" className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs text-muted-foreground" aria-label="Mở trang và nội dung" onClick={() => setMobilePanel("structure")}><Menu className="size-4" />Trang & phần</button>
      <button type="button" className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs text-muted-foreground" aria-label="Chỉnh sửa phần đang chọn" onClick={() => setMobilePanel("inspector")}><ImageIcon className="size-4" />Chỉnh sửa</button>
      <button type="button" className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs text-primary" aria-label="Xem trước website" onClick={() => setPreview(true)}><Eye className="size-4" />Xem trước</button>
    </nav>}
    {mobilePanel && !preview && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" role="presentation" onClick={() => setMobilePanel(null)}><section role="dialog" aria-modal="true" aria-label={mobilePanel === "structure" ? "Trang và phần website" : "Chỉnh sửa nội dung website"} className="absolute inset-x-0 bottom-0 flex max-h-[78dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3"><div className="flex gap-1 rounded-lg bg-muted p-1"><button type="button" aria-pressed={mobilePanel === "structure"} className={`rounded-md px-3 py-2 text-sm ${mobilePanel === "structure" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setMobilePanel("structure")}>Trang & phần</button><button type="button" aria-pressed={mobilePanel === "inspector"} className={`rounded-md px-3 py-2 text-sm ${mobilePanel === "inspector" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`} onClick={() => setMobilePanel("inspector")}>Chỉnh sửa</button></div><Button variant="ghost" size="sm" onClick={() => setMobilePanel(null)} aria-label="Đóng bảng chỉnh sửa"><X className="size-4" /></Button></div>
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
          <PublishCheckItem ok={publishCheck?.success === true} title="Cấu trúc và nội dung" detail={publishCheck?.success ? "Không phát hiện lỗi cần chặn xuất bản." : `${publishIssues.length} vị trí cần kiểm tra.`} />
          <PublishCheckItem ok={!dirty && saveState === "saved" && !conflict} title="Bản nháp đã lưu" detail={conflict ? "Có phiên bản mới hơn; hãy tải lại trước." : dirty || saveState !== "saved" ? "Đang có thay đổi chưa được lưu." : `Phiên bản ${version} đã được lưu.`} />
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
        {!publishCanProceed && publishIssues.length === 0 && <p role="status" className="text-sm text-muted-foreground">{conflict ? "Tải phiên bản mới nhất để tiếp tục." : dirty || saveState !== "saved" ? "Đợi bản nháp lưu xong rồi thử lại." : premiumLocked ? "Gói hiện tại chưa hỗ trợ mẫu này." : premiumUnknown ? "Chưa xác minh được quyền dùng mẫu Premium." : "Chưa thể xuất bản ở trạng thái hiện tại."}</p>}
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
    <Modal open={mediaPickerOpen} onClose={() => { setMediaPickerOpen(false); setMediaPickerTarget(null); }} title="Thư viện ảnh cưới" description="Chọn ảnh đã tải lên cho đám cưới này. Ảnh được kiểm tra quyền sở hữu khi lưu website.">
      <div className="space-y-4">
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={mediaSearch} onChange={event => setMediaSearch(event.target.value)} placeholder="Tìm theo tên ảnh hoặc đường dẫn" aria-label="Tìm ảnh trong thư viện" /></label>
        {mediaLibrary.isPending && <LoadingState label="Đang tải thư viện ảnh…" />}
        {mediaLibrary.isError && <ErrorState error={mediaLibrary.error} retry={() => void mediaLibrary.refetch()} />}
        {mediaLibrary.data && (() => {
          const assets = mediaLibrary.data.filter(asset => `${asset.id} ${asset.url}`.toLocaleLowerCase().includes(mediaSearch.toLocaleLowerCase()));
          return assets.length ? <div className="grid max-h-[55dvh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">{assets.map(asset => <button key={asset.id} type="button" className="group overflow-hidden rounded-xl border border-border text-left transition hover:border-primary hover:ring-2 hover:ring-primary/20" onClick={() => { mediaPickerTarget?.(asset.url); setMediaPickerTarget(null); setMediaPickerOpen(false); }}><div className="relative aspect-square bg-muted"><Image src={mediaUrl(asset.url) ?? asset.url} alt="" fill sizes="(max-width: 640px) 50vw, 180px" unoptimized className="object-cover transition group-hover:scale-[1.02]" /></div><span className="block truncate px-2.5 py-2 text-xs text-muted-foreground">{asset.id}</span></button>)}</div> : <div className="rounded-xl border border-dashed border-border p-6 text-center"><ImageIcon className="mx-auto size-6 text-muted-foreground" /><p className="mt-2 text-sm font-medium">{mediaSearch ? "Không tìm thấy ảnh phù hợp" : "Thư viện chưa có ảnh"}</p><p className="mt-1 text-xs text-muted-foreground">Tải ảnh từ phần chỉnh sửa để ảnh xuất hiện tại đây.</p></div>;
        })()}
      </div>
    </Modal>
    {premiumLocked && <div className="border-t border-primary/20 bg-primary/5 p-3"><FeatureLimitNotice title="Mẫu này cần gói hỗ trợ Premium" description="Website đã xuất bản vẫn hoạt động. Hãy nâng cấp gói để lưu hoặc xuất bản thay đổi cho mẫu Premium." upgradeHref={`/weddings/${encodeURIComponent(weddingId)}/plan`} upgradeLabel="Xem các gói" /></div>}
    {premiumUnknown && <div className="border-t border-border p-3"><FeatureLimitNotice title="Chưa xác minh được quyền dùng mẫu Premium" description="Thử lại kiểm tra gói trước khi lưu hoặc xuất bản. Website đang công khai vẫn được giữ nguyên." status="unavailable" variant="compact" retryLabel="Thử lại" onRetry={() => void sitePlan.refetch()} /></div>}
    {sitePlan.isError && !premiumUnknown && <p className="border-t border-border px-3 py-1 text-xs text-muted-foreground">Không thể kiểm tra quyền lợi gói. Website đã xuất bản vẫn giữ nguyên.</p>}
  </div>;
}

function Inspector({ section, page, sectionName, onSection, onContent, onNested, onAppendGalleryImages, onUpload, onChooseMedia, setup, onBinding, onDuplicate, onDelete, pageChange, pageDelete, appearance, paletteId, template, onAppearance, gift, onGift, issues, pageIndex, sectionIndex }: {
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
}) {
  const content = record(section?.content); const [tab, setTab] = useState<"content" | "style">("content");
  const [batchUploading, setBatchUploading] = useState(false); const [batchStatus, setBatchStatus] = useState("");
  if (!section) return <div className="p-5 text-sm text-muted-foreground">Chọn một phần trên canvas hoặc trong danh sách để chỉnh nội dung.</div>;
  const errorAt = (path: readonly PropertyKey[]) => {
    const issue = issues.find(item => item.path.length === path.length && path.every((part, index) => item.path[index] === part));
    return issue ? "Kiểm tra lại nội dung tại đây." : undefined;
  };
  const sectionPath = ["pages", pageIndex, "sections", sectionIndex] as const;
  const contentError = (key: string, ...nested: (string | number)[]) => errorAt([...sectionPath, "content", key, ...nested]);
  const field = (label: string, key: string, placeholder = "", multiline = false) => <Field label={label} value={String(content[key] ?? "")} placeholder={placeholder} multiline={multiline} error={contentError(key)} onChange={value => onContent(key, value)} />;
  const inputClass = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const availableBindings = setupBindings[section.type] ?? [];
  const bindings = section.bindings ?? [];
  const list = (key: "items" | "images" | "events") => Array.isArray(content[key]) ? content[key] as Record<string, unknown>[] : [];
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
    <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3"><p className="text-xs text-muted-foreground">ĐANG CHỈNH SỬA</p><h2 className="mt-1 text-sm font-semibold">{sectionName}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{sectionDescriptions[section.type]}</p></div>
    <div className="flex border-b border-border px-4" role="group" aria-label={`Chỉnh ${sectionName}`}><button type="button" aria-pressed={tab === "content"} className={`border-b-2 px-3 py-2.5 text-sm ${tab === "content" ? "border-primary text-primary-hover" : "border-transparent text-muted-foreground"}`} onClick={() => setTab("content")}>Nội dung</button><button type="button" aria-pressed={tab === "style"} className={`border-b-2 px-3 py-2.5 text-sm ${tab === "style" ? "border-primary text-primary-hover" : "border-transparent text-muted-foreground"}`} onClick={() => setTab("style")}>Kiểu hiển thị</button></div>
    <div className="space-y-5 p-4">
      {page && tab === "content" && <details className="border-b border-border pb-4">
        <summary className="min-h-10 cursor-pointer py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cài đặt trang · {page.title}</summary>
        <div className="mt-3 space-y-3">
          <Field label="Tên trang" value={page.title} error={errorAt(["pages", pageIndex, "title"])} onChange={value => pageChange({ title: value, navigationLabel: page.navigationLabel || value })} />
          <Field label="Nhãn điều hướng" value={page.navigationLabel ?? page.title} error={errorAt(["pages", pageIndex, "navigationLabel"])} onChange={value => pageChange({ navigationLabel: value })} />
          {page.isHome ? <p className="text-xs text-muted-foreground">Trang chủ dùng đường dẫn gốc của website.</p> : <Field label="Đường dẫn" value={page.slug} placeholder="our-story" error={errorAt(["pages", pageIndex, "slug"])} onChange={value => pageChange({ slug: value.toLocaleLowerCase() })} />}
          <label className="flex min-h-10 items-center justify-between text-sm">Hiển thị trang<input type="checkbox" checked={page.visible !== false} onChange={event => pageChange({ visible: event.target.checked })} /></label>
          {!page.isHome && <Button size="sm" variant="outline" className="text-destructive" onClick={pageDelete}><Trash2 className="mr-1.5 size-3.5" />Xóa trang</Button>}
        </div>
      </details>}
      {tab === "content" ? <>
        <Field label="Tiêu đề điều hướng" value={section.navigationLabel ?? ""} error={errorAt([...sectionPath, "navigationLabel"])} onChange={value => onSection({ navigationLabel: value })} placeholder={sectionName} />
        {section.type === "hero" && <>{field("Tiêu đề lớn", "title", "Tên hai bạn hoặc tên đám cưới")}{field("Lời dẫn", "subtitle", "Lời mời ngắn")} {field("Dòng nhấn", "eyebrow", "")}
          <ImageField label="Ảnh bìa" value={String(content.imageUrl ?? "")} placeholder="Dán liên kết ảnh hoặc tải từ thiết bị" error={contentError("imageUrl")} onChange={value => onContent("imageUrl", value)} onUpload={onUpload} onChooseMedia={onChooseMedia} />
        </>}
        {section.type === "couple" && <>{field("Giới thiệu", "intro", "", true)}{(["groom", "bride"] as const).map((personKey, index) => { const person = record(content[personKey]); return <fieldset key={personKey} className="space-y-3 border-t border-border pt-4"><legend className="px-1 text-xs font-semibold text-muted-foreground">{index === 0 ? "Chú rể" : "Cô dâu"}</legend><Field label="Tên hiển thị" value={String(person.displayName ?? person.fullName ?? "")} error={contentError(personKey, "displayName")} onChange={value => onNested(personKey, "displayName", value)} /><Field label="Giới thiệu" value={String(person.bio ?? "")} multiline error={contentError(personKey, "bio")} onChange={value => onNested(personKey, "bio", value)} /><ImageField label="Ảnh chân dung" value={String(person.photoUrl ?? "")} error={contentError(personKey, "photoUrl")} onChange={value => onNested(personKey, "photoUrl", value)} onUpload={onUpload} onChooseMedia={onChooseMedia} /></fieldset>; })}</>}
        {section.type === "countdown" && <>{field("Tiêu đề", "title")}<DateTimeField label="Ngày giờ mục tiêu" value={String(content.targetDate ?? "")} timeZone={setup.timeZoneId} error={contentError("targetDate")} onChange={value => onContent("targetDate", value)} /></>}
        {section.type === "loveStory" && <>{field("Giới thiệu", "intro", "", true)}<div className="space-y-3">{list("items").map((item, index) => <fieldset key={String(item.id)} className="space-y-3 rounded-xl border border-border p-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Dấu mốc {index + 1} / {list("items").length}</span><button type="button" className="min-h-10 rounded-lg px-2 text-sm text-destructive hover:bg-destructive/5" onClick={() => onContent("items", list("items").filter((_, i) => i !== index))}>Xóa</button></div><Field label="Tiêu đề" value={String(item.title ?? "")} error={contentError("items", index, "title")} onChange={value => onContent("items", list("items").map((entry, i) => i === index ? { ...entry, title: value } : entry))} /><Field label="Ngày hoặc dấu mốc" value={String(item.date ?? "")} error={contentError("items", index, "date")} onChange={value => onContent("items", list("items").map((entry, i) => i === index ? { ...entry, date: value } : entry))} /><Field label="Mô tả" value={String(item.body ?? "")} multiline error={contentError("items", index, "body")} onChange={value => onContent("items", list("items").map((entry, i) => i === index ? { ...entry, body: value } : entry))} /><ImageField label="Ảnh dấu mốc" value={String(item.imageUrl ?? "")} error={contentError("items", index, "imageUrl")} onChange={value => onContent("items", list("items").map((entry, i) => i === index ? { ...entry, imageUrl: value } : entry))} onUpload={onUpload} onChooseMedia={onChooseMedia} /><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => onContent("items", moveItem(list("items"), index, -1))}><ChevronUp className="mr-1 size-3.5" />Lên</Button><Button type="button" size="sm" variant="outline" disabled={index === list("items").length - 1} onClick={() => onContent("items", moveItem(list("items"), index, 1))}><ChevronDown className="mr-1 size-3.5" />Xuống</Button></div></fieldset>)}<Button type="button" size="sm" variant="outline" disabled={list("items").length >= 20} onClick={() => onContent("items", [...list("items"), { id: id(), title: "", date: "", body: "" }])}><Plus className="mr-1 size-3.5" />{list("items").length >= 20 ? "Đã đạt tối đa 20 dấu mốc" : "Thêm dấu mốc"}</Button></div></>}
        {section.type === "gallery" && <>{field("Giới thiệu album", "intro", "", true)}<div className="space-y-3">{list("images").map((image, index) => <fieldset key={String(image.id)} className="rounded-xl border border-border p-3"><div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">Ảnh {index + 1} / {list("images").length}</span><button type="button" className="grid size-9 place-items-center rounded-lg text-destructive hover:bg-destructive/5" aria-label={`Xóa ảnh ${index + 1}`} onClick={() => onContent("images", list("images").filter((_, i) => i !== index))}><Trash2 className="size-4" /></button></div><ImageField label="Ảnh album" value={String(image.imageUrl ?? "")} error={contentError("images", index, "imageUrl")} onChange={value => onContent("images", list("images").map((entry, i) => i === index ? { ...entry, imageUrl: value } : entry))} onUpload={onUpload} onChooseMedia={onChooseMedia} /><Field label="Mô tả ảnh (văn bản thay thế)" value={String(image.alt ?? "")} placeholder="Mô tả ngắn nội dung ảnh" error={contentError("images", index, "alt")} onChange={value => onContent("images", list("images").map((entry, i) => i === index ? { ...entry, alt: value } : entry))} /><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => onContent("images", moveItem(list("images"), index, -1))}><ChevronUp className="mr-1 size-3.5" />Lên</Button><Button type="button" size="sm" variant="outline" disabled={index === list("images").length - 1} onClick={() => onContent("images", moveItem(list("images"), index, 1))}><ChevronDown className="mr-1 size-3.5" />Xuống</Button></div></fieldset>)}{list("images").length < 30 && <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted ${batchUploading ? "pointer-events-none opacity-60" : ""}`}><Upload className="size-4" />{batchUploading ? "Đang tải album…" : "Chọn ảnh cho album"}<input type="file" multiple disabled={batchUploading} accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void uploadGalleryBatch(files); }} /></label>}{list("images").length >= 30 && <p className="text-xs text-muted-foreground">Album đã đạt giới hạn 30 ảnh.</p>}{batchStatus && <p aria-live="polite" role="status" className="text-xs text-muted-foreground">{batchStatus}</p>}</div></>}
        {section.type === "events" && <><Field label="Giới thiệu" value={String(content.intro ?? "")} multiline error={contentError("intro")} onChange={value => onContent("intro", value)} /><div className="space-y-3">{list("events").map((event, index) => <fieldset key={String(event.id)} className="space-y-3 rounded-xl border border-border p-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Sự kiện {index + 1} / {list("events").length}</span><button type="button" className="min-h-10 rounded-lg px-2 text-sm text-destructive hover:bg-destructive/5" onClick={() => onContent("events", list("events").filter((_, i) => i !== index))}>Xóa</button></div><Field label="Tên sự kiện" value={String(event.title ?? "")} placeholder="Lễ cưới" error={contentError("events", index, "title")} onChange={value => onContent("events", list("events").map((entry, i) => i === index ? { ...entry, title: value } : entry))} /><DateTimeField label="Ngày giờ" value={String(event.startsAt ?? "")} timeZone={String(event.timeZoneId ?? setup.timeZoneId ?? "Asia/Ho_Chi_Minh")} error={contentError("events", index, "startsAt")} onChange={value => onContent("events", list("events").map((entry, i) => i === index ? { ...entry, startsAt: value, timeZoneId: String(event.timeZoneId ?? setup.timeZoneId ?? "Asia/Ho_Chi_Minh") } : entry))} /><Field label="Địa điểm" value={String(event.venueName ?? "")} error={contentError("events", index, "venueName")} onChange={value => onContent("events", list("events").map((entry, i) => i === index ? { ...entry, venueName: value } : entry))} /><Field label="Địa chỉ" value={String(event.address ?? "")} error={contentError("events", index, "address")} onChange={value => onContent("events", list("events").map((entry, i) => i === index ? { ...entry, address: value } : entry))} /><Field label="Link bản đồ HTTPS" value={String(event.mapUrl ?? "")} error={contentError("events", index, "mapUrl")} onChange={value => onContent("events", list("events").map((entry, i) => i === index ? { ...entry, mapUrl: value } : entry))} /><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => onContent("events", moveItem(list("events"), index, -1))}><ChevronUp className="mr-1 size-3.5" />Lên</Button><Button type="button" size="sm" variant="outline" disabled={index === list("events").length - 1} onClick={() => onContent("events", moveItem(list("events"), index, 1))}><ChevronDown className="mr-1 size-3.5" />Xuống</Button></div></fieldset>)}<Button type="button" size="sm" variant="outline" disabled={list("events").length >= 20} onClick={() => onContent("events", [...list("events"), { id: id(), title: "Sự kiện mới" }])}><Plus className="mr-1 size-3.5" />{list("events").length >= 20 ? "Đã đạt tối đa 20 sự kiện" : "Thêm sự kiện"}</Button></div></>}
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
        {template && <>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Bảng màu
            <select className={inputClass} value={paletteId} onChange={event => onAppearance({ paletteId: event.target.value })}>{template.config.palettes.map(palette => <option key={palette.id} value={palette.id}>{palette.label}</option>)}</select>
          </label>
          {(["fontHeading", "fontBody"] as const).map(key => <label key={key} className="grid gap-1.5 text-xs font-medium text-muted-foreground">{key === "fontHeading" ? "Phông tiêu đề" : "Phông nội dung"}
            <select className={inputClass} value={appearance[key] ?? template.config.theme[key]} onChange={event => onAppearance({ [key]: event.target.value })}>{template.config.allowedFonts.map(font => <option key={font} value={font}>{font}</option>)}</select>
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
          <select className={inputClass} value={section.style?.animation ?? "none"} onChange={event => onSection({ style: { ...section.style, animation: event.target.value as "none" | "fade" } })}><option value="none">Không chuyển động</option><option value="fade">Hiện nhẹ khi tải trang</option></select>
          <span className="text-[11px] font-normal leading-5">Tự tắt hiệu ứng khi thiết bị bật giảm chuyển động.</span>
        </label>
      </>}
      <div className="flex gap-2 border-t border-border pt-4"><Button type="button" size="sm" variant="outline" onClick={onDuplicate} disabled={section.type === "hero"}><Copy className="mr-1.5 size-3.5" />Nhân bản</Button><Button type="button" size="sm" variant="outline" className="text-destructive" onClick={onDelete} disabled={section.type === "hero" && page?.sections.length === 1}><Trash2 className="mr-1.5 size-3.5" />Xóa phần</Button></div>
    </div>
  </div>;
}

const variantOptions: Record<SectionType, string[]> = { hero: ["floral", "dark", "split", "editorial", "ceremonial"], couple: ["alternating", "two-columns", "editorial"], countdown: ["classic", "banner", "inline"], loveStory: ["timeline", "editorial"], events: ["cards", "minimal"], gallery: ["grid", "masonry"], rsvp: ["default"], wishes: ["default"], gift: ["default", "minimal"] };
const variantNames: Record<string, string> = { floral: "Hoa nhẹ nhàng", dark: "Nền trầm", split: "Chia đôi", editorial: "Biên tập", ceremonial: "Trang trọng", alternating: "Xen kẽ", "two-columns": "Hai cột", classic: "Cổ điển", banner: "Dải ngang", inline: "Ngang gọn", timeline: "Dòng thời gian", cards: "Thẻ sự kiện", minimal: "Tối giản", grid: "Lưới", masonry: "So le", default: "Mặc định" };
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

function Field({ label, value, placeholder, multiline, maxLength, error, onChange }: { label: string; value: string; placeholder?: string; multiline?: boolean; maxLength?: number; error?: string; onChange: (value: string) => void }) {
  const errorId = useId();
  const className = `w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${error ? "border-destructive focus-visible:ring-destructive" : "border-input"}`;
  return <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{label}{multiline ? <textarea maxLength={maxLength} className={`${className} min-h-20 resize-y`} value={value} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => onChange(event.target.value)} /> : <input maxLength={maxLength} className={`${className} h-10`} value={value} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={event => onChange(event.target.value)} />}{error && <span id={errorId} role="alert" className="font-normal text-destructive">{error}</span>}</label>;
}

function DateTimeField({ label, value, timeZone, error, onChange }: { label: string; value: string; timeZone?: string; error?: string; onChange: (value: string | undefined) => void }) {
  const [draft, setDraft] = useState(() => ({ sourceValue: value, sourceTimeZone: timeZone, localValue: isoToLocalDateTime(value, timeZone), conversionError: "" }));
  const errorId = useId();
  if (draft.sourceValue !== value || draft.sourceTimeZone !== timeZone) {
    setDraft({ sourceValue: value, sourceTimeZone: timeZone, localValue: isoToLocalDateTime(value, timeZone), conversionError: "" });
  }
  const displayedError = error ?? draft.conversionError;
  return <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">{label}
    <input type="datetime-local" value={draft.localValue} aria-invalid={Boolean(displayedError)} aria-describedby={displayedError ? errorId : undefined} className={`h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${displayedError ? "border-destructive focus-visible:ring-destructive" : "border-input"}`} onChange={event => {
      const next = event.target.value;
      if (!next) { setDraft(current => ({ ...current, localValue: "", conversionError: "" })); onChange(undefined); return; }
      try { onChange(localDateTimeToIso(next, timeZone)); setDraft(current => ({ ...current, localValue: next, conversionError: "" })); }
      catch { setDraft(current => ({ ...current, localValue: next, conversionError: "Thời điểm này không hợp lệ theo múi giờ của đám cưới." })); }
    }} />
    <span className="font-normal">Múi giờ: {timeZone || "Asia/Ho_Chi_Minh"}</span>
    {displayedError && <span id={errorId} role="alert" className="font-normal text-destructive">{displayedError}</span>}
  </label>;
}

function ImageField({ label, value, placeholder, error, onChange, onUpload, onChooseMedia }: { label: string; value: string; placeholder?: string; error?: string; onChange: (value: string) => void; onUpload: (file: File) => Promise<string | null>; onChooseMedia: (onChoose: (url: string) => void) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const inputId = useId();
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
    <Field label={label} value={value} placeholder={placeholder ?? "Dán liên kết ảnh hoặc tải từ thiết bị"} error={error} onChange={onChange} />
    {value.trim() && <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-2">
      <Image src={mediaUrl(value) ?? value} alt="" aria-hidden="true" width={56} height={56} unoptimized className="size-14 shrink-0 rounded-md object-cover" />
      <span className="min-w-0 break-all text-xs text-muted-foreground">Ảnh xem trước</span>
    </div>}
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={inputId} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted ${uploading ? "pointer-events-none opacity-60" : ""}`}><Upload className="size-3.5" />{uploading ? "Đang tải ảnh…" : value ? "Thay ảnh" : "Tải ảnh"}</label>
      <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void selectImage(file); }} />
      <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => onChooseMedia(onChange)}><ImageIcon className="mr-1.5 size-3.5" />Chọn từ thư viện</Button>
      {uploading && <span role="status" aria-live="polite" className="text-xs text-muted-foreground">Đang tải ảnh lên…</span>}
    </div>
    {uploadError && <p role="alert" className="text-xs text-destructive">{uploadError}</p>}
  </div>;
}
