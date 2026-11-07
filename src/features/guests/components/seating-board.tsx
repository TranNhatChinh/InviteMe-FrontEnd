"use client";
import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import type { SeatingChange, SeatingPlan, SeatingSide } from "../api/planning-seating.api";
import type { TableSlot } from "./add-seating-table-dialog";
import {
  hasTableSlot,
  seatingBoardRows,
  sideSlots,
  validSlotMove,
  type SeatingTable,
} from "../utils/seating-layout";

export function SeatingBoard({
  plan,
  editable,
  saving,
  renderTable,
  onChange,
  onAddSlot,
}: {
  plan: SeatingPlan;
  editable: boolean;
  saving: boolean;
  renderTable: (table: SeatingTable) => ReactNode;
  onChange: (input: SeatingChange) => Promise<boolean>;
  onAddSlot: (slot: TableSlot) => void;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "layout" });
  const [arranging, setArranging] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [columns, setColumns] = useState(plan.brideTablesPerRow ?? 2);
  const source = plan.tables.find((table) => table.id === selected);
  const legacy = plan.tables.filter((table) => !hasTableSlot(table));
  const occupied = plan.assignments.length;
  const minimumRows = seatingBoardRows(plan);
  async function selectSlot(side: SeatingSide, row: number, column: number, table?: SeatingTable) {
    const width = side === "BRIDE" ? (plan.brideTablesPerRow ?? 2) : (plan.groomTablesPerRow ?? 2);
    if (arranging && source) {
      if (!validSlotMove(source, side, row, column, width)) return;
      if (
        source.id !== table?.id &&
        !(await onChange({
          action: "MOVE_TABLE_SLOT",
          tableId: source.id,
          targetRow: row,
          targetColumn: column,
        }))
      )
        return;
      setSelected(null);
    } else if (arranging && table) setSelected(table.id);
    else if (!table) onAddSlot({ side, row, column });
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
        {[
          [plan.tables.length, "tables"],
          [occupied, "assigned"],
          [plan.tables.reduce((n, table) => n + table.capacity, 0) - occupied, "emptySeats"],
        ].map(([value, label]) => (
          <div key={label}>
            <strong className="block text-xl text-foreground">{value}</strong>
            {t(String(label))}
          </div>
        ))}
      </div>
      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={arranging ? "outline" : "default"}
            disabled={saving}
            onClick={() => {
              setArranging(false);
              setSelected(null);
            }}
          >
            {t("seatGuests")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={arranging ? "default" : "outline"}
            disabled={saving}
            onClick={() => {
              setArranging(true);
              setSelected(null);
            }}
          >
            {t("arrangeTables")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setColumns(plan.brideTablesPerRow ?? 2);
              setConfirmed(false);
              setSettings(true);
            }}
          >
            {t("settings")}
          </Button>
        </div>
      )}
      {legacy.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("placeLegacyHint", { count: legacy.length })}
        </p>
      )}
      {arranging && (
        <p role="status" className="text-sm">
          {source ? t("chooseTarget", { name: source.name }) : t("chooseSource")}
          {source && (
            <button type="button" className="ml-3 underline" onClick={() => setSelected(null)}>
              {t("cancel")}
            </button>
          )}
        </p>
      )}
      <p className="rounded-xl bg-background/70 py-3 text-center text-sm font-semibold tracking-widest">
        {t("stage")}
      </p>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] xl:gap-3">
        {(["BRIDE", "GROOM"] as const).map((side, index) => {
          const width =
            side === "BRIDE" ? (plan.brideTablesPerRow ?? 2) : (plan.groomTablesPerRow ?? 2);
          return (
            <Fragment key={side}>
              {index === 1 && (
                <div
                  aria-label={t("aisle")}
                  className="hidden items-center justify-center border-x border-dashed border-foreground/15 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground xl:flex"
                >
                  <span className="[writing-mode:vertical-rl]">{t("aisle")}</span>
                </div>
              )}
              <section aria-label={t(side)} className="min-w-0 space-y-3">
                <h3
                  className={`text-center text-sm font-semibold ${side === "BRIDE" ? "text-rose-800" : "text-sky-800"}`}
                >
                  {t(side)}
                </h3>
                <div className="overflow-x-auto pb-2">
                  <div
                    className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-[repeat(var(--seating-columns),minmax(210px,1fr))]"
                    style={{ "--seating-columns": width } as CSSProperties}
                  >
                    {sideSlots(plan.tables, side, width, minimumRows).map(
                      ({ row, column, table }) => (
                        <div
                          key={`${row}:${column}`}
                          data-seating-slot={`${side}:${row}:${column}`}
                          className="relative min-h-[300px] min-w-0"
                        >
                          {table ? (
                            <>
                              <div inert={arranging || undefined} className="h-full">
                                {renderTable(table)}
                              </div>
                              {arranging && (
                                <button
                                  type="button"
                                  disabled={saving || (!!source && source.side !== side)}
                                  aria-pressed={selected === table.id}
                                  aria-label={t("tableSlot", { name: table.name, row, column })}
                                  onClick={() => void selectSlot(side, row, column, table)}
                                  className={`absolute inset-0 z-10 rounded-xl disabled:cursor-not-allowed ${selected === table.id ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-primary/40"}`}
                                >
                                  <span className="sr-only">{table.name}</span>
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={!editable || saving || (!!source && source.side !== side)}
                              aria-label={t("emptySlot", { row, column })}
                              onClick={() => void selectSlot(side, row, column)}
                              className="flex h-full min-h-[300px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-foreground/20 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-default disabled:opacity-50"
                            >
                              <Plus className="size-7 rounded-full border p-1" />
                              <strong className="font-medium">
                                {source ? t("moveHere") : t("addTable")}
                              </strong>
                              <span className="text-xs">{t("empty")}</span>
                            </button>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </section>
            </Fragment>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground">{t("entrance")}</p>
      <Modal
        open={settings}
        onClose={() => {
          if (!saving) setSettings(false);
        }}
        title={t("settings")}
        description={t("reflowDescription")}
      >
        <div className="space-y-4">
          <label className="block text-sm">
            {t("sharedColumns")}
            <select
              aria-label={t("sharedColumns")}
              disabled={saving}
              className="mt-1 block w-full rounded-lg border bg-background p-2"
              value={columns}
              onChange={(e) => {
                setColumns(Number(e.target.value));
                setConfirmed(false);
              }}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("sharedColumnsHint")}
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              disabled={saving}
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1"
            />
            {t("reflowConfirm")}
          </label>
          <Button
            type="button"
            disabled={saving || !confirmed}
            onClick={async () => {
              if (
                await onChange({
                  action: "UPDATE_LAYOUT",
                  brideTablesPerRow: columns,
                  groomTablesPerRow: columns,
                })
              ) {
                setSettings(false);
                setSelected(null);
              }
            }}
          >
            {t("save")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
