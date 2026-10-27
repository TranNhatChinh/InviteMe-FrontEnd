"use client";

import { Crown, Layers, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { PlanningTable } from "../api/planning-seating.api";

interface SeatingTrayProps {
  unplacedTables: PlanningTable[];
  assignmentsCountByTable: Record<string, number>;
  onTableClick: (table: PlanningTable) => void;
  onAddTableClick: () => void;
  onRenumberClick: () => void;
  renumbering?: boolean;
}

export function SeatingTray({
  unplacedTables,
  assignmentsCountByTable,
  onTableClick,
  onAddTableClick,
  onRenumberClick,
  renumbering = false,
}: SeatingTrayProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-primary" />
          <h3 className="font-serif text-base font-semibold text-foreground">
            Khay bàn chưa đặt lên sơ đồ ({unplacedTables.length})
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onRenumberClick}
            disabled={renumbering}
            className="rounded-full text-xs gap-1.5 h-8"
            title="Đánh số lại tất cả các bàn theo hàng và cột trên sơ đồ sảnh"
          >
            <RotateCcw className="size-3.5" />
            <span>Đánh số lại theo vị trí</span>
          </Button>

          <Button
            size="sm"
            onClick={onAddTableClick}
            className="rounded-full text-xs gap-1.5 h-8"
          >
            <Plus className="size-3.5" />
            <span>Thêm bàn mới</span>
          </Button>
        </div>
      </div>

      {unplacedTables.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          Tất cả các bàn tiệc đã được sắp xếp lên sơ đồ sảnh cưới.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {unplacedTables.map((table) => {
            const seated = assignmentsCountByTable[table.id] ?? 0;
            return (
              <div
                key={table.id}
                onClick={() => onTableClick(table)}
                className="group relative flex flex-col justify-between rounded-2xl border border-border bg-muted/20 p-3.5 transition-all hover:border-primary hover:bg-card hover:shadow-sm cursor-pointer"
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
                      {table.number ? `Bàn ${String(table.number).padStart(2, "0")}` : table.name}
                    </span>
                    <div className="text-[10px] text-muted-foreground">
                      {table.side === "GROOM"
                        ? "Nhà Trai"
                        : table.side === "BRIDE"
                          ? "Nhà Gái"
                          : "Bàn Chung"}
                    </div>
                  </div>
                  {table.isVip && <Crown className="size-3.5 text-amber-500" />}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[10px] font-mono">
                  <span className="text-muted-foreground">Đã xếp:</span>
                  <span className="font-semibold text-foreground">
                    {seated} / {table.capacity}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
