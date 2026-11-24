"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRuntime } from "@/core/config/runtime";
import { listPublicTemplates } from "@/features/public";
import {
  TemplateStudio,
  parseStudioDocument,
  resolveInvitationDocument,
} from "@/features/template-studio";
import { LoadingState } from "@/shared/feedback/loading-state";
import { ErrorState } from "@/shared/feedback/error-state";

export function PublicInvitationStudio({
  template,
  preview,
}: {
  template?: string;
  preview: boolean;
}) {
  const { api } = useRuntime();
  const { t } = useTranslation("screens");
  const templates = useQuery({
    queryKey: ["public-templates"],
    queryFn: ({ signal }) => listPublicTemplates(api, signal),
    enabled: !!template,
  });
  if (!template) return <TemplateStudio initialTemplate={false} initialPreview={preview} />;
  if (templates.isPending) return <LoadingState />;
  if (templates.isError) return <ErrorState retry={() => void templates.refetch()} />;
  const selected = templates.data?.find((item) => item.slug === template || item.id === template);
  if (!selected) return <p role="alert">{t("publicTemplateUnavailable")}</p>;
  let document: ReturnType<typeof resolveInvitationDocument>;
  try {
    document = resolveInvitationDocument(parseStudioDocument(selected.configurationJson));
  } catch {
    return <p role="alert">{t("publicTemplateUnavailable")}</p>;
  }
  return (
    <TemplateStudio
      key={selected.id}
      initialTemplate={selected.slug}
      initialDocument={JSON.stringify(document)}
      initialPreview={preview}
      resolvedMusic={selected.music ?? null}
      musicLibraryLookup={false}
    />
  );
}
