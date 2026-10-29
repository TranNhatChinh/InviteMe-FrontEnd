"use client";

import { useEffect, useRef, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Crown, AlertCircle, Plus, Sparkles, Check } from "lucide-react";
import { gsap } from "gsap";
import type { PlanningTable, SeatingLayout, SeatingWarning } from "../api/planning-seating.api";
import { useSeatingDragLock } from "./seating-drag-presence";

/** Who sits on one seat of a table, keyed by seat number. */
export type SeatOccupant = { placeId: string; name: string; side?: string | null };

interface SeatingHallGridProps {
  layout: SeatingLayout;
  tables: PlanningTable[];
  assignmentsCountByTable: Record<string, number>;
  /** tableId -> seatNumber -> occupant; seats render around each table for drag and drop. */
  occupantsByTable?: Record<string, Record<number, SeatOccupant>>;
  /** False when the plan is locked or the user cannot edit seating: seats are shown but not draggable. */
  editable?: boolean;
  checkedInCountByTable?: Record<string, number>;
  warnings?: SeatingWarning[];
  selectedTableIds: string[];
  isMultiSelectMode: boolean;
  onSelectTable: (tableId: string) => void;
  onTableClick: (table: PlanningTable) => void;
  onEmptyCellClick: (side: "GROOM" | "BRIDE", row: number, column: number) => void;
  onDragStartTable?: (table: PlanningTable) => void;
  onDropOnCell?: (side: "GROOM" | "BRIDE", row: number, column: number) => void;
  /** Click on a seat; used to seat the party picked in the tray without dragging. */
  onSeatClick?: (tableId: string, seatNumber: number) => void;
  highlightedTableId?: string | null;
}

// One hall cell holds the table in the middle and its seats on a ring around it.
// 128px cell: 64px disc, 24px seats on a 52px ring leave an 8px gap to the disc.
const CELL = "size-32";
const RING_RADIUS = 52;

// Vietnamese given names come last; companions ("… (Người đi cùng 2)") show as +2.
function initials(name: string) {
  const companion = /\(.*?(\d+)\)\s*$/.exec(name);
  if (companion) return `+${companion[1]}`;
  const words = name.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  return (words[words.length - 1] ?? "").charAt(0).toLocaleUpperCase("vi");
}

function HallSeat({
  tableId,
  seatNumber,
  occupant,
  angle,
  small,
  editable,
  onSeatClick,
}: {
  tableId: string;
  seatNumber: number;
  occupant?: SeatOccupant;
  angle: number;
  small: boolean;
  editable: boolean;
  onSeatClick?: (tableId: string, seatNumber: number) => void;
}) {
  const { t } = useTranslation("seating");
  const lock = useSeatingDragLock(occupant ? [occupant.placeId] : []);
  const drop = useDroppable({
    id: `seat:${tableId}:${seatNumber}`,
    data: { tableId, seatNumber },
    disabled: !editable,
  });
  const drag = useDraggable({
    id: `place:${occupant?.placeId ?? `${tableId}:${seatNumber}`}`,
    data: { ids: occupant ? [occupant.placeId] : [] },
    disabled: !editable || !occupant || Boolean(lock),
  });
  const x = Math.cos(angle) * RING_RADIUS;
  const y = Math.sin(angle) * RING_RADIUS;
  const tone = !occupant
    ? "border-dashed border-muted-foreground/40 bg-card text-muted-foreground"
    : lock
      ? "border-amber-500 bg-amber-100 text-amber-900"
      : occupant.side === "GROOM"
        ? "border-blue-500 bg-blue-500 text-white"
        : occupant.side === "BRIDE"
          ? "border-rose-500 bg-rose-500 text-white"
          : "border-amber-500 bg-amber-500 text-white";
  return (
    <button
      type="button"
      ref={(node) => {
        drop.setNodeRef(node);
        drag.setNodeRef(node);
      }}
      {...(occupant ? drag.attributes : {})}
      {...(occupant ? drag.listeners : {})}
      // Click alternative to dragging: with a party picked in the tray, a click seats it here.
      onClick={(event) => {
        event.stopPropagation();
        onSeatClick?.(tableId, seatNumber);
      }}
      title={
        occupant
          ? t("hall.seatOccupied", {
              seat: seatNumber,
              name: occupant.name,
              hint: lock
                ? t("hall.lockedBy", { name: lock.displayName })
                : editable
                  ? t("hall.dragToSwap")
                  : "",
            })
          : t("hall.seatEmpty", { seat: seatNumber, hint: editable ? t("hall.dropHere") : "" })
      }
      aria-label={
        occupant
          ? t("hall.seatAria", { seat: seatNumber, name: occupant.name })
          : t("hall.seatEmptyAria", { seat: seatNumber })
      }
      className={`absolute z-10 flex items-center justify-center rounded-full border-2 font-bold leading-none shadow-sm transition-[scale,box-shadow,opacity] duration-150 motion-reduce:transition-none ${
        small ? "size-5 text-[9px]" : "size-6 text-[10px]"
      } ${tone} ${
        drop.isOver
          ? `scale-125 ring-2 ring-offset-1 ${occupant ? "ring-amber-500" : "ring-emerald-500"}`
          : ""
      } ${drag.isDragging ? "opacity-30" : ""} ${
        occupant && editable && !lock ? "cursor-grab active:cursor-grabbing hover:scale-110" : "cursor-default"
      }`}
      style={{
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
        transform: "translate(-50%, -50%)",
      }}
    >
      {occupant ? initials(occupant.name) : seatNumber}
    </button>
  );
}

