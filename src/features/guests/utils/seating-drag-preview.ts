import type { SeatingPlan } from "../api/planning-seating.api";
import { previewSeatMove } from "./planning-seat-move";
import type { Modifier } from "@dnd-kit/core";

// Offset only the visual overlay; hit testing continues at the real pointer position.
export const offsetDragPreview: Modifier = ({
  transform,
  activatorEvent,
  activeNodeRect,
  overlayNodeRect,
  windowRect,
}) => {
  if (
    !activatorEvent ||
    !activeNodeRect ||
    !overlayNodeRect ||
    !("clientX" in activatorEvent) ||
    !("clientY" in activatorEvent)
  )
    return transform;
  const pointerX = Number(activatorEvent.clientX) - activeNodeRect.left;
  const pointerY = Number(activatorEvent.clientY) - activeNodeRect.top;
  const touch = "pointerType" in activatorEvent && activatorEvent.pointerType === "touch";
  let x = transform.x + pointerX + (touch ? -overlayNodeRect.width / 2 : 14);
  let y = transform.y + pointerY + (touch ? -overlayNodeRect.height - 12 : 12);
  if (windowRect) {
    x = Math.max(
      windowRect.left + 8 - activeNodeRect.left,
      Math.min(x, windowRect.right - overlayNodeRect.width - 8 - activeNodeRect.left),
    );
    y = Math.max(
      windowRect.top + 8 - activeNodeRect.top,
      Math.min(y, windowRect.bottom - overlayNodeRect.height - 8 - activeNodeRect.top),
    );
  }
  return { ...transform, x, y };
};

export type SeatingDropPosition = { tableId: string | null; seatNumber?: number };

// Use the same allocation rules as the eventual move, including seats freed by this drag.
export function seatingDropFeedback(
  plan: SeatingPlan,
  ids: string[],
  target: SeatingDropPosition | null,
) {
  if (!ids.length || !target) return null;
  if (target.tableId === null && !plan.assignments.some((a) => ids.includes(a.placeId)))
    return null;
  if (target.tableId === null)
    return {
      valid: true,
      message: `Bỏ xếp ${ids.length} người`,
      messageKey: "seating.feedback.unassign",
      messageValues: { count: ids.length },
      seats: [] as number[],
    };
  const table = plan.tables.find((t) => t.id === target.tableId);
  if (!table)
    return {
      valid: false,
      message: "Bàn không còn khả dụng",
      messageKey: "seating.feedback.tableUnavailable",
      messageValues: {},
      seats: [] as number[],
    };
  const occupied = plan.assignments.filter(
    (a) => a.tableId === table.id && !ids.includes(a.placeId),
  ).length;
  const shortage = Math.max(0, ids.length - (table.capacity - occupied));
  const next = previewSeatMove(plan, ids, table.id, target.seatNumber);
  if (!next)
    return {
      valid: false,
      message: shortage ? `Thiếu ${shortage} chỗ` : "Ghế đã có khách",
      messageKey: shortage ? "seating.feedback.shortage" : "seating.feedback.occupied",
      messageValues: shortage ? { count: shortage } : {},
      seats: [] as number[],
    };
  const afterCount = next.assignments.filter((a) => a.tableId === table.id).length;
  return {
    valid: true,
    message: `+${ids.length} · còn ${table.capacity - afterCount} chỗ sau khi xếp`,
    messageKey: "seating.feedback.capacity",
    messageValues: { count: ids.length, remaining: table.capacity - afterCount },
    seats: next.assignments
      .filter((a) => a.tableId === table.id && ids.includes(a.placeId))
      .map((a) => a.seatNumber),
  };
}
