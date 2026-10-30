"use client";

import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  closestCenter,
  type KeyboardCoordinateGetter,
  TraversalOrder,
} from "@dnd-kit/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import Image from "next/image";
import { X } from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { ApiError } from "@/core/api/api-error";
import { REALTIME_EVENTS } from "@/core/realtime/realtime-events";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import { trapDialogFocus } from "@/shared/lib/dialog-focus";
import {
  getSeatingPlan,
  getSeatingPublication,
  setSeatingPublication,
  seatingPublicationKey,
  changeSeatingPlan,
  seatingKey,
  type SeatingChange,
  type SeatingPlan,
} from "../api/planning-seating.api";
import { sideLabels, type PlanningGuest } from "../api/planning.api";
import { previewSeatMove } from "../utils/planning-seat-move";
import { moveSeatingWithRetry } from "../utils/seating-conflict-retry";
import { PlanningSuggestions } from "./planning-suggestions";
import { SeatingLegend } from "./seating-legend";
import { SeatingQueue } from "./seating-queue";
import { SeatingTableDrawer } from "./seating-table-drawer";
import { SeatingDragPreview } from "./seating-drag-preview";
import { useSeatingCollaboration } from "../hooks/use-seating-collaboration";
import { SeatingRemoteCursors } from "./seating-remote-cursors";
import {
  DraggingLabel,
  SeatingDragPresenceContext,
  useSeatingDragLock,
} from "./seating-drag-presence";
import {
  offsetDragPreview,
  seatingDropFeedback,
  type SeatingDropPosition,
} from "../utils/seating-drag-preview";

// Arrow keys jump between tables rather than moving a few pixels through a long guest list.
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

