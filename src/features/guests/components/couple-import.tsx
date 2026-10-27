"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
}: {
  onClose: () => void;
  onImport?: (rows: CoupleRow[]) => Promise<void>;
  onCheck?: (rows: CoupleRow[], signal?: AbortSignal) => Promise<ImportCheckResult>;
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
  const [catalog, setCatalog] = useState<string[]>([...defaultGroups]);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<number, string[]>>({});
  const [checkState, setCheckState] = useState<{
    key: string;
    result: ImportCheckResult | null;
  }>({
    key: "",
    result: null,
  });

  const normalizedRows = useMemo(() => {
    return rows?.map((row) => {
      const values = [...row.values];
      values[4] = findGroup(values[4] ?? "", catalog) ?? values[4] ?? "";
      return { ...row, values };
    });
  }, [rows, catalog]);

  const currentKey = normalizedRows ? JSON.stringify(normalizedRows.map((r) => r.values)) : "";
  const checking = Boolean(
    onCheck &&
      normalizedRows &&
      normalizedRows.length &&
      !normalizedRows.some((r) => r.errors.length > 0) &&
      currentKey !== checkState.key,
  );
  const checkResult =
    currentKey && currentKey === checkState.key && !normalizedRows?.some((r) => r.errors.length > 0)
      ? checkState.result
      : null;

  useEffect(() => {
    if (!onCheck || !normalizedRows || !normalizedRows.length) return;
    if (normalizedRows.some((r) => r.errors.length > 0)) return;

    const key = JSON.stringify(normalizedRows.map((r) => r.values));
    if (key === checkState.key) return;

    const controller = new AbortController();
    onCheck(normalizedRows, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setCheckState({ key, result: res });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCheckState({ key, result: null });
        }
      });
    return () => {
      controller.abort();
    };
  }, [onCheck, normalizedRows, checkState.key]);

  const skippedSet = useMemo(
    () => new Set(checkResult?.skipped?.map((s) => s.rowNumber) ?? []),
    [checkResult],
  );

  const checkErrorsByRow = useMemo(() => {
    const map: Record<number, string[]> = {};
    if (checkResult?.errors) {
      for (const issue of checkResult.errors) {
        (map[issue.rowNumber] ??= []).push(issue.message);
      }
    }
    return map;
  }, [checkResult]);

  const checkWarningsByRow = useMemo(() => {
    const map: Record<number, string[]> = {};
    if (checkResult?.warnings) {
      for (const issue of checkResult.warnings) {
        (map[issue.rowNumber] ??= []).push(issue.message);
      }
    }
    return map;
  }, [checkResult]);

  async function submit() {
    if (!onImport || !normalizedRows || saving) return;
    setSaving(true);
    setError("");
    setServerErrors({});
    try {
      await onImport(normalizedRows);
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
      setError(
        Object.keys(issues).length
          ? t("errors.savedNone")
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
  const pendingGroups = unknownGroups(rows ?? [], catalog);
  const total = valid.reduce((sum, row) => sum + (row.expected ?? 0), 0);

  function resolve(key: string, label: string) {
    if (rows) setRows(validateCoupleRows(resolveGroupRows(rows, key, label, catalog)));
  }

  function create(key: string, label: string) {
    if (!rows) return;
    const result = addGroup(catalog, label);
    setCatalog(result.catalog);
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

  if (seating && normalizedRows)
    return <CoupleSeatingPreview rows={normalizedRows} onBack={() => setSeating(false)} />;

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
      {rows && (
        <ImportGroupReview rows={rows} catalog={catalog} onResolve={resolve} onCreate={create} />
      )}
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
              <span className="text-xs text-muted-foreground animate-pulse">
                Đang đối chiếu danh sách…
              </span>
            )}
          </div>
          <p role="status" className="text-sm">
            {checkResult ? (
              <>
                <span className="font-medium text-foreground">
                  {formatNumber(checkResult.guestCount, language)} thiệp sẽ thêm mới (
                  {formatNumber(checkResult.peopleCount, language)} khách)
                </span>
                {checkResult.skipped.length > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="text-muted-foreground">
                      {formatNumber(checkResult.skipped.length, language)} dòng bỏ qua do đã có sẵn
                    </span>
                  </>
                )}
                {checkResult.errors.length > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="text-destructive font-medium">
                      {formatNumber(checkResult.errors.length, language)} dòng cần sửa
                    </span>
                  </>
                )}
                {pendingGroups.length > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="text-amber-800">
                      {t("groupsPending", { count: formatNumber(pendingGroups.length, language) })}
                    </span>
                  </>
                )}
              </>
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
                      {skippedSet.has(row.line) && (
                        <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground font-medium">
                          Đã có sẵn (sẽ bỏ qua khi thêm)
                        </span>
                      )}
                      {!row.errors.length &&
                        !serverErrors[row.line]?.length &&
                        !checkErrorsByRow[row.line]?.length &&
                        !row.warnings.length &&
                        !checkWarningsByRow[row.line]?.length &&
                        !skippedSet.has(row.line) &&
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
                !valid.length ||
                (onImport
                  ? valid.length !== rows.length ||
                    (checkResult !== null &&
                      (checkResult.errors.length > 0 || checkResult.guestCount === 0))
                  : total > 500) ||
                pendingGroups.length > 0
              }
              onClick={() => (onImport ? void submit() : setSeating(true))}
            >
              {onImport ? (
                saving ? (
                  t("importing")
                ) : (
                  t("importButton", {
                    recipients: formatNumber(
                      checkResult ? checkResult.guestCount : valid.length,
                      language,
                    ),
                    guests: formatNumber(
                      checkResult ? checkResult.peopleCount : total,
                      language,
                    ),
                  })
                )
              ) : (
                <>
                  <Armchair /> {t("trySeating")}
                </>
              )}
            </Button>
          </div>
          {checkResult && checkResult.errors.length > 0 && (
            <p className="text-xs text-destructive">
              Vui lòng sửa các dòng bị lỗi trước khi bấm lưu.
            </p>
          )}
          {checkResult && checkResult.guestCount === 0 && checkResult.skipped.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Tất cả các dòng trong file đều đã có sẵn trong danh sách khách.
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
