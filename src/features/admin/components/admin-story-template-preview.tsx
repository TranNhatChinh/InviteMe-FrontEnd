"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
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
};

export function AdminStoryTemplatePreview({ config, version, viewport }: Props) {
  const { t } = useTranslation("ui");
  const preview = useMemo(() => {
    try {
      const template: StoryTemplateSummaryV4 = {
        key: config.key,
        name: config.name,
        version,
        config,
      };
      return {
        document: createStoryBuilderV4Document(template, previewSetup, previewContent),
        error: false,
      };
    } catch {
      return { document: null, error: true };
    }
  }, [config, version]);
  const { document, error: previewError } = preview;

  const width = viewport === "mobile" ? 390 : viewport === "tablet" ? 768 : 1100;

  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-card"
      aria-label={t("storyTemplates.previewTitle")}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{t("storyTemplates.previewTitle")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("storyTemplates.previewNote")}</p>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{config.key || "—"}</span>
      </div>
      <div className="max-h-[680px] overflow-auto bg-muted/35 p-3 sm:p-4">
        <div
          className="mx-auto min-h-96 overflow-hidden border border-border bg-background"
          style={{ width, maxWidth: "100%" }}
        >
          {document ? (
            <StoryBuilderV4Renderer document={document} />
          ) : (
            <div className="grid min-h-96 place-content-center px-6 text-center">
              <p className="font-display text-2xl" style={{ color: config.theme.colors.text }}>
                {config.name || t("storyTemplates.previewUntitled")}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {previewError
                  ? t("storyTemplates.previewError")
                  : t("storyTemplates.previewLoading")}
              </p>
              <div
                className="mx-auto mt-5 flex gap-2"
                aria-label={t("storyTemplates.palettePreview")}
              >
                {[
                  config.theme.colors.primary,
                  config.theme.colors.background,
                  config.theme.colors.accent,
                  config.theme.colors.text,
                ].map((color, index) => (
                  <span
                    key={`${color}-${index}`}
                    className="size-7 rounded-full border border-black/10"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
