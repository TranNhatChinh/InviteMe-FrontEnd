import { PermissionGuard } from "@/shared/components/permission-guard";
import { CheckInPermissionFallback } from "@/features/guests";
import { PlanEntitlementGate } from "@/features/plans";
import { CheckInWorkspaceClient } from "./check-in-workspace-client";
export default async function Page({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = await params;
  return (
    <PermissionGuard permission="CHECKIN_MANAGE" fallback={<CheckInPermissionFallback />}>
      <PlanEntitlementGate weddingId={weddingId} entitlement="checkin">
        <CheckInWorkspaceClient weddingId={weddingId} />
      </PlanEntitlementGate>
    </PermissionGuard>
  );
}
