import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";

export const wordingVariables = [
  "recipientLabel",
  "recipientName",
  "honorific",
  "senderPronoun",
] as const;
const plainText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
export const wordingPresetSchema = z.object({
  id: z.uuid().refine((value) => value !== "00000000-0000-0000-0000-000000000000"),
  name: plainText(80).refine((value) => !!value.trim()),
  content: plainText(2000).refine((value) => {
    const remaining = value.replace(
      /\{\{(recipientName|recipientLabel|honorific|senderPronoun)\}\}/g,
      "",
    );
    return (
      !/[{}]/.test(remaining) &&
      (value.includes("{{recipientLabel}}") || value.includes("{{recipientName}}"))
    );
  }),
  senderPronoun: plainText(50),
  isDefault: z.boolean(),
  honorifics: z.array(plainText(50).refine((value) => !!value.trim())).max(50),
});
export type WordingPreset = z.infer<typeof wordingPresetSchema>;
export const honorificKey = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();
export const wordingPresetsSchema = z
  .array(wordingPresetSchema)
  .min(1)
  .max(30)
  .superRefine((presets, ctx) => {
    // Messages are i18n keys of the "guestTools" namespace; the component translates them with `params`.
    const error = (message: string, params?: Record<string, string>) =>
      ctx.addIssue({ code: "custom", message, params });
    if (presets.filter((p) => p.isDefault).length !== 1) error("wording.validation.oneDefault");
    const ids = new Set<string>(),
      names = new Set<string>(),
      honorifics = new Set<string>();
    for (const preset of presets) {
      if (ids.has(preset.id)) error("wording.validation.duplicateId");
      if (names.has(honorificKey(preset.name))) error("wording.validation.duplicateName");
      ids.add(preset.id);
      names.add(honorificKey(preset.name));
      if (preset.content.includes("{{senderPronoun}}") && !preset.senderPronoun.trim())
        error("wording.validation.senderRequired", { name: preset.name });
      for (const h of preset.honorifics) {
        const key = honorificKey(h);
        if (honorifics.has(key)) error("wording.validation.honorificTwice", { honorific: h });
        honorifics.add(key);
      }
    }
  });
export const wordingSettingsSchema = z.object({
  weddingId: z.uuid(),
  version: z.number().int().nonnegative(),
  presets: wordingPresetsSchema,
});
export type WordingSettings = z.infer<typeof wordingSettingsSchema>;
const previewSchema = z.object({
  guestId: z.uuid(),
  presetId: z.uuid(),
  presetName: z.string(),
  usedDefault: z.boolean(),
  recipientName: z.string(),
  honorific: z.string().nullable(),
  recipientLabel: z.string(),
  senderPronoun: z.string(),
  content: z.string(),
});
export type WordingPreviewInput = { guestId: string; presets: WordingPreset[] };
const path = (weddingId: string) => `/weddings/${encodeURIComponent(weddingId)}/invitation-wording`;
export const wordingApi = {
  get: (api: ApiClient, weddingId: string, signal?: AbortSignal) =>
    api.request(path(weddingId), { signal, schema: wordingSettingsSchema }),
  save: (api: ApiClient, weddingId: string, expectedVersion: number, presets: WordingPreset[]) =>
    api.request(path(weddingId), {
      method: "PUT",
      body: { expectedVersion, presets: wordingPresetsSchema.parse(presets) },
      schema: wordingSettingsSchema,
    }),
  preview: (api: ApiClient, weddingId: string, input: WordingPreviewInput) =>
    api.request(`${path(weddingId)}/preview`, {
      method: "POST",
      body: { guestId: input.guestId, presets: wordingPresetsSchema.parse(input.presets) },
      schema: previewSchema,
    }),
};
