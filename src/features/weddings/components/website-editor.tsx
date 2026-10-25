"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Eye,
  Globe,
  LoaderCircle,
  Palette,
  RefreshCw,
  X,
} from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { Button } from "@/shared/ui/button";
import { usePermission } from "@/shared/components/permission-guard";
import { SessionLoading } from "@/shared/feedback/session-loading";
import { ErrorState } from "@/shared/feedback/error-state";
import {
  getWebsite,
  isStudioDocument,
  listWeddingMedia,
  mediaUrl,
  publishWebsite,
  saveWebsite,
  unpublishWebsite,
  uploadWeddingMedia,
  type StudioDocument,
  type Website,
} from "../api/website.api";
import { getWeddingSetup } from "../api/wedding.api";
import { weddingKeys } from "../api/wedding.keys";
// eslint-disable-next-line architecture/boundaries -- Website editor composes weddings API with Studio components
import {
  storyTemplateCatalog,
  TemplateStudio,
  TemplateThumbnail,
  WebsiteStoryRenderer,
  StudioModeContext,
} from "@/features/template-studio";

export function WebsiteEditor({ weddingId }: { weddingId: string }) {
  const { api } = useRuntime();

  const websiteQuery = useQuery({
    queryKey: ["website", weddingId],
    queryFn: ({ signal }) => getWebsite(api, weddingId, signal),
  });

  const setupQuery = useQuery({
    queryKey: weddingKeys.detail(weddingId),
    queryFn: ({ signal }) => getWeddingSetup(api, weddingId, signal),
  });

  if (websiteQuery.isPending || setupQuery.isPending) {
    return <SessionLoading />;
  }

  if (websiteQuery.isError) {
    return (
      <ErrorState
        error={websiteQuery.error}
        retry={() => void websiteQuery.refetch()}
      />
    );
  }

  const site = websiteQuery.data;
  const slug = setupQuery.data?.slug ?? "";

  return <WebsiteManager weddingId={weddingId} site={site} slug={slug} />;
}

function WebsiteManager({
  weddingId,
  site,
  slug,
}: {
  weddingId: string;
  site: Website;
  slug: string;
}) {
  const initialStudioDoc =
    site.document && isStudioDocument(site.document) ? site.document : null;

  const [activeDocument, setActiveDocument] = useState<StudioDocument | null>(
    initialStudioDoc,
  );
  const [showPicker, setShowPicker] = useState<boolean>(!initialStudioDoc);

  function handleSelectTemplate(template: (typeof storyTemplateCatalog)[number]) {
    // Copy the catalog template document as the wedding's draft
    const copied: StudioDocument = JSON.parse(
      JSON.stringify({ ...template.document, templateId: template.id }),
    );
    setActiveDocument(copied);
    setShowPicker(false);
  }

  function handleRequestChangeTemplate(hasUnsavedChanges: boolean) {
    if (
      hasUnsavedChanges &&
      !window.confirm(
        "Bạn có thay đổi chưa lưu. Bạn có chắc muốn đổi mẫu và hủy các thay đổi này không?",
      )
    ) {
      return;
    }
    setShowPicker(true);
  }

  if (showPicker || !activeDocument) {
    return (
      <StoryTemplatePicker
        hasActiveDraft={!!activeDocument}
        onCancel={() => setShowPicker(false)}
        onSelect={handleSelectTemplate}
      />
    );
  }

  return (
    <WebsiteStudioSession
      key={activeDocument.templateId ?? "studio-session"}
      weddingId={weddingId}
      site={site}
      slug={slug}
      document={activeDocument}
      onChangeTemplateRequest={handleRequestChangeTemplate}
    />
  );
}

