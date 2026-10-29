"use client";

import { use } from "react";
import { useTranslation } from "react-i18next";
import { InvitationManagement } from "@/app/_components/invitation-management";
import { PermissionGuard } from "@/shared/components/permission-guard";
import { EmptyState } from "@/shared/feedback/empty-state";
export default function Page({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const { t } = useTranslation("weddingEditor");
  return (
    <PermissionGuard
      permission="INVITATION_SEND"
      fallback={
        <EmptyState
          title={t("pages.accessRestrictedTitle")}
          description={t("pages.accessRestrictedDescription")}
        />
      }
    >
      <section className="space-y-4">
        <h1 className="font-serif text-3xl">{t("pages.invitations.title")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("pages.invitations.description")}
        </p>
        <InvitationManagement weddingId={weddingId} />
      </section>
    </PermissionGuard>
  );
}
