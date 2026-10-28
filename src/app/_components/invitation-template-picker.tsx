"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { AuthGuard } from "@/features/auth";
import { WeddingAccessProvider } from "@/features/weddings";
import {
  parseStudioDocument,
  resolveInvitationDocument,
  TemplateThumbnail,
  TemplateStudio,
} from "@/features/template-studio";
import { listPublicTemplates } from "@/features/public";
import { useRuntime } from "@/core/config/runtime";
import { PermissionGuard } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";

export function InvitationTemplatePicker({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("invitations");
  const { api } = useRuntime();
  const templates = useQuery({
    queryKey: ["public-templates"],
    queryFn: ({ signal }) => listPublicTemplates(api, signal),
  });
  const [demo, setDemo] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const base = `/weddings/${encodeURIComponent(weddingId)}`;
  const catalog = (templates.data ?? []).flatMap((item) => {
    try {
      return [
        {
          ...item,
          document: resolveInvitationDocument(parseStudioDocument(item.configurationJson)),
        },
      ];
    } catch {
      return [];
    }
  });
  const selected = catalog.find((item) => item.slug === demo);
  return (
    <AuthGuard>
      <WeddingAccessProvider weddingId={weddingId}>
        <PermissionGuard permission="WEDDING_EDIT">
          {selected ? (
            <div>
              <header className="sticky top-0 z-[100] flex flex-wrap items-center justify-between gap-3 border-b bg-card p-4">
                <Button variant="outline" onClick={() => setDemo(null)}>
                  <ArrowLeft className="mr-2 size-4" />
                  {t("picker.backToTemplates")}
                </Button>
                <p className="font-medium">{selected.name}</p>
                <Button asChild>
                  <Link href={`${base}/studio?template=${encodeURIComponent(selected.slug)}`}>
                    {t("picker.editApply")}
                  </Link>
                </Button>
              </header>
              <TemplateStudio key={selected.slug} initialTemplate={selected.slug} initialPreview />
            </div>
          ) : (
            <main id="main-content" className="min-h-screen bg-background px-4 py-8 sm:px-8">
              <div className="mx-auto max-w-6xl">
                <Link
                  href={`${base}/invitations`}
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                  {t("picker.back")}
                </Link>
                <h1 className="mt-8 font-display text-3xl">{t("saved.chooseTemplate")}</h1>
                <p className="mt-2 text-muted-foreground">{t("picker.description")}</p>
                <div className="my-6 flex flex-wrap gap-2" aria-label={t("picker.filters")}>
                  {["all", "minimalism", "song-hy"].map((value) => (
                    <Button
                      key={value}
                      variant={filter === value ? "default" : "outline"}
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      {t(`picker.${value}`)}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {catalog
                    .filter((item) => filter === "all" || item.slug.startsWith(filter))
                    .map((item) => (
                      <article
                        key={item.id}
                        className="overflow-hidden rounded-2xl border bg-card p-4"
                      >
                        <button
                          className="block w-full overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-primary"
                          onClick={() => setDemo(item.slug)}
                          aria-label={`${t("picker.demo")}: ${item.name}`}
                        >
                          <TemplateThumbnail document={item.document} fluid />
                        </button>
                        <h2 className="mt-4 font-display text-xl">{item.name}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{item.theme}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => setDemo(item.slug)}>
                            {t("picker.demo")}
                          </Button>
                          <Button asChild>
                            <Link href={`${base}/studio?template=${encodeURIComponent(item.slug)}`}>
                              {t("picker.editApply")}
                            </Link>
                          </Button>
                        </div>
                      </article>
                    ))}
                </div>
              </div>
            </main>
          )}
        </PermissionGuard>
      </WeddingAccessProvider>
    </AuthGuard>
  );
}
