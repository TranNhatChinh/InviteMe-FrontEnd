"use client";

import { useId, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Avatar } from "@/shared/ui/avatar";
import { Chip } from "@/shared/ui/chip";
import { ActionMenu } from "@/shared/ui/action-menu";
import { NumberStepper } from "@/shared/ui/number-stepper";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/utils";
import { trapDialogFocus } from "@/shared/lib/dialog-focus";
import type { SeatingPlan } from "../api/planning-seating.api";
import { queuePlaceName } from "./seating-queue";

const attendanceLabels: Record<string, string> = {
  ATTENDING: "Đã xác nhận",
  PENDING: "Chưa xác nhận",
  DECLINED: "Từ chối",
  WAITLISTED: "Đang chờ",
};
const groupColors = [
  "bg-sky-300",
  "bg-amber-300",
  "bg-violet-300",
  "bg-teal-300",
  "bg-indigo-300",
  "bg-orange-300",
];

export function SeatingTableDrawer({
  table,
  plan,
  editable,
  saving,
  onClose,
  onView,
  onMove,
  onUnassign,
  onAssign,
  onSave,
  onDelete,
}: {
  table: SeatingPlan["tables"][number];
  plan: SeatingPlan;
  editable: boolean;
  saving: boolean;
  onClose: () => void;
  onView: (placeId: string, seatNumber: number) => void;
  onMove: (placeId: string) => void;
  onUnassign: (placeId: string) => void;
  onAssign: (seatNumber: number) => void;
  onSave: (name: string, capacity: number) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(table.name);
  const [capacity, setCapacity] = useState(String(table.capacity));
  const confirmationRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  const members = plan.assignments.filter((a) => a.tableId === table.id);
  const occupied = members.length;
  const free = table.capacity - occupied;
  const minimum = Math.max(1, ...members.map((a) => a.seatNumber));
  const number = Number(capacity);
  const capacityError =
    capacity && number < minimum
      ? `Đang có ${occupied} khách, bỏ xếp trước khi giảm${minimum > occupied ? ` (ghế cao nhất đang dùng: ${minimum})` : ""}.`
      : !capacity || !Number.isInteger(number) || number < 1 || number > 20
        ? "Số ghế phải từ 1 đến 20."
        : "";
  const dirty = name.trim() !== table.name || number !== table.capacity;
  const valid = !!name.trim() && !capacityError;
  const rows = Array.from({ length: table.capacity }, (_, index) => {
    const seatNumber = index + 1;
    const assignment = members.find((a) => a.seatNumber === seatNumber);
    const place = plan.places.find((p) => p.id === assignment?.placeId);
    const guest = plan.guests.find((g) => g.id === place?.guestId);
    return { seatNumber, place, guest };
  });
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (editable && !saving && dirty && valid) onSave(name.trim(), number);
      }}
    >
      <header className="shrink-0 border-b border-foreground/10 px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Thông tin bàn
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="seating-details-title"
                data-drawer-heading
                tabIndex={-1}
                className="min-w-0 break-words font-display text-2xl outline-none"
              >
                {table.name}
              </h2>
              <Chip tone={occupied === table.capacity ? "success" : "neutral"}>
                {!occupied ? "Trống" : !free ? "Đầy" : `Còn ${free} chỗ`}
              </Chip>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-muted-foreground outline-none hover:bg-foreground/5 focus-visible:ring-1 focus-visible:ring-offset-0"
            aria-label="Đóng thông tin bàn ghế"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Số chỗ đã xếp"
            aria-valuemin={0}
            aria-valuemax={table.capacity}
            aria-valuenow={occupied}
            aria-valuetext={`${occupied}/${table.capacity} chỗ đã xếp`}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/5"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${(occupied / table.capacity) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            <strong className="font-semibold text-foreground">{occupied}</strong>/{table.capacity}{" "}
            chỗ
          </span>
        </div>
      </header>

      <section
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
        aria-label="Danh sách ghế trong bàn"
        tabIndex={0}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold">Danh sách ghế</h3>
          <span className="text-[11px] text-muted-foreground">{table.capacity} ghế</span>
        </div>
        <ol className="space-y-2">
          {rows.map(({ seatNumber, place, guest }, index) => {
            const assigned = !!place && !!guest;
            const placeholder = assigned && !place.person && place.position > 1;
            const personName = assigned ? queuePlaceName(place, guest) : "Ghế trống";
            const status = assigned
              ? (attendanceLabels[place.person?.attendanceStatus ?? "PENDING"] ?? "Chưa xác nhận")
              : "";
            const household =
              assigned &&
              (guest.invitationKind !== "INDIVIDUAL" ||
                plan.places.filter((p) => p.guestId === guest.id).length > 1)
                ? `${guest.invitationKind === "FAMILY" ? "Gia đình" : "Nhóm"} ${guest.honorific ? guest.honorific.toLocaleLowerCase("vi") + " " : ""}${guest.recipientName}`
                : guest?.group?.name;
            const adjacent =
              assigned &&
              (rows[index - 1]?.guest?.id === guest.id || rows[index + 1]?.guest?.id === guest.id);
            const color = guest
              ? groupColors[
                  Array.from(guest.id).reduce((n, c) => n + c.charCodeAt(0), 0) % groupColors.length
                ]
              : undefined;
            return (
              <li
                key={seatNumber}
                data-seat-number={seatNumber}
                className={cn(
                  "relative flex min-h-16 items-center rounded-xl border border-foreground/10 bg-white transition-colors hover:bg-foreground/[0.025]",
                  !assigned && "border-dashed",
                )}
              >
                {adjacent && (
                  <span
                    aria-hidden="true"
                    className={cn("absolute bottom-3 left-0 top-3 w-0.5 rounded-full", color)}
                  />
                )}
                <button
                  type="button"
                  className="flex min-h-16 min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  aria-label={`Ghế ${seatNumber}, ${personName}${status ? `, ${status.toLocaleLowerCase("vi")}` : ""}`}
                  onClick={() => (assigned ? onView(place.id, seatNumber) : onAssign(seatNumber))}
                  disabled={!assigned && (!editable || saving)}
                >
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-[10px] tabular-nums text-muted-foreground"
                    aria-hidden="true"
                  >
                    {seatNumber}
                  </span>
                  <Avatar name={personName} placeholder={placeholder || !assigned} />
                  <span className="min-w-0 flex-1">
                    <span
                      title={personName}
                      className={cn(
                        "block truncate text-xs font-semibold",
                        placeholder && "font-normal italic text-muted-foreground",
                        !assigned && "font-normal text-muted-foreground",
                      )}
                    >
                      {personName}
                    </span>
                    {household && (
                      <span
                        title={household}
                        className="mt-1 block truncate text-[10px] text-muted-foreground"
                      >
                        {household}
                      </span>
                    )}
                  </span>
                  {assigned && (
                    <Chip
                      tone={place.person?.attendanceStatus === "ATTENDING" ? "success" : "neutral"}
                      className="px-1.5 text-[9px]"
                    >
                      {status}
                    </Chip>
                  )}
                </button>
                {assigned ? (
                  <ActionMenu
                    label={`Thao tác ghế ${seatNumber}`}
                    disabled={saving}
                    items={[
                      { label: "Xem thông tin", onSelect: () => onView(place.id, seatNumber) },
                      {
                        label: "Chuyển chỗ",
                        onSelect: () => onMove(place.id),
                        disabled: !editable,
                      },
                      {
                        label: "Bỏ xếp",
                        onSelect: () => onUnassign(place.id),
                        disabled: !editable,
                        destructive: true,
                      },
                    ]}
                  />
                ) : (
                  editable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mr-1 min-h-11 shrink-0 gap-1 px-2 text-[10px] text-muted-foreground hover:bg-foreground/5"
                      disabled={saving}
                      onClick={() => onAssign(seatNumber)}
                    >
                      <Plus aria-hidden="true" />
                      Xếp vào đây
                    </Button>
                  )
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {editable && (
        <section
          className="shrink-0 border-t border-foreground/10 bg-white px-5 py-3"
          aria-labelledby={`${id}-edit`}
        >
          <h3 id={`${id}-edit`} className="mb-3 text-xs font-semibold">
            Chỉnh sửa bàn
          </h3>
          <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-start gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-name`} className="text-[11px] text-muted-foreground">
                Tên bàn
              </Label>
              <Input
                id={`${id}-name`}
                name="name"
                aria-label="Sửa tên bàn"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
                disabled={saving}
                className="h-[46px] border-foreground/15 bg-white shadow-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-capacity`} className="text-[11px] text-muted-foreground">
                Số ghế
              </Label>
              <NumberStepper
                id={`${id}-capacity`}
                label="Số ghế"
                value={capacity}
                onChange={setCapacity}
                min={minimum}
                max={20}
                disabled={saving}
                invalid={!!capacityError}
                describedBy={capacityError ? `${id}-error` : undefined}
              />
            </div>
          </div>
          {capacityError && (
            <p id={`${id}-error`} role="alert" className="mt-2 text-[11px] text-destructive">
              {capacityError}
            </p>
          )}
        </section>
      )}

      <footer className="shrink-0 border-t border-foreground/10 bg-white px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          {editable && (
            <Button type="submit" className="min-h-11 flex-1" disabled={saving || !dirty || !valid}>
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 border-foreground/15 bg-white hover:bg-foreground/5"
            onClick={onClose}
          >
            Huỷ
          </Button>
        </div>
        {editable && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-0 text-[11px] text-destructive hover:bg-transparent hover:text-destructive/80"
              disabled={saving || occupied > 0}
              onClick={() => confirmationRef.current?.showModal()}
            >
              <Trash2 aria-hidden="true" />
              Xoá bàn
            </Button>
            {!!occupied && (
              <span className="text-[10px] text-muted-foreground">Chỉ xoá được bàn trống</span>
            )}
          </div>
        )}
      </footer>

      <dialog
        ref={confirmationRef}
        onKeyDown={trapDialogFocus}
        onClose={(event) => event.stopPropagation()}
        onCancel={(event) => event.stopPropagation()}
        aria-labelledby={`${id}-delete-title`}
        aria-describedby={`${id}-delete-description`}
        className="fixed left-1/2 top-1/2 m-0 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-foreground/10 bg-white p-5 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <h3 id={`${id}-delete-title`} className="text-lg font-semibold">
          Xoá {table.name}?
        </h3>
        <p id={`${id}-delete-description`} className="mt-2 text-sm text-muted-foreground">
          Bàn trống này sẽ bị xoá khỏi sơ đồ. Bạn có chắc muốn tiếp tục?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 border-foreground/15 bg-white"
            onClick={() => confirmationRef.current?.close()}
          >
            Giữ lại
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            disabled={saving || occupied > 0}
            onClick={() => {
              confirmationRef.current?.close();
              onDelete();
            }}
          >
            Xoá bàn
          </Button>
        </div>
      </dialog>
    </form>
  );
}
