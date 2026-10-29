import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";

// Same limits as the backend SubmitRsvpValidator.
export const RSVP_MAX_PARTY_SIZE = 50;
export const RSVP_NOTE_MAX = 500;
export const RSVP_DIETARY_NOTE_MAX = 200;

const decisionSchema = z.enum(["ATTENDING", "MAYBE", "DECLINED"]);
const placeStatusSchema = z.enum(["PENDING", "USED", "UNUSED"]);
const requestStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "SUPERSEDED"]);

// partySize counts the recipient; it is required for ATTENDING / MAYBE and left out for DECLINED.
// The backend refuses unknown fields, so only these keys are ever sent.
const submitRsvpSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  decision: decisionSchema,
  partySize: z.number().int().min(1).max(RSVP_MAX_PARTY_SIZE).nullable().optional(),
  note: z.string().max(RSVP_NOTE_MAX).nullable().optional(),
  dietaryNote: z.string().max(RSVP_DIETARY_NOTE_MAX).nullable().optional(),
  source: z.string().nullable().optional(),
});

// The guest link determines the source. Strip it from public requests even if a caller supplies it.
export const guestRsvpInputSchema = submitRsvpSchema.omit({ source: true });

export const rsvpRequestSchema = z.object({
  id: z.string(),
  guestId: z.string(),
  recipientName: z.string(),
  reason: z.enum(["DEADLINE_PASSED", "LOCKED"]),
  status: requestStatusSchema,
  change: submitRsvpSchema,
  requestedAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export const rsvpSchema = z.object({
  guestId: z.string(),
  recipientName: z.string(),
  version: z.number().int().nonnegative(),
  rsvpId: z.string().nullable(),
  status: z.enum(["PENDING", "ATTENDING", "MAYBE", "DECLINED"]),
  partySize: z.number().int().nonnegative(),
  maxPeople: z.number().int().nonnegative(),
  overLimit: z.boolean(),
  thankYouMessage: z.string().nullable(),
  message: z.string().nullable(),
  note: z.string().nullable(),
  dietaryNote: z.string().nullable(),
  places: z.array(
    z.object({
      id: z.string(),
      position: z.number().int().positive(),
      status: placeStatusSchema,
      participantId: z.string().nullable(),
    }),
  ),
  participants: z.array(
    z.object({
      id: z.string(),
      fullName: z.string(),
      role: z.string(),
      attendanceStatus: z.string(),
    }),
  ),
  locked: z.boolean(),
  rsvpDeadline: z.string().nullable(),
  pendingRequest: rsvpRequestSchema.nullable(),
  submittedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export type GuestRsvpInput = z.infer<typeof guestRsvpInputSchema>;
export type Rsvp = z.infer<typeof rsvpSchema>;
export type RsvpDecision = z.infer<typeof decisionSchema>;
export type RsvpRequest = z.infer<typeof rsvpRequestSchema>;
export type RsvpWriteResponse = { rsvp: Rsvp; status: number; queued: boolean };

const path = (token: string) => `/rsvp/${encodeURIComponent(token)}`;

export function getMyRsvp(api: ApiClient, token: string, signal?: AbortSignal) {
  return api.request(path(token), { auth: "none", signal, schema: rsvpSchema });
}

async function writeMyRsvp(
  api: ApiClient,
  token: string,
  method: "POST" | "PUT",
  input: GuestRsvpInput,
): Promise<RsvpWriteResponse> {
  const response = await api.requestWithStatus(path(token), {
    method,
    auth: "none",
    body: guestRsvpInputSchema.parse(input),
    schema: rsvpSchema,
  });
  return { rsvp: response.data, status: response.status, queued: response.status === 202 };
}

export function createMyRsvp(api: ApiClient, token: string, input: GuestRsvpInput) {
  return writeMyRsvp(api, token, "POST", input);
}

export function replaceMyRsvp(api: ApiClient, token: string, input: GuestRsvpInput) {
  return writeMyRsvp(api, token, "PUT", input);
}
