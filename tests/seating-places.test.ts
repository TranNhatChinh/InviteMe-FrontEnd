import assert from "node:assert/strict";
import test from "node:test";
import { placeNeedsSeat } from "../src/features/guests/utils/seating-places";

const place = (attendanceStatus?: string) => ({
  id: "p1",
  guestId: "g1",
  position: 2,
  person: attendanceStatus
    ? { id: "u1", fullName: "Khách", role: "COMPANION", attendanceStatus }
    : null,
});

test("an empty place needs a seat until the invitation answers Có / Không", () => {
  assert.equal(placeNeedsSeat(place(), { rsvpStatus: "PENDING" }), true);
  assert.equal(placeNeedsSeat(place(), {}), true);
  assert.equal(placeNeedsSeat(place(), { rsvpStatus: "ATTENDING" }), false);
  assert.equal(placeNeedsSeat(place(), { rsvpStatus: "DECLINED" }), false);
});

test("a person needs a seat unless they declined", () => {
  assert.equal(placeNeedsSeat(place("ATTENDING"), { rsvpStatus: "ATTENDING" }), true);
  assert.equal(placeNeedsSeat(place("PENDING"), { rsvpStatus: "PENDING" }), true);
  assert.equal(placeNeedsSeat(place("DECLINED"), { rsvpStatus: "ATTENDING" }), false);
});