type TableDragHandle = {
  setNodeRef: (node: HTMLElement | null) => void;
  attributes: ReturnType<typeof useDraggable>["attributes"];
  listeners: ReturnType<typeof useDraggable>["listeners"];
  isDragging: boolean;
};

// The table disc takes people (drop) and can itself be dragged to another cell or table.
function HallTableDropZone({
  tableId,
  side,
  editable,
  children,
}: {
  tableId: string;
  side?: string | null;
  editable: boolean;
  children: (
    isOver: boolean,
    setNodeRef: (node: HTMLElement | null) => void,
    drag: TableDragHandle,
  ) => ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `table:${tableId}`,
    data: { tableId },
    disabled: !editable,
  });
  const { setNodeRef: setDragRef, attributes, listeners, isDragging } = useDraggable({
    id: `tbl:${tableId}`,
    data: { kind: "table", tableId, side },
    disabled: !editable,
  });
  return <>{children(isOver, setNodeRef, { setNodeRef: setDragRef, attributes, listeners, isDragging })}</>;
}

// An empty hall cell: click to create a table, or drop a dragged table here.
function HallEmptyCell({
  side,
  row,
  column,
  editable,
  onClick,
}: {
  side: "GROOM" | "BRIDE";
  row: number;
  column: number;
  editable: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("seating");
  const { isOver, setNodeRef, active } = useDroppable({
    id: `cell:${side}:${row}:${column}`,
    data: { kind: "cell", half: side, row, column },
    disabled: !editable,
  });
  const tableDrag = active?.data.current?.kind === "table";
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={`group relative flex ${CELL} flex-col items-center justify-center rounded-2xl border border-dashed transition-all hover:border-primary hover:bg-primary/5 ${
        tableDrag && isOver
          ? "border-2 border-emerald-500 bg-emerald-500/10"
          : tableDrag
            ? "border-primary/50 bg-primary/[0.03]"
            : "border-border/70 bg-card/40"
      }`}
      title={t("hall.emptyCell", { row, column })}
    >
      <span className="text-[10px] font-mono text-muted-foreground/60 group-hover:hidden">
        {row}·{column}
      </span>
      <Plus className="hidden size-4 text-primary group-hover:block transition-transform group-hover:scale-125" />
    </button>
  );
}

