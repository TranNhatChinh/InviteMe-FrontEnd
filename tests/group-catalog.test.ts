import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addGroup,
  defaultGroups,
  findGroup,
  groupReviewKey,
  groupSuggestions,
  resolveGroupRows,
  unknownGroups,
} from "../src/features/guests/utils/group-catalog";
import {
  coupleHeaders,
  parseCoupleCsv,
  validateCoupleRows,
} from "../src/features/guests/utils/couple-import";
import { readCoupleFile } from "../src/features/guests/utils/read-couple-file";
import {
  seatingParties,
  suggestSeating,
  recommendedTableCount,
} from "../src/features/guests/utils/seating-demo";

test("normalization accepts case/spacing but never automatically corrects misspellings", () => {
  assert.equal(findGroup("  HỌ   NGOẠI ", defaultGroups), "Họ ngoại");
  assert.equal(findGroup("Bạn đai học", defaultGroups), undefined);
  assert.ok(groupSuggestions("Bạn đai học", defaultGroups).includes("Bạn đại học"));
});
test("unknown labels require explicit mapping or creation; side is preserved", () => {
  const rows = parseCoupleCsv(
    readFileSync(new URL("../public/templates/khach-moi-can-xu-ly.csv", import.meta.url), "utf8"),
  );
  assert.equal(unknownGroups(rows, defaultGroups).length, 2);
  const mapped = resolveGroupRows(
    rows,
    groupReviewKey("Nhà gái", "Bạn đai học"),
    "Bạn đại học",
    defaultGroups,
  );
  assert.equal(mapped[2]?.values[5], "Bạn đại học");
  assert.equal(mapped[2]?.values[4], "Nhà gái");
  assert.equal(unknownGroups(mapped, defaultGroups).length, 1);
  assert.equal(rows[2]?.values[5], "Bạn đai học");
  const created = addGroup(defaultGroups, " Công ty ABC ");
  const resolved = resolveGroupRows(
    mapped,
    groupReviewKey("Nhà trai", "Công ty ABC"),
    created.label,
    created.catalog,
  );
  assert.equal(unknownGroups(resolved, created.catalog).length, 0);
  assert.throws(() =>
    resolveGroupRows(rows, groupReviewKey("Nhà gái", "Bạn đai học"), "Chưa tạo", defaultGroups),
  );
});
test("custom group names are validated and repeated names are not duplicated", () => {
  assert.throws(() => addGroup(defaultGroups, " "));
  assert.throws(() => addGroup(defaultGroups, "=SUM(A1:A2)"));
  assert.throws(() => addGroup(defaultGroups, "a".repeat(101)));
  assert.equal(addGroup(defaultGroups, "HỌ NGOẠI").catalog.length, defaultGroups.length);
});
test("invalid sides fail validation; blank stays unknown; editing side clears only its validation error", () => {
  const rows = parseCoupleCsv(
    `${coupleHeaders.join(",")}\nAn,Bác,Gia đình,4,Nhà sai,Họ ngoại,,\nHoa,Cô,Cá nhân,1,,Họ ngoại,,`,
  );
  assert.ok(rows[0]?.errors.some((error) => error.includes("Phía khách mời")));
  assert.equal(rows[1]?.values[4], "");
  assert.ok(rows[1]?.warnings.length);
  const edited = rows.map((row) => ({ ...row, values: [...row.values] }));
  if (edited[0]) edited[0].values[4] = "Nhà gái";
  const checked = validateCoupleRows(edited);
  assert.equal(checked[0]?.errors.length, 0);
  assert.equal(checked[0]?.expected, 4);
  assert.equal(checked[0]?.line, 2);
});
test("all sample counts remain correct and all non-test groups are known", () => {
  for (const [file, count] of [
    ["khach-moi.csv", 10],
    ["khach-moi-20-nguoi.csv", 20],
    ["khach-moi-30-nguoi.csv", 30],
    ["khach-moi-100-nguoi.csv", 100],
  ] as const) {
    const rows = parseCoupleCsv(
      readFileSync(new URL(`../public/templates/${file}`, import.meta.url), "utf8"),
    );
    assert.ok(rows.every((row) => row.errors.length === 0));
    assert.equal(
      rows.reduce((sum, row) => sum + (row.expected ?? 0), 0),
      count,
    );
    assert.equal(unknownGroups(rows, defaultGroups).length, 0);
  }
});
test("the same group label on opposite wedding sides never becomes one affinity group or table", () => {
  const rows = parseCoupleCsv(
    `${coupleHeaders.join(",")}\nAn,Bác,Gia đình,4,Nhà gái,Họ ngoại,,\nHoa,Cô,Gia đình,2,Nhà trai,Họ ngoại,,`,
  );
  const parties = seatingParties(rows);
  assert.equal(recommendedTableCount(parties, 10), 2);
  for (const mode of ["affinity", "party", "compact"] as const) {
    const plan = suggestSeating(parties, 10, 2, mode);
    assert.notEqual(plan["2"]?.[0], plan["3"]?.[0]);
  }
});
test("Excel template can be read directly and has the same five contacts and ten expected places", async () => {
  const bytes = Uint8Array.from(
    readFileSync(new URL("../public/templates/khach-moi.xlsx", import.meta.url)),
  );
  const rows = await readCoupleFile(new File([bytes], "khach-moi.xlsx"));
  assert.equal(rows.length, 5);
  assert.ok(rows.every((row) => !row.errors.length));
  assert.equal(
    rows.reduce((sum, row) => sum + (row.expected ?? 0), 0),
    10,
  );
  assert.equal(unknownGroups(rows, defaultGroups).length, 0);
});
