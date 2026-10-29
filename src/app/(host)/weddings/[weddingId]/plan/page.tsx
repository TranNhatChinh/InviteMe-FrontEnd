"use client";

import { use } from "react";
import { useTranslation } from "react-i18next";
import { PermissionGuard } from "@/shared/components/permission-guard";
import { EmptyState } from "@/shared/feedback/empty-state";
import { WeddingPlanManager } from "@/features/plans";

export default function WeddingPlanPage({
  params,
}: {
  params: Promise<{ weddingId: string }>;
}) {
  const { weddingId } = use(params);
  const { t } = useTranslation("plans");

  return (
    <PermissionGuard
      permission="WEDDING_VIEW"
      fallback={
        <EmptyState
          title={t("page.noAccessTitle")}
          description={t("page.noAccessDescription")}
        />
      }
    >
      <div className="space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-normal text-foreground">
            {t("page.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("page.subtitle")}
          </p>
        </div>
        <WeddingPlanManager weddingId={weddingId} />
      </div>
    </PermissionGuard>
  );
}
