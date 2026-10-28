import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";
import { env } from "@/core/config/env";
import { resolveMediaUrl } from "@/core/config/media-url";
// eslint-disable-next-line architecture/boundaries -- Website API contracts share the Studio JSON document schema
import { studioDocumentSchema } from "@/features/template-studio/schemas/document";
import { weddingStorySchema, isWeddingStoryDocument } from "../schemas/wedding-story.schema";
import { storyDraftV3Schema, storySnapshotV3Schema } from "../schemas/story-v3.schema";

export const websiteTemplates = [
  { id: "story-red-velvet", name: "Đỏ nhung", color: "#7d1929", background: "#fff7f2" },
  { id: "story-editorial-61", name: "Editorial", color: "#393435", background: "#f8f5ef" },
  { id: "story-garden-02", name: "Vườn hoa", color: "#4c6750", background: "#f6f9f1" },
  { id: "story-seaside-01", name: "Biển xanh", color: "#356575", background: "#f1f8fa" },
  { id: "story-scarlet-39", name: "Đỏ truyền thống", color: "#9a3030", background: "#fff8ee" },
  { id: "story-sage-53", name: "Lá xô thơm", color: "#627260", background: "#f6f7f0" },
] as const;

export type StudioDocument = z.infer<typeof studioDocumentSchema>;

export const legacyWebsiteDocumentSchema = z
  .object({
    templateId: z.string().optional(),
    title: z.string().optional(),
    partnerOne: z.string().optional(),
    partnerTwo: z.string().optional(),
    story: z.string().optional(),
    eventAt: z.string().optional(),
    venueName: z.string().optional(),
    venueAddress: z.string().optional(),
    heroImageUrl: z.string().nullable().optional(),
    showStory: z.boolean().optional(),
    showEvent: z.boolean().optional(),
    contact: z.string().nullable().optional(),
    timeline: z
      .array(z.object({ title: z.string(), description: z.string() }))
      .nullable()
      .optional(),
    events: z
      .array(z.object({ name: z.string(), startsAt: z.string(), address: z.string() }))
      .nullable()
      .optional(),
    gallery: z.array(z.string()).nullable().optional(),
    timeZoneId: z.string().nullable().optional(),
  })
  .passthrough();

export type LegacyWebsiteDocument = z.infer<typeof legacyWebsiteDocumentSchema>;

export const websiteDocumentSchema = z.union([
  storyDraftV3Schema,
  storySnapshotV3Schema,
  weddingStorySchema,
  studioDocumentSchema,
  legacyWebsiteDocumentSchema,
]);
export type WebsiteDocument = z.infer<typeof websiteDocumentSchema>;
export { isWeddingStoryDocument };

export const websiteSchema = z.object({
  version: z.number(),
  document: websiteDocumentSchema.nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "UNPUBLISHED"]),
  hasUnpublishedChanges: z.boolean(),
  warnings: z.array(z.string()).optional().default([]),
});

export const publicWebsiteSchema = z.object({
  slug: z.string(),
  document: websiteDocumentSchema,
});

export const uploadedMediaSchema = z.object({ id: z.string(), url: z.string() });
export const storyWishSchema = z.object({
  id: z.string(),
  name: z.string(),
  message: z.string(),
  createdAt: z.string(),
});
export const storyTemplateConfigSchema = z.object({
  key: z.string(), name: z.string(),
  sections: z.array(z.object({ type: z.string(), variant: z.string() })),
  theme: z.object({
    colors: z.object({ primary: z.string(), background: z.string(), accent: z.string(), text: z.string() }),
    fontHeading: z.string(), fontBody: z.string(),
  }),
  palettes: z.array(z.object({
    id: z.string(), label: z.string(),
    colors: z.object({ primary: z.string(), background: z.string(), accent: z.string(), text: z.string() }),
  })),
  allowedFonts: z.array(z.string()),
  assets: z.record(z.string(), z.string()).nullable().optional(),
});
export const storyTemplateSummarySchema = z.object({
  key: z.string(),
  version: z.number(),
  name: z.string(),
  config: storyTemplateConfigSchema,
});
export type PublicStoryTemplate = z.infer<typeof storyTemplateSummarySchema>;
export const listStoryTemplates = (api: ApiClient) =>
  api.request("/story-templates", { schema: z.array(storyTemplateSummarySchema) });
export const getStoryTemplate = (api: ApiClient, key: string) =>
  api.request(`/story-templates/${encodeURIComponent(key)}`, { schema: storyTemplateSummarySchema });
export type Website = z.infer<typeof websiteSchema>;

export function isStudioDocument(doc: unknown): doc is StudioDocument {
  return (
    typeof doc === "object" &&
    doc !== null &&
    "schemaVersion" in doc &&
    (doc as { schemaVersion: unknown }).schemaVersion === 1 &&
    "nodes" in doc &&
    typeof (doc as { nodes: unknown }).nodes === "object" &&
    "ROOT" in (doc as { nodes: Record<string, unknown> }).nodes
  );
}

