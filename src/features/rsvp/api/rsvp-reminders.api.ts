import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";

const count = z.number().int().nonnegative();
const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), page: count, pageSize: count, totalCount: count });

export const rsvpReminderSummarySchema = z.object({
  weddingId: z.string(),
  autoEnabled: z.boolean(),
  rsvpDeadline: z.string().nullable(),
  timezone: z.string(),
  notResponded: count,
  canRemindNow: count,
  autoRounds: z.array(
    z.object({
      kind: z.enum(["AUTO_3D", "AUTO_1D"]),
      at: z.string().nullable(),
      state: z.enum(["UPCOMING", "STARTED", "OFF"]),
    }),
  ),
  counts: z.object({ pending: count, sent: count, failed: count, cancelled: count }),
  maxRemindersPerGuest: count,
  sendingHours: z.string(),
  emailConfigured: z.boolean(),
  maybe: count.optional(),
});

export const rsvpReminderCandidateSchema = z.object({
  guestId: z.string(),
  recipientName: z.string(),
  email: z.string(),
  remindersSent: count,
});

export const rsvpReminderSkippedSchema = z.object({
  guestId: z.string(),
  recipientName: z.string(),
  reason: z.string(),
});

export const rsvpReminderPreviewSchema = z.object({
  sendAt: z.string(),
  eligible: z.array(rsvpReminderCandidateSchema),
  skipped: z.array(rsvpReminderSkippedSchema),
});

export const rsvpReminderSendResultSchema = z.object({
  queued: count,
  sendAt: z.string(),
  queuedGuests: z.array(rsvpReminderCandidateSchema),
  skipped: z.array(rsvpReminderSkippedSchema),
});

export const rsvpReminderRetryResultSchema = z.object({
  reminderId: z.string(),
  status: z.literal("PENDING"),
  sendAt: z.string(),
});

export const rsvpReminderHistoryRowSchema = z.object({
  id: z.string(),
  guestId: z.string(),
  recipientName: z.string(),
  kind: z.enum(["AUTO_3D", "AUTO_1D", "MANUAL"]),
  channel: z.string(),
  recipient: z.string().nullable(),
  status: z.enum(["PENDING", "SENDING", "SENT", "FAILED", "CANCELLED"]),
  attemptCount: count,
  nextAttemptAt: z.string(),
  sentAt: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  requestedBy: z.string().nullable(),
  createdAt: z.string(),
});

export type RsvpReminderSummary = z.infer<typeof rsvpReminderSummarySchema>;
export type RsvpReminderCandidate = z.infer<typeof rsvpReminderCandidateSchema>;
export type RsvpReminderPreview = z.infer<typeof rsvpReminderPreviewSchema>;
export type RsvpReminderSendResult = z.infer<typeof rsvpReminderSendResultSchema>;
export type RsvpReminderRetryResult = z.infer<typeof rsvpReminderRetryResultSchema>;
export type RsvpReminderHistoryRow = z.infer<typeof rsvpReminderHistoryRowSchema>;
export type RsvpReminderKind = "AUTO_3D" | "AUTO_1D" | "MANUAL";
export type RsvpReminderStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";

const base = (weddingId: string) => `/weddings/${encodeURIComponent(weddingId)}/rsvps/reminders`;
const query = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.size ? `?${params}` : "";
};

export const rsvpReminderKeys = {
  all: (weddingId: string) => ["rsvp-reminders", weddingId] as const,
  summary: (weddingId: string) => ["rsvp-reminders", weddingId, "summary"] as const,
  history: (
    weddingId: string,
    filters: { status?: string; kind?: string; guestId?: string; page?: number },
  ) => ["rsvp-reminders", weddingId, "history", filters] as const,
};

export function getRsvpReminderSummary(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`${base(weddingId)}/summary`, { signal, schema: rsvpReminderSummarySchema });
}

export function saveRsvpReminderSettings(api: ApiClient, weddingId: string, autoEnabled: boolean) {
  return api.request(`${base(weddingId)}/settings`, {
    method: "PUT",
    body: { autoEnabled },
    schema: rsvpReminderSummarySchema,
  });
}

export function previewRsvpReminders(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`${base(weddingId)}/preview`, { signal, schema: rsvpReminderPreviewSchema });
}

export function sendRsvpReminders(api: ApiClient, weddingId: string, guestIds: string[]) {
  return api.request(`${base(weddingId)}/send`, {
    method: "POST",
    body: { guestIds },
    schema: rsvpReminderSendResultSchema,
  });
}

export function retryRsvpReminder(api: ApiClient, weddingId: string, reminderId: string) {
  return api.request(`${base(weddingId)}/${encodeURIComponent(reminderId)}/retry`, {
    method: "POST",
    schema: rsvpReminderRetryResultSchema,
  });
}

export function listRsvpReminders(
  api: ApiClient,
  weddingId: string,
  filters: { status?: string; kind?: string; guestId?: string; page?: number; pageSize?: number },
  signal?: AbortSignal,
) {
  return api.request(`${base(weddingId)}${query(filters)}`, {
    signal,
    schema: page(rsvpReminderHistoryRowSchema),
  });
}
