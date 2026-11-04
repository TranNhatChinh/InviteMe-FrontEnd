import type { PlanningImportDecision, PlanningImportPreview } from "../api/planning.api";
import type { CoupleRow } from "./couple-import";

export type ImportActions = Record<number, PlanningImportDecision["action"]>;
export function unresolvedContactErrors(
  checked: PlanningImportPreview["rows"][number] | undefined,
  action: ImportActions[number] | undefined,
) {
  if (action || !checked) return [];
  const errors: string[] = [];
  if (checked.reasons.includes("SHARED_PHONE"))
    errors.push("SĐT trùng với lời mời khác. Sửa hoặc bỏ trống SĐT để tạo riêng.");
  if (checked.reasons.includes("SHARED_EMAIL"))
    errors.push("Email trùng với lời mời khác. Sửa hoặc bỏ trống email để tạo riêng.");
  return errors;
}
export type ImportRowStatus =
  "VALID" | "WARNING" | "DECISION" | "ERROR" | "SKIPPED" | "UPDATE" | "PENDING";
export function importRowStatus(
  row: CoupleRow,
  preview: PlanningImportPreview | null,
  actions: ImportActions,
  excluded: ReadonlySet<number>,
  serverErrors: Record<number, string[]> = {},
): ImportRowStatus {
  if (excluded.has(row.line)) return "SKIPPED";
  const checked = preview?.rows.find((item) => item.rowNumber === row.line);
  if (
    row.errors.length ||
    unresolvedContactErrors(checked, actions[row.line]).length ||
    serverErrors[row.line]?.length ||
    preview?.errors.some((issue) => issue.rowNumber === row.line)
  )
    return "ERROR";
  if (actions[row.line] === "SKIP") return "SKIPPED";
  if (actions[row.line] === "UPDATE") return "UPDATE";
  if (!checked) return "PENDING";
  if (checked.status === "NEED_DECISION" && actions[row.line] !== "CREATE_SEPARATE")
    return "DECISION";
  if (checked.status !== "NEW" || row.warnings.length) return "WARNING";
  return "VALID";
}
export function importActions(preview: PlanningImportPreview): ImportActions {
  return Object.fromEntries(
    preview.rows
      .filter((row) => row.status !== "NEED_DECISION")
      .map((row) => [row.rowNumber, "CREATE_SEPARATE"]),
  );
}
export function importSummary(
  rows: CoupleRow[],
  preview: PlanningImportPreview,
  actions: ImportActions,
) {
  const selected = rows.filter((row) => actions[row.line] === "CREATE_SEPARATE");
  const places =
    selected.reduce((sum, row) => sum + (row.expected ?? 1), 0) +
    (preview.updates ?? [])
      .filter((x) => actions[x.rowNumber] === "UPDATE")
      .reduce((sum, x) => sum + x.placeDelta, 0);
  return {
    created: selected.length,
    updated: rows.filter((row) => actions[row.line] === "UPDATE").length,
    skipped: rows.filter((row) => actions[row.line] === "SKIP").length,
    unresolved: preview.rows.filter((row) => !actions[row.rowNumber]).length,
    places,
    overQuota: preview.quotaRemaining !== null && places > preview.quotaRemaining,
  };
}
export const importReasonLabels: Record<string, string> = {
  EXACT_DUPLICATE_IN_FILE: "Trùng hệt với một dòng trong file",
  EXACT_DUPLICATE_IN_WEDDING: "Trùng hệt khách đã có trong đám cưới",
  SAME_NAME_AND_CONTACT_CHANGED: "Cùng tên và SĐT với khách đã có, nhưng dữ liệu khác",
  SAME_NAME_DIFFERENT_CONTACT: "Cùng tên nhưng contact khác",
  SAME_NAME_NO_CONTACT: "Cùng tên, chưa đủ contact để xác định",
  SAME_NAME_OTHER_SIDE_GROUP: "Cùng tên nhưng khác phía hoặc nhóm khách",
  SHARED_PHONE: "Dùng chung SĐT với một khách khác",
  SHARED_EMAIL: "Dùng chung email với một khách khác",
  DEFAULTED_SIDE: "Chưa chọn phía: dùng Chưa xác định.",
  DEFAULTED_GROUP: "Chưa chọn nhóm: dùng Khác.",
  DEFAULTED_COUNT: "Chưa nhập số suất: dùng 1 suất.",
};
