import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";
import { guestRsvpInputSchema, rsvpRequestSchema, rsvpSchema } from "./rsvp.api";

const count = z.number().int().nonnegative();
const sideSchema = z.enum(["BRIDE", "GROOM", "MUTUAL", "UNSPECIFIED"]);
// List filter. NEEDS_ACTION is not an answer: over-limit answers and change requests waiting for the couple.
export const rsvpListStatusSchema = z.enum([
  "NOT_RESPONDED",
  "ATTENDING",
  "MAYBE",
  "DECLINED",
  "NEEDS_ACTION",
]);
const rsvpAnswerSchema = z.enum(["NOT_RESPONDED", "ATTENDING", "MAYBE", "DECLINED"]);
const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: count,
    pageSize: count,
    totalCount: count,
  });

export const rsvpSettingsSchema = z.object({
  weddingId: z.string(),
  plusOneLimit: count,
  version: count,
  rsvpDeadline: z.string().nullable(),
});
export const rsvpDashboardSchema = z.object({
  weddingId: z.string(),
  generatedAt: z.string(),
  rsvpDeadline: z.string().nullable(),
  // Wedding-wide. Expected = ATTENDING people + walk-ins; the capacity only warns, nothing is refused.
  capacity: z.object({
    max: count.nullable(),
    expected: count,
    remaining: count.nullable(),
    overCapacity: z.boolean(),
    overBy: count,
    maybeMayExceed: z.boolean(),
  }),
  invitations: z.object({
    invited: count,
    attending: count,
    maybe: count,
    declined: count,
    notResponded: count,
    responseRate: z.number().nonnegative(),
  }),
  needsAction: z.object({ invitations: count, overLimit: count, changeRequests: count }),
  people: z.object({ expected: count, companions: count, maybe: count }),
  lockedGuests: count,
  notes: z.object({
    invitationsWithDietaryNote: count,
    invitationsWithNote: count,
    topDietaryNotes: z.array(z.object({ note: z.string(), count })),
  }),
  bySide: z.array(
    z.object({ side: sideSchema, invited: count, responded: count, expected: count }),
  ),
});
export const rsvpGuestRowSchema = z.object({
  guestId: z.string(),
  recipientName: z.string(),
  side: sideSchema,
  groupId: z.string().nullable(),
  groupName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  rsvpStatus: rsvpAnswerSchema,
  maxPeople: count,
  people: count,
  maybePeople: count,
  overLimit: z.boolean(),
  needsAction: z.boolean(),
  pendingRequest: z.boolean(),
  locked: z.boolean(),
  dietaryNote: z.string().nullable(),
  note: z.string().nullable(),
  respondedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  remindersSent: count,
  lastRemindedAt: z.string().nullable(),
  lastReminderStatus: z.string().nullable(),
});

export type RsvpDashboard = z.infer<typeof rsvpDashboardSchema>;
export type RsvpGuestRow = z.infer<typeof rsvpGuestRowSchema>;
export type RsvpListStatus = z.infer<typeof rsvpListStatusSchema>;
export type RsvpSettings = z.infer<typeof rsvpSettingsSchema>;
export type RsvpGuestFilters = {
  side?: string;
  groupId?: string;
  status?: RsvpListStatus;
  search?: string;
  page?: number;
  pageSize?: number;
};

const base = (weddingId: string) => `/weddings/${encodeURIComponent(weddingId)}`;
const rsvps = (weddingId: string) => `${base(weddingId)}/rsvps`;
const params = (values: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") query.set(key, String(value));
  return query.size ? `?${query}` : "";
};
export const hostRsvpKeys = {
  all: (weddingId: string) => ["host-rsvp", weddingId] as const,
  dashboard: (weddingId: string, side?: string, groupId?: string) =>
    ["host-rsvp", weddingId, "dashboard", side, groupId] as const,
  guests: (weddingId: string, filters: RsvpGuestFilters) =>
    ["host-rsvp", weddingId, "guests", filters] as const,
  detail: (weddingId: string, guestId: string) =>
    ["host-rsvp", weddingId, "detail", guestId] as const,
  settings: (weddingId: string) => ["host-rsvp", weddingId, "settings"] as const,
  requests: (weddingId: string, status: string, pageNumber: number) =>
    ["host-rsvp", weddingId, "requests", status, pageNumber] as const,
};

