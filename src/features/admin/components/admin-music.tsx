"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pause, Play, Plus } from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { ApiError } from "@/core/api/api-error";
import { listMusic, saveMusic, setMusicStatus, type MusicTrack } from "@/shared/api/music.api";
import { AdminMusicUpload } from "./admin-music-upload";
import { useAudioPreview } from "@/shared/lib/use-audio-preview";
import { adminApi } from "../api/admin.api";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";

export function AdminMusic() {
  const { t } = useTranslation("admin");
  const { api } = useRuntime();
  const cache = useQueryClient();
  const player = useAudioPreview();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<MusicTrack | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | undefined>();
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);
  const fileValid =
    !file || (/\.mp3$/i.test(file.name) && file.size > 0 && file.size <= 20 * 1024 * 1024);
  const audioUrl = file ? previewUrl : (editing?.audioUrl ?? "");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const permissions = useQuery({
    queryKey: ["admin-my-permissions"],
    queryFn: ({ signal }) => adminApi.myPermissions(api, signal),
  });
  const canManage = permissions.data?.includes("ADMIN_MUSIC_MANAGE") ?? false;
  const tracks = useQuery({
    queryKey: ["admin-music", search, status, page],
    queryFn: ({ signal }) =>
      listMusic(
        api,
        { search, page, isActive: status ? status === "active" : undefined },
        true,
        signal,
      ),
  });
  async function refresh() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["admin-music"] }),
      cache.invalidateQueries({ queryKey: ["music-tracks"] }),
      cache.invalidateQueries({ queryKey: ["music-track"] }),
    ]);
  }
  function errorMessage(reason: unknown) {
    if (
      reason instanceof ApiError &&
      (reason.status === 413 || reason.backendCode === "MUSIC_FILE_SIZE")
    )
      return t("music.fileSize");
    if (reason instanceof ApiError && reason.backendCode?.startsWith("MUSIC_FILE_"))
      return t("music.fileInvalid");
    if (reason instanceof ApiError && reason.backendCode === "MUSIC_URL_EXISTS")
      return t("music.urlExists");
    if (reason instanceof ApiError && reason.status === 409) return t("music.conflict");
    return t("music.saveFailed");
  }
  const save = useMutation({
    mutationFn: () => saveMusic(api, { name: name.trim(), file }, editing ?? undefined),
    onSuccess: async () => {
      setOpen(false);
      setFile(undefined);
      setPreviewUrl("");
      player.stop();
      await refresh();
    },
    onError: (reason) => setError(errorMessage(reason)),
  });
  const toggle = useMutation({
    mutationFn: (track: MusicTrack) => setMusicStatus(api, track),
    onSuccess: refresh,
    onError: async (reason) => {
      setError(errorMessage(reason));
      await refresh();
    },
  });
  function edit(track: MusicTrack | null) {
    player.stop();
    setEditing(track);
    setName(track?.name ?? "");
    setFile(undefined);
    setPreviewUrl("");
    setError("");
    setSubmitted(false);
    setOpen(true);
  }
  function chooseFile(selected?: File) {
    if (save.isPending) return;
    player.stop();
    setError("");
    setFile(selected);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : "");
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    setSubmitted(true);
    setError("");
    if (!name.trim() || name.trim().length > 150 || !fileValid || (!file && !editing)) return;
    save.mutate();
  }
  const busy = save.isPending || toggle.isPending;
  return (
    <div className="space-y-6">
      {player.element}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("music.title")}</h1>
        {canManage && (
          <Button onClick={() => edit(null)}>
            <Plus size={16} />
            {t("music.add")}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          aria-label={t("music.search")}
          placeholder={t("music.search")}
          maxLength={150}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          className="rounded-lg border bg-card px-3 text-sm"
          aria-label={t("status")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("allStatuses")}</option>
          <option value="active">{t("music.active")}</option>
          <option value="hidden">{t("music.hidden")}</option>
        </select>
      </div>
      {player.error && (
        <p role="alert" className="text-sm text-destructive">
          {t("music.playFailed")}
        </p>
      )}
      {error && !open && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {tracks.isPending && <LoadingState label={t("music.loading")} />}
      {tracks.isError && <ErrorState error={tracks.error} retry={() => void tracks.refetch()} />}
      {tracks.data && (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-4">{t("music.name")}</th>
                  <th className="p-4">{t("status")}</th>
                  <th className="p-4">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {tracks.data.items.map((track) => (
                  <tr key={track.id} className="border-b last:border-0">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t(
                            player.activeId === track.id ? "music.pause" : "music.play",
                            { name: track.name },
                          )}
                          onClick={() => player.toggle(track)}
                        >
                          {player.activeId === track.id ? <Pause /> : <Play />}
                        </Button>
                        <span>{track.name}</span>
                      </div>
                    </td>
                    <td className="p-4">{t(track.isActive ? "music.active" : "music.hidden")}</td>
                    <td className="p-4">
                      {canManage && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => edit(track)}
                          >
                            {t("music.edit")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              setError("");
                              toggle.mutate(track);
                            }}
                          >
                            {t(track.isActive ? "music.hide" : "music.show")}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tracks.data.items.length && (
              <p className="p-6 text-sm text-muted-foreground">{t("music.empty")}</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 text-sm">
            <Button
              variant="outline"
              disabled={page === 1 || tracks.isFetching}
              onClick={() => setPage(page - 1)}
            >
              ‹
            </Button>
            <span>
              {page}/{Math.max(1, tracks.data.totalPages)}
            </span>
            <Button
              variant="outline"
              disabled={page >= tracks.data.totalPages || tracks.isFetching}
              onClick={() => setPage(page + 1)}
            >
              ›
            </Button>
          </div>
        </>
      )}
      <Modal
        open={open}
        onClose={() => {
          if (!save.isPending) {
            setOpen(false);
            setFile(undefined);
            setPreviewUrl("");
            player.stop();
          }
        }}
        title={t(editing ? "music.edit" : "music.add")}
      >
        <form className="space-y-4" onSubmit={submit} noValidate>
          <label className="grid gap-2 text-sm">
            {t("music.name")} *
            <Input
              required
              disabled={save.isPending}
              maxLength={150}
              value={name}
              aria-invalid={submitted && !name.trim()}
              onChange={(event) => setName(event.target.value)}
            />
            {submitted && !name.trim() && (
              <span className="text-destructive">{t("music.nameInvalid")}</span>
            )}
          </label>
          <AdminMusicUpload
            key={`${open}-${editing?.id ?? "new"}`}
            file={file}
            disabled={save.isPending}
            label={t(editing ? "music.replaceFile" : "music.file")}
            required={!editing}
            submitted={submitted}
            onChange={chooseFile}
            onError={setError}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {player.error && (
            <p role="alert" className="text-sm text-destructive">
              {t("music.playFailed")}
            </p>
          )}
          {save.isPending && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("music.uploading")}
            </p>
          )}
          <div className="flex justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!audioUrl || !fileValid || save.isPending}
              onClick={() =>
                player.toggle({
                  id: "admin-form",
                  name,
                  audioUrl: audioUrl.trim(),
                  isActive: false,
                })
              }
            >
              {t(player.activeId === "admin-form" ? "music.pauseSimple" : "music.preview")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {t(save.isPending ? "music.saving" : "music.save")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
