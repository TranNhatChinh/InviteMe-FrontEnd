import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";

export const checkInSummarySchema = z.object({
  expectedPlaces: z.number(),
  checkedIn: z.number(),
  checkedInConfirmed: z.number(),
  checkedInWithoutRsvp: z.number(),
  checkedInExceptions: z.number(),
  checkedInWalkIns: z.number(),
  checkedInCounterVerified: z.number(),
  checkedInInvitedCompanions: z.number(),
  checkedInUnassigned: z.number(),
  bySide: z.array(
    z.object({
      side: z.string(),
      expectedPlaces: z.number(),
      checkedIn: z.number(),
    }),
  ),
});

export type CheckInSummary = z.infer<typeof checkInSummarySchema>;

export function getCheckInSummary(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(
    `/weddings/${encodeURIComponent(weddingId)}/guest-planning/check-ins/summary`,
    { signal, schema: checkInSummarySchema },
  );
}
