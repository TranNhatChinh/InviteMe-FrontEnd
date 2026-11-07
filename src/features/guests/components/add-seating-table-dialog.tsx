"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import {
  seatingCapacities,
  type SeatingCapacity,
  type SeatingChange,
  type SeatingPlan,
  type SeatingSide,
} from "../api/planning-seating.api";
import { nextSeatingTableNumber } from "../utils/seating-layout";

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
  slot: TableSlot;
  onCloseSlot: () => void;
  onChange: (change: SeatingChange) => Promise<boolean>;
  error?: string;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "layout" });
  const { scope, isWeddingWide } = usePermission();
  const group = isWeddingWide("SEATING_EDIT") ? "OTHER" : scope("SEATING_EDIT")?.groups[0]?.id;
  const [nameOverride, setName] = useState<string | null>(null);
  const name =
    nameOverride ?? t("defaultTableName", { number: nextSeatingTableNumber(plan.tables) });
  const [capacity, setCapacity] = useState<SeatingCapacity>(10);
  const valid =
    !!name.trim() &&
    name.trim().length <= 100 &&
    seatingCapacities.includes(capacity) &&
    plan.tables.length < 100 &&
    !!group;
  return (
    <Modal
      open
      onClose={() => {
        if (!disabled) onCloseSlot();
      }}
      title={t("addTable")}
      description={`${t(slot.side)} · ${t("position", slot)}`}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (disabled || !valid) return;
          if (
            await onChange({
              action: "CREATE_TABLE",
              name: name.trim(),
              capacity,
              groupId: group,
              ...slot,
            })
          )
            onCloseSlot();
        }}
      >
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <fieldset disabled={disabled} className="space-y-4">
          <label className="block text-sm">
            {t("tableName")}
            <input
              aria-label={t("tableName")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              className="mt-1 block w-full rounded-lg border bg-background p-2"
            />
          </label>
          <label className="block text-sm">
            {t("capacity")}
            <select
              aria-label={t("capacity")}
              value={capacity}
              onChange={(event) => {
                const value = seatingCapacities.find((item) => item === Number(event.target.value));
                if (value !== undefined) setCapacity(value);
              }}
              className="mt-1 block w-full rounded-lg border bg-background p-2"
            >
              {seatingCapacities.map((value) => (
                <option key={value} value={value}>
                  {t("seatOption", { count: value })}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <Button type="submit" disabled={disabled || !valid}>
          {t("addTable")}
        </Button>
      </form>
    </Modal>
  );
}
