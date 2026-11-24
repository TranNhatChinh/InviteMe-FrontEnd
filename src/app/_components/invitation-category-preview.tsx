"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRuntime } from "@/core/config/runtime";
import { listPublicTemplates } from "@/features/public";
import {
  parseStudioDocument,
  resolveInvitationDocument,
  TemplateThumbnail,
} from "@/features/template-studio";
import styles from "./invitation-category-preview.module.css";

export function InvitationCategoryPreview() {
  const { api } = useRuntime();
  const { t } = useTranslation("landing");
  const templates = useQuery({
    queryKey: ["public-templates"],
    queryFn: ({ signal }) => listPublicTemplates(api, signal),
    staleTime: 60_000,
  });
  const available = (templates.data ?? []).flatMap((template) => {
    if (template.theme?.toUpperCase().includes("STORY")) return [];
    try {
      return [
        {
          ...template,
          document: resolveInvitationDocument(parseStudioDocument(template.configurationJson)),
        },
      ];
    } catch {
      return [];
    }
  });
  const preferred = ["hoa-moc-xanh", "mai-lan-trang", "minimalism-brown"];
  const selected = [...available]
    .sort((a, b) => {
      const rank = (slug: string) =>
        preferred.includes(slug) ? preferred.indexOf(slug) : preferred.length;
      return rank(a.slug) - rank(b.slug);
    })
    .slice(0, 3);
  return (
    <div className={styles.preview} aria-label={t("invitationCategory")}>
      {templates.isPending ? (
        <div className={styles.placeholder} role="status">
          {t("templatePreviewLoading")}
        </div>
      ) : selected.length ? (
        <div className={styles.collage} aria-hidden="true">
          {selected.map((template, index) => (
            <div key={template.id} className={`${styles.paper} ${styles[`paper${index}`]}`}>
              <TemplateThumbnail
                document={template.document}
                fluid
                showCover={index === selected.length - 1}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.placeholder}>
          {templates.isError ? (
            <button type="button" onClick={() => void templates.refetch()}>
              {t("templatePreviewRetry")}
            </button>
          ) : (
            t("invitationCategory")
          )}
        </div>
      )}
    </div>
  );
}
