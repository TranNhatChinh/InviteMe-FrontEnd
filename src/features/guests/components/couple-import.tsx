"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/i18n/format";
import { useLanguage } from "@/i18n/language-context";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Upload,
  Users,
  Mail,
  Armchair,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  coupleExamples,
  coupleHeaders,
  parseCoupleCsv,
  validateCoupleRows,
  type CoupleRow,
} from "../utils/couple-import";
import { CoupleSeatingPreview } from "./couple-seating-preview";
import { ImportGroupReview } from "./import-group-review";
import {
  addGroup,
  defaultGroups,
  findGroup,
  resolveGroupRows,
  unknownGroups,
} from "../utils/group-catalog";
import { readCoupleFile } from "../utils/read-couple-file";
import { issuesByRow } from "../utils/import-issues";
import { ApiError } from "@/core/api/api-error";
import type { ImportCheckResult } from "../api/planning.api";

const columns = [
  ["recipient", "Nguyễn Văn An"],
  ["honorific", "Bác, Cô, Anh, Chị, Bạn, Dì…"],
  ["expected", "4"],
  ["side", "Nhà gái"],
  ["group", "Bạn đại học"],
  ["phone", "Để trống nếu chưa có"],
  ["note", "Muốn ngồi gần lối ra"],
  ["email", "nam@example.com"],
];

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

