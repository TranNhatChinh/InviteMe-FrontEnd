import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "../src/core/api/api-client";
import {
  generateSeatingPreview,
  applySeatingGeneration,
  seatingGenerationSchema,
  seatingPlanSchema,
  type SeatingPlan,
} from "../src/features/guests/api/planning-seating.api";
import {
  generationIssues,
  hasTableSlot,
  sideSlots,
  validSlotMove,
  wouldSplitParty,
} from "../src/features/guests/utils/seating-layout";
import { previewSeatMove } from "../src/features/guests/utils/planning-seat-move";
import { seatingDropFeedback } from "../src/features/guests/utils/seating-drag-preview";
import {
  changeGenerationDraft,
  generationDraftPlan,
  generationDraftInput,
} from "../src/features/guests/utils/seating-generation-draft";
function plan(): SeatingPlan {
  return {
    weddingId: "w",
    version: 0,
    brideTablesPerRow: 2,
    groomTablesPerRow: 2,
    tables: [],
    guests: [
      {
        id: "g",
        version: 1,
        recipientName: "An",
        honorific: null,
        expectedPeople: 4,
        side: "GROOM",
        group: null,
        phone: null,
        note: null,
      },
    ],
    places: [1, 2, 3, 4].map((position) => ({
      id: `p${position}`,
      guestId: "g",
      position,
      person: null,
    })),
    assignments: [],
  };
}
test("generated draft edits remain local and serialize the edited tables and seats for one save", () => {
  const source = plan();
  const config = {
    expectedVersion: 0,
    tableCapacity: 10 as const,
    tablesPerRow: { bride: 2, groom: 2 },
  };
  const proposal = seatingGenerationSchema.parse({
    sourceVersion: 0,
    sourceFingerprint: "fingerprint",
    algorithmVersion: "v1",
    optimizationStatus: "PROVEN_OPTIMAL",
    summary: { guests: 1, places: 4, tables: 1, emptySeats: 6 },
    tables: [
      { code: "T01", side: "GROOM", row: 1, column: 1, capacity: 10, group: null, guestIds: ["g"] },
    ],
    assignments: source.places.map((p, i) => ({
      placeId: p.id,
      tableCode: "T01",
      seatNumber: i + 1,
    })),
    warnings: [],
  });
  let draft = generationDraftPlan(source, proposal, config);
  draft = changeGenerationDraft(draft, {
    action: "UPDATE_TABLE",
    tableId: "draft:T01",
    name: "Bạn thân",
    capacity: 8,
  });
  assert.throws(() =>
    changeGenerationDraft(draft, {
      action: "UPDATE_TABLE",
      tableId: "draft:T01",
      name: "Too small",
      capacity: 3,
    }),
  );
  draft = changeGenerationDraft(draft, { action: "MOVE_PLACES", placeIds: ["p4"], tableId: null });
  draft = changeGenerationDraft(draft, {
    action: "MOVE_TABLE_SLOT",
    tableId: "draft:T01",
    targetRow: 2,
    targetColumn: 2,
  });
  const request = generationDraftInput(draft, {
    ...config,
    sourceFingerprint: "fingerprint",
    algorithmVersion: "v1",
  });
  assert.equal(request.expectedVersion, 0);
  assert.equal(request.draft?.tables[0]?.name, "Bạn thân");
  assert.equal(request.draft?.tables[0]?.row, 2);
  assert.equal(request.draft?.assignments.length, 3);
  assert.equal(source.tables.length, 0);
  assert.equal(source.assignments.length, 0);
  assert.equal(
    changeGenerationDraft(draft, { action: "DELETE_TABLE", tableId: "draft:T01" }).assignments
      .length,
    0,
  );
});
test("legacy layouts remain unpositioned and mixed-group tables never acquire a group scope", () => {
  const source = plan();
  const parsed = seatingPlanSchema.parse({
    ...source,
    tables: [
      { id: "t", name: "T01", capacity: 10, group: null, side: "GROOM", row: 1, column: 1 },
      { id: "old", name: "Old", capacity: 10, group: "OTHER" },
    ],
  });
  assert.equal(parsed.tables[0]?.groupId, undefined);
  assert.equal(hasTableSlot(parsed.tables[0]!), true);
  assert.equal(hasTableSlot(parsed.tables[1]!), false);
  assert.equal(parsed.tables[1]?.side, undefined);
});
test("slot generation preserves holes and adds an empty row without mixing sides", () => {
  const tables = [
    { id: "t", name: "T01", capacity: 10, side: "GROOM" as const, row: 2, column: 2 },
    { id: "g", name: "G01", capacity: 10, side: "BRIDE" as const, row: 1, column: 1 },
  ];
  const slots = sideSlots(tables, "GROOM", 2);
  assert.equal(slots.length, 6);
  assert.equal(slots[0]?.table, undefined);
  assert.equal(slots[3]?.table?.id, "t");
  assert.equal(validSlotMove(tables[0]!, "BRIDE", 1, 1, 2), false);
  assert.equal(validSlotMove(tables[0]!, "GROOM", 1, 3, 2), false);
  assert.equal(validSlotMove(tables[0]!, "GROOM", 1, 1, 2), true);
});
test("generation counts places including declined guests and reports unknown sides and oversize invitations", () => {
  const source = plan();
  source.places[0]!.person = {
    id: "person",
    fullName: "An",
    role: "PRIMARY",
    attendanceStatus: "DECLINED",
  };
  source.guests[0]!.expectedPeople = 1;
  assert.deepEqual(generationIssues(source, 10).lowerBounds, [0, 1]);
  assert.equal(generationIssues(source, 3).oversized.length, 1);
  source.guests[0]!.side = "MUTUAL";
  assert.equal(generationIssues(source, 10).missingSide.length, 1);
});
test("manual move preview blocks opposite sides and identifies splitting a whole invitation", () => {
  const source = plan();
  source.tables = [
    { id: "a", name: "A", capacity: 10, side: "GROOM", row: 1, column: 1 },
    { id: "b", name: "B", capacity: 10, side: "GROOM", row: 1, column: 2 },
    { id: "c", name: "C", capacity: 10, side: "BRIDE", row: 1, column: 1 },
  ];
  source.assignments = source.places.map((p, i) => ({
    placeId: p.id,
    tableId: "a",
    seatNumber: i + 1,
  }));
  assert.equal(previewSeatMove(source, ["p1"], "c"), null);
  assert.equal(
    seatingDropFeedback(source, ["p1"], { tableId: "c" })?.messageKey,
    "layout.sideConflict",
  );
  assert.equal(wouldSplitParty(source, ["p1"], "b"), true);
  assert.equal(wouldSplitParty(source, ["p1"], null), false);
  assert.equal(wouldSplitParty(source, ["p1", "p2", "p3", "p4"], "b"), false);
});
test("preview and apply use the same config and forward the snapshot token and algorithm without client assignments", async (context) => {
  const requests: { path: string; body: unknown }[] = [];
  const response = {
    sourceVersion: 0,
    sourceFingerprint: "fingerprint",
    algorithmVersion: "party-bfd-search-v1",
    optimizationStatus: "PROVEN_OPTIMAL",
    summary: { guests: 1, places: 4, tables: 1, emptySeats: 6 },
    tables: [
      { code: "T01", side: "GROOM", row: 1, column: 1, capacity: 10, group: null, guestIds: ["g"] },
    ],
    assignments: plan().places.map((p, i) => ({
      placeId: p.id,
      tableCode: "T01",
      seatNumber: i + 1,
    })),
    warnings: [],
  };
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, init) => {
    requests.push({ path: String(input), body: JSON.parse(String(init?.body)) });
    return Response.json(requests.length === 1 ? response : plan());
  };
  const api = createApiClient("https://api.example.test/api", {
    getToken: async () => "test-access",
    getGeneration: () => 1,
    recover: async () => null,
    clear: () => {},
  });
  const config = {
    expectedVersion: 0,
    tableCapacity: 10 as const,
    tablesPerRow: { bride: 2, groom: 2 },
  };
  const preview = await generateSeatingPreview(api, "w", config);
  await applySeatingGeneration(api, "w", {
    ...config,
    sourceFingerprint: preview.sourceFingerprint,
    algorithmVersion: preview.algorithmVersion,
  });
  assert.ok(requests[0]?.path.endsWith("/seating-plan/generate-preview"));
  assert.ok(requests[1]?.path.endsWith("/seating-plan/generate-apply"));
  assert.deepEqual(requests[1]?.body, {
    ...config,
    sourceFingerprint: "fingerprint",
    algorithmVersion: "party-bfd-search-v1",
  });
  assert.equal(
    seatingGenerationSchema.safeParse({ ...response, optimizationStatus: "UNKNOWN" }).success,
    false,
  );
});
