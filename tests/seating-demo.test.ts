import { test } from "node:test";
import assert from "node:assert/strict";
import {
  movePlaces,
  recipientLabel,
  suggestSeating,
  tableOccupancy,
  type SeatingParty,
  type SeatingStrategy,
} from "../src/features/guests/utils/seating-demo";
const party = (id: string, count: number, group = "Họ ngoại"): SeatingParty => ({
  id,
  name: id,
  address: "Bác",
  count,
  group,
  note: "",
});

test("each strategy preserves counts and capacities without mutating an existing arrangement", () => {
  const parties = [
    party("A", 4, "Họ ngoại"),
    party("B", 3, "Bạn học"),
    party("C", 2, "Họ ngoại"),
    party("D", 1, "Bạn học"),
  ];
  const current = suggestSeating(parties, 6, 2, "affinity");
  const saved = JSON.stringify(current);
  for (const strategy of ["affinity", "party", "compact"] satisfies SeatingStrategy[]) {
    const proposed = suggestSeating(parties, 6, 2, strategy);
    assert.equal(Object.values(proposed).flat().length, 10);
    assert.ok([0, 1].every((table) => tableOccupancy(proposed, table) <= 6));
    assert.ok(Object.values(proposed).every((places) => new Set(places).size === 1));
    assert.equal(JSON.stringify(current), saved);
  }
});

test("affinity and invitation-order strategies use different grouping priorities", () => {
  const parties = [
    party("A", 3, "Họ ngoại"),
    party("B", 3, "Bạn học"),
    party("C", 3, "Họ ngoại"),
    party("D", 1, "Bạn học"),
  ];
  const affinity = suggestSeating(parties, 6, 2, "affinity");
  const invitation = suggestSeating(parties, 6, 2, "party");
  assert.equal(affinity.A?.[0], affinity.C?.[0]);
  assert.equal(invitation.A?.[0], 0);
  assert.equal(invitation.B?.[0], 0);
  assert.equal(invitation.C?.[0], 1);
  assert.notDeepEqual(affinity, invitation);
});

test("suggestion preserves all reserved places, keeps parties together and respects capacities", () => {
  const parties = [
    party("A", 4),
    party("B", 2),
    party("C", 2, "Đại học"),
    party("D", 1, "Đại học"),
    party("E", 1, "Công ty"),
  ];
  const plan = suggestSeating(parties, 6, 2);
  assert.equal(Object.values(plan).flat().length, 10);
  assert.ok(Object.values(plan).every((places) => new Set(places).size === 1));
  assert.ok([0, 1].every((table) => tableOccupancy(plan, table) <= 6));
  assert.equal(plan.A?.[0], plan.B?.[0]);
});
test("oversized parties stay unplaced until explicitly split", () => {
  const plan = suggestSeating([party("A", 7)], 6, 2);
  assert.ok(plan.A?.every((value) => value === null));
  const split = movePlaces(plan, "A", 0, 6, 2, 0);
  assert.equal(split?.A?.filter((value) => value === 0).length, 1);
  assert.equal(split?.A?.filter((value) => value === null).length, 6);
});

test("a small affinity group stays together instead of filling the last two seats of another table", () => {
  const parties = [
    party("A", 4, "Họ ngoại"),
    party("B", 2, "Họ ngoại"),
    party("C", 2, "Họ ngoại"),
    party("D", 2, "Bạn đại học"),
    party("E", 1, "Bạn đại học"),
    party("F", 3, "Công ty"),
    party("G", 3, "Họ nội"),
    party("H", 2, "Bạn cấp 3"),
    party("I", 1, "Thầy cô"),
  ];
  const plan = suggestSeating(parties, 10, 2);
  assert.equal(plan.D?.[0], plan.E?.[0]);
  assert.equal(
    Object.values(plan)
      .flat()
      .filter((table) => table !== null).length,
    20,
  );
});
test("moving one reserved place splits a party without creating or losing attendees", () => {
  const plan = { A: [0, 0, 0, 0], B: [1, 1] };
  const moved = movePlaces(plan, "A", 1, 6, 2, 2);
  assert.deepEqual(moved?.A, [0, 0, 1, 0]);
  assert.equal(Object.values(moved ?? {}).flat().length, 6);
  assert.deepEqual(plan.A, [0, 0, 0, 0]);
});
test("full tables reject moves while moving a party to its own table remains valid", () => {
  const plan = { A: [0, 0, 0, 0], B: [1, 1, 1] };
  assert.equal(movePlaces(plan, "A", 1, 6, 2), null);
  assert.ok(movePlaces(plan, "A", 0, 6, 2));
  assert.equal(movePlaces(plan, "A", 3, 6, 2), null);
});
test("recipient rendering uses the guest honorific when present", () => {
  assert.equal(recipientLabel(party("Nguyễn Văn An", 4)), "Bác Nguyễn Văn An");
  assert.equal(recipientLabel(party("Nhóm bạn K45", 6)), "Bác Nhóm bạn K45");
  assert.equal(recipientLabel({ ...party("Nhóm bạn K45", 6), address: "" }), "Nhóm bạn K45");
});
