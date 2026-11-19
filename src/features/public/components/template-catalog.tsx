"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Modal } from "@/shared/ui/modal";
import { useLocale } from "@/i18n/language-context";
// eslint-disable-next-line architecture/boundaries -- The public gallery uses the same website template contract as the builder.
import { storyTemplateSummarySchema, type StoryTemplateSummaryV4 } from "@/features/weddings";
import { useRuntime } from "@/core/config/runtime";
import { listPublicTemplates } from "../api/templates.api";
import { WebsitePreview } from "./website-template-preview";
export function TemplateCatalog({
  category,
  renderPreview,
}: {
  category?: "invite" | "story";
  renderPreview?: (configurationJson: string) => ReactNode;
}) {
  const { api } = useRuntime();
  const { t } = useTranslation("ui");
  const { language } = useLocale();
  const [selectedWebsite, setSelectedWebsite] = useState<StoryTemplateSummaryV4 | null>(null);
  const publicTemplates = useQuery({
    queryKey: ["public-templates"],
    queryFn: ({ signal }) => listPublicTemplates(api, signal),
    enabled: category !== "story",
    staleTime: 60_000,
  });
  const websites = useQuery({
    queryKey: ["public-website-templates"],
    queryFn: ({ signal }) => api.request("/story-templates", { auth: "none", signal, schema: z.array(storyTemplateSummarySchema) }),
    enabled: category !== "invite",
    staleTime: 60_000,
  });
  const published = publicTemplates.data ?? [];
  const dynamic = published.map((template) => ({
    id: template.slug,
    name: template.name,
    description: template.theme || "InviteMe wedding template",
    story: template.theme?.toUpperCase().includes("STORY") ?? false,
    preview: renderPreview ? (
      renderPreview(template.configurationJson)
    ) : template.previewUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={template.previewUrl} alt="" className="size-full object-cover" />
    ) : (
      <div className="flex size-full items-center justify-center bg-primary/10 p-6 text-center font-display text-2xl text-primary">
        {template.name}
      </div>
    ),
  }));
  const catalog = dynamic.filter((template) => !template.story);
  const visible =
    category === "invite"
      ? catalog.filter((template) => !template.story)
      : category === "story"
        ? []
        : catalog;
  return (
    <div className="template-catalog template-catalog--invite">
      <Link href="/#templates" className="template-catalog__back">
        ← {t("catalog.backHome")}
      </Link>
      <div className="landing-heading">
        <p className="landing-eyebrow">{t("catalog.eyebrow")}</p>
        <h1>
          {category === "invite"
            ? t("catalog.titleInvite")
            : category === "story"
              ? t("catalog.titleStory")
              : t("catalog.titleAll")}
        </h1>
        <p>
          {category === "story"
            ? t("catalog.subtitleStory")
            : t("catalog.subtitle")}
        </p>
      </div>
      <nav className="template-catalog__tabs" aria-label={t("catalog.tabsAria")}>
        {[
          { href: "/templates", label: t("catalog.all"), active: !category },
          { href: "/templates/invite", label: t("catalog.inviteTab"), active: category === "invite" },
          { href: "/templates/story", label: t("catalog.websiteTab"), active: category === "story" },
        ].map((tab) => (
          <Link key={tab.href} href={tab.href} aria-current={tab.active ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>
      <p className="template-catalog__note">{t("catalog.note")}</p>
      {category !== "story" && publicTemplates.isError && <p role="alert">{t("catalog.loadError")}</p>}
      {category !== "invite" && websites.isError && <p role="alert">{t("catalog.websiteLoadError")} <button type="button" onClick={() => void websites.refetch()} className="underline">{t("catalog.retry")}</button></p>}
      {category !== "invite" && websites.isPending && <p role="status">{t("catalog.loadingWebsites")}</p>}
      {visible.length > 0 && <div className="invite-template-grid">
        {visible.map((template) => (
          <article className="invite-template-card" key={template.id}>
            <Link
              className="invite-template-card__preview"
              aria-label={t("catalog.viewTemplateAria", { name: template.name })}
              href={`/template-studio?template=${template.id}&preview=1`}
            >
              {template.preview}
            </Link>
            <div className="invite-template-card__overlay">
              <h2>{template.name}</h2>
              <p className="invite-template-card__tags">
                <span>
                  {template.story || template.id.startsWith("story-")
                    ? t("catalog.websiteTab")
                    : t("catalog.inviteTab")}
                </span>
                <span>{t("catalog.customizable")}</span>
              </p>
              <div className="landing-actions">
                <Link
                  className="landing-button landing-button--outline"
                  href={`/template-studio?template=${template.id}&preview=1`}
                >
                  {t("catalog.viewDemo")}
                </Link>
                <Link className="landing-button" href={`/template-studio?template=${template.id}`}>
                  {t("catalog.useTemplate")} <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>}
      {category !== "invite" && Boolean(websites.data?.length) && (
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {websites.data?.map((template) => (
          <article className="overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm" key={`website-${template.key}`}>
            <button type="button" className="group relative block aspect-[4/3] w-full overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-rose-500" aria-label={t("catalog.viewTemplateAria", { name: template.name })} onClick={() => setSelectedWebsite(template)}>
              {template.config.previewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={template.config.previewImageUrl} alt="" className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]" />
              ) : <div className="flex size-full items-center justify-center p-6 text-center" style={{ backgroundColor: template.config.theme.colors.background, color: template.config.theme.colors.accent }}><div className="w-4/5 rounded-t-full border px-5 py-10" style={{ borderColor: template.config.theme.colors.primary }}><span className="text-xs uppercase tracking-[0.22em]">{t("catalog.websiteTab")}</span><p className="mt-3 font-display text-2xl">{template.name}</p></div></div>}
              <span className="absolute bottom-3 right-3 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-rose-900 shadow-sm">{t("catalog.viewDemo")}</span>
            </button>
            <div className="space-y-3 p-4 sm:p-5">
              <div><p className="text-xs font-medium uppercase tracking-wide text-rose-600">{t("catalog.websiteTab")}</p><h2 className="mt-1 font-display text-xl text-foreground">{template.name}</h2></div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-900 hover:bg-rose-50" onClick={() => setSelectedWebsite(template)}>{t("catalog.viewDemo")}</button>
                <Link className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover" href="/weddings">{t("catalog.useTemplate")} <ArrowRight size={16} /></Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      )}
      {category !== "invite" && websites.isSuccess && websites.data.length === 0 && <p className="mt-8 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("catalog.noWebsites")}</p>}
      {category !== "story" && publicTemplates.isPending && <p role="status">{t("catalog.loadingInvitations")}</p>}
      {(category === "story" || !publicTemplates.isPending) && (category === "invite" || !websites.isPending) &&
        (category === "story" || !publicTemplates.isError) && (category === "invite" || !websites.isError) && (
          <p className="landing-caption">{t("catalog.totalTemplates", { count: visible.length + (category === "invite" ? 0 : websites.data?.length ?? 0) })}</p>
        )}
      <Modal open={Boolean(selectedWebsite)} onClose={() => setSelectedWebsite(null)} title={selectedWebsite?.name ?? t("catalog.websiteTab")} description={t("catalog.websitePreviewNote", { defaultValue: language === "vi" ? "Bản xem thử dùng thông tin minh họa và không cần đăng nhập." : "This preview uses sample information and does not require signing in." })} size="wide">
        {selectedWebsite && <WebsitePreview template={selectedWebsite} />}
        <div className="mt-4 flex justify-end"><Link className="landing-button" href="/weddings">{t("catalog.useTemplate")} <ArrowRight size={16} /></Link></div>
      </Modal>
    </div>
  );
}
