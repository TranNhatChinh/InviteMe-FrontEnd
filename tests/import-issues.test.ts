import test from "node:test";
import assert from "node:assert/strict";
import { createInstance } from "i18next";
import { normalizeHttpError } from "../src/core/api/api-error";
import { importIssueText, issuesByRow } from "../src/features/guests/utils/import-issues";
import { resources } from "../src/i18n/resources";

async function translator(lng: "vi" | "en") {
  const i18n = createInstance();
  await i18n.init({ lng, resources, interpolation: { escapeValue: false } });
  return i18n.getFixedT(lng, "guestPlanning", "importPage");
}

test("import issues keep the row and guest details from the BE message", async () => {
  const en = await translator("en");
  assert.equal(
    importIssueText(
      {
        rowNumber: 4,
        field: "phone",
        code: "PHONE_ALREADY_EXISTS",
        message: "SĐT đã có ở khách «Nguyễn Văn An».",
      },
      en,
    ),
    "This phone number already belongs to “Nguyễn Văn An”. Change it or remove the row.",
  );
  assert.equal(
    importIssueText(
      {
        rowNumber: 5,
        field: "email",
        code: "DUPLICATE_EMAIL_IN_FILE",
        message: "Email trùng với dòng 3.",
      },
      en,
    ),
    "Same email as row 3. Each email belongs to one invitation.",
  );
});

test("validator codes are translated per field instead of showing FluentValidation text", async () => {
  const vi = await translator("vi");
  assert.match(
    importIssueText(
      {
        rowNumber: 2,
        field: "recipientName",
        code: "INVALID_TEXT",
        message: "The specified condition was not met for 'Recipient Name'.",
      },
      vi,
    ),
    /^Tên người nhận cần từ 1 đến 150 ký tự/,
  );
});

test("unknown codes fall back to the BE message and whole-file issues stay on row 0", async () => {
  const vi = await translator("vi");
  const map = issuesByRow(
    [
      { rowNumber: 0, field: "rows", code: "INVALID_ROWS", message: "x" },
      { rowNumber: 7, field: "group", code: "SOMETHING_NEW", message: "Nhóm bị khóa." },
    ],
    vi,
  );
  assert.deepEqual(map[0], ["File cần từ 1 đến 500 dòng khách."]);
  assert.deepEqual(map[7], ["Nhóm bị khóa."]);
});

test("422 import responses keep each row issue's code and message", () => {
  const error = normalizeHttpError(422, {
    code: "IMPORT_VALIDATION_FAILED",
    errors: [
      { rowNumber: 3, field: "phone", code: "PHONE_ALREADY_EXISTS", message: "SĐT đã có ở khách «An»." },
      { rowNumber: 4, field: "secret", code: "X", message: "ignored" },
    ],
  });
  assert.deepEqual(error.rowIssues, [
    { rowNumber: 3, field: "phone", code: "PHONE_ALREADY_EXISTS", message: "SĐT đã có ở khách «An»." },
  ]);
});
