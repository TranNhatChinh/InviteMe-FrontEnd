"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useTranslation } from "react-i18next";
import { Crown, Layers, Plus, RotateCcw, Wand2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { PlanningTable } from "../api/planning-seating.api";

interface SeatingTrayProps {
  unplacedTables: PlanningTable[];
  assignmentsCountByTable: Record<string, number>;
  onTableClick: (table: PlanningTable) => void;
  onAddTableClick: () => void;
  onRenumberClick: () => void;
  onAutoPlaceClick?: () => void;
  renumbering?: boolean;
  autoPlacing?: boolean;
  /** Tables here can be dragged onto the hall; hall tables dropped here leave the hall. */
  editable?: boolean;
}

function TrayTable({
  table,
  seated,
  editable,
  onTableClick,
}: {
  table: PlanningTable;
  seated: number;
  editable: boolean;
  onTableClick: (table: PlanningTable) => void;
}) {
  const { t } = useTranslation("seating");
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `tbl:${table.id}`,
    data: { kind: "table", tableId: table.id, side: table.side },
    disabled: !editable,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onTableClick(table)}
      className={`group relative flex flex-col justify-between rounded-2xl border border-border bg-muted/20 p-3.5 transition-all hover:border-primary hover:bg-card hover:shadow-sm ${
        editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${isDragging ? "opacity-40" : ""}`}
      title={editable ? t("tray.tableHint") : undefined}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTableClick(table);
        }
      }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-0.5">
          <span className="font-serif text-xs font-bold text-foreground group-hover:text-primary transition-colors">
            {table.number
              ? t("common.tableLabel", { number: String(table.number).padStart(2, "0") })
              : table.name}
          </span>
          <div className="text-[10px] text-muted-foreground">
            {table.side === "GROOM"
              ? t("tray.groomShort")
              : table.side === "BRIDE"
                ? t("tray.brideShort")
                : t("tray.sharedShort")}
          </div>
        </div>
        {table.isVip && <Crown className="size-3.5 text-amber-500" />}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[10px] font-mono">
        <span className="text-muted-foreground">{t("tray.seated")}</span>
        <span className="font-semibold text-foreground">
          {seated} / {table.capacity}
        </span>
      </div>
    </div>
  );
}

export function SeatingTray({
  unplacedTables,
  assignmentsCountByTable,
  onTableClick,
  onAddTableClick,
  onRenumberClick,
  onAutoPlaceClick,
  renumbering = false,
  autoPlacing = false,
  editable = false,
}: SeatingTrayProps) {
  const { t } = useTranslation("seating");
  const { setNodeRef, isOver, active } = useDroppable({
    id: "table-tray",
    data: { kind: "table-tray" },
    disabled: !editable,
  });
  const tableOver = isOver && active?.data.current?.kind === "table";
  return (
    <section
      ref={setNodeRef}
      className={`rounded-3xl border bg-card p-5 sm:p-6 shadow-sm space-y-4 transition-colors ${
        tableOver ? "border-primary ring-2 ring-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-primary" />
          <h3 className="font-serif text-base font-semibold text-foreground">
            {t("tray.title", { count: unplacedTables.length })}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {unplacedTables.length > 0 && onAutoPlaceClick && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAutoPlaceClick}
              disabled={autoPlacing || !editable}
              className="rounded-full text-xs gap-1.5 h-8 text-primary border-primary/30 hover:bg-primary/5"
              title={t("tray.autoPlaceHint")}
            >
              <Wand2 className="size-3.5" />
              <span>{t("tray.autoPlace")}</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={onRenumberClick}
            disabled={renumbering}
            className="rounded-full text-xs gap-1.5 h-8"
            title={t("tray.renumberHint")}
          >
            <RotateCcw className="size-3.5" />
            <span>{t("tray.renumber")}</span>
          </Button>

          <Button
            size="sm"
            onClick={onAddTableClick}
            className="rounded-full text-xs gap-1.5 h-8"
          >
            <Plus className="size-3.5" />
            <span>{t("tray.addTable")}</span>
          </Button>
        </div>
      </div>

      {unplacedTables.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          {t("tray.allPlaced")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {unplacedTables.map((table) => {
            const seated = assignmentsCountByTable[table.id] ?? 0;
            return (
              <TrayTable
                key={table.id}
                table={table}
                seated={seated}
                editable={editable}
                onTableClick={onTableClick}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
