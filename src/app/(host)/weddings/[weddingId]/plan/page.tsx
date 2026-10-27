import { use } from "react";
import { PermissionGuard } from "@/shared/components/permission-guard";
import { EmptyState } from "@/shared/feedback/empty-state";
import { WeddingPlanManager } from "@/features/plans";

export default function WeddingPlanPage({
  params,
}: {
  params: Promise<{ weddingId: string }>;
}) {
  const { weddingId } = use(params);

  return (
    <PermissionGuard
      permission="WEDDING_VIEW"
      fallback={
        <EmptyState
          title="Không có quyền truy cập"
          description="Bạn không có quyền xem thông tin gói dịch vụ của đám cưới này."
        />
      }
    >
      <div className="space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-normal text-foreground">
            Gói dịch vụ &amp; Hạn mức
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Xem thông số gói hiện tại, kiểm tra tiến độ sử dụng và nâng cấp các tính năng cao cấp cho đám cưới.
          </p>
        </div>
        <WeddingPlanManager weddingId={weddingId} />
      </div>
    </PermissionGuard>
  );
}
