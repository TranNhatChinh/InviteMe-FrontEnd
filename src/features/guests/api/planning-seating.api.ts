import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";
import { planningGuestSchema } from "./planning.api";

export const seatingPlanSchema = z.object({
  weddingId: z.string(),
  version: z.number().int(),
  tables: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      capacity: z.number().int(),
      groupId: z.string().nullable().optional(),
    }),
  ),
  guests: z.array(planningGuestSchema),
  places: z.array(
    z.object({
      id: z.string(),
      guestId: z.string(),
      position: z.number(),
      person: z
        .object({
          id: z.string(),
          fullName: z.string(),
          role: z.string(),
          attendanceStatus: z.string(),
        })
        .nullable(),
    }),
  ),
  assignments: z.array(
    z.object({ placeId: z.string(), tableId: z.string(), seatNumber: z.number().int() }),
  ),
});
export type SeatingPlan = z.infer<typeof seatingPlanSchema>;
export type SeatingStrategy = "AFFINITY" | "PARTY" | "COMPACT";
export type SuggestionMode = "UNASSIGNED" | "REPLACE_ALL";
export const seatingSuggestionSchema = z.object({
  strategy: z.enum(["AFFINITY", "PARTY", "COMPACT"]),
  mode: z.enum(["UNASSIGNED", "REPLACE_ALL"]),
  sourceVersion: z.number().int(),
  sourceFingerprint: z.string(),
  assignments: seatingPlanSchema.shape.assignments,
  unassigned: z.array(
    z.object({
      guestId: z.string(),
      placeIds: z.array(z.string()),
      code: z.string(),
      message: z.string(),
    }),
  ),
  excludedPlaceIds: z.array(z.string()),
  warnings: z.array(z.string()),
  reasons: z.array(
    z.object({
      tableId: z.string(),
      sides: z.array(z.string()),
      groups: z.array(z.string()),
      count: z.number(),
      message: z.string(),
    }),
  ),
  changedPlaceCount: z.number(),
  preservedCount: z.number(),
});
export type SeatingSuggestion = z.infer<typeof seatingSuggestionSchema>;
export type SeatingChange =
  | { action: "CREATE_TABLE"; name: string; capacity: number; groupId?: string | null }
  | { action: "CREATE_TABLES"; capacity: number; tableCount: number; groupId?: string | null }
  | { action: "UPDATE_TABLE"; tableId: string; name: string; capacity: number }
  | { action: "DELETE_TABLE"; tableId: string }
  | { action: "MOVE_PLACES"; placeIds: string[]; tableId: string | null; seatNumber?: number }
  | {
      action: "APPLY_SUGGESTION";
      strategy: SeatingStrategy;
      mode: SuggestionMode;
      sourceFingerprint: string;
      confirmReplace: boolean;
    };
export const seatingKey = (id: string) => ["planning-seating", id] as const;
export const seatingPublicationKey = (id: string) => ["seating-publication", id] as const;
export const seatingPublicationSchema = z.object({
  published: z.boolean(),
  publishedAt: z.string().nullable(),
  publishedBy: z.string().nullable(),
});
const path = (id: string) => `/weddings/${encodeURIComponent(id)}/guest-planning/seating-plan`;
const publicationPath = (id: string) => `${path(id)}/publication`;
export function getSeatingPublication(api: ApiClient, id: string, signal?: AbortSignal) {
  return api.request(publicationPath(id), { signal, schema: seatingPublicationSchema });
}
export function setSeatingPublication(api: ApiClient, id: string, published: boolean) {
  return api.request(`/weddings/${encodeURIComponent(id)}/guest-planning/seating-plan/publish`, {
    method: published ? "POST" : "DELETE",
    schema: seatingPublicationSchema,
  });
}
export function getSeatingPlan(api: ApiClient, id: string, signal?: AbortSignal) {
  return api.request(path(id), { signal, schema: seatingPlanSchema });
}
export function changeSeatingPlan(
  api: ApiClient,
  id: string,
  expectedVersion: number,
  change: SeatingChange,
  dragToken?: string,
) {
  return api.request(path(id), {
    method: "PATCH",
    body: { ...change, expectedVersion, ...(dragToken ? { dragToken } : {}) },
    schema: seatingPlanSchema,
  });
}
export function suggestSeatingPlan(
  api: ApiClient,
  id: string,
  strategy: SeatingStrategy,
  mode: SuggestionMode,
  signal?: AbortSignal,
) {
  return api.request(`/weddings/${encodeURIComponent(id)}/guest-planning/seating-suggestions`, {
    method: "POST",
    body: { strategy, mode },
    signal,
    schema: seatingSuggestionSchema,
  });
}
