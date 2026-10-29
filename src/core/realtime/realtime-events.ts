import { z } from "zod";

// Legacy named events plus the backend's minimal weddingChanged invalidations.
export const REALTIME_EVENTS = {
  rsvp: "RsvpUpdated",
  capacity: "CapacityUpdated",
  waitlist: "WaitlistUpdated",
  seating: "SeatingUpdated",
  table: "TableCapacityUpdated",
  checkIn: "CheckInUpdated",
} as const;
export type RealtimeEvent = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];
export const weddingEventSchema = z.object({
  weddingId: z.string(),
  version: z.number().int().nonnegative(),
});
export type WeddingEvent = z.infer<typeof weddingEventSchema>;
export const planningChangeSchema = z.object({
  type: z.enum([
    "PlanningSeatingChanged",
    "PlanningGuestsImported",
    "PlanningGuestCreated",
    "PlanningGuestArchived",
    "PlanningGuestUpdated",
    "PlanningGuestRestored",
    "PlanningSeatingNeedsAttention",
    "PlanningSeatingPublished",
    "PlanningSeatingUnpublished",
    "GuestCheckedIn",
    "GuestCheckInVoided",
    "PlanningWalkInAdded",
    "RsvpChanged",
    "RsvpChangeRequested",
    "RsvpOverLimit",
    "GiftChanged",
    "GiftReceived",
    "RsvpLocksChanged",
    "RsvpSettingsChanged",
    "WeddingWebsiteChanged",
    "WeddingSetupChanged",
    "WeddingWebsitePublished",
    "WeddingWebsiteUnpublished",
    "InvitationDesignChanged",
    "InvitationDesignPublished",
    "InvitationWordingChanged",
  ]),
  entityId: z.string(),
  version: z.number().int().nonnegative().nullable().optional(),
});
export type PlanningChange = z.infer<typeof planningChangeSchema>;