function StoryTemplatePicker({
  hasActiveDraft,
  onCancel,
  onSelect,
}: {
  hasActiveDraft: boolean;
  onCancel: () => void;
  onSelect: (template: (typeof storyTemplateCatalog)[number]) => void;
}) {
  const [previewTemplate, setPreviewTemplate] = useState<
    (typeof storyTemplateCatalog)[number] | null
  >(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Chọn mẫu Wedding Story
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Khám phá các mẫu website đám cưới được thiết kế sẵn. Chọn một mẫu để bắt đầu tùy chỉnh cho ngày vui của bạn.
          </p>
        </div>
        {hasActiveDraft && (
          <Button variant="outline" onClick={onCancel}>
            <ArrowLeft className="mr-2 size-4" />
            Quay lại bản chỉnh sửa hiện tại
          </Button>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {storyTemplateCatalog.map((template) => (
          <article
            key={template.id}
            className="flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md"
          >
            <div>
              <button
                type="button"
                className="group relative block w-full overflow-hidden rounded-xl bg-muted focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => setPreviewTemplate(template)}
                aria-label={`Xem trước mẫu: ${template.name}`}
              >
                <TemplateThumbnail document={template.document} fluid />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-gray-900 shadow">
                    <Eye className="size-3.5" />
                    Xem trước
                  </span>
                </div>
              </button>

              <h2 className="mt-4 font-display text-xl font-semibold text-card-foreground">
                {template.name}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {template.description}
              </p>
            </div>

            <div className="mt-5 flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPreviewTemplate(template)}
              >
                <Eye className="mr-1.5 size-4" />
                Xem trước
              </Button>
              <Button
                className="flex-1"
                onClick={() => onSelect(template)}
              >
                <Check className="mr-1.5 size-4" />
                Chọn mẫu
              </Button>
            </div>
          </article>
        ))}
      </div>

      {previewTemplate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Xem trước: ${previewTemplate.name}`}
          className="fixed inset-0 z-[120] flex flex-col bg-background/95 backdrop-blur-sm"
        >
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewTemplate(null)}
              >
                <ArrowLeft className="mr-1.5 size-4" />
                Đóng
              </Button>
              <span className="font-semibold text-foreground">
                {previewTemplate.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  const selected = previewTemplate;
                  setPreviewTemplate(null);
                  onSelect(selected);
                }}
              >
                <Check className="mr-1.5 size-4" />
                Chọn mẫu này
              </Button>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Đóng xem trước"
              >
                <X className="size-5" />
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-auto">
            <WebsiteStoryRenderer document={previewTemplate.document} />
          </div>
        </div>
      )}
    </div>
  );
}

function WebsiteStudioSession({
  weddingId,
  site,
  slug,
  document,
  onChangeTemplateRequest,
}: {
  weddingId: string;
  site: Website;
  slug: string;
  document: StudioDocument;
  onChangeTemplateRequest: (hasUnsavedChanges: boolean) => void;
}) {
  const { api } = useRuntime();
  const { isOwner } = usePermission();
  const cache = useQueryClient();

  const [version, setVersion] = useState(site.version);
  const [status, setStatus] = useState(site.status);
  const [hasUnpublished, setHasUnpublished] = useState(site.hasUnpublishedChanges);
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [generation, setGeneration] = useState(0);
  const [isDirty, setIsDirty] = useState(false);

  const remoteConflict = version !== site.version;

  async function handlePublish() {
    if (!isOwner || busy) return;
    setBusy(true);
    setActionMessage("");
    try {
      const updated = await publishWebsite(api, weddingId, version);
      setVersion(updated.version);
      setStatus(updated.status);
      setHasUnpublished(updated.hasUnpublishedChanges);
      cache.setQueryData(["website", weddingId], updated);
      setActionMessage("Đã xuất bản website thành công!");
    } catch {
      setActionMessage("Xuất bản website thất bại. Vui lòng thử lại.");
      void cache.invalidateQueries({ queryKey: ["website", weddingId] });
    } finally {
      setBusy(false);
    }
  }

  async function handleUnpublish() {
    if (!isOwner || busy) return;
    setBusy(true);
    setActionMessage("");
    try {
      const updated = await unpublishWebsite(api, weddingId, version);
      setVersion(updated.version);
      setStatus(updated.status);
      setHasUnpublished(updated.hasUnpublishedChanges);
      cache.setQueryData(["website", weddingId], updated);
      setActionMessage("Đã gỡ xuất bản website.");
    } catch {
      setActionMessage("Gỡ website thất bại. Vui lòng thử lại.");
      void cache.invalidateQueries({ queryKey: ["website", weddingId] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {remoteConflict && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm"
        >
          <span>
            Website đã được cập nhật từ một phiên làm việc khác (phiên bản {site.version}).
          </span>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-600 bg-white text-amber-900 hover:bg-amber-100"
            onClick={() => {
              setVersion(site.version);
              setStatus(site.status);
              setHasUnpublished(site.hasUnpublishedChanges);
              setIsDirty(false);
              setGeneration((g) => g + 1);
            }}
          >
            <RefreshCw className="mr-1.5 size-3.5" />
            Tải lại và hủy thay đổi chưa lưu
          </Button>
        </div>
      )}

      {/* Website Control Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Globe className="size-5 text-primary" />
            <h1 className="font-display text-lg font-semibold text-foreground">
              Wedding Story Studio
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                status === "PUBLISHED"
                  ? "bg-emerald-100 text-emerald-800"
                  : status === "UNPUBLISHED"
                    ? "bg-rose-100 text-rose-800"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {status === "PUBLISHED"
                ? "Đã xuất bản"
                : status === "UNPUBLISHED"
                  ? "Đã gỡ xuất bản"
                  : "Bản nháp"}
            </span>

            {hasUnpublished && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                Chưa xuất bản thay đổi
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actionMessage && (
            <span role="status" className="text-xs font-medium text-muted-foreground mr-2">
              {actionMessage}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onChangeTemplateRequest(isDirty)}
          >
            <Palette className="mr-1.5 size-4" />
            Đổi mẫu Story
          </Button>

          {status === "PUBLISHED" && slug && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/wedding/${encodeURIComponent(slug)}`} target="_blank">
                <ExternalLink className="mr-1.5 size-4" />
                Xem trang web
              </Link>
            </Button>
          )}

          {status === "PUBLISHED" && isOwner && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void handleUnpublish()}
            >
              {busy ? <LoaderCircle className="mr-1.5 size-4 animate-spin" /> : null}
              Gỡ xuất bản
            </Button>
          )}

          {isOwner && (
            <Button
              size="sm"
              disabled={busy || (!hasUnpublished && status === "PUBLISHED")}
              onClick={() => void handlePublish()}
            >
              {busy ? <LoaderCircle className="mr-1.5 size-4 animate-spin" /> : null}
              Xuất bản
            </Button>
          )}
        </div>
      </header>

      {/* Studio Workspace Container */}
      <div className="relative h-[calc(100vh-210px)] min-h-[720px] w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm flex flex-col [&_.studio]:h-full [&_.studio]:min-h-0 [&_.studio]:flex-1 [&_.studio]:p-0">
        <StudioModeContext.Provider value="website">
          <TemplateStudio
            key={generation}
            initialDocument={JSON.stringify(document)}
            availableTemplates={storyTemplateCatalog}
            loadImages={async () =>
              (await listWeddingMedia(api, weddingId)).map((item) => ({
                src: mediaUrl(item.url) ?? item.url,
                name: `Ảnh cưới ${item.id.slice(0, 8)}`,
              }))
            }
            onUploadImage={async (file) => {
              const uploaded = await uploadWeddingMedia(api, weddingId, file);
              return {
                src: mediaUrl(uploaded.url) ?? uploaded.url,
                name: file.name,
              };
            }}
            onSave={async (serialized) => {
              setIsDirty(false);
              const saved = await saveWebsite(api, weddingId, version, serialized);
              setVersion(saved.version);
              setHasUnpublished(saved.hasUnpublishedChanges);
              cache.setQueryData(["website", weddingId], saved);
              setActionMessage("Đã lưu bản nháp website.");
            }}
          />
        </StudioModeContext.Provider>
      </div>
    </div>
  );
}
