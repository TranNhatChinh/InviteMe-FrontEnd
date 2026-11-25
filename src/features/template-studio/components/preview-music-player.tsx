"use client";

import { useTranslation } from "react-i18next";
import { VolumeX } from "lucide-react";
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
  const { t } = useTranslation("templateStudio");
  const provided = value && resolved?.trackId === value.trackId ? resolved : null;
  const track = useQuery({
    queryKey: ["music-track", value?.trackId],
    queryFn: ({ signal }) => getMusic(api, value?.trackId ?? "", signal),
    enabled: !!value?.enabled && !provided && allowLibraryLookup,
    retry: false,
  });
  if (!value?.enabled) return null;
  const choice = provided ?? (allowLibraryLookup ? track.data : undefined);
  if (!choice)
    return (
      <div
        role="status"
        className="fixed bottom-5 right-5 z-[60] flex max-w-[calc(100vw-40px)] items-center gap-2 rounded-xl border bg-white p-3 text-xs text-stone-700 shadow-md"
      >
        <VolumeX size={18} aria-hidden="true" />
        <span>{t(track.isFetching ? "music.previewLoading" : "music.previewUnavailable")}</span>
        {allowLibraryLookup && !track.isFetching && (
          <button type="button" className="underline" onClick={() => void track.refetch()}>
            {t("music.retry")}
          </button>
        )}
      </div>
    );
  return (
    <InvitationMusicPlayer
      preview
      music={{ ...value, name: choice.name, audioUrl: choice.audioUrl, isActive: choice.isActive }}
    />
  );
}
