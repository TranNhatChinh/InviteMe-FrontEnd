import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  coupleExamples,
  coupleHeaders,
  coupleCsv,
  parseCoupleCsv,
  validateCoupleRows,
} from "../src/features/guests/utils/couple-import";
const header = coupleHeaders.join(",");
test("optional contacts allow blanks, preserve phone zero and validate provided values", () => {
  for (const [phone, email] of [
    ["", ""],
    ["0900123456", "nam@example.com"],
    ["+84 900-123-456", "nam+invite@example.com"],
  ]) {
    const [row] = validateCoupleRows([
      { line: 12, values: ["Nam", "Anh", "1", "Chung", "", phone!, "", email!] },
    ]);
    assert.deepEqual(row?.errors, []);
    assert.equal(row?.values[5], phone);
    assert.equal(row?.values[7], email);
  }
  for (const phone of ["abc", "123", "1234567890123456", "++84900123456", "=1234567"]) {
    const [row] = validateCoupleRows([
      { line: 12, values: ["Nam", "", "1", "Chung", "", phone, "", ""] },
    ]);
    assert.ok(row?.errors.some((error) => error.includes("SĐT")));
    assert.equal(row?.expected, null);
  }
  for (const email of [
    "nam",
    "nam@",
    "nam@@example.com",
    "@example.com",
    "a".repeat(250) + "@example.com",
  ]) {
    const [row] = validateCoupleRows([
      { line: 12, values: ["Nam", "", "1", "Chung", "", "", "", email] },
    ]);
    assert.ok(row?.errors.some((error) => error.includes("Email")));
  }
});
test("old eight-column CSV still imports with no email", () => {
  const [row] = parseCoupleCsv(
    "Tên người nhận,Danh xưng,Kiểu lời mời,Tổng người dự kiến,Phía khách mời,Nhóm khách,SĐT,Ghi chú\nNam,Anh,Cá nhân,1,Chung,,0900123456,",
  );
  assert.equal(row?.values[7], "");
  assert.deepEqual(row?.errors, []);
});
test("download matches the displayed example: five recipients and ten expected places", () => {
  const rows = parseCoupleCsv(
    readFileSync(new URL("../public/templates/khach-moi.csv", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    rows.map((row) => row.values),
    coupleExamples,
  );
  assert.equal(
    rows.reduce((sum, row) => sum + row.expected!, 0),
    10,
  );
  assert.ok(rows.every((row) => row.errors.length === 0));
});
test("empty headcount defaults visibly to one and keeps phone leading zeros", () => {
  const [row] = parseCoupleCsv(`${header}\r\nAn,Bác,,Nhà gái,Họ hàng,0900123456,`);
  assert.equal(row?.expected, 1);
  assert.equal(row?.defaulted, true);
  assert.equal(row?.values[5], "0900123456");
});
test("quoted commas, linebreaks and escaped quotes do not create extra recipients", () => {
  const rows = parseCoupleCsv(
    `${header}\nAn,Bác,4,Nhà gái,Họ ngoại,,"Cần ghế, gần lối ra\nGọi \"\"An\"\""\nHoa,Cô,2,Nhà gái,Họ ngoại,,`,
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.values[6], 'Cần ghế, gần lối ra Gọi "An"');
  assert.equal(rows[1]?.line, 4);
});
test("invalid headcounts and row shapes are not included in expected totals", () => {
  for (const value of ["0", "-2", "1.5", "2 người", "9007199254740992"]) {
    const [row] = parseCoupleCsv(`${header}\nAn,Bác,${value},Nhà gái,,,`);
    assert.equal(row?.expected, null);
    assert.ok(row?.errors.length);
  }
  assert.ok(parseCoupleCsv(`${header}\nAn,Bác,2`)[0]?.errors.length);
});
test("duplicate recipients are warned but never silently merged", () => {
  const rows = parseCoupleCsv(
    `${header}\nAn,Bác,2,Nhà gái,,0900123456,\nAn,Bác,3,Nhà gái,,0900123456,`,
  );
  assert.equal(rows.length, 2);
  assert.ok(rows[1]?.warnings.length);
  assert.equal(rows[1]?.expected, 3);
});
test("wrong templates, broken quoting and empty data are rejected", () => {
  assert.throws(() => parseCoupleCsv("Họ và tên,Vai trò\nAn,PRIMARY"));
  assert.throws(() => parseCoupleCsv(`${header}\nAn,Bác,2,Nhà gái,,,"broken`));
  assert.throws(() => parseCoupleCsv(header));
});

test("a legacy invitation type column is ignored without shifting the other fields", () => {
  const columns = [...coupleHeaders.slice(0, 2), "Kiểu lời mời", ...coupleHeaders.slice(2)];
  const [row] = parseCoupleCsv(
    coupleCsv([
      columns,
      [
        "An",
        "Bác",
        "Giá trị cũ",
        4,
        "Nhà gái",
        "Họ hàng",
        "0900123456",
        "Ghi chú",
        "an@example.com",
      ],
    ]),
  );
  assert.deepEqual(row?.errors, []);
  assert.deepEqual(row?.values, [
    "An",
    "Bác",
    "4",
    "Nhà gái",
    "Họ hàng",
    "0900123456",
    "Ghi chú",
    "an@example.com",
  ]);
});

test("a non-catalog group remains invalid instead of silently becoming OTHER", () => {
  const [row] = parseCoupleCsv(
    "Tên người nhận,Danh xưng,Tổng người dự kiến,Nhóm khách,SĐT,Ghi chú\nAn,Bác,4,Họ ngoại,,",
  );
  assert.equal(row?.expected, null);
  assert.equal(row?.values[2], "4");
  assert.equal(row?.values[3], "");
  assert.equal(row?.values[4], "Họ ngoại");
  assert.ok(row?.warnings.length);
  assert.ok(row?.errors.length);
});
