"use client";

import { useState } from "react";
import { PlanningImportUpdateEditor, updateFields, updateValue } from "./planning-import-update";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import type { PlanningImportDecision, PlanningImportPreview } from "../api/planning.api";
import { coupleHeaders, validateCoupleRows, type CoupleRow } from "../utils/couple-import";
import { defaultGroups, findGroup } from "../utils/group-catalog";
import {
  importReasonLabels,
  importRowStatus,
  unresolvedContactErrors,
  importSummary,
  type ImportActions,
  type ImportRowStatus,
} from "../utils/planning-import-review";
import { groupLabels } from "@/shared/lib/planning-groups";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { cn } from "@/shared/lib/utils";

const fields: Record<string, string> = {
  recipientName: "Tên",
  honorific: "Danh xưng",
  expectedPeople: "Số suất",
  side: "Phía",
  group: "Nhóm",
  phone: "SĐT",
  email: "Email",
  note: "Ghi chú",
};

const labels: Record<string, string> = {
  ...groupLabels,
  BRIDE: "Nhà gái",
  GROOM: "Nhà trai",
  MUTUAL: "Chung",
  UNSPECIFIED: "Chưa xác định",
  INDIVIDUAL: "Cá nhân",
  FAMILY: "Gia đình",
  GROUP: "Nhóm",
};

const display = (value: string | null) => (value ? (labels[value] ?? value) : "Trống");

const presentation: Record<
  ImportRowStatus,
  { label: string; tile: string; card: string; badge: string; dot: string }
> = {
  VALID: {
    label: "Hợp lệ",
    tile: "border-[#d3eed6] bg-[#edf7ee] text-[#1b873f]",
    card: "border-stone-200",
    badge: "bg-[#edf7ee] text-[#1b873f]",
    dot: "bg-[#1b873f]",
  },
  WARNING: {
    label: "Cần lưu ý",
    tile: "border-[#fde8bb] bg-[#fef9ec] text-[#b45309]",
    card: "border-[#fde8bb]",
    badge: "bg-[#fef9ec] text-[#b45309]",
    dot: "bg-[#b45309]",
  },
  DECISION: {
    label: "Cần quyết định",
    tile: "border-[#dbe4fd] bg-[#eef2fe] text-[#3f51b5]",
    card: "border-[#c7d5f8]",
    badge: "bg-[#eef2fe] text-[#3f51b5]",
    dot: "bg-[#3f51b5]",
  },
  ERROR: {
    label: "Lỗi",
    tile: "border-[#fecaca] bg-[#fef2f2] text-[#dc2626]",
    card: "border-[#f8b4b4]",
    badge: "bg-[#fef2f2] text-[#dc2626]",
    dot: "bg-[#dc2626]",
  },
  SKIPPED: {
    label: "Đã bỏ qua",
    tile: "border-stone-200 bg-[#f5f5f5] text-stone-600",
    card: "border-stone-200 bg-stone-50/70",
    badge: "bg-stone-100 text-stone-600",
    dot: "bg-stone-400",
  },
  UPDATE: {
    label: "Cập nhật",
    tile: "border-sky-200 bg-sky-50 text-sky-800",
    card: "border-sky-200",
    badge: "bg-sky-100 text-sky-800",
    dot: "bg-sky-600",
  },
  PENDING: {
    label: "Đang kiểm tra",
    tile: "border-stone-200 bg-stone-50 text-stone-500",
    card: "border-stone-200",
    badge: "bg-stone-100 text-stone-500",
    dot: "bg-stone-400",
  },
};

const filters = ["ALL", "VALID", "WARNING", "DECISION", "ERROR", "SKIPPED", "UPDATE"] as const;

const reasonTitles: Record<string, string> = {
  EXACT_DUPLICATE_IN_FILE: "Trùng hệt với một dòng trong file",
  EXACT_DUPLICATE_IN_WEDDING: "Trùng hệt khách đã có trong đám cưới",
  SAME_NAME_AND_CONTACT_CHANGED: "Cùng tên và SĐT với khách đã có, nhưng dữ liệu khác",
  SHARED_PHONE: "Dùng chung SĐT với một khách khác",
  SHARED_EMAIL: "Dùng chung email với một khách khác",
  SAME_NAME_DIFFERENT_CONTACT: "Cùng tên nhưng contact khác",
  SAME_NAME_NO_CONTACT: "Cùng tên, chưa đủ contact để xác định",
  SAME_NAME_OTHER_SIDE_GROUP: "Cùng tên nhưng khác phía hoặc nhóm khách",
};

