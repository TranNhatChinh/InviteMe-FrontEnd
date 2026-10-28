"use client";

import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCenter,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Activity,
  CheckSquare,
  Grid,
  Lock,
  Plus,
  Sparkles,
  Wand2,
  X,
  Eye,
} from "lucide-react";
import { gsap } from "gsap";
import { useRuntime } from "@/core/config/runtime";
import { REALTIME_EVENTS } from "@/core/realtime/realtime-events";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import {
  getSeatingPlan,
  getSeatingLayout,
  updateSeatingLayout,
  getSeatingPublication,
  setSeatingPublication,
  seatingPublicationKey,
  changeSeatingPlan,
  seatingKey,
  seatingLayoutKey,
  type SeatingChange,
  type SeatingPlan,
  type PlanningTable,
} from "../api/planning-seating.api";
import { moveSeatingWithRetry } from "../utils/seating-conflict-retry";
import { seatingErrorText } from "../utils/seating-errors";
import { useSeatingCollaboration } from "../hooks/use-seating-collaboration";
import { SeatingDragPresenceContext } from "./seating-drag-presence";
import { offsetDragPreview, seatingDropFeedback, type SeatingDropPosition } from "../utils/seating-drag-preview";
import { SeatingDragPreview } from "./seating-drag-preview";
import { SeatingTableDrawer } from "./seating-table-drawer";

// Sub-components
import { SeatingHallGrid, type SeatOccupant } from "./seating-hall-grid";
import { SeatingTray } from "./seating-tray";
import { SeatingGuestTray } from "./seating-guest-tray";
import { SeatingLayoutModal } from "./seating-layout-modal";
import { SeatingTableModal } from "./seating-table-modal";
import { SeatingBulkToolbar } from "./seating-bulk-toolbar";
import { SeatingSuggestionsModal } from "./seating-suggestions-modal";
import { SeatingDayOfDrawer } from "./seating-day-of-drawer";

type DropPosition = SeatingDropPosition;

const tableCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const direction = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[
    event.code
  ];
  if (!direction) return;
  const activeRect = context.collisionRect;
  if (!activeRect) return;
  const center = {
    x: activeRect.left + activeRect.width / 2,
    y: activeRect.top + activeRect.height / 2,
  };
  const candidates = context.droppableContainers
    .getEnabled()
    .filter((c) => String(c.id).startsWith("table:") || c.id === "unassigned")
    .flatMap((c) => {
      const rect = context.droppableRects.get(c.id);
      if (!rect) return [];
      const x = rect.left + rect.width / 2,
        y = rect.top + rect.height / 2;
      const dx = x - center.x,
        dy = y - center.y;
      if (dx * (direction[0] ?? 0) + dy * (direction[1] ?? 0) <= 1) return [];
      return [{ x, y, distance: dx * dx + dy * dy }];
    })
    .sort((a, b) => a.distance - b.distance);
  const next = candidates[0];
  if (next)
    return {
      x: currentCoordinates.x + next.x - center.x,
      y: currentCoordinates.y + next.y - center.y,
    };
};

