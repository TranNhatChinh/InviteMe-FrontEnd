"use client";

import { useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, Search, UserCheck, Users, X } from "lucide-react";
import { Input } from "@/shared/ui/input";
import type { PlanningGuest } from "../api/planning.api";
import type { PlanningSeatingPlace } from "../api/planning-seating.api";
import { useSeatingDragLock } from "./seating-drag-presence";

interface SeatingGuestTrayProps {
  guests: PlanningGuest[];
  places: PlanningSeatingPlace[];
  assignedPlaceIds: Set<string>;
  onSelectParty: (guestId: string, placeIds: string[]) => void;
  selectedGuestId?: string | null;
  groups?: { id: string; name: string }[];
  /** Lets parties and single people be dragged onto tables or seats of the hall. */
  editable?: boolean;
}

// One person of a party, dragged alone onto a specific seat.
function SeatingPersonChip({
  place,
  label,
  editable,
}: {
  place: PlanningSeatingPlace;
  label: string;
  editable: boolean;
}) {
  const lock = useSeatingDragLock([place.id]);
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `place:${place.id}`,
    data: { ids: [place.id] },
    disabled: !editable || Boolean(lock),
  });
  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // The party card is draggable too; keep this press for the single person.
      onPointerDown={(event) => {
        listeners?.onPointerDown?.(event);
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      title={editable ? `Kéo ${label} vào một ghế` : label}
      className={`inline-flex items-center gap-0.5 rounded-full border bg-background px-1.5 py-0.5 ${
        editable && !lock ? "cursor-grab active:cursor-grabbing hover:border-primary" : ""
      } ${isDragging ? "opacity-40" : ""}`}
    >
      {editable && <GripVertical className="size-2.5 text-muted-foreground" />}
      {label}
    </span>
  );
}

