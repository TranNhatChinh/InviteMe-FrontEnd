"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "@/i18n/format";
import { useLanguage } from "@/i18n/language-context";
import { useRuntime } from "@/core/config/runtime";
import { usePermission } from "@/shared/components/permission-guard";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Plus, Sparkles } from "lucide-react";
import {
  suggestSeatingPlan,
  type SeatingPlan,
  type SeatingChange,
  type SeatingStrategy,
  type SuggestionMode,
  type SeatingSuggestion,
} from "../api/planning-seating.api";

const strategies: { id: SeatingStrategy; titleKey: string; descriptionKey: string }[] = [
  { id: "AFFINITY", titleKey: "strategyAffinity", descriptionKey: "strategyAffinityDescription" },
  { id: "PARTY", titleKey: "strategyParty", descriptionKey: "strategyPartyDescription" },
  { id: "COMPACT", titleKey: "strategyCompact", descriptionKey: "strategyCompactDescription" },
];

export function PlanningSuggestions({
  plan,
  editable,
  saving,
  onChange,
  saveError,
}: {
  plan: SeatingPlan;
  editable: boolean;
  saving: boolean;
  onChange: (input: SeatingChange) => Promise<unknown>;
  saveError?: string;
}) {
  const { t, i18n } = useTranslation("guestPlanning", { keyPrefix: "suggestions" });
  const { language } = useLanguage();
  const { api } = useRuntime();
  const { access, isWeddingWide } = usePermission();
  const seatingScope = access?.scopes?.find((item) => item.permission === "SEATING_EDIT");
  const weddingWideSeating = isWeddingWide("SEATING_EDIT");
  const groupOptions = useMemo(
    () =>
      weddingWideSeating
        ? Array.from(
            new Map(
              plan.guests.flatMap((guest) =>
                guest.group ? [[guest.group.id, guest.group.name] as const] : [],
              ),
            ).entries(),
          ).map(([id, name]) => ({ id, name }))
        : (seatingScope?.groups ?? []),
    [plan.guests, seatingScope?.groups, weddingWideSeating],
  );
  const requiresGroup = !weddingWideSeating;
  const canSuggest =
    editable && weddingWideSeating && isWeddingWide("SEATING_VIEW") && plan.tables.length > 0;
  const [dialog, setDialog] = useState<"tables" | "suggestions" | null>(null);
  const [selectedGroupIdValue, setSelectedGroupId] = useState(seatingScope?.groups[0]?.id ?? "");
  const selectedGroupId = groupOptions.some((group) => group.id === selectedGroupIdValue)
    ? selectedGroupIdValue
    : (groupOptions[0]?.id ?? "");
  const [capacity, setCapacity] = useState(10);
  const [count, setCount] = useState<number | null>(null);
  const [strategy, setStrategy] = useState<SeatingStrategy>("AFFINITY");
  const [mode, setMode] = useState<SuggestionMode>("UNASSIGNED");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ source: string; value: SeatingSuggestion } | null>(null);
  const request = useRef<AbortController | null>(null);
  const displaySide = (side: string) => {
    const key = (
      { BRIDE: "BRIDE", GROOM: "GROOM", MUTUAL: "MUTUAL", UNSPECIFIED: "UNSPECIFIED" } as const
    )[side as "BRIDE" | "GROOM" | "MUTUAL" | "UNSPECIFIED"];
    return key ? i18n.t(`sideValues.${key}`, { ns: "guestPlanning", defaultValue: side }) : side;
  };
  useEffect(() => () => request.current?.abort(), []);
  const source = JSON.stringify(plan);
  const eligiblePlaces = plan.places.filter(
    (p) => p.person?.attendanceStatus !== "DECLINED" && p.person?.attendanceStatus !== "WAITLISTED",
  );
  const eligible = eligiblePlaces.length;
  const sides = new Map<string, number>();
  const guestSides = new Map(plan.guests.map((g) => [g.id, g.side]));
  for (const place of eligiblePlaces) {
    const side = guestSides.get(place.guestId) ?? "UNSPECIFIED";
    sides.set(side, (sides.get(side) ?? 0) + 1);
  }
  const existingCapacity = plan.tables.reduce((n, t) => n + t.capacity, 0);
  const minimum =
    Number.isInteger(capacity) && capacity > 0
      ? plan.tables.length === 0
        ? [...sides.values()].reduce((n, total) => n + Math.ceil(total / capacity), 0)
        : Math.max(0, Math.ceil((eligible - existingCapacity) / capacity))
      : 0;
  const tableCount = count ?? Math.max(1, minimum);
  const validTables =
    Number.isInteger(capacity) &&
    capacity >= 1 &&
    capacity <= 20 &&
    Number.isInteger(tableCount) &&
    tableCount >= 1 &&
    tableCount + plan.tables.length <= 100;
  const proposal =
    preview?.source === source && preview.value.strategy === strategy && preview.value.mode === mode
      ? preview.value
      : null;
  const stale = !!preview && !proposal;
  const selected = strategies.find((s) => s.id === strategy) ?? strategies[0];
  async function load(nextStrategy = strategy, nextMode = mode) {
    if (!plan.tables.length) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setPreview(null);
    setConfirmed(false);
    try {
      const value = await suggestSeatingPlan(
        api,
        plan.weddingId,
        nextStrategy,
        nextMode,
        controller.signal,
      );
      if (!controller.signal.aborted) setPreview({ source, value });
    } catch {
      if (!controller.signal.aborted) setError(t("loadError"));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {editable && (
          <Button type="button" disabled={saving} onClick={() => setDialog("tables")}>
            <Plus className="size-4" /> {t("addTable")}
          </Button>
        )}
        {canSuggest && (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => setDialog("suggestions")}
          >
            <Sparkles className="size-4" /> {t("seatUnassigned")}
          </Button>
        )}
      </div>
      <Modal
        open={dialog === "tables"}
        onClose={() => setDialog(null)}
        title={t("addTable")}
        description={t("tableDialogDescription")}
      >
        <div className="space-y-4">
          {saveError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {saveError}
            </p>
          )}
          {requiresGroup && groupOptions.length === 0 && (
            <p
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
            >
              {t("missingGroupScope")}
            </p>
          )}
          {editable && (
            <form
              className="space-y-3 rounded-xl border bg-muted/20 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!validTables || saving || (requiresGroup && !selectedGroupId)) return;
                setPreview(null);
                setConfirmed(false);
                void onChange({
                  action: "CREATE_TABLES",
                  tableCount,
                  capacity,
                  groupId: selectedGroupId || null,
                });
              }}
            >
              <h3 className="text-sm font-medium">
                {plan.tables.length ? t("addMultipleTables") : t("startCapacity")}
              </h3>
              <div className="flex flex-wrap items-end gap-3">
                {groupOptions.length > 0 && (
                  <label className="text-sm">
                    {t("tableGroup")}
                    <select
                      aria-label={t("tableGroup")}
                      required={requiresGroup}
                      value={selectedGroupId}
                      onChange={(event) => setSelectedGroupId(event.target.value)}
                      className="mt-1 block min-w-44 rounded border bg-background p-2"
                    >
                      {!requiresGroup && <option value="">{t("noGroup")}</option>}
                      {groupOptions.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="text-sm">
                  {t("seatsPerTable")}
                  <input
                    aria-label={t("seatsPerTable")}
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={Number.isFinite(capacity) ? capacity : ""}
                    onChange={(e) => setCapacity(e.target.value ? Number(e.target.value) : 0)}
                    className="mt-1 block w-28 rounded border bg-background p-2"
                  />
                </label>
                <label className="text-sm">
                  {t("tablesToAdd")}
                  <input
                    aria-label={t("tablesToAdd")}
                    type="number"
                    min={1}
                    max={Math.max(0, 100 - plan.tables.length)}
                    required
                    value={tableCount}
                    onChange={(e) => setCount(e.target.value ? Number(e.target.value) : 0)}
                    className="mt-1 block w-28 rounded border bg-background p-2"
                  />
                </label>
                <Button disabled={saving || !validTables || (requiresGroup && !selectedGroupId)}>
                  {t("createTables", {
                    count: formatNumber(tableCount, language),
                    capacity: formatNumber(capacity, language),
                  })}
                </Button>
                <button
                  type="button"
                  className="text-xs underline"
                  disabled={saving}
                  onClick={() => setCount(null)}
                >
                  {t("estimatedCount")}
                </button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("capacityEstimate", {
                  eligible: formatNumber(eligible, language),
                  capacity: formatNumber(existingCapacity, language),
                  minimum: formatNumber(minimum, language),
                  perTable: capacity ? formatNumber(capacity, language) : "?",
                  sideNote: plan.tables.length === 0 ? t("separateSides") : t("totalCapacity"),
                })}
              </p>
            </form>
          )}
          {editable && (
            <details className="rounded-xl border p-4">
              <summary className="cursor-pointer text-sm font-medium">{t("addNamedTable")}</summary>
              <form
                className="mt-4 flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (saving || (requiresGroup && !selectedGroupId)) return;
                  const data = new FormData(event.currentTarget);
                  void onChange({
                    action: "CREATE_TABLE",
                    name: String(data.get("name")),
                    capacity: Number(data.get("capacity")),
                    groupId: selectedGroupId || null,
                  });
                }}
              >
                {groupOptions.length > 0 && (
                  <label className="text-sm">
                    {t("tableGroup")}
                    <select
                      aria-label={t("tableGroup")}
                      required={requiresGroup}
                      value={selectedGroupId}
                      onChange={(event) => setSelectedGroupId(event.target.value)}
                      className="mt-1 block min-w-44 rounded border bg-background p-2"
                    >
                      {!requiresGroup && <option value="">{t("noGroup")}</option>}
                      {groupOptions.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="text-sm">
                  {t("newTableName")}
                  <input
                    name="name"
                    aria-label={t("newTableNameAria")}
                    required
                    maxLength={100}
                    placeholder={t("newTablePlaceholder", {
                      number: formatNumber(plan.tables.length + 1, language),
                    })}
                    className="mt-1 block w-full rounded border bg-background p-2"
                  />
                </label>
                <label className="text-sm">
                  {t("seatCount")}
                  <input
                    name="capacity"
                    aria-label={t("newTableSeatCount")}
                    type="number"
                    min={1}
                    max={20}
                    required
                    defaultValue={10}
                    className="mt-1 block w-24 rounded border bg-background p-2"
                  />
                </label>
                <Button disabled={saving || (requiresGroup && !selectedGroupId)}>
                  {t("addNamedTableButton")}
                </Button>
              </form>
            </details>
          )}
        </div>
      </Modal>
      <Modal
        open={dialog === "suggestions"}
        onClose={() => setDialog(null)}
        title={t("seatUnassigned")}
        description={t("suggestionDialogDescription")}
      >
        <div className="space-y-4">
          {saveError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {saveError}
            </p>
          )}
          <div role="tablist" aria-label={t("suggestionType")} className="flex flex-wrap gap-2">
            {strategies.map((s) => (
              <button
                key={s.id}
                role="tab"
                tabIndex={strategy === s.id ? 0 : -1}
                onKeyDown={(e) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                  e.preventDefault();
                  const index = strategies.findIndex((item) => item.id === s.id);
                  const next =
                    strategies[
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? strategies.length - 1
                          : (index + (e.key === "ArrowRight" ? 1 : -1) + strategies.length) %
                            strategies.length
                    ];
                  if (next) {
                    setStrategy(next.id);
                    setConfirmed(false);
                    void load(next.id, mode);
                    document.getElementById(`strategy-${next.id}`)?.focus();
                  }
                }}
                id={`strategy-${s.id}`}
                aria-controls="seating-suggestion-panel"
                aria-selected={strategy === s.id}
                className={`rounded-lg border px-3 py-2 text-sm ${strategy === s.id ? "border-primary bg-primary/10 font-medium" : "bg-background"}`}
                onClick={() => {
                  setStrategy(s.id);
                  setConfirmed(false);
                  void load(s.id, mode);
                }}
              >
                {t(s.titleKey)}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id="seating-suggestion-panel"
            aria-labelledby={`strategy-${strategy}`}
            className="space-y-3"
          >
            <p className="text-sm">{selected ? t(selected.descriptionKey) : null}</p>
            <p className="text-xs text-muted-foreground">{t("basis")}</p>
            <label className="block text-sm">
              {t("scope")}
              <select
                aria-label={t("scope")}
                value={mode}
                onChange={(e) => {
                  const next = e.target.value as SuggestionMode;
                  setMode(next);
                  setConfirmed(false);
                  void load(strategy, next);
                }}
                className="mt-1 block max-w-full rounded border bg-background p-2"
              >
                <option value="UNASSIGNED">{t("unassignedOnly")}</option>
                <option value="REPLACE_ALL">{t("replaceAll")}</option>
              </select>
            </label>
            <Button
              variant="outline"
              disabled={loading || saving || !plan.tables.length || !eligible}
              onClick={() => void load()}
            >
              {loading ? t("calculating") : t("recalculate")}
            </Button>
            {!plan.tables.length && <p className="text-sm text-amber-900">{t("noTables")}</p>}
            {!eligible && <p className="text-sm text-muted-foreground">{t("noEligiblePlaces")}</p>}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {stale && (
              <p role="status" className="text-sm text-amber-900">
                {t("stale")}
              </p>
            )}
            {proposal && (
              <>
                <div className="space-y-2 rounded-lg border bg-background p-3">
                  <h3 className="font-medium">
                    {t("preview", { strategy: selected ? t(selected.titleKey) : "" })}
                  </h3>
                  <p className="text-sm">
                    {t("previewSummary", {
                      assigned: formatNumber(proposal.assignments.length, language),
                      preserved: formatNumber(proposal.preservedCount, language),
                      changed: formatNumber(proposal.changedPlaceCount, language),
                      unassigned: formatNumber(
                        proposal.unassigned.reduce((n, g) => n + g.placeIds.length, 0),
                        language,
                      ),
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("notSaved")}</p>
                </div>
                <div className="grid max-h-80 gap-2 overflow-auto sm:grid-cols-2">
                  {plan.tables.map((table) => {
                    const reason = proposal.reasons.find((r) => r.tableId === table.id);
                    const members = proposal.assignments
                      .filter((a) => a.tableId === table.id)
                      .sort((a, b) => a.seatNumber - b.seatNumber);
                    return (
                      <article key={table.id} className="space-y-1 rounded-lg border p-3 text-xs">
                        <h4 className="font-medium">
                          {table.name} ·{" "}
                          {t("tableOccupancy", {
                            occupied: formatNumber(members.length, language),
                            capacity: formatNumber(table.capacity, language),
                          })}
                        </h4>
                        <p>{reason?.sides.map(displaySide).join(" · ") || t("emptyTable")}</p>
                        <p>{reason?.groups.join(" · ")}</p>
                        <p className="text-muted-foreground">{reason?.message}</p>
                        <ul className="space-y-1">
                          {members.map((a) => {
                            const p = plan.places.find((p) => p.id === a.placeId),
                              g = plan.guests.find((g) => g.id === p?.guestId);
                            return (
                              <li key={a.placeId}>
                                {t("seat", { number: formatNumber(a.seatNumber, language) })}:{" "}
                                {p?.person?.fullName ??
                                  `${t("seat", { number: formatNumber(p?.position ?? 0, language) })} · ${g?.recipientName}`}
                              </li>
                            );
                          })}
                        </ul>
                      </article>
                    );
                  })}
                </div>
                {proposal.unassigned.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
                    <p className="font-medium">{t("unassignedGroups")}</p>
                    <ul className="mt-2 space-y-2">
                      {proposal.unassigned.map((g) => (
                        <li key={g.guestId}>
                          {plan.guests.find((x) => x.id === g.guestId)?.recipientName} ·{" "}
                          {t("seatCount", { count: formatNumber(g.placeIds.length, language) })}:{" "}
                          {g.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {proposal.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                {mode === "REPLACE_ALL" && plan.assignments.length > 0 && (
                  <label className="flex items-start gap-2 rounded-lg border border-amber-300 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-1"
                    />
                    {t("replaceConfirmation")}
                  </label>
                )}
                <Button
                  disabled={
                    !editable ||
                    saving ||
                    loading ||
                    !proposal.changedPlaceCount ||
                    (mode === "REPLACE_ALL" && plan.assignments.length > 0 && !confirmed)
                  }
                  onClick={async () => {
                    await onChange({
                      action: "APPLY_SUGGESTION",
                      strategy,
                      mode,
                      sourceFingerprint: proposal.sourceFingerprint,
                      confirmReplace:
                        mode === "REPLACE_ALL" && (confirmed || plan.assignments.length === 0),
                    });
                    setPreview(null);
                    setConfirmed(false);
                  }}
                >
                  {saving ? t("applying") : t("apply")}
                </Button>
                {!proposal.changedPlaceCount && (
                  <p className="text-xs text-muted-foreground">
                    {t("noChanges")} {proposal.unassigned.length > 0 && t("reviewUnassigned")}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
