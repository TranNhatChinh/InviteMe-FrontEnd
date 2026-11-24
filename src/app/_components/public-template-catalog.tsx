"use client";

import { TemplateCatalog } from "@/features/public";
import { useCurrentUser } from "@/features/auth";
import { getWeddings, getWeddingAccess } from "@/features/weddings";
import { useRuntime } from "@/core/config/runtime";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";
import {
  parseStudioDocument,
  resolveInvitationDocument,
  TemplateThumbnail,
} from "@/features/template-studio";

export function PublicTemplateCatalog({
  category,
  initialTemplate,
}: {
  category?: "invite" | "story";
  initialTemplate?: string;
}) {
  const { t } = useTranslation("ui", { keyPrefix: "catalog" });
  const { api } = useRuntime();
  const auth = useCurrentUser();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(initialTemplate ?? null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const catalogPath = category ? `/templates/${category}` : "/templates";
  const returnPath = (template: string) =>
    `${catalogPath}?useTemplate=${encodeURIComponent(template)}`;
  useEffect(() => {
    if (selected && auth.isRestored && !auth.isAuthenticated) {
      const target = `${catalogPath}?useTemplate=${encodeURIComponent(selected)}`;
      router.replace(`/login?returnTo=${encodeURIComponent(target)}`);
    }
  }, [selected, auth.isRestored, auth.isAuthenticated, catalogPath, router]);
  const weddings = useQuery({
    queryKey: ["template-weddings", auth.user?.id, page],
    queryFn: ({ signal }) => getWeddings(api, { page, pageSize: 10 }, signal),
    enabled: Boolean(selected) && auth.isAuthenticated,
  });
  async function chooseWedding(weddingId: string) {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const access = await getWeddingAccess(api, weddingId);
      if (
        !access.permissions.includes("WEDDING_EDIT") ||
        !access.permissions.includes("INVITATION_SEND")
      ) {
        setError(t("invitationPermissionRequired"));
        return;
      }
      router.push(
        `/weddings/${encodeURIComponent(weddingId)}/studio?template=${encodeURIComponent(selected)}`,
      );
    } catch {
      setError(t("weddingSelectionFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <TemplateCatalog
        category={category}
        onUseTemplate={(template) => {
          if (!auth.isAuthenticated) {
            router.push(`/login?returnTo=${encodeURIComponent(returnPath(template.id))}`);
            return;
          }
          setPage(1);
          setError("");
          setSelected(template.id);
        }}
        renderPreview={(configurationJson) => {
          try {
            return (
              <TemplateThumbnail
                document={resolveInvitationDocument(parseStudioDocument(configurationJson))}
                fluid
              />
            );
          } catch {
            return <div className="size-full bg-primary/10" />;
          }
        }}
      />
      <Modal
        open={Boolean(selected) && auth.isAuthenticated}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        title={t("chooseWedding")}
        description={t("invitationWeddingHelp")}
        size="small"
      >
        <div className="space-y-4">
          {weddings.isPending && <p role="status">{t("loadingWeddings")}</p>}
          {weddings.isError && (
            <p role="alert">
              {t("weddingSelectionFailed")}{" "}
              <button className="underline" onClick={() => void weddings.refetch()}>
                {t("retry")}
              </button>
            </p>
          )}
          {weddings.isSuccess && weddings.data.totalCount === 0 && <p>{t("noWeddings")}</p>}
          <div className="grid gap-2">
            {weddings.data?.items.map((wedding) => (
              <Button
                key={wedding.id}
                variant="outline"
                className="h-auto justify-start whitespace-normal px-4 py-3 text-left"
                disabled={busy}
                onClick={() => void chooseWedding(wedding.id)}
              >
                {wedding.title}
              </Button>
            ))}
          </div>
          {Boolean(weddings.data && weddings.data.totalPages > 1) && (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                disabled={busy || page <= 1 || weddings.isFetching}
                onClick={() => setPage(page - 1)}
              >
                {t("previousWeddings")}
              </Button>
              <span>
                {page} / {weddings.data?.totalPages}
              </span>
              <Button
                variant="ghost"
                disabled={
                  busy || !weddings.data || page >= weddings.data.totalPages || weddings.isFetching
                }
                onClick={() => setPage(page + 1)}
              >
                {t("nextWeddings")}
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button asChild className="w-full" disabled={busy}>
            <Link
              aria-disabled={busy}
              onClick={(event) => {
                if (busy) event.preventDefault();
              }}
              href={`/weddings/new?invitationTemplate=${encodeURIComponent(selected ?? "")}`}
            >
              {t("createWeddingForTemplate")}
            </Link>
          </Button>
        </div>
      </Modal>
    </>
  );
}