function SeatingGuestPartyItem({
  guest,
  unseatedPlaces,
  isSelected,
  onSelectParty,
  editable,
}: {
  guest: PlanningGuest;
  unseatedPlaces: PlanningSeatingPlace[];
  isSelected: boolean;
  onSelectParty: (guestId: string, placeIds: string[]) => void;
  editable: boolean;
}) {
  const placeIds = useMemo(() => unseatedPlaces.map((p) => p.id), [unseatedPlaces]);
  const lock = useSeatingDragLock(placeIds);
  const isLockedByOther = Boolean(lock);
  const {
    setNodeRef: setPartyRef,
    attributes: partyAttributes,
    listeners: partyListeners,
    isDragging: partyDragging,
  } = useDraggable({
    id: `party:${guest.id}`,
    data: { ids: placeIds },
    disabled: !editable || isLockedByOther,
  });

  return (
    <div
      ref={setPartyRef}
      {...partyAttributes}
      {...partyListeners}
      onClick={() => {
        if (!isLockedByOther) {
          onSelectParty(guest.id, placeIds);
        }
      }}
      className={`group relative flex flex-col justify-between rounded-xl border p-3 transition-all ${
        isLockedByOther
          ? "border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20 opacity-70 cursor-not-allowed"
          : isSelected
            ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary cursor-pointer"
            : "border-border/80 bg-card hover:border-primary/40 hover:bg-muted/30 cursor-pointer"
      } ${editable && !isLockedByOther ? "active:cursor-grabbing" : ""} ${
        partyDragging ? "opacity-40" : ""
      }`}
      title={editable && !isLockedByOther ? "Kéo cả thiệp vào một bàn hoặc ghế, hoặc bấm để chọn" : undefined}
      role="button"
      aria-disabled={isLockedByOther}
      tabIndex={isLockedByOther ? -1 : 0}
      onKeyDown={(e) => {
        if (!isLockedByOther && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelectParty(guest.id, placeIds);
        }
      }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
              {guest.honorific ? `${guest.honorific} ` : ""}
              {guest.recipientName}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span
              className={`font-semibold ${
                guest.side === "GROOM"
                  ? "text-blue-600 dark:text-blue-400"
                  : guest.side === "BRIDE"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {guest.side === "GROOM"
                ? "Nhà trai"
                : guest.side === "BRIDE"
                  ? "Nhà gái"
                  : "Khách chung"}
            </span>
            {guest.group && <span>· {guest.group.name}</span>}
          </div>

          {/* Locked by another co-host badge */}
          {lock && (
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full mt-1.5 w-fit">
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Đang được xử lý bởi {lock.displayName}</span>
            </div>
          )}
        </div>

        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
          {unseatedPlaces.length} chỗ
        </span>
      </div>

      {/* Members: each can be dragged alone onto a seat */}
      {unseatedPlaces.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground border-t border-border/40 pt-1.5">
          <span>Gồm:</span>
          {unseatedPlaces.map((p, idx) => (
            <SeatingPersonChip
              key={p.id}
              place={p}
              label={p.person?.fullName || `Khách ${idx + 1}`}
              editable={editable}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SeatingGuestTray({
  guests,
  places,
  assignedPlaceIds,
  onSelectParty,
  selectedGuestId = null,
  groups = [],
  editable = false,
}: SeatingGuestTrayProps) {
  // Dropping a seated person back here unseats them.
  const { setNodeRef: setTrayRef, isOver: trayOver } = useDroppable({
    id: "unassigned",
    data: { tableId: null },
    disabled: !editable,
  });
  const [sideFilter, setSideFilter] = useState<"ALL" | "GROOM" | "BRIDE" | "MUTUAL">("ALL");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [rsvpFilter, setRsvpFilter] = useState<"ALL" | "ATTENDING" | "PENDING">("ALL");
  const [search, setSearch] = useState("");

  // Map places by guestId
  const placesByGuestId = useMemo(() => {
    const map = new Map<string, PlanningSeatingPlace[]>();
    for (const place of places) {
      // Exclude declined or waitlisted
      const status = place.person?.attendanceStatus;
      if (status === "DECLINED" || status === "WAITLISTED") continue;

      const list = map.get(place.guestId) ?? [];
      list.push(place);
      map.set(place.guestId, list);
    }
    return map;
  }, [places]);

  // Compute unseated parties
  const unseatedParties = useMemo(() => {
    const list: { guest: PlanningGuest; unseatedPlaces: PlanningSeatingPlace[] }[] = [];

    for (const guest of guests) {
      const guestPlaces = placesByGuestId.get(guest.id) ?? [];
      const unseated = guestPlaces.filter((p) => !assignedPlaceIds.has(p.id));

      if (unseated.length > 0) {
        list.push({ guest, unseatedPlaces: unseated });
      }
    }

    return list;
  }, [guests, placesByGuestId, assignedPlaceIds]);

  // Filtered parties
  const filteredParties = useMemo(() => {
    return unseatedParties.filter(({ guest, unseatedPlaces }) => {
      // Side filter
      if (sideFilter !== "ALL") {
        if (guest.side !== sideFilter) return false;
      }

      // Group filter
      if (groupFilter !== "ALL") {
        if (guest.group?.id !== groupFilter) return false;
      }

      // RSVP filter
      if (rsvpFilter !== "ALL") {
        const hasMatchingPlace = unseatedPlaces.some(
          (p) => p.person?.attendanceStatus === rsvpFilter,
        );
        if (!hasMatchingPlace) return false;
      }

      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchName = guest.recipientName.toLowerCase().includes(query);
        const matchMember = unseatedPlaces.some((p) =>
          p.person?.fullName?.toLowerCase().includes(query),
        );
        if (!matchName && !matchMember) return false;
      }

      return true;
    });
  }, [unseatedParties, sideFilter, groupFilter, rsvpFilter, search]);

  const totalUnseatedGuests = useMemo(() => {
    return unseatedParties.reduce((sum, p) => sum + p.unseatedPlaces.length, 0);
  }, [unseatedParties]);

  return (
    <div
      ref={setTrayRef}
      className={`flex flex-col h-full rounded-3xl border bg-card p-4 sm:p-5 shadow-sm space-y-4 transition-colors ${
        trayOver ? "border-primary ring-2 ring-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          <h3 className="font-serif text-base font-semibold text-foreground">
            Khách chưa xếp chỗ ({totalUnseatedGuests})
          </h3>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">
          {unseatedParties.length} thiệp
        </span>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tìm tên khách hoặc thiệp..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 text-xs h-8"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        {/* Side Tabs */}
        <div className="flex rounded-lg bg-muted/60 p-0.5 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => setSideFilter("ALL")}
            className={`flex-1 rounded-md py-1 transition-all ${
              sideFilter === "ALL" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => setSideFilter("GROOM")}
            className={`flex-1 rounded-md py-1 transition-all ${
              sideFilter === "GROOM"
                ? "bg-blue-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-blue-600"
            }`}
          >
            Nhà trai
          </button>
          <button
            type="button"
            onClick={() => setSideFilter("BRIDE")}
            className={`flex-1 rounded-md py-1 transition-all ${
              sideFilter === "BRIDE"
                ? "bg-rose-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-rose-600"
            }`}
          >
            Nhà gái
          </button>
        </div>

        {/* Dropdowns row */}
        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background p-1.5 text-[11px] text-foreground"
            >
              <option value="ALL">Tất cả nhóm</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={rsvpFilter}
            onChange={(e) => setRsvpFilter(e.target.value as "ALL" | "ATTENDING" | "PENDING")}
            className="flex-1 rounded-md border border-input bg-background p-1.5 text-[11px] text-foreground"
          >
            <option value="ALL">Mọi trạng thái</option>
            <option value="ATTENDING">Đã xác nhận</option>
            <option value="PENDING">Chưa trả lời</option>
          </select>
        </div>
      </div>

      {/* Guest party list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[500px]">
        {filteredParties.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground space-y-1">
            <UserCheck className="size-6 mx-auto text-emerald-500/70" />
            <p>Không có khách nào phù hợp bộ lọc.</p>
          </div>
        ) : (
          filteredParties.map(({ guest, unseatedPlaces }) => (
            <SeatingGuestPartyItem
              key={guest.id}
              guest={guest}
              unseatedPlaces={unseatedPlaces}
              isSelected={selectedGuestId === guest.id}
              onSelectParty={onSelectParty}
              editable={editable}
            />
          ))
        )}
      </div>
    </div>
  );
}
