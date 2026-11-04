"use client";

import { useState } from "react";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";
import { groupLabels } from "@/shared/lib/planning-groups";
import {
  importBody,
  sideLabels,
  type PlanningImportDecision,
  type PlanningImportPreview,
} from "../api/planning.api";
import { validateCoupleRows, type CoupleRow } from "../utils/couple-import";
import { importReasonLabels } from "../utils/planning-import-review";

export const updateFields = [
  ["recipientName", "Tên người nhận", 0],
  ["honorific", "Danh xưng", 1],
  ["expectedPeople", "Tổng người dự kiến", 2],
  ["side", "Phía khách mời", 3],
  ["group", "Nhóm khách", 4],
  ["phone", "SĐT", 5],
  ["note", "Ghi chú", 6],
  ["email", "Email", 7],
] as const;

export function updateValue(field: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (field === "side") return sideLabels[value as keyof typeof sideLabels] ?? String(value);
  if (field === "group") return groupLabels[value as keyof typeof groupLabels] ?? String(value);
  return String(value);
}

export function PlanningImportUpdateEditor({
  row,
  check,
  current,
  onApply,
  onClose,
}: {
  row: CoupleRow;
  check: PlanningImportPreview["rows"][number];
  current?: PlanningImportDecision;
  onApply: (decision: PlanningImportDecision) => Promise<string[]>;
  onClose: () => void;
}) {
  const candidates = check.matches.filter((x) => x.guestId && x.guest);
  const [target, setTarget] = useState(current?.targetGuestId ?? "");
  const [fields, setFields] = useState<string[]>(current?.selectedFields ?? []);
  const [values, setValues] = useState(() => {
    const draft = [...row.values];
    if (current?.updateValues)
      for (const [field, , index] of updateFields) {
        const value = current.updateValues[field];
        draft[index] = value == null || value === "" ? "" : updateValue(field, value);
      }
    return draft;
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const match = candidates.find((x) => x.guestId === target);
  const guest = match?.guest;
  const incoming = importBody([row]).rows[0];
  if (!incoming) return null;
  return (
    <Modal
      open
      onClose={() => {
        if (!applying) onClose();
      }}
      title={`Cập nhật khách — dòng ${row.line}`}
    >
      <fieldset disabled={applying} className="min-w-0 space-y-4">
        <p className="text-sm">
          Chọn khách hiện có, đánh dấu thông tin cần sửa và nhập giá trị mới.
        </p>
        <label className="block text-sm font-medium">
          Khách cần cập nhật
          <select
            aria-label="Khách cần cập nhật"
            className="mt-1 w-full rounded border p-2"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setFields([]);
            }}
          >
            <option value="">Chọn và xác nhận khách hiện có</option>
            {candidates.map((x) => (
              <option key={x.guestId} value={x.guestId ?? ""}>
                {x.recipientName} · {x.guest?.honorific || "—"} ·{" "}
                {updateValue("side", x.guest?.side)} · {updateValue("group", x.guest?.group)} ·{" "}
                {x.guest?.phone || x.guest?.email || "Không có contact"} · {x.guest?.expectedPeople}{" "}
                suất
              </option>
            ))}
          </select>
        </label>
        <ul className="text-sm text-indigo-800">
          {check.reasons.map((reason) => (
            <li key={reason}>{importReasonLabels[reason] ?? reason}</li>
          ))}
        </ul>
        {guest && (
          <>
            <p className="text-sm font-medium">Đã chọn: {guest.recipientName}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Thông tin cần sửa</th>
                    <th className="p-2">Hiện tại</th>
                    <th className="p-2">Giá trị cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {updateFields.map(([field, label, index]) => {
                    const selected = fields.includes(field);
                    const locked = field === "side" && guest.seated;
                    const options =
                      field === "side"
                        ? ["Nhà gái", "Nhà trai", "Chung"]
                        : field === "group"
                          ? Object.values(groupLabels)
                          : null;
                    const edit = (value: string) => {
                      setValues((previous) =>
                        previous.map((item, i) => (i === index ? value : item)),
                      );
                      setErrors([]);
                    };
                    const inputClass = "w-full min-w-28 rounded border px-2 py-1";
                    return (
                      <tr key={field} className="border-t align-top">
                        <td className="p-2">
                          <label className="flex gap-2">
                            <input
                              type="checkbox"
                              aria-label={`Cập nhật ${label}`}
                              disabled={locked}
                              checked={selected && !locked}
                              onChange={(e) =>
                                setFields((previous) =>
                                  e.target.checked
                                    ? [...previous, field]
                                    : previous.filter((x) => x !== field),
                                )
                              }
                            />
                            {label}
                          </label>
                          {locked && (
                            <p className="mt-1 max-w-64 text-xs text-red-700">
                              Khách đã được xếp chỗ. Hãy gỡ toàn bộ chỗ trước khi thay đổi phía
                              khách mời.
                            </p>
                          )}
                        </td>
                        <td className="max-w-64 break-words p-2">
                          {updateValue(field, guest[field])}
                        </td>
                        <td className="max-w-64 break-words p-2">
                          {selected && !locked ? (
                            options ? (
                              <select
                                aria-label={`Giá trị mới: ${label}`}
                                className={inputClass}
                                value={values[index]}
                                onChange={(e) => edit(e.target.value)}
                              >
                                <option value="">Chọn giá trị</option>
                                {options.map((option) => (
                                  <option key={option}>{option}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                aria-label={`Giá trị mới: ${label}`}
                                className={inputClass}
                                value={values[index]}
                                onChange={(e) => edit(e.target.value)}
                              />
                            )
                          ) : (
                            updateValue(field, incoming[field])
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="space-y-1 rounded bg-amber-50 p-3 text-sm text-amber-900">
              <p>
                Chỉ thông tin được chọn mới cập nhật. Không tự gửi lại thiệp, sửa RSVP hoặc phân
                chỗ.
              </p>
              {guest.seated && fields.some((x) => x === "expectedPeople" || x === "group") && (
                <p>Cần kiểm tra Seating sau khi thay đổi. Các chỗ đã phân không tự thay đổi.</p>
              )}
              {guest.invitationSent &&
                fields.some((x) =>
                  ["phone", "email", "recipientName", "honorific"].includes(x),
                ) && (
                  <p>
                    Thiệp đã gửi hoặc đang chờ gửi: kiểm tra contact/nội dung và việc gửi lại sau
                    import.
                  </p>
                )}
              {fields.includes("expectedPeople") && (
                <p>
                  Máy chủ sẽ kiểm tra lại số người RSVP, suất đã gắn người/chỗ và quota trước khi
                  lưu.
                </p>
              )}
            </div>
          </>
        )}
        {errors.length > 0 && (
          <ul role="alert" className="space-y-1 text-sm text-red-700">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={applying || !guest || !fields.length}
            onClick={async () => {
              if (!guest || !target) return;
              const selected = updateFields.filter(
                ([field]) => fields.includes(field) && !(field === "side" && guest.seated),
              );
              if (!selected.length) return;
              const missing = selected.filter(([, , index]) => !values[index]?.trim());
              if (missing.length) {
                setErrors(
                  missing.map(
                    ([, label]) => `Nhập giá trị mới cho ${label} hoặc bỏ chọn trường này.`,
                  ),
                );
                return;
              }
              const next = [...row.values];
              for (const [, , index] of selected) next[index] = values[index] ?? "";
              const [validated] = validateCoupleRows([{ line: row.line, values: next }]);
              if (!validated) return;
              if (validated.errors.length) {
                setErrors(validated.errors);
                return;
              }
              setErrors([]);
              setApplying(true);
              try {
                const issues = await onApply({
                  rowNumber: row.line,
                  action: "UPDATE",
                  targetGuestId: target,
                  expectedVersion: guest.version,
                  selectedFields: selected.map(([field]) => field),
                  updateValues: importBody([validated]).rows[0],
                });
                if (issues.length) setErrors(issues);
                else onClose();
              } catch {
                setErrors(["Không kiểm tra được thay đổi. Vui lòng thử lại."]);
              } finally {
                setApplying(false);
              }
            }}
          >
            {applying ? "Đang kiểm tra…" : "Áp dụng"}
          </Button>
        </div>
      </fieldset>
    </Modal>
  );
}
