"use client";

import { useRouter } from "next/navigation";
import { CoupleImport } from "@/features/guests";
import { validateCoupleRows, type CoupleRow } from "@/features/guests/utils/couple-import";
import type { PlanningImportCommit, PlanningImportPreview, PlanningImportResult } from "@/features/guests/api/planning.api";

const mockInitialRaw = [
  { line: 2, values: ["Nguyễn Văn An", "Bác", "Gia đình", "5", "Nhà gái", "Họ hàng", "0901111111", "Có trẻ nhỏ", ""] },
  { line: 3, values: ["Trần Thị Hoa", "Cô", "Gia đình", "2", "Nhà gái", "Họ hàng", "", "Muốn ngồi gần lối ra", ""] },
  { line: 4, values: ["Lê Minh Anh", "Bạn", "Nhóm", "2", "Nhà gái", "Bạn bè", "", "Đại diện nhóm hai người", ""] },
  { line: 5, values: ["Phạm Thu Hà", "Bạn", "Cá nhân", "1", "Nhà gái", "Bạn bè", "", "", ""] },
  { line: 6, values: ["Hoàng Quốc Nam", "Anh", "Cá nhân", "1", "Nhà trai", "Đồng nghiệp", "", "", ""] },
  { line: 7, values: ["Nguyễn Văn An", "Bác", "Gia đình", "4", "Nhà gái", "Họ hàng", "0901111111", "Khách của bố", ""] },
  { line: 8, values: ["Hoàng Văn Đức", "Anh", "Cá nhân", "0", "Nhà trai", "Đồng nghiệp", "", "", ""] },
  { line: 9, values: ["Trần Thị Lan", "Chị", "Cá nhân", "1", "Nhà gái", "Bạn bè", "0903333333", "", ""] },
  { line: 10, values: ["Đặng Quốc Huy", "Ông", "Gia đình", "3", "Nhà trai", "Họ hàng", "0987 654 321", "", ""] },
  { line: 11, values: ["Ngô Thị Thu", "Cô", "Gia đình", "2", "Nhà gái", "Họ ngoại", "", "", ""] },
];

const mockRows = validateCoupleRows(mockInitialRaw);

const mockPreview: PlanningImportPreview = {
  previewToken: "mock-preview-token",
  expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  quotaRemaining: 30,
  proposedPlaces: 11,
  errors: [],
  rows: [
    {
      rowNumber: 2,
      status: "NEED_DECISION",
      reasons: ["SAME_NAME_AND_CONTACT_CHANGED"],
      matchCount: 1,
      matches: [
        {
          guestId: "G01",
          sourceRowNumber: null,
          recipientName: "G01 Nguyễn Văn An",
          differences: [
            { field: "expectedPeople", existing: "4", incoming: "5" },
            { field: "note", existing: "Khách của bố", incoming: "Có trẻ nhỏ" },
          ],
        },
      ],
    },
    {
      rowNumber: 3,
      status: "NEW",
      reasons: [],
      matchCount: 0,
      matches: [],
    },
    {
      rowNumber: 4,
      status: "NEW",
      reasons: [],
      matchCount: 0,
      matches: [],
    },
    {
      rowNumber: 5,
      status: "NEW",
      reasons: [],
      matchCount: 0,
      matches: [],
    },
    {
      rowNumber: 6,
      status: "WARNING",
      reasons: ["SAME_NAME_OTHER_SIDE_GROUP"],
      matchCount: 1,
      matches: [
        {
          guestId: "G05",
          sourceRowNumber: null,
          recipientName: "G05 Hoàng Quốc Nam",
          differences: [],
        },
      ],
    },
    {
      rowNumber: 7,
      status: "NEED_DECISION",
      reasons: ["EXACT_DUPLICATE_IN_WEDDING"],
      matchCount: 1,
      matches: [
        {
          guestId: "G01",
          sourceRowNumber: null,
          recipientName: "G01 Nguyễn Văn An",
          differences: [],
        },
      ],
    },
    {
      rowNumber: 9,
      status: "WARNING",
      reasons: ["SHARED_PHONE"],
      matchCount: 1,
      matches: [
        {
          guestId: "G03",
          sourceRowNumber: null,
          recipientName: "G03 Lê Văn Cường",
          differences: [],
        },
      ],
    },
    {
      rowNumber: 10,
      status: "NEW",
      reasons: [],
      matchCount: 0,
      matches: [],
    },
  ],
};

export function ImportPreview() {
  const router = useRouter();

  async function handleCheck(_rows: CoupleRow[]): Promise<PlanningImportPreview> {
    return mockPreview;
  }

  async function handleImport(input: PlanningImportCommit): Promise<PlanningImportResult> {
    return {
      importId: "mock-import-id",
      createdGuestCount: input.decisions.filter((d) => d.action === "CREATE_SEPARATE").length,
      createdPlaceCount: 11,
      items: input.decisions
        .filter((d) => d.action === "CREATE_SEPARATE")
        .map((d) => ({
          rowNumber: d.rowNumber,
          guestId: `new-guest-${d.rowNumber}`,
          expectedPeople: 1,
          action: "CREATE_SEPARATE",
        })),
      warnings: [],
      skippedCount: input.decisions.filter((d) => d.action === "SKIP").length,
      skipped: input.decisions
        .filter((d) => d.action === "SKIP")
        .map((d) => ({ rowNumber: d.rowNumber, action: "SKIP" })),
    };
  }

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <CoupleImport
        onClose={() => router.push("/")}
        onCheck={handleCheck}
        onImport={handleImport}
        weddingTitle="Đám cưới Minh & Lan"
        initialFilename="khach-moi.xlsx"
        initialRows={mockRows}
        isMock={true}
      />
    </main>
  );
}
