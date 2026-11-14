import type { SeatingPlan, SeatingSide } from "../api/planning-seating.api";
export type SeatingTable = SeatingPlan["tables"][number];
export function nextSeatingTableNumber(tables: SeatingTable[]) {
  const used = new Set(
    tables.flatMap((table) => {
      const match = /^(?:Bàn|Ban|Table|[GT])\s*0*(\d+)$/iu.exec(table.name.trim());
      return match ? [Number(match[1])] : [];
    }),
  );
  let number = 1;
  while (used.has(number)) number++;
  return number;
}
export function hasTableSlot(table: SeatingTable): boolean {
  return !!table.side && !!table.row && !!table.column;
}
export function sideSlots(
  tables: SeatingTable[],
  side: SeatingSide,
  columns: number,
  minimumRows = 0,
) {
  const positioned = tables.filter((table) => table.side === side && hasTableSlot(table));
  const rows = Math.max(1, ...positioned.map((table) => table.row ?? 1));
  // Keep one complete spare row so every table can move to an empty slot.
  return Array.from(
    { length: Math.min(100, minimumRows > 0 ? Math.max(rows, minimumRows) : rows + 1) * columns },
    (_, index) => {
      const row = Math.floor(index / columns) + 1,
        column = (index % columns) + 1;
      return {
        side,
        row,
        column,
        table: positioned.find((table) => table.row === row && table.column === column),
      };
    },
  );
}
// Keep the displayed grid stable while empty slots remain; add a row only when a side needs one.
export function seatingBoardRows(plan: SeatingPlan) {
  let rows = Math.max(2, ...plan.tables.filter(hasTableSlot).map((table) => table.row ?? 1));
  for (const side of ["BRIDE", "GROOM"] as const) {
    const width = side === "BRIDE" ? (plan.brideTablesPerRow ?? 2) : (plan.groomTablesPerRow ?? 2);
    const used = new Set(
      plan.tables
        .filter((table) => table.side === side && hasTableSlot(table))
        .map((table) => `${table.row}:${table.column}`),
    );
    const firstFree = Array.from({ length: 100 * width }, (_, index) => index).find(
      (index) => !used.has(`${Math.floor(index / width) + 1}:${(index % width) + 1}`),
    );
    if (firstFree !== undefined) rows = Math.max(rows, Math.floor(firstFree / width) + 1);
  }
  return Math.min(100, rows);
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
    oversized: plan.guests.filter((g) => (sizes.get(g.id) ?? 0) > capacity),
    lowerBound: Math.ceil(plan.places.length / capacity),
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
