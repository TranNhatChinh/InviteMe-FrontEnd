"use client";

import { useState } from "react";
import type { PlanningImportPreview } from "../api/planning.api";
import type { CoupleRow } from "../utils/couple-import";
import { importDuplicateContext } from "../utils/planning-import-review";
import { updateFields, updateValue } from "./planning-import-update";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

export function PlanningImportDuplicate({
  row,
  check,
  onUpdate,
  onCreate,
  onSkip,
}: {
  row: CoupleRow;
  check: PlanningImportPreview["rows"][number];
  onUpdate: () => void;
  onCreate: () => void;
  onSkip: () => void;
}) {
  const [choice, setChoice] = useState<"update" | "create" | "skip" | null>(null);
  const context = importDuplicateContext(check, row);
  const guest = context.target?.guest;
  const count = context.target?.differences.find((diff) => diff.field === "expectedPeople");
  const canSelectUpdate = Boolean(context.target && !context.ambiguous);
  const options = [
    {
      value: "update" as const,
      title: "Cập nhật khách cũ",
      description: context.ambiguous
        ? "Cần xác minh khách đích trước khi cập nhật."
        : !context.target
          ? "Chưa xác định được khách trong hệ thống."
          : "Chỉnh thông tin lời mời đã tồn tại.",
      disabled: !canSelectUpdate,
    },
    {
      value: "create" as const,
      title: "Tạo khách mới",
      description: "Tạo lời mời riêng; cần sửa liên hệ bị trùng.",
      disabled: false,
    },
    {
      value: "skip" as const,
      title: "Bỏ qua dòng này",
      description: "Không nhập dòng này.",
      disabled: false,
    },
  ];
  return (
    <div className="mt-3.5 space-y-4 rounded-xl border border-amber-100 bg-[#fffaf0] p-4 text-xs text-amber-950">
      <div className="space-y-1.5">
        {context.candidates.map(({ match, message }) => (
          <p key={match.guestId ?? `row-${match.sourceRowNumber}`} className="font-medium">
            {message}
          </p>
        ))}
        {!context.candidates.length && (
          <p>Chưa xác định được khách hoặc dòng trùng. Hãy kiểm tra dữ liệu trước khi tiếp tục.</p>
        )}
        {context.ambiguous && (
          <p className="font-semibold">
            Thông tin khớp nhiều khách khác nhau. Không tự ghép hoặc cập nhật khách; hãy xác minh và
            sửa liên hệ bị trùng.
          </p>
        )}
      </div>
      {guest && (
        <>
          <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
            <table className="w-full text-left text-xs">
              <caption className="px-3 py-2 text-left font-semibold">
                Đối chiếu với {guest.recipientName} · Khách trong hệ thống
              </caption>
              <thead className="bg-rose-50">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Thông tin
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Khách đã có
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Dữ liệu Excel
                  </th>
                </tr>
              </thead>
              <tbody>
                {updateFields
                  .filter(
                    ([field]) =>
                      ["phone", "email", "expectedPeople"].includes(field) ||
                      context.target?.differences.some((diff) => diff.field === field),
                  )
                  .map(([field, label, index]) => {
                    const diff = context.target?.differences.find((item) => item.field === field);
                    return (
                      <tr key={field} className="border-t border-amber-100">
                        <th scope="row" className="px-3 py-2 font-medium">
                          {label}
                        </th>
                        <td className="max-w-64 break-words px-3 py-2">
                          {updateValue(field, guest[field])}
                        </td>
                        <td
                          className={cn(
                            "max-w-64 break-words px-3 py-2",
                            diff && "bg-rose-50 font-semibold text-rose-900",
                          )}
                        >
                          {diff ? updateValue(field, diff.incoming) : row.values[index] || "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {count && (
            <p>
              Nếu chọn cập nhật số suất: tổng số suất đổi từ <strong>{count.existing}</strong> thành{" "}
              <strong>{count.incoming}</strong>, không cộng thêm {count.incoming} suất.
            </p>
          )}
          {!context.canUpdate && <p>Thông tin giống nhau, không có thay đổi cần cập nhật.</p>}
        </>
      )}
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Bạn muốn xử lý dòng này như thế nào?</legend>
        <div className="grid gap-2 lg:grid-cols-3">
          {options.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-xl border bg-white p-3",
                choice === option.value
                  ? "border-[#a62b4c] ring-1 ring-[#a62b4c]"
                  : "border-stone-200",
                option.disabled && "cursor-not-allowed opacity-55",
              )}
            >
              <input
                type="radio"
                name={`duplicate-${row.line}`}
                value={option.value}
                disabled={option.disabled}
                checked={choice === option.value}
                onChange={() => setChoice(option.value)}
                className="mt-0.5 accent-[#a62b4c]"
              />
              <span>
                <span className="block font-semibold">{option.title}</span>
                <span className="mt-1 block text-stone-600">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!choice || (choice === "update" && !canSelectUpdate)}
          onClick={() => {
            if (choice === "update" && canSelectUpdate) onUpdate();
            else if (choice === "create") onCreate();
            else if (choice === "skip") onSkip();
          }}
        >
          Tiếp tục<span className="sr-only"> xử lý dòng {row.line}</span>
        </Button>
      </div>
    </div>
  );
}
