"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Armchair, GripVertical, MoveRight, Sparkles, Check, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { CoupleRow } from "../utils/couple-import";
import {
  groupKey,
  movePlaces,
  seatingParties,
  suggestSeating,
  tableOccupancy,
  seatingStrategies,
  type SeatingStrategy,
  type SeatingPlan,
  recommendedTableCount,
  affinityGroupKey,
} from "../utils/seating-demo";
import {
  chairAppearance,
  exampleSeatPeople,
  initialSeatPeople,
  placeKey,
  setPlacePerson,
  tablePlaces,
  type SeatPeople,
} from "../utils/seating-attendance";
import { SeatingPersonDetails } from "./seating-person-details";
import { SeatingTableDetails } from "./seating-table-details";
import type { Language } from "@/i18n/config";
import {
  formatSeatingNumber,
  formatGuestSide,
  formatRecipientLabel,
  seatingStrategyLabel,
} from "../utils/seating-demo-i18n";

const palette = ["#9B5972", "#577D78", "#A07840", "#7476A2", "#9B6552", "#587D9E"];
type Selection = { partyId: string; place?: number };

export function CoupleSeatingPreview({ rows, onBack }: { rows: CoupleRow[]; onBack: () => void }) {
  const { t, i18n } = useTranslation("guestPlanning", { keyPrefix: "seatingDemo" });
  const language = (i18n.resolvedLanguage === "en" ? "en" : "vi") as Language;
  const number = (value: number) => formatSeatingNumber(value, language);
  const parties = useMemo(() => seatingParties(rows), [rows]);
  const total = parties.reduce((sum, party) => sum + party.count, 0);
  const [capacity, setCapacity] = useState(10);
  const [tableCount, setTableCount] = useState(recommendedTableCount(parties, 10));
  const [plan, setPlan] = useState<SeatingPlan>(() =>
    Object.fromEntries(
      parties.map((party) => [party.id, Array.from({ length: party.count }, () => null)]),
    ),
  );
  const [draftCapacity, setDraftCapacity] = useState(capacity);
  const [draftTableCount, setDraftTableCount] = useState(tableCount);
  const [strategy, setStrategy] = useState<SeatingStrategy>("affinity");
  const [appliedStrategy, setAppliedStrategy] = useState<SeatingStrategy | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const proposal = useMemo(
    () => suggestSeating(parties, draftCapacity, draftTableCount, strategy),
    [parties, draftCapacity, draftTableCount, strategy],
  );
  const proposedUnplaced = Object.values(proposal).reduce(
    (sum, places) => sum + places.filter((table) => table === null).length,
    0,
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [destination, setDestination] = useState("0");
  const [notice, setNotice] = useState("");
  const [hoveredTable, setHoveredTable] = useState<number | null>(null);
  const [manual, setManual] = useState(false);
  const groups = [...new Set(parties.map((party) => groupKey(party.group)))];
  const groupChips = [
    ...new Map(parties.map((party) => [affinityGroupKey(party), party])).values(),
  ];
  const colorFor = (group: string) =>
    palette[groups.indexOf(groupKey(group)) % palette.length] ?? palette[0];
  const selected = parties.find((party) => party.id === selection?.partyId);
  const selectedPlaces = selected ? (plan[selected.id] ?? []) : [];
  const selectedTable =
    selection?.place !== undefined ? selectedPlaces[selection.place] : undefined;
  const unplaced = Object.values(plan).reduce(
    (sum, places) => sum + places.filter((table) => table === null).length,
    0,
  );
  const [openPanel, setOpenPanel] = useState(false);
  const [people, setPeople] = useState<SeatPeople>(() => initialSeatPeople(parties));
  const [inspectedTable, setInspectedTable] = useState<number | null>(null);
  const [demoRsvp, setDemoRsvp] = useState(false);
  const selectedPerson =
    selected && selection?.place !== undefined
      ? people[placeKey(selected.id, selection.place)]
      : undefined;
  const selectedSeatNumber =
    typeof selectedTable === "number"
      ? tablePlaces(parties, plan, selectedTable).findIndex(
          ({ party, place }) => party.id === selection?.partyId && place === selection?.place,
        ) + 1
      : undefined;
  const selectedMembers = selected
    ? (plan[selected.id] ?? []).flatMap((_, place) => {
        const person = people[placeKey(selected.id, place)];
        return person ? [person] : [];
      })
    : [];
  const confirmedCount = Object.values(people).filter(
    (person) => person.attendanceStatus === "ATTENDING",
  ).length;

  function select(partyId: string, place?: number) {
    setInspectedTable(null);
    setSelection({ partyId, place });
    setOpenPanel(true);
    const table = plan[partyId]?.[place ?? 0];
    setDestination(table === null || table === undefined ? "unplaced" : String(table));
    setNotice("");
  }
  function move(partyId: string, table: number | null, place?: number) {
    const next = movePlaces(plan, partyId, table, capacity, tableCount, place);
    if (!next) {
      setNotice(t("moveCapacityError"));
      return;
    }
    setPlan(next);
    setManual(true);
    setNotice(
      table === null
        ? t("movedToQueue")
        : t("movedToTable", {
            what: place === undefined ? t("party") : t("oneExpectedSeat"),
            table: number(table + 1),
          }),
    );
  }
  function applySuggestion() {
    setCapacity(draftCapacity);
    setTableCount(draftTableCount);
    setPlan(proposal);
    setAppliedStrategy(strategy);
    setShowSuggestions(false);
    setSelection(null);
    setInspectedTable(null);
    setOpenPanel(false);
    setManual(false);
    setNotice(
      t("suggestionApplied", {
        strategy: seatingStrategyLabel(strategy, t),
        assigned: number(total - proposedUnplaced),
        total: number(total),
        unassigned: number(proposedUnplaced),
      }),
    );
  }

  return (
    <section className="min-w-0 space-y-5">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft /> {t("back")}
      </Button>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("eyebrow")}</p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl">{t("title")}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("summary", { groups: number(parties.length), places: number(total) })}
          </p>
        </div>
        <span className="rounded-full border bg-card px-3 py-2 text-xs">{t("devicePreview")}</span>
      </header>
      <section
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4"
        aria-label={t("legendAria")}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
            <span className="flex items-center gap-2">
              <span className="size-3 rounded border border-emerald-700 bg-emerald-400" />
              {t("confirmed")}
            </span>
            <span className="flex items-center gap-2">
              <span className="size-3 rounded border border-gray-400 bg-gray-200" />
              {t("pendingOrUnnamed")}
            </span>
            <span className="flex items-center gap-2">
              <span className="size-3 rounded border border-dashed border-gray-400 bg-white" />
              {t("emptySeat")}
            </span>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("confirmedSummary", {
              count: number(confirmedCount),
              source: demoRsvp ? t("sampleRsvp") : t("devicePreview"),
            })}
          </p>
        </div>
        <div className="max-w-sm">
          <Button
            variant="outline"
            onClick={() => {
              setPeople(exampleSeatPeople(parties));
              setDemoRsvp(true);
              setOpenPanel(false);
              setNotice(t("sampleRsvpNotice"));
            }}
          >
            {demoRsvp ? t("reloadSampleRsvp") : t("sampleRsvp")}
          </Button>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{t("sampleRsvpHelp")}</p>
        </div>
      </section>
      <section
        className="overflow-hidden rounded-2xl border bg-card"
        aria-labelledby="suggestions-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 id="suggestions-title" className="flex items-center gap-2 font-serif text-xl">
              <Sparkles className="size-5" /> {t("chooseSuggestion")}
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("suggestionHelp")}</p>
          </div>
          <Button variant="outline" onClick={() => setShowSuggestions(!showSuggestions)}>
            {showSuggestions ? t("collapseSuggestions") : t("showSuggestions")}
          </Button>
        </div>
        {showSuggestions && (
          <>
            <div
              className="grid grid-cols-3 gap-1 border-y bg-background p-2"
              role="tablist"
              aria-label={t("suggestionTabs")}
            >
              {seatingStrategies.map((item) => (
                <button
                  key={item.id}
                  id={`tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={strategy === item.id}
                  aria-controls="seating-suggestion-panel"
                  tabIndex={strategy === item.id ? 0 : -1}
                  onClick={() => setStrategy(item.id)}
                  onKeyDown={(event) => {
                    const index = seatingStrategies.findIndex((entry) => entry.id === item.id);
                    const next =
                      event.key === "ArrowRight"
                        ? (index + 1) % seatingStrategies.length
                        : event.key === "ArrowLeft"
                          ? (index + seatingStrategies.length - 1) % seatingStrategies.length
                          : event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? seatingStrategies.length - 1
                              : null;
                    if (next !== null) {
                      event.preventDefault();
                      const nextItem = seatingStrategies[next];
                      if (nextItem) {
                        setStrategy(nextItem.id);
                        document.getElementById(`tab-${nextItem.id}`)?.focus();
                      }
                    }
                  }}
                  className={`min-w-0 rounded-lg px-2 py-3 text-xs leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:px-4 sm:text-sm ${strategy === item.id ? "bg-foreground text-card" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {seatingStrategyLabel(item.id, t)}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id="seating-suggestion-panel"
              aria-labelledby={`tab-${strategy}`}
              className="space-y-5 p-5"
            >
              <div>
                <h3 className="text-base font-semibold">{seatingStrategyLabel(strategy, t)}</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {t(`${strategy}.description`)}
                </p>
                <p className="mt-2 text-xs font-medium">{t(`${strategy}.source`)}</p>
              </div>
              {strategy === "affinity" && (
                <div className="flex flex-wrap gap-2">
                  {groupChips.map((entry) => {
                    const key = affinityGroupKey(entry);
                    const members = parties.filter((party) => affinityGroupKey(party) === key);
                    return (
                      <span
                        key={key}
                        className="rounded-full border bg-background px-3 py-1 text-xs"
                      >
                        {entry.group} · {formatGuestSide(entry.side, t)} ·{" "}
                        {number(members.reduce((sum, party) => sum + party.count, 0))} {t("people")}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-background p-4">
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span className="block">{t("seatsPerTable")}</span>
                  <select
                    className="h-10 rounded-lg border bg-background px-3 text-sm text-foreground"
                    value={draftCapacity}
                    onChange={(e) => setDraftCapacity(Number(e.target.value))}
                  >
                    {[6, 8, 10, 12].map((n) => (
                      <option key={n} value={n}>
                        {number(n)} {t("seats")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span className="block">{t("tableCount")}</span>
                  <select
                    className="h-10 rounded-lg border bg-background px-3 text-sm text-foreground"
                    value={draftTableCount}
                    onChange={(e) => setDraftTableCount(Number(e.target.value))}
                  >
                    {Array.from({ length: 30 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {t("table", { number: number(i + 1) })}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="flex-1 text-xs leading-5 text-muted-foreground">
                  {t("previewConfigHelp")}
                </p>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium">
                  {t("proposal", {
                    assigned: number(total - proposedUnplaced),
                    total: number(total),
                  })}
                </p>
                <div className="grid max-h-80 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: draftTableCount }, (_, table) => {
                    const assigned = parties.filter((party) => proposal[party.id]?.includes(table));
                    const labels = [...new Set(assigned.map((party) => party.group))];
                    return (
                      <article key={table} className="rounded-xl border bg-background p-4">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-serif text-lg">
                            {t("table", { number: number(table + 1) })}
                          </h4>
                          <span className="text-xs">
                            {t("seatsHeld", {
                              occupied: number(tableOccupancy(proposal, table)),
                              capacity: number(draftCapacity),
                            })}
                          </span>
                        </div>
                        <ul className="mt-3 space-y-1 text-xs leading-5">
                          {assigned.map((party) => (
                            <li key={party.id}>
                              {formatRecipientLabel(party, language)} · {number(party.count)}{" "}
                              {t("seats")}
                            </li>
                          ))}
                        </ul>
                        {assigned.length > 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {t("tableSide", { side: formatGuestSide(assigned[0]?.side, t) })}
                          </p>
                        )}
                        <p className="mt-3 border-t pt-2 text-xs leading-5 text-muted-foreground">
                          {!assigned.length
                            ? t("tableEmpty")
                            : strategy === "affinity"
                              ? t("groupsOnTable", { groups: labels.join(" · ") })
                              : strategy === "party"
                                ? t("partyOrder")
                                : t("fillRemaining", {
                                    count: number(draftCapacity - tableOccupancy(proposal, table)),
                                  })}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </div>
              {proposedUnplaced > 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                  {t("unplacedWarning", { count: number(proposedUnplaced) })}
                </p>
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                {parties.some((party) => party.note) ? t("notesNotApplied") : ""}
                {t("sideRules")}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                  {total - unplaced > 0 ? t("replacePlan") : t("planStillEmpty")}
                  {t("previewOnly")}
                </p>
                <Button disabled={proposedUnplaced === total} onClick={applySuggestion}>
                  <Check /> {t("applySuggestion")}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
      <div className="flex gap-3 rounded-xl border bg-card p-4">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-sage" />
        <div>
          <p className="text-sm font-medium">
            {manual
              ? t("currentManual")
              : appliedStrategy
                ? t("currentSuggested", {
                    strategy: seatingStrategyLabel(appliedStrategy, t),
                  })
                : t("currentUnchanged")}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t("planSummary", {
              assigned: number(total - unplaced),
              total: number(total),
              unassigned: number(unplaced),
            })}
          </p>
        </div>
      </div>
      {notice && (
        <p role="status" className="rounded-lg border bg-card px-4 py-3 text-sm">
          {notice}
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
        <aside
          className="space-y-3 rounded-2xl border bg-card p-4"
          aria-label={t("recipientGroups")}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl">{t("recipientGroups")}</h2>
            <span className="text-xs text-muted-foreground">
              {t("groupsCount", { count: number(parties.length) })}
            </span>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{t("dragGroupHelp")}</p>
          <div className="max-h-[260px] space-y-2 overflow-y-auto xl:max-h-[680px]">
            {parties.map((party) => {
              const places = plan[party.id] ?? [];
              const distribution = [...new Set(places)]
                .map(
                  (table) =>
                    `${table === null ? t("unassigned") : t("tableShort", { number: number(table + 1) })}: ${number(places.filter((t) => t === table).length)}`,
                )
                .join(" · ");
              return (
                <article
                  draggable
                  key={party.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-inviteme-party", party.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className={`rounded-xl border bg-background p-3 ${selection?.partyId === party.id ? "ring-2 ring-primary" : ""}`}
                  style={{ borderLeft: `4px solid ${colorFor(party.group)}` }}
                >
                  <div className="flex items-start gap-2">
                    <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium">
                        {formatRecipientLabel(party, language)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {party.group} · {formatGuestSide(party.side, t)}
                      </p>
                      <p className="mt-2 text-xs">
                        {number(party.count)} {t("seats")} · {distribution}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-2 w-full rounded-md border py-1.5 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
                    onClick={() => select(party.id)}
                  >
                    {t("assignGroup")}
                  </button>
                </article>
              );
            })}
          </div>
        </aside>
        <section
          className="min-w-0 overflow-hidden rounded-2xl border bg-[#F8F5EF]"
          aria-label={t("title")}
        >
          <div className="border-b bg-white/60 px-5 py-3 text-center text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {t("floorStage")}
          </div>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-6 p-3 py-7 sm:p-6">
            {Array.from({ length: tableCount }, (_, table) => {
              const occupied = tablePlaces(parties, plan, table);
              const tableConfirmed = occupied.filter(
                ({ party, place }) =>
                  people[placeKey(party.id, place)]?.attendanceStatus === "ATTENDING",
              ).length;
              const labels = [...new Set(occupied.map(({ party }) => party.group))];
              return (
                <article
                  key={table}
                  className={`w-full max-w-[280px] rounded-2xl border p-2 pb-4 transition-colors ${hoveredTable === table ? "border-primary bg-primary/10" : "border-transparent"}`}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("application/x-inviteme-party")) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setHoveredTable(table);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                      setHoveredTable(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setHoveredTable(null);
                    const id = e.dataTransfer.getData("application/x-inviteme-party");
                    if (id) move(id, table);
                  }}
                >
                  <div className="relative mx-auto aspect-square w-full max-w-[320px]">
                    <Image
                      src="/images/seating/round-table.svg"
                      alt=""
                      width={240}
                      height={240}
                      className="pointer-events-none absolute left-1/2 top-1/2 w-[68%] -translate-x-1/2 -translate-y-1/2"
                    />
                    <button
                      type="button"
                      aria-label={t("viewTable", { number: number(table + 1) })}
                      onClick={() => {
                        setInspectedTable(table);
                        setSelection(null);
                        setOpenPanel(true);
                      }}
                      className="absolute left-1/2 top-1/2 flex size-[58%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full pt-5 transition-colors hover:bg-white/40 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <h3 className="font-serif text-xl">
                        {t("table", { number: number(table + 1) })}
                      </h3>
                      <p className="text-[10px] text-muted-foreground">
                        {[
                          ...new Set(occupied.map(({ party }) => formatGuestSide(party.side, t))),
                        ].join(" · ") || t("noGuestAtTable")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {number(occupied.length)}/{number(capacity)} {t("seats")}
                      </p>
                      <span className="mt-3 rounded-full border border-[#D9CDB8] bg-white/70 px-2 py-1 text-[10px]">
                        {t("tableConfirmed", { count: number(tableConfirmed) })}
                      </span>
                    </button>
                    {Array.from({ length: capacity }, (_, seat) => {
                      const angle = (seat / capacity) * Math.PI * 2 - Math.PI / 2;
                      const occupant = occupied[seat];
                      const person = occupant
                        ? people[placeKey(occupant.party.id, occupant.place)]
                        : undefined;
                      const appearance = chairAppearance(person);
                      const style = {
                        left: `${50 + 42 * Math.cos(angle)}%`,
                        top: `${50 + 42 * Math.sin(angle)}%`,
                      };
                      const chair = (
                        <>
                          <Image
                            src={`/images/seating/${occupant ? appearance.asset : "chair-empty.svg"}`}
                            alt=""
                            width={36}
                            height={42}
                            className="size-full"
                            style={{ transform: `rotate(${(angle * 180) / Math.PI + 90}deg)` }}
                          />
                        </>
                      );
                      return occupant ? (
                        <button
                          key={seat}
                          type="button"
                          style={style}
                          className={`absolute h-[12%] w-[10%] -translate-x-1/2 -translate-y-1/2 rounded-md transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-primary ${selection?.partyId === occupant.party.id && selection.place === occupant.place ? "ring-2 ring-primary ring-offset-2" : ""}`}
                          aria-label={t("moveGuestAria", {
                            table: number(table + 1),
                            seat: number(seat + 1),
                            name:
                              person?.fullName ||
                              t("unnamedExpectedPlace", { name: occupant.party.name }),
                            status: t(`status.${person?.attendanceStatus ?? "PENDING"}`),
                          })}
                          title={`${person?.fullName || t("unnamedPlace")} · ${t(`status.${person?.attendanceStatus ?? "PENDING"}`)}`}
                          onClick={() => select(occupant.party.id, occupant.place)}
                        >
                          {chair}
                        </button>
                      ) : (
                        <span
                          key={seat}
                          style={style}
                          className="pointer-events-none absolute h-[12%] w-[10%] -translate-x-1/2 -translate-y-1/2"
                          title={t("emptySeatTitle", { number: number(seat + 1) })}
                        >
                          {chair}
                        </span>
                      );
                    })}
                  </div>
                  <div className="space-y-1.5 px-3">
                    {labels.length ? (
                      labels.map((label) => (
                        <p key={label} className="flex items-start gap-2 text-[11px] leading-5">
                          <span
                            className="mt-1.5 size-2 shrink-0 rounded-full"
                            style={{ background: colorFor(label) }}
                          />
                          {label} ·{" "}
                          {number(occupied.filter(({ party }) => party.group === label).length)}{" "}
                          {t("seats")}
                        </p>
                      ))
                    ) : (
                      <p className="text-center text-xs text-muted-foreground">
                        {t("dropGroupHere")}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <p className="border-t px-5 py-3 text-xs leading-5 text-muted-foreground">
            {t("chairLegend")}
          </p>
        </section>
        <aside
          className={`rounded-2xl border bg-card p-5 ${(selected || inspectedTable !== null) && openPanel ? "fixed inset-x-3 bottom-3 z-40 max-h-[70dvh] overflow-y-auto shadow-xl xl:static xl:max-h-none xl:shadow-none" : "hidden xl:block"}`}
          aria-label={t("detailsAria")}
        >
          {inspectedTable !== null && openPanel ? (
            <>
              <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex items-start justify-between gap-2 border-b bg-card px-5 py-4">
                <span className="text-xs">{t("guestsAtTable")}</span>
                <button
                  type="button"
                  aria-label={t("closeDetails")}
                  onClick={() => setOpenPanel(false)}
                >
                  <X className="size-4" />
                </button>
              </div>
              <SeatingTableDetails
                table={inspectedTable}
                capacity={capacity}
                parties={parties}
                plan={plan}
                people={people}
                onSelect={select}
              />
            </>
          ) : selected && openPanel ? (
            <>
              <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex items-start justify-between gap-2 border-b bg-card px-5 py-4">
                <span className="rounded-full bg-muted px-2 py-1 text-[10px]">
                  {selection?.place !== undefined ? t("seatDetails") : t("invitationGroup")}
                </span>
                <button
                  type="button"
                  aria-label={t("closeDetails")}
                  onClick={() => setOpenPanel(false)}
                >
                  <X className="size-4" />
                </button>
              </div>
              {selection?.place !== undefined ? (
                <SeatingPersonDetails
                  key={placeKey(selected.id, selection.place)}
                  party={selected}
                  person={selectedPerson}
                  table={selectedTable}
                  seat={selectedSeatNumber}
                  onSave={(input) => {
                    try {
                      setPeople(setPlacePerson(people, selected, selection.place ?? 0, input));
                      setNotice(t("personUpdated", { name: input.fullName.trim() }));
                      return null;
                    } catch (error) {
                      if (!(error instanceof Error)) return t("details.updateFailed");
                      const errors: Record<string, string> = {
                        "Chỗ này không thuộc nhóm mời.": "details.invalidSeat",
                        "Trạng thái hoặc vai trò không hợp lệ.": "details.invalidStatus",
                        "Nhập tên trước khi cập nhật RSVP cho một người.": "details.enterName",
                        "Tên tối đa 150 ký tự.": "details.nameTooLong",
                        "Người đại diện đã có chỗ trong nhóm. Hãy chuyển chỗ hiện tại thay vì tạo thêm.":
                          "details.duplicatePrimary",
                        "Đây là chỗ của người đại diện. Hãy chọn chỗ khác để thêm người đi cùng.":
                          "details.primaryRole",
                      };
                      const translationKey = errors[error.message];
                      return translationKey ? t(translationKey) : error.message;
                    }
                  }}
                />
              ) : (
                <>
                  <h2 className="mt-4 break-words font-serif text-xl">
                    {formatRecipientLabel(selected, language)}
                  </h2>
                  <p className="mt-2 text-xs text-muted-foreground">{selected.group}</p>
                </>
              )}
              {selection?.place === undefined && (
                <dl className="my-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("expectedTotal")}</dt>
                    <dd>
                      {number(selected.count)} {t("people")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("namedCount")}</dt>
                    <dd>
                      {number(selectedMembers.length)} {t("people")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("unnamedCount")}</dt>
                    <dd>
                      {number(selected.count - selectedMembers.length)} {t("people")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("rsvp")}</dt>
                    <dd>
                      {
                        selectedMembers.filter((person) => person.attendanceStatus === "ATTENDING")
                          .length
                      }{" "}
                      {t("confirmedCount")}
                    </dd>
                  </div>
                </dl>
              )}
              {selection?.place === undefined && (
                <div className="rounded-xl bg-background p-3">
                  <p className="text-xs text-muted-foreground">{t("invitationSalutation")}</p>
                  <p className="mt-2 text-sm">
                    {t("greeting", { name: formatRecipientLabel(selected, language) })}
                  </p>
                </div>
              )}
              {selected.note && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
                  <p className="text-xs font-medium">{t("noteNeedsReview")}</p>
                  <p className="mt-1 text-xs leading-5">{selected.note}</p>
                </div>
              )}
              <label
                className="mb-2 mt-5 block text-xs text-muted-foreground"
                htmlFor="move-destination"
              >
                {selection?.place !== undefined ? t("moveSeatTo") : t("moveGroupTo")}
              </label>
              <select
                id="move-destination"
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="unplaced">{t("unassignedList")}</option>
                {Array.from({ length: tableCount }, (_, table) => (
                  <option key={table} value={table}>
                    {t("table", { number: number(table + 1) })} ·{" "}
                    {number(tableOccupancy(plan, table))}/{number(capacity)}
                  </option>
                ))}
              </select>
              <Button
                className="mt-3 w-full"
                onClick={() =>
                  move(
                    selected.id,
                    destination === "unplaced" ? null : Number(destination),
                    selection?.place,
                  )
                }
              >
                <MoveRight /> {selection?.place !== undefined ? t("moveSeat") : t("moveGroup")}
              </Button>
              {selection?.place === undefined && selected.count > 1 && (
                <Button
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => {
                    const unassigned = selectedPlaces.findIndex((table) => table === null);
                    select(selected.id, unassigned < 0 ? 0 : unassigned);
                  }}
                >
                  {t("moveOneExpectedSeat")}
                </Button>
              )}
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("guardianWarning")}</p>
            </>
          ) : (
            <div className="py-8 text-center">
              <Armchair className="mx-auto mb-4 size-8 text-muted-foreground" />
              <h2 className="font-serif text-xl">{t("selectGroupOrSeat")}</h2>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">{t("panelHelp")}</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
