"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import type { SeatingChange, SeatingPlan, SeatingSide } from "../api/planning-seating.api";
import { hasTableSlot } from "../utils/seating-layout";

export type TableSlot = { side: SeatingSide; row: number; column: number };
export function AddSeatingTableDialog({
  plan,
  disabled,
  slot,
  onCloseSlot,
  onChange,
  error,
}: {
  plan: SeatingPlan;
  disabled: boolean;
  slot: TableSlot | null;
  onCloseSlot: () => void;
  onChange: (change: SeatingChange) => Promise<boolean>;
  error?: string;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "layout" });
  const { scope, isWeddingWide } = usePermission();
  const groups = isWeddingWide("SEATING_EDIT")
    ? [
        ...new Map(
          plan.guests.flatMap((guest) =>
            guest.group ? [[guest.group.id, guest.group.name] as const] : [],
          ),
        ).entries(),
      ].map(([id, name]) => ({ id, name }))
    : (scope("SEATING_EDIT")?.groups ?? []);
  const requiresGroup = !isWeddingWide("SEATING_EDIT");
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<SeatingSide>("BRIDE");
  const [name, setName] = useState(`Bàn ${plan.tables.length + 1}`);
  const [capacity, setCapacity] = useState(10),
    [count, setCount] = useState(1);
  const [group, setGroup] = useState(requiresGroup ? (groups[0]?.id ?? "") : "OTHER");
  const [existing, setExisting] = useState(
    slot ? (plan.tables.find((table) => !hasTableSlot(table))?.id ?? "") : "",
  );
  const legacy = plan.tables.filter((table) => !hasTableSlot(table));
  const selected = legacy.find((table) => table.id === existing);
  function close() {
    if (disabled) return;
    setOpen(false);
    onCloseSlot();
  }
  const valid =
    selected ||
    (name.trim().length > 0 &&
      name.trim().length <= 100 &&
      Number.isInteger(capacity) &&
      capacity >= 1 &&
      capacity <= 20 &&
      Number.isInteger(count) &&
      count >= 1 &&
      count + plan.tables.length <= 100 &&
      (!requiresGroup || !!group));
  return (
    <>
      <Button type="button" disabled={disabled} onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {t("addTable")}
      </Button>
      <Modal
        open={open || !!slot}
        onClose={close}
        title={t("addTable")}
        description={slot ? `${t(slot.side)} · ${t("position", slot)}` : t("addAtFirstSlot")}
      >
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (disabled || !valid) return;
            let change: SeatingChange;
            if (selected && slot)
              change = {
                action: "UPDATE_TABLE",
                tableId: selected.id,
                name: selected.name,
                capacity: selected.capacity,
                ...slot,
              };
            else if (count === 1)
              change = {
                action: "CREATE_TABLE",
                name: name.trim(),
                capacity,
                groupId: group,
                side: slot?.side ?? side,
                ...(slot ? { row: slot.row, column: slot.column } : {}),
              };
            else
              change = {
                action: "CREATE_TABLES",
                tableCount: count,
                capacity,
                groupId: group,
                side: slot?.side ?? side,
                ...(slot ? { row: slot.row, column: slot.column } : {}),
              };
            if (await onChange(change)) {
              setOpen(false);
              onCloseSlot();
            }
          }}
        >
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {slot && legacy.length > 0 && (
            <label className="block text-sm">
              {t("tableToPlace")}
              <select
                aria-label={t("tableToPlace")}
                disabled={disabled}
                className="mt-1 block w-full rounded-lg border bg-background p-2"
                value={existing}
                onChange={(e) => setExisting(e.target.value)}
              >
                <option value="">{t("createNew")}</option>
                {legacy.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!selected && (
            <fieldset disabled={disabled} className="space-y-4">
              {!slot && (
                <label className="block text-sm">
                  {t("side")}
                  <select
                    aria-label={t("side")}
                    value={side}
                    onChange={(e) => setSide(e.target.value as SeatingSide)}
                    className="mt-1 block w-full rounded-lg border bg-background p-2"
                  >
                    <option value="BRIDE">{t("BRIDE")}</option>
                    <option value="GROOM">{t("GROOM")}</option>
                  </select>
                </label>
              )}
              <label className="block text-sm">
                {t("tableName")}
                <input
                  aria-label={t("tableName")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                  className="mt-1 block w-full rounded-lg border bg-background p-2"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  {t("capacity")}
                  <input
                    aria-label={t("capacity")}
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={capacity || ""}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                    className="mt-1 block w-full rounded-lg border bg-background p-2"
                  />
                </label>
                <label className="text-sm">
                  {t("tableCount")}
                  <input
                    aria-label={t("tableCount")}
                    type="number"
                    min={1}
                    max={100 - plan.tables.length}
                    required
                    value={count || ""}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="mt-1 block w-full rounded-lg border bg-background p-2"
                  />
                </label>
              </div>
              {(groups.length > 0 || !requiresGroup) && (
                <label className="block text-sm">
                  {t("group")}
                  <select
                    aria-label={t("group")}
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    className="mt-1 block w-full rounded-lg border bg-background p-2"
                  >
                    {!requiresGroup && <option value="OTHER">{t("otherGroup")}</option>}
                    {groups
                      .filter((g) => requiresGroup || g.id !== "OTHER")
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {count > 1 && <p className="text-xs text-muted-foreground">{t("bulkSlots")}</p>}
            </fieldset>
          )}
          <Button type="submit" disabled={disabled || !valid}>
            {selected ? t("placeExisting") : t("addTable")}
          </Button>
        </form>
      </Modal>
    </>
  );
}
