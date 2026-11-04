"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/i18n/format";
import { useLanguage } from "@/i18n/language-context";
import { ArrowLeft, Download, FileSpreadsheet, Upload, Armchair, ChevronDown } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { coupleHeaders, validateCoupleRows, type CoupleRow } from "../utils/couple-import";
import { CoupleSeatingPreview } from "./couple-seating-preview";
import { defaultGroups, findGroup } from "../utils/group-catalog";
import { readCoupleFile } from "../utils/read-couple-file";
import { ApiError } from "@/core/api/api-error";
import {
  importBody,
  type PlanningImportCommit,
  type PlanningImportDecision,
  type PlanningImportPreview,
  type PlanningImportResult,
} from "../api/planning.api";
import { importActions, importSummary, type ImportActions } from "../utils/planning-import-review";
import { PlanningImportReview } from "./planning-import-review";

const rowMessageKeys: Record<string, string> = {
  "SĐT cần 7–15 chữ số; chỉ dùng dấu + ở đầu, khoảng trắng, dấu chấm, gạch nối hoặc ngoặc.":
    "phone",
  "Email không đúng định dạng hoặc vượt quá 254 ký tự.": "email",
  "Thiếu tên người nhận.": "name",
  "Tổng người dự kiến phải là số nguyên từ 1 trở lên.": "expected",
  "Phía khách mời chọn Nhà gái, Nhà trai hoặc Chung.": "side",
  "Chưa xác định phía khách mời; không mặc định là Chung.": "sideMissing",
  "Dùng văn bản hoặc số, không dùng công thức trong các ô.": "formula",
  "Tên hoặc SĐT trùng dòng trước. Kiểm tra lại; các dòng vẫn được giữ riêng.": "duplicate",
  "Dòng cần đủ 8 ô, kể cả ô để trống.": "rowCells",
};
const importGuide = [
  ["Tên người nhận", "Bắt buộc, tối đa 150 ký tự.", "Nguyễn Văn An"],
  ["Danh xưng", "Không bắt buộc, tối đa 50 ký tự.", "Bác, Cô, Anh, Chị"],
  [
    "Tổng người dự kiến",
    "Số nguyên từ 1–500, tính cả người nhận và người đi cùng. Để trống dùng 1.",
    "Gia đình 4 người nhập 4",
  ],
  ["Phía khách mời", "Nhà gái, Nhà trai hoặc Chung. Để trống là Chưa xác định.", "Nhà gái"],
  [
    "Nhóm khách",
    "Họ hàng, Bạn bè, Đồng nghiệp, Đối tác, Hàng xóm hoặc Khác. Để trống dùng Khác.",
    "Họ hàng",
  ],
  [
    "SĐT",
    "Không bắt buộc. Có 7–15 chữ số; nên để ô dạng văn bản để giữ số 0 đầu.",
    "0912 345 678 hoặc +84912345678",
  ],
  ["Ghi chú", "Không bắt buộc, tối đa 2.000 ký tự.", "Gia đình có trẻ nhỏ"],
  ["Email", "Không bắt buộc; nếu có phải đúng định dạng, tối đa 254 ký tự.", "an@example.com"],
];