export function CoupleImport({
  onClose,
  onImport,
  onCheck,
  groups,
  groupsState = "ready",
  onRetryGroups,
  currentGuests,
}: {
  onClose: () => void;
  onImport?: (rows: CoupleRow[]) => Promise<void>;
  onCheck?: (rows: CoupleRow[], signal?: AbortSignal) => Promise<ImportCheckResult>;
  /** Group names already in the wedding, so rows naming them are not reported as unknown. */
  groups?: readonly string[];
  /** Until the wedding's groups are loaded, every existing group would look unknown, so nothing is asked or imported. */
  groupsState?: "loading" | "error" | "ready";
  onRetryGroups?: () => void;
  /** The wedding's current guests, shown next to the file check to compare duplicates. */
  currentGuests?: ReactNode;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "importPage" });
  const { language } = useLanguage();
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [rows, setRows] = useState<CoupleRow[] | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [seating, setSeating] = useState(false);
  const [addedGroups, setAddedGroups] = useState<string[]>([]);
  const catalog = useMemo(
    () =>
      [...defaultGroups, ...(groups ?? []), ...addedGroups].reduce<string[]>(
        (list, label) => (findGroup(label, list) ? list : [...list, label]),
        [],
      ),
    [groups, addedGroups],
  );
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<number, string[]>>({});
  const [checkState, setCheckState] = useState<{
    key: string;
    result: ImportCheckResult | null;
    failed: boolean;
  }>({
    key: "",
    result: null,
    failed: false,
  });

  const normalizedRows = useMemo(() => {
    return rows?.map((row) => {
      const values = [...row.values];
      values[4] = findGroup(values[4] ?? "", catalog) ?? values[4] ?? "";
      return { ...row, values };
    });
  }, [rows, catalog]);

  const rowsWithoutFormatErrors = useMemo(
    () => normalizedRows?.filter((r) => !r.errors.length) ?? [],
    [normalizedRows],
  );

  const checkKey = useMemo(
    () =>
      rowsWithoutFormatErrors.length
        ? JSON.stringify(rowsWithoutFormatErrors.map((r) => r.values))
        : "",
    [rowsWithoutFormatErrors],
  );

  const checking = Boolean(
    onCheck && rowsWithoutFormatErrors.length > 0 && checkKey !== checkState.key,
  );
  const checkResult = checkKey && checkKey === checkState.key ? checkState.result : null;

  // The dry run is what reports duplicates against the wedding; without it the import is not offered.
  const checkFailed =
    Boolean(onCheck) && checkKey !== "" && checkKey === checkState.key && checkState.failed;

  useEffect(() => {
    // No reset when every row has a format error: checkKey is then "", so an older result is never shown.
    if (!onCheck || !rowsWithoutFormatErrors.length || checkKey === checkState.key) return;

    const key = checkKey;

    const controller = new AbortController();
    onCheck(rowsWithoutFormatErrors, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setCheckState({ key, result: res, failed: false });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCheckState({ key, result: null, failed: true });
        }
      });
    return () => {
      controller.abort();
    };
  }, [onCheck, rowsWithoutFormatErrors, checkKey, checkState.key]);

  const skippedByRow = useMemo(() => issuesByRow(checkResult?.skipped, t), [checkResult, t]);
  const checkErrorsByRow = useMemo(() => issuesByRow(checkResult?.errors, t), [checkResult, t]);
  const checkWarningsByRow = useMemo(() => issuesByRow(checkResult?.warnings, t), [checkResult, t]);
  const countRows = (map: Record<number, string[]>) =>
    Object.keys(map).filter((row) => row !== "0").length;
  // Row 0 = issues about the whole file (for example more than 500 rows), not about one line.
  const fileIssues = [...new Set([...(checkErrorsByRow[0] ?? []), ...(serverErrors[0] ?? [])])];

  const importableRows = useMemo(() => {
    if (!normalizedRows) return [];
    return normalizedRows.filter((row) => {
      if (row.errors.length > 0) return false;
      if (checkErrorsByRow[row.line]?.length) return false;
      if (serverErrors[row.line]?.length) return false;
      if (row.values[4] && !findGroup(row.values[4], catalog)) return false;
      return true;
    });
  }, [normalizedRows, checkErrorsByRow, serverErrors, catalog]);

  const toCreateRows = useMemo(() => {
    return importableRows.filter((r) => !skippedByRow[r.line]?.length);
  }, [importableRows, skippedByRow]);

  const toCreateRecipients = toCreateRows.length;
  const toCreateGuests = toCreateRows.reduce((sum, r) => sum + (r.expected ?? 1), 0);

  const errorRowCount = useMemo(() => {
    if (!rows) return 0;
    return rows.filter(
      (r) =>
        r.errors.length > 0 ||
        Boolean(checkErrorsByRow[r.line]?.length) ||
        Boolean(serverErrors[r.line]?.length),
    ).length;
  }, [rows, checkErrorsByRow, serverErrors]);

  async function submit() {
    if (!onImport || !importableRows.length || saving) return;
    setSaving(true);
    setError("");
    setServerErrors({});
    try {
      await onImport(importableRows);
    } catch (e) {
      let issues: Record<number, string[]> = {};
      if (e instanceof ApiError && e.rowIssues.length) issues = issuesByRow(e.rowIssues, t);
      else if (e instanceof ApiError)
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
      setError(
        Object.keys(issues).length
          ? t("errors.savedNone")
          : e instanceof ApiError && e.backendCode === "PLAN_LIMIT_REACHED"
            ? t("errors.planLimit")
            : e instanceof ApiError && e.status === 403
              ? t("errors.forbidden")
              : e instanceof ApiError && e.status === 409
                ? t("errors.conflict")
                : t("errors.retry"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function trySample(file = "khach-moi-20-nguoi.csv") {
    setServerErrors({});
    const id = ++request.current;
    setBusy(true);
    setError("");
    setRows(null);
    setSeating(false);
    try {
      const response = await fetch(`/templates/${file}`, { cache: "no-store" });
      if (!response.ok) throw new Error(t("errors.missingSample"));
      const content = await response.text();
      if (id !== request.current) return;
      setRows(parseCoupleCsv(content));
      setFilename(file);
    } catch {
      if (id === request.current) setError(t("errors.missingFile"));
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  async function choose(file?: File) {
    if (!file) return;
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
  // importableRows already leaves out rows whose group is not in the catalog yet, so the groups to confirm come from
  // every row that would otherwise be imported; until they are confirmed those rows stay out of the import.
  const pendingGroups =
    groupsState !== "ready"
      ? []
      : unknownGroups(
          rowsWithoutFormatErrors.filter(
            (row) => !checkErrorsByRow[row.line]?.length && !serverErrors[row.line]?.length,
          ),
          catalog,
        );
  const total = toCreateGuests;

  function resolve(key: string, label: string) {
    if (rows) setRows(validateCoupleRows(resolveGroupRows(rows, key, label, catalog)));
  }

  function create(key: string, label: string) {
    if (!rows) return;
    const result = addGroup(catalog, label);
    setAddedGroups((list) => [...list, result.label]);
    setRows(validateCoupleRows(resolveGroupRows(rows, key, result.label, result.catalog)));
  }

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

  if (seating && importableRows.length)
    return <CoupleSeatingPreview rows={importableRows} onBack={() => setSeating(false)} />;

  return (
    <fieldset disabled={saving} className="min-w-0 space-y-6">
      <Button variant="ghost" onClick={onClose}>
        <ArrowLeft /> {t("headerBack")}
      </Button>
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("eyebrow")}</p>
        <h1 className="font-serif text-3xl sm:text-4xl">{t("title")}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{t("intro")}</p>
      </header>
      <ol className="grid gap-3 sm:grid-cols-3" aria-label={t("stepsLabel")}>
        {[t("stepTemplate"), t("stepFill"), onImport ? t("stepImport") : t("stepReview")].map(
          (label, i) => (
            <li
              key={label}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary">
                {i + 1}
              </span>
              {label}
            </li>
          ),
        )}
      </ol>
      <div className="grid gap-5 lg:grid-cols-2">
        <section
          className="space-y-5 rounded-2xl border bg-card p-6 sm:p-8"
          aria-labelledby="sample-title"
        >
          <FileSpreadsheet className="size-8 text-primary" />
          <div>
            <h2 id="sample-title" className="font-serif text-2xl">
              {t("sampleTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("sampleDescription")}</p>
          </div>
          <Button asChild>
            <a href="/templates/khach-moi.xlsx" download>
              <Download /> {t("downloadExcel")}
            </a>
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">{t("excelHelp")}</p>
          <a
            href="/templates/khach-moi.csv"
            download
            className="inline-block text-xs underline underline-offset-4"
          >
            {t("downloadCsv")}
          </a>
          <a className="inline-block text-sm underline underline-offset-4" href="#couple-example">
            {t("showExample")}
          </a>
          <div className="border-t pt-4">
            <Button variant="outline" disabled={busy} onClick={() => void trySample()}>
              {t("trySample")}
            </Button>
            <Button
              className="mt-2"
              variant="outline"
              disabled={busy}
              onClick={() => void trySample("khach-moi-can-xu-ly.csv")}
            >
              {t("tryUnknownGroups")}
            </Button>
            <a
              href="/templates/khach-moi-20-nguoi.csv"
              download
              className="mt-3 block text-xs underline underline-offset-4"
            >
              {t("downloadSampleData")}
            </a>
          </div>
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
          <p className="mt-4 text-xs leading-5 text-muted-foreground">{t("localOnly")}</p>
        </section>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-card p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {rows && groupsState === "loading" && (
        <p role="status" className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
          {t("groupsLoading")}
        </p>
      )}
      {rows && groupsState === "error" && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-5 text-sm"
        >
          <span className="text-destructive">{t("groupsLoadFailed")}</span>
          {onRetryGroups && (
            <Button type="button" variant="outline" size="sm" onClick={onRetryGroups}>
              {t("groupsRetry")}
            </Button>
          )}
        </div>
      )}
      {rows && groupsState === "ready" && (
        <ImportGroupReview rows={rows} catalog={catalog} onResolve={resolve} onCreate={create} />
      )}
      {rows && currentGuests}
      {rows && (
        <section
          className="space-y-4 rounded-2xl border bg-card p-5"
          aria-label={t("previewResult")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="break-all font-serif text-2xl">
              {t("previewResult")} · {filename}
            </h2>
            {checking && (
              <span className="text-xs text-muted-foreground animate-pulse">{t("checking")}</span>
            )}
          </div>
          <p role="status" className="text-sm">
            {checkResult ? (
              [
                toCreateRecipients > 0 && (
                  <span key="summary" className="font-medium text-foreground">
                    {t("checkSummary", {
                      recipients: formatNumber(toCreateRecipients, language),
                      guests: formatNumber(toCreateGuests, language),
                    })}
                  </span>
                ),
                countRows(skippedByRow) > 0 && (
                  <span key="skipped" className="text-muted-foreground">
                    {t("checkSkipped", { count: formatNumber(countRows(skippedByRow), language) })}
                  </span>
                ),
                errorRowCount > 0 && (
                  <span key="errors" className="text-destructive font-medium">
                    {t("checkErrorRows", {
                      count: formatNumber(errorRowCount, language),
                    })}
                  </span>
                ),
                countRows(checkWarningsByRow) > 0 && (
                  <span key="warnings" className="text-amber-800">
                    {t("checkWarningRows", {
                      count: formatNumber(countRows(checkWarningsByRow), language),
                    })}
                  </span>
                ),
                pendingGroups.length > 0 && (
                  <span key="groups" className="text-amber-800">
                    {t("groupsPending", { count: formatNumber(pendingGroups.length, language) })}
                  </span>
                ),
              ]
                .filter(Boolean)
                .flatMap((part, index) => (index ? [" · ", part] : [part]))
            ) : (
              <>
                {t("validRows", { count: formatNumber(valid.length, language) })} ·{" "}
                {t("expectedTotal", { count: formatNumber(total, language) })} ·{" "}
                {t("invalidRows", { count: formatNumber(rows.length - valid.length, language) })} ·{" "}
                {t("groupsPending", { count: formatNumber(pendingGroups.length, language) })}.{" "}
                {t("invalidRowsNote")}
              </>
            )}
          </p>
          {fileIssues.length > 0 && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive"
            >
              <p className="font-medium">{t("fileIssues")}</p>
              {fileIssues.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
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
                    <td className="p-3">{formatNumber(row.line, language)}</td>
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
                      {serverErrors[row.line]?.map((message) => (
                        <p key={message} className="text-destructive">
                          {localizeRowMessage(message)}
                        </p>
                      ))}
                      {checkErrorsByRow[row.line]?.map((message) => (
                        <p key={message} className="text-destructive font-medium text-xs">
                          {message}
                        </p>
                      ))}
                      {row.errors.map((message) => (
                        <p key={message} className="text-destructive">
                          {localizeRowMessage(message)}
                        </p>
                      ))}
                      {checkWarningsByRow[row.line]?.map((message) => (
                        <p key={message} className="text-amber-800 text-xs">
                          {message}
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
                      {skippedByRow[row.line] && (
                        <>
                          <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground font-medium">
                            {t("skippedBadge")}
                          </span>
                          {skippedByRow[row.line]?.map((message) => (
                            <p key={message} className="text-xs text-muted-foreground">
                              {message}
                            </p>
                          ))}
                        </>
                      )}
                      {!row.errors.length &&
                        !serverErrors[row.line]?.length &&
                        !checkErrorsByRow[row.line]?.length &&
                        !row.warnings.length &&
                        !checkWarningsByRow[row.line]?.length &&
                        !skippedByRow[row.line] &&
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
              disabled={
                saving ||
                busy ||
                checking ||
                groupsState !== "ready" ||
                (onImport
                  ? toCreateRecipients === 0 || checkFailed
                  : total > 500 || importableRows.length === 0) ||
                pendingGroups.length > 0
              }
              onClick={() => (onImport ? void submit() : setSeating(true))}
            >
              {onImport ? (
                saving ? (
                  t("importing")
                ) : (
                  t("importButton", {
                    recipients: formatNumber(toCreateRecipients, language),
                    guests: formatNumber(toCreateGuests, language),
                  })
                )
              ) : (
                <>
                  <Armchair /> {t("trySeating")}
                </>
              )}
            </Button>
          </div>
          {checkFailed && (
            <div
              className="flex flex-wrap items-center gap-3 text-xs text-destructive"
              role="alert"
            >
              <p>{t("errors.checkFailed")}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCheckState({ key: "", result: null, failed: false })}
              >
                {t("recheck")}
              </Button>
            </div>
          )}
          {errorRowCount > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {errorRowCount === 1
                ? "1 dòng có chữ đỏ (lỗi) sẽ tự động được bỏ qua và không thêm vào danh sách. Bạn có thể sửa trực tiếp trong bảng trước khi lưu."
                : `${formatNumber(errorRowCount, language)} dòng có chữ đỏ (lỗi) sẽ tự động được bỏ qua và không thêm vào danh sách. Bạn có thể sửa trực tiếp trong bảng trước khi lưu.`}
            </p>
          )}
          {rows && rows.length > 0 && toCreateRecipients === 0 && countRows(skippedByRow) > 0 && (
            <p className="text-xs text-muted-foreground">{t("allSkipped")}</p>
          )}
          {rows && rows.length > 0 && toCreateRecipients === 0 && countRows(skippedByRow) === 0 && (
            <p className="text-xs text-destructive">
              Tất cả các dòng đều có lỗi. Vui lòng sửa ít nhất một dòng hợp lệ trước khi lưu.
            </p>
          )}
          {pendingGroups.length > 0 && (
            <p className="text-xs text-amber-900">
              {t("resolveGroups", { count: formatNumber(pendingGroups.length, language) })}
            </p>
          )}
          {!onImport && total > 500 && (
            <p className="text-xs text-muted-foreground">{t("demoLimit")}</p>
          )}
        </section>
      )}
      <section
        id="couple-example"
        className="scroll-mt-6 overflow-hidden rounded-2xl border bg-card"
      >
        <div className="p-5 sm:p-6">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("exampleEyebrow")}
          </p>
          <h2 className="mt-2 font-serif text-2xl">{t("exampleTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("exampleDescription")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <caption className="sr-only">{t("sampleCaption")}</caption>
            <thead className="bg-muted">
              <tr>
                {coupleHeaders.map((h) => (
                  <th key={h} scope="col" className="px-5 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupleExamples.map((row) => (
                <tr key={row[0]} className="border-t">
                  {row.map((value, i) => (
                    <td key={i} className="px-5 py-4">
                      {value || <span className="text-muted-foreground">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 border-t bg-muted/30 p-5 sm:grid-cols-3">
          {[
            [Mail, t("exampleRecipients"), t("exampleRecipientsDescription")],
            [Users, t("exampleNames"), t("exampleNamesDescription")],
            [Armchair, t("exampleSeats"), t("exampleSeatsDescription")],
          ].map(([Icon, title, description]) => {
            const Symbol = Icon as typeof Mail;
            return (
              <div key={String(title)}>
                <Symbol className="mb-2 size-5 text-primary" />
                <p className="text-sm font-medium">{String(title)}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {String(description)}
                </p>
              </div>
            );
          })}
        </div>
      </section>
      <section aria-labelledby="column-guide">
        <h2 id="column-guide" className="mb-4 font-serif text-2xl">
          {t("columnsTitle")}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {columns.map(([name, example]) => (
            <article key={name} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">{t(`guide.${name}`)}</h3>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                  {name === "recipient"
                    ? t("guide.recipientBadge")
                    : name === "expected"
                      ? t("guide.expectedBadge")
                      : name === "side"
                        ? t("guide.sideBadge")
                        : name === "group"
                          ? t("guide.groupBadge")
                          : t("guide.optional")}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {t(`guide.${name}Description`)}
              </p>
              <p className="mt-3 text-sm">
                {t("columnExample")}{" "}
                <span className="font-medium">
                  {t(`guide.${name}Example`, { defaultValue: example })}
                </span>
              </p>
            </article>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="mb-3 font-serif text-2xl">{t("faqTitle")}</h2>
        {[0, 1, 2, 3, 4].map((index) => (
          <details key={index} className="group border-t py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
              {t(`faq.title.${index}`)}
              <ChevronDown className="size-4 shrink-0 group-open:rotate-180" />
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t(`faq.answer.${index}`)}
            </p>
          </details>
        ))}
      </section>
    </fieldset>
  );
}
