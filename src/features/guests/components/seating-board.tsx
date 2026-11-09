"use client";
import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Plus, Move, Settings2, Trash2 } from "lucide-react";
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
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SeatingTable | null>(null);
  const [settings, setSettings] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [columns, setColumns] = useState(plan.brideTablesPerRow ?? 2);
  const source = plan.tables.find((table) => table.id === selected);
  useEffect(() => {
    if (!selected) return;
    const cancel = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !(event.target instanceof Element && event.target.closest("dialog"))
      ) {
        event.preventDefault();
        setSelected(null);
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [selected]);
  const arranging = !!source;
  const legacy = plan.tables.filter((table) => !hasTableSlot(table));
  const occupied = plan.assignments.length;
  const minimumRows = seatingBoardRows(plan);
  async function selectSlot(side: SeatingSide, row: number, column: number, table?: SeatingTable) {
    const width = side === "BRIDE" ? (plan.brideTablesPerRow ?? 2) : (plan.groomTablesPerRow ?? 2);
    if (source && !hasTableSlot(source)) {
      if (table) return;
      if (
        await onChange({
          action: "UPDATE_TABLE",
          tableId: source.id,
          name: source.name,
          capacity: source.capacity,
          side,
          row,
          column,
        })
      )
        setSelected(null);
      return;
    }
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
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("settings")}
            title={t("settings")}
            disabled={saving}
            className="size-8 text-muted-foreground"
            onClick={() => {
              setColumns(plan.brideTablesPerRow ?? 2);
              setConfirmed(false);
              setSettings(true);
            }}
          >
            <Settings2 className="size-4" />
          </Button>
        </div>
      )}
      {editable && legacy.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            {t("placeExistingCompact", { count: legacy.length })}
          </summary>
          <label className="mt-2 block">
            {t("tableToPlace")}
            <select
              aria-label={t("tableToPlace")}
              disabled={saving}
              className="ml-2 rounded border bg-background p-2"
              value={source && !hasTableSlot(source) ? source.id : ""}
              onChange={(event) => setSelected(event.target.value || null)}
            >
              <option value="">{t("chooseExisting")}</option>
              {legacy.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1">{t("placeExistingHint")}</p>
        </details>
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
                          className="group relative min-h-[300px] min-w-0"
                        >
                          {table ? (
                            <>
                              <div inert={arranging || undefined} className="h-full">
                                {renderTable(table)}
                              </div>
                              {editable && !arranging && (
                                <>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    aria-label={t("moveTable", { name: table.name })}
                                    title={t("moveTable", { name: table.name })}
                                    onClick={() => setSelected(table.id)}
                                    className="absolute right-12 top-2 z-20 flex size-8 items-center justify-center rounded-full border bg-background/90 text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                                  >
                                    <Move className="size-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={saving}
                                    aria-label={t("deleteTable", { name: table.name })}
                                    title={t("deleteTable", { name: table.name })}
                                    onClick={() => setDeleting(table)}
                                    className="absolute right-2 top-2 z-20 flex size-8 items-center justify-center rounded-full border border-red-200 bg-background/90 text-red-600 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600"
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                </>
                              )}
                              {arranging && (
                                <button
                                  type="button"
                                  disabled={
                                    saving ||
                                    (!!source && (!hasTableSlot(source) || source.side !== side))
                                  }
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
                              disabled={
                                !editable || saving || (!!source?.side && source.side !== side)
                              }
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
        open={!!deleting}
        onClose={() => {
          if (!saving) setDeleting(null);
        }}
        title={t("deleteTable", { name: deleting?.name })}
        description={t("deleteDescription")}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>
            {t("keepTable")}
          </Button>
          <Button
            variant="destructive"
            disabled={saving}
            onClick={async () => {
              if (deleting && (await onChange({ action: "DELETE_TABLE", tableId: deleting.id })))
                setDeleting(null);
            }}
          >
            {t("confirmDelete")}
          </Button>
        </div>
      </Modal>
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
