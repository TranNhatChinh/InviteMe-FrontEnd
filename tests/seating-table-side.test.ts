import test from "node:test";
import assert from "node:assert/strict";
import { tableSideColors } from "../src/features/guests/utils/seating-table-side";
import { changeGenerationDraft } from "../src/features/guests/utils/seating-generation-draft";
import type { SeatingPlan } from "../src/features/guests/api/planning-seating.api";

test("table colors follow explicit side, with a neutral fallback", () => {
  assert.equal(tableSideColors("GROOM").label, "GROOM");
  assert.equal(tableSideColors("BRIDE").label, "BRIDE");
  assert.notEqual(tableSideColors("GROOM").surface, tableSideColors("BRIDE").surface);
  for (const side of [null, undefined]) assert.equal(tableSideColors(side).label, "neutralSide");
});

test("changing draft table side finds a free slot without moving guests or canvas coordinates", () => {
  const plan: SeatingPlan = {
    weddingId: "w",
    version: 1,
    guests: [],
    places: [],
    tables: [
      { id: "a", name: "A", capacity: 10, side: "BRIDE", row: 1, column: 1 },
      { id: "b", name: "B", capacity: 10, side: "GROOM", row: 1, column: 1 },
    ],
    assignments: [{ placeId: "p", tableId: "a", seatNumber: 5 }],
    canvasLayout: {
      splitZones: false,
      zones: {},
      stage: null,
      objects: [],
      tables: { a: { x: 950, y: -100 } },
    },
  };
  const next = changeGenerationDraft(plan, {
    action: "UPDATE_TABLE",
    tableId: "a",
    name: "A",
    capacity: 10,
    side: "GROOM",
  });
  assert.equal(next.tables[0]?.side, "GROOM");
  assert.equal(next.tables[0]?.column, 2);
  assert.deepEqual(next.assignments, plan.assignments);
  assert.deepEqual(next.canvasLayout, plan.canvasLayout);
  assert.equal(plan.tables[0]?.side, "BRIDE");
});
