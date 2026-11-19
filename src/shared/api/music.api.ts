import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";

export const musicSettingsSchema = z
  .object({
    trackId: z.uuid().refine((id) => id !== "00000000-0000-0000-0000-000000000000"),
    enabled: z.boolean(),
    volume: z.number().min(0).max(1),
    loop: z.boolean(),
  })
  .strict();
export type MusicSettings = z.infer<typeof musicSettingsSchema>;
export const invitationMusicSchema = musicSettingsSchema.extend({
  name: z.string(),
  audioUrl: z.string(),
  isActive: z.boolean(),
});
export type InvitationMusic = z.infer<typeof invitationMusicSchema>;
export const musicTrackSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  audioUrl: z.string(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MusicTrack = z.infer<typeof musicTrackSchema>;
export type MusicChoice = Pick<MusicTrack, "id" | "name" | "audioUrl" | "isActive">;
const tracksSchema = z.object({
  items: z.array(musicTrackSchema),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
});
export function listMusic(
  api: ApiClient,
  input: { page?: number; search?: string; isActive?: boolean } = {},
  admin = false,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ page: String(input.page ?? 1), pageSize: "25" });
  if (input.search) query.set("search", input.search.trim());
  if (input.isActive !== undefined) query.set("isActive", String(input.isActive));
  return api.request((admin ? "/admin/music-tracks?" : "/music-tracks?") + query, {
    schema: tracksSchema,
    signal,
  });
}
export function getMusic(api: ApiClient, id: string, signal?: AbortSignal) {
  return api.request(`/music-tracks/${encodeURIComponent(id)}`, {
    schema: musicTrackSchema,
    signal,
  });
}
export function saveMusic(
  api: ApiClient,
  input: { name: string; audioUrl: string },
  existing?: MusicTrack,
) {
  return api.request(existing ? `/admin/music-tracks/${existing.id}` : "/admin/music-tracks", {
    method: existing ? "PUT" : "POST",
    body: { ...input, ...(existing ? { expectedVersion: existing.version } : {}) },
    schema: musicTrackSchema,
  });
}
export function setMusicStatus(api: ApiClient, track: MusicTrack) {
  return api.request(`/admin/music-tracks/${track.id}/status`, {
    method: "PUT",
    body: { isActive: !track.isActive, expectedVersion: track.version },
    schema: musicTrackSchema,
  });
}
export function validAudioUrl(value: string) {
  if (value.trim().length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" && !!url.hostname && !url.username && !url.password && !url.hash
    );
  } catch {
    return false;
  }
}
export function audioDuration(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—";
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
