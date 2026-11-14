import type { ReactNode } from "react";
import { WeddingRealtime, WeddingAccessProvider, WeddingNavigation } from "@/features/weddings";
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ weddingId: string }>;
}) {
  const { weddingId } = await params;
  return (
    <WeddingAccessProvider weddingId={weddingId}>
      <div className="space-y-6 [&:has([data-guest-import])>[data-wedding-header]]:hidden [&:has([data-seating-studio])>[data-wedding-header]]:hidden">
        <div data-wedding-header className="space-y-6">
          <WeddingRealtime weddingId={weddingId} />
          <WeddingNavigation weddingId={weddingId} />
        </div>
        {children}
      </div>
    </WeddingAccessProvider>
  );
}
