import type { SeatingPlan } from "../api/planning-seating.api";

// Preview only. BE rechecks ownership, version, seats and capacity before committing.
export function previewSeatMove(
  plan: SeatingPlan,
  ids: string[],
  tableId: string | null,
  seatNumber?: number,
): SeatingPlan | null {
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !plan.places.some((p) => p.id === id))
  )
    return null;
  const remaining = plan.assignments.filter((a) => !ids.includes(a.placeId));
  if (tableId === null) return { ...plan, assignments: remaining };
  const table = plan.tables.find((t) => t.id === tableId);
  if (!table) return null;
  const occupied = new Set(remaining.filter((a) => a.tableId === tableId).map((a) => a.seatNumber));
  const free = Array.from({ length: table.capacity }, (_, i) => i + 1).filter(
    (n) => !occupied.has(n),
  );
  if (seatNumber !== undefined) {
    const index = free.indexOf(seatNumber);
    if (index < 0) return null;
    free.splice(index, 1);
    free.unshift(seatNumber);
  }
  if (free.length < ids.length) return null;
  const places = plan.places
    .filter((p) => ids.includes(p.id))
    .sort((a, b) => a.guestId.localeCompare(b.guestId) || a.position - b.position);
  return {
    ...plan,
    assignments: [
      ...remaining,
      ...places.map((p, i) => ({ placeId: p.id, tableId, seatNumber: free[i] ?? 1 })),
    ],
  };
}