export function getRsvpDashboard(
  api: ApiClient,
  weddingId: string,
  side?: string,
  groupId?: string,
  signal?: AbortSignal,
) {
  return api.request(`${rsvps(weddingId)}/dashboard${params({ side, groupId })}`, {
    signal,
    schema: rsvpDashboardSchema,
  });
}
export function listRsvpGuests(
  api: ApiClient,
  weddingId: string,
  filters: RsvpGuestFilters,
  signal?: AbortSignal,
) {
  return api.request(`${rsvps(weddingId)}/dashboard/guests${params(filters)}`, {
    signal,
    schema: page(rsvpGuestRowSchema),
  });
}
export function exportRsvpGuests(
  api: ApiClient,
  weddingId: string,
  filters: Omit<RsvpGuestFilters, "page" | "pageSize">,
) {
  return api.download(`${rsvps(weddingId)}/dashboard/export${params(filters)}`);
}
export function getHostRsvp(
  api: ApiClient,
  weddingId: string,
  guestId: string,
  signal?: AbortSignal,
) {
  return api.request(`${rsvps(weddingId)}/${encodeURIComponent(guestId)}`, {
    signal,
    schema: rsvpSchema,
  });
}
export function saveHostRsvp(
  api: ApiClient,
  weddingId: string,
  guestId: string,
  input: z.infer<typeof guestRsvpInputSchema> & {
    source: "PHONE" | "CHAT" | "IN_PERSON" | "OTHER";
  },
) {
  return api.request(`${rsvps(weddingId)}/${encodeURIComponent(guestId)}`, {
    method: "PUT",
    body: input,
    schema: rsvpSchema,
  });
}
export function getRsvpSettings(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`${base(weddingId)}/rsvp-settings`, { signal, schema: rsvpSettingsSchema });
}
export function saveRsvpSettings(
  api: ApiClient,
  weddingId: string,
  expectedVersion: number,
  plusOneLimit: number,
) {
  return api.request(`${base(weddingId)}/rsvp-settings`, {
    method: "PUT",
    body: { expectedVersion, plusOneLimit },
    schema: rsvpSettingsSchema,
  });
}
export function lockRsvps(
  api: ApiClient,
  weddingId: string,
  locked: boolean,
  guestIds?: string[],
  groupId?: string,
) {
  return api.request(`${rsvps(weddingId)}/locks`, {
    method: "PUT",
    body: { locked, guestIds, groupId },
    schema: z.object({ affected: count, locked: z.boolean() }),
  });
}
export function listRsvpRequests(
  api: ApiClient,
  weddingId: string,
  status = "PENDING",
  pageNumber = 1,
  signal?: AbortSignal,
) {
  return api.request(
    `${rsvps(weddingId)}/requests${params({ status, page: pageNumber, pageSize: 25 })}`,
    { signal, schema: page(rsvpRequestSchema) },
  );
}
export function resolveRsvpRequest(
  api: ApiClient,
  weddingId: string,
  requestId: string,
  decision: "approve" | "reject",
) {
  return api.request(`${rsvps(weddingId)}/requests/${encodeURIComponent(requestId)}/${decision}`, {
    method: "POST",
    schema: rsvpSchema,
  });
}
// "Đã xem": the couple accepts the number of an answer over the invitation's threshold.
export function acknowledgeRsvpOverLimit(api: ApiClient, weddingId: string, guestId: string) {
  return api.request(`${rsvps(weddingId)}/${encodeURIComponent(guestId)}/acknowledge`, {
    method: "POST",
    schema: rsvpSchema,
  });
}
