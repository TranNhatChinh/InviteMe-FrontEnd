import type { PlanningImportDecision, PlanningImportPreview } from "../api/planning.api";
import type { CoupleRow } from "./couple-import";

export type ImportActions = Record<number, PlanningImportDecision["action"]>;

/** Describe each actual candidate; never infer an existing guest from the incoming row. */
export function importDuplicateContext(
  check: PlanningImportPreview["rows"][number],
  row: CoupleRow,
) {
  const candidates = check.matches.map((match) => {
    const contacts = (
      [
        ["phone", 5, "SĐT"],
        ["email", 7, "Email"],
      ] as const
    )
      .filter(
        ([field, index]) =>
          row.values[index]?.trim() && !match.differences.some((diff) => diff.field === field),
      )
      .map(([, , label]) => label);
    const source = match.guestId
      ? `${match.recipientName} trong hệ thống`
      : `dòng ${match.sourceRowNumber}: ${match.recipientName} trong file Excel`;
    return {
      match,
      message: contacts.length
        ? `${contacts.join(" và ")} trùng với ${source}.`
        : `Cùng tên với ${source}; cần xác minh có phải cùng khách.`,
    };
  });
  const database = check.matches.filter((match) => match.guestId);
  const ambiguous = database.length > 1 || check.matchCount > check.matches.length;
  const target =
    !ambiguous && database.length === 1 && database[0]?.guest ? database[0] : undefined;
  return {
    candidates,
    ambiguous,
    target,
    canUpdate: !!target?.differences.length,
    contactConflict: check.reasons.some(
      (reason) => reason === "SHARED_PHONE" || reason === "SHARED_EMAIL",
    ),
    label: ambiguous
      ? "Cần xác minh"
      : database.length
        ? "Trùng khách đã có"
        : check.matches.length
          ? "Trùng trong Excel"
          : "Cần xác minh",
  };
}
export function separateContactErrors(
  check: PlanningImportPreview["rows"][number],
  row: CoupleRow,
  values: string[],
) {
  const phoneKey = (value: string) => {
    const digits = value.replace(/[^0-9]/g, "");
    if (/^0[35789][0-9]{8}$/.test(digits)) return `84${digits.slice(1)}`;
    if (/^[35789][0-9]{8}$/.test(digits)) return `84${digits}`;
    return digits;
  };
  return (
    [
      ["phone", 5, "SĐT"],
      ["email", 7, "Email"],
    ] as const
  ).flatMap(([field, index, label]) => {
    const key = (value: string) =>
      field === "phone" ? phoneKey(value) : value.trim().toLowerCase();
    const incoming = key(values[index] ?? "");
    if (!incoming) return [];
    const conflict = check.matches.some((match) => {
      const difference = match.differences.find((diff) => diff.field === field);
      const existing = match.guest
        ? match.guest[field]
        : difference
          ? difference.existing
          : row.values[index];
      return !!existing && key(existing) === incoming;
    });
    return conflict
      ? [`${label} vẫn trùng. Hãy sửa hoặc bỏ trống ${label} để tạo lời mời riêng.`]
      : [];
  });
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
  if (excluded.has(row.line) || actions[row.line] === "SKIP") return "SKIPPED";
  const checked = preview?.rows.find((item) => item.rowNumber === row.line);
  if (
    row.errors.length ||
    serverErrors[row.line]?.length ||
    preview?.errors.some((issue) => issue.rowNumber === row.line)
  )
    return "ERROR";
  if (!checked) return "PENDING";
  if (actions[row.line] === "UPDATE") return "UPDATE";
  if (checked.status === "NEED_DECISION" && actions[row.line] !== "CREATE_SEPARATE")
    return "DECISION";
  if (checked.status !== "NEW" || row.warnings.length) return "WARNING";
  return "VALID";
}

export const importRowChip: Record<ImportRowStatus, string> = {
  VALID: "Sẽ tạo mới",
  WARNING: "Sẽ tạo mới",
  UPDATE: "Sẽ cập nhật khách cũ",
  SKIPPED: "Đã bỏ qua",
  DECISION: "Cần quyết định",
  ERROR: "Lỗi cần sửa",
  PENDING: "Đang kiểm tra…",
};
export type ImportReviewFilter =
  "ALL" | "READY" | "DECISION" | "WARNING" | "ERROR" | "SKIPPED" | "UPDATE" | "PENDING";
export function matchesImportFilter(
  filter: ImportReviewFilter,
  status: ImportRowStatus,
  action: ImportActions[number] | undefined,
  hasWarnings: boolean,
) {
  if (filter === "ALL") return true;
  if (filter === "READY") return status === "VALID" || status === "WARNING" || status === "UPDATE";
  if (filter === "UPDATE") return status !== "SKIPPED" && action === "UPDATE";
  if (filter === "WARNING") return status !== "SKIPPED" && hasWarnings;
  return status === filter;
}
export function importReviewTotals(statuses: ImportRowStatus[]) {
  return {
    total: statuses.length,
    ready: statuses.filter((status) => matchesImportFilter("READY", status, undefined, false))
      .length,
    decision: statuses.filter((status) => status === "DECISION").length,
    error: statuses.filter((status) => status === "ERROR").length,
    skipped: statuses.filter((status) => status === "SKIPPED").length,
    pending: statuses.filter((status) => status === "PENDING").length,
  };
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
  SAME_NAME_AND_CONTACT_CHANGED: "Cùng tên và thông tin liên hệ, nhưng dữ liệu khác",
  SAME_NAME_DIFFERENT_CONTACT: "Cùng tên nhưng contact khác",
  SAME_NAME_NO_CONTACT: "Cùng tên, chưa đủ contact để xác định",
  SAME_NAME_OTHER_SIDE_GROUP: "Cùng tên nhưng khác phía hoặc nhóm khách",
  SHARED_PHONE: "Dùng chung SĐT với một khách khác",
  SHARED_EMAIL: "Dùng chung email với một khách khác",
  DEFAULTED_SIDE: "Chưa chọn phía: dùng Chưa xác định.",
  DEFAULTED_GROUP: "Chưa chọn nhóm: dùng Khác.",
  DEFAULTED_COUNT: "Chưa nhập số suất: dùng 1 suất.",
};
