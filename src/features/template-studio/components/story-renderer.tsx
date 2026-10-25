"use client";

import { Editor, Frame } from "@craftjs/core";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { studioDocumentSchema } from "../schemas/document";
import { StudioFrame, StudioText, StudioImage } from "./items";
import { StudioCalendar, StudioCountdown } from "./date-widgets";
import { StudioAlbum, StudioMap, StudioAction, StudioWishes } from "./invitation-widgets";
import { StudioInterview, StudioTimeline } from "./story-widgets";
import { InvitationCover } from "./invitation-cover";
import { StudioReveal, RevealPausedContext } from "./reveal";
import { StudioModeContext } from "./studio-mode-context";

export function WebsiteStoryRenderer({
  document,
}: {
  document: z.infer<typeof studioDocumentSchema>;
}) {
  const [opened, setOpened] = useState(false);
  const [width, setWidth] = useState(480);
  const host = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={host}
      className="min-h-screen w-full overflow-x-hidden overflow-y-auto bg-background"
      aria-label="Website đám cưới"
    >
      <StudioModeContext.Provider value="website">
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
            onOpen={() => {
              setOpened(true);
              host.current?.scrollTo(0, 0);
            }}
          />
        )}
      </StudioModeContext.Provider>
    </div>
  );
}
