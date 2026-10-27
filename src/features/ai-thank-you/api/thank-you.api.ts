import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";
import { loadAllMessageRecipients } from "@/shared/lib/message-recipients";

export const thankYouTemplateSchema = z.object({
  id: z.string(),
  weddingId: z.string(),
  content: z.string(),
  tone: z.string(),
  language: z.string(),
  status: z.enum(["DRAFT", "APPROVED"]),
  model: z.string(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  usedFallback: z.boolean(),
  version: z.number(),
  createdBy: z.string(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  includesGiftAmount: z.boolean(),
});
export type ThankYouTemplate = z.infer<typeof thankYouTemplateSchema>;

export const thankYouBatchSchema = z.object({
  id: z.string(),
  status: z.string(),
  totalCount: z.number(),
  sentCount: z.number(),
  failedCount: z.number(),
  pendingCount: z.number(),
  createdAt: z.string(),
  jobs: z.array(
    z.object({
      id: z.string(),
      messageId: z.string().nullable(),
      templateId: z.string().nullable(),
      guestId: z.string(),
      channel: z.string(),
      recipient: z.string(),
      status: z.string(),
      attemptCount: z.number(),
      sentAt: z.string().nullable(),
      errorCode: z.string().nullable(),
    }),
  ),
});
export type ThankYouBatch = z.infer<typeof thankYouBatchSchema>;

const thankYouGuestPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      recipientName: z.string(),
      side: z.string(),
      group: z.object({ name: z.string() }).nullable(),
      email: z.string().nullable().optional(),
      phone: z.string().nullable(),
    }),
  ),
  page: z.number(),
  pageSize: z.number(),
  totalItems: z.number(),
});
export type ThankYouGuestPage = z.infer<typeof thankYouGuestPageSchema>;

const templatePageSchema = z.object({
  items: z.array(thankYouTemplateSchema),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
});
const templateBase = (weddingId: string) =>
  `/weddings/${encodeURIComponent(weddingId)}/ai/thank-you-templates`;
const messageBase = (weddingId: string) =>
  `/weddings/${encodeURIComponent(weddingId)}/ai/thank-you-messages`;

export function listThankYouGuests(
  api: ApiClient,
  weddingId: string,
  page: number,
  signal?: AbortSignal,
  pageSize = 20,
) {
  return api.request(
    `/weddings/${encodeURIComponent(weddingId)}/guest-planning/guests?${new URLSearchParams({ page: String(page), pageSize: String(pageSize), search: "", archivedOnly: "false" })}`,
    { signal, schema: thankYouGuestPageSchema },
  );
}

export function listAllThankYouGuests(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return loadAllMessageRecipients((page) => listThankYouGuests(api, weddingId, page, signal, 100));
}

export function listThankYouTemplates(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`${templateBase(weddingId)}?page=1&pageSize=100`, {
    signal,
    schema: templatePageSchema,
  });
}

export function generateThankYouTemplateOptions(
  api: ApiClient,
  weddingId: string,
  input: {
    guestIds: string[];
    includeGiftAmount: boolean;
  },
) {
  return api.request(`${templateBase(weddingId)}/generate-options`, {
    method: "POST",
    body: { ...input, variantCount: 1 },
    schema: z.array(thankYouTemplateSchema),
  });
}

export function editThankYouTemplate(
  api: ApiClient,
  weddingId: string,
  id: string,
  input: { content: string; expectedVersion: number; includeGiftAmount: boolean },
) {
  return api.request(`${templateBase(weddingId)}/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: input,
    schema: thankYouTemplateSchema,
  });
}

export function approveThankYouTemplate(
  api: ApiClient,
  weddingId: string,
  id: string,
  expectedVersion: number,
) {
  return api.request(`${templateBase(weddingId)}/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: { expectedVersion },
    schema: thankYouTemplateSchema,
  });
}

export function previewThankYouTemplate(
  api: ApiClient,
  weddingId: string,
  id: string,
  guestId: string,
) {
  return api.request(`${templateBase(weddingId)}/${encodeURIComponent(id)}/preview`, {
    method: "POST",
    body: { weddingGuestId: guestId },
    schema: z.object({
      templateId: z.string(),
      weddingGuestId: z.string(),
      guestName: z.string(),
      renderedContent: z.string(),
    }),
  });
}

export function queueThankYouTemplateMessages(
  api: ApiClient,
  weddingId: string,
  templateId: string,
  guestIds: string[],
  channels: string[],
  key: string,
) {
  return api.request(`${messageBase(weddingId)}/send`, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: { templateId, guestIds, channels },
    schema: z.object({ id: z.string(), replayed: z.boolean() }),
  });
}

export function getThankYouBatch(
  api: ApiClient,
  weddingId: string,
  batchId: string,
  signal?: AbortSignal,
) {
  return api.request(`${messageBase(weddingId)}/batches/${encodeURIComponent(batchId)}`, {
    signal,
    schema: thankYouBatchSchema,
  });
}

export function retryThankYouBatch(api: ApiClient, weddingId: string, batchId: string) {
  return api.request(`${messageBase(weddingId)}/batches/${encodeURIComponent(batchId)}/retry`, {
    method: "POST",
    schema: z.object({ retried: z.number() }),
  });
}

export function getPublicThankYou(api: ApiClient, token: string, signal?: AbortSignal) {
  return api.request(`/guest-thank-you/${encodeURIComponent(token)}`, {
    auth: "none",
    signal,
    schema: z.object({
      guestName: z.string(),
      weddingTitle: z.string(),
      content: z.string(),
      sentAt: z.string(),
    }),
  });
}
