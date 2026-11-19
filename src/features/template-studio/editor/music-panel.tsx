"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Pause, Play, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRuntime } from "@/core/config/runtime";
import {
  getMusic,
  listMusic,
  type InvitationMusic,
  type MusicChoice,
  type MusicSettings,
} from "@/shared/api/music.api";
import { useAudioPreview } from "@/shared/lib/use-audio-preview";
import { AudioDuration } from "@/shared/components/audio-duration";
import styles from "./music-panel.module.css";

export function MusicPanel({
  value,
  resolved,
  disabled,
  onChange,
}: {
  value?: MusicSettings;
  resolved?: InvitationMusic | null;
  disabled: boolean;
  onChange: (value: MusicSettings | undefined) => void;
}) {
  const { t } = useTranslation("templateStudio");
  const { api } = useRuntime();
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const player = useAudioPreview();
  const tracks = useQuery({
    queryKey: ["music-tracks", search, page],
    queryFn: ({ signal }) => listMusic(api, { search, page }, false, signal),
  });
  const selected = useQuery<MusicChoice>({
    queryKey: ["music-track", value?.trackId],
    queryFn: ({ signal }) => getMusic(api, value?.trackId ?? "", signal),
    enabled: !!value?.trackId,
    initialData:
      resolved && resolved.trackId === value?.trackId
        ? {
            id: resolved.trackId,
            name: resolved.name,
            audioUrl: resolved.audioUrl,
            isActive: resolved.isActive,
          }
        : undefined,
    retry: false,
  });
  function selectTrack(track: MusicChoice) {
    cache.setQueryData(["music-track", track.id], track);
    player.stop();
    onChange({
      trackId: track.id,
      enabled: true,
      volume: value?.volume ?? 0.5,
      loop: value?.loop ?? true,
    });
  }
  function playButton(track: MusicChoice) {
    const loading = player.pendingId === track.id;
    const playing = player.activeId === track.id;
    return (
      <button
        type="button"
        className={styles.play}
        data-state={loading ? "loading" : playing ? "playing" : "idle"}
        aria-pressed={playing}
        aria-busy={loading}
        aria-label={t(
          loading ? "music.cancelLoading" : playing ? "music.pauseTrack" : "music.playTrack",
          {
            name: track.name,
          },
        )}
        onClick={() =>
          player.toggle(
            track,
            value?.trackId === track.id ? value.volume : 0.5,
            value?.trackId === track.id ? value.loop : false,
          )
        }
      >
        {loading ? (
          <LoaderCircle size={14} aria-hidden="true" />
        ) : playing ? (
          <Pause size={12} fill="currentColor" aria-hidden="true" />
        ) : (
          <Play size={12} fill="currentColor" aria-hidden="true" />
        )}
      </button>
    );
  }
  return (
    <div className={styles.panel}>
      {player.element}
      <h2>{t("categories.music")}</h2>
      {value && (
        <div className={styles.current}>
          {selected.data && playButton(selected.data)}
          <div className={styles.trackText}>
            <small>{t("music.current")}</small>
            <strong>{selected.data?.name ?? t("music.unavailable")}</strong>
            {selected.data && <AudioDuration url={selected.data.audioUrl} />}
            {selected.data && !selected.data.isActive && <small>{t("music.hidden")}</small>}
          </div>
          <button
            type="button"
            className={styles.remove}
            disabled={disabled}
            aria-label={t("music.remove")}
            onClick={() => {
              player.stop();
              onChange(undefined);
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className={styles.tabs}>
        <span>{t("music.library")}</span>
      </div>
      <label className={styles.search}>
        <Search size={14} />
        <input
          aria-label={t("music.search")}
          placeholder={t("music.search")}
          value={search}
          maxLength={150}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </label>
      {player.error && (
        <p role="alert" className={styles.error}>
          {t("music.playFailed")}
        </p>
      )}
      {tracks.isPending && <p role="status">{t("music.loading")}</p>}
      {tracks.isError && (
        <button type="button" onClick={() => void tracks.refetch()}>
          {t("music.retry")}
        </button>
      )}
      {tracks.data && !tracks.data.items.length && <p>{t("music.empty")}</p>}
      <ul className={styles.list}>
        {tracks.data?.items.map((track) => (
          <li key={track.id}>
            {playButton(track)}
            <div className={styles.trackText}>
              <strong title={track.name}>{track.name}</strong>
              <AudioDuration url={track.audioUrl} />
            </div>
            <button
              type="button"
              className={styles.use}
              disabled={disabled || value?.trackId === track.id}
              onClick={() => selectTrack(track)}
            >
              {t(value?.trackId === track.id ? "music.used" : "music.use")}
            </button>
          </li>
        ))}
      </ul>
      {tracks.data && tracks.data.totalPages > 1 && (
        <div className={styles.pagination}>
          <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>
            ‹
          </button>
          <span>
            {page}/{tracks.data.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= tracks.data.totalPages}
            onClick={() => setPage(page + 1)}
          >
            ›
          </button>
        </div>
      )}
      {value && (
        <fieldset className={styles.settings} disabled={disabled}>
          <label>
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
            />
            {t("music.enabled")}
          </label>
          <label>
            {t("music.volume")} {Math.round(value.volume * 100)}%
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(value.volume * 100)}
              onChange={(event) => {
                const volume = Number(event.target.value) / 100;
                if (player.activeId === value.trackId) player.configure(volume, value.loop);
                onChange({ ...value, volume });
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={value.loop}
              onChange={(event) => {
                if (player.activeId === value.trackId)
                  player.configure(value.volume, event.target.checked);
                onChange({ ...value, loop: event.target.checked });
              }}
            />
            {t("music.loop")}
          </label>
        </fieldset>
      )}
    </div>
  );
}
