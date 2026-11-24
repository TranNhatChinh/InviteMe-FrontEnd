"use client";

import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { getMusic, type InvitationMusic, type MusicSettings } from "@/shared/api/music.api";
import { InvitationMusicPlayer } from "./invitation-music-player";

export function PreviewMusicPlayer({
  value,
  resolved,
  allowLibraryLookup = true,
}: {
  value?: MusicSettings;
  resolved?: InvitationMusic | null;
  allowLibraryLookup?: boolean;
}) {
  const { api } = useRuntime();
  const provided = value && resolved?.trackId === value.trackId ? resolved : null;
  const track = useQuery({
    queryKey: ["music-track", value?.trackId],
    queryFn: ({ signal }) => getMusic(api, value?.trackId ?? "", signal),
    enabled: !!value?.enabled && !provided && allowLibraryLookup,
    retry: false,
  });
  if (!value?.enabled) return null;
  const choice = provided ?? (allowLibraryLookup ? track.data : undefined);
  if (!choice) return null;
  return (
    <InvitationMusicPlayer
      preview
      music={{ ...value, name: choice.name, audioUrl: choice.audioUrl, isActive: choice.isActive }}
    />
  );
}
