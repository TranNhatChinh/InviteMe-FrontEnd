"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2, Monitor, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
// eslint-disable-next-line architecture/boundaries -- Admin preview deliberately uses the public V4 website renderer so admin and couple previews stay identical.
import {
  createStoryBuilderV4Document,
  StoryTemplateDevicePreview,
  storyTemplatePreviewContent,
  storyTemplatePreviewSetup,
  type StoryTemplateSummaryV4,
} from "@/features/weddings";
import type { StoryTemplateConfig } from "../api/admin.api";

type Props = {
  config: StoryTemplateConfig;
  version: number;
  viewport: "desktop" | "tablet" | "mobile";
  onViewportChange?: (viewport: "desktop" | "tablet" | "mobile") => void;
};

const viewportOptions = [
  { id: "desktop", Icon: Monitor },
  { id: "tablet", Icon: Tablet },
  { id: "mobile", Icon: Smartphone },
] as const;

export function AdminStoryTemplatePreview({ config, version, viewport, onViewportChange }: Props) {
  const { t } = useTranslation("ui");
  const [expanded, setExpanded] = useState(false);
  const preview = useMemo(() => {
    try {
      const template: StoryTemplateSummaryV4 = {
        key: config.key,
        name: config.name,
        version,
        config,
      };
      return {
        document: createStoryBuilderV4Document(template, storyTemplatePreviewSetup, storyTemplatePreviewContent, { showTemplateDefaults: true }),
        error: false,
      };
    } catch {
      return { document: null, error: true };
    }
  }, [config, version]);
  const { document, error: previewError } = preview;
  const fallback = (
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
      <StoryTemplateDevicePreview
        document={document}
        viewport={viewport}
        url={`inviteme.asia/xem-truoc/${config.key || "mau-website"}`}
        fallback={fallback}
      />
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
        <StoryTemplateDevicePreview
          document={document}
          viewport={viewport}
          url={`inviteme.asia/xem-truoc/${config.key || "mau-website"}`}
          height="min(68vh, 720px)"
          fallback={fallback}
        />
      </div>
    </Modal>
    </>
  );
}
