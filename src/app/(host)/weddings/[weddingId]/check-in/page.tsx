import { PermissionGuard } from "@/shared/components/permission-guard";
import { CheckInPermissionFallback, SeatLookupCounter } from "@/features/guests";
import { PlanEntitlementGate } from "@/features/plans";
export default async function Page({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = await params;
  return (
    <PermissionGuard permission="CHECKIN_MANAGE" fallback={<CheckInPermissionFallback />}>
      <PlanEntitlementGate weddingId={weddingId} entitlement="checkin">
        <SeatLookupCounter weddingId={weddingId} />
      </PlanEntitlementGate>
    </PermissionGuard>
  );
}
