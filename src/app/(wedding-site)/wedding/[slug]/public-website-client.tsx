"use client";

import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { WebsiteStoryRenderer } from "@/features/template-studio";
import {
  getPublicWebsite,
  publicWebsiteSchema,
  isStudioDocument,
  WebsiteRenderer,
} from "@/features/weddings";
import { usePublicWeddingSignal } from "@/core/realtime/public-wedding-signal";
import type { z } from "zod";
import { useTranslation } from "react-i18next";

export function PublicWebsiteClient({
  slug,
  initial,
}: {
  slug: string;
  initial?: z.infer<typeof publicWebsiteSchema>;
}) {
  const { t } = useTranslation("public");
  const { api, queryClient } = useRuntime();
  usePublicWeddingSignal(
    "website",
    slug,
    () => void queryClient.invalidateQueries({ queryKey: ["public-website", slug] }),
  );
  const site = useQuery({
    queryKey: ["public-website", slug],
    queryFn: ({ signal }) => getPublicWebsite(api, slug, signal),
    initialData: initial,
    retry: false,
  });
  if (site.isPending) return <main className="p-10 text-center">{t("websiteLoading")}</main>;
  if (site.isError)
    return (
      <main className="p-10 text-center">
        {t("websiteUnavailable")}
        <button className="ml-3 underline" onClick={() => void site.refetch()}>
          {t("retry")}
        </button>
      </main>
    );

  if (isStudioDocument(site.data.document)) {
    return <WebsiteStoryRenderer document={site.data.document} />;
  }

  return <WebsiteRenderer document={site.data.document} />;
}
