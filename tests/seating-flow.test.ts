import test from "node:test";
import assert from "node:assert/strict";
import {
  seatingLayoutSchema,
  planningTableSchema,
  seatingWarningSchema,
  seatingSuggestionSchema,
  unattendedGuestSchema,
  seatingAuditLogSchema,
  getSeatingLayout,
  updateSeatingLayout,
  getUnattendedGuests,
  getSeatingAuditLogs,
} from "../src/features/guests/api/planning-seating.api";
import type { ApiClient } from "../src/core/api/api-client";

test("seatingLayoutSchema validates groom and bride grid dimensions", () => {
  const valid = seatingLayoutSchema.parse({
    weddingId: "w1",
    groomRows: 5,
    groomColumns: 3,
    brideRows: 6,
    brideColumns: 4,
    numbering: "BY_ROW",
    version: 1,
  });

  assert.equal(valid.groomRows, 5);
  assert.equal(valid.groomColumns, 3);
  assert.equal(valid.brideRows, 6);
  assert.equal(valid.brideColumns, 4);
  assert.equal(valid.numbering, "BY_ROW");
});

test("seatingLayoutSchema supports ODD_EVEN numbering strategy", () => {
  const valid = seatingLayoutSchema.parse({
    weddingId: "w1",
    groomRows: 4,
    groomColumns: 2,
    brideRows: 4,
    brideColumns: 2,
    numbering: "ODD_EVEN",
    version: 2,
  });

  assert.equal(valid.numbering, "ODD_EVEN");
});

test("planningTableSchema validates both full table details and legacy mock format", () => {
  // Full table with positioning & Vietnamese wedding side metadata
  const fullTable = planningTableSchema.parse({
    id: "tbl-1",
    name: "Bàn VIP 01",
    capacity: 10,
    number: 1,
    side: "GROOM",
    row: 1,
    column: 1,
    isVip: true,
    extraSeats: 2,
  });

  assert.equal(fullTable.id, "tbl-1");
  assert.equal(fullTable.number, 1);
  assert.equal(fullTable.side, "GROOM");
  assert.equal(fullTable.row, 1);
  assert.equal(fullTable.column, 1);
  assert.equal(fullTable.isVip, true);
  assert.equal(fullTable.extraSeats, 2);

  // Legacy mock table with only id, name, capacity
  const legacyTable = planningTableSchema.parse({
    id: "tbl-legacy",
    name: "Bàn thử nghiệm",
    capacity: 8,
  });

  assert.equal(legacyTable.id, "tbl-legacy");
  assert.equal(legacyTable.capacity, 8);
  assert.equal(legacyTable.side, undefined);
});

test("seatingWarningSchema validates party split and side mismatch warnings", () => {
  const warning1 = seatingWarningSchema.parse({
    code: "PARTY_SPLIT",
    guestId: "g-1",
    tableId: "tbl-1",
    message: "Gia đình bị chia ra 2 bàn khác nhau",
  });
  assert.equal(warning1.code, "PARTY_SPLIT");

  const warning2 = seatingWarningSchema.parse({
    code: "SIDE_MISMATCH",
    guestId: "g-2",
    tableId: "tbl-2",
    message: "Khách nhà trai ngồi nhầm bên nhà gái",
  });
  assert.equal(warning2.code, "SIDE_MISMATCH");
});

test("seatingSuggestionSchema parses strategy preview metrics", () => {
  const suggestion = seatingSuggestionSchema.parse({
    strategy: "AFFINITY",
    mode: "UNASSIGNED",
    sourceVersion: 2,
    sourceFingerprint: "fingerprint-12345",
    assignments: [
      { placeId: "p-1", tableId: "tbl-1", seatNumber: 1 },
      { placeId: "p-2", tableId: "tbl-1", seatNumber: 2 },
    ],
    unassigned: [
      {
        guestId: "g-3",
        placeIds: ["p-3", "p-4"],
        code: "TABLE_SHORTAGE",
        message: "Không đủ bàn trống 4 chỗ cho nhóm bạn đại học",
      },
    ],
    excludedPlaceIds: [],
    warnings: ["Thiếu 1 chỗ ngồi cho nhóm bạn đại học"],
    reasons: [],
    changedPlaceCount: 2,
    preservedCount: 15,
  });

  assert.equal(suggestion.strategy, "AFFINITY");
  assert.equal(suggestion.preservedCount, 15);
  assert.equal(suggestion.assignments.length, 2);
  assert.equal(suggestion.unassigned.length, 1);
});

