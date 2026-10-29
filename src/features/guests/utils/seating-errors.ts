import { ApiError } from "@/core/api/api-error";

// BE seating rule codes -> what the couple should read (seating:errors.<CODE>). ApiError never carries BE detail text.
const codes = new Set([
  "TABLE_NUMBER_TAKEN",
  "TABLE_LIMIT",
  "TABLE_HAS_ASSIGNED_PLACES",
  "INVALID_TABLE_CAPACITY",
  "INVALID_RESERVE_PERCENT",
  "SEATING_EVENT_STARTED",
  "TABLE_CELL_OCCUPIED",
  "CELL_OUT_OF_LAYOUT",
  "HALF_REQUIRED",
  "SEAT_OCCUPIED",
  "SEAT_UNAVAILABLE",
  "TABLE_FULL",
  "TABLE_OVER_CAPACITY",
  "BOTH_PLACES_IN_TRAY",
  "GUEST_NOT_ATTENDING",
  "SEATING_PLAN_LOCKED",
  "SEATING_SCOPE_MISMATCH",
  "SEATING_CROSS_GROUP_MOVE_DENIED",
  "SEATING_TABLE_HAS_OUT_OF_SCOPE_GUESTS",
  "SEATING_SOURCE_CHANGED",
  "NO_SEATING_CHANGES",
  "SEATING_SUGGESTION_REQUIRES_WEDDING_SCOPE",
  "NO_TABLE_PLACEMENTS",
  "SEAT_IN_USE",
  "NO_TABLES",
  "NO_AVAILABLE_SEATS",
  "EVENT_ALREADY_STARTED",
  "TABLE_NOT_FOUND",
  "PLACE_NOT_FOUND",
]);

// `t` is the "seating" namespace translator.
export function seatingErrorText(error: unknown, t: (key: string) => string): string | undefined {
  return error instanceof ApiError && error.backendCode && codes.has(error.backendCode)
    ? t(`errors.${error.backendCode}`)
    : undefined;
}
