import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "../src/core/api/api-client";
import {
  previewSeatingArrangement,
  applySeatingArrangement,
} from "../src/features/guests/api/planning-seating.api";

test("existing-table suggestions use one policy and apply only the validated snapshot identity", async (context) => {
  const original = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = original;
  });
  const requests: { url: string; body: unknown }[] = [];
  const proposal = {
    sourceVersion: 2,
    sourceFingerprint: "snapshot",
    algorithmVersion: "existing-party-pack-v1",
    assignments: [{ placeId: "p", tableId: "t", seatNumber: 1 }],
    newlyAssignedCount: 1,
    preservedCount: 0,
    unassigned: [],
    warnings: ["PLANNED_PLACES"],
  };
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json(
      requests.length === 1
        ? proposal
        : {
            weddingId: "w",
            version: 3,
            tables: [
              { id: "t", name: "T01", capacity: 10, group: null, side: "GROOM", row: 1, column: 1 },
            ],
            guests: [],
            places: [],
            assignments: proposal.assignments,
          },
    );
  };
  const api = createApiClient("https://api.test/api", {
    getGeneration: () => 1,
    getToken: async () => "test-token",
    recover: async () => null,
    clear: () => {},
  });
  const preview = await previewSeatingArrangement(api, "w", { expectedVersion: 2 });
  const applied = await applySeatingArrangement(api, "w", {
    expectedVersion: preview.sourceVersion,
    sourceFingerprint: preview.sourceFingerprint,
    algorithmVersion: preview.algorithmVersion,
  });
  assert.ok(requests[0]?.url.endsWith("/seating-plan/arrange-preview"));
  assert.deepEqual(requests[0]?.body, { expectedVersion: 2 });
  assert.ok(requests[1]?.url.endsWith("/seating-plan/arrange-apply"));
  assert.deepEqual(requests[1]?.body, {
    expectedVersion: 2,
    sourceFingerprint: "snapshot",
    algorithmVersion: "existing-party-pack-v1",
  });
  assert.equal(applied.version, 3);
  assert.equal(applied.tables[0]?.groupId, undefined);
});
