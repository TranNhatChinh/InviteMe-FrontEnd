import { z } from "zod";
import type { ApiClient } from "@/core/api/api-client";
import { planningGuestSchema } from "./planning.api";

export const seatingLayoutSchema = z.object({
  groomRows: z.number().int().min(1).max(20),
  groomColumns: z.number().int().min(1).max(6),
  brideRows: z.number().int().min(1).max(20),
  brideColumns: z.number().int().min(1).max(6),
  numbering: z.enum(["BY_ROW", "ODD_EVEN"]).default("BY_ROW"),
  version: z.number().int(),
  isLocked: z.boolean().default(false),
  lockedAt: z.string().nullable().optional(),
  lockedBy: z.string().nullable().optional(),
  isEventStarted: z.boolean().default(false),
  eventStartedAt: z.string().nullable().optional(),
  eventStartedBy: z.string().nullable().optional(),
});
export type SeatingLayout = z.infer<typeof seatingLayoutSchema>;

export const planningTableSchema = z.object({
  id: z.string(),
  name: z.string(),
  capacity: z.number().int(),
  groupId: z.string().nullable().optional(),
  number: z.number().int().optional(),
  side: z.enum(["GROOM", "BRIDE", "MUTUAL", "TRAY"]).nullable().optional(),
  half: z.enum(["GROOM", "BRIDE"]).nullable().optional(),
  row: z.number().int().nullable().optional(),
  column: z.number().int().nullable().optional(),
  isVip: z.boolean().optional(),
  extraSeats: z.number().int().optional(),
});
export type PlanningTable = z.infer<typeof planningTableSchema>;

export const seatingWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  tableId: z.string().nullable().optional(),
  guestId: z.string().nullable().optional(),
  placeId: z.string().nullable().optional(),
});
export type SeatingWarning = z.infer<typeof seatingWarningSchema>;

export const planningAssignmentSchema = z.object({
  placeId: z.string(),
  tableId: z.string(),
  seatNumber: z.number().int(),
  plannedTableId: z.string().nullable().optional(),
  plannedSeatNumber: z.number().int().nullable().optional(),
});
export type PlanningAssignment = z.infer<typeof planningAssignmentSchema>;

export const planningSeatingPlaceSchema = z.object({
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
});
export type PlanningSeatingPlace = z.infer<typeof planningSeatingPlaceSchema>;

export const seatingPlanSchema = z.object({
  weddingId: z.string(),
  version: z.number().int(),
  tables: z.array(planningTableSchema),
  guests: z.array(planningGuestSchema),
  places: z.array(planningSeatingPlaceSchema),
  assignments: z.array(planningAssignmentSchema),
  layout: seatingLayoutSchema.nullable().optional(),
  warnings: z.array(seatingWarningSchema).nullable().optional(),
  isLocked: z.boolean().optional(),
  lockedAt: z.string().nullable().optional(),
  lockedBy: z.string().nullable().optional(),
  isEventStarted: z.boolean().optional(),
  eventStartedAt: z.string().nullable().optional(),
  eventStartedBy: z.string().nullable().optional(),
});
export type SeatingPlan = z.infer<typeof seatingPlanSchema>;

export type SeatingStrategy =
  "KEEP_GROUPS" | "FEWEST_TABLES" | "SIMPLE" | "AFFINITY" | "PARTY" | "COMPACT";
export type SuggestionMode = "UNASSIGNED" | "REPLACE_ALL";

export const unassignedPlanningGroupSchema = z.object({
  guestId: z.string(),
  placeIds: z.array(z.string()),
  code: z.string(),
  message: z.string(),
});
export type UnassignedPlanningGroup = z.infer<typeof unassignedPlanningGroupSchema>;

export const planningTableReasonSchema = z.object({
  tableId: z.string(),
  sides: z.array(z.string()),
  groups: z.array(z.string()),
  count: z.number(),
  message: z.string(),
});
export type PlanningTableReason = z.infer<typeof planningTableReasonSchema>;

