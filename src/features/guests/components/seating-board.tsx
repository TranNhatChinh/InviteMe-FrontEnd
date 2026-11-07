"use client";
import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import type { SeatingChange, SeatingPlan, SeatingSide } from "../api/planning-seating.api";
import { hasTableSlot, sideSlots, validSlotMove, type SeatingTable } from "../utils/seating-layout";

export function SeatingBoard({
  plan,
  editable,
  saving,
  renderTable,
  onChange,
  onInspect,
}: {
  plan: SeatingPlan;
  editable: boolean;
  saving: boolean;
  renderTable: (table: SeatingTable) => ReactNode;
  onChange: (input: SeatingChange) => Promise<boolean>;
  onInspect: (table: SeatingTable) => void;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "layout" });
  const [arranging, setArranging] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [bride, setBride] = useState(plan.brideTablesPerRow ?? 2),
    [groom, setGroom] = useState(plan.groomTablesPerRow ?? 2);
  const [confirmed, setConfirmed] = useState(false);
  const source = plan.tables.find((table) => table.id === selected);
  const legacy = plan.tables.filter((table) => !hasTableSlot(table));
  const occupied = plan.assignments.length;
  async function selectSlot(side: SeatingSide, row: number, column: number, table?: SeatingTable) {
    const width = side === "BRIDE" ? (plan.brideTablesPerRow ?? 2) : (plan.groomTablesPerRow ?? 2);
    if (source && validSlotMove(source, side, row, column, width)) {
      if (source.id !== table?.id) {
        const saved = await onChange({
          action: "MOVE_TABLE_SLOT",
          tableId: source.id,
          targetRow: row,
          targetColumn: column,
        });
        if (!saved) return;
      }
      setSelected(null);
    } else if (!source && table) setSelected(table.id);
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
      {editable && plan.tables.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
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
              setBride(plan.brideTablesPerRow ?? 2);
              setGroom(plan.groomTablesPerRow ?? 2);
              setConfirmed(false);
              setSettings(true);
            }}
          >
            {t("settings")}
          </Button>
        </div>
      )}
      {arranging && (
        <p role="status" className="rounded-lg border bg-background p-3 text-sm">
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
        {(["BRIDE", "GROOM"] as const).map((side, i) => {
          const width =
            side === "BRIDE" ? (plan.brideTablesPerRow ?? 2) : (plan.groomTablesPerRow ?? 2);
          const lastRow = Math.max(
            1,
            ...plan.tables
              .filter((table) => table.side === side && hasTableSlot(table))
              .map((table) => table.row ?? 1),
          );
          return (
            <Fragment key={side}>
              {i === 1 && (
                <div
                  aria-label={t("aisle")}
                  className="hidden min-h-full items-center justify-center border-x border-dashed border-foreground/15 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground xl:flex"
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
                    className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(var(--seating-columns),minmax(210px,1fr))]"
                    style={{ "--seating-columns": width } as CSSProperties}
                  >
                    {sideSlots(plan.tables, side, width)
                      .filter((slot) => arranging || slot.row <= lastRow)
                      .map(({ row, column, table }) => (
                        <div key={`${row}:${column}`} className="min-w-0">
                          {arranging ? (
                            <button
                              type="button"
                              disabled={saving || (!!source && source.side !== side)}
                              aria-pressed={!!table && selected === table.id}
                              aria-label={t(table ? "tableSlot" : "emptySlot", {
                                name: table?.name,
                                row,
                                column,
                              })}
                              onClick={() => void selectSlot(side, row, column, table)}
                              className={`flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border p-4 text-sm disabled:opacity-40 ${table ? (side === "BRIDE" ? "border-rose-200 bg-rose-100/80" : "border-sky-200 bg-sky-100/80") : "border-dashed bg-background/40 text-muted-foreground"} ${table?.id === selected ? "ring-2 ring-primary" : ""}`}
                            >
                              <strong>{table?.name ?? t("empty")}</strong>
                              {table && (
                                <span>
                                  {plan.assignments.filter((a) => a.tableId === table.id).length}/
                                  {table.capacity}
                                </span>
                              )}
                              <span className="text-xs">{t("position", { row, column })}</span>
                            </button>
                          ) : table ? (
                            renderTable(table)
                          ) : (
                            <div className="flex min-h-36 items-center justify-center rounded-xl border border-dashed border-foreground/15 text-xs text-muted-foreground">
                              {t("empty")}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            </Fragment>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground">{t("entrance")}</p>
      {legacy.length > 0 && (
        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <h3 className="text-sm font-semibold">{t("legacyTitle", { count: legacy.length })}</h3>
          <p className="text-xs text-muted-foreground">{t("legacyDescription")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {legacy.map((table) => (
              <div key={table.id} className="max-w-full">
                {arranging ? (
                  <Button
                    type="button"
                    disabled={saving}
                    variant="outline"
                    onClick={() => onInspect(table)}
                  >
                    {table.name} · {t("assignLayout")}
                  </Button>
                ) : (
                  renderTable(table)
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {!plan.tables.length && (
        <p className="text-center text-sm text-muted-foreground">{t("noTables")}</p>
      )}
      <Modal
        open={settings}
        onClose={() => {
          if (!saving) setSettings(false);
        }}
        title={t("settings")}
        description={t("reflowDescription")}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(["BRIDE", "GROOM"] as const).map((side) => (
              <label key={side} className="text-sm">
                {t(side)}
                <select
                  disabled={saving}
                  className="mt-1 block w-full rounded-lg border bg-background p-2"
                  value={side === "BRIDE" ? bride : groom}
                  onChange={(e) => {
                    (side === "BRIDE" ? setBride : setGroom)(Number(e.target.value));
                    setConfirmed(false);
                  }}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {t("columns", { count: n })}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
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
              const saved = await onChange({
                action: "UPDATE_LAYOUT",
                brideTablesPerRow: bride,
                groomTablesPerRow: groom,
              });
              if (saved) {
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
