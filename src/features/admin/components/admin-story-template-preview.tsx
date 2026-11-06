"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2, Monitor, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
// eslint-disable-next-line architecture/boundaries -- Admin preview deliberately uses the public V4 website renderer so admin and couple previews stay identical.
import {
  createStoryBuilderV4Document,
  StoryBuilderV4Renderer,
  type StoryTemplateSummaryV4,
  type WeddingSetup,
} from "@/features/weddings";
import type { StoryTemplateConfig } from "../api/admin.api";

const previewSetup: WeddingSetup = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "An & Minh",
  slug: "an-minh-preview",
  eventDateTime: "2027-12-18T10:00:00+07:00",
  venueName: "Nhà hàng Hoa Viên",
  venueAddress: "Quận 1, Thành phố Hồ Chí Minh",
  capacity: null,
  rsvpDeadline: "2027-12-11T10:00:00+07:00",
  coverImageUrl: "/images/template-studio/story-collection/photo-39.webp",
  timeZoneId: "Asia/Ho_Chi_Minh",
  status: "DRAFT",
  version: 1,
  createdAt: "2026-01-01T00:00:00+07:00",
  updatedAt: "2026-01-01T00:00:00+07:00",
};

const previewContent = {
  title: "An & Minh",
  content: {
    heroImageUrl: "/images/template-studio/story-collection/photo-39.webp",
    groom: {
      displayName: "Minh",
      photoUrl: "/images/template-studio/story-collection/photo-39-groom.webp",
    },
    bride: {
      displayName: "An",
      photoUrl: "/images/template-studio/story-collection/photo-39-bride.webp",
    },
    events: [
      {
        id: "wedding-day",
        title: "Lễ thành hôn",
        startsAt: "2027-12-18T10:00:00+07:00",
        timeZoneId: "Asia/Ho_Chi_Minh",
        venueName: "Nhà hàng Hoa Viên",
        address: "Quận 1, Thành phố Hồ Chí Minh",
      },
    ],
    loveStory: {
      enabled: true,
      intro: "Một ngày bình thường đã mở ra câu chuyện đặc biệt.",
      items: [],
    },
    gallery: [
      {
        id: "preview-photo",
        imageUrl: "/images/template-studio/story-collection/photo-39.webp",
        alt: "Ảnh cưới xem thử",
      },
    ],
    gift: { enabled: false },
    wishesEnabled: true,
  },
};

type Props = {
  config: StoryTemplateConfig;
  version: number;
  viewport: "desktop" | "tablet" | "mobile";
  onViewportChange?: (viewport: "desktop" | "tablet" | "mobile") => void;
};

const viewportSizes = {
  desktop: { width: 1100, height: 720, label: "Desktop" },
  tablet: { width: 768, height: 900, label: "Tablet" },
  mobile: { width: 390, height: 844, label: "Mobile" },
} as const;

const viewportOptions = [
  { id: "desktop", Icon: Monitor },
  { id: "tablet", Icon: Tablet },
  { id: "mobile", Icon: Smartphone },
] as const;

