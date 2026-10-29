"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useDraggable } from "@dnd-kit/core";
import { ChevronDown, GripVertical, Plus, Users } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { formatNumber } from "@/i18n/format";
import { useLanguage } from "@/i18n/language-context";
import type { PlanningGuest } from "../api/planning.api";
import type { SeatingPlan } from "../api/planning-seating.api";
import { DraggingLabel, useSeatingDragLock } from "./seating-drag-presence";

type Place = SeatingPlan["places"][number];
type Table = SeatingPlan["tables"][number];
type QueueEntry = { guest: PlanningGuest; places: Place[] };
type QueueProps = {
  plan: SeatingPlan;
  disabled: boolean;
  selection: string[];
  allowedGroupIds?: ReadonlySet<string> | null;
  onSelect: (ids: string[]) => void;
  onTable: (id: string) => void;
};

export function queuePlaceName(
  place: Place,
  guest: PlanningGuest,
  companionName: (position: number) => string,
) {
  return (
    place.person?.fullName ||
    (place.position === 1 ? guest.recipientName : companionName(place.position))
  );
}

function QueueDrag({
  id,
  ids,
  disabled,
  selected,
  label,
  outOfScope = false,
  onSelect,
  children,
}: {
  id: string;
  ids: string[];
  disabled: boolean;
  selected: boolean;
  label: string;
  outOfScope?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "seating.queue" });
  const lock = useSeatingDragLock(ids);
  const unavailable = disabled || outOfScope || !!lock;
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id,
    data: { ids },
    disabled: unavailable,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-1 rounded-lg transition-colors",
        selected && "bg-primary/10",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        disabled={unavailable}
        aria-label={t("drag", { name: label })}
        title={outOfScope ? t("outOfScope") : undefined}
        className="shrink-0 touch-none rounded p-1 text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        disabled={unavailable}
        aria-pressed={selected}
        aria-label={t("select", { name: label })}
        title={outOfScope ? t("outOfScope") : undefined}
        onPointerDown={(event) => listeners?.onPointerDown?.(event)}
        className={cn(
          "flex min-w-0 flex-1 touch-pan-y items-center gap-2 rounded-lg py-2 pr-2 text-left focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed",
          (isDragging || lock) && "opacity-40",
          outOfScope && "opacity-60",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">{children}</span>
        </span>
      </button>
      {lock && (
        <span className="w-full pl-6 pb-1">
          <DraggingLabel presence={lock} />
        </span>
      )}
    </div>
  );
}

function TableChip({ table, onTable }: { table?: Table; onTable: QueueProps["onTable"] }) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "seating.queue" });
  if (!table) return null;
  return (
    <button
      type="button"
      onClick={() => onTable(table.id)}
      aria-label={t("goToTable", { table: table.name })}
      className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-primary"
    >
      {table.name}
    </button>
  );
}

function GuestRow({
  place,
  guest,
  table,
  disabled,
  selected,
  outOfScope = false,
  onSelect,
  onTable,
  individual = false,
}: {
  place: Place;
  guest: PlanningGuest;
  table?: Table;
  disabled: boolean;
  selected: boolean;
  outOfScope?: boolean;
  onSelect: () => void;
  onTable: QueueProps["onTable"];
  individual?: boolean;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "seating.queue" });
  const name = queuePlaceName(place, guest, (position) => t("companion", { position }));
  const placeholder = !place.person && place.position > 1;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-xl border bg-white p-1",
        placeholder && "border-dashed",
        table && !selected && "bg-muted/30 text-muted-foreground",
        outOfScope && "opacity-75 bg-muted/20",
        selected && "border-primary bg-primary/5",
      )}
    >
      <div className="min-w-0 flex-1">
        <QueueDrag
          id={`queue:${place.id}`}
          ids={[place.id]}
          disabled={disabled}
          outOfScope={outOfScope}
          selected={selected}
          label={name}
          onSelect={onSelect}
        >
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-foreground",
              placeholder && "border border-dashed bg-transparent",
            )}
            aria-hidden="true"
          >
            {placeholder ? (
              <Plus className="size-3" />
            ) : (
              name.trim().split(/\s+/).at(-1)?.slice(0, 1)
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium" title={name}>
              {name}
            </span>
            {individual && (
              <span className="block truncate text-[11px] text-muted-foreground">
                {guest.group?.name ??
                  t(
                    guest.side === "GROOM"
                      ? "groom"
                      : guest.side === "BRIDE"
                        ? "bride"
                        : guest.side === "MUTUAL"
                          ? "shared"
                          : "unspecified",
                  )}
              </span>
            )}
          </span>
        </QueueDrag>
      </div>
      <TableChip table={table} onTable={onTable} />
    </div>
  );
}

