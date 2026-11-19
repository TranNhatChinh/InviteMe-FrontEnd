"use client";

import { useEffect, useRef, useState } from "react";
import type { MusicChoice } from "../api/music.api";

export function useAudioPreview() {
  const ref = useRef<HTMLAudioElement>(null);
  const sequence = useRef({ value: 0 });
  const pending = useRef<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const audio = ref.current;
    const requests = sequence.current;
    return () => {
      requests.value++;
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
    };
  }, []);
  function stop() {
    sequence.current.value++;
    pending.current = null;
    ref.current?.pause();
    setActiveId(null);
    setPendingId(null);
    setError(false);
  }
  function configure(volume: number, loop: boolean) {
    if (ref.current) {
      ref.current.volume = volume;
      ref.current.loop = loop;
    }
  }
  function play(track: MusicChoice, volume = 0.5, loop = false) {
    const audio = ref.current;
    if (!audio) return;
    const request = ++sequence.current.value;
    audio.pause();
    setActiveId(null);
    pending.current = track.id;
    setPendingId(track.id);
    setError(false);
    if (audio.dataset.track !== track.id || audio.getAttribute("src") !== track.audioUrl) {
      audio.dataset.track = track.id;
      audio.src = track.audioUrl;
    }
    audio.volume = volume;
    audio.loop = loop;
    void audio
      .play()
      .then(() => {
        if (sequence.current.value === request) {
          pending.current = null;
          setPendingId(null);
          setActiveId(track.id);
        }
      })
      .catch(() => {
        if (sequence.current.value === request) {
          pending.current = null;
          setPendingId(null);
          setActiveId(null);
          setError(true);
        }
      });
  }
  function toggle(track: MusicChoice, volume = 0.5, loop = false) {
    if (activeId === track.id || pending.current === track.id) stop();
    else play(track, volume, loop);
  }
  const element = (
    <audio
      ref={ref}
      preload="metadata"
      onEnded={() => setActiveId(null)}
      onError={() => {
        pending.current = null;
        setPendingId(null);
        setActiveId(null);
        setError(true);
      }}
    />
  );
  return { activeId, pendingId, error, play, toggle, stop, configure, element };
}