export function isLegacyWebsiteDocument(doc: unknown): doc is LegacyWebsiteDocument {
  return (
    typeof doc === "object" &&
    doc !== null &&
    !("schemaVersion" in doc) &&
    ("title" in doc || "partnerOne" in doc || "eventAt" in doc)
  );
}

export function mapStudioMedia(
  document: StudioDocument,
  mapper: (src: string) => string,
): StudioDocument {
  return {
    ...document,
    nodes: Object.fromEntries(
      Object.entries(document.nodes).map(([id, node]) => [
        id,
        {
          ...node,
          props: {
            ...node.props,
            ...(node.props.src ? { src: mapper(node.props.src) } : {}),
            ...(node.props.images ? { images: node.props.images.map(mapper) } : {}),
            ...(node.props.cover?.decoration
              ? { cover: { ...node.props.cover, decoration: mapper(node.props.cover.decoration) } }
              : {}),
          },
        },
      ]),
    ),
  };
}

export function toStoredSource(src: string) {
  try {
    const url = new URL(src);
    if (
      url.pathname.startsWith("/media/") &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        (env.apiUrl && url.origin === new URL(env.apiUrl).origin))
    ) {
      return url.pathname;
    }
  } catch {
    /* Relative asset paths are already portable. */
  }
  return src;
}

export const resolveWebsiteDocument = (document: StudioDocument) =>
  mapStudioMedia(document, (src) => resolveMediaUrl(toStoredSource(src)) ?? src);

export const storedWebsiteDocument = (document: WebsiteDocument) =>
  isStudioDocument(document) ? mapStudioMedia(document, toStoredSource) : document;

function resolveDocumentMedia(doc: WebsiteDocument | null): WebsiteDocument | null {
  if (!doc) return null;
  if (isStudioDocument(doc)) {
    return resolveWebsiteDocument(doc);
  }
  return doc;
}

const path = (id: string) => `/weddings/${encodeURIComponent(id)}/website`;

export const getWebsite = (api: ApiClient, id: string, signal?: AbortSignal) =>
  api
    .request(path(id), { signal, schema: websiteSchema })
    .then((res) => ({ ...res, document: resolveDocumentMedia(res.document) }));

export const saveWebsite = (
  api: ApiClient,
  id: string,
  expectedVersion: number,
  document: WebsiteDocument | string,
) => {
  const parsed =
    typeof document === "string"
      ? websiteDocumentSchema.parse(JSON.parse(document))
      : websiteDocumentSchema.parse(document);

  return api
    .request(path(id), {
      method: "PUT",
      body: { expectedVersion, document: storedWebsiteDocument(parsed) },
      schema: websiteSchema,
    })
    .then((res) => ({ ...res, document: resolveDocumentMedia(res.document) }));
};

export const publishWebsite = (api: ApiClient, id: string, expectedVersion: number) =>
  api
    .request(`${path(id)}/publish`, {
      method: "POST",
      body: { expectedVersion },
      schema: websiteSchema,
    })
    .then((res) => ({ ...res, document: resolveDocumentMedia(res.document) }));

export const unpublishWebsite = (api: ApiClient, id: string, expectedVersion: number) =>
  api
    .request(`${path(id)}/unpublish`, {
      method: "POST",
      body: { expectedVersion },
      schema: websiteSchema,
    })
    .then((res) => ({ ...res, document: resolveDocumentMedia(res.document) }));

export const getPublicWebsite = (api: ApiClient, slug: string, signal?: AbortSignal) =>
  api
    .request(`/public/weddings/${encodeURIComponent(slug)}`, {
      auth: "none",
      signal,
      schema: publicWebsiteSchema,
    })
    .then((res) => ({
      ...res,
      document: (resolveDocumentMedia(res.document) ?? res.document) as WebsiteDocument,
    }));

export const listStoryWishes = (api: ApiClient, slug: string) =>
  api.request(`/public/weddings/${encodeURIComponent(slug)}/wishes`, {
    auth: "none",
    schema: z.array(storyWishSchema),
  });

export const sendStoryWish = (api: ApiClient, slug: string, name: string, message: string) =>
  api.request(`/public/weddings/${encodeURIComponent(slug)}/wishes`, {
    auth: "none",
    method: "POST",
    body: { name, message },
    schema: storyWishSchema,
  });

export const listWeddingMedia = (api: ApiClient, id: string) =>
  api.request(`/weddings/${encodeURIComponent(id)}/media`, {
    schema: z.array(uploadedMediaSchema),
  });

export const uploadWeddingMedia = (api: ApiClient, id: string, file: File) => {
  const body = new FormData();
  body.set("file", file);
  return api.request(`/weddings/${encodeURIComponent(id)}/media`, {
    method: "POST",
    body,
    schema: uploadedMediaSchema,
  });
};

export function mediaUrl(value: string | null | undefined) {
  return resolveMediaUrl(value);
}
