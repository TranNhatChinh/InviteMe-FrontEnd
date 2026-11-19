"use client";

import { useState } from "react";
import { audioDuration } from "@/shared/api/music.api";

export function AudioDuration({ url }: { url: string }) {
  const [metadata, setMetadata] = useState<{ url: string; seconds: number } | null>(null);
  return (
    <>
      <audio
        src={url}
        preload="metadata"
        aria-hidden="true"
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration))
            setMetadata({ url, seconds: event.currentTarget.duration });
        }}
      />
      <small>{audioDuration(metadata?.url === url ? metadata.seconds : undefined)}</small>
    </>
  );
}