export const suggestedAdditionalTableSchema = z.object({
  side: z.string(),
  groupName: z.string().nullable().optional(),
  neededTables: z.number(),
  recommendedCapacity: z.number(),
  reasonCode: z.string(),
  message: z.string(),
});
export type SuggestedAdditionalTable = z.infer<typeof suggestedAdditionalTableSchema>;

export const seatingScoreBreakdownSchema = z.object({
  totalScore: z.number(),
  seatedPlacesCount: z.number(),
  sameGroupMatchesCount: z.number(),
  eldersInVipCount: z.number(),
  usedTablesCount: z.number(),
  mixedGroupTablesCount: z.number(),
  splitPartiesCount: z.number(),
  /** Tables seating both families; allowed, only lightly penalised. */
  mixedSideTablesCount: z.number().optional(),
});
export type SeatingScoreBreakdown = z.infer<typeof seatingScoreBreakdownSchema>;

export const suggestedTablePlacementSchema = z.object({
  tableId: z.string(),
  half: z.enum(["GROOM", "BRIDE"]),
  row: z.number().int(),
  column: z.number().int(),
});
export type SuggestedTablePlacement = z.infer<typeof suggestedTablePlacementSchema>;

export const strategySuggestionDtoSchema = z.object({
  strategy: z.string(),
  strategyName: z.string(),
  score: z.number(),
  scoreBreakdown: seatingScoreBreakdownSchema.optional(),
  assignments: z.array(planningAssignmentSchema),
  unassigned: z.array(unassignedPlanningGroupSchema),
  suggestedAdditionalTables: z.array(suggestedAdditionalTableSchema).optional(),
  warnings: z.array(z.string()),
  reasons: z.array(planningTableReasonSchema),
  changedPlaceCount: z.number(),
  preservedCount: z.number(),
  usedTableCount: z.number(),
  tablePlacements: z.array(suggestedTablePlacementSchema).nullable().optional(),
});
export type StrategySuggestionDto = z.infer<typeof strategySuggestionDtoSchema>;

export const seatingSuggestionSchema = z.object({
  strategy: z.string(),
  mode: z.enum(["UNASSIGNED", "REPLACE_ALL"]),
  sourceVersion: z.number().int(),
  sourceFingerprint: z.string(),
  assignments: z.array(planningAssignmentSchema),
  unassigned: z.array(unassignedPlanningGroupSchema),
  excludedPlaceIds: z.array(z.string()),
  warnings: z.array(z.string()),
  reasons: z.array(planningTableReasonSchema),
  changedPlaceCount: z.number(),
  preservedCount: z.number(),
  score: z.number().optional(),
  scoreBreakdown: seatingScoreBreakdownSchema.optional(),
  suggestedAdditionalTables: z.array(suggestedAdditionalTableSchema).optional(),
  keepGroups: strategySuggestionDtoSchema.optional(),
  fewestTables: strategySuggestionDtoSchema.optional(),
  simple: strategySuggestionDtoSchema.optional(),
  tablePlacements: z.array(suggestedTablePlacementSchema).nullable().optional(),
});
export type SeatingSuggestion = z.infer<typeof seatingSuggestionSchema>;

export const seatingAuditLogSchema = z.object({
  id: z.string(),
  weddingId: z.string().nullable().optional(),
  action: z.string(),
  actorUserId: z.string().nullable().optional(),
  createdAt: z.string(),
  metadata: z.string().nullable().optional(),
});
export type SeatingAuditLog = z.infer<typeof seatingAuditLogSchema>;

export const unattendedGuestSchema = z.object({
  placeId: z.string(),
  guestId: z.string(),
  guestName: z.string(),
  participantName: z.string().nullable().optional(),
  seatNumber: z.number(),
  side: z.string().nullable().optional(),
  groupName: z.string().nullable().optional(),
});
export type UnattendedGuest = z.infer<typeof unattendedGuestSchema>;

