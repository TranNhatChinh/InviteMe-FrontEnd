import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";
import { invitationMusicSchema } from "@/shared/api/music.api";

export const publicTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  theme: z.string().nullable(),
  previewUrl: z.string().nullable(),
  configurationJson: z.string(),
  music: invitationMusicSchema.nullish(),
});
export const publicTemplateVisibilitySchema = z.object({ slug: z.string(), visible: z.boolean() });
export const publicTemplateListSchema = z.array(publicTemplateSchema);
export const publicTemplateVisibilityListSchema = z.array(publicTemplateVisibilitySchema);
export type PublicTemplate = z.infer<typeof publicTemplateSchema>;

export function listPublicTemplates(api: ApiClient, signal?: AbortSignal) {
  return api.request("/templates", { auth: "none", signal, schema: publicTemplateListSchema });
}

export function listPublicTemplateVisibility(api: ApiClient, signal?: AbortSignal) {
  return api.request("/templates/visibility", {
    auth: "none",
    signal,
    schema: publicTemplateVisibilityListSchema,
  });
}
