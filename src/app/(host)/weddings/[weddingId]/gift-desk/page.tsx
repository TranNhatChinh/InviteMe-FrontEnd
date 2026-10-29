"use client";

import { use } from "react";
import { useTranslation } from "react-i18next";
import { PermissionGuard } from "@/shared/components/permission-guard";
import { EmptyState } from "@/shared/feedback/empty-state";
import { GiftDesk } from "@/features/gifts";

export default function GiftDeskPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const { t } = useTranslation("weddingEditor");
  return (
    <PermissionGuard
      permission="GIFT_RECORD"
      fallback={
        <EmptyState
          title={t("pages.giftDesk.noAccessTitle")}
          description={t("pages.giftDesk.noAccessDescription")}
        />
      }
    >
      <GiftDesk weddingId={weddingId} />
    </PermissionGuard>
  );
}
