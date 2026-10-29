"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { listPublicTemplates } from "../api/templates.api";
export function TemplateCatalog({
  category,
  renderPreview,
}: {
  category?: "invite" | "story";
  renderPreview?: (configurationJson: string) => ReactNode;
}) {
  const { api } = useRuntime();
  const { t } = useTranslation("ui");
  const publicTemplates = useQuery({
    queryKey: ["public-templates"],
    queryFn: ({ signal }) => listPublicTemplates(api, signal),
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
  const catalog = dynamic;
  const visible =
    category === "invite"
      ? catalog.filter((template) => !template.story)
      : category === "story"
        ? catalog.filter((template) => template.story)
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
          { href: "/templates/invite", label: "Wedding Invite", active: category === "invite" },
          { href: "/templates/story", label: "Wedding Story", active: category === "story" },
        ].map((tab) => (
          <Link key={tab.href} href={tab.href} aria-current={tab.active ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>
      <p className="template-catalog__note">
        {t("catalog.note")}
      </p>
      <div className="invite-template-grid">
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
                    ? "Wedding Story"
                    : "Wedding Invite"}
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
      </div>
      <p className="landing-caption">
        {t("catalog.count", { count: visible.length })}
      </p>
    </div>
  );
}
