import test from "node:test";
import assert from "node:assert/strict";
import { previewSeatMove } from "../src/features/guests/utils/planning-seat-move";
import type { SeatingPlan } from "../src/features/guests/api/planning-seating.api";

function plan(): SeatingPlan {
  return {
    weddingId: "w",
    version: 3,
    guests: [],
    tables: [
      { id: "a", name: "A", capacity: 4 },
      { id: "b", name: "B", capacity: 2 },
    ],
    places: [1, 2, 3, 4].map((n) => ({ id: `p${n}`, guestId: "g", position: n, person: null })),
    assignments: [1, 2, 3, 4].map((n) => ({ placeId: `p${n}`, tableId: "a", seatNumber: n })),
  };
}
test("whole family moves atomically, oversized target never previews a partial move", () => {
  const original = plan();
  assert.equal(previewSeatMove(original, ["p1", "p2", "p3", "p4"], "b"), null);
  assert.equal(original.assignments.length, 4);
});
test("split one unnamed place preserves identity, expected total and existing seats", () => {
  const next = previewSeatMove(plan(), ["p3"], "b", 2);
  assert.equal(next?.assignments.find((x) => x.placeId === "p3")?.seatNumber, 2);
  assert.equal(next?.assignments.filter((x) => x.tableId === "a").length, 3);
  assert.equal(next?.places.length, 4);
  assert.equal(next?.version, 3);
});
test("occupied seat rejected; unassigning and reordering a full table supported", () => {
  assert.equal(previewSeatMove(plan(), ["p1"], "a", 2), null);
  assert.equal(
    previewSeatMove(plan(), ["p1", "p2", "p3", "p4"], "a", 3)?.assignments[0]?.seatNumber,
    3,
  );
  assert.equal(previewSeatMove(plan(), ["p1", "p2"], null)?.assignments.length, 2);
  assert.equal(previewSeatMove(plan(), ["p1", "p1"], "b"), null);
});

test("the entire party follows the hovered seat, skipping occupied seats and wrapping once", () => {
  const source = plan();
  source.tables[1]!.capacity = 10;
  const seats = (hover?: number) =>
    previewSeatMove(source, ["p1", "p2"], "b", hover)
      ?.assignments.filter((a) => a.tableId === "b" && ["p1", "p2"].includes(a.placeId))
      .map((a) => a.seatNumber);
  assert.deepEqual(seats(4), [4, 5]);
  assert.deepEqual(seats(6), [6, 7]);
  assert.deepEqual(seats(10), [10, 1]);
  assert.deepEqual(seats(), [1, 2]);
  const original = JSON.stringify(source);
  seats(8);
  assert.equal(JSON.stringify(source), original);
  source.assignments.push({ placeId: "p3", tableId: "b", seatNumber: 5 });
  source.assignments = source.assignments.filter((a) => !(a.placeId === "p3" && a.tableId === "a"));
  assert.deepEqual(seats(4), [4, 6]);
  assert.equal(seats(5), undefined); // Explicitly targeting an occupied seat remains invalid.
  assert.equal(seats(11), undefined);
});

test("reordering a party releases its own old seats and preserves everyone else", () => {
  const source = plan();
  const next = previewSeatMove(source, ["p1", "p2", "p3", "p4"], "a", 3);
  assert.deepEqual(
    next?.assignments.map((a) => a.seatNumber),
    [3, 4, 1, 2],
  );
  const partial = previewSeatMove(source, ["p2", "p3"], "a", 3);
  assert.deepEqual(
    partial?.assignments.filter((a) => ["p2", "p3"].includes(a.placeId)).map((a) => a.seatNumber),
    [3, 2],
  );
  assert.deepEqual(
    partial?.assignments.filter((a) => ["p1", "p4"].includes(a.placeId)),
    source.assignments.filter((a) => ["p1", "p4"].includes(a.placeId)),
  );
});