function GroupCard({
  entry,
  tablesByPlace,
  disabled,
  selection,
  outOfScope = false,
  onSelect,
  onTable,
}: {
  entry: QueueEntry;
  tablesByPlace: Map<string, Table>;
  disabled: boolean;
  selection: string[];
  outOfScope?: boolean;
  onSelect: QueueProps["onSelect"];
  onTable: QueueProps["onTable"];
}) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const { t } = useTranslation("guestPlanning", { keyPrefix: "seating.queue" });
  const { language } = useLanguage();
  const { guest, places } = entry;
  const ids = places.map((p) => p.id);
  const lock = useSeatingDragLock(ids);
  const unavailable = disabled || outOfScope || !!lock;
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `queue-group:${guest.id}`,
    data: { ids },
    disabled: unavailable,
  });
  const selected = ids.length > 0 && ids.every((id) => selection.includes(id));
  const assignedCount = places.filter((p) => tablesByPlace.has(p.id)).length;
  const tableCount = new Set(places.flatMap((p) => tablesByPlace.get(p.id)?.id ?? [])).size;
  const name = `${t(guest.invitationKind === "FAMILY" ? "family" : "group")} ${guest.honorific ? guest.honorific.toLocaleLowerCase(language === "en" ? "en-US" : "vi-VN") + " " : ""}${guest.recipientName}`;
  return (
    <article
      ref={setNodeRef}
      onPointerDown={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) && !(target instanceof SVGElement)) return;
        if (target.closest("[data-no-group-drag]")) return;
        const button = target.closest("button");
        // The grip owns its activator; the name button delegates here. Never
        // activate twice or let nested member/menu interactions drag the group.
        if (button && !button.hasAttribute("data-group-drag-target")) return;
        listeners?.onPointerDown?.(event);
      }}
      className={cn(
        "min-w-0 rounded-xl border bg-white p-2",
        !unavailable && "cursor-grab active:cursor-grabbing",
        outOfScope && "opacity-75 bg-muted/20",
        selected && "border-primary bg-primary/5",
      )}
    >
      <div className={cn("touch-none", (isDragging || lock) && "opacity-40")}>
        <div className="flex items-center gap-1">
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            disabled={unavailable}
            aria-label={t("drag", { name })}
            title={outOfScope ? t("outOfScope") : undefined}
            className="shrink-0 cursor-grab rounded p-1 text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-group-drag-target=""
            disabled={unavailable}
            aria-pressed={selected}
            aria-label={t("select", { name })}
            title={outOfScope ? t("outOfScope") : undefined}
            onClick={() => onSelect(ids)}
            className="min-w-0 flex-1 cursor-grab rounded-lg py-2 text-left focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed"
          >
            <span className="block truncate text-xs font-semibold" title={name}>
              {name}
            </span>
          </button>
          <button
            type="button"
            data-no-group-drag=""
            aria-expanded={expanded}
            aria-controls={detailId}
            aria-label={t(expanded ? "collapse" : "open", { name })}
            onClick={() => setExpanded(!expanded)}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronDown
              className={cn("size-4 transition-transform", expanded && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        </div>
        <div className="flex flex-wrap gap-1 px-1 text-[10px] text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5">
            {t(
              guest.side === "GROOM"
                ? "groom"
                : guest.side === "BRIDE"
                  ? "bride"
                  : guest.side === "MUTUAL"
                    ? "shared"
                    : "unspecified",
            )}
          </span>
          {guest.group && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5",
                outOfScope ? "bg-amber-100 text-amber-800" : "bg-muted",
              )}
            >
              {guest.group.name}
              {outOfScope && " 🔒"}
            </span>
          )}
          {tableCount > 1 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
              {t("splitTables", { count: formatNumber(tableCount, language) })}
            </span>
          )}
        </div>
        <div className="mt-2 flex w-full items-center gap-2 px-1 text-left text-[11px] text-muted-foreground">
          <span>
            {t("peopleAssigned", {
              people: formatNumber(places.length, language),
              assigned: formatNumber(assignedCount, language),
              total: formatNumber(places.length, language),
            })}
          </span>
          <span
            className="ml-auto h-1 w-10 overflow-hidden rounded-full bg-muted"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${places.length ? (assignedCount / places.length) * 100 : 0}%` }}
            />
          </span>
        </div>
      </div>
      {lock && (
        <div className="mt-1 px-1">
          <DraggingLabel presence={lock} />
        </div>
      )}
      <div
        data-no-group-drag=""
        id={detailId}
        hidden={!expanded}
        className="mt-3 cursor-auto space-y-2 border-t pt-2"
      >
        {places.map((place) => (
          <GuestRow
            key={place.id}
            place={place}
            guest={guest}
            table={tablesByPlace.get(place.id)}
            disabled={disabled}
            outOfScope={outOfScope}
            selected={selection.includes(place.id)}
            onSelect={() => onSelect([place.id])}
            onTable={onTable}
          />
        ))}
      </div>
    </article>
  );
}

export function SeatingQueue({
  plan,
  disabled,
  selection,
  allowedGroupIds,
  onSelect,
  onTable,
}: QueueProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"unassigned" | "assigned" | "all">("unassigned");
  const [side, setSide] = useState<PlanningGuest["side"] | "all">("all");
  const { t } = useTranslation("guestPlanning", { keyPrefix: "seating.queue" });
  const { language } = useLanguage();
  const { entries, tablesByPlace } = useMemo(() => {
    const byGuest = new Map<string, Place[]>();
    for (const place of plan.places) {
      const list = byGuest.get(place.guestId) ?? [];
      list.push(place);
      byGuest.set(place.guestId, list);
    }
    const tables = new Map(plan.tables.map((t) => [t.id, t]));
    const tablesByPlace = new Map<string, Table>();
    for (const a of plan.assignments) {
      const table = tables.get(a.tableId);
      if (table) tablesByPlace.set(a.placeId, table);
    }
    return {
      entries: plan.guests.map((guest) => ({
        guest,
        places: (byGuest.get(guest.id) ?? []).sort((a, b) => a.position - b.position),
      })),
      tablesByPlace,
    };
  }, [plan]);
  const searched = entries.filter(
    ({ guest, places }) =>
      (side === "all" || guest.side === side) &&
      `${guest.recipientName} ${guest.group?.name ?? ""} ${t(
        guest.side === "GROOM"
          ? "groom"
          : guest.side === "BRIDE"
            ? "bride"
            : guest.side === "MUTUAL"
              ? "shared"
              : "unspecified",
      )} ${places.map((p) => p.person?.fullName ?? "").join(" ")}`
        .toLocaleLowerCase(language === "en" ? "en-US" : "vi-VN")
        .includes(search.trim().toLocaleLowerCase(language === "en" ? "en-US" : "vi-VN")),
  );
  const counts = {
    unassigned: searched.reduce(
      (n, e) => n + e.places.filter((p) => !tablesByPlace.has(p.id)).length,
      0,
    ),
    assigned: searched.reduce(
      (n, e) => n + e.places.filter((p) => tablesByPlace.has(p.id)).length,
      0,
    ),
    all: searched.reduce((n, e) => n + e.places.length, 0),
  };
  const visible = searched.filter(
    (e) =>
      filter === "all" ||
      e.places.some((p) =>
        filter === "assigned" ? tablesByPlace.has(p.id) : !tablesByPlace.has(p.id),
      ),
  );
  return (
    <>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Users className="size-4" aria-hidden="true" />
        {t("title")}
      </h2>
      <input
        aria-label={t("searchAria")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full rounded-lg border bg-white p-2 text-sm"
      />
      <div className="flex flex-wrap gap-1" role="group" aria-label={t("filterAria")}>
        {(
          [
            ["unassigned", t("unassigned")],
            ["assigned", t("assigned")],
            ["all", t("all")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-full border px-2 py-1.5 text-[11px] focus-visible:outline-2 focus-visible:outline-primary",
              filter === value
                ? "border-primary bg-primary/10 font-semibold"
                : "border-transparent text-muted-foreground",
            )}
          >
            {label} ({formatNumber(counts[value], language)})
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t("sideAria")}>
        {(
          [
            ["all", t("allSides")],
            ["GROOM", t("side.GROOM")],
            ["BRIDE", t("side.BRIDE")],
            ["MUTUAL", t("side.MUTUAL")],
            ["UNSPECIFIED", t("side.UNSPECIFIED")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={side === value}
            onClick={() => setSide(value)}
            className={cn(
              "rounded-full px-2 py-1 text-[10px] focus-visible:outline-2 focus-visible:outline-primary",
              side === value ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{t("countHint")}</p>
      <div
        className="max-h-[360px] space-y-2 overflow-y-auto p-0.5 lg:max-h-[620px]"
        aria-label={t("listAria")}
      >
        {visible.map((entry) => {
          const firstPlace = entry.places[0];
          const outOfScope =
            allowedGroupIds != null &&
            (!entry.guest.group?.id || !allowedGroupIds.has(entry.guest.group.id));
          return entry.guest.invitationKind === "INDIVIDUAL" &&
            entry.places.length === 1 &&
            firstPlace ? (
            <GuestRow
              key={entry.guest.id}
              guest={entry.guest}
              place={firstPlace}
              individual
              table={tablesByPlace.get(firstPlace.id)}
              disabled={disabled}
              outOfScope={outOfScope}
              selected={selection.includes(firstPlace.id)}
              onSelect={() => onSelect([firstPlace.id])}
              onTable={onTable}
            />
          ) : (
            <GroupCard
              key={entry.guest.id}
              entry={entry}
              tablesByPlace={tablesByPlace}
              disabled={disabled}
              outOfScope={outOfScope}
              selection={selection}
              onSelect={onSelect}
              onTable={onTable}
            />
          );
        })}
        {!visible.length && (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            {!plan.guests.length
              ? t("noGuests")
              : filter === "unassigned" && !search && side === "all"
                ? t("allAssigned")
                : t("noFilterMatch")}
          </p>
        )}
      </div>
    </>
  );
}
