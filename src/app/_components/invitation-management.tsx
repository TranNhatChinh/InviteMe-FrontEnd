"use client";
import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { SavedInvitation, getInvitationDesign } from "@/features/template-studio";
import { InvitationMessaging } from "@/features/invitations";

export function InvitationManagement({ weddingId }: { weddingId: string }) {
  const { api } = useRuntime();
  const design = useQuery({ queryKey: ["invitation-design", weddingId],
    queryFn: ({ signal }) => getInvitationDesign(api, weddingId, signal) });
  return <>
    <SavedInvitation weddingId={weddingId} />
    <InvitationMessaging key={weddingId} weddingId={weddingId} isPublished={design.data?.status === "PUBLISHED"} />
  </>;
}