export const seatingSummaryTableSchema = z.object({
  id: z.string(),
  name: z.string(),
  number: z.number(),
  side: z.string().nullable().optional(),
  half: z.string().nullable().optional(),
  row: z.number().nullable().optional(),
  column: z.number().nullable().optional(),
  isVip: z.boolean(),
  capacity: z.number(),
  extraSeats: z.number(),
  seatedCount: z.number(),
  checkedInCount: z.number(),
});

export const seatingSummarySchema = z.object({
  weddingId: z.string(),
  layout: seatingLayoutSchema,
  totalTables: z.number(),
  placedTables: z.number(),
  totalCapacity: z.number(),
  totalSeated: z.number(),
  totalCheckedIn: z.number(),
  tables: z.array(seatingSummaryTableSchema),
});
export type SeatingSummary = z.infer<typeof seatingSummarySchema>;

export type SeatingChange =
  | {
      action: "CREATE_TABLE";
      number?: number;
      name?: string;
      capacity: number;
      groupId?: string | null;
      side?: "GROOM" | "BRIDE" | "MUTUAL" | null;
      half?: "GROOM" | "BRIDE" | null;
      row?: number | null;
      column?: number | null;
      isVip?: boolean;
    }
  | {
      action: "CREATE_TABLES";
      capacity: number;
      tableCount: number;
      groupId?: string | null;
      side?: "GROOM" | "BRIDE" | "MUTUAL" | null;
    }
  | {
      action: "UPDATE_TABLE";
      tableId: string;
      /** Manual table number, 1–999; a taken number is rejected with 409 TABLE_NUMBER_TAKEN. */
      number?: number;
      name?: string;
      capacity?: number;
      isVip?: boolean;
      extraSeats?: number;
      groupId?: string | null;
    }
  | { action: "DELETE_TABLE"; tableId: string; confirmDeleteWithGuests?: boolean }
  | {
      action: "PLACE_TABLE";
      tableId: string;
      side: "GROOM" | "BRIDE" | "MUTUAL";
      half?: "GROOM" | "BRIDE" | null;
      row: number;
      column: number;
    }
  | {
      action: "MOVE_TABLE";
      tableId: string;
      side?: "GROOM" | "BRIDE" | "MUTUAL" | "TRAY" | null;
      half?: "GROOM" | "BRIDE" | null;
      row?: number | null;
      column?: number | null;
    }
  | { action: "SWAP_TABLES"; tableId: string; targetTableId: string }
  | {
      action: "TAG_TABLES";
      tableIds: string[];
      side?: "GROOM" | "BRIDE" | "MUTUAL" | null;
      isVip?: boolean | null;
      groupId?: string | null;
    }
  | { action: "RENUMBER_TABLES" }
  | { action: "MOVE_PLACES"; placeIds: string[]; tableId: string | null; seatNumber?: number }
  | {
      action: "MOVE_PARTY";
      guestId?: string;
      placeIds?: string[];
      tableId: string | null;
      seatNumber?: number;
    }
  | {
      action: "SWAP_PLACES";
      placeId?: string;
      targetPlaceId?: string;
      placeIds?: string[];
    }
  | {
      action: "APPLY_SUGGESTION";
      strategy?: SeatingStrategy;
      plan?: string;
      mode: SuggestionMode;
      sourceFingerprint: string;
      confirmReplace: boolean;
    }
  | { action: "AUTO_PLACE_TABLES" }
  | { action: "LOCK_PLAN" }
  | { action: "UNLOCK_PLAN" }
  | { action: "START_EVENT" }
  | {
      action: "OPERATIONAL_MOVE";
      placeId?: string;
      placeIds?: string[];
      tableId?: string | null;
      seatNumber?: number;
      extraSeats?: number;
      reason?: string;
    }
  | {
      action: "SWAP_UNATTENDED";
      placeId: string;
      tableId: string;
      targetPlaceId: string;
    }
  | { action: "RELEASE_DECLINED_SEATS" };

export const seatingKey = (id: string) => ["planning-seating", id] as const;
export const seatingLayoutKey = (id: string) => ["planning-seating-layout", id] as const;
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

