import { PermissionGuard } from "@/shared/components/permission-guard";
import { RsvpPermissionFallback, RsvpReminderCenter } from "@/features/rsvp";

export default async function Page({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = await params;
  return (
    <PermissionGuard
      permission="RSVP_VIEW"
      fallback={<RsvpPermissionFallback section="reminders" />}
    >
      <RsvpReminderCenter weddingId={weddingId} />
    </PermissionGuard>
  );
}
