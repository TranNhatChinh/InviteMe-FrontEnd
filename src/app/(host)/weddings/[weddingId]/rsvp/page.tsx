import { PermissionGuard } from "@/shared/components/permission-guard";
import { HostRsvpDashboard, RsvpPermissionFallback } from "@/features/rsvp";
export default async function Page({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = await params;
  return (
    <PermissionGuard
      permission="RSVP_VIEW"
      fallback={<RsvpPermissionFallback section="responses" />}
    >
      <HostRsvpDashboard weddingId={weddingId} />
    </PermissionGuard>
  );
}
