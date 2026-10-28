import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";
import { studioDocumentSchema } from "../schemas/document";
import { resolveMediaUrl } from "@/core/config/media-url";
import { env } from "@/core/config/env";

type StudioDocument = z.infer<typeof studioDocumentSchema>;
function mapMedia(document: StudioDocument, mapper: (src: string) => string): StudioDocument {
  return {
    ...document,
    nodes: Object.fromEntries(Object.entries(document.nodes).map(([id, node]) => [id, {
      ...node,
      props: {
        ...node.props,
        ...(node.props.src ? { src: mapper(node.props.src) } : {}),
        ...(node.props.images ? { images: node.props.images.map(mapper) } : {}),
        ...(node.props.cover?.decoration ? { cover: { ...node.props.cover, decoration: mapper(node.props.cover.decoration) } } : {}),
      },
    }])),
  };
}

function toStoredSource(src: string) {
  try {
    const url = new URL(src);
    if (url.pathname.startsWith("/media/") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" ||
        (env.apiUrl && url.origin === new URL(env.apiUrl).origin))) return url.pathname;
  } catch { /* Relative asset paths are already portable. */ }
  return src;
}
export const resolveInvitationDocument = (document: StudioDocument) =>
  mapMedia(document, (src) => resolveMediaUrl(toStoredSource(src)) ?? src);
export const storedInvitationDocument = (document: StudioDocument) => mapMedia(document, toStoredSource);
const resolveDesign = <T extends { document: StudioDocument | null }>(design: T): T =>
  ({ ...design, document: design.document ? resolveInvitationDocument(design.document) : null });

export const invitationDesignSchema = z.object({
  version: z.number().int().nonnegative(), document: studioDocumentSchema.nullable(),
  status: z.enum(["DRAFT", "PUBLISHED"]), hasUnpublishedChanges: z.boolean(),
  wordingVersion: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});
export function getInvitationDesign(api: ApiClient, id: string, signal?: AbortSignal) {
  return api.request(`/weddings/${encodeURIComponent(id)}/invitation-design`, {
    signal,
    schema: invitationDesignSchema,
  }).then(resolveDesign);
}
export function saveInvitationDesign(
  api: ApiClient,
  id: string,
  expectedVersion: number,
  serialized: string,
) {
  return api.request(`/weddings/${encodeURIComponent(id)}/invitation-design`, {
    method: "PUT",
    body: { expectedVersion, document: storedInvitationDocument(studioDocumentSchema.parse(JSON.parse(serialized))) },
    schema: invitationDesignSchema,
  }).then(resolveDesign);
}
export const publicInvitationSchema = z.object({
  document: studioDocumentSchema,
  content: z.string(),
});
const path = (id: string) => `/weddings/${encodeURIComponent(id)}/invitation-design`;
export const publishInvitationDesign = (api: ApiClient, id: string, expectedVersion: number, expectedWordingVersion: number) =>
  api.request(`${path(id)}/publish`, { method: "POST", body: { expectedVersion, expectedWordingVersion }, schema: invitationDesignSchema }).then(resolveDesign);
