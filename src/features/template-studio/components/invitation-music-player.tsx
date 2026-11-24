"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LoaderCircle, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { InvitationMusic } from "@/shared/api/music.api";
import {
  createInvitationAudioController,
  type InvitationAudioState,
} from "./invitation-audio-controller";

export function InvitationMusicPlayer({
  music,
  preview = false,
}: {
  music?: InvitationMusic | null;
  preview?: boolean;
}) {
  if (!music?.enabled || !music.audioUrl) return null;
  return <TrackPlayer key={`${music.trackId}:${music.audioUrl}`} music={music} preview={preview} />;
}

function TrackPlayer({ music, preview }: { music: InvitationMusic; preview: boolean }) {
  const { t } = useTranslation("public");
  const audio = useRef<HTMLAudioElement>(null);
  const controller = useRef<ReturnType<typeof createInvitationAudioController> | null>(null);
  const [state, setState] = useState<InvitationAudioState>("loading");
  useLayoutEffect(() => {
    if (audio.current) {
      audio.current.volume = music.volume;
      audio.current.loop = music.loop;
    }
  }, [music.volume, music.loop]);
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    element.src = music.audioUrl;
    const playback = createInvitationAudioController(
      element,
      [element.ownerDocument, document],
      setState,
    );
    controller.current = playback;
    playback.start();
    return () => {
      playback.destroy();
      controller.current = null;
      element.removeAttribute("src");
      element.load();
    };
  }, [music.audioUrl]);
  const active = state === "playing" || state === "loading";
  return (
    <div
      className={`fixed right-5 z-[60] flex max-w-[calc(100vw-40px)] flex-col items-end gap-2 ${preview ? "bottom-5" : "bottom-20"}`}
    >
      <audio ref={audio} src={music.audioUrl} preload="auto" loop={music.loop} />
      {(state === "blocked" || state === "error") && (
        <p role="status" className="rounded-lg bg-white/95 p-2 text-xs text-stone-700 shadow-sm">
          {t(state === "blocked" ? "musicAutoplayBlocked" : "musicPlayFailed")}
        </p>
      )}
      <button
        type="button"
        data-invitation-audio-control
        className="grid size-12 place-items-center rounded-full border border-stone-200 bg-white text-stone-800 shadow-md focus-visible:outline-2 focus-visible:outline-primary"
        title={music.name}
        aria-label={t(active ? "musicOff" : "musicOn")}
        aria-pressed={state === "playing"}
        aria-busy={state === "loading"}
        onClick={() => controller.current?.toggle()}
      >
        {state === "loading" ? (
          <LoaderCircle size={20} className="animate-spin" />
        ) : state === "playing" ? (
          <Volume2 size={20} />
        ) : (
          <VolumeX size={20} />
        )}
      </button>
    </div>
  );
}