export function SeatingHallGrid({
  layout,
  tables,
  assignmentsCountByTable,
  occupantsByTable = {},
  editable = false,
  checkedInCountByTable = {},
  warnings = [],
  selectedTableIds,
  isMultiSelectMode,
  onSelectTable,
  onTableClick,
  onEmptyCellClick,
  onSeatClick,
  highlightedTableId,
}: SeatingHallGridProps) {
  const { t } = useTranslation("seating");
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Map tables by coordinate: `${half}:${row}:${col}`
  const tableMap = useMemo(() => {
    const map = new Map<string, PlanningTable>();
    for (const table of tables) {
      const half =
        table.half ??
        (table.side === "GROOM" || table.side === "BRIDE" ? table.side : null);
      if (
        table.row !== null &&
        table.row !== undefined &&
        table.column !== null &&
        table.column !== undefined &&
        half
      ) {
        map.set(`${half}:${table.row}:${table.column}`, table);
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

      // Staggered reveal for placed tables. fromTo + clearProps: an interrupted from() (Strict Mode,
      // quick re-render) would otherwise leave tables stuck half transparent.
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
        gsap.fromTo(
          ".hall-table-token",
          { scale: 0.8, opacity: 0 },
          {
            scale: 1,
            opacity: 1,
            duration: 0.45,
            stagger: 0.03,
            ease: "back.out(1.4)",
            clearProps: "scale,opacity,transform,translate,rotate",
          },
        );
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
      return <div key={`${side}-${row}-${col}`} className={CELL} aria-hidden="true" />;
    }

    const table = tableMap.get(`${side}:${row}:${col}`);
    const key = `${side}-${row}-${col}`;

    if (!table) {
      // Empty cell
      return (
        <HallEmptyCell
          key={key}
          side={side}
          row={row}
          column={col}
          editable={editable}
          onClick={() => onEmptyCellClick(side, row, col)}
        />
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

    const seatCount = table.capacity + (table.extraSeats ?? 0);
    const occupants = occupantsByTable[table.id] ?? {};

    return (
      <HallTableDropZone key={key} tableId={table.id} side={table.side} editable={editable}>
        {(isOver, setNodeRef, drag) => (
      <div className={`relative ${CELL}`}>
        {Array.from({ length: seatCount }, (_, i) => (
          <HallSeat
            key={i + 1}
            tableId={table.id}
            seatNumber={i + 1}
            occupant={occupants[i + 1]}
            angle={-Math.PI / 2 + (i / seatCount) * 2 * Math.PI}
            small={seatCount > 12}
            editable={editable}
            onSeatClick={onSeatClick}
          />
        ))}
      <div
        ref={(node) => {
          setNodeRef(node);
          drag.setNodeRef(node);
        }}
        {...drag.attributes}
        {...drag.listeners}
        // Centered with inset+margin, not translate: GSAP writes `translate: none` inline.
        className={`hall-table-token absolute inset-0 m-auto flex size-16 flex-col items-center justify-between rounded-full border-2 p-1.5 shadow-sm transition-[box-shadow,border-color] ${
          editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
        } ${sideTheme} ${ringStyle} ${isOver ? "ring-2 ring-emerald-500 ring-offset-2" : ""} ${
          drag.isDragging ? "opacity-40 border-dashed" : ""
        }`}
        title={editable ? t("hall.tableHint") : undefined}
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
        aria-label={t("hall.tableAria", {
          number: table.number || table.name,
          seated,
          capacity: table.capacity,
        })}
      >
        {/* VIP badge or Warning badge */}
        <div className="absolute -top-1.5 flex items-center gap-1">
          {table.isVip && (
            <span
              className="flex size-4 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm"
              title={t("hall.vipTable")}
            >
              <Crown className="size-2.5" />
            </span>
          )}
          {warnCount > 0 && (
            <span
              className="flex size-4 items-center justify-center rounded-full bg-destructive text-white shadow-sm animate-pulse"
              title={t("hall.warnings", { count: warnCount })}
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
          {table.number
            ? t("common.tableLabel", { number: String(table.number).padStart(2, "0") })
            : table.name}
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
              title={t("hall.checkedIn", { count: checkedIn })}
            />
          )}
          <span
            className={`size-1.5 rounded-full ${
              isFull ? "bg-emerald-500" : seated > 0 ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          />
        </div>
      </div>
      </div>
        )}
      </HallTableDropZone>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative overflow-x-auto rounded-3xl border border-border bg-card/60 p-4 sm:p-8 shadow-sm backdrop-blur-sm"
    >
      <div className="min-w-[960px] flex flex-col items-center space-y-6">
        {/* 1. GRAND CEREMONIAL STAGE */}
        <div
          ref={stageRef}
          className="relative w-full max-w-2xl rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-400/20 to-amber-500/10 py-3 px-6 text-center shadow-md backdrop-blur-sm"
        >
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="size-4 text-amber-600 dark:text-amber-400" />
            <span className="font-serif text-sm sm:text-base font-bold uppercase tracking-widest text-amber-800 dark:text-amber-200">
              {t("hall.stage")}
            </span>
            <Sparkles className="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-0.5 text-[10px] text-amber-700/80 dark:text-amber-300/80 font-medium tracking-wider">
            {t("hall.ceremony")}
          </div>
        </div>

        {/* 2. THE BANQUET HALL (Groom Side | Center Aisle | Bride Side) */}
        <div className="flex w-full justify-center items-start gap-3 sm:gap-6">
          {/* GROOM SIDE (NHÀ TRAI) */}
          <div className="flex flex-col items-end space-y-3">
            {/* Header */}
            <div className="flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1 text-xs font-serif font-bold text-blue-700 dark:text-blue-300">
              <span>{t("hall.groomFamily")}</span>
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
              {t("hall.aisle")}
            </div>
            <div className="flex-1 w-px bg-gradient-to-b from-primary/40 via-primary/20 to-primary/40 my-2" />
            <div className="font-mono text-[9px] uppercase tracking-widest text-primary/80 py-2 [writing-mode:vertical-lr]">
              {t("hall.entrance")}
            </div>
          </div>

          {/* BRIDE SIDE (NHÀ GÁI) */}
          <div className="flex flex-col items-start space-y-3">
            {/* Header */}
            <div className="flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-serif font-bold text-rose-700 dark:text-rose-300">
              <span>{t("hall.brideFamily")}</span>
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
