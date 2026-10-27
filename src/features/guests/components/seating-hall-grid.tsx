"use client";

import { useEffect, useRef, useMemo } from "react";
import { Crown, AlertCircle, Plus, Sparkles, Check } from "lucide-react";
import { gsap } from "gsap";
import type { PlanningTable, SeatingLayout, SeatingWarning } from "../api/planning-seating.api";

interface SeatingHallGridProps {
  layout: SeatingLayout;
  tables: PlanningTable[];
  assignmentsCountByTable: Record<string, number>;
  checkedInCountByTable?: Record<string, number>;
  warnings?: SeatingWarning[];
  selectedTableIds: string[];
  isMultiSelectMode: boolean;
  onSelectTable: (tableId: string) => void;
  onTableClick: (table: PlanningTable) => void;
  onEmptyCellClick: (side: "GROOM" | "BRIDE", row: number, column: number) => void;
  onDragStartTable?: (table: PlanningTable) => void;
  onDropOnCell?: (side: "GROOM" | "BRIDE", row: number, column: number) => void;
  highlightedTableId?: string | null;
}

export function SeatingHallGrid({
  layout,
  tables,
  assignmentsCountByTable,
  checkedInCountByTable = {},
  warnings = [],
  selectedTableIds,
  isMultiSelectMode,
  onSelectTable,
  onTableClick,
  onEmptyCellClick,
  highlightedTableId,
}: SeatingHallGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Map tables by coordinate: `${side}:${row}:${col}`
  const tableMap = useMemo(() => {
    const map = new Map<string, PlanningTable>();
    for (const table of tables) {
      if (table.row !== null && table.row !== undefined && table.column !== null && table.column !== undefined && table.side) {
        map.set(`${table.side}:${table.row}:${table.column}`, table);
      }
    }
    return map;
  }, [tables]);

  // Warning map by tableId
  const warningCountByTable = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of warnings) {
      if (w.tableId) {
        map.set(w.tableId, (map.get(w.tableId) ?? 0) + 1);
      }
    }
    return map;
  }, [warnings]);

  // GSAP Entrance & Stage subtle glow
  useEffect(() => {
    const ctx = gsap.context(() => {
      // Stage spotlight breathing effect
      if (stageRef.current) {
        gsap.to(stageRef.current, {
          boxShadow: "0 0 35px rgba(217, 119, 6, 0.25)",
          repeat: -1,
          yoyo: true,
          duration: 2.5,
          ease: "sine.inOut",
        });
      }

      // Staggered reveal for placed tables
      gsap.from(".hall-table-token", {
        scale: 0.8,
        opacity: 0,
        duration: 0.45,
        stagger: 0.03,
        ease: "back.out(1.4)",
      });
    }, containerRef);

    return () => ctx.revert();
  }, [layout.version]);

  // Left columns (Groom side): displayed descending from `groomColumns` down to 1 (col 1 is near aisle)
  const groomCols = useMemo(() => {
    const cols: number[] = [];
    for (let c = layout.groomColumns; c >= 1; c--) {
      cols.push(c);
    }
    return cols;
  }, [layout.groomColumns]);

  // Right columns (Bride side): displayed ascending 1 to `brideColumns` (col 1 is near aisle)
  const brideCols = useMemo(() => {
    const cols: number[] = [];
    for (let c = 1; c <= layout.brideColumns; c++) {
      cols.push(c);
    }
    return cols;
  }, [layout.brideColumns]);

  // Max rows to render on hall
  const maxRows = Math.max(layout.groomRows, layout.brideRows);
  const rows = useMemo(() => Array.from({ length: maxRows }, (_, i) => i + 1), [maxRows]);

  const renderCell = (side: "GROOM" | "BRIDE", row: number, col: number) => {
    // Check if this row is valid for this side
    const maxRowForSide = side === "GROOM" ? layout.groomRows : layout.brideRows;
    if (row > maxRowForSide) {
      return <div key={`${side}-${row}-${col}`} className="size-16 sm:size-20" aria-hidden="true" />;
    }

    const table = tableMap.get(`${side}:${row}:${col}`);
    const key = `${side}-${row}-${col}`;

    if (!table) {
      // Empty cell
      return (
        <button
          key={key}
          type="button"
          onClick={() => onEmptyCellClick(side, row, col)}
          className="group relative flex size-16 sm:size-20 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 transition-all hover:border-primary hover:bg-primary/5 hover:scale-105"
          title={`Ô trống Hàng ${row}, Cột ${col} - Bấm để thêm hoặc đặt bàn`}
        >
          <span className="text-[10px] font-mono text-muted-foreground/60 group-hover:hidden">
            {row}·{col}
          </span>
          <Plus className="hidden size-4 text-primary group-hover:block transition-transform group-hover:scale-125" />
        </button>
      );
    }

    // Cell with placed table
    const seated = assignmentsCountByTable[table.id] ?? 0;
    const isFull = seated >= table.capacity + (table.extraSeats ?? 0);
    const isSelected = selectedTableIds.includes(table.id);
    const isHighlighted = highlightedTableId === table.id;
    const warnCount = warningCountByTable.get(table.id) ?? 0;
    const checkedIn = checkedInCountByTable[table.id] ?? 0;

    // Side color themes
    const sideTheme =
      table.side === "GROOM"
        ? "border-blue-500/40 bg-blue-50/70 text-blue-950 dark:bg-blue-950/30 dark:text-blue-100 hover:border-blue-500"
        : table.side === "BRIDE"
          ? "border-rose-500/40 bg-rose-50/70 text-rose-950 dark:bg-rose-950/30 dark:text-rose-100 hover:border-rose-500"
          : "border-amber-500/40 bg-amber-50/70 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100 hover:border-amber-500";

    const ringStyle = isSelected
      ? "ring-2 ring-primary ring-offset-2 scale-105 shadow-md"
      : isHighlighted
        ? "ring-2 ring-amber-500 ring-offset-2 scale-105"
        : "";

    return (
      <div
        key={key}
        className={`hall-table-token relative flex size-16 sm:size-20 flex-col items-center justify-between rounded-full border-2 p-1.5 shadow-sm transition-all cursor-pointer ${sideTheme} ${ringStyle}`}
        onClick={() => {
          if (isMultiSelectMode) {
            onSelectTable(table.id);
          } else {
            onTableClick(table);
          }
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTableClick(table);
          }
        }}
        aria-label={`Bàn số ${table.number || table.name}, ${seated} trên ${table.capacity} khách`}
      >
        {/* VIP badge or Warning badge */}
        <div className="absolute -top-1.5 flex items-center gap-1">
          {table.isVip && (
            <span
              className="flex size-4 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm"
              title="Bàn VIP"
            >
              <Crown className="size-2.5" />
            </span>
          )}
          {warnCount > 0 && (
            <span
              className="flex size-4 items-center justify-center rounded-full bg-destructive text-white shadow-sm animate-pulse"
              title={`${warnCount} cảnh báo tại bàn này`}
            >
              <AlertCircle className="size-2.5" />
            </span>
          )}
        </div>

        {/* Multi-select indicator */}
        {isMultiSelectMode && (
          <div
            className={`absolute -left-1 top-0 size-4 rounded-full border flex items-center justify-center ${
              isSelected ? "bg-primary border-primary text-white" : "bg-card border-border"
            }`}
          >
            {isSelected && <Check className="size-2.5" />}
          </div>
        )}

        {/* Table Number / Name */}
        <span className="mt-1 font-serif text-[11px] sm:text-xs font-bold tracking-tight truncate max-w-[56px] text-center">
          {table.number ? `Bàn ${String(table.number).padStart(2, "0")}` : table.name}
        </span>

        {/* Occupancy Indicator */}
        <div className="flex items-center gap-0.5 text-[10px] font-mono font-semibold">
          <span className={isFull ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-foreground"}>
            {seated}
          </span>
          <span className="text-muted-foreground/70">/</span>
          <span className="text-muted-foreground">{table.capacity}</span>
          {(table.extraSeats ?? 0) > 0 && (
            <span className="ml-0.5 rounded-full bg-amber-500/20 px-1 text-[8px] font-bold text-amber-700 dark:text-amber-300">
              +{table.extraSeats}
            </span>
          )}
        </div>

        {/* Status ring dot */}
        <div className="flex items-center gap-1 pb-0.5">
          {checkedIn > 0 && (
            <span
              className="size-1.5 rounded-full bg-emerald-500"
              title={`Đã có mặt ${checkedIn} người`}
            />
          )}
          <span
            className={`size-1.5 rounded-full ${
              isFull ? "bg-emerald-500" : seated > 0 ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative overflow-x-auto rounded-3xl border border-border bg-card/60 p-4 sm:p-8 shadow-sm backdrop-blur-sm"
    >
      <div className="min-w-[700px] flex flex-col items-center space-y-6">
        {/* 1. GRAND CEREMONIAL STAGE */}
        <div
          ref={stageRef}
          className="relative w-full max-w-2xl rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-400/20 to-amber-500/10 py-3 px-6 text-center shadow-md backdrop-blur-sm"
        >
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="size-4 text-amber-600 dark:text-amber-400" />
            <span className="font-serif text-sm sm:text-base font-bold uppercase tracking-widest text-amber-800 dark:text-amber-200">
              SÂN KHẤU CHÍNH HÔN LỄ
            </span>
            <Sparkles className="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-0.5 text-[10px] text-amber-700/80 dark:text-amber-300/80 font-medium tracking-wider">
            NƠI CỬ HÀNH NGHI THỨC TRANG TRỌNG
          </div>
        </div>

        {/* 2. THE BANQUET HALL (Groom Side | Center Aisle | Bride Side) */}
        <div className="flex w-full justify-center items-start gap-3 sm:gap-6">
          {/* GROOM SIDE (NHÀ TRAI) */}
          <div className="flex flex-col items-end space-y-3">
            {/* Header */}
            <div className="flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-serif font-bold text-blue-700 dark:text-blue-300">
              <span>HỌ NHÀ TRAI</span>
            </div>

            {/* Grid rows */}
            <div className="flex flex-col space-y-3">
              {rows.map((row) => (
                <div key={`groom-row-${row}`} className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-muted-foreground/60 w-4 text-right">
                    H{row}
                  </span>
                  <div className="flex gap-2 sm:gap-3">
                    {groomCols.map((col) => renderCell("GROOM", row, col))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. CENTER AISLE (LỐI ĐI HOA) */}
          <div className="flex flex-col items-center self-stretch justify-between px-2 sm:px-4 border-x border-dashed border-primary/30 bg-primary/[0.02]">
            <div className="font-mono text-[9px] uppercase tracking-widest text-primary/80 py-2 [writing-mode:vertical-lr] rotate-180">
              ▼ LỐI ĐI ĐÓN DÂU ▼
            </div>
            <div className="flex-1 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-primary/40 my-2" />
            <div className="font-mono text-[9px] uppercase tracking-widest text-primary/80 py-2 [writing-mode:vertical-lr]">
              ▲ CỔNG CHÍNH TIỆC ▲
            </div>
          </div>

          {/* BRIDE SIDE (NHÀ GÁI) */}
          <div className="flex flex-col items-start space-y-3">
            {/* Header */}
            <div className="flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-serif font-bold text-rose-700 dark:text-rose-300">
              <span>HỌ NHÀ GÁI</span>
            </div>

            {/* Grid rows */}
            <div className="flex flex-col space-y-3">
              {rows.map((row) => (
                <div key={`bride-row-${row}`} className="flex items-center gap-3">
                  <div className="flex gap-2 sm:gap-3">
                    {brideCols.map((col) => renderCell("BRIDE", row, col))}
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground/60 w-4 text-left">
                    H{row}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
