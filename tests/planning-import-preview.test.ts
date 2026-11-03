import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCoupleRows,
  coupleHeaders,
  parseCoupleCsv,
  coupleCsv,
  parseCoupleSheet,
} from "../src/features/guests/utils/couple-import";
import { importActions, importSummary } from "../src/features/guests/utils/planning-import-review";
import {
  checkImportGuests,
  importBody,
  importGuests,
  type PlanningImportPreview,
  type PlanningImportCommit,
} from "../src/features/guests/api/planning.api";
import type { ApiClient } from "../src/core/api/api-client";

const row = (line = 2, count = "4") => ({
  line,
  values: [
    "Nguyễn Văn An",
    "Bác",
    "Gia đình",
    count,
    "Nhà gái",
    "Họ hàng",
    "0912345678",
    "Có trẻ nhỏ",
    "an@example.com",
  ],
});
const preview: PlanningImportPreview = {
  previewToken: "signed",
  expiresAt: "2099-01-01T00:00:00Z",
  quotaRemaining: 3,
  proposedPlaces: 6,
  errors: [],
  rows: [
    {
      rowNumber: 2,
      status: "NEED_DECISION",
      reasons: ["EXACT_DUPLICATE_IN_WEDDING"],
      matches: [],
      matchCount: 1,
    },
    { rowNumber: 8, status: "WARNING", reasons: ["SHARED_PHONE"], matches: [], matchCount: 1 },
  ],
};
test("BR01 at most 500 nonblank rows are accepted", () => {
  const data = Array.from({ length: 500 }, (_, index) => row(index + 2).values);
  assert.equal(parseCoupleCsv(coupleCsv([coupleHeaders, ...data])).length, 500);
  assert.throws(() => parseCoupleCsv(coupleCsv([coupleHeaders, ...data, row(502).values])));
});

test("BR04 validation rejects every text/count boundary before check", () => {
  for (const [column, value] of [
    [0, "a".repeat(151)],
    [1, "a".repeat(51)],
    [7, "a".repeat(2001)],
    [3, "501"],
    [3, "0"],
    [3, "1.5"],
    [6, "bad"],
    [8, "not-email"],
    [5, "Custom group"],
    [0, "=SUM(A1)"],
  ] as const) {
    const input = row();
    input.values[column] = value;
    const rows = validateCoupleRows([input]);
    assert.ok(rows[0]!.errors.length, `${column}: ${value.slice(0, 20)}`);
    assert.throws(() => importBody(rows));
  }
});
test("BR06 unknown group stays visible and is never silently changed to OTHER", () => {
  const input = row();
  input.values[5] = "Họ ngoại";
  const rows = validateCoupleRows([input]);
  assert.equal(rows[0]?.values[5], "Họ ngoại");
  assert.ok(rows[0]?.errors.length);
});
test("BR05 defaults are visible and kind errors survive a second validation", () => {
  const values = ["An", "", "", "", "", "", "", "", ""];
  const rows = validateCoupleRows([{ line: 17, values }]);
  assert.ok(rows[0]!.warnings.length >= 4);
  assert.equal(importBody(rows).rows[0]?.invitationKind, "INDIVIDUAL");
  assert.equal(importBody(rows).rows[0]?.group, "OTHER");
  const invalid = row();
  invalid.values[2] = "Sai kiểu";
  assert.ok(validateCoupleRows(validateCoupleRows([invalid]))[0]!.errors.length);
});
test("BR09 BR14 unresolved rows block confirmation and skip changes only new quota", () => {
  const rows = validateCoupleRows([row(), row(8, "2")]);
  const actions = importActions(preview);
  assert.equal(actions[2], undefined);
  assert.equal(actions[8], "CREATE_SEPARATE");
  assert.equal(importSummary(rows, preview, actions).unresolved, 1);
  const skip = importSummary(rows, preview, { ...actions, 2: "SKIP" });
  assert.deepEqual(skip, { created: 1, skipped: 1, unresolved: 0, places: 2, overQuota: false });
  assert.equal(importSummary(rows, preview, { ...actions, 2: "CREATE_SEPARATE" }).overQuota, true);
});
test("BR03 exclusion preserves original Excel row numbers and sends only explicitly selected rows", () => {
  const broken = row(17);
  broken.values[8] = "bad";
  const parsed = validateCoupleRows([row(2), broken, row(28, "2")]);
  const excluded = new Set([17]);
  assert.deepEqual(
    importBody(parsed.filter((r) => !excluded.has(r.line))).rows.map((r) => r.rowNumber),
    [2, 28],
  );
});
test("BR02 blank records and quoted multiline cells preserve physical CSV source row numbers", () => {
  const csv = coupleCsv([coupleHeaders, row().values, [""], row(8).values]);
  const rows = parseCoupleCsv(csv);
  assert.deepEqual(
    rows.map((r) => r.line),
    [2, 4],
  );
});
test("BR02 XLSX row numbers stay exact even with blank rows and multiline notes", () => {
  const first = row().values;
  first[7] = "Dòng ghi chú 1\nDòng ghi chú 2";
  const parsed = parseCoupleSheet([[...coupleHeaders], first, [], row(4).values]);
  assert.deepEqual(
    parsed.map((r) => r.line),
    [2, 4],
  );
  assert.equal(parsed[0]?.values[7], "Dòng ghi chú 1 Dòng ghi chú 2");
});
test("check is read-only API and commit carries token, decisions and the exact retry key", async () => {
  const calls: { path: string; options: Record<string, unknown> }[] = [];
  const api = {
    request: async (path: string, options: Record<string, unknown>) => {
      calls.push({ path, options });
      return preview;
    },
  } as unknown as ApiClient;
  const rows = validateCoupleRows([row()]);
  await checkImportGuests(api, "wedding", rows);
  assert.equal(calls[0]?.path, "/weddings/wedding/guest-planning/imports/check");
  const body: PlanningImportCommit = {
    ...importBody(rows),
    previewToken: "signed",
    decisions: [{ rowNumber: 2, action: "SKIP" }],
  };
  await importGuests(api, "wedding", body, "same-key");
  await importGuests(api, "wedding", body, "same-key");
  assert.deepEqual(calls[1]?.options, calls[2]?.options);
  assert.deepEqual(calls[1]?.options.headers, { "Idempotency-Key": "same-key" });
  assert.equal((calls[1]?.options.body as PlanningImportCommit).decisions[0]?.action, "SKIP");
});