export function getSeatingLayout(api: ApiClient, id: string, signal?: AbortSignal) {
  return api.request(`/weddings/${encodeURIComponent(id)}/seating-layout`, {
    signal,
    schema: seatingLayoutSchema,
  });
}

export function updateSeatingLayout(
  api: ApiClient,
  id: string,
  input: {
    groomRows: number;
    groomColumns: number;
    brideRows: number;
    brideColumns: number;
    numbering: "BY_ROW" | "ODD_EVEN";
    expectedVersion: number;
  },
) {
  return api.request(`/weddings/${encodeURIComponent(id)}/seating-layout`, {
    method: "PUT",
    body: input,
    schema: seatingLayoutSchema,
  });
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
  placeTables = false,
) {
  return api.request(`/weddings/${encodeURIComponent(id)}/guest-planning/seating-suggestions`, {
    method: "POST",
    body: { strategy, mode, plan: strategy, placeTables },
    signal,
    schema: seatingSuggestionSchema,
  });
}

export function applySeatingSuggestion(
  api: ApiClient,
  id: string,
  input: {
    expectedVersion: number;
    strategy: SeatingStrategy;
    mode: SuggestionMode;
    sourceFingerprint: string;
    confirmReplace?: boolean;
    plan?: string;
    /** Also put tray tables on free hall cells; must match the preview the fingerprint came from. */
    placeTables?: boolean;
  },
) {
  return api.request(
    `/weddings/${encodeURIComponent(id)}/guest-planning/seating-suggestions/apply`,
    {
      method: "POST",
      body: { ...input, plan: input.strategy },
      schema: seatingPlanSchema,
    },
  );
}

export function autoPlaceTables(api: ApiClient, id: string, expectedVersion: number) {
  return changeSeatingPlan(api, id, expectedVersion, { action: "AUTO_PLACE_TABLES" });
}

export function getUnattendedGuests(
  api: ApiClient,
  weddingId: string,
  tableId: string,
  signal?: AbortSignal,
) {
  return api.request(
    `/weddings/${encodeURIComponent(weddingId)}/guest-planning/seating/tables/${encodeURIComponent(tableId)}/unattended-guests`,
    {
      signal,
      schema: z.array(unattendedGuestSchema),
    },
  );
}

export function getSeatingAuditLogs(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(
    `/weddings/${encodeURIComponent(weddingId)}/guest-planning/seating/audit-logs`,
    {
      signal,
      schema: z.array(seatingAuditLogSchema),
    },
  );
}

export function getSeatingSummary(api: ApiClient, weddingId: string, signal?: AbortSignal) {
  return api.request(`/weddings/${encodeURIComponent(weddingId)}/guest-planning/seating-summary`, {
    signal,
    schema: seatingSummarySchema,
  });
}

export const tableEstimateSchema = z.object({
  capacity: z.number().int(),
  reservePercent: z.number().int(),
  seatsNeeded: z.number().int(),
  confirmedSeats: z.number().int(),
  pendingSeats: z.number().int(),
  tablesNeeded: z.number().int(),
  reserveTables: z.number().int(),
  recommendedTables: z.number().int(),
  currentTables: z.number().int(),
  currentSeats: z.number().int(),
  missingTables: z.number().int(),
  bySide: z.array(
    z.object({
      side: z.string(),
      seats: z.number().int(),
      tables: z.number().int(),
      currentTables: z.number().int(),
    }),
  ),
});
export type TableEstimate = z.infer<typeof tableEstimateSchema>;
export const tableEstimateKey = (weddingId: string, capacity: number, reservePercent: number) =>
  ["table-estimate", weddingId, capacity, reservePercent] as const;

/** Tables to book from the guest count (60 people: 6 tables of 10 or 5 of 12), plus reserve. */
export function getTableEstimate(
  api: ApiClient,
  weddingId: string,
  capacity: 10 | 12,
  reservePercent: number,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    capacity: String(capacity),
    reservePercent: String(reservePercent),
  });
  return api.request(
    `/weddings/${encodeURIComponent(weddingId)}/guest-planning/table-estimate?${query}`,
    { signal, schema: tableEstimateSchema },
  );
}
