import assert from "node:assert/strict";
import test from "node:test";
import type { ApiClient } from "../src/core/api/api-client";
import { listWeddingAuditLogs } from "../src/features/audit/api/audit.api";
import { listPlanningGroups } from "../src/features/co-hosts/api/co-host.api";
import { getCheckInSummary } from "../src/features/guests/api/check-in-summary.api";
import { listPlanningGuests } from "../src/features/guests/api/planning.api";

function captureApi(response: unknown) {
  const requests: { path: string; options: Record<string, unknown> }[] = [];
  const api = {
    request: async (path: string, options: Record<string, unknown>) => {
      requests.push({ path, options });
      return response;
    },
  } as unknown as ApiClient;
  return { api, requests };
}

test("co-host scope choices come from the complete backend group catalog", async () => {
  const { api, requests } = captureApi({
    isWeddingWide: false,
    items: [{ id: "empty-group", name: "Nhà gái" }],
  });

  const groups = await listPlanningGroups(api, "wedding-1");

  assert.equal(requests[0]?.path, "/weddings/wedding-1/guest-planning/groups");
  assert.deepEqual(groups, [{ id: "empty-group", name: "Nhà gái" }]);
});

test("guest planning list sends side and group filters to the server", async () => {
  const { api, requests } = captureApi({ items: [], page: 1, pageSize: 20, totalItems: 0 });

  await listPlanningGuests(api, "wedding-1", 2, "Dương", undefined, false, {
    side: "BRIDE",
    groupId: "RELATIVES",
  });

  assert.equal(
    requests[0]?.path,
    "/weddings/wedding-1/guest-planning/guests?page=2&pageSize=20&search=D%C6%B0%C6%A1ng&archivedOnly=false&side=BRIDE&group=RELATIVES",
  );
});

test("check-in summary uses the wedding-scoped reception endpoint", async () => {
  const { api, requests } = captureApi({
    expectedPlaces: 12,
    checkedIn: 3,
    checkedInConfirmed: 2,
    checkedInWithoutRsvp: 1,
    checkedInExceptions: 0,
    checkedInWalkIns: 0,
    bySide: [{ side: "BRIDE", expectedPlaces: 7, checkedIn: 2 }],
  });

  const summary = await getCheckInSummary(api, "wedding-1");

  assert.equal(requests[0]?.path, "/weddings/wedding-1/guest-planning/check-ins/summary");
  assert.equal(summary.expectedPlaces, 12);
});

test("audit API encodes owner-scoped filters and pagination", async () => {
  const { api, requests } = captureApi({
    items: [],
    page: 1,
    pageSize: 25,
    totalCount: 0,
    totalPages: 0,
  });

  await listWeddingAuditLogs(api, "wedding-1", 3, {
    action: "GUEST_UPDATED",
    entityType: "Guest",
    from: "2026-10-01T00:00:00.000Z",
  });

  assert.equal(
    requests[0]?.path,
    "/weddings/wedding-1/audit-logs?page=3&pageSize=25&action=GUEST_UPDATED&entityType=Guest&from=2026-10-01T00%3A00%3A00.000Z",
  );
});