type DropPosition = SeatingDropPosition;
function DragSource({
  id,
  ids,
  disabled,
  onClick,
  className,
  children,
  label,
}: {
  id: string;
  ids: string[];
  disabled: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  const { t } = useTranslation("guestPlanning");
  const lock = useSeatingDragLock(ids);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id,
    data: { ids },
    disabled: disabled || !!lock,
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      aria-label={label}
      title={lock ? t("seating.lockBy", { name: lock.displayName }) : undefined}
      onClick={onClick}
      className={className}
      style={{ touchAction: "none", opacity: isDragging || lock ? 0.4 : 1 }}
    >
      {children}
    </button>
  );
}
function DropTarget({
  id,
  target,
  disabled,
  className,
  style,
  children,
  label,
  invalid = false,
  hint,
  anchor,
  highlighted = false,
}: {
  id: string;
  target: DropPosition;
  disabled: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  label?: string;
  invalid?: boolean;
  hint?: string;
  anchor?: string;
  highlighted?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: target, disabled });
  return (
    <div
      ref={setNodeRef}
      data-seating-pointer-anchor={anchor}
      aria-label={label}
      title={hint}
      style={style}
      className={`${className ?? ""} ${isOver || highlighted ? (invalid ? "ring-2 ring-red-500" : "ring-2 ring-primary") : ""}`}
    >
      {children}
      {(isOver || highlighted) && hint && (
        <p
          role="status"
          className={`pointer-events-none absolute -top-8 left-0 z-10 whitespace-nowrap rounded-lg border bg-white px-2 py-1 text-xs shadow-sm ${invalid ? "border-red-200 text-red-700" : "border-primary/30 text-foreground"}`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
function recipient(g: PlanningGuest, familyLabel: string, groupLabel: string) {
  const prefix =
    g.invitationKind === "FAMILY"
      ? `${familyLabel} `
      : g.invitationKind === "GROUP"
        ? `${groupLabel} `
        : "";
  return `${prefix}${g.honorific ? `${g.honorific.toLocaleLowerCase("vi")} ` : ""}${g.recipientName}`;
}

export function PlanningSeating({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("guestPlanning");
  const { api, realtime } = useRuntime();
  const { can, scope, isWeddingWide } = usePermission();
  const editable = can("SEATING_EDIT") && can("SEATING_VIEW");
  const canPublishSeating = isWeddingWide("SEATING_EDIT");
  const isAllGroupsSeating = isWeddingWide("SEATING_EDIT");
  const allowedGroupIds = useMemo(
    () =>
      isAllGroupsSeating
        ? null
        : new Set(scope("SEATING_EDIT")?.groups.map((g) => g.id) ?? []),
    [isAllGroupsSeating, scope],
  );
  const cache = useQueryClient();
  const key = seatingKey(weddingId);
  const planQuery = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getSeatingPlan(api, weddingId, signal),
    enabled: can("SEATING_VIEW"),
    refetchOnWindowFocus: true,
  });
  const publication = useQuery({
    queryKey: seatingPublicationKey(weddingId),
    queryFn: ({ signal }) => getSeatingPublication(api, weddingId, signal),
    enabled: can("SEATING_VIEW"),
  });
  const [publishing, setPublishing] = useState(false);
  const [publicationError, setPublicationError] = useState("");
  async function togglePublication() {
    if (!canPublishSeating || !publication.data) return;
    setPublicationError("");
    setPublishing(true);
    try {
      await setSeatingPublication(api, weddingId, !publication.data.published);
      await cache.invalidateQueries({ queryKey: seatingPublicationKey(weddingId) });
    } catch {
      setPublicationError(t("seating.publicationFailed"));
    } finally {
      setPublishing(false);
    }
  }
  const [preview, setPreview] = useState<SeatingPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [seat, setSeat] = useState<number | null>(null);
  const detailsRef = useRef<HTMLDialogElement>(null);
  function closeDetails() {
    setTableId(null);
    setPlaceId(null);
    setSeat(null);
  }
  useEffect(() => {
    const dialog = detailsRef.current;
    if (!dialog) return;
    if (tableId || placeId) {
      if (!dialog.open) dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-drawer-heading]")?.focus({ preventScroll: true });
    } else if (dialog.open) {
      dialog.close();
    }
  }, [tableId, placeId]);
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [dragTarget, setDragTarget] = useState<DropPosition | null>(null);
  const [dragEpoch, setDragEpoch] = useState(0);
  const abortDrag = useCallback(() => {
    setDragIds([]);
    setDragTarget(null);
    setDragEpoch((value) => value + 1);
  }, []);
  const collaborationError = useCallback(
    (error?: unknown) => {
      setFailure(true);
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (/SEATING_SCOPE_DENIED|PLACE_NOT_FOUND/.test(message)) {
        setMessage(t("seating.scopeDenied"));
      } else if (/SEATING_PLACE_LOCKED/.test(message)) {
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
  useEffect(() => {
    const invalidate = () => {
      void cache.invalidateQueries({ queryKey: seatingKey(weddingId) });
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
  }, [realtime, cache, weddingId]);

  const plan = preview ?? planQuery.data;
  const groupNames = new Map(
    (plan?.guests ?? []).flatMap((guest) =>
      guest.group ? [[guest.group.id, guest.group.name] as const] : [],
    ),
  );
  async function change(input: SeatingChange, optimistic?: SeatingPlan) {
    if (!editable || savingRef.current || !planQuery.data) return;
    if (realtime.getStatus() !== "connected") {
      collaborationError();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFailure(false);
    setMessage(t("seating.saving"));
    if (optimistic) setPreview(optimistic);
    try {
      const source = planQuery.data;
      const latest =
        input.action === "MOVE_PLACES"
          ? await collaboration.run(input.placeIds, (token) =>
              moveSeatingWithRetry(api, weddingId, source, input, token, () =>
                realtime.invokeSeating("RenewSeatingDrag", weddingId, token),
              ),
            )
          : await changeSeatingPlan(api, weddingId, source.version, input);
      cache.setQueryData<SeatingPlan>(key, (current) =>
        current && current.version > latest.version ? current : latest,
      );
      if (input.action === "MOVE_PLACES") {
        const destination = latest.tables.find((t) => t.id === input.tableId);
        const notice = destination
          ? t("seating.assigned", { count: input.placeIds.length, table: destination.name })
          : t("seating.unassigned", { count: input.placeIds.length });
        setMessage(notice);
      } else setMessage(t("seating.saved"));
      setSelection([]);
      if (input.action === "DELETE_TABLE") {
        setTableId(null);
        setSeat(null);
      }
    } catch (error) {
      setFailure(true);
      const dragProblem =
        error instanceof Error &&
        /SEATING_(PLACE_LOCKED|DRAG_EXPIRED|DRAG_CANCELLED|REALTIME_DISCONNECTED)/.test(
          error.message,
        );
      setMessage(
        dragProblem
          ? t("seating.dragConflict")
          : error instanceof ApiError && error.backendCode === "SEATING_PLACE_LOCKED"
            ? t("seating.placeLocked")
            : error instanceof ApiError && error.backendCode === "SEATING_DRAG_EXPIRED"
              ? t("seating.dragExpired")
              : error instanceof ApiError && error.status === 409
                ? t("seating.dataConflict")
                : error instanceof ApiError && error.status === 403
                  ? t("seating.forbidden")
                  : t("seating.saveFailed"),
      );
    } finally {
      setPreview(null);
      savingRef.current = false;
      setSaving(false);
      await cache.invalidateQueries({ queryKey: key });
    }
  }
  function move(ids: string[], target: string | null, seatNumber?: number) {
    if (!plan || !editable || savingRef.current) return;
    const lock = collaboration.leases.find(
      (lease) =>
        lease.connectionId !== collaboration.connectionId &&
        ids.some((id) => lease.placeIds.includes(id)),
    );
    if (lock) {
      collaboration.cancel(false);
      setFailure(true);
      setMessage(t("seating.lockedBy", { name: lock.displayName }));
      return;
    }
    const next = previewSeatMove(plan, ids, target, seatNumber);
    if (!next) {
      collaboration.cancel(false);
      setFailure(true);
      const table = plan.tables.find((t) => t.id === target);
      const occupied = plan.assignments.filter(
        (a) => a.tableId === target && !ids.includes(a.placeId),
      ).length;
      const shortage = table ? ids.length - (table.capacity - occupied) : 0;
      setMessage(
        shortage > 0
          ? t("seating.shortage", { table: table?.name, count: shortage })
          : t("seating.placeUnavailable"),
      );
      return;
    }
    void change(
      {
        action: "MOVE_PLACES",
        placeIds: ids,
        tableId: target,
        ...(seatNumber ? { seatNumber } : {}),
      },
      next,
    );
  }
  if (planQuery.isPending) return <p role="status">{t("seating.loadingPlan")}</p>;
  if (planQuery.isError || !plan)
    return (
      <div role="alert">
        {t("seating.loadFailed")}{" "}
        <Button onClick={() => void planQuery.refetch()}>{t("retry")}</Button>
      </div>
    );
  const guests = new Map(plan.guests.map((g) => [g.id, g]));
  const inspectedPlace = plan.places.find((p) => p.id === placeId);
  const inspectedGuest = inspectedPlace ? guests.get(inspectedPlace.guestId) : undefined;
  const inspectedTable = plan.tables.find((t) => t.id === tableId);
  const assignedPlaces = new Set(plan.assignments.map((item) => item.placeId));
  const seatsNeedingAttention = plan.places.filter(
    (place) =>
      assignedPlaces.has(place.id) &&
      ["DECLINED", "WAITLISTED"].includes(place.person?.attendanceStatus ?? ""),
  );
  const dragFeedback = seatingDropFeedback(plan, dragIds, dragTarget);
  const placeName = (id: string) => {
    const p = plan.places.find((x) => x.id === id),
      g = p ? guests.get(p.guestId) : undefined;
    return (
      p?.person?.fullName ??
      t("seating.plannedPlace", {
        position: p?.position ?? "",
        guest: g
          ? recipient(g, t("seating.family"), t("seating.groupPrefix"))
          : t("seating.noName"),
      })
    );
  };
  return (
    <SeatingDragPresenceContext.Provider
      value={collaboration.leases.filter(
        (lease) => lease.connectionId !== collaboration.connectionId,
      )}
    >
      <SeatingRemoteCursors
        weddingId={weddingId}
        plan={plan}
        leases={collaboration.leases.filter(
          (lease) => lease.connectionId !== collaboration.connectionId,
        )}
      />
      <DndContext
        key={dragEpoch}
        autoScroll={{
          enabled: true,
          order: TraversalOrder.ReversedTreeOrder,
          threshold: { x: 0.15, y: 0.15 },
          acceleration: 8,
        }}
        accessibility={{
          screenReaderInstructions: {
            draggable: t("seating.screenReaderHelp"),
          },
          announcements: {
            onDragStart: () => t("seating.dragStart"),
            onDragOver: () => t("seating.dragOver"),
            onDragEnd: () => t("seating.dragEnd"),
            onDragCancel: () => t("seating.dragCancel"),
          },
        }}
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
        onDragStart={({ active, activatorEvent }) => {
          if (savingRef.current || realtime.getStatus() !== "connected") return;
          const ids = (active.data.current?.ids as string[] | undefined) ?? [];
          collaboration.begin(
            ids,
            "clientX" in activatorEvent && "clientY" in activatorEvent
              ? { x: Number(activatorEvent.clientX), y: Number(activatorEvent.clientY) }
              : undefined,
          );
          setDragIds(ids);
          setDragTarget(null);
          setSelection([]);
        }}
        onDragOver={({ over }) => {
          const target = (over?.data.current as DropPosition | undefined) ?? null;
          setDragTarget(target);
          collaboration.hover(target);
        }}
        onDragCancel={() => {
          setDragIds([]);
          setDragTarget(null);
          collaboration.cancel(false);
        }}
        onDragEnd={({ active, over }) => {
          setDragIds([]);
          setDragTarget(null);
          const ids = active.data.current?.ids as string[] | undefined;
          const target = over?.data.current as DropPosition | undefined;
          if (ids && target) move(ids, target.tableId, target.seatNumber);
          else collaboration.cancel(false);
        }}
      >
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("seating.title")}
            </h1>
            <Button variant="outline" asChild>
              <Link href={`/weddings/${weddingId}/guests`}>{t("seating.guestList")}</Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-sm">
            <span>
              {publication.data?.published
                ? t("seating.visibleToGuests")
                : t("seating.notPublished")}
            </span>
            {editable && canPublishSeating && publication.data && (
              <Button
                size="sm"
                variant="outline"
                disabled={publishing}
                onClick={() => void togglePublication()}
              >
                {publishing
                  ? t("seating.updating")
                  : publication.data.published
                    ? t("seating.unpublish")
                    : t("seating.publish")}
              </Button>
            )}
            {editable && !canPublishSeating && (
              <span className="text-xs text-muted-foreground">
                {t("seating.publishPermission")}
              </span>
            )}
            {can("SEATING_VIEW") && !can("SEATING_EDIT") && (
              <span role="status" className="basis-full text-amber-900">
                {t("seating.readOnly")}
              </span>
            )}
            {publicationError && (
              <span role="alert" className="text-red-800">
                {publicationError}
              </span>
            )}
          </div>
          {seatsNeedingAttention.length > 0 && (
            <p
              role="status"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              {t("seating.attention", { count: seatsNeedingAttention.length })}
            </p>
          )}
          {status !== "connected" && (
            <p role="status" className="text-sm text-amber-800">
              {t("seating.reconnecting")}
            </p>
          )}
          <div aria-live="polite" className="flex flex-wrap gap-2">
            {collaboration.leases
              .filter((lease) => lease.connectionId !== collaboration.connectionId)
              .map((lease) => (
                <span
                  key={lease.connectionId}
                  className="inline-flex items-center gap-2 rounded-lg border bg-card px-2 py-1 text-xs"
                >
                  <DraggingLabel presence={lease} />
                  <span>
                    {t("seating.people", { count: lease.placeIds.length })}
                    {lease.tableId
                      ? ` → ${plan.tables.find((table) => table.id === lease.tableId)?.name ?? t("seating.table")}`
                      : ""}
                  </span>
                </span>
              ))}
          </div>
          {message && failure && (
            <p
              role={failure ? "alert" : "status"}
              className={`rounded-lg border p-3 text-sm ${failure ? "border-red-300 text-red-800" : "text-emerald-800"}`}
            >
              {message}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <SeatingLegend />
            <PlanningSuggestions
              plan={plan}
              editable={editable}
              saving={saving}
              onChange={change}
              saveError={failure ? message : undefined}
            />
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            <DropTarget
              id="unassigned"
              anchor="queue"
              target={{ tableId: null }}
              disabled={!editable || saving}
              className="space-y-3 rounded-xl border bg-card p-4"
              label={t("seating.filterGroup")}
            >
              <SeatingQueue
                plan={plan}
                disabled={!editable || saving || status !== "connected"}
                selection={selection}
                allowedGroupIds={allowedGroupIds}
                onSelect={(ids) => {
                  closeDetails();
                  setSelection(ids);
                }}
                onTable={(id) => {
                  setSelection([]);
                  setTableId(id);
                  setSeat(null);
                  setPlaceId(null);
                  document
                    .getElementById("seating-table-" + id)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
              {selection.length > 0 && (
                <div
                  className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs"
                  role="status"
                >
                  <p>{t("seating.selectionSummary", { count: selection.length })}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving || !editable}
                      onClick={() => move(selection, null)}
                    >
                      {t("seating.unassign")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelection([])}>
                      {t("seating.clearSelection")}
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("seating.unassignDrop")}</p>
            </DropTarget>
            <section
              data-seating-pointer-anchor="board"
              className="min-w-0 rounded-xl border bg-[#F8F5EF] p-4"
              aria-label={t("seating.savedPlan")}
            >
              {!plan.tables.length && (
                <p className="p-5 text-center text-sm">{t("seating.addFirstTable")}</p>
              )}
              <div className="flex flex-wrap justify-center gap-5">
                {plan.tables.map((table) => {
                  const members = plan.assignments.filter((a) => a.tableId === table.id);
                  const remote = collaboration.leases.filter(
                    (lease) =>
                      lease.connectionId !== collaboration.connectionId &&
                      lease.tableId === table.id,
                  );
                  const ghostSeats = remote.flatMap((lease) => {
                    const feedback = seatingDropFeedback(plan, lease.placeIds, {
                      tableId: table.id,
                      ...(lease.seatNumber ? { seatNumber: lease.seatNumber } : {}),
                    });
                    return feedback?.valid ? feedback.seats : [];
                  });
                  const moving = dragIds.length ? dragIds : selection;
                  const occupied = members.filter((a) => !moving.includes(a.placeId)).length;
                  const shortage = Math.max(0, moving.length - (table.capacity - occupied));
                  return (
                    <DropTarget
                      key={table.id}
                      anchor={`table:${table.id}`}
                      id={`table:${table.id}`}
                      target={{ tableId: table.id }}
                      disabled={!editable || saving}
                      className={`relative w-[270px] max-w-full rounded-xl border bg-white/50 p-3 transition-colors ${members.length === table.capacity ? "opacity-60" : ""} ${moving.length ? (shortage ? "border-red-300" : "border-primary/60") : ""}`}
                      highlighted={dragTarget?.tableId === table.id || remote.length > 0}
                      invalid={
                        dragTarget?.tableId === table.id
                          ? dragFeedback?.valid === false
                          : shortage > 0
                      }
                      hint={
                        moving.length
                          ? dragTarget?.tableId === table.id && dragFeedback
                            ? t(dragFeedback.messageKey, dragFeedback.messageValues)
                            : shortage
                              ? t("seating.shortageCount", { count: shortage })
                              : t("seating.enoughSpace", { count: moving.length })
                          : undefined
                      }
                      label={t("seating.dropZone", { table: table.name })}
                    >
                      {remote.length > 0 && (
                        <p className="mb-1 truncate text-center text-xs text-muted-foreground">
                          {t("seating.remoteSelecting", {
                            names: remote.map((lease) => lease.displayName).join(", "),
                          })}
                        </p>
                      )}
                      <div
                        id={`seating-table-${table.id}`}
                        className="relative aspect-square scroll-mt-6"
                      >
                        <Image
                          src="/images/seating/round-table.svg"
                          alt=""
                          width={200}
                          height={200}
                          className="pointer-events-none absolute left-[16%] top-[16%] size-[68%]"
                        />
                        <button
                          className={`absolute left-[25%] top-[25%] flex size-1/2 flex-col items-center justify-center rounded-full text-center text-sm ${tableId === table.id ? "ring-2 ring-primary" : ""}`}
                          aria-pressed={tableId === table.id && seat === null}
                          aria-label={t("seating.viewTableGuests", { table: table.name })}
                          onClick={() => {
                            if (selection.length && editable) {
                              move(selection, table.id);
                              return;
                            }
                            setTableId(table.id);
                            setPlaceId(null);
                            setSeat(null);
                          }}
                        >
                          <strong>{table.name}</strong>
                          {table.groupId && (
                            <span className="block max-w-24 truncate text-[10px] text-muted-foreground">
                              {groupNames.get(table.groupId) ?? t("seating.groupScope")}
                            </span>
                          )}
                          <span>
                            {t("seating.placesCount", {
                              count: members.length,
                              capacity: table.capacity,
                            })}
                          </span>
                        </button>
                        {Array.from({ length: table.capacity }, (_, i) => {
                          const n = i + 1,
                            angle = (i / table.capacity) * Math.PI * 2 - Math.PI / 2;
                          const a = members.find((x) => x.seatNumber === n),
                            p = plan.places.find((x) => x.id === a?.placeId);
                          const confirmed = p?.person?.attendanceStatus === "ATTENDING";
                          return (
                            <DropTarget
                              key={n}
                              id={`seat:${table.id}:${n}`}
                              target={{ tableId: table.id, seatNumber: n }}
                              disabled={!editable || saving}
                              invalid={
                                moving.length > 0 &&
                                (shortage > 0 || (!!a && !moving.includes(a.placeId)))
                              }
                              className={`absolute h-10 w-9 rounded-lg ${ghostSeats.includes(n) ? "border-2 border-dashed border-primary bg-primary/10" : ""} ${dragTarget?.tableId === table.id && dragFeedback?.valid && dragFeedback.seats.includes(n) ? "bg-primary/20 ring-2 ring-primary" : ""}`}
                              label={
                                dragTarget?.tableId === table.id &&
                                dragFeedback?.valid &&
                                dragFeedback.seats.includes(n)
                                  ? t("seating.seatDestination", { table: table.name, seat: n })
                                  : undefined
                              }
                              style={{
                                left: `calc(${50 + 43 * Math.cos(angle)}% - 18px)`,
                                top: `calc(${50 + 43 * Math.sin(angle)}% - 20px)`,
                              }}
                            >
                              <DragSource
                                id={`chair:${table.id}:${n}`}
                                ids={p ? [p.id] : []}
                                disabled={!p || !editable || saving || status !== "connected"}
                                label={t("seating.seatLabel", {
                                  table: table.name,
                                  seat: n,
                                  guest: p ? placeName(p.id) : t("seating.emptySeat"),
                                })}
                                onClick={() => {
                                  if (selection.length && editable) {
                                    move(selection, table.id, n);
                                    return;
                                  }
                                  setTableId(table.id);
                                  setSeat(n);
                                  setPlaceId(p?.id ?? null);
                                }}
                                className={`relative size-full rounded focus-visible:outline-2 focus-visible:outline-primary ${p && seatsNeedingAttention.some((item) => item.id === p.id) ? "ring-2 ring-amber-500" : ""}`}
                              >
                                <Image
                                  src={`/images/seating/${!p ? "chair-empty.svg" : confirmed ? "chair-confirmed.svg" : "chair-pending.svg"}`}
                                  alt=""
                                  width={36}
                                  height={40}
                                  draggable={false}
                                  className="pointer-events-none size-full"
                                  style={{
                                    transform: `rotate(${(angle * 180) / Math.PI + 90}deg)`,
                                  }}
                                />
                                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold">
                                  {n}
                                </span>
                              </DragSource>
                            </DropTarget>
                          );
                        })}
                      </div>
                      <div
                        className="flex flex-wrap gap-1"
                        aria-label={t("seating.guestsAtTable", { table: table.name })}
                      >
                        {members.slice(0, 4).map((a) => {
                          const person = plan.places.find((p) => p.id === a.placeId);
                          const guest = plan.guests.find((g) => g.id === person?.guestId);
                          const name =
                            person?.person?.fullName ||
                            (person?.position === 1
                              ? guest?.recipientName
                              : t("seating.companion", { position: person?.position }));
                          return (
                            <button
                              key={a.placeId}
                              className="max-w-full truncate rounded-full bg-primary/10 px-2 py-1 text-[10px] focus-visible:outline-2 focus-visible:outline-primary"
                              onClick={() => {
                                setTableId(table.id);
                                setPlaceId(a.placeId);
                                setSeat(a.seatNumber);
                              }}
                              title={name}
                            >
                              {name}
                            </button>
                          );
                        })}
                        {members.length > 4 && (
                          <span className="px-1 py-1 text-[10px] text-muted-foreground">
                            +{members.length - 4}
                          </span>
                        )}
                      </div>
                    </DropTarget>
                  );
                })}
              </div>
            </section>
            <dialog
              ref={detailsRef}
              onKeyDown={trapDialogFocus}
              onClose={(event) => {
                if (event.target === event.currentTarget) closeDetails();
              }}
              aria-labelledby="seating-details-title"
              className="seating-details-dialog fixed inset-x-0 bottom-0 top-auto m-0 h-[85dvh] max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-2xl border border-foreground/10 bg-white p-0 text-foreground shadow-2xl backdrop:bg-black/30 open:flex open:flex-col sm:inset-y-0 sm:left-auto sm:right-0 sm:h-dvh sm:max-h-none sm:max-w-lg sm:rounded-none"
            >
              {inspectedTable && seat === null && !inspectedPlace ? (
                <SeatingTableDrawer
                  key={inspectedTable.id + ":" + plan.version}
                  table={inspectedTable}
                  plan={plan}
                  editable={editable}
                  saving={saving}
                  onClose={closeDetails}
                  onView={(id, number) => {
                    setPlaceId(id);
                    setSeat(number);
                  }}
                  onMove={(id) => {
                    setSelection([id]);
                    closeDetails();
                  }}
                  onUnassign={(id) => move([id], null)}
                  onAssign={(number) => {
                    if (selection.length) move(selection, inspectedTable.id, number);
                    else {
                      closeDetails();
                      setFailure(false);
                      setMessage(
                        t("seating.waitingSeatHelp", { seat: number, table: inspectedTable.name }),
                      );
                    }
                  }}
                  onSave={(name, capacity) =>
                    void change({
                      action: "UPDATE_TABLE",
                      tableId: inspectedTable.id,
                      name,
                      capacity,
                    })
                  }
                  onDelete={() =>
                    void change({ action: "DELETE_TABLE", tableId: inspectedTable.id })
                  }
                />
              ) : (
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                  <div className="flex items-center justify-between gap-4">
                    <h2
                      id="seating-details-title"
                      data-drawer-heading
                      tabIndex={-1}
                      className="text-lg font-semibold outline-none"
                    >
                      {seat !== null || inspectedPlace
                        ? t("seating.placeDetails")
                        : t("seating.tableDetails")}
                    </h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 outline-none hover:bg-foreground/5 focus-visible:ring-1 focus-visible:ring-offset-0"
                      aria-label={t("seating.closeDetails")}
                      onClick={closeDetails}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                  {!inspectedTable && !inspectedPlace && (
                    <p className="text-sm text-muted-foreground">{t("seating.interactionHelp")}</p>
                  )}
                  {inspectedTable && (
                    <>
                      <h3 className="text-lg">
                        {inspectedTable.name}
                        {seat ? ` · ${t("seating.seat", { number: seat })}` : ""}
                      </h3>
                      {seat && !inspectedPlace && (
                        <p className="text-sm">{t("seating.emptySeatStatus")}</p>
                      )}
                      {editable && seat && !inspectedPlace && selection.length > 0 && (
                        <Button
                          variant="outline"
                          disabled={saving || !selection.length}
                          onClick={() => move(selection, inspectedTable.id, seat)}
                        >
                          {t("seating.moveSelection")}
                        </Button>
                      )}
                    </>
                  )}
                  {inspectedPlace && inspectedGuest && (
                    <div className="space-y-2 text-sm">
                      <p className="font-medium">{placeName(inspectedPlace.id)}</p>
                      <p>
                        {t(
                          `seating.status.${inspectedPlace.person?.attendanceStatus ?? "PENDING"}`,
                          { defaultValue: t("seating.unknownSide") },
                        )}
                      </p>
                      <p>
                        {t("seating.invitation", {
                          guest: recipient(
                            inspectedGuest,
                            t("seating.family"),
                            t("seating.groupPrefix"),
                          ),
                        })}
                      </p>
                      <p>
                        {t(`planning.sideValues.${inspectedGuest.side}`, {
                          defaultValue: sideLabels[inspectedGuest.side],
                        })}{" "}
                        · {inspectedGuest.group?.name ?? t("seating.unassignedGroup")}
                      </p>
                      <p>
                        {t("seating.contact", {
                          phone: inspectedGuest.phone ?? t("seating.noPhone"),
                        })}
                      </p>
                      <p>{inspectedGuest.note}</p>
                      {editable && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => {
                            setSelection([inspectedPlace.id]);
                            closeDetails();
                          }}
                        >
                          {t("seating.selectToMove")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </dialog>
          </div>
        </section>
        {message && !failure && (
          <div
            role="status"
            className="fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-lg"
          >
            <span>{message}</span>
            {!saving && (
              <button
                aria-label={t("seating.hideNotice")}
                onClick={() => setMessage("")}
                className="rounded p-1 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <DragOverlay
          modifiers={[offsetDragPreview]}
          style={{ pointerEvents: "none", width: "max-content", maxWidth: "75vw" }}
          adjustScale={false}
        >
          {dragIds.length > 0 && (
            <SeatingDragPreview plan={plan} ids={dragIds} feedback={dragFeedback} />
          )}
        </DragOverlay>
      </DndContext>
    </SeatingDragPresenceContext.Provider>
  );
}
