import type {
  SeatingChange,
  SeatingGenerationApply,
  SeatingGenerationConfig,
  SeatingGenerationPreview,
  SeatingPlan,
} from "../api/planning-seating.api";
import { previewSeatMove } from "./planning-seat-move";
import { nextSeatingTableNumber } from "./seating-layout";
import { groupKind } from "@/shared/lib/planning-groups";

export function generationDraftPlan(
  source: SeatingPlan,
  proposal: SeatingGenerationPreview,
  config: SeatingGenerationConfig,
): SeatingPlan {
  return {
    ...source,
    positionPriority:
      proposal.positionPriority ?? config.positionPriority ?? source.positionPriority,
    brideTablesPerRow: config.tablesPerRow.bride,
    groomTablesPerRow: config.tablesPerRow.groom,
    tables: proposal.tables.map((t) => ({
      id: "draft:" + t.code,
      name: t.code,
      capacity: t.capacity,
      side: t.side,
      row: t.row,
      column: t.column,
      ...(t.group ? { groupId: t.group } : {}),
    })),
    assignments: proposal.assignments.map((a) => ({
      placeId: a.placeId,
      tableId: "draft:" + a.tableCode,
      seatNumber: a.seatNumber,
    })),
  };
}

export function generationDraftInput(
  plan: SeatingPlan,
  input: SeatingGenerationApply,
): SeatingGenerationApply {
  return {
    ...input,
    tablesPerRow: { bride: plan.brideTablesPerRow ?? 2, groom: plan.groomTablesPerRow ?? 2 },
    draft: {
      tables: plan.tables.map((t) => {
        if (!t.side || !t.row || !t.column) throw new Error("Bàn trong bản nháp chưa có vị trí.");
        return {
          code: t.id,
          name: t.name,
          side: t.side,
          row: t.row,
          column: t.column,
          capacity: t.capacity,
        };
      }),
      assignments: plan.assignments.map((a) => ({
        placeId: a.placeId,
        tableCode: a.tableId,
        seatNumber: a.seatNumber,
      })),
    },
  };
}

export function changeGenerationDraft(source: SeatingPlan, change: SeatingChange): SeatingPlan {
  if (change.action === "MOVE_PLACES") {
    const next = previewSeatMove(source, change.placeIds, change.tableId, change.seatNumber);
    if (!next) throw new Error("Không thể chuyển các suất đến vị trí đã chọn.");
    return next;
  }
  const next = structuredClone(source);
  const width = (side: string | null | undefined) =>
    side === "BRIDE" ? (next.brideTablesPerRow ?? 2) : (next.groomTablesPerRow ?? 2);
  if (change.action === "CREATE_TABLE" || change.action === "CREATE_TABLES") {
    const count = change.action === "CREATE_TABLE" ? 1 : change.tableCount;
    if (!change.side || count < 1 || next.tables.length + count > 100)
      throw new Error("Tối đa 100 bàn và mỗi bàn cần được chọn phía.");
    for (let i = 0; i < count; i++) {
      const index = Array.from({ length: 100 * width(change.side) }, (_, n) => n).find(
        (n) =>
          !next.tables.some(
            (t) =>
              t.side === change.side &&
              t.row === Math.floor(n / width(change.side)) + 1 &&
              t.column === (n % width(change.side)) + 1,
          ),
      );
      if (index === undefined) throw new Error("Không còn vị trí trống.");
      next.tables.push({
        id: "draft:" + crypto.randomUUID(),
        name:
          change.action === "CREATE_TABLE"
            ? change.name
            : "Bàn " + nextSeatingTableNumber(next.tables),
        capacity: change.capacity,
        side: change.side,
        row: i === 0 && change.row ? change.row : Math.floor(index / width(change.side)) + 1,
        column: i === 0 && change.column ? change.column : (index % width(change.side)) + 1,
        ...(change.groupId ? { groupId: groupKind.parse(change.groupId) } : {}),
      });
    }
  } else if (change.action === "UPDATE_LAYOUT") {
    next.brideTablesPerRow = change.brideTablesPerRow;
    next.groomTablesPerRow = change.groomTablesPerRow;
    for (const side of ["BRIDE", "GROOM"] as const)
      next.tables
        .filter((t) => t.side === side)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .forEach((t, i) => {
          t.row = Math.floor(i / width(side)) + 1;
          t.column = (i % width(side)) + 1;
        });
  } else {
    const table = next.tables.find((t) => t.id === change.tableId);
    if (!table) throw new Error("Không tìm thấy bàn trong bản nháp.");
    if (change.action === "DELETE_TABLE") {
      next.tables = next.tables.filter((t) => t.id !== table.id);
      next.assignments = next.assignments.filter((a) => a.tableId !== table.id);
    } else if (change.action === "MOVE_TABLE_SLOT") {
      const other = next.tables.find(
        (t) =>
          t.side === table.side && t.row === change.targetRow && t.column === change.targetColumn,
      );
      if (other) {
        other.row = table.row;
        other.column = table.column;
      }
      table.row = change.targetRow;
      table.column = change.targetColumn;
    } else if (change.action === "UPDATE_TABLE") {
      table.name = change.name.trim();
      table.capacity = change.capacity;
      if (change.side) {
        table.side = change.side;
        table.row = change.row;
        table.column = change.column;
      }
    }
  }
  const slots = new Set<string>();
  for (const t of next.tables) {
    const slot = [t.side, t.row, t.column].join(":");
    if (
      !t.name.trim() ||
      !t.side ||
      t.name.length > 100 ||
      t.capacity < 1 ||
      t.capacity > 20 ||
      !t.row ||
      t.row < 1 ||
      t.row > 100 ||
      !t.column ||
      t.column < 1 ||
      t.column > width(t.side) ||
      slots.has(slot)
    )
      throw new Error("Kiểm tra tên, sức chứa và vị trí bàn.");
    slots.add(slot);
    for (const a of next.assignments.filter((a) => a.tableId === t.id)) {
      if (a.seatNumber > t.capacity)
        throw new Error("Chuyển các suất đang xếp trước khi giảm số ghế.");
    }
  }
  return next;
}
