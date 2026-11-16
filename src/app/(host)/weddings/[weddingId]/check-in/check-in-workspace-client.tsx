"use client";

import { useQuery } from "@tanstack/react-query";
import { getRsvpSettings, hostRsvpKeys } from "@/features/rsvp";
import { SeatLookupCounter } from "@/features/guests";
import { useRuntime } from "@/core/config/runtime";

export function CheckInWorkspaceClient({ weddingId }: { weddingId: string }) {
  const { api } = useRuntime();
  const settings = useQuery({
    queryKey: hostRsvpKeys.settings(weddingId),
    queryFn: ({ signal }) => getRsvpSettings(api, weddingId, signal),
  });

  return (
    <SeatLookupCounter
      weddingId={weddingId}
      walkInSettings={
        settings.data
          ? {
              rsvpCheckInPolicy: settings.data.rsvpCheckInPolicy,
              allowWalkIns: settings.data.allowWalkIns,
            }
          : null
      }
      walkInSettingsLoading={settings.isPending}
      walkInSettingsFailed={settings.isError}
    />
  );
}
