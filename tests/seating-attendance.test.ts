import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chairAppearance,
  exampleSeatPeople,
  initialSeatPeople,
  placeKey,
  setPlacePerson,
  tablePlaces,
} from "../src/features/guests/utils/seating-attendance";
import { movePlaces, type SeatingParty } from "../src/features/guests/utils/seating-demo";

const party: SeatingParty = {
  id: "A",
  name: "Nguyễn Văn An",
  address: "Bác",
  count: 4,
  group: "Họ ngoại",
  note: "",
};

test("import creates only a known pending representative, never named companion placeholders", () => {
  const people = initialSeatPeople([party]);
  assert.equal(Object.keys(people).length, 1);
  assert.equal(people[placeKey("A", 0)]?.fullName, party.name);
  assert.equal(people[placeKey("A", 0)]?.attendanceStatus, "PENDING");
  assert.equal(people[placeKey("A", 1)], undefined);
});

test("only confirmed attendance is green; declined, waitlisted, pending and unnamed remain unconfirmed", () => {
  for (const status of ["PENDING", "DECLINED", "WAITLISTED"] as const) {
    const person = {
      id: "person",
      fullName: "An",
      type: "PRIMARY" as const,
      attendanceStatus: status,
    };
    assert.equal(chairAppearance(person).confirmed, false);
    assert.equal(chairAppearance(person).asset, "chair-pending.svg");
  }
  assert.equal(chairAppearance().confirmed, false);
  assert.equal(
    chairAppearance({
      id: "person",
      fullName: "An",
      type: "PRIMARY",
      attendanceStatus: "ATTENDING",
    }).asset,
    "chair-confirmed.svg",
  );
});

test("confirming the representative does not confirm or create companions", () => {
  const pending = initialSeatPeople([party]);
  const confirmed = setPlacePerson(pending, party, 0, {
    fullName: party.name,
    type: "PRIMARY",
    attendanceStatus: "ATTENDING",
  });
  assert.equal(
    Object.values(confirmed).filter((person) => person.attendanceStatus === "ATTENDING").length,
    1,
  );
  assert.equal(chairAppearance(confirmed[placeKey("A", 1)]).confirmed, false);
  assert.equal(pending[placeKey("A", 0)]?.attendanceStatus, "PENDING");
});

test("adding a companion requires a name and does not change party size or create a second representative", () => {
  const people = initialSeatPeople([party]);
  assert.throws(() =>
    setPlacePerson(people, party, 1, {
      fullName: " ",
      type: "OTHER",
      attendanceStatus: "ATTENDING",
    }),
  );
  assert.throws(() =>
    setPlacePerson(people, party, 1, {
      fullName: party.name,
      type: "PRIMARY",
      attendanceStatus: "ATTENDING",
    }),
  );
  assert.throws(() =>
    setPlacePerson(people, party, 4, {
      fullName: "Bình",
      type: "SPOUSE",
      attendanceStatus: "ATTENDING",
    }),
  );
  const updated = setPlacePerson(people, party, 1, {
    fullName: "Trần Thị Bình",
    type: "SPOUSE",
    attendanceStatus: "ATTENDING",
  });
  assert.equal(party.count, 4);
  assert.equal(Object.keys(updated).length, 2);
});

test("person identity and RSVP follow a reserved place when moving to another table", () => {
  const people = exampleSeatPeople([party]);
  const plan = { A: [0, 0, 0, 0] };
  const moved = movePlaces(plan, "A", 1, 10, 2, 0);
  assert.ok(moved);
  const destination = tablePlaces([party], moved, 1);
  assert.equal(destination.length, 1);
  const entry = destination[0];
  assert.ok(entry);
  assert.equal(people[placeKey(entry.party.id, entry.place)]?.fullName, party.name);
  assert.equal(people[placeKey(entry.party.id, entry.place)]?.attendanceStatus, "ATTENDING");
  assert.equal(tablePlaces([party], moved, 0).length, 3);
});