export function AdminStoryTemplatePreview({ config, version, viewport, onViewportChange }: Props) {
  const { t } = useTranslation("ui");
  const [expanded, setExpanded] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const preview = useMemo(() => {
    try {
      const template: StoryTemplateSummaryV4 = {
        key: config.key,
        name: config.name,
        version,
        config,
      };
      return {
        document: createStoryBuilderV4Document(template, previewSetup, previewContent, { showTemplateDefaults: true }),
        error: false,
      };
    } catch {
      return { document: null, error: true };
    }
  }, [config, version]);
  const { document, error: previewError } = preview;
  const dimensions = viewportSizes[viewport];

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setStageSize({ width: stage.clientWidth - 32, height: stage.clientHeight - 32 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [expanded, viewport]);

  const scale = stageSize.width > 0 && stageSize.height > 0
    ? Math.max(0.2, Math.min(1, stageSize.width / dimensions.width, stageSize.height / dimensions.height))
    : 1;
  const screenWidth = dimensions.width * scale;
  const screenHeight = dimensions.height * scale;
  const renderSurface = (modal: boolean) => (
    <div
      ref={expanded === modal ? stageRef : undefined}
      className="flex w-full items-start justify-center overflow-hidden rounded-xl bg-[#f3eeec] p-4"
      style={{ height: modal ? "min(68vh, 720px)" : 460 }}
    >
      <div className="relative shrink-0" style={{ width: screenWidth, height: screenHeight }}>
        <div
          className={`absolute left-0 top-0 overflow-hidden bg-background shadow-xl ${
            viewport === "desktop"
              ? "rounded-lg border border-border"
              : viewport === "tablet"
                ? "rounded-[1.5rem] border-[5px] border-[#43383a] p-1"
                : "rounded-[2.25rem] border-[6px] border-[#332a2c] p-1"
          }`}
          style={{
            width: dimensions.width,
            height: dimensions.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[inherit] bg-background">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-white px-3 text-[11px] text-muted-foreground">
              {viewport === "desktop" && <span className="flex shrink-0 gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-[#e7aaa9]" />
                <span className="size-2.5 rounded-full bg-[#e9d8b6]" />
                <span className="size-2.5 rounded-full bg-[#bdd0bb]" />
              </span>}
              {viewport !== "desktop" && <span className="h-1 w-10 shrink-0 rounded-full bg-[#ddd5d3]" aria-hidden="true" />}
              <div className="min-w-0 flex-1 truncate rounded-full border border-border bg-[#faf8f7] px-3 py-1 text-center">
                {`inviteme.asia/xem-truoc/${config.key || "mau-website"}`}
              </div>
              <span className="shrink-0 font-mono text-[10px]">{dimensions.width} × {dimensions.height}</span>
            </div>
            <div
              className="min-h-0 flex-1 overflow-auto overscroll-contain bg-background"
              aria-label={t("storyTemplates.previewTitle")}
              onWheel={(event) => {
                if (scale >= 0.99) return;
                event.preventDefault();
                event.currentTarget.scrollTop += event.deltaY / scale;
              }}
            >
              {document ? (
                <StoryBuilderV4Renderer document={document} />
              ) : (
                <div className="grid min-h-96 place-content-center px-6 text-center">
                  <p className="font-display text-2xl" style={{ color: config.theme.colors.text }}>
                    {config.name || t("storyTemplates.previewUntitled")}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {previewError ? t("storyTemplates.previewError") : t("storyTemplates.previewLoading")}
                  </p>
                  <div className="mx-auto mt-5 flex gap-2" aria-label={t("storyTemplates.palettePreview")}>
                    {[config.theme.colors.primary, config.theme.colors.background, config.theme.colors.accent, config.theme.colors.text].map((color, index) => (
                      <span key={`${color}-${index}`} className="size-7 rounded-full border border-black/10" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
    <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label={t("storyTemplates.previewTitle")}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{t("storyTemplates.previewTitle")}</p>
          <h3 className="mt-1 truncate text-sm font-semibold">{config.name || t("storyTemplates.previewUntitled")}</h3>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{config.key || "—"} · v{version}</p>
        </div>
        <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setExpanded(true)}>
          <Maximize2 className="mr-2 size-4" />{t("storyTemplates.previewExpand")}
        </Button>
      </header>
      {renderSurface(false)}
    </section>
    <Modal
      open={expanded}
      onClose={() => setExpanded(false)}
      title={t("storyTemplates.previewTitle")}
      description={`${config.name || t("storyTemplates.previewUntitled")} · ${t("storyTemplates.previewModalDescription")}`}
      size="wide"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-mono text-muted-foreground">{config.key || "—"} · v{version}</p>
          {onViewportChange && <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label={t("storyTemplates.previewSize")}>
            {viewportOptions.map(({ id, Icon }) => (
              <Button key={id} type="button" size="sm" variant={viewport === id ? "default" : "ghost"} aria-pressed={viewport === id} onClick={() => onViewportChange(id)} className="gap-1.5 px-2.5">
                <Icon className="size-4" /><span>{t(`storyTemplates.viewports.${id}`)}</span>
              </Button>
            ))}
          </div>}
        </div>
        {renderSurface(true)}
      </div>
    </Modal>
    </>
  );
}
