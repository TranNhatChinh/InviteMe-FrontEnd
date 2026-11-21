"use client";

import { useRouter } from "next/navigation";
import { CoupleImport, validateCoupleRows } from "@/features/guests";
import {
  importBody,
  type PlanningImportCommit,
  type PlanningImportDecision,
  type PlanningImportPreview,
  type PlanningImportResult,
} from "@/features/guests";
import type { CoupleRow } from "@/features/guests";

type Candidate = PlanningImportPreview["rows"][number]["matches"][number];
const names = [
  "Nguyễn Văn An",
  "Trần Thị Bình",
  "Lê Minh Châu",
  "Phạm Quốc Dũng",
  "Hoàng Thu Hà",
  "Đỗ Anh Khoa",
  "Vũ Ngọc Lan",
  "Bùi Đức Minh",
  "Đặng Thanh Nga",
  "Hồ Bảo Phúc",
];
const mockRows = validateCoupleRows(
  names.map((name, i) => ({
    line: i + 2,
    values: [
      name,
      i === 0 ? "Bác" : "Anh/Chị",
      i === 0 ? "4" : "2",
      i % 2 ? "Nhà trai" : "Nhà gái",
      i % 2 ? "Bạn bè" : "Họ hàng",
      `09170000${String(i + 1).padStart(2, "0")}`,
      i === 0 ? "Có trẻ nhỏ" : "",
      `khach${i + 1}@example.com`,
    ],
  })),
);
const existing = importBody(mockRows.slice(0, 5)).rows.map((row, i) => ({
  ...row,
  id: `demo-guest-${i + 1}`,
  version: 1,
  recipientName: row.recipientName ?? "",
  honorific: row.honorific ?? null,
  expectedPeople: i === 0 ? 2 : (row.expectedPeople ?? 1),
  side: row.side ?? "UNSPECIFIED",
  group: row.group ?? "OTHER",
  seated: false,
  invitationSent: false,
  hasRsvp: false,
  confirmedPeople: 0,
  protectedPlaces: 0,
}));

// Development-only fixture. No API writes: all decisions are previewed in memory.
async function handleCheck(
  rows: CoupleRow[],
  decisions: PlanningImportDecision[] = [],
): Promise<PlanningImportPreview> {
  const checks = importBody(rows).rows.map((row) => {
    const matches: Candidate[] = existing
      .filter(
        (guest) =>
          guest.recipientName === row.recipientName ||
          (!!row.phone && guest.phone === row.phone) ||
          (!!row.email && guest.email === row.email),
      )
      .map((guest) => ({
        guestId: guest.id,
        sourceRowNumber: null,
        recipientName: guest.recipientName,
        guest,
        differences: (
          [
            "recipientName",
            "honorific",
            "expectedPeople",
            "side",
            "group",
            "phone",
            "email",
            "note",
          ] as const
        )
          .filter((field) => (guest[field] ?? "") !== (row[field] ?? ""))
          .map((field) => ({
            field,
            existing: guest[field] == null ? null : String(guest[field]),
            incoming: row[field] == null ? null : String(row[field]),
          })),
      }));
    const reasons: string[] = [];
    if (matches.length) {
      reasons.push(
        matches.some((match) => !match.differences.length)
          ? "EXACT_DUPLICATE_IN_WEDDING"
          : "SAME_NAME_AND_CONTACT_CHANGED",
      );
      if (matches.some((match) => row.phone && match.guest?.phone === row.phone))
        reasons.push("SHARED_PHONE");
      if (matches.some((match) => row.email && match.guest?.email === row.email))
        reasons.push("SHARED_EMAIL");
    }
    return {
      rowNumber: row.rowNumber,
      status: matches.length ? ("NEED_DECISION" as const) : ("NEW" as const),
      reasons,
      matches,
      matchCount: matches.length,
    };
  });
  return {
    previewToken: "development-only",
    expiresAt: "2099-01-01T00:00:00Z",
    quotaRemaining: 30,
    proposedPlaces: 10,
    errors: [],
    rows: checks,
    updates: decisions
      .filter((decision) => decision.action === "UPDATE")
      .map((decision) => {
        const guest = existing.find((item) => item.id === decision.targetGuestId);
        const count = decision.selectedFields?.includes("expectedPeople")
          ? decision.updateValues?.expectedPeople
          : guest?.expectedPeople;
        return {
          rowNumber: decision.rowNumber,
          guestId: decision.targetGuestId ?? "",
          fields: decision.selectedFields ?? [],
          noChange: false,
          placeDelta: (count ?? 0) - (guest?.expectedPeople ?? 0),
          errors: [],
          warnings: [],
        };
      }),
  };
}
async function handleImport(input: PlanningImportCommit): Promise<PlanningImportResult> {
  const created = input.decisions.filter((decision) => decision.action === "CREATE_SEPARATE");
  const updated = input.decisions.filter((decision) => decision.action === "UPDATE");
  return {
    importId: "mock-import-id",
    createdGuestCount: created.length,
    createdPlaceCount: input.rows
      .filter((row) => created.some((decision) => decision.rowNumber === row.rowNumber))
      .reduce((sum, row) => sum + (row.expectedPeople ?? 1), 0),
    items: created.map((decision) => ({
      rowNumber: decision.rowNumber,
      guestId: `new-${decision.rowNumber}`,
      expectedPeople:
        input.rows.find((row) => row.rowNumber === decision.rowNumber)?.expectedPeople ?? 1,
      action: "CREATE_SEPARATE",
    })),
    updatedGuestCount: updated.length,
    updated: updated.map((decision) => ({
      rowNumber: decision.rowNumber,
      guestId: decision.targetGuestId ?? "",
      expectedPeople:
        decision.updateValues?.expectedPeople ??
        existing.find((guest) => guest.id === decision.targetGuestId)?.expectedPeople ??
        1,
      action: "UPDATE",
    })),
    noChangeCount: 0,
    noChange: [],
    tasks: [],
    warnings: [],
    skippedCount: input.decisions.filter((decision) => decision.action === "SKIP").length,
    skipped: input.decisions
      .filter((decision) => decision.action === "SKIP")
      .map((decision) => ({ rowNumber: decision.rowNumber, action: "SKIP" })),
  };
}
export function ImportPreview() {
  const router = useRouter();
  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <CoupleImport
        onClose={() => router.push("/")}
        onCheck={handleCheck}
        onImport={handleImport}
        weddingTitle="Đám cưới mẫu · Preview import"
        initialFilename="demo-10-khach-5-trung.xlsx"
        initialRows={mockRows}
        isMock
      />
    </main>
  );
}
