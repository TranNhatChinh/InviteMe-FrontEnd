"use client";
import { Editor, Frame } from "@craftjs/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { studioDocumentSchema } from "../schemas/document";
import { StudioFrame, StudioText, StudioImage } from "./items";
import { StudioCalendar, StudioCountdown } from "./date-widgets";
import { StudioAlbum, StudioMap, StudioAction, StudioWishes } from "./invitation-widgets";
import { StudioInterview, StudioTimeline } from "./story-widgets";
import { InvitationCover } from "./invitation-cover";
import { WordingPreviewContext } from "./wording-preview";
import { StudioReveal, RevealPausedContext } from "./reveal";
import { InvitationGuestContext } from "./invitation-guest-context";
import type { InvitationMusic } from "@/shared/api/music.api";
import { useAudioPreview } from "@/shared/lib/use-audio-preview";
import { Volume2, VolumeX } from "lucide-react";
import { FallingParticles } from "./falling-particles";
import { resolveParticles } from "./particle-settings";

export function InvitationRenderer({
  document,
  content,
  token,
  music,
}: {
  document: z.infer<typeof studioDocumentSchema>;
  content: string;
  token: string;
  music?: InvitationMusic | null;
}) {
  const { t } = useTranslation("public");
  const [opened, setOpened] = useState(false);
  const [width, setWidth] = useState(480);
  const host = useRef<HTMLDivElement>(null);
  const player = useAudioPreview();
  const choice = music
    ? { id: music.trackId, name: music.name, audioUrl: music.audioUrl, isActive: music.isActive }
    : null;
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const root = document.nodes.ROOT;
  if (!root) return null;
  const cover = root.props.cover;
  const showingCover = !!cover?.enabled && !opened;
  const particles = resolveParticles(root.props);
  return (
    <div
      ref={host}
      className="template-canvas fixed inset-0 z-50 overflow-x-hidden overflow-y-auto bg-background"
      aria-label={t("personalInvitation")}
    >
      {player.element}
      <FallingParticles effect={particles} />
      {music?.enabled && choice && (
        <div className="fixed bottom-20 right-5 z-[60] flex max-w-[calc(100vw-40px)] flex-col items-end gap-2">
          {player.error && (
            <p role="status" className="rounded-lg bg-white p-2 text-xs text-stone-700">
              {t("musicPlayFailed")}
            </p>
          )}
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 shadow-md"
            title={music.name}
            aria-label={t(player.activeId ? "musicOff" : "musicOn")}
            onClick={() => player.toggle(choice, music.volume, music.loop)}
          >
            {player.activeId ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span>{t(player.activeId ? "musicOff" : "musicOn")}</span>
          </button>
        </div>
      )}
      <InvitationGuestContext value={token}>
        <WordingPreviewContext value={content}>
          <Editor
            enabled={false}
            onRender={StudioReveal}
            resolver={{
              StudioFrame,
              StudioText,
              StudioImage,
              StudioCalendar,
              StudioCountdown,
              StudioAlbum,
              StudioMap,
              StudioAction,
              StudioWishes,
              StudioInterview,
              StudioTimeline,
            }}
          >
            <RevealPausedContext value={showingCover}>
              <div
                style={{
                  display: showingCover ? "none" : undefined,
                  zoom: Math.min(1, width / (root.props.width ?? 480)),
                  width: root.props.width ?? 480,
                  marginInline: "auto",
                }}
              >
                <Frame data={JSON.stringify(document.nodes)} />
              </div>
            </RevealPausedContext>
          </Editor>
          {showingCover && cover && (
            <InvitationCover
              config={cover}
              onStart={() => {
                if (music?.enabled && choice) player.play(choice, music.volume, music.loop);
              }}
              onOpen={() => {
                setOpened(true);
                host.current?.scrollTo(0, 0);
              }}
            />
          )}
        </WordingPreviewContext>
      </InvitationGuestContext>
    </div>
  );
}
