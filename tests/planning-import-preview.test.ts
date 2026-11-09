import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCoupleRows,
  coupleHeaders,
  parseCoupleCsv,
  coupleCsv,
  parseCoupleSheet,
} from "../src/features/guests/utils/couple-import";
import {
  importActions,
  importSummary,
  importRowStatus,
} from "../src/features/guests/utils/planning-import-review";
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

test("V2 UPDATE status, delta quota and error priority", () => {
  const rows = validateCoupleRows([row(), row(8, "2")]);
  const value = {
    ...preview,
    updates: [
      {
        rowNumber: 2,
        guestId: "guest",
        fields: ["expectedPeople"],
        noChange: false,
        placeDelta: 2,
        errors: [],
        warnings: [],
      },
    ],
  };
  const actions = { 2: "UPDATE", 8: "CREATE_SEPARATE" } as const;
  assert.equal(importRowStatus(rows[0]!, value, actions, new Set()), "UPDATE");
  assert.equal(importSummary(rows, value, actions).updated, 1);
  assert.equal(importSummary(rows, value, actions).places, 4);
  assert.equal(importSummary(rows, value, actions).overQuota, true);
  assert.equal(importSummary(rows, value, { ...actions, 2: "SKIP" }).places, 2);
  assert.equal(
    importRowStatus(
      rows[0]!,
      {
        ...value,
        errors: [
          { rowNumber: 2, field: "side", code: "SIDE_LOCKED_BY_SEATING", message: "Locked" },
        ],
      },
      actions,
      new Set(),
    ),
    "ERROR",
  );
});

test("V2 blank Excel preserves absence; explicit one and OTHER remain updateable", () => {
  const blank = validateCoupleRows([{ line: 2, values: ["An", "", "", "", "", "", "", ""] }]);
  const missing = importBody(blank).rows[0]!;
  assert.equal(missing.side, null);
  assert.equal(missing.group, null);
  assert.equal(missing.expectedPeople, null);
  const explicit = validateCoupleRows([
    { line: 2, values: ["An", "", "1", "Chung", "Khác", "", "", ""] },
  ]);
  const values = importBody(explicit).rows[0]!;
  assert.equal(values.side, "MUTUAL");
  assert.equal(values.group, "OTHER");
  assert.equal(values.expectedPeople, 1);
});
test("BR01 at most 500 nonblank rows are accepted", () => {
  const data = Array.from({ length: 500 }, (_, index) => row(index + 2).values);
  assert.equal(parseCoupleCsv(coupleCsv([coupleHeaders, ...data])).length, 500);
  assert.throws(() => parseCoupleCsv(coupleCsv([coupleHeaders, ...data, row(502).values])));
});

test("each imported guest allows one to ten places independently of the row limit", () => {
  for (const count of ["1", "10"]) {
    const [result] = validateCoupleRows([row(2, count)]);
    assert.deepEqual(result!.errors, []);
  }
  for (const count of ["0", "11", "500", "1.5"]) {
    const [result] = validateCoupleRows([row(2, count)]);
    assert.ok(result!.errors.some((message) => message.includes("1 đến 10")));
    assert.equal(importRowStatus(result!, null, {}, new Set()), "ERROR");
  }
});

test("BR04 validation rejects every text/count boundary before check", () => {
  for (const [column, value] of [
    [0, "a".repeat(151)],
    [1, "a".repeat(51)],
    [6, "a".repeat(2001)],
    [2, "11"],
    [2, "0"],
    [2, "1.5"],
    [5, "bad"],
    [7, "not-email"],
    [4, "Custom group"],
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
  input.values[4] = "Họ ngoại";
  const rows = validateCoupleRows([input]);
  assert.equal(rows[0]?.values[4], "Họ ngoại");
  assert.ok(rows[0]?.errors.length);
});
test("BR05 defaults are visible and side errors survive a second validation", () => {
  const values = ["An", "", "", "", "", "", "", ""];
  const rows = validateCoupleRows([{ line: 17, values }]);
  assert.ok(rows[0]!.warnings.length >= 3);
  assert.equal(importBody(rows).rows[0]?.group, null);
  const invalid = row();
  invalid.values[3] = "Sai phía";
  assert.ok(validateCoupleRows(validateCoupleRows([invalid]))[0]!.errors.length);
});
test("BR09 BR14 unresolved rows block confirmation and skip changes only new quota", () => {
  const rows = validateCoupleRows([row(), row(8, "2")]);
  const actions = importActions(preview);
  assert.equal(actions[2], undefined);
  assert.equal(actions[8], "CREATE_SEPARATE");
  assert.equal(importSummary(rows, preview, actions).unresolved, 1);
  const skip = importSummary(rows, preview, { ...actions, 2: "SKIP" });
  assert.deepEqual(skip, {
    created: 1,
    updated: 0,
    skipped: 1,
    unresolved: 0,
    places: 2,
    overQuota: false,
  });
  assert.equal(importSummary(rows, preview, { ...actions, 2: "CREATE_SEPARATE" }).overQuota, true);
});
test("BR03 exclusion preserves original Excel row numbers and sends only explicitly selected rows", () => {
  const broken = row(17);
  broken.values[7] = "bad";
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
  first[6] = "Dòng ghi chú 1\nDòng ghi chú 2";
  const parsed = parseCoupleSheet([[...coupleHeaders], first, [], row(4).values]);
  assert.deepEqual(
    parsed.map((r) => r.line),
    [2, 4],
  );
  assert.equal(parsed[0]?.values[6], "Dòng ghi chú 1 Dòng ghi chú 2");
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