export function CoupleImport({
  onClose,
  onImport,
  onCheck,
  weddingTitle,
  isMock,
  initialRows,
  initialFilename,
}: {
  onClose: () => void;
  onImport?: (input: PlanningImportCommit) => Promise<PlanningImportResult>;
  onCheck?: (
    rows: CoupleRow[],
    decisions?: PlanningImportDecision[],
  ) => Promise<PlanningImportPreview>;
  weddingTitle?: string;
  isMock?: boolean;
  initialRows?: CoupleRow[];
  initialFilename?: string;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "importPage" });
  const { language } = useLanguage();
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [rows, setRows] = useState<CoupleRow[] | null>(initialRows ?? null);
  const [filename, setFilename] = useState(initialFilename ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [seating, setSeating] = useState(false);
  const catalog = defaultGroups;
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<number, string[]>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [checked, setChecked] = useState<{
    signature: string;
    value: PlanningImportPreview;
  } | null>(null);
  const previousCheck = useRef<{
    rowValues: Record<number, string>;
    value: PlanningImportPreview;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [failedCheck, setFailedCheck] = useState<string | null>(null);
  const [actions, setActions] = useState<ImportActions>({});
  const [updates, setUpdates] = useState<Record<number, PlanningImportDecision>>({});
  const [completed, setCompleted] = useState<PlanningImportResult | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const submitted = useRef<PlanningImportCommit | null>(null);
  const activeRows = rows?.filter((row) => !excluded.has(row.line)) ?? [];
  const checkRows = activeRows.filter((row) => !row.errors.length);
  const signatureFor = (nextActions: typeof actions, nextUpdates: typeof updates) =>
    JSON.stringify({
      rows: activeRows.map((row) => ({ line: row.line, values: row.values })),
      decisions: activeRows.map((row) =>
        nextActions[row.line] === "UPDATE" ? nextUpdates[row.line] : nextActions[row.line],
      ),
    });
  const signature = signatureFor(actions, updates);
  const latestSignature = useRef(signature);
  useEffect(() => {
    latestSignature.current = signature;
  }, [signature]);
  const preview = checked?.signature === signature ? checked.value : null;
  const summary = preview ? importSummary(activeRows, preview, actions) : null;
  const canCheck = checkRows.length > 0;
  const hasLocalErrors = activeRows.some((row) => row.errors.length > 0);
  function rowStatus(row: CoupleRow) {
    if (excluded.has(row.line)) return "Đã loại";
    if (
      row.errors.length ||
      preview?.errors.some((issue) => issue.rowNumber === row.line) ||
      serverErrors[row.line]?.length
    )
      return "Lỗi";
    if (!preview) return canCheck ? "Đang kiểm tra" : "Chờ sửa dữ liệu";
    if (actions[row.line] === "SKIP") return "Bỏ qua";
    const check = preview.rows.find((item) => item.rowNumber === row.line);
    if (check?.status === "NEED_DECISION")
      return actions[row.line] ? "Đã chọn tạo riêng" : "Cần quyết định";
    return check?.status === "WARNING" || row.warnings.length ? "Cảnh báo" : "Khách mới";
  }
  async function check() {
    if (!onCheck || !canCheck || checking) return;
    const source = signature;
    setChecking(true);
    setFailedCheck(null);
    setError("");
    try {
      const value = await onCheck(
        checkRows,
        checkRows.flatMap((row): PlanningImportDecision[] => {
          const action = actions[row.line];
          if (action === "UPDATE") {
            const decision = updates[row.line];
            return decision ? [decision] : [];
          }
          return action ? [{ rowNumber: row.line, action }] : [];
        }),
      );
      if (latestSignature.current !== source) return;
      const next = importActions(value);
      // Preserve decisions only for rows whose candidates/diffs have not changed.
      const rowValues = Object.fromEntries(
        checkRows.map((row) => [row.line, JSON.stringify(row.values)]),
      );
      if (previousCheck.current)
        for (const row of value.rows) {
          const action = actions[row.rowNumber];
          if (
            previousCheck.current.rowValues[row.rowNumber] === rowValues[row.rowNumber] &&
            JSON.stringify(row) ===
              JSON.stringify(
                previousCheck.current.value.rows.find((old) => old.rowNumber === row.rowNumber),
              ) &&
            action
          )
            next[row.rowNumber] = action;
        }
      previousCheck.current = { rowValues, value };
      setActions(next);
      setChecked({ signature: source, value });
      setServerErrors({});
      if (value.errors.length)
        setError("Có dòng bị máy chủ từ chối. Sửa hoặc loại dòng đó rồi kiểm tra lại.");
    } catch {
      if (latestSignature.current !== source) return;
      setFailedCheck(source);
      setError("Không kiểm tra được danh sách. File và lựa chọn vẫn được giữ; hãy thử lại.");
    } finally {
      setChecking(false);
    }
  }
  const autoCheck = useEffectEvent(() => {
    void check();
  });
  const hasCheck = !!onCheck;
  useEffect(() => {
    if (
      !hasCheck ||
      !canCheck ||
      busy ||
      saving ||
      checking ||
      completed ||
      uncertain ||
      preview ||
      failedCheck === signature
    )
      return;
    const timer = window.setTimeout(() => autoCheck(), 600);
    return () => window.clearTimeout(timer);
  }, [
    hasCheck,
    canCheck,
    busy,
    saving,
    checking,
    completed,
    uncertain,
    preview,
    failedCheck,
    signature,
  ]);
  async function submit() {
    if (!onImport || saving) return;
    if (!uncertain) {
      if (
        !preview?.previewToken ||
        !summary ||
        summary.unresolved ||
        summary.overQuota ||
        !canCheck ||
        hasLocalErrors ||
        preview.errors.length
      )
        return;
      submitted.current = {
        ...importBody(activeRows),
        previewToken: preview.previewToken,
        decisions: activeRows.flatMap((row) => {
          const action = actions[row.line];
          if (action === "UPDATE") {
            const decision = updates[row.line];
            return decision ? [decision] : [];
          }
          return action ? [{ rowNumber: row.line, action }] : [];
        }),
      };
    }
    if (!submitted.current) return;
    setSaving(true);
    setError("");
    setServerErrors({});
    try {
      setCompleted(await onImport(submitted.current));
      setUncertain(false);
    } catch (e) {
      const issues: Record<number, string[]> = {};
      if (e instanceof ApiError)
        for (const key of Object.keys(e.fieldErrors)) {
          const match = /^rows\.(\d+)\.(\w+)$/.exec(key);
          if (match)
            (issues[Number(match[1])] ??= []).push(
              t("errors.rowField", {
                field: t(`fields.${match[2] ?? "rows"}`, { defaultValue: match[2] }),
              }),
            );
        }
      setServerErrors(issues);
      if (
        !(e instanceof ApiError) ||
        e.status === 0 ||
        e.status >= 500 ||
        e.code === "invalid-response"
      )
        setUncertain(true);
      else {
        setUncertain(false);
        if (e.status === 409) setChecked(null);
      }
      setError(
        Object.keys(issues).length
          ? t("errors.savedNone")
          : e instanceof ApiError && e.status === 409
            ? "Danh sách hoặc quota đã đổi. Kiểm tra lại ngay bên dưới; file và lựa chọn vẫn được giữ."
            : e instanceof ApiError && e.status === 403
              ? "Bạn không còn đủ quyền hoặc quota để import. Kiểm tra quyền và kiểm tra lại danh sách."
              : t("errors.retry"),
      );
    } finally {
      setSaving(false);
    }
  }
  async function choose(file?: File) {
    if (!file) return;
    setFailedCheck(null);
    setExcluded(new Set());
    setChecked(null);
    setActions({});
    setServerErrors({});
    const id = ++request.current;
    setError("");
    setRows(null);
    setSeating(false);
    setFilename(file.name);
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setBusy(false);
      setError(t("errors.fileType"));
      return;
    }
    if (!file.size || file.size > 5 * 1024 * 1024) {
      setBusy(false);
      setError(t("errors.fileSize"));
      return;
    }
    setBusy(true);
    try {
      const data = await readCoupleFile(file);
      if (id !== request.current) return;
      setRows(data);
    } catch {
      if (id === request.current) setError(t("errors.readFile"));
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  const valid = rows?.filter((row) => !row.errors.length) ?? [];
  const total = valid.reduce((sum, row) => sum + (row.expected ?? 0), 0);
  function setSide(line: number, side: string) {
    if (rows)
      setRows(
        validateCoupleRows(
          rows.map((row) => {
            if (row.line !== line) return row;
            const values = [...row.values];
            values[3] = side;
            return { ...row, values };
          }),
        ),
      );
  }
  const normalizedRows = rows?.map((row) => {
    const values = [...row.values];
    values[4] = findGroup(values[4] ?? "", catalog) ?? values[4] ?? "";
    return { ...row, values };
  });
  const localizeRowMessage = (message: string) => {
    const key = rowMessageKeys[message];
    return key ? t(`validation.${key}`) : message;
  };
  const headerLabels: Record<string, string> = {
    "Tên người nhận": t("fields.recipientName"),
    "Danh xưng": t("fields.honorific"),
    "Tổng người dự kiến": t("fields.expectedPeople"),
    "Phía khách mời": t("fields.side"),
    "Nhóm khách": t("fields.group"),
    SĐT: t("fields.phone"),
    "Ghi chú": t("fields.note"),
    Email: t("fields.email"),
  };
  const translatedSide = (value: string) =>
    ({ "Nhà gái": t("enums.bride"), "Nhà trai": t("enums.groom"), Chung: t("enums.shared") })[
      value
    ] ?? value;
  if (completed)
    return (
      <section
        data-guest-import
        aria-label="Kết quả import"
        className="space-y-4 rounded-xl border p-6"
      >
        <h2 className="text-xl font-semibold">Import hoàn tất</h2>
        <p>
          Đã tạo {completed.createdGuestCount} lời mời / {completed.createdPlaceCount} suất; bỏ qua{" "}
          {completed.skippedCount + excluded.size} dòng; cập nhật {completed.updatedGuestCount ?? 0}{" "}
          khách; không thay đổi {completed.noChangeCount ?? 0} dòng;{" "}
          {(completed.tasks ?? []).length} việc cần xử lý.
        </p>
        <ul>
          {completed.items.map((item) => (
            <li key={item.rowNumber}>
              Dòng {item.rowNumber}: đã tạo lời mời — {item.expectedPeople} suất
            </li>
          ))}
          {(completed.updated ?? []).map((item) => (
            <li key={item.rowNumber}>
              Dòng {item.rowNumber}: đã cập nhật khách — {item.expectedPeople} suất
            </li>
          ))}
          {(completed.noChange ?? []).map((item) => (
            <li key={item.rowNumber}>Dòng {item.rowNumber}: không thay đổi</li>
          ))}
          {completed.skipped.map((item) => (
            <li key={item.rowNumber}>Dòng {item.rowNumber}: đã bỏ qua, guest cũ không đổi</li>
          ))}
          {[...excluded].map((line) => (
            <li key={line}>Dòng {line}: đã bỏ qua</li>
          ))}
        </ul>
        {(completed.tasks ?? []).length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold">Việc cần xử lý sau Import</h3>
            {completed.tasks.map((task) => (
              <div key={task.id} className="rounded border p-3">
                <strong>{task.recipientName}</strong>
                <p>{task.reason}</p>
                <a className="underline" href={task.path}>
                  Mở{" "}
                  {task.kind === "SEATING"
                    ? "xếp bàn"
                    : task.kind === "RSVP"
                      ? "RSVP"
                      : "gửi thiệp"}
                </a>
              </div>
            ))}
          </div>
        )}
        <Button onClick={onClose}>Đóng và xem danh sách khách</Button>
      </section>
    );
  if (uncertain)
    return (
      <section
        data-guest-import
        aria-label="Chưa rõ kết quả import"
        className="space-y-4 rounded-xl border p-6"
      >
        <p>
          Chưa xác nhận được kết quả lần gửi. File và lựa chọn vẫn được giữ. Bấm thử lại để nhận kết
          quả của đúng lần gửi đó.
        </p>
        <Button disabled={saving} onClick={() => void submit()}>
          {saving ? "Đang kiểm tra kết quả…" : "Thử lại lần gửi trước"}
        </Button>
      </section>
    );
  if (onImport && rows)
    return (
      <fieldset data-guest-import disabled={saving} className="min-w-0">
        <PlanningImportReview
          rows={rows}
          filename={filename}
          preview={preview}
          actions={actions}
          updates={updates}
          onUpdate={async (decision) => {
            if (!onCheck) return ["Không thể kiểm tra thay đổi lúc này."];
            const nextUpdates = { ...updates, [decision.rowNumber]: decision };
            const nextActions = { ...actions, [decision.rowNumber]: "UPDATE" as const };
            const decisions = checkRows.flatMap((row): PlanningImportDecision[] => {
              const action = nextActions[row.line];
              if (action === "UPDATE") {
                const update = nextUpdates[row.line];
                return update ? [update] : [];
              }
              return action ? [{ rowNumber: row.line, action }] : [];
            });
            const value = await onCheck(checkRows, decisions);
            if (latestSignature.current !== signature)
              return ["Danh sách đã thay đổi. Vui lòng thử lại."];
            const errors = value.errors
              .filter((issue) => issue.rowNumber === decision.rowNumber || issue.rowNumber === 0)
              .map((issue) => issue.message);
            if (errors.length) return [...new Set(errors)];
            if (!value.previewToken) return ["Không thể kiểm tra thay đổi. Vui lòng thử lại."];
            setUpdates(nextUpdates);
            setActions(nextActions);
            setChecked({ signature: signatureFor(nextActions, nextUpdates), value });
            setServerErrors({});
            setFailedCheck(null);
            setError("");
            return [];
          }}
          excluded={excluded}
          serverErrors={serverErrors}
          checking={checking}
          failedCheck={failedCheck === signature}
          saving={saving}
          error={error}
          weddingTitle={weddingTitle}
          isMock={isMock}
          onEdit={(line, values) => {
            const old = rows.find((row) => row.line === line);
            if (old && JSON.stringify(old.values) === JSON.stringify(values)) return;
            setRows(
              validateCoupleRows(rows.map((row) => (row.line === line ? { ...row, values } : row))),
            );
            setExcluded((previous) => {
              const next = new Set(previous);
              next.delete(line);
              return next;
            });
            setActions((previous) => {
              const next = { ...previous };
              delete next[line];
              return next;
            });
            setServerErrors((previous) => ({ ...previous, [line]: [] }));
            setFailedCheck(null);
          }}
          onSkip={(row) => {
            if (
              row.errors.length ||
              serverErrors[row.line]?.length ||
              preview?.errors.some((issue) => issue.rowNumber === row.line) ||
              !preview?.rows.some((item) => item.rowNumber === row.line)
            )
              setExcluded((previous) => new Set([...previous, row.line]));
            else setActions((previous) => ({ ...previous, [row.line]: "SKIP" }));
          }}
          onRestore={(row) => {
            if (excluded.has(row.line))
              setExcluded((previous) => {
                const next = new Set(previous);
                next.delete(row.line);
                return next;
              });
            else
              setActions((previous) => {
                const next = { ...previous };
                if (
                  preview?.rows.find((item) => item.rowNumber === row.line)?.status ===
                  "NEED_DECISION"
                )
                  delete next[row.line];
                else next[row.line] = "CREATE_SEPARATE";
                return next;
              });
          }}
          onCreateSeparate={(line) =>
            setActions((previous) => ({ ...previous, [line]: "CREATE_SEPARATE" }))
          }
          onSkipExact={() =>
            setActions((previous) => ({
              ...previous,
              ...Object.fromEntries(
                preview?.rows
                  .filter((row) =>
                    row.reasons.some((reason) => reason.startsWith("EXACT_DUPLICATE")),
                  )
                  .map((row) => [row.rowNumber, "SKIP"]) ?? [],
              ),
            }))
          }
          onRestart={() => {
            request.current++;
            setRows(null);
            setFilename("");
            setChecked(null);
            setExcluded(new Set());
            setActions({});
            setUpdates({});
            setServerErrors({});
            setFailedCheck(null);
            setError("");
            previousCheck.current = null;
            submitted.current = null;
          }}
          onSubmit={() => void submit()}
          onRetry={() => void check()}
        />
      </fieldset>
    );
  if (seating && normalizedRows)
    return <CoupleSeatingPreview rows={normalizedRows} onBack={() => setSeating(false)} />;
  return (
    <fieldset
      data-guest-import={onImport ? "" : undefined}
      disabled={saving}
      className="min-w-0 space-y-6"
    >
      <Button variant="ghost" onClick={onClose}>
        <ArrowLeft /> {t("headerBack")}
      </Button>
      <header className="space-y-3">
        <h1 className="font-serif text-3xl sm:text-4xl">Nhập khách mời</h1>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        <section
          className="space-y-5 rounded-2xl border bg-card p-6 sm:p-8"
          aria-labelledby="sample-title"
        >
          <FileSpreadsheet className="size-8 text-primary" />
          <h2 id="sample-title" className="font-serif text-2xl">
            Mẫu danh sách khách
          </h2>
          <Button asChild>
            <a href="/templates/khach-moi.xlsx" download>
              <Download /> Tải mẫu Excel
            </a>
          </Button>
        </section>
        <section
          aria-labelledby="upload-title"
          className={`flex flex-col justify-center rounded-2xl border-2 border-dashed p-6 text-center sm:p-8 ${dragging ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (event.dataTransfer.files.length !== 1) setError(t("errors.oneFile"));
            else void choose(event.dataTransfer.files[0]);
          }}
        >
          <Upload className="mx-auto mb-4 size-8 text-primary" />
          <h2 id="upload-title" className="font-serif text-2xl">
            {t("previewTitle")}
          </h2>
          <p className="mb-5 mt-2 text-sm text-muted-foreground">
            {t("dropFile")}
            <br />
            {t("fileLimits")}
          </p>
          <Button
            variant="outline"
            className="mx-auto"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? t("readingFile") : t("chooseFile")}
          </Button>
          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label={t("chooseFileAria")}
            onChange={(event) => {
              void choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </section>
      </div>
      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-medium">
          Hướng dẫn điền file
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="space-y-4 border-t p-4">
          <p className="text-sm text-muted-foreground">
            Giữ nguyên tên và thứ tự 8 cột trong mẫu. Mỗi dòng là một lời mời; thay các dòng ví dụ
            bằng danh sách của bạn. File CSV/XLSX tối đa 5 MB và 500 dòng khách.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Cột</th>
                  <th className="p-2">Cách điền</th>
                  <th className="p-2">Ví dụ</th>
                </tr>
              </thead>
              <tbody>
                {importGuide.map(([name, description, example]) => (
                  <tr key={name} className="border-t align-top">
                    <th scope="row" className="p-2 font-medium">
                      {name}
                    </th>
                    <td className="p-2">{description}</td>
                    <td className="p-2">{example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            Sau khi chọn file, hệ thống tự kiểm tra và hiển thị dòng lỗi hoặc nghi trùng. Bạn có thể
            sửa, loại dòng, chọn bỏ qua hoặc tạo lời mời riêng. Chỉ khi bấm Xác nhận import thì dữ
            liệu mới được lưu; khách đã có không bị sửa.
          </p>
        </div>
      </details>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-card p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {rows && (
        <section
          className="space-y-4 rounded-2xl border bg-card p-5"
          aria-label={t("previewResult")}
        >
          <h2 className="break-all font-serif text-2xl">
            {t("previewResult")} · {filename}
          </h2>
          <p role="status" className="text-sm">
            {t("validRows", { count: formatNumber(valid.length, language) })} ·{" "}
            {t("expectedTotal", { count: formatNumber(total, language) })} ·{" "}
            {t("invalidRows", { count: formatNumber(rows.length - valid.length, language) })} ·{" "}
            {t("invalidRowsNote")}
          </p>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {[
                    t("columnRow"),
                    ...coupleHeaders.map((header) => headerLabels[header] ?? header),
                    t("checkColumn"),
                  ].map((h) => (
                    <th key={h} scope="col" className="p-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-t align-top" key={row.line}>
                    <td className="p-3">
                      {formatNumber(row.line, language)}
                      {onImport && (
                        <label className="mt-2 block text-xs">
                          <input
                            type="checkbox"
                            aria-label={`Loại dòng ${row.line}`}
                            checked={excluded.has(row.line)}
                            onChange={(event) => {
                              const next = new Set(excluded);
                              if (event.target.checked) next.add(row.line);
                              else next.delete(row.line);
                              setExcluded(next);
                            }}
                          />{" "}
                          Loại dòng
                        </label>
                      )}
                    </td>
                    {coupleHeaders.map((h, i) => (
                      <td key={h} className="max-w-64 break-words p-3">
                        {i === 3 ? (
                          <select
                            className="h-9 rounded-lg border bg-background px-2 text-xs"
                            aria-label={`${t("fields.side")} ${formatNumber(row.line, language)}`}
                            value={row.values[3] ?? ""}
                            onChange={(e) => setSide(row.line, e.target.value)}
                          >
                            <option value="">{t("unknownSide")}</option>
                            {row.values[3] &&
                              !["Nhà gái", "Nhà trai", "Chung"].includes(row.values[3]) && (
                                <option value={row.values[3]}>
                                  {translatedSide(row.values[3])} {t("invalidValue")}
                                </option>
                              )}
                            {["Nhà gái", "Nhà trai", "Chung"].map((label) => (
                              <option key={label} value={label}>
                                {translatedSide(label)}
                              </option>
                            ))}
                          </select>
                        ) : onImport && i === 4 ? (
                          <select
                            aria-label={`${headerLabels[h] ?? h} ${formatNumber(row.line, language)}`}
                            className="w-36 rounded border bg-background p-2"
                            value={row.values[i] ?? ""}
                            onChange={(event) =>
                              setRows(
                                validateCoupleRows(
                                  rows.map((r) =>
                                    r.line === row.line
                                      ? {
                                          ...r,
                                          values: r.values.map((value, index) =>
                                            index === 4 ? event.target.value : value,
                                          ),
                                        }
                                      : r,
                                  ),
                                ),
                              )
                            }
                          >
                            <option value="">Khác (mặc định)</option>
                            {row.values[4] && !findGroup(row.values[4], catalog) && (
                              <option value={row.values[4]}>{row.values[4]} — không hợp lệ</option>
                            )}
                            {catalog.map((label) => (
                              <option key={label} value={label}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : onImport ? (
                          <input
                            aria-label={`${headerLabels[h] ?? h} ${formatNumber(row.line, language)}`}
                            className="w-36 rounded border bg-background p-2"
                            value={row.values[i] ?? ""}
                            onChange={(e) => {
                              setRows(
                                validateCoupleRows(
                                  rows.map((r) =>
                                    r.line === row.line
                                      ? {
                                          ...r,
                                          values: r.values.map((v, index) =>
                                            index === i ? e.target.value : v,
                                          ),
                                        }
                                      : r,
                                  ),
                                ),
                              );
                              setServerErrors((current) => ({ ...current, [row.line]: [] }));
                            }}
                          />
                        ) : i === 2 && row.defaulted ? (
                          t("defaultValue")
                        ) : (
                          row.values[i] || "—"
                        )}
                      </td>
                    ))}
                    <td className="min-w-52 p-3">
                      {onImport && (
                        <span className="mb-2 inline-block rounded bg-muted px-2 py-1 text-xs font-semibold">
                          {rowStatus(row)}
                        </span>
                      )}
                      {excluded.has(row.line) && <p>Đã loại khỏi lần import này.</p>}
                      {preview?.errors
                        .filter((issue) => issue.rowNumber === row.line)
                        .map((issue) => (
                          <p key={`${issue.field}-${issue.code}`} className="text-destructive">
                            Máy chủ từ chối {headerLabels[issue.field] ?? issue.field}; sửa hoặc
                            loại dòng.
                          </p>
                        ))}
                      {serverErrors[row.line]?.map((message) => (
                        <p key={message} className="text-destructive">
                          {localizeRowMessage(message)}
                        </p>
                      ))}
                      {row.errors.map((message) => (
                        <p key={message} className="text-destructive">
                          {localizeRowMessage(message)}
                        </p>
                      ))}
                      {row.warnings.map((message) => (
                        <p key={message} className="text-amber-800">
                          {localizeRowMessage(message)}
                        </p>
                      ))}
                      {row.values[4] && !findGroup(row.values[4], catalog) && (
                        <p className="text-amber-800">{t("unknownGroup")}</p>
                      )}
                      {!onImport &&
                        !row.errors.length &&
                        !serverErrors[row.line]?.length &&
                        !row.warnings.length &&
                        (!row.values[4] || !!findGroup(row.values[4], catalog)) && (
                          <span className="text-emerald-700">{t("valid")}</span>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="max-w-xl text-sm text-muted-foreground">
              {onImport ? t("importReview") : t("demoReview")}
            </p>
            <Button
              aria-label={onImport ? "Xác nhận import" : undefined}
              disabled={
                saving ||
                busy ||
                (onImport
                  ? !canCheck ||
                    !preview?.previewToken ||
                    !!preview.errors.length ||
                    !summary ||
                    !!summary.unresolved ||
                    summary.overQuota
                  : !valid.length || total > 500)
              }
              onClick={() => (onImport ? void submit() : setSeating(true))}
            >
              {onImport ? (
                saving ? (
                  t("importing")
                ) : !canCheck ? (
                  "Sửa hoặc loại dòng lỗi"
                ) : !preview ? (
                  "Đang kiểm tra danh sách…"
                ) : summary?.unresolved ? (
                  "Chọn cách xử lý dòng trùng"
                ) : !summary?.created ? (
                  `Xác nhận bỏ qua ${summary?.skipped ?? 0} dòng`
                ) : (
                  t("importButton", {
                    recipients: formatNumber(summary?.created ?? 0, language),
                    guests: formatNumber(summary?.places ?? 0, language),
                  })
                )
              ) : (
                <>
                  <Armchair /> {t("trySeating")}
                </>
              )}
            </Button>
          </div>
          {!onImport && total > 500 && (
            <p className="text-xs text-muted-foreground">{t("demoLimit")}</p>
          )}
        </section>
      )}
    </fieldset>
  );
}
