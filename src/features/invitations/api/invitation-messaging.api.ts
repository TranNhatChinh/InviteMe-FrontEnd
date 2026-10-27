import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";

export const invitationDraftSchema = z.object({
  weddingId: z.string(),
  subject: z.string(),
  content: z.string(),
  tone: z.enum(["FORMAL", "WARM", "HUMOROUS"]).optional(),
  version: z.number().int().nonnegative(),
  usedFallback: z.boolean(),
  smsContent: z.string(),
  smsUsedFallback: z.boolean(),
});
export const invitationPreviewSchema = z.object({
  guestId: z.string(),
  recipientName: z.string(),
  subject: z.string(),
  content: z.string(),
  smsContent: z.string(),
  rsvpLink: z.string(),
  qrLink: z.string(),
  emailHtml: z.string(),
  emailPlainText: z.string(),
  weddingImageUrl: z.string().nullable(),
});
export const invitationBatchSchema = z.object({
  id: z.string(),
  status: z.enum(["PENDING", "SENT", "FAILED", "PARTIAL_FAILED"]),
  totalCount: z.number().int().nonnegative(),
  sentCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  jobs: z.array(
    z.object({
      id: z.string(),
      guestId: z.string(),
      channel: z.enum(["EMAIL", "SMS"]),
      recipient: z.string(),
      status: z.enum(["PENDING", "SENDING", "SENT", "FAILED"]),
      attemptCount: z.number().int().nonnegative(),
      sentAt: z.string().nullable(),
      errorCode: z.string().nullable(),
    }),
  ),
});
export type InvitationDraft = z.infer<typeof invitationDraftSchema>;
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
export type InvitationBatch = z.infer<typeof invitationBatchSchema>;
export type InvitationChannel = "EMAIL" | "SMS";
export type InvitationSendBody = {
  guestIds?: string[];
  groupId?: string;
  channels: InvitationChannel[];
  subject?: string;
  content?: string;
  smsContent?: string;
};

const base = (weddingId: string) =>
  `/weddings/${encodeURIComponent(weddingId)}/invitation-messages`;

export function getInvitationDraft(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`${base(weddingId)}/draft`, {
    signal,
    schema: invitationDraftSchema.nullable(),
  });
}
export function generateInvitationDraft(
  api: ApiClient,
  weddingId: string,
  input: { additionalInstructions?: string },
) {
  return api.request(`${base(weddingId)}/draft/generate`, {
    method: "POST",
    body: input,
    schema: invitationDraftSchema,
  });
}
export function saveInvitationDraft(
  api: ApiClient,
  weddingId: string,
  input: {
    subject: string;
    content: string;
    expectedVersion: number;
    smsContent: string;
  },
) {
  return api.request(`${base(weddingId)}/draft`, {
    method: "PUT",
    body: input,
    schema: invitationDraftSchema,
  });
}
export function previewInvitation(api: ApiClient, weddingId: string, guestId: string) {
  return api.request(`${base(weddingId)}/preview/${encodeURIComponent(guestId)}`, {
    method: "POST",
    schema: invitationPreviewSchema,
  });
}
export function sendTestInvitation(api: ApiClient, weddingId: string, guestId: string) {
  return api.request(`${base(weddingId)}/test-send/${encodeURIComponent(guestId)}`, {
    method: "POST",
    schema: z.unknown(),
  });
}
export function queueInvitationBatch(
  api: ApiClient,
  weddingId: string,
  input: InvitationSendBody,
  idempotencyKey: string,
) {
  return api.request(`${base(weddingId)}/send`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: input,
    schema: invitationBatchSchema,
  });
}
export function getInvitationBatch(
  api: ApiClient,
  weddingId: string,
  batchId: string,
  signal?: AbortSignal,
) {
  return api.request(`${base(weddingId)}/batches/${encodeURIComponent(batchId)}`, {
    signal,
    schema: invitationBatchSchema,
  });
}
export function retryInvitationBatch(api: ApiClient, weddingId: string, batchId: string) {
  return api.request(`${base(weddingId)}/batches/${encodeURIComponent(batchId)}/retry`, {
    method: "POST",
    schema: z.object({ retried: z.number().int().nonnegative() }),
  });
}
