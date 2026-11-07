"use client";

import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { WebsiteStoryRenderer } from "@/features/template-studio";
import {
  getPublicWebsite,
  publicWebsiteSchema,
  isStudioDocument,
  isWeddingStoryDocument,
  StoryClassic,
  isStoryV3,
  fromStoryV3,
  WebsiteRenderer,
} from "@/features/weddings";
import { usePublicWeddingSignal } from "@/core/realtime/public-wedding-signal";
import type { z } from "zod";
import { useTranslation } from "react-i18next";
import { isStoryBuilderV4Document, StoryBuilderV4Renderer } from "@/features/weddings";

export function PublicWebsiteClient({
  slug,
  pagePath,
  initial,
}: {
  slug: string;
  pagePath?: string;
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
    // Published content can change while this URL stays the same. Bypass the app-wide
    // 30-second freshness window whenever the public page mounts or reconnects.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    // staleTime only marks the query stale. Keep an open public page in sync even
    // if a SignalR event is missed; the interval pauses while the tab is hidden.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
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

  if (isStoryBuilderV4Document(site.data.document)) {
    return <StoryBuilderV4Renderer document={site.data.document} slug={site.data.slug} pagePath={pagePath} />;
  }
  if (isStoryV3(site.data.document)) {
    return <StoryClassic document={fromStoryV3(site.data.document)} slug={site.data.slug} />;
  }
  if (isWeddingStoryDocument(site.data.document)) {
    return <StoryClassic document={site.data.document} slug={site.data.slug} />;
  }
  if (isStudioDocument(site.data.document)) {
    return <WebsiteStoryRenderer document={site.data.document} />;
  }

  return <WebsiteRenderer document={site.data.document} />;
}