function formatMatchedGuest(
  match: {
    guestId: string | null;
    sourceRowNumber: number | null;
    recipientName: string;
    differences: { field: string; existing: string | null; incoming: string | null }[];
  },
  row: CoupleRow,
  reasons: string[],
) {
  if (match.sourceRowNumber) {
    return `Dòng ${match.sourceRowNumber} trong file: ${match.recipientName}`;
  }
  const diffPhone = match.differences.find((d) => d.field === "phone");
  const diffCount = match.differences.find((d) => d.field === "expectedPeople");
  const phone = diffPhone ? diffPhone.existing : row.values[5];
  const count = diffCount ? diffCount.existing : row.expected;
  const isExact = reasons.some((r) => r.startsWith("EXACT_DUPLICATE"));

  const parts: string[] = [match.recipientName];
  if (phone) parts.push(phone);
  if (isExact && count) parts.push(`${count} suất`);

  return parts.join(" · ");
}

function ImportRowEditor({
  row,
  onSave,
  onClose,
}: {
  row: CoupleRow;
  onSave: (values: string[]) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState([...row.values]);
  const [errors, setErrors] = useState<string[]>([]);

  function change(index: number, value: string) {
    setValues((old) => old.map((text, i) => (i === index ? value : text)));
    setErrors([]);
  }

  function save() {
    const checked = validateCoupleRows([{ line: row.line, values }])[0];
    if (!checked || checked.errors.length) {
      setErrors(checked?.errors ?? ["Không đọc được dữ liệu dòng."]);
      return;
    }
    onSave(checked.values);
    onClose();
  }

  return (
    <Modal
      open
      title={`Chỉnh sửa dòng ${row.line}`}
      description="Chỉ sửa dòng trong file đang nhập. Khách đã có không được cập nhật."
      onClose={onClose}
    >
      <div className="space-y-5 font-sans">
        <div className="grid gap-4 sm:grid-cols-2">
          {coupleHeaders.map((name, index) => {
            const options =
              index === 3 ? ["Nhà gái", "Nhà trai", "Chung"] : index === 4 ? defaultGroups : null;
            return (
              <label
                key={name}
                className={cn("space-y-1.5 text-sm", index === 6 && "sm:col-span-2")}
              >
                <span className="block font-medium">{name}</span>
                {options ? (
                  <select
                    aria-label={`${name} dòng ${row.line}`}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    value={values[index] ?? ""}
                    onChange={(event) => change(index, event.target.value)}
                  >
                    <option value="">{index === 3 ? "Chưa xác định" : "Khác (mặc định)"}</option>
                    {values[index] && !options.includes(values[index]) && (
                      <option value={values[index]}>{values[index]} — không hợp lệ</option>
                    )}
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : index === 6 ? (
                  <textarea
                    aria-label={`${name} dòng ${row.line}`}
                    rows={3}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    value={values[index] ?? ""}
                    onChange={(event) => change(index, event.target.value)}
                  />
                ) : (
                  <input
                    aria-label={`${name} dòng ${row.line}`}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    inputMode={index === 2 ? "numeric" : index === 5 ? "tel" : undefined}
                    value={values[index] ?? ""}
                    onChange={(event) => change(index, event.target.value)}
                  />
                )}
              </label>
            );
          })}
        </div>
        {!!errors.length && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={save}>Lưu thay đổi</Button>
        </div>
      </div>
    </Modal>
  );
}

export function PlanningImportReview({
  rows,
  filename,
  preview,
  actions,
  updates,
  onUpdate,
  excluded,
  serverErrors,
  checking,
  failedCheck,
  saving,
  error,
  weddingTitle = "Đám cưới Minh & Lan",
  isMock = false,
  onEdit,
  onSkip,
  onRestore,
  onCreateSeparate,
  onSkipExact,
  onRestart,
  onSubmit,
  onRetry,
}: {
  rows: CoupleRow[];
  filename: string;
  preview: PlanningImportPreview | null;
  actions: ImportActions;
  updates: Record<number, PlanningImportDecision>;
  onUpdate: (decision: PlanningImportDecision) => Promise<string[]>;
  excluded: ReadonlySet<number>;
  serverErrors: Record<number, string[]>;
  checking: boolean;
  failedCheck: boolean;
  saving: boolean;
  error: string;
  weddingTitle?: string;
  isMock?: boolean;
  onEdit: (line: number, values: string[]) => void;
  onSkip: (row: CoupleRow) => void;
  onRestore: (row: CoupleRow) => void;
  onCreateSeparate: (line: number) => void;
  onSkipExact: () => void;
  onRestart: () => void;
  onSubmit: () => void;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const [updating, setUpdating] = useState<CoupleRow | null>(null);
  const [editing, setEditing] = useState<CoupleRow | null>(null);

  const states = new Map(
    rows.map((row) => [row.line, importRowStatus(row, preview, actions, excluded, serverErrors)]),
  );
  const active = rows.filter((row) => !excluded.has(row.line));
  const summary = preview ? importSummary(active, preview, actions) : null;
  const createdWithWarnings = active.filter(
    (row) => actions[row.line] === "CREATE_SEPARATE" && states.get(row.line) === "WARNING",
  ).length;
  const count = (status: ImportRowStatus) =>
    [...states.values()].filter((value) => value === status).length;

  const pending = count("PENDING");
  const problems = count("ERROR") + count("DECISION");
  const places = summary?.places ?? 0;
  const quota = preview?.quotaRemaining;
  const overQuota = summary?.overQuota ?? false;

  const exact =
    preview?.rows.filter(
      (row) =>
        actions[row.rowNumber] !== "SKIP" &&
        row.reasons.some((reason) => reason.startsWith("EXACT_DUPLICATE")),
    ).length ?? 0;

  const disabled =
    saving ||
    checking ||
    !!pending ||
    !!problems ||
    !preview?.previewToken ||
    !!preview.errors.length ||
    overQuota ||
    !active.length;

  const visible = rows.filter((row) => filter === "ALL" || states.get(row.line) === filter);
  const checks = new Map(preview?.rows.map((row) => [row.rowNumber, row]));
  const updatingCheck = updating ? checks.get(updating.line) : undefined;

  return (
    <section aria-label="Kiểm tra file khách mời" className="space-y-6 font-sans text-stone-900">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-stone-500">
        <span>{weddingTitle}</span>
        <span className="text-stone-300">/</span>
        <span>Quản lý khách mời</span>
        <span className="text-stone-300">/</span>
        <span className="font-semibold text-stone-900">Import Excel</span>
      </nav>

      {/* Header & Stepper */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900">
            Kiểm tra file khách mời
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-500">
            <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-stone-700">
              <FileSpreadsheet className="size-4 shrink-0 text-emerald-600" />
              <span className="break-all">{filename || "khach-moi.xlsx"}</span>
            </span>
            <span>·</span>
            <span>Đọc được {rows.length} dòng</span>
            {(isMock || filename.includes("mock") || filename.includes("demo")) && (
              <>
                <span>·</span>
                <span>Dữ liệu mô phỏng</span>
              </>
            )}
            {(checking || pending > 0) && !failedCheck && (
              <span role="status" className="inline-flex items-center gap-1.5 text-stone-500">
                <LoaderCircle className="size-3.5 animate-spin text-stone-600" />
                Đang kiểm tra…
              </span>
            )}
          </div>
        </div>

        {/* Stepper */}
        <ol aria-label="Tiến trình import" className="flex items-center gap-2 text-xs shrink-0">
          <li className="inline-flex items-center rounded-full bg-[#e6f4ea] px-3.5 py-1.5 font-medium text-[#137333]">
            1 · Chọn file
          </li>
          <li
            aria-current="step"
            className="inline-flex items-center rounded-full bg-[#a62b4c] px-3.5 py-1.5 font-semibold text-white shadow-xs"
          >
            2 · Kiểm tra
          </li>
          <li className="inline-flex items-center rounded-full bg-[#f1f3f4] px-3.5 py-1.5 font-medium text-[#5f6368]">
            3 · Xác nhận
          </li>
        </ol>
      </header>

      {/* 6 Stat Cards */}
      <div
        role="group"
        aria-label="Lọc trạng thái dòng"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7"
      >
        {filters.map((key) => {
          const isSelected = filter === key;
          const label = key === "ALL" ? "Tất cả" : presentation[key].label;
          const val = key === "ALL" ? rows.length : count(key);

          return (
            <button
              type="button"
              key={key}
              aria-pressed={isSelected}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
                key === "ALL" ? "border-stone-200 bg-white" : presentation[key].tile,
                isSelected ? "ring-2 ring-stone-900/30" : "hover:opacity-90",
              )}
            >
              <span className="block text-xs font-semibold">{label}</span>
              <span
                className={cn(
                  "mt-2 block text-3xl font-bold leading-none tabular-nums",
                  key === "ALL" && "text-stone-900",
                )}
              >
                {val}
              </span>
            </button>
          );
        })}
      </div>

      {/* Quota Progress & Skip-All-Exact Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-4 rounded-2xl border border-stone-200 bg-white px-5 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <span className="text-xs font-medium text-stone-600 shrink-0">
            Suất import / quota còn
          </span>
          <div
            role="progressbar"
            aria-label="Suất import so với quota còn"
            aria-valuemin={0}
            aria-valuemax={quota ?? undefined}
            aria-valuenow={Math.max(0, Math.min(places, quota ?? places))}
            aria-valuetext={`${places} suất / ${quota === null ? "không giới hạn" : (quota ?? "đang kiểm tra")}`}
            className="h-2 min-w-20 flex-1 overflow-hidden rounded-full bg-[#fce8ed]"
          >
            <div
              className={cn(
                "h-full rounded-full transition-all",
                overQuota ? "bg-red-600" : "bg-[#a62b4c]",
              )}
              style={{
                width: `${quota === undefined ? 0 : quota === null ? (places > 0 ? 100 : 0) : Math.max(0, Math.min(100, (places / Math.max(1, quota)) * 100))}%`,
              }}
            />
          </div>
          <strong
            className={cn(
              "text-sm font-semibold tabular-nums shrink-0",
              overQuota ? "text-red-700" : "text-stone-800",
            )}
          >
            {places} / {quota === null ? "∞" : (quota ?? "—")}
          </strong>
        </div>

        <Button
          variant="outline"
          disabled={!exact || checking || saving}
          onClick={onSkipExact}
          className="rounded-2xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 px-5 py-3 text-xs font-medium shadow-[0_1px_2px_rgba(0,0,0,0.02)] shrink-0 disabled:opacity-50"
        >
          Bỏ qua tất cả dòng trùng hệt ({exact})
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3.5 text-xs text-red-800"
        >
          {error}
        </p>
      )}

      {failedCheck && (
        <Button variant="outline" onClick={onRetry} className="rounded-xl">
          Thử kiểm tra lại
        </Button>
      )}

      {/* Row List */}
      <div className="space-y-3.5" aria-live="polite">
        {!visible.length && (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/50 p-12 text-center text-sm text-stone-500">
            Không có dòng nào trong trạng thái này.
          </p>
        )}

        {visible.map((row) => {
          const status = states.get(row.line) ?? "PENDING";
          const style = presentation[status];
          const checked = checks.get(row.line);
          const skipped = status === "SKIPPED";
          const canUpdate = checked?.matches.some((match) => match.guestId && match.guest);

          const errors = [
            ...row.errors,
            ...unresolvedContactErrors(checked, actions[row.line]),
            ...(serverErrors[row.line] ?? []),
            ...(preview?.errors
              .filter((issue) => issue.rowNumber === row.line)
              .map(
                (issue) =>
                  issue.message ||
                  `Kiểm tra lại ${fields[issue.field] ?? issue.field} của dòng này.`,
              ) ?? []),
          ];

          const reasons =
            checked?.reasons.filter((reason) => !reason.startsWith("DEFAULTED_")) ?? [];
          const isExact = reasons.some((r) => r.startsWith("EXACT_DUPLICATE"));
          const isSameNameChanged = reasons.includes("SAME_NAME_AND_CONTACT_CHANGED");
          const warningMessages = checked?.reasons.length
            ? checked.reasons.map(
                (reason) => reasonTitles[reason] ?? importReasonLabels[reason] ?? "Cần lưu ý",
              )
            : row.warnings;

          const matchedCandidate = checked?.matches[0];
          const matchedSummary = matchedCandidate
            ? formatMatchedGuest(matchedCandidate, row, reasons)
            : null;

          const isGroupInvalid = row.values[4] && !findGroup(row.values[4], defaultGroups);
          const hasCountIssue =
            row.expected === null ||
            row.expected < 1 ||
            row.expected > 10 ||
            status === "ERROR" ||
            status === "DECISION";

          return (
            <article
              key={row.line}
              aria-label={`Dòng ${row.line}: ${style.label}`}
              className={cn(
                "rounded-2xl border bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-shadow",
                style.card,
                skipped && "opacity-75 bg-stone-50/60",
              )}
            >
              <div className="flex items-start gap-4">
                {/* Dòng Number Badge Box */}
                <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-stone-200 bg-[#f8f9fa] py-2.5 text-center">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                    Dòng
                  </span>
                  <strong className="mt-0.5 text-2xl font-bold leading-none text-stone-700">
                    {row.line}
                  </strong>
                </div>

                {/* Main Content Area */}
                <div className="min-w-0 flex-1">
                  {/* Row Header: Name, Honorific, Status Badge, and Action Buttons */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h2 className="break-words text-base font-bold text-stone-900">
                          {row.values[0] || "Chưa có tên người nhận"}
                        </h2>
                        {row.values[1] && (
                          <span className="text-xs text-stone-400 font-normal">
                            · {row.values[1]}
                          </span>
                        )}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ml-1",
                            style.badge,
                          )}
                        >
                          <span
                            className={cn("size-1.5 rounded-full", style.dot)}
                            aria-hidden="true"
                          />
                          {status === "WARNING" && checked?.status === "NEED_DECISION"
                            ? "Đã chọn tạo riêng"
                            : style.label}
                        </span>
                      </div>

                      {/* Row Chips / Tags */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <span
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs",
                            hasCountIssue
                              ? "bg-[#fef2f2] text-[#dc2626] font-semibold"
                              : "bg-stone-100 text-stone-600 font-normal",
                          )}
                        >
                          {row.values[2] || "1"} suất
                        </span>
                        <span className="rounded-md bg-stone-100 px-2.5 py-1 text-stone-600 font-normal">
                          {row.values[3] || "Chưa xác định"}
                        </span>
                        <span
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs",
                            isGroupInvalid
                              ? "bg-[#fef2f2] text-[#dc2626] font-semibold"
                              : "bg-stone-100 text-stone-600 font-normal",
                          )}
                        >
                          {row.values[4] || "Khác"}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {!skipped && canUpdate && (
                        <Button size="sm" variant="outline" onClick={() => setUpdating(row)}>
                          Cập nhật<span className="sr-only"> dòng {row.line}</span>
                        </Button>
                      )}
                      {status === "DECISION" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onCreateSeparate(row.line)}
                        >
                          Tạo riêng<span className="sr-only"> dòng {row.line}</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(row)}
                        className="rounded-xl border-stone-200 bg-white hover:bg-stone-50 text-stone-700 px-4 py-1.5 text-xs font-medium shadow-none"
                      >
                        Chỉnh sửa<span className="sr-only"> dòng {row.line}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => (skipped ? onRestore(row) : onSkip(row))}
                        className="rounded-xl border-stone-200 bg-white hover:bg-stone-50 text-stone-700 px-4 py-1.5 text-xs font-medium shadow-none"
                      >
                        {skipped ? "Dùng lại" : "Bỏ qua"}
                        <span className="sr-only"> dòng {row.line}</span>
                      </Button>
                    </div>
                  </div>

                  {/* Details line: Phone, Note, Email */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-stone-500">
                    <span>
                      SĐT{" "}
                      <span className="text-stone-800 ml-1 font-normal">
                        {row.values[5] || "–"}
                      </span>
                    </span>
                    {row.values[7] && (
                      <span className="break-all">
                        Email{" "}
                        <span className="text-stone-800 ml-1 font-normal">{row.values[7]}</span>
                      </span>
                    )}
                    <span className="break-words">
                      Ghi chú{" "}
                      <span className="text-stone-800 ml-1 font-normal">
                        {row.values[6] || "–"}
                      </span>
                    </span>
                  </div>

                  {actions[row.line] === "UPDATE" &&
                    (() => {
                      const decision = updates[row.line];
                      const target = checked?.matches.find(
                        (x) => x.guestId === decision?.targetGuestId,
                      );
                      const plan = preview?.updates?.find((x) => x.rowNumber === row.line);
                      return (
                        <div className="mt-3 space-y-2 rounded-xl bg-sky-50 p-3 text-sm">
                          <p className="font-semibold">
                            Cập nhật: {target?.recipientName} ·{" "}
                            {updateValue("side", target?.guest?.side)} ·{" "}
                            {updateValue("group", target?.guest?.group)} ·{" "}
                            {target?.guest?.phone || target?.guest?.email || "Không có contact"}
                          </p>
                          <ul>
                            {reasons.map((reason) => (
                              <li key={reason}>{importReasonLabels[reason] ?? reason}</li>
                            ))}
                          </ul>
                          <p>
                            Thông tin được cập nhật:{" "}
                            {decision?.selectedFields
                              ?.map(
                                (field) => updateFields.find((x) => x[0] === field)?.[1] ?? field,
                              )
                              .join(", ")}
                          </p>
                          {updateFields
                            .filter(([field]) => plan?.fields.includes(field))
                            .map(([field, label]) => (
                              <p key={field}>
                                {label}: <s>{updateValue(field, target?.guest?.[field])}</s> →{" "}
                                <strong>
                                  {updateValue(
                                    field,
                                    decision?.updateValues?.[field] ??
                                      target?.differences.find((diff) => diff.field === field)
                                        ?.incoming,
                                  )}
                                </strong>
                              </p>
                            ))}
                          {plan?.noChange && (
                            <p>NO_CHANGE: không có thay đổi thực tế, không tăng version.</p>
                          )}
                          {plan?.warnings.map((warning) => (
                            <p className="text-amber-900" key={warning.code}>
                              {warning.message} Việc cần xử lý sẽ được lưu sau import.
                            </p>
                          ))}
                        </div>
                      );
                    })()}
                  {canUpdate && (status === "ERROR" || status === "DECISION") && (
                    <p className="mt-3 text-xs text-stone-600">
                      Khách mới: chọn <strong>Chỉnh sửa</strong> để sửa dòng Excel trước khi tạo lời
                      mời riêng. Khách đã có: chọn <strong>Cập nhật</strong> để sửa thông tin của
                      khách đó.
                    </p>
                  )}
                  {/* Callout Boxes */}
                  {!skipped && status === "ERROR" && (
                    <div className="mt-3.5 space-y-2 rounded-xl bg-[#fef2f2] p-3 text-xs">
                      {errors.map((message) => (
                        <div
                          key={message}
                          className="rounded-md border border-[#f8b4b4] bg-[#fff5f5] px-3 py-1.5 font-medium text-[#dc2626]"
                        >
                          {message}
                        </div>
                      ))}
                    </div>
                  )}

                  {!skipped && status === "DECISION" && (
                    <div className="mt-3.5 space-y-2.5 rounded-xl bg-[#eef2fe] p-3.5 text-xs text-[#2b3a67]">
                      {isExact ? (
                        <>
                          <div className="rounded-md border border-[#c7d5f8] bg-[#f8faff] px-3 py-1.5 font-semibold text-[#1e293b]">
                            {reasons.includes("EXACT_DUPLICATE_IN_WEDDING")
                              ? "Trùng hệt khách đã có trong đám cưới"
                              : "Trùng hệt với một dòng trong file"}
                          </div>
                          {matchedSummary && (
                            <p className="text-stone-600">Khách đã có: {matchedSummary}</p>
                          )}
                          {!canUpdate && (
                            <p className="text-[11px] text-[#4b5563]">
                              Cùng một người: bấm Bỏ qua. Người khác: bấm Chỉnh sửa để phân biệt.
                            </p>
                          )}
                        </>
                      ) : isSameNameChanged ? (
                        <>
                          <p className="font-semibold text-xs text-[#1e293b]">
                            Cùng tên và SĐT với khách đã có, nhưng dữ liệu khác
                          </p>
                          {matchedSummary && (
                            <p className="text-stone-600">Khách đã có: {matchedSummary}</p>
                          )}
                          {matchedCandidate && !!matchedCandidate.differences.length && (
                            <div className="rounded-md border border-[#c7d5f8] divide-y divide-[#c7d5f8] bg-[#f8faff] overflow-hidden">
                              {matchedCandidate.differences.map((diff) => (
                                <div
                                  key={diff.field}
                                  className="flex items-center gap-6 px-3 py-1.5 text-xs"
                                >
                                  <span className="w-16 shrink-0 text-stone-600 font-normal">
                                    {fields[diff.field] ?? diff.field}
                                  </span>
                                  <span className="break-words line-through text-stone-400">
                                    {display(diff.existing)}
                                  </span>
                                  <span aria-hidden="true" className="text-stone-400">
                                    →
                                  </span>
                                  <strong className="break-words font-bold text-stone-900">
                                    {display(diff.incoming)}
                                  </strong>
                                </div>
                              ))}
                            </div>
                          )}
                          {!canUpdate && (
                            <p className="text-[11px] text-[#4b5563]">
                              Cùng một người: giữ một dòng và bỏ qua dòng còn lại.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          {reasons.map((reason) => (
                            <div
                              key={reason}
                              className="rounded-md border border-[#c7d5f8] bg-[#f8faff] px-3 py-1.5 font-semibold text-[#1e293b]"
                            >
                              {reasonTitles[reason] ??
                                importReasonLabels[reason] ??
                                "Có thông tin cần kiểm tra"}
                            </div>
                          ))}
                          {matchedSummary && (
                            <p className="text-stone-600">Khách đã có: {matchedSummary}</p>
                          )}
                          <p className="text-[11px] text-[#4b5563]">
                            {reasons.includes("SHARED_PHONE") || reasons.includes("SHARED_EMAIL")
                              ? "Mỗi liên hệ chỉ dùng cho một lời mời. Nếu đây là khách khác, sửa hoặc bỏ trống liên hệ đang trùng trước khi tạo riêng."
                              : "Nếu là cùng một người, chọn Cập nhật hoặc Bỏ qua. Nếu là lời mời độc lập, xác nhận Tạo riêng."}
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {!skipped &&
                    status === "WARNING" &&
                    (warningMessages.length > 0 || matchedSummary) && (
                      <div className="mt-3.5 space-y-2 rounded-xl bg-[#fef9ec] p-3.5 text-xs text-[#92400e]">
                        {[...new Set(warningMessages)].map((message) => (
                          <div
                            key={message}
                            className="rounded-md border border-[#fde8bb] bg-[#fffdf5] px-3 py-1.5 font-semibold text-[#92400e]"
                          >
                            {message}
                          </div>
                        ))}

                        {matchedSummary && (
                          <p className="text-stone-600">Khách đã có: {matchedSummary}</p>
                        )}
                      </div>
                    )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Sticky Bottom Bar */}
      <footer className="sticky bottom-4 z-10 mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white/95 p-5 shadow-lg backdrop-blur">
        <div className="text-xs">
          <p className="text-base font-bold text-stone-900">
            {problems
              ? `Còn ${problems} dòng cần xử lý`
              : failedCheck
                ? "Cần kiểm tra lại danh sách"
                : pending || checking || (!preview && active.length > 0)
                  ? "Đang kiểm tra danh sách…"
                  : `Sẵn sàng tạo ${summary?.created ?? 0} lời mời${createdWithWarnings ? `, gồm ${createdWithWarnings} dòng cần lưu ý` : ""} · cập nhật ${summary?.updated ?? 0} khách · thay đổi ${places} suất`}
          </p>
          <p className={cn("mt-0.5 text-xs", overQuota ? "text-red-700" : "text-stone-500")}>
            {overQuota
              ? "Số suất import vượt quota còn lại. Bỏ qua một số dòng trước khi xác nhận."
              : "Dòng Lỗi và Cần quyết định phải được chỉnh sửa hoặc bỏ qua trước khi xác nhận."}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <Button
            variant="outline"
            onClick={onRestart}
            disabled={saving}
            className="rounded-xl border-stone-200 bg-white hover:bg-stone-50 text-stone-700 px-5 py-2.5 text-xs font-medium shadow-none"
          >
            Làm lại từ đầu
          </Button>
          <Button
            aria-label="Xác nhận import"
            disabled={disabled}
            onClick={onSubmit}
            className={cn(
              "rounded-xl px-5 py-2.5 text-xs font-medium transition-colors shadow-none",
              disabled
                ? "bg-[#e5dce0] text-[#9b8d94] hover:bg-[#e5dce0] cursor-not-allowed"
                : "bg-[#a62b4c] text-white hover:bg-[#8f2441] shadow-xs",
            )}
          >
            {saving ? "Đang import…" : "Xác nhận import"}
          </Button>
        </div>
      </footer>

      {updating && updatingCheck && (
        <PlanningImportUpdateEditor
          key={updating.line}
          row={updating}
          check={updatingCheck}
          current={updates[updating.line]}
          onApply={onUpdate}
          onClose={() => setUpdating(null)}
        />
      )}
      {editing && (
        <ImportRowEditor
          key={editing.line}
          row={editing}
          onClose={() => setEditing(null)}
          onSave={(values) => onEdit(editing.line, values)}
        />
      )}
    </section>
  );
}
