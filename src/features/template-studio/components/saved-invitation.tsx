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
      className="overflow-hidden rounded-2xl border bg-card"
      aria-label={t("saved.designAlt")}
    >
      {doc ? (
        <div className="grid xl:grid-cols-[19rem_minmax(0,1fr)]">
          <div className="flex justify-center border-b bg-muted/40 p-5 sm:p-7 xl:border-b-0 xl:border-r">
            <div
              className="w-60 shrink-0 self-start overflow-hidden rounded-xl border bg-background"
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
          </div>
          <div className="flex min-w-0 flex-col gap-5 p-5 sm:p-7 lg:p-8">
            <div>
              <p className="text-sm text-muted-foreground">{t("saved.design")}</p>
              <h2 className="mt-1 font-display text-2xl">
                {template?.name ?? t("saved.customDesign")}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span>
                {t(
                  design.data.status === "PUBLISHED" && !design.data.hasUnpublishedChanges
                    ? "saved.versionPublished"
                    : "saved.versionDraft",
                  { version: design.data.version },
                )}
              </span>
              <span
                className={`rounded-md px-2.5 py-1 ${
                  design.data.status === "PUBLISHED"
                    ? "bg-success/20 text-success-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {design.data.status === "PUBLISHED" ? t("saved.published") : t("saved.unpublished")}
              </span>
              {design.data.status === "PUBLISHED" && design.data.hasUnpublishedChanges && (
                <span className="rounded-md bg-warning/30 px-2.5 py-1 text-warning-foreground">
                  {t("saved.unpublishedChanges")}
                </span>
              )}
            </div>

            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("saved.personalLinks")}
            </p>
            <p className="max-w-2xl text-sm leading-6">
              {design.data.status === "PUBLISHED"
                ? design.data.hasUnpublishedChanges
                  ? t("saved.pendingChangesHelp")
                  : t("saved.publishedHelp")
                : t("saved.draftHelp")}
            </p>

            {design.data.warnings.map((warning) => (
              <p role="alert" className="text-sm text-warning-foreground" key={warning}>
                {warning}
              </p>
            ))}
            {message && (
              <p role="status" className="text-sm">
                {message}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {isOwner &&
                (design.data.hasUnpublishedChanges || design.data.status !== "PUBLISHED") && (
                  <Button disabled={busy} onClick={() => void publish()}>
                    {busy ? t("saved.publishing") : t("saved.publish")}
                  </Button>
                )}
              {can("WEDDING_EDIT") && (
                <Button asChild variant="outline">
                  <Link href={`/weddings/${encodeURIComponent(weddingId)}/studio`}>
                    {t("saved.edit")}
                  </Link>
                </Button>
              )}
              {can("WEDDING_EDIT") && (
                <Button asChild variant="ghost">
                  <Link href={`/weddings/${encodeURIComponent(weddingId)}/invitation-templates`}>
                    {t("picker.changeTemplate")}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.65fr)] lg:items-center lg:gap-10 lg:p-8">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">{t("saved.design")}</p>
              <h2 className="mt-1 font-display text-2xl">{t("saved.emptyTitle")}</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("saved.emptyDescription")}
            </p>
            {can("WEDDING_EDIT") && (
              <Button asChild>
                <Link href={`/weddings/${encodeURIComponent(weddingId)}/invitation-templates`}>
                  {t("saved.chooseTemplate")}
                </Link>
              </Button>
            )}
          </div>
          <ol className="grid gap-3 border-t pt-5 text-sm sm:grid-cols-3 lg:grid-cols-1 lg:border-l lg:border-t-0 lg:py-1 lg:pl-7 lg:pt-1">
            {["stepChoose", "stepEdit", "stepPublish"].map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="pt-1 leading-5">{t(`saved.${step}`)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
