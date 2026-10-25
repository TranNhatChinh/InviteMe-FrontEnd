"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRuntime } from "@/core/config/runtime";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import { LoadingState } from "@/shared/feedback/loading-state";
import { ErrorState } from "@/shared/feedback/error-state";
import { getInvitationDesign, publishInvitationDesign } from "../api/design.api";
import { TemplateThumbnail } from "./template-thumbnail";
import { InvitationCover } from "./invitation-cover";
import { findTemplate } from "../templates/catalog";

export function SavedInvitation({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("invitations");
  const { api } = useRuntime();
  const { can, isOwner } = usePermission();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const design = useQuery({
    queryKey: ["invitation-design", weddingId],
    queryFn: ({ signal }) => getInvitationDesign(api, weddingId, signal),
  });
  if (design.isPending) return <LoadingState label={t("saved.loading")} />;
  if (design.isError)
    return <ErrorState error={design.error} retry={() => void design.refetch()} />;
  async function publish() {
    if (!design.data) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await publishInvitationDesign(
        api,
        weddingId,
        design.data.version,
        design.data.wordingVersion,
      );
      cache.setQueryData(["invitation-design", weddingId], result);
      setMessage(t("saved.publishSuccess"));
    } catch {
      setMessage(t("saved.publishFailed"));
      void design.refetch();
    } finally {
      setBusy(false);
    }
  }
  const doc = design.data.document;
  const cover = doc?.nodes.ROOT?.props.cover;
  const template = findTemplate(doc?.templateId);
  return (
    <section
      className="max-w-3xl rounded-2xl border bg-card p-5 sm:p-7"
      aria-label={t("saved.designAlt")}
    >
      {doc ? (
        <div className="flex flex-col gap-6 sm:flex-row">
          <div
            className="w-60 shrink-0 overflow-hidden rounded-xl border bg-background"
            aria-hidden="true"
          >
            {cover?.enabled ? (
              <div className="relative h-[300px] w-60 overflow-hidden">
                <div
                  style={{
                    position: "relative",
                    width: 480,
                    height: 600,
                    transform: "scale(0.5)",
                    transformOrigin: "top left",
                    pointerEvents: "none",
                  }}
                >
                  <InvitationCover config={cover} editing onOpen={() => {}} />
                </div>
              </div>
            ) : (
              <TemplateThumbnail document={doc} scale={0.5} height={300} />
            )}
          </div>
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">{t("saved.design")}</p>
            <h2 className="font-display text-2xl">{template?.name ?? t("saved.customDesign")}</h2>
            <p className="text-sm">{t("saved.version", { version: design.data.version })}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{t("saved.personalLinks")}</p>
            <p className="text-sm">
              {design.data.status === "PUBLISHED" ? t("saved.published") : t("saved.unpublished")}
              {design.data.hasUnpublishedChanges ? t("saved.unpublishedChanges") : ""}
            </p>
            <p className="text-sm text-muted-foreground">{t("saved.draftHelp")}</p>
            {design.data.warnings.map((warning) => (
              <p role="alert" className="text-sm text-amber-800" key={warning}>
                {warning}
              </p>
            ))}
            {isOwner && (
              <Button
                disabled={busy || !design.data.hasUnpublishedChanges}
                onClick={() => void publish()}
              >
                {busy ? t("saved.publishing") : t("saved.publish")}
              </Button>
            )}
            {message && (
              <p role="status" className="text-sm">
                {message}
              </p>
            )}
            {can("WEDDING_EDIT") && (
              <Button asChild>
                <Link href={`/weddings/${encodeURIComponent(weddingId)}/studio`}>
                  {t("saved.edit")}
                </Link>
              </Button>
            )}
            {can("WEDDING_EDIT") && (
              <Button asChild variant="outline">
                <Link href={`/weddings/${encodeURIComponent(weddingId)}/invitation-templates`}>
                  {t("picker.changeTemplate")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="font-display text-2xl">{t("saved.emptyTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("saved.emptyDescription")}</p>
          {can("WEDDING_EDIT") && (
            <Button asChild>
              <Link href={`/weddings/${encodeURIComponent(weddingId)}/invitation-templates`}>
                {t("saved.chooseTemplate")}
              </Link>
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
