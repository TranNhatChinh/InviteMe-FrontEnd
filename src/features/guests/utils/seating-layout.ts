import type { SeatingPlan, SeatingSide } from "../api/planning-seating.api";
export type SeatingTable = SeatingPlan["tables"][number];
export function hasTableSlot(table: SeatingTable): boolean {
  return !!table.side && !!table.row && !!table.column;
}
export function sideSlots(tables: SeatingTable[], side: SeatingSide, columns: number) {
  const positioned = tables.filter((table) => table.side === side && hasTableSlot(table));
  const rows = Math.max(1, ...positioned.map((table) => table.row ?? 1));
  // Keep one complete spare row so every table can move to an empty slot.
  return Array.from({ length: Math.min(100, rows + 1) * columns }, (_, index) => {
    const row = Math.floor(index / columns) + 1,
      column = (index % columns) + 1;
    return {
      side,
      row,
      column,
      table: positioned.find((table) => table.row === row && table.column === column),
    };
  });
}
export function validSlotMove(
  source: SeatingTable,
  side: SeatingSide,
  row: number,
  column: number,
  width: number,
) {
  return (
    hasTableSlot(source) &&
    source.side === side &&
    Number.isInteger(row) &&
    row >= 1 &&
    row <= 100 &&
    Number.isInteger(column) &&
    column >= 1 &&
    column <= width
  );
}
export function generationIssues(plan: SeatingPlan, capacity: number) {
  const sizes = new Map<string, number>();
  for (const place of plan.places) sizes.set(place.guestId, (sizes.get(place.guestId) ?? 0) + 1);
  return {
    missingSide: plan.guests.filter(
      (g) => sizes.has(g.id) && g.side !== "BRIDE" && g.side !== "GROOM",
    ),
    oversized: plan.guests.filter((g) => (sizes.get(g.id) ?? 0) > capacity),
    lowerBounds: (["BRIDE", "GROOM"] as const).map((side) =>
      Math.ceil(
        plan.guests.filter((g) => g.side === side).reduce((n, g) => n + (sizes.get(g.id) ?? 0), 0) /
          capacity,
      ),
    ),
  };
}
export function wouldSplitParty(plan: SeatingPlan, ids: string[], target: string | null) {
  const moving = new Set(ids);
  const guests = new Set(plan.places.filter((p) => moving.has(p.id)).map((p) => p.guestId));
  return [...guests].some((guest) => {
    const places = new Set(plan.places.filter((p) => p.guestId === guest).map((p) => p.id));
    const destinations = new Set(
      plan.assignments
        .filter((a) => places.has(a.placeId) && !moving.has(a.placeId))
        .map((a) => a.tableId),
    );
    if (target) destinations.add(target);
    return destinations.size > 1;
  });
}