test("unattendedGuestSchema and seatingAuditLogSchema parse day-of records", () => {
  const unattended = unattendedGuestSchema.parse({
    placeId: "p-1",
    seatNumber: 3,
    guestId: "g-1",
    guestName: "Nguyễn Văn A",
  });
  assert.equal(unattended.guestName, "Nguyễn Văn A");
  assert.equal(unattended.seatNumber, 3);

  const log = seatingAuditLogSchema.parse({
    id: "log-1",
    action: "START_EVENT",
    actorUserId: "user-1",
    createdAt: "2026-10-27T10:00:00Z",
    metadata: "Bắt đầu tiệc cưới",
  });
  assert.equal(log.action, "START_EVENT");
});

test("getSeatingLayout and updateSeatingLayout make correct API calls", async () => {
  let requestedPath = "";
  let requestMethod = "";
  let sentBody: unknown = null;

  const mockApi = {
    request: async (path: string, options?: { method?: string; body?: unknown }) => {
      requestedPath = path;
      requestMethod = options?.method ?? "GET";
      sentBody = options?.body;
      if (requestMethod === "PUT") {
        return {
          weddingId: "w-mock",
          groomRows: 8,
          groomColumns: 4,
          brideRows: 8,
          brideColumns: 4,
          numbering: "ODD_EVEN",
          version: 2,
        };
      }
      return {
        weddingId: "w-mock",
        groomRows: 6,
        groomColumns: 3,
        brideRows: 6,
        brideColumns: 3,
        numbering: "BY_ROW",
        version: 1,
      };
    },
  } as unknown as ApiClient;

  const layout = await getSeatingLayout(mockApi, "w-mock");
  assert.equal(requestedPath, "/weddings/w-mock/seating-layout");
  assert.equal(layout.groomRows, 6);

  const updated = await updateSeatingLayout(mockApi, "w-mock", {
    groomRows: 8,
    groomColumns: 4,
    brideRows: 8,
    brideColumns: 4,
    numbering: "ODD_EVEN",
    expectedVersion: 1,
  });

  assert.equal(requestMethod, "PUT");
  assert.equal(requestedPath, "/weddings/w-mock/seating-layout");
  assert.deepEqual(sentBody, {
    groomRows: 8,
    groomColumns: 4,
    brideRows: 8,
    brideColumns: 4,
    numbering: "ODD_EVEN",
    expectedVersion: 1,
  });
  assert.equal(updated.groomRows, 8);
});

test("getUnattendedGuests and getSeatingAuditLogs make correct API calls", async () => {
  const calls: string[] = [];
  const mockApi = {
    request: async (path: string) => {
      calls.push(path);
      if (path.includes("unattended-guests")) {
        return [
          {
            placeId: "p-10",
            seatNumber: 1,
            guestId: "g-10",
            guestName: "Trần Thị B",
          },
        ];
      }
      return [
        {
          id: "log-1",
          action: "LOCK_PLAN",
          actorUserId: "user-1",
          createdAt: "2026-10-27T10:00:00Z",
        },
      ];
    },
  } as unknown as ApiClient;

  const unattended = await getUnattendedGuests(mockApi, "w-mock", "table-1");
  assert.equal(calls[0], "/weddings/w-mock/guest-planning/seating/tables/table-1/unattended-guests");
  assert.equal(unattended.length, 1);
  assert.equal(unattended[0]?.guestName, "Trần Thị B");

  const logs = await getSeatingAuditLogs(mockApi, "w-mock");
  assert.equal(calls[1], "/weddings/w-mock/guest-planning/seating/audit-logs");
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.action, "LOCK_PLAN");
});
