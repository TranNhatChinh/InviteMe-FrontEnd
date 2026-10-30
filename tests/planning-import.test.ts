import test from "node:test";
import assert from "node:assert/strict";
import {
  importBody,
  planningGuestCreateSchema,
  planningGuestUpdateSchema,
} from "../src/features/guests/api/planning.api";
import { validateCoupleRows } from "../src/features/guests/utils/couple-import";
import { normalizeHttpError } from "../src/core/api/api-error";
test("contact columns are mapped to backend and email errors retain spreadsheet row", () => {
  const rows = validateCoupleRows([
    {
      line: 17,
      values: ["Nam", "Anh", "Cá nhân", "1", "Chung", "", "0900123456", "", "nam@example.com"],
    },
  ]);
  const row = importBody(rows).rows[0];
  assert.equal(row?.phone, "0900123456");
  assert.equal(row?.email, "nam@example.com");
  const error = normalizeHttpError(422, {
    errors: [{ rowNumber: 17, field: "email", code: "INVALID_EMAIL", message: "unsafe" }],
  });
  assert.deepEqual(Object.keys(error.fieldErrors), ["rows.17.email"]);
});

test("import maps expected places including primary, explicit side and family without fabricating companions", () => {
  const rows = validateCoupleRows([
    {
      line: 8,
      values: ["Nguyễn Văn An", "Bác", "Gia đình", "4", "Nhà gái", "Họ ngoại", "", "Hai trẻ nhỏ"],
    },
  ]);
  assert.deepEqual(importBody(rows), {
    rows: [
      {
        rowNumber: 8,
        recipientName: "Nguyễn Văn An",
        honorific: "Bác",
        invitationKind: "FAMILY",
        expectedPeople: 4,
        side: "BRIDE",
        group: { newName: "Họ ngoại", confirmed: true },
        phone: null,
        email: null,
        note: "Hai trẻ nhỏ",
      },
    ],
  });
});
test("missing side stays unspecified, group optional, count includes representative", () => {
  const rows = validateCoupleRows([{ line: 2, values: ["Hoa", "", "", "", "", "", "", ""] }]);
  const row = importBody(rows).rows[0];
  assert.equal(row?.side, "UNSPECIFIED");
  assert.equal(row?.expectedPeople, 1);
  assert.equal(row?.group, null);
});
test("row errors preserve only allowed row and field metadata, never backend message", () => {
  const error = normalizeHttpError(422, {
    errors: [
      { rowNumber: 8, field: "expectedPeople", message: "secret database detail" },
      { rowNumber: 9, field: "unexpectedField" },
    ],
  });
  assert.deepEqual(Object.keys(error.fieldErrors), ["rows.8.expectedPeople"]);
  assert.doesNotMatch(JSON.stringify(error.fieldErrors), /secret/);
});

test("manual create and edit share the backend phone validation rules", () => {
  const create = {
    recipientName: "Khách",
    honorific: null,
    invitationKind: "INDIVIDUAL" as const,
    expectedPeople: 1,
    side: "UNSPECIFIED" as const,
    groupId: null,
    phone: "+84 (900) 123-456",
    note: null,
    email: null,
  };
  const update = { ...create, expectedVersion: 1 };
  assert.equal(planningGuestCreateSchema.safeParse(create).success, true);
  assert.equal(planningGuestUpdateSchema.safeParse(update).success, true);
  assert.equal(
    planningGuestCreateSchema.safeParse({ ...create, phone: "0900abc123" }).success,
    false,
  );
  assert.equal(
    planningGuestUpdateSchema.safeParse({ ...update, phone: "0900abc123" }).success,
    false,
  );
});

test("group scope validation errors are recognized without exposing backend messages", () => {
  const error = normalizeHttpError(400, { errors: { GroupId: ["sensitive details"] } });
  assert.deepEqual(error.fieldErrors.GroupId, ["Please check this value."]);
  assert.doesNotMatch(JSON.stringify(error.fieldErrors), /sensitive/);
});
