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
  smsCopyWasShortened: z.boolean().optional(),
  smsCopyLimit: z.number().int().min(0).max(60).optional(),
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
  smsEncoding: z.enum(["GSM-7", "UCS-2"]).nullable().optional(),
  smsUnits: z.number().int().nonnegative().optional(),
  smsSegments: z.number().int().nonnegative().optional(),
  smsCopyWasShortened: z.boolean().optional(),
});
export const invitationSmsPreflightSchema = z.object({
  recipientCount: z.number().int().nonnegative(),
  recommendedCopyLimit: z.number().int().min(0).max(60),
  maximumSegments: z.number().int().nonnegative(),
  shortenedCount: z.number().int().nonnegative(),
  unsendableCount: z.number().int().nonnegative(),
  issues: z.array(z.object({ guestId: z.string(), recipientName: z.string(), code: z.string() })),
  additionalIssueCount: z.number().int().nonnegative(),
});
export const invitationBatchSchema = z.object({
  id: z.string(),
  status: z.enum([
    "PENDING",
    "ACCEPTED",
    "SENT",
    "DELIVERED",
    "FAILED",
    "PARTIAL_FAILED",
    "NEEDS_REVIEW",
    "SIMULATED",
    "COMPLETED",
  ]),
  totalCount: z.number().int().nonnegative(),
  sentCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative().optional(),
  deliveredCount: z.number().int().nonnegative().optional(),
  unknownCount: z.number().int().nonnegative().optional(),
  simulatedCount: z.number().int().nonnegative().optional(),
  createdAt: z.string(),
  jobs: z.array(
    z.object({
      id: z.string(),
      guestId: z.string(),
      channel: z.enum(["EMAIL", "SMS"]),
      recipient: z.string(),
      status: z.enum([
        "PENDING",
        "SENDING",
        "ACCEPTED",
        "SENT",
        "DELIVERED",
        "FAILED",
        "UNKNOWN",
        "REVIEW_REQUIRED",
        "SIMULATED",
      ]),
      attemptCount: z.number().int().nonnegative(),
      sentAt: z.string().nullable(),
      providerAcceptedAt: z.string().nullable().optional(),
      deliveredAt: z.string().nullable().optional(),
      errorCode: z.string().nullable(),
    }),
  ),
});
export type InvitationDraft = z.infer<typeof invitationDraftSchema>;
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
export type InvitationBatch = z.infer<typeof invitationBatchSchema>;
export type InvitationSmsPreflight = z.infer<typeof invitationSmsPreflightSchema>;
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
export function generateInvitationSmsDraft(
  api: ApiClient,
  weddingId: string,
  input: { expectedVersion: number; guestIds?: string[]; additionalInstructions?: string },
) {
  return api.request(`${base(weddingId)}/draft/generate-sms`, {
    method: "POST",
    body: input,
    schema: invitationDraftSchema,
  });
}
export function preflightInvitationSms(
  api: ApiClient,
  weddingId: string,
  guestIds: string[],
  signal?: AbortSignal,
) {
  return api.request(`${base(weddingId)}/sms-preflight`, {
    method: "POST",
    body: { guestIds },
    signal,
    schema: invitationSmsPreflightSchema,
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
    body: input.groupId ? { ...input, groupId: undefined, group: input.groupId } : input,
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
