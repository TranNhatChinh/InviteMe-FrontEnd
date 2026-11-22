import test from "node:test";
import assert from "node:assert/strict";
import type { SeatingPlan } from "../src/features/guests/api/planning-seating.api";
import {
  offsetDragPreview,
  seatingDropFeedback,
} from "../src/features/guests/utils/seating-drag-preview";

const plan: SeatingPlan = {
  weddingId: "w",
  version: 3,
  guests: [],
  tables: [
    { id: "a", name: "Bàn 1", capacity: 4 },
    { id: "b", name: "Bàn 2", capacity: 2 },
  ],
  places: [1, 2, 3, 4].map((n) => ({ id: `p${n}`, guestId: "g", position: n, person: null })),
  assignments: [1, 2, 3, 4].map((n) => ({ placeId: `p${n}`, tableId: "a", seatNumber: n })),
};

test("group hover shows actual destination seats and remaining capacity without changing the plan", () => {
  const feedback = seatingDropFeedback(plan, ["p2", "p3"], { tableId: "b", seatNumber: 2 });
  assert.deepEqual(feedback, {
    valid: true,
    message: "+2 · còn 0 chỗ sau khi xếp",
    messageKey: "seating.feedback.capacity",
    messageValues: { count: 2, remaining: 0 },
    seats: [2, 1],
  });
  assert.equal(plan.assignments.filter((a) => a.tableId === "a").length, 4);
});

test("reordering on the source table counts the dragged seats as free", () => {
  const feedback = seatingDropFeedback(plan, ["p2", "p3"], { tableId: "a", seatNumber: 3 });
  assert.deepEqual(feedback, {
    valid: true,
    message: "+2 · còn 0 chỗ sau khi xếp",
    messageKey: "seating.feedback.capacity",
    messageValues: { count: 2, remaining: 0 },
    seats: [3, 2],
  });
});

test("oversized groups and occupied seats show rejection without ghost seat highlights", () => {
  assert.deepEqual(seatingDropFeedback(plan, ["p1", "p2", "p3"], { tableId: "b" }), {
    valid: false,
    message: "Thiếu 1 chỗ",
    messageKey: "seating.feedback.shortage",
    messageValues: { count: 1 },
    seats: [],
  });
  assert.deepEqual(seatingDropFeedback(plan, ["p1"], { tableId: "a", seatNumber: 2 }), {
    valid: false,
    message: "Ghế đã có khách",
    messageKey: "seating.feedback.occupied",
    messageValues: {},
    seats: [],
  });
  assert.deepEqual(seatingDropFeedback(plan, ["p1"], { tableId: "b", seatNumber: 3 }), {
    valid: false,
    message: "Ghế đã có khách",
    messageKey: "seating.feedback.occupied",
    messageValues: {},
    seats: [],
  });
});

test("leaving a table clears feedback and hovering the queue indicates unassign", () => {
  assert.equal(seatingDropFeedback(plan, ["p1"], null), null);
  assert.equal(seatingDropFeedback(plan, [], { tableId: "a" }), null);
  assert.deepEqual(seatingDropFeedback(plan, ["p1"], { tableId: null }), {
    valid: true,
    message: "Bỏ xếp 1 người",
    messageKey: "seating.feedback.unassign",
    messageValues: { count: 1 },
    seats: [],
  });
});

function overlayArgs(pointerType: string): Parameters<typeof offsetDragPreview>[0] {
  return {
    active: null,
    over: null,
    activatorEvent: { clientX: 110, clientY: 220, pointerType } as unknown as Event,
    activeNodeRect: { left: 100, top: 200, width: 200, height: 50, right: 300, bottom: 250 },
    overlayNodeRect: { left: 0, top: 0, width: 240, height: 80, right: 240, bottom: 80 },
    windowRect: { left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 },
    draggingNodeRect: null,
    containerNodeRect: null,
    scrollableAncestors: [],
    scrollableAncestorRects: [],
    transform: { x: 100, y: 200, scaleX: 1, scaleY: 1 },
  };
}

test("touch preview stays centered above the finger with a 52px center offset", () => {
  const args = overlayArgs("touch");
  const result = offsetDragPreview(args);
  assert.equal(100 + result.x + 120, 110 + args.transform.x);
  assert.equal(200 + result.y + 40, 220 + args.transform.y - 52);
  assert.deepEqual(args.transform, { x: 100, y: 200, scaleX: 1, scaleY: 1 });
});

test("preview stays inside viewport edges and keyboard position is unchanged", () => {
  const args = overlayArgs("mouse");
  args.transform.x = 400;
  const result = offsetDragPreview(args);
  assert.equal(100 + result.x + 240, 382);
  args.activatorEvent = { code: "Space" } as unknown as Event;
  assert.equal(offsetDragPreview(args), args.transform);
});

test("hovering a two-person party changes both preview seats instead of pinning seat one", () => {
  const empty = { ...plan, tables: [{ id: "b", name: "Bàn", capacity: 10 }], assignments: [] };
  assert.deepEqual(
    seatingDropFeedback(empty, ["p1", "p2"], { tableId: "b", seatNumber: 4 })?.seats,
    [4, 5],
  );
  assert.deepEqual(
    seatingDropFeedback(empty, ["p1", "p2"], { tableId: "b", seatNumber: 7 })?.seats,
    [7, 8],
  );
  assert.deepEqual(
    seatingDropFeedback(empty, ["p1", "p2"], { tableId: "b", seatNumber: 10 })?.seats,
    [10, 1],
  );
  assert.deepEqual(empty.assignments, []);
});
