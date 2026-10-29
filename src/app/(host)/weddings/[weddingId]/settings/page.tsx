"use client";

import { use } from "react";
import { useTranslation } from "react-i18next";
import { WeddingSetupForm } from "@/features/weddings";
import { PermissionGuard } from "@/shared/components/permission-guard";
import { EmptyState } from "@/shared/feedback/empty-state";

export default function Page({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const { t } = useTranslation("weddingEditor");
  return (
    <PermissionGuard
      permission="WEDDING_VIEW"
      fallback={
        <EmptyState
          title={t("pages.settings.noAccessTitle")}
          description={t("pages.settings.noAccessDescription")}
        />
      }
    >
      <WeddingSetupForm weddingId={weddingId} />
    </PermissionGuard>
  );
}
