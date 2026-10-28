"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, UserPlus, Users, X } from "lucide-react";
import { Avatar } from "@/shared/ui/avatar";
import { Chip } from "@/shared/ui/chip";
import { ActionMenu } from "@/shared/ui/action-menu";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/utils";
import { trapDialogFocus } from "@/shared/lib/dialog-focus";
import type { SeatingPlan, PlanningSeatingPlace } from "../api/planning-seating.api";
import type { PlanningGuest } from "../api/planning.api";
import { queuePlaceName } from "./seating-queue";
import { useSeatingDragLock } from "./seating-drag-presence";

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

function TableSeatItem({
  seatNumber,
  isExtra,
  place,
  guest,
  personName,
  placeholder,
  status,
  household,
  adjacent,
  color,
  saving,
  editable,
  onView,
  onAssign,
  onMove,
  onUnassign,
}: {
  seatNumber: number;
  isExtra?: boolean;
  place?: PlanningSeatingPlace;
  guest?: PlanningGuest;
  personName: string;
  placeholder: boolean;
  status: string;
  household?: string;
  adjacent: boolean;
  color?: string;
  saving: boolean;
  editable: boolean;
  onView: (placeId: string, seatNumber: number) => void;
  onAssign: (seatNumber: number) => void;
  onMove: (placeId: string) => void;
  onUnassign: (placeId: string) => void;
}) {
  const assigned = Boolean(place && guest);
  const lock = useSeatingDragLock(place ? [place.id] : []);
  const isLocked = Boolean(lock);

  return (
    <li
      data-seat-number={seatNumber}
      className={cn(
        "relative flex min-h-16 items-center rounded-xl border border-foreground/10 bg-white transition-colors hover:bg-foreground/[0.025]",
        !assigned && "border-dashed",
        isExtra && !assigned && "border-amber-300/80 bg-amber-50/20",
        isLocked && "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20",
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
        aria-label={`Ghế ${seatNumber}${isExtra ? " (ghế phụ)" : ""}, ${personName}${status ? `, ${status.toLocaleLowerCase("vi")}` : ""}`}
        onClick={() => {
          if (isLocked) return;
          if (assigned && place) onView(place.id, seatNumber);
          else onAssign(seatNumber);
        }}
        disabled={isLocked || (!assigned && (!editable || saving))}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] tabular-nums",
            isExtra
              ? "bg-amber-500/20 font-bold text-amber-800 dark:text-amber-300"
              : "bg-foreground/5 text-muted-foreground",
          )}
          aria-hidden="true"
        >
          {seatNumber}
        </span>
        {isExtra && (
          <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            Ghế phụ
          </span>
        )}
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
          {lock && (
            <span className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
              Đang được xử lý bởi {lock.displayName}
            </span>
          )}
        </span>
        {assigned && (
          <Chip
            tone={place?.person?.attendanceStatus === "ATTENDING" ? "success" : "neutral"}
            className="px-1.5 text-[9px]"
          >
            {status}
          </Chip>
        )}
      </button>
      {assigned && place ? (
        <ActionMenu
          label={`Thao tác ghế ${seatNumber}`}
          disabled={saving || isLocked}
          items={[
            { label: "Xem thông tin", onSelect: () => onView(place.id, seatNumber) },
            {
              label: "Chuyển chỗ",
              onSelect: () => onMove(place.id),
              disabled: !editable || isLocked,
            },
            {
              label: "Bỏ xếp",
              onSelect: () => onUnassign(place.id),
              disabled: !editable || isLocked,
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
}

export function SeatingTableDrawer({
  table,
  plan,
  editable,
  saving,
  selectedParty,
  onClose,
  onView,
  onMove,
  onUnassign,
  onAssign,
  onAssignPlace,
  onSave,
  onDelete,
}: {
  table: SeatingPlan["tables"][number];
  plan: SeatingPlan;
  editable: boolean;
  saving: boolean;
  selectedParty?: { guestId: string; placeIds: string[] } | null;
  onClose: () => void;
  onView: (placeId: string, seatNumber: number) => void;
  onMove: (placeId: string) => void;
  onUnassign: (placeId: string) => void;
  onAssign?: (seatNumber: number) => void;
  onAssignPlace: (placeId: string, seatNumber: number) => void;
  onSave: (name: string, capacity: number, tableNumber?: number, extraSeats?: number) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(table.name);
  // Loại bàn: chỉ cho chọn bàn 10 hoặc bàn 12
  const [capacity, setCapacity] = useState<10 | 12>(table.capacity === 12 ? 12 : 10);
  // Ghế linh hoạt kê thêm: 0, 1 hoặc 2 ghế
  const [extraSeats, setExtraSeats] = useState<number>(table.extraSeats ?? 0);
  // Restaurants often number tables themselves; the BE renames a default "Bàn NN" to match.
  const [tableNumber, setTableNumber] = useState(table.number ? String(table.number) : "");
  const [assigningSeatNumber, setAssigningSeatNumber] = useState<number | null>(null);
  const [guestSearch, setGuestSearch] = useState("");
  const [sideFilter, setSideFilter] = useState<"ALL" | "SAME" | "GROOM" | "BRIDE" | "MUTUAL">(
    table.side === "GROOM" || table.side === "BRIDE" ? "SAME" : "ALL",
  );

  const parsedNumber = Number(tableNumber);
  const numberHolder = plan.tables.find((t) => t.id !== table.id && t.number === parsedNumber);
  const numberError = !tableNumber
    ? ""
    : !Number.isInteger(parsedNumber) || parsedNumber < 1 || parsedNumber > 999
      ? "Số bàn phải từ 1 đến 999."
      : numberHolder
        ? `Số ${parsedNumber} đang thuộc ${numberHolder.name}.`
        : "";
  const numberChanged = !!tableNumber && parsedNumber !== table.number;
  const confirmationRef = useRef<HTMLDialogElement>(null);
  const id = useId();

  const members = plan.assignments.filter((a) => a.tableId === table.id);
  const occupied = members.length;
  const currentTotal = table.capacity + (table.extraSeats ?? 0);
  const free = Math.max(0, currentTotal - occupied);
  const minimum = Math.max(1, ...members.map((a) => a.seatNumber));
  const newTotal = capacity + extraSeats;

  const capacityError =
    newTotal < minimum
      ? `Đang có ${occupied} khách (ghế số ${minimum} đang dùng). Vui lòng bỏ xếp bớt khách trước khi giảm số ghế.`
      : "";

  const dirty =
    name.trim() !== table.name ||
    capacity !== table.capacity ||
    extraSeats !== (table.extraSeats ?? 0) ||
    numberChanged;
  const valid = !!name.trim() && !capacityError && !numberError;

  // Render rows up to total capacity (capacity + extraSeats)
  const rows = Array.from({ length: currentTotal }, (_, index) => {
    const seatNumber = index + 1;
    const isExtra = seatNumber > table.capacity;
    const assignment = members.find((a) => a.seatNumber === seatNumber);
    const place = plan.places.find((p) => p.id === assignment?.placeId);
    const guest = plan.guests.find((g) => g.id === place?.guestId);
    return { seatNumber, isExtra, place, guest };
  });

  // Calculate unseated guests for the picker
  const assignedPlaceIds = useMemo(
    () => new Set(plan.assignments.map((a) => a.placeId)),
    [plan.assignments],
  );

  const unseatedGuests = useMemo(() => {
    return plan.places
      .filter((place) => {
        if (assignedPlaceIds.has(place.id)) return false;
        if (place.person?.attendanceStatus === "DECLINED") return false;
        return true;
      })
      .map((place) => {
        const guest = plan.guests.find((g) => g.id === place.guestId);
        const name = guest ? queuePlaceName(place, guest) : place.person?.fullName || "Khách mời";
        const groupName = guest?.group?.name;
        const side = guest?.side;
        const isVip =
          Boolean(guest?.note?.toLowerCase().includes("vip")) ||
          (guest?.honorific ? /ông|bà|bác/i.test(guest.honorific) : false);
        const attendance = place.person?.attendanceStatus ?? "PENDING";
        const phone = guest?.phone;
        const isCompanion = place.position > 1;
        const companionOf = isCompanion && guest ? guest.recipientName : undefined;
        const isSelectedParty = selectedParty?.placeIds?.includes(place.id) ?? false;
        return {
          place,
          guest,
          name,
          groupName,
          side,
          isVip,
          attendance,
          phone,
          isCompanion,
          companionOf,
          isSelectedParty,
        };
      });
  }, [plan.places, plan.guests, assignedPlaceIds, selectedParty]);

  const filteredUnseatedGuests = useMemo(() => {
    let list = unseatedGuests;
    if (sideFilter === "SAME") {
      if (table.side === "GROOM" || table.side === "BRIDE") {
        list = list.filter((g) => g.side === table.side || g.side === "MUTUAL" || !g.side);
      }
    } else if (sideFilter === "GROOM") {
      list = list.filter((g) => g.side === "GROOM");
    } else if (sideFilter === "BRIDE") {
      list = list.filter((g) => g.side === "BRIDE");
    } else if (sideFilter === "MUTUAL") {
      list = list.filter((g) => g.side === "MUTUAL");
    }

    if (guestSearch.trim()) {
      const q = guestSearch.trim().toLowerCase();
      list = list.filter((g) => {
        return (
          g.name.toLowerCase().includes(q) ||
          (g.phone && g.phone.toLowerCase().includes(q)) ||
          (g.groupName && g.groupName.toLowerCase().includes(q)) ||
          (g.companionOf && g.companionOf.toLowerCase().includes(q))
        );
      });
    }

    // Sort: selected party first, then alphabetical
    return [...list].sort((a, b) => {
      if (a.isSelectedParty && !b.isSelectedParty) return -1;
      if (!a.isSelectedParty && b.isSelectedParty) return 1;
      return a.name.localeCompare(b.name, "vi");
    });
  }, [unseatedGuests, sideFilter, guestSearch, table.side]);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (editable && !saving && dirty && valid)
          onSave(name.trim(), capacity, numberChanged ? parsedNumber : undefined, extraSeats);
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
                {table.number ? `Bàn ${String(table.number).padStart(2, "0")} · ` : ""}
                {table.name}
              </h2>
              {table.isVip && (
                <Chip tone="accent" className="bg-amber-500/20 font-bold text-amber-700">
                  👑 VIP
                </Chip>
              )}
              {table.side && (
                <Chip tone={table.side === "BRIDE" ? "danger" : "accent"}>
                  {table.side === "GROOM"
                    ? "Nhà trai"
                    : table.side === "BRIDE"
                      ? "Nhà gái"
                      : "Bàn chung"}
                </Chip>
              )}
              <Chip tone={occupied === currentTotal ? "success" : "neutral"}>
                {!occupied ? "Trống" : !free ? "Đầy" : `Còn ${free} chỗ`}
              </Chip>
              {(table.extraSeats ?? 0) > 0 && (
                <Chip tone="accent" className="border-amber-300 bg-amber-100 text-amber-800">
                  +{table.extraSeats} ghế kê thêm
                </Chip>
              )}
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
            aria-valuemax={currentTotal}
            aria-valuenow={occupied}
            aria-valuetext={`${occupied}/${currentTotal} chỗ đã xếp`}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/5"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${(occupied / currentTotal) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            <strong className="font-semibold text-foreground">{occupied}</strong>/{currentTotal} chỗ
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
          <span className="text-[11px] text-muted-foreground">
            {currentTotal} ghế
            {(table.extraSeats ?? 0) > 0
              ? ` (${table.capacity} tiêu chuẩn + ${table.extraSeats} kê thêm)`
              : ""}
          </span>
        </div>
        <ol className="space-y-2">
          {rows.map(({ seatNumber, isExtra, place, guest }, index) => {
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
              <TableSeatItem
                key={seatNumber}
                seatNumber={seatNumber}
                isExtra={isExtra}
                place={place}
                guest={guest}
                personName={personName}
                placeholder={placeholder}
                status={status}
                household={household}
                adjacent={adjacent}
                color={color}
                saving={saving}
                editable={editable}
                onView={onView}
                onAssign={(num) => {
                  setAssigningSeatNumber(num);
                  onAssign?.(num);
                }}
                onMove={onMove}
                onUnassign={onUnassign}
              />
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
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_8rem_7rem] items-start gap-2.5">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-number`} className="text-[11px] text-muted-foreground">
                Số bàn
              </Label>
              <Input
                id={`${id}-number`}
                name="number"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                aria-label="Sửa số bàn"
                aria-invalid={!!numberError}
                aria-describedby={numberError ? `${id}-number-error` : undefined}
                value={tableNumber}
                onChange={(event) => setTableNumber(event.target.value)}
                disabled={saving}
                className="h-[42px] border-foreground/15 bg-white shadow-none tabular-nums"
              />
            </div>
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
                className="h-[42px] border-foreground/15 bg-white shadow-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-capacity`} className="text-[11px] text-muted-foreground">
                Loại bàn
              </Label>
              <select
                id={`${id}-capacity`}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value) as 10 | 12)}
                disabled={saving}
                className="h-[42px] w-full rounded-md border border-foreground/15 bg-white px-2 text-xs font-semibold shadow-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <option value={10}>Bàn 10 ghế (Chuẩn)</option>
                <option value={12}>Bàn 12 ghế (Lớn)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-extra`} className="text-[11px] text-muted-foreground">
                Kê thêm ghế
              </Label>
              <select
                id={`${id}-extra`}
                value={extraSeats}
                onChange={(e) => setExtraSeats(Number(e.target.value))}
                disabled={saving}
                className="h-[42px] w-full rounded-md border border-foreground/15 bg-white px-2 text-xs font-semibold shadow-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <option value={0}>0 (Không kê)</option>
                <option value={1}>+1 ghế phụ</option>
                <option value={2}>+2 ghế phụ</option>
              </select>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-1.5 text-xs">
            <span className="text-muted-foreground">Tổng số ghế thực tế:</span>
            <span className="font-semibold text-foreground">
              {capacity + extraSeats} chỗ
              {extraSeats > 0 ? ` (${capacity} tiêu chuẩn + ${extraSeats} ghế phụ)` : " (tiêu chuẩn)"}
            </span>
          </div>
          {numberError && (
            <p id={`${id}-number-error`} role="alert" className="mt-2 text-[11px] text-destructive">
              {numberError}
            </p>
          )}
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
            <Button
              type="submit"
              className="min-h-11 flex-1"
              disabled={saving || !dirty || !valid}
            >
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 border-foreground/15 bg-white hover:bg-foreground/5"
            onClick={onClose}
          >
            Đóng
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

      {/* Guest Picker Modal when clicking "+ Xếp vào đây" */}
      {assigningSeatNumber !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guest-picker-dialog-title"
          onKeyDown={(e) => {
            if (e.key === "Escape") setAssigningSeatNumber(null);
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 id="guest-picker-dialog-title" className="text-lg font-semibold text-foreground">
                  Xếp khách vào Ghế {assigningSeatNumber}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {table.number ? `Bàn ${String(table.number).padStart(2, "0")} · ` : ""}
                  {table.name} · {unseatedGuests.length} khách chưa xếp bàn
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setAssigningSeatNumber(null)}
                className="size-8 rounded-full"
                aria-label="Đóng chọn khách"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* Search & Filters */}
            <div className="space-y-2.5 border-b border-border bg-muted/20 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Tìm theo tên khách, số điện thoại, nhóm..."
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  className="h-10 bg-background pl-9"
                  autoFocus
                />
                {guestSearch && (
                  <button
                    type="button"
                    onClick={() => setGuestSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Xoá
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSideFilter("ALL")}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 transition-colors",
                    sideFilter === "ALL"
                      ? "border-primary bg-primary font-medium text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  Tất cả ({unseatedGuests.length})
                </button>
                {(table.side === "GROOM" || table.side === "BRIDE") && (
                  <button
                    type="button"
                    onClick={() => setSideFilter("SAME")}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 transition-colors",
                      sideFilter === "SAME"
                        ? "border-primary bg-primary font-medium text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    Cùng phía {table.side === "GROOM" ? "(Nhà trai)" : "(Nhà gái)"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSideFilter("GROOM")}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 transition-colors",
                    sideFilter === "GROOM"
                      ? "border-primary bg-primary font-medium text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  Nhà trai
                </button>
                <button
                  type="button"
                  onClick={() => setSideFilter("BRIDE")}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 transition-colors",
                    sideFilter === "BRIDE"
                      ? "border-primary bg-primary font-medium text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  Nhà gái
                </button>
                <button
                  type="button"
                  onClick={() => setSideFilter("MUTUAL")}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 transition-colors",
                    sideFilter === "MUTUAL"
                      ? "border-primary bg-primary font-medium text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  Chung
                </button>
              </div>
            </div>

            {/* Guest List */}
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {filteredUnseatedGuests.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <Users className="mx-auto mb-2 size-8 opacity-40" />
                  {unseatedGuests.length === 0
                    ? "Tất cả khách mời đã được xếp chỗ vào các bàn!"
                    : "Không tìm thấy khách mời nào phù hợp với bộ lọc."}
                </div>
              ) : (
                filteredUnseatedGuests.map((item) => (
                  <div
                    key={item.place.id}
                    className={cn(
                      "flex items-center justify-between rounded-xl border p-3 transition-colors hover:border-primary/50",
                      item.isSelectedParty
                        ? "border-primary/40 bg-primary/[0.03]"
                        : "border-border/80 bg-background",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={item.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">{item.name}</span>
                          {item.isSelectedParty && (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                              Đang chọn
                            </span>
                          )}
                          {item.isVip && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                              👑 VIP
                            </span>
                          )}
                          {item.side && (
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                item.side === "GROOM"
                                  ? "bg-sky-500/15 text-sky-700"
                                  : item.side === "BRIDE"
                                    ? "bg-rose-500/15 text-rose-700"
                                    : "bg-muted text-muted-foreground",
                              )}
                            >
                              {item.side === "GROOM"
                                ? "Nhà trai"
                                : item.side === "BRIDE"
                                  ? "Nhà gái"
                                  : "Chung"}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          {item.groupName && <span>{item.groupName}</span>}
                          {item.companionOf && <span>Thuộc thiệp: {item.companionOf}</span>}
                          {item.guest?.honorific && <span>Danh xưng: {item.guest.honorific}</span>}
                          {item.phone && <span>· {item.phone}</span>}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={saving}
                      onClick={() => {
                        onAssignPlace(item.place.id, assigningSeatNumber);
                        setAssigningSeatNumber(null);
                      }}
                      className="ml-3 shrink-0 gap-1 text-xs"
                    >
                      <UserPlus className="size-3.5" />
                      Xếp vào ghế
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
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
          Xoá {table.number ? `Bàn ${String(table.number).padStart(2, "0")} · ` : ""}{table.name}?
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
