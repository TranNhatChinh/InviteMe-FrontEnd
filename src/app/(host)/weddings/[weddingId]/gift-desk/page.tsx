import { use } from "react";
import { PermissionGuard } from "@/shared/components/permission-guard";
import { EmptyState } from "@/shared/feedback/empty-state";
import { GiftDesk } from "@/features/gifts";

export default function GiftDeskPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  return (
    <PermissionGuard
      permission="GIFT_RECORD"
      fallback={
        <EmptyState
          title="Chưa có quyền ghi nhận quà"
          description="Chủ tiệc cần cấp quyền ghi nhận quà tại quầy cho tài khoản của bạn."
        />
      }
    >
      <GiftDesk weddingId={weddingId} />
    </PermissionGuard>
  );
}
