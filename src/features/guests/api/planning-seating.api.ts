import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";
import { planningGuestSchema } from "./planning.api";
import { groupKind } from "@/shared/lib/planning-groups";

export const seatingPlanSchema = z.object({
  weddingId: z.string(),
  version: z.number().int(),
  brideTablesPerRow: z.number().int().min(1).max(4).optional(),
  groomTablesPerRow: z.number().int().min(1).max(4).optional(),
  tables: z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        capacity: z.number().int(),
        group: groupKind.nullable().optional(),
        side: z.enum(["BRIDE", "GROOM"]).nullable().optional(),
        row: z.number().int().positive().nullable().optional(),
        column: z.number().int().positive().nullable().optional(),
      })
      .transform(({ group, ...table }) => ({ ...table, ...(group ? { groupId: group } : {}) })),
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
export type SeatingChange =
  | {
      action: "CREATE_TABLE";
      name: string;
      capacity: number;
      groupId?: string | null;
      side?: SeatingSide;
      row?: number;
      column?: number;
    }
  | {
      action: "CREATE_TABLES";
      capacity: number;
      tableCount: number;
      groupId?: string | null;
      side?: SeatingSide;
      row?: number;
      column?: number;
    }
  | {
      action: "UPDATE_TABLE";
      tableId: string;
      name: string;
      capacity: number;
      side?: SeatingSide;
      row?: number;
      column?: number;
    }
  | { action: "MOVE_TABLE_SLOT"; tableId: string; targetRow: number; targetColumn: number }
  | { action: "UPDATE_LAYOUT"; brideTablesPerRow: number; groomTablesPerRow: number }
  | { action: "DELETE_TABLE"; tableId: string }
  | { action: "MOVE_PLACES"; placeIds: string[]; tableId: string | null; seatNumber?: number };

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
    body: {
      ...change,
      ...("groupId" in change ? { group: change.groupId ?? "OTHER", groupId: undefined } : {}),
      expectedVersion,
      ...(dragToken ? { dragToken } : {}),
    },
    schema: seatingPlanSchema,
  });
}

export const seatingCapacities = [8, 10, 12] as const;
export type SeatingCapacity = (typeof seatingCapacities)[number];
export type SeatingSide = "BRIDE" | "GROOM";
export type SeatingGenerationConfig = {
  expectedVersion: number;
  tableCapacity: SeatingCapacity;
  tablesPerRow: { bride: number; groom: number };
};
export const seatingGenerationSchema = z.object({
  sourceVersion: z.number().int(),
  sourceFingerprint: z.string(),
  algorithmVersion: z.string(),
  optimizationStatus: z.enum(["PROVEN_OPTIMAL", "FEASIBLE_NOT_PROVEN"]),
  summary: z.object({
    guests: z.number(),
    places: z.number(),
    tables: z.number(),
    emptySeats: z.number(),
  }),
  tables: z.array(
    z.object({
      code: z.string(),
      side: z.enum(["BRIDE", "GROOM"]),
      row: z.number().int(),
      column: z.number().int(),
      capacity: z.number().int(),
      group: groupKind.nullable(),
      guestIds: z.array(z.string()),
    }),
  ),
  assignments: z.array(
    z.object({ placeId: z.string(), tableCode: z.string(), seatNumber: z.number().int() }),
  ),
  warnings: z.array(z.string()),
});
export type SeatingGenerationPreview = z.infer<typeof seatingGenerationSchema>;
export type SeatingGenerationApply = SeatingGenerationConfig & {
  sourceFingerprint: string;
  algorithmVersion: string;
};
export function generateSeatingPreview(
  api: ApiClient,
  id: string,
  config: SeatingGenerationConfig,
  signal?: AbortSignal,
) {
  return api.request(`${path(id)}/generate-preview`, {
    method: "POST",
    body: config,
    signal,
    schema: seatingGenerationSchema,
  });
}
export function applySeatingGeneration(api: ApiClient, id: string, input: SeatingGenerationApply) {
  return api.request(`${path(id)}/generate-apply`, {
    method: "POST",
    body: input,
    schema: seatingPlanSchema,
  });
}

export type ArrangeSeatingInput = {
  expectedVersion: number;
  sourceFingerprint?: string;
  algorithmVersion?: string;
};
export const seatingArrangementSchema = z.object({
  sourceVersion: z.number().int(),
  sourceFingerprint: z.string(),
  algorithmVersion: z.string(),
  assignments: seatingPlanSchema.shape.assignments,
  newlyAssignedCount: z.number().int(),
  preservedCount: z.number().int(),
  unassigned: z.array(
    z.object({ guestId: z.string(), placeIds: z.array(z.string()), code: z.string() }),
  ),
  warnings: z.array(z.string()),
});
export type SeatingArrangementPreview = z.infer<typeof seatingArrangementSchema>;
export function previewSeatingArrangement(
  api: ApiClient,
  id: string,
  input: ArrangeSeatingInput,
  signal?: AbortSignal,
) {
  return api.request(`${path(id)}/arrange-preview`, {
    method: "POST",
    body: input,
    signal,
    schema: seatingArrangementSchema,
  });
}
export function applySeatingArrangement(api: ApiClient, id: string, input: ArrangeSeatingInput) {
  return api.request(`${path(id)}/arrange-apply`, {
    method: "POST",
    body: input,
    schema: seatingPlanSchema,
  });
}
