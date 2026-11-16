import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";

export const seatLookupSchema = z.object({
  guestId: z.string(),
  recipientName: z.string(),
  honorific: z.string().nullable(),
  published: z.boolean(),
  rsvpCheckInPolicy: z.enum(["REQUIRED", "OPTIONAL"]),
  allowWalkIns: z.boolean(),
  seats: z.array(
    z.object({
      position: z.number().int().positive(),
      personName: z.string().nullable(),
      status: z.enum(["PENDING", "USED", "UNUSED"]),
      table: z.string().nullable(),
      seatNumber: z.number().int().nullable(),
      placeId: z.string(),
      participantId: z.string().nullable(),
      checkedInAt: z.string().nullable(),
      checkInKind: z.enum(["INVITED", "INVITED_COMPANION", "WALK_IN"]).nullable(),
      checkInMethod: z.enum(["NORMAL", "COUNTER_VERIFIED"]).nullable(),
      originalRsvpStatus: z.enum(["ATTENDING", "MAYBE", "DECLINED", "NOT_RESPONDED"]).nullable(),
    }),
  ),
});
export type SeatLookup = z.infer<typeof seatLookupSchema>;

const receptionSeatSchema = z.object({
  placeId: z.string(),
  position: z.number().int().positive(),
  participantId: z.string().nullable(),
  personName: z.string().nullable(),
  status: z.enum(["PENDING", "USED", "UNUSED"]),
  table: z.string().nullable(),
  seatNumber: z.number().int().nullable(),
  checkedInAt: z.string().nullable(),
  checkInKind: z.enum(["INVITED", "INVITED_COMPANION", "WALK_IN"]).nullable(),
  checkInMethod: z.enum(["NORMAL", "COUNTER_VERIFIED"]).nullable(),
  originalRsvpStatus: z.enum(["ATTENDING", "MAYBE", "DECLINED", "NOT_RESPONDED"]).nullable(),
});

export const receptionGuestSchema = z.object({
  guestId: z.string(),
  recipientName: z.string(),
  honorific: z.string().nullable(),
  side: z.string(),
  places: z.number().int().nonnegative(),
  checkedIn: z.number().int().nonnegative(),
  rsvpCheckInPolicy: z.enum(["REQUIRED", "OPTIONAL"]),
  allowWalkIns: z.boolean(),
  tables: z.array(z.string()),
  seats: z.array(receptionSeatSchema),
});
export type ReceptionGuest = z.infer<typeof receptionGuestSchema>;

const checkInPlaceResultSchema = z.object({
  placeId: z.string(),
  position: z.number().int().positive(),
  personName: z.string().nullable(),
  status: z.enum(["PENDING", "USED", "UNUSED"]),
  table: z.string().nullable(),
  seatNumber: z.number().int().nullable(),
  result: z.enum(["CHECKED_IN", "ALREADY_CHECKED_IN"]),
  checkedInAt: z.string(),
  kind: z.enum(["INVITED", "INVITED_COMPANION", "WALK_IN"]),
  checkInMethod: z.enum(["NORMAL", "COUNTER_VERIFIED"]).nullable(),
  originalRsvpStatus: z.enum(["ATTENDING", "MAYBE", "DECLINED", "NOT_RESPONDED"]).nullable(),
});
export const checkInResultSchema = z.object({
  guestId: z.string(),
  recipientName: z.string(),
  honorific: z.string().nullable(),
  places: z.array(checkInPlaceResultSchema),
});
export type CheckInResult = z.infer<typeof checkInResultSchema>;

export const walkInResultSchema = z.object({
  guestId: z.string(),
  recipientName: z.string(),
  honorific: z.string().nullable(),
  newGuest: z.boolean(),
  overCapacity: z.boolean(),
  places: z.array(checkInPlaceResultSchema),
});
export type WalkInResult = z.infer<typeof walkInResultSchema>;

export type WalkInInput = {
  guestId?: string | null;
  recipientName?: string | null;
  people: number;
  honorific?: string | null;
  side?: "BRIDE" | "GROOM" | "MUTUAL" | "UNSPECIFIED" | null;
  names?: string[] | null;
};

export function searchReceptionGuests(api: ApiClient, weddingId: string, query: string) {
  const params = new URLSearchParams({ q: query.trim() });
  return api.request(
    `/weddings/${encodeURIComponent(weddingId)}/guest-planning/reception/search?${params}`,
    { schema: z.array(receptionGuestSchema) },
  );
}

export function lookupGuestSeats(api: ApiClient, weddingId: string, code: string) {
  const query = new URLSearchParams({ code: code.trim() });
  return api.request(
    `/weddings/${encodeURIComponent(weddingId)}/guest-planning/seat-lookup?${query}`,
    { schema: seatLookupSchema },
  );
}

export function checkInGuestPlaces(
  api: ApiClient,
  weddingId: string,
  target: { code: string } | { guestId: string },
  placeIds: string[],
) {
  return api.request(`/weddings/${encodeURIComponent(weddingId)}/guest-planning/check-ins`, {
    method: "POST",
    body: {
      code: "code" in target ? target.code.trim() : null,
      guestId: "guestId" in target ? target.guestId : null,
      placeIds,
    },
    schema: checkInResultSchema,
  });
}

export function voidCheckInPlace(api: ApiClient, weddingId: string, placeId: string, reason: string) {
  return api.request(`/weddings/${encodeURIComponent(weddingId)}/guest-planning/check-ins/${encodeURIComponent(placeId)}/void`, {
    method: "POST",
    body: { reason },
    schema: z.object({
      guestId: z.string(),
      placeId: z.string(),
      voidedAt: z.string(),
      seats: z.array(receptionSeatSchema),
    }),
  });
}

export function addReceptionWalkIn(
  api: ApiClient,
  weddingId: string,
  input: WalkInInput,
  idempotencyKey: string,
) {
  return api.request(`/weddings/${encodeURIComponent(weddingId)}/guest-planning/walk-ins`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: input,
    schema: walkInResultSchema,
  });
}
