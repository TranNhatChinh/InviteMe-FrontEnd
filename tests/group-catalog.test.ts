import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultGroups, findGroup } from "../src/features/guests/utils/group-catalog";
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

test("only six fixed groups are selectable", () => {
  assert.deepEqual(defaultGroups, [
    "Họ hàng",
    "Bạn bè",
    "Đồng nghiệp",
    "Đối tác",
    "Hàng xóm",
    "Khác",
  ]);
  assert.equal(findGroup("  HỌ   HÀNG ", defaultGroups), "Họ hàng");
  assert.equal(findGroup("Bạn bè cũ", defaultGroups), undefined);
});
test("invalid sides fail validation; blank stays unknown; editing side clears only its validation error", () => {
  const rows = parseCoupleCsv(
    `${coupleHeaders.join(",")}\nAn,Bác,Gia đình,4,Nhà sai,Họ hàng,,\nHoa,Cô,Cá nhân,1,,Họ hàng,,`,
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
    assert.ok(rows.every((row) => !row.values[5] || !!findGroup(row.values[5], defaultGroups)));
  }
});
test("the same group label on opposite wedding sides never becomes one affinity group or table", () => {
  const rows = parseCoupleCsv(
    `${coupleHeaders.join(",")}\nAn,Bác,Gia đình,4,Nhà gái,Họ hàng,,\nHoa,Cô,Gia đình,2,Nhà trai,Họ hàng,,`,
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
  assert.equal(rows.filter((row) => !findGroup(row.values[5] ?? "", defaultGroups)).length, 0);
});
