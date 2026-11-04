import { use } from "react";
import { PermissionGuard } from "@/shared/components/permission-guard";
import { ThankYouManager, ThankYouPermissionFallback } from "@/features/ai-thank-you";

export default function Page({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  return (
    <PermissionGuard permission="GUEST_VIEW" fallback={<ThankYouPermissionFallback />}>
      <ThankYouManager weddingId={weddingId} />
    </PermissionGuard>
  );
}
