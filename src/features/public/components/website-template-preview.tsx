"use client";

import { useMemo, useState } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/language-context";
import { Button } from "@/shared/ui/button";
// eslint-disable-next-line architecture/boundaries -- Public demo shares the builder renderer and sample document factory.
import {
  createStoryBuilderV4Document,
  StoryTemplateDevicePreview,
  storyTemplatePreviewContent,
  storyTemplatePreviewSetup,
  type StoryTemplateSummaryV4,
} from "@/features/weddings";

export function WebsitePreview({ template }: { template: StoryTemplateSummaryV4 }) {
  const { t } = useTranslation("ui");
  const { language } = useLocale();
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const document = useMemo(() => {
    try { return createStoryBuilderV4Document(template, storyTemplatePreviewSetup, storyTemplatePreviewContent, { showTemplateDefaults: true }); }
    catch { return null; }
  }, [template]);
  const viewports = [
    { id: "desktop", Icon: Monitor },
    { id: "tablet", Icon: Tablet },
    { id: "mobile", Icon: Smartphone },
  ] as const;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("catalog.previewSample", { defaultValue: language === "vi" ? "Thông tin trong bản xem thử chỉ mang tính minh họa." : "This preview uses sample information." })}
        </p>
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label={t("storyTemplates.previewSize")}>
          {viewports.map(({ id, Icon }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={viewport === id ? "default" : "ghost"}
              aria-pressed={viewport === id}
              onClick={() => setViewport(id)}
              className="gap-1.5 px-2.5"
            >
              <Icon className="size-4" />
              <span>{t(`storyTemplates.viewports.${id}`)}</span>
            </Button>
          ))}
        </div>
      </div>
      <StoryTemplateDevicePreview
        document={document}
        viewport={viewport}
        url={`inviteme.asia/xem-truoc/${template.key || "mau-website"}`}
        height="min(68vh, 720px)"
        fallback={(
          <p role="alert" className="grid min-h-96 place-content-center px-6 text-center text-sm text-muted-foreground">
            {t("catalog.previewError", { defaultValue: language === "vi" ? "Không thể hiển thị bản xem thử của mẫu này." : "Unable to display this template preview." })}
          </p>
        )}
      />
    </div>
  );
}

