import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/core/api/api-error";
import { createApiClient } from "../src/core/api/api-client";
import type { SeatingPlan } from "../src/features/guests/api/planning-seating.api";
import {
  canRetrySeatingMove,
  moveSeatingWithRetry,
} from "../src/features/guests/utils/seating-conflict-retry";

function plan(): SeatingPlan {
  return {
    weddingId: "w",
    version: 1,
    guests: [
      {
        id: "g",
        version: 1,
        recipientName: "An",
        honorific: null,
        expectedPeople: 2,
        side: "GROOM",
        group: null,
        phone: null,
        note: null,
      },
    ],
    tables: [
      { id: "a", name: "A", capacity: 2 },
      { id: "b", name: "B", capacity: 2 },
    ],
    places: [1, 2].map((position) => ({
      id: `p${position}`,
      guestId: "g",
      position,
      person: null,
    })),
    assignments: [{ placeId: "p1", tableId: "a", seatNumber: 1 }],
  };
}
const move = { action: "MOVE_PLACES" as const, placeIds: ["p1"], tableId: "b", seatNumber: 1 };

test("retry accepts unrelated changes but refuses changed sources, identities, parties or occupied destinations", () => {
  const source = plan();
  const latest = plan();
  latest.version = 2;
  latest.assignments.push({ placeId: "p2", tableId: "b", seatNumber: 2 });
  assert.equal(canRetrySeatingMove(source, latest, move), true);
  const changedSource = structuredClone(latest);
  changedSource.assignments[0]!.seatNumber = 2;
  assert.equal(canRetrySeatingMove(source, changedSource, move), false);
  const changedPerson = structuredClone(latest);
  changedPerson.places[0]!.position = 3;
  assert.equal(canRetrySeatingMove(source, changedPerson, move), false);
  const changedParty = structuredClone(latest);
  changedParty.guests[0]!.version++;
  assert.equal(canRetrySeatingMove(source, changedParty, move), false);
  latest.assignments[1]!.seatNumber = 1;
  assert.equal(canRetrySeatingMove(source, latest, move), false);
  latest.tables = [];
  assert.equal(canRetrySeatingMove(source, latest, move), false);
});

for (const outcome of [
  "success",
  "second-conflict",
  "lease-lost",
  "locked",
  "source-changed",
] as const) {
  test(`version conflict handling: ${outcome}`, async (t) => {
    const source = plan();
    const latest = plan();
    latest.version = 2;
    if (outcome === "source-changed") latest.assignments[0]!.seatNumber = 2;
    const originalFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = originalFetch;
    });
    const bodies: { expectedVersion: number; dragToken: string }[] = [];
    let reads = 0;
    let renewals = 0;
    globalThis.fetch = async (_url, init) => {
      if (init?.method !== "PATCH") {
        reads++;
        return Response.json(latest);
      }
      bodies.push(JSON.parse(String(init.body)));
      if (bodies.length === 1 || outcome === "second-conflict")
        return Response.json(
          { code: outcome === "locked" ? "SEATING_PLACE_LOCKED" : "CONCURRENCY_CONFLICT" },
          { status: 409 },
        );
      return Response.json({ ...latest, version: 3 });
    };
    const api = createApiClient("https://api.test/api", {
      getToken: async () => "access",
      getGeneration: () => 1,
      recover: async () => null,
      clear: () => {},
    });
    const pending = moveSeatingWithRetry(api, "w", source, move, "lease-secret", async () => {
      renewals++;
      if (outcome === "lease-lost") throw new Error("SEATING_DRAG_EXPIRED");
    });
    if (outcome === "success") assert.equal((await pending).version, 3);
    else
      await assert.rejects(pending, outcome === "lease-lost" ? /SEATING_DRAG_EXPIRED/ : ApiError);
    const retried = outcome === "success" || outcome === "second-conflict";
    assert.deepEqual(
      bodies.map((body) => body.expectedVersion),
      retried ? [1, 2] : [1],
    );
    assert.ok(bodies.every((body) => body.dragToken === "lease-secret"));
    assert.equal(reads, outcome === "locked" ? 0 : 1);
    assert.equal(renewals, outcome === "locked" || outcome === "source-changed" ? 0 : 1);
  });
}