export function PlanningSeating({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("guestPlanning");
  const { api, realtime } = useRuntime();
  const { can, isWeddingWide } = usePermission();
  const editable = can("SEATING_EDIT");
  const canPublishSeating = isWeddingWide("SEATING_EDIT");
  const cache = useQueryClient();
  const key = seatingKey(weddingId);
  const containerRef = useRef<HTMLDivElement>(null);

  // Queries
  const planQuery = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getSeatingPlan(api, weddingId, signal),
  });

  const layoutQuery = useQuery({
    queryKey: seatingLayoutKey(weddingId),
    queryFn: ({ signal }) => getSeatingLayout(api, weddingId, signal),
  });

  const publication = useQuery({
    queryKey: seatingPublicationKey(weddingId),
    queryFn: ({ signal }) => getSeatingPublication(api, weddingId, signal),
    enabled: can("SEATING_VIEW"),
  });

  // Local state
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
  const [isDayOfDrawerOpen, setIsDayOfDrawerOpen] = useState(false);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);

  // Table creation cell target (when clicking an empty cell)
  const [targetCellForNewTable, setTargetCellForNewTable] = useState<{
    side: "GROOM" | "BRIDE" | "MUTUAL";
    row: number;
    column: number;
  } | null>(null);

  // Multi-select mode
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);

  // Selected party for click-to-seat assignment
  const [selectedParty, setSelectedParty] = useState<{
    guestId: string;
    placeIds: string[];
  } | null>(null);

  // Selected table for detailed drawer
  const [activeTableForDrawer, setActiveTableForDrawer] = useState<PlanningTable | null>(null);

  // Saving & Notifications
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Drag & Drop
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [dragTableId, setDragTableId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<DropPosition | null>(null);

  const abortDrag = useCallback(() => {
    setDragIds([]);
    setDragTarget(null);
  }, []);

  const collaborationError = useCallback(
    (error?: unknown) => {
      setFailure(true);
      const msg = error instanceof Error ? error.message : String(error ?? "");
      if (/SEATING_SCOPE_DENIED|PLACE_NOT_FOUND/.test(msg)) {
        setMessage(t("seating.scopeDenied"));
      } else if (/SEATING_PLACE_LOCKED/.test(msg)) {
        setMessage(t("seating.placeLocked"));
      } else {
        setMessage(t("seating.connectionLost"));
      }
    },
    [t],
  );

  const collaboration = useSeatingCollaboration(weddingId, abortDrag, collaborationError);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: tableCoordinates }),
  );
  const status = useSyncExternalStore(
    realtime.subscribe,
    realtime.getStatus,
    realtime.getServerStatus,
  );

  // Real-time synchronization
  useEffect(() => {
    const invalidate = () => {
      void cache.invalidateQueries({ queryKey: key });
      void cache.invalidateQueries({ queryKey: seatingLayoutKey(weddingId) });
    };
    const invalidatePublication = () => {
      void cache.invalidateQueries({ queryKey: seatingPublicationKey(weddingId) });
    };
    const stopEvent = realtime.on(REALTIME_EVENTS.seating, invalidate);
    const stopPublication = realtime.onPlanningChange((change) => {
      if (
        change.type === "PlanningSeatingPublished" ||
        change.type === "PlanningSeatingUnpublished"
      )
        invalidatePublication();
    });
    const stopResync = realtime.onResync(() => {
      invalidate();
      invalidatePublication();
    });
    return () => {
      stopEvent();
      stopPublication();
      stopResync();
    };
  }, [realtime, cache, weddingId, key]);

  // GSAP entrance animation
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".seating-header-anim", {
        opacity: 0,
        y: -15,
        duration: 0.5,
        stagger: 0.08,
        ease: "power2.out",
      });
      gsap.from(".seating-workspace-anim", {
        opacity: 0,
        y: 20,
        duration: 0.6,
        delay: 0.1,
        ease: "power2.out",
      });
    }, containerRef);
    return () => ctx.revert();
  }, [planQuery.isPending]);

  const plan = planQuery.data;
  const layout = layoutQuery.data ?? plan?.layout ?? {
    groomRows: 6,
    groomColumns: 3,
    brideRows: 6,
    brideColumns: 3,
    numbering: "BY_ROW" as const,
    version: 0,
    isLocked: false,
    isEventStarted: false,
  };

  // Group list for tagging and filters
  const groups = useMemo(() => {
    if (!plan) return [];
    return Array.from(
      new Map(
        plan.guests.flatMap((g) => (g.group ? [[g.group.id, g.group.name] as const] : [])),
      ).entries(),
    ).map(([id, name]) => ({ id, name }));
  }, [plan]);

  // Table assignments count
  const assignmentsCountByTable = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!plan) return counts;
    for (const a of plan.assignments) {
      counts[a.tableId] = (counts[a.tableId] ?? 0) + 1;
    }
    return counts;
  }, [plan]);

  // Placed vs Unplaced tables
  const { placedTables, unplacedTables } = useMemo(() => {
    const placed: PlanningTable[] = [];
    const unplaced: PlanningTable[] = [];
    if (!plan) return { placedTables: placed, unplacedTables: unplaced };

    for (const table of plan.tables) {
      const half =
        table.half ??
        (table.side === "GROOM" || table.side === "BRIDE" ? table.side : null);
      if (
        table.row !== null &&
        table.row !== undefined &&
        table.column !== null &&
        table.column !== undefined &&
        half &&
        table.side !== "TRAY"
      ) {
        placed.push(table);
      } else {
        unplaced.push(table);
      }
    }
    return { placedTables: placed, unplacedTables: unplaced };
  }, [plan]);

  // Who sits where, for the seats drawn around each table on the hall.
  const occupantsByTable = useMemo(() => {
    const map: Record<string, Record<number, SeatOccupant>> = {};
    if (!plan) return map;
    const places = new Map(plan.places.map((p) => [p.id, p]));
    const guests = new Map(plan.guests.map((g) => [g.id, g]));
    for (const a of plan.assignments) {
      const place = places.get(a.placeId);
      const guest = place ? guests.get(place.guestId) : undefined;
      (map[a.tableId] ??= {})[a.seatNumber] = {
        placeId: a.placeId,
        name: place?.person?.fullName || guest?.recipientName || `Ghế ${a.seatNumber}`,
        side: guest?.side,
      };
    }
    return map;
  }, [plan]);

  // Assigned place IDs set
  const assignedPlaceIds = useMemo(() => {
    const set = new Set<string>();
    if (!plan) return set;
    for (const a of plan.assignments) {
      set.add(a.placeId);
    }
    return set;
  }, [plan]);

  // Core Mutation Handler
  async function change(input: SeatingChange) {
    if (!editable || savingRef.current || !planQuery.data) return;
    if (realtime.getStatus() !== "connected") {
      collaborationError();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFailure(false);
    setMessage(t("seating.saving"));

    try {
      const source = planQuery.data;
      const latest: SeatingPlan =
        input.action === "MOVE_PLACES"
          ? await collaboration.run(input.placeIds, (token) =>
              moveSeatingWithRetry(api, weddingId, source, input, token, () =>
                realtime.invokeSeating("RenewSeatingDrag", weddingId, token),
              ),
            )
          : input.action === "MOVE_PARTY" && input.placeIds && input.placeIds.length > 0
            ? await collaboration.run(input.placeIds, () =>
                changeSeatingPlan(api, weddingId, source.version, input),
              )
            : input.action === "SWAP_PLACES" && input.placeId && input.targetPlaceId
              ? await collaboration.run([input.placeId, input.targetPlaceId], (token) =>
                  changeSeatingPlan(api, weddingId, source.version, input, token),
                )
              : await changeSeatingPlan(api, weddingId, source.version, input);

      cache.setQueryData<SeatingPlan>(key, (current) =>
        current && current.version > latest.version ? current : latest,
      );

      if (input.action === "MOVE_PLACES") {
        const destination = latest.tables.find((table) => table.id === input.tableId);
        setMessage(
          destination
            ? `Đã xếp ${input.placeIds.length} khách vào ${destination.name}.`
            : `Đã đưa ${input.placeIds.length} khách về khay chưa xếp.`,
        );
      } else if (input.action === "MOVE_PARTY") {
        const destination = latest.tables.find((table) => table.id === input.tableId);
        setMessage(
          destination
            ? `Đã xếp trọn vẹn thiệp vào ${destination.name}.`
            : "Đã đưa thiệp về khay chưa xếp.",
        );
      } else if (input.action === "PLACE_TABLE" || input.action === "MOVE_TABLE") {
        setMessage("Đã cập nhật vị trí bàn trên sơ đồ sảnh.");
      } else if (input.action === "SWAP_PLACES") {
        setMessage("Đã đổi chỗ hai khách.");
      } else if (input.action === "SWAP_TABLES") {
        setMessage("Đã hoán đổi vị trí 2 bàn tiệc thành công.");
      } else if (input.action === "RENUMBER_TABLES") {
        setMessage("Đã đánh số lại tất cả các bàn theo hàng và cột.");
      } else if (input.action === "TAG_TABLES") {
        setMessage("Đã cập nhật thông tin cho các bàn đã chọn.");
      } else if (input.action === "START_EVENT") {
        setMessage("Tiệc cưới đã chính thức bắt đầu! Chế độ ngày cưới đã kích hoạt.");
      } else if (input.action === "LOCK_PLAN") {
        setMessage("Đã khóa sơ đồ bàn. Ngăn chặn chỉnh sửa ngoài ý muốn.");
      } else if (input.action === "UNLOCK_PLAN") {
        setMessage("Đã mở khóa sơ đồ bàn.");
      } else {
        setMessage(t("seating.saved"));
      }

      if (input.action === "DELETE_TABLE") {
        setActiveTableForDrawer(null);
      }
    } catch (error) {
      setFailure(true);
      const msg =
        seatingErrorText(error) ?? (error instanceof Error ? error.message : "Thao tác thất bại.");
      setMessage(msg);
    } finally {
      savingRef.current = false;
      setSaving(false);
      await cache.invalidateQueries({ queryKey: key });
      await cache.invalidateQueries({ queryKey: seatingLayoutKey(weddingId) });
    }
  }

  // Publication Toggle
  async function togglePublication() {
    if (!editable || !canPublishSeating || publishing) return;
    setPublishing(true);
    try {
      const next = !publication.data?.published;
      await setSeatingPublication(api, weddingId, next);
      await cache.invalidateQueries({ queryKey: seatingPublicationKey(weddingId) });
      setMessage(next ? "Đã công khai sơ đồ chỗ ngồi cho khách mời." : "Đã ẩn sơ đồ chỗ ngồi.");
      setFailure(false);
    } catch (err: unknown) {
      setFailure(true);
      setMessage(err instanceof Error ? err.message : t("seating.publishFailed"));
    } finally {
      setPublishing(false);
    }
  }

  // Layout save handler
  async function handleSaveLayout(data: {
    groomRows: number;
    groomColumns: number;
    brideRows: number;
    brideColumns: number;
    numbering: "BY_ROW" | "ODD_EVEN";
  }) {
    setLayoutSaving(true);
    setLayoutError(null);
    try {
      await updateSeatingLayout(api, weddingId, {
        ...data,
        expectedVersion: layout.version,
      });
      await cache.invalidateQueries({ queryKey: seatingLayoutKey(weddingId) });
      await cache.invalidateQueries({ queryKey: key });
      setIsLayoutModalOpen(false);
      setMessage("Đã cập nhật sơ đồ kích thước sảnh cưới.");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Không thể cập nhật sơ đồ sảnh. Vui lòng thử lại.";
      setLayoutError(msg);
    } finally {
      setLayoutSaving(false);
    }
  }

  // Party assignment click handler: when a party is selected and user clicks a table
  const handleTableClicked = async (table: PlanningTable) => {
    if (selectedParty) {
      // Assign the selected party to this clicked table!
      await change({
        action: "MOVE_PARTY",
        guestId: selectedParty.guestId,
        placeIds: selectedParty.placeIds,
        tableId: table.id,
      });
      setSelectedParty(null);
    } else {
      setActiveTableForDrawer(table);
    }
  };

  const handleEmptyCellClicked = (side: "GROOM" | "BRIDE", row: number, column: number) => {
    setTargetCellForNewTable({ side, row, column });
    setIsTableModalOpen(true);
  };

  const toggleTableSelection = (tableId: string) => {
    setSelectedTableIds((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId],
    );
  };

  const dragFeedback = useMemo(() => {
    if (!plan || !dragTarget?.tableId || !dragIds.length) return null;
    return seatingDropFeedback(plan, dragIds, dragTarget);
  }, [plan, dragTarget, dragIds]);

  if (planQuery.isPending) {
    return (
      <div className="flex h-96 items-center justify-center space-y-4 flex-col">
        <Sparkles className="size-8 text-primary animate-pulse" />
        <span className="font-serif text-sm text-muted-foreground">
          Đang tải sơ đồ sảnh tiệc và danh sách bàn ghế...
        </span>
      </div>
    );
  }

  if (planQuery.isError || !plan) {
    return (
      <div className="rounded-3xl border border-destructive/20 bg-destructive/10 p-8 text-center space-y-3">
        <p className="font-serif text-lg font-semibold text-destructive">
          Không thể tải dữ liệu sơ đồ bàn tiệc.
        </p>
        <Button onClick={() => void planQuery.refetch()} variant="outline">
          Thử lại
        </Button>
      </div>
    );
  }

  const drawerTable = activeTableForDrawer
    ? (plan.tables.find((t) => t.id === activeTableForDrawer.id) ?? activeTableForDrawer)
    : null;

  return (
    <SeatingDragPresenceContext.Provider value={collaboration.leases}>
      <DndContext
        sensors={sensors}
        collisionDetection={(args) =>
          (args.pointerCoordinates
            ? pointerWithin(args)
            : closestCenter({
                ...args,
                droppableContainers: args.droppableContainers.filter(
                  (c) => String(c.id).startsWith("table:") || c.id === "unassigned",
                ),
              })
          ).sort(
            (a, b) =>
              Number(String(b.id).startsWith("seat:")) - Number(String(a.id).startsWith("seat:")),
          )
        }
        onDragStart={({ active }) => {
          if (active.data.current?.kind === "table") {
            setDragTableId(active.data.current.tableId as string);
            return;
          }
          if (savingRef.current || realtime.getStatus() !== "connected") return;
          const ids = (active.data.current?.ids as string[] | undefined) ?? [];
          setDragIds(ids);
          setDragTarget(null);
          if (ids.length > 0) {
            collaboration.begin(ids);
          }
        }}
        onDragOver={({ active, over }) => {
          if (active.data.current?.kind === "table") return;
          // Cells and the table tray only take tables; for people they are no target.
          const data = over?.data.current;
          const target = data && "tableId" in data ? (data as DropPosition) : null;
          setDragTarget(target);
          collaboration.hover(target);
        }}
        onDragCancel={() => {
          setDragIds([]);
          setDragTarget(null);
          setDragTableId(null);
          collaboration.cancel();
        }}
        onDragEnd={({ active, over }) => {
          setDragIds([]);
          setDragTarget(null);
          setDragTableId(null);
          const drop = over?.data.current;
          if (active.data.current?.kind === "table") {
            const tableId = active.data.current.tableId as string;
            if (!drop) return;
            if (drop.kind === "cell") {
              // Placed or still in the tray, MOVE_TABLE puts the table on that empty cell.
              void change({
                action: "MOVE_TABLE",
                tableId,
                half: drop.half as "GROOM" | "BRIDE",
                row: drop.row as number,
                column: drop.column as number,
              });
            } else if (drop.kind === "table-tray") {
              // All coordinates empty sends it back to the tray without touching its family side.
              if (placedTables.some((t) => t.id === tableId))
                void change({ action: "MOVE_TABLE", tableId, half: null, row: null, column: null });
            } else if (typeof drop.tableId === "string" && drop.tableId !== tableId) {
              // Onto another table (its disc or one of its seats): the two trade places.
              void change({ action: "SWAP_TABLES", tableId, targetTableId: drop.tableId });
            }
            return;
          }
          const ids = active.data.current?.ids as string[] | undefined;
          const target = drop && "tableId" in drop ? (drop as DropPosition) : undefined;
          if (!ids?.length || !target) {
            collaboration.cancel();
            return;
          }
          const seatedHere = (id: string) =>
            plan.assignments.find((a) => a.placeId === id && a.tableId === target.tableId);
          // Dropped where they already sit: nothing to save.
          if (
            target.seatNumber === undefined
              ? target.tableId !== null && ids.every(seatedHere)
              : ids.length === 1 && seatedHere(ids[0] ?? "")?.seatNumber === target.seatNumber
          ) {
            collaboration.cancel();
            return;
          }
          const occupant =
            target.tableId && target.seatNumber !== undefined
              ? plan.assignments.find(
                  (a) => a.tableId === target.tableId && a.seatNumber === target.seatNumber,
                )
              : undefined;
          // One person onto a taken seat swaps the two; otherwise seat them from that seat on.
          if (occupant && ids.length === 1 && ids[0] && !ids.includes(occupant.placeId)) {
            void change({
              action: "SWAP_PLACES",
              placeId: ids[0],
              targetPlaceId: occupant.placeId,
            });
          } else {
            void change({
              action: "MOVE_PLACES",
              placeIds: ids,
              tableId: target.tableId,
              ...(target.seatNumber !== undefined && !occupant
                ? { seatNumber: target.seatNumber }
                : {}),
            });
          }
        }}
      >
        <div ref={containerRef} className="space-y-6 pb-20">
          {/* 1. TOP HEADER & METRICS */}
          <div className="seating-header-anim flex flex-col justify-between gap-4 border-b border-border pb-5 lg:flex-row lg:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Sơ đồ &amp; Xếp bàn Tiệc cưới
                </span>
                {plan.isLocked && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    <Lock className="size-3" />
                    <span>Đã khóa</span>
                  </span>
                )}
                {plan.isEventStarted && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Ngày cưới</span>
                  </span>
                )}
                <span
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    status === "connected"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                  title={
                    status === "connected"
                      ? "Đang kết nối trực tiếp, thay đổi được cập nhật ngay"
                      : "Mất kết nối, vui lòng kiểm tra mạng"
                  }
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      status === "connected" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                    }`}
                  />
                  <span>{status === "connected" ? "Trực tiếp" : "Ngoại tuyến"}</span>
                </span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Sắp xếp bàn tiệc trên sơ đồ sảnh cưới và phân bổ chỗ ngồi cho khách mời hai họ.
              </p>
            </div>

            {/* Quick action bar */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5 h-9"
                onClick={() => setIsLayoutModalOpen(true)}
              >
                <Grid className="size-3.5 text-primary" />
                <span>Thiết lập sảnh</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5 h-9"
                onClick={() => {
                  setTargetCellForNewTable(null);
                  setIsTableModalOpen(true);
                }}
              >
                <Plus className="size-3.5 text-primary" />
                <span>Tạo bàn mới</span>
              </Button>

              <Button
                variant={isMultiSelectMode ? "default" : "outline"}
                size="sm"
                className="rounded-full gap-1.5 h-9"
                onClick={() => {
                  setIsMultiSelectMode(!isMultiSelectMode);
                  setSelectedTableIds([]);
                }}
              >
                <CheckSquare className="size-3.5" />
                <span>{isMultiSelectMode ? "Hủy chọn bàn" : "Chọn nhiều bàn"}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5 h-9 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                onClick={() => setIsSuggestionsModalOpen(true)}
              >
                <Wand2 className="size-3.5 text-amber-500" />
                <span>Xếp tự động</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5 h-9"
                onClick={() => setIsDayOfDrawerOpen(true)}
              >
                <Activity className="size-3.5 text-primary" />
                <span>Ngày cưới</span>
              </Button>

              <Button
                variant={publication.data?.published ? "outline" : "default"}
                size="sm"
                className="rounded-full gap-1.5 h-9"
                disabled={publishing}
                onClick={() => void togglePublication()}
              >
                <Eye className="size-3.5" />
                <span>{publication.data?.published ? "Thu hồi công khai" : "Xuất bản sơ đồ"}</span>
              </Button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="seating-header-anim grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Đã đặt lên sơ đồ
              </span>
              <div className="font-serif text-lg font-bold text-foreground">
                {placedTables.length} / {plan.tables.length} bàn
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Khách đã xếp chỗ
              </span>
              <div className="font-serif text-lg font-bold text-foreground">
                {assignedPlaceIds.size} / {plan.places.length} khách
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Quy mô sảnh tiệc
              </span>
              <div className="font-serif text-lg font-bold text-foreground">
                {layout.groomRows + layout.brideRows} hàng · {layout.numbering === "BY_ROW" ? "Theo hàng" : "Chẵn lẻ"}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Khách chưa xếp
              </span>
              <div className="font-serif text-lg font-bold text-amber-600 dark:text-amber-400">
                {plan.places.length - assignedPlaceIds.size} khách
              </div>
            </div>
          </div>

          {/* Toast / Status banner */}
          {message && (
            <div
              className={`rounded-2xl p-4 text-xs font-medium flex items-center justify-between shadow-sm animate-in fade-in ${
                failure
                  ? "bg-destructive/15 text-destructive border border-destructive/30"
                  : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30"
              }`}
            >
              <span>{message}</span>
              <button
                type="button"
                onClick={() => setMessage("")}
                className="p-1 hover:opacity-70 transition-opacity"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* Selected party prompt */}
          {selectedParty && (
            <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 p-4 text-xs text-primary shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 animate-spin text-primary" />
                <span className="font-semibold">
                  Đang chọn thiệp ({selectedParty.placeIds.length} khách). Hãy bấm vào một bàn trên sơ đồ hoặc trong khay để xếp cả nhóm vào bàn đó!
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedParty(null);
                  collaboration.cancel();
                }}
                className="h-7 text-xs rounded-full"
              >
                Hủy chọn
              </Button>
            </div>
          )}

          {/* 2. MAIN WORKSPACE (Hall Grid Left + Guest Tray Right) */}
          <div className="seating-workspace-anim grid gap-6 lg:grid-cols-12 items-start">
            {/* LEFT / CENTER: HALL BANQUET GRID + UNPLACED TRAY (lg:col-span-8 or 9) */}
            <div className="lg:col-span-8 xl:col-span-9 space-y-6">
              {/* Grand Hall Grid */}
              <SeatingHallGrid
                layout={layout}
                tables={placedTables}
                assignmentsCountByTable={assignmentsCountByTable}
                occupantsByTable={occupantsByTable}
                editable={editable && !plan.isLocked}
                warnings={plan.warnings ?? []}
                selectedTableIds={selectedTableIds}
                isMultiSelectMode={isMultiSelectMode}
                onSelectTable={toggleTableSelection}
                onTableClick={handleTableClicked}
                onEmptyCellClick={handleEmptyCellClicked}
                onSeatClick={(tableId, seatNumber) => {
                  if (!selectedParty) return;
                  void change({
                    action: "MOVE_PLACES",
                    placeIds: selectedParty.placeIds,
                    tableId,
                    seatNumber,
                  });
                  setSelectedParty(null);
                }}
              />

              {/* Unplaced Tables Tray */}
              <SeatingTray
                unplacedTables={unplacedTables}
                assignmentsCountByTable={assignmentsCountByTable}
                onTableClick={handleTableClicked}
                onAddTableClick={() => {
                  setTargetCellForNewTable(null);
                  setIsTableModalOpen(true);
                }}
                onRenumberClick={() => void change({ action: "RENUMBER_TABLES" })}
                renumbering={saving}
                editable={editable && !plan.isLocked}
              />
            </div>

            {/* RIGHT SIDEBAR: UNSEATED GUEST TRAY (lg:col-span-4 or 3) */}
            <div className="lg:col-span-4 xl:col-span-3 sticky top-4">
              <SeatingGuestTray
                guests={plan.guests}
                places={plan.places}
                assignedPlaceIds={assignedPlaceIds}
                selectedGuestId={selectedParty?.guestId}
                groups={groups}
                editable={editable && !plan.isLocked}
                onSelectParty={(guestId, placeIds) => {
                  if (selectedParty?.guestId === guestId) {
                    setSelectedParty(null);
                    collaboration.cancel();
                  } else {
                    setSelectedParty({ guestId, placeIds });
                    if (placeIds.length > 0 && realtime.getStatus() === "connected") {
                      collaboration.begin(placeIds);
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* 3. FLOATING BULK TOOLBAR (When in multi-select mode) */}
          {isMultiSelectMode && (
            <SeatingBulkToolbar
              selectedCount={selectedTableIds.length}
              groups={groups}
              onClear={() => setSelectedTableIds([])}
              onAssignSide={(side) =>
                void change({ action: "TAG_TABLES", tableIds: selectedTableIds, side })
              }
              onToggleVip={(isVip) =>
                void change({ action: "TAG_TABLES", tableIds: selectedTableIds, isVip })
              }
              onAssignGroup={(groupId) =>
                void change({ action: "TAG_TABLES", tableIds: selectedTableIds, groupId })
              }
              saving={saving}
            />
          )}

          {/* 4. MODALS & DRAWERS */}
          {/* Hall Layout Setup Modal */}
          <SeatingLayoutModal
            layout={layout}
            isOpen={isLayoutModalOpen}
            onClose={() => setIsLayoutModalOpen(false)}
            onSave={handleSaveLayout}
            saving={layoutSaving}
            saveError={layoutError}
          />

          {/* Create Table Modal */}
          <SeatingTableModal
            isOpen={isTableModalOpen}
            onClose={() => setIsTableModalOpen(false)}
            onCreate={(changeInput) => change(changeInput)}
            saving={saving}
            targetCell={targetCellForNewTable}
            groups={groups}
            weddingId={weddingId}
          />

          {/* Automatic Suggestions Modal v2 */}
          <SeatingSuggestionsModal
            plan={plan}
            isOpen={isSuggestionsModalOpen}
            onClose={() => setIsSuggestionsModalOpen(false)}
            onApplied={() => {
              void cache.invalidateQueries({ queryKey: key });
              setMessage("Đã áp dụng thành công phương án xếp chỗ tự động.");
            }}
          />

          {/* Day-Of Event Operations Drawer */}
          <SeatingDayOfDrawer
            weddingId={weddingId}
            isLocked={Boolean(plan.isLocked)}
            isEventStarted={Boolean(plan.isEventStarted)}
            isOpen={isDayOfDrawerOpen}
            onClose={() => setIsDayOfDrawerOpen(false)}
            onChange={(changeInput) => change(changeInput)}
            saving={saving}
            tables={plan.tables}
          />

          {/* Table Details Drawer */}
          {drawerTable && (
            <div
              className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-lg bg-card border-l border-border h-full flex flex-col shadow-2xl">
                <SeatingTableDrawer
                  // Latest saved table; the key resets the edit form after a save.
                  key={`${drawerTable.id}:${drawerTable.number}:${drawerTable.name}:${drawerTable.capacity}`}
                  table={drawerTable}
                  plan={plan}
                  editable={editable && !plan.isLocked}
                  saving={saving}
                  onClose={() => setActiveTableForDrawer(null)}
                  onView={() => {}}
                  onMove={(placeId) => {
                    void change({
                      action: "MOVE_PLACES",
                      placeIds: [placeId],
                      tableId: null,
                    });
                  }}
                  onUnassign={(placeId) => {
                    void change({
                      action: "MOVE_PLACES",
                      placeIds: [placeId],
                      tableId: null,
                    });
                  }}
                  onAssign={(seatNumber) => {
                    if (selectedParty && selectedParty.placeIds.length > 0) {
                      const firstPlaceId = selectedParty.placeIds[0];
                      if (firstPlaceId) {
                        void change({
                          action: "MOVE_PLACES",
                          placeIds: [firstPlaceId],
                          tableId: drawerTable.id,
                          seatNumber,
                        });
                      }
                    }
                  }}
                  onSave={(newName, newCap, newNumber) => {
                    void change({
                      action: "UPDATE_TABLE",
                      tableId: drawerTable.id,
                      // A default "Bàn NN" name follows the new number on the BE; send the name only if edited.
                      name:
                        newNumber !== undefined && newName === drawerTable.name
                          ? undefined
                          : newName,
                      capacity: newCap,
                      ...(newNumber !== undefined ? { number: newNumber } : {}),
                    });
                  }}
                  onDelete={() => {
                    void change({
                      action: "DELETE_TABLE",
                      tableId: drawerTable.id,
                      confirmDeleteWithGuests: true,
                    });
                  }}
                />
              </div>
            </div>
          )}

          {/* Drag Overlay */}
          <DragOverlay
            modifiers={[offsetDragPreview]}
            style={{ pointerEvents: "none", width: "max-content", maxWidth: "75vw" }}
            adjustScale={false}
          >
            {dragIds.length > 0 && (
              <SeatingDragPreview plan={plan} ids={dragIds} feedback={dragFeedback} />
            )}
            {dragTableId &&
              (() => {
                const table = plan.tables.find((t) => t.id === dragTableId);
                return table ? (
                  <div className="flex size-16 flex-col items-center justify-center rounded-full border-2 border-primary bg-card font-serif text-xs font-bold shadow-xl">
                    {table.number ? `Bàn ${String(table.number).padStart(2, "0")}` : table.name}
                    <span className="font-mono text-[10px] font-normal text-muted-foreground">
                      {assignmentsCountByTable[table.id] ?? 0}/{table.capacity}
                    </span>
                  </div>
                ) : null;
              })()}
          </DragOverlay>
        </div>
      </DndContext>
    </SeatingDragPresenceContext.Provider>
  );
}
