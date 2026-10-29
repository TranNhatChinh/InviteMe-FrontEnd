"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Check, Loader2, Sparkles, Wand2, X } from "lucide-react";
import { gsap } from "gsap";
import { useRuntime } from "@/core/config/runtime";
import { Button } from "@/shared/ui/button";
import { seatingErrorText } from "../utils/seating-errors";
import {
  suggestSeatingPlan,
  applySeatingSuggestion,
  type SeatingPlan,
  type SeatingStrategy,
  type SuggestionMode,
  type SeatingSuggestion,
} from "../api/planning-seating.api";

interface SeatingSuggestionsModalProps {
  plan: SeatingPlan;
  isOpen: boolean;
  onClose: () => void;
  onApplied: () => void;
}

export function SeatingSuggestionsModal({
  plan,
  isOpen,
  onClose,
  onApplied,
}: SeatingSuggestionsModalProps) {
  const { api } = useRuntime();
  const [selectedStrategy, setSelectedStrategy] = useState<SeatingStrategy>("AFFINITY");
  const [mode, setMode] = useState<SuggestionMode>("UNASSIGNED");
  const [confirmReplace, setConfirmReplace] = useState(false);
  // Tray tables stay in the tray unless the couple asks; the backend only places them when told to.
  const [placeTables, setPlaceTables] = useState(false);
  const trayTableCount = plan.tables.filter((table) => table.row == null).length;

  const [loading, setLoading] = useState(false);
  const { t } = useTranslation("seating");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store suggestions for each of the 3 strategies
  const [suggestions, setSuggestions] = useState<Record<string, SeatingSuggestion | null>>({
    AFFINITY: null,
    COMPACT: null,
    PARTY: null,
  });

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ignore = false;
    if (!isOpen) return;

    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      void Promise.all([
        suggestSeatingPlan(api, plan.weddingId, "AFFINITY", mode, undefined, placeTables),
        suggestSeatingPlan(api, plan.weddingId, "COMPACT", mode, undefined, placeTables),
        suggestSeatingPlan(api, plan.weddingId, "PARTY", mode, undefined, placeTables),
      ])
        .then(([affinityRes, compactRes, partyRes]) => {
          if (!ignore) {
            setSuggestions({
              AFFINITY: affinityRes,
              COMPACT: compactRes,
              PARTY: partyRes,
            });
          }
        })
        .catch((err: unknown) => {
          if (!ignore) {
            const msg =
              seatingErrorText(err, t) ??
              (err instanceof Error ? err.message : t("suggestions.computeFailed"));
            setError(msg);
          }
        })
        .finally(() => {
          if (!ignore) {
            setLoading(false);
          }
        });
    }, 0);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [api, isOpen, mode, placeTables, plan.weddingId, t]);

  // GSAP animation
  useEffect(() => {
    if (!isOpen) return;
    const ctx = gsap.context(() => {
      gsap.from(".suggestion-card", {
        y: 20,
        opacity: 0,
        duration: 0.35,
        stagger: 0.08,
        ease: "power2.out",
      });
    }, modalRef);
    return () => ctx.revert();
  }, [isOpen, loading]);

  if (!isOpen) return null;

  const currentSuggestion = suggestions[selectedStrategy];

  const handleApply = async () => {
    if (!currentSuggestion) return;
    if (mode === "REPLACE_ALL" && !confirmReplace) {
      setError(t("suggestions.confirmReplace"));
      return;
    }

    setApplying(true);
    setError(null);
    try {
      await applySeatingSuggestion(api, plan.weddingId, {
        expectedVersion: plan.version,
        strategy: selectedStrategy,
        mode,
        sourceFingerprint: currentSuggestion.sourceFingerprint,
        confirmReplace: mode === "REPLACE_ALL" ? confirmReplace : false,
        placeTables,
      });
      onApplied();
      onClose();
    } catch (err: unknown) {
      const msg =
        seatingErrorText(err, t) ??
        (err instanceof Error ? err.message : t("suggestions.applyFailed"));
      setError(msg);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-4xl rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Wand2 className="size-5" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {t("suggestions.title")}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("suggestions.subtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-muted/40 p-3">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            {t("suggestions.mode")}
          </span>
          <div className="flex rounded-xl bg-card p-1 text-xs border border-border shadow-sm">
            <button
              type="button"
              onClick={() => setMode("UNASSIGNED")}
              className={`rounded-lg px-4 py-2 font-medium transition-all ${
                mode === "UNASSIGNED"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("suggestions.modeUnassigned")}
            </button>
            <button
              type="button"
              onClick={() => setMode("REPLACE_ALL")}
              className={`rounded-lg px-4 py-2 font-medium transition-all ${
                mode === "REPLACE_ALL"
                  ? "bg-destructive text-destructive-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("suggestions.modeReplace")}
            </button>
          </div>
        </div>

        {mode === "REPLACE_ALL" && (
          <label className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive cursor-pointer">
            <input
              type="checkbox"
              checked={confirmReplace}
              onChange={(e) => setConfirmReplace(e.target.checked)}
              className="rounded accent-destructive size-4"
            />
            <span className="font-medium">
              {t("suggestions.confirmReplaceLabel")}
            </span>
          </label>
        )}

        {trayTableCount > 0 && (
          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={placeTables}
              onChange={(e) => setPlaceTables(e.target.checked)}
              className="rounded accent-primary size-4"
            />
            <span>
              {t("suggestions.placeTrayTables", { count: trayTableCount })}
            </span>
          </label>
        )}

        {error && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 3 Strategy Cards */}
        {loading ? (
          <div className="flex h-56 flex-col items-center justify-center space-y-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              {t("suggestions.computing")}
            </span>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {/* Strategy 1: AFFINITY */}
            <div
              onClick={() => setSelectedStrategy("AFFINITY")}
              className={`suggestion-card relative flex flex-col justify-between rounded-2xl border p-5 transition-all cursor-pointer ${
                selectedStrategy === "AFFINITY"
                  ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/20"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                    {t("suggestions.recommended")}
                  </span>
                  <div className="font-serif text-lg font-bold text-foreground">
                    {t("suggestions.keepGroups")}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("suggestions.keepGroupsHint")}
                </p>

                {suggestions.AFFINITY && (
                  <div className="space-y-1.5 pt-2 border-t border-border/50 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("suggestions.seatedCount")}</span>
                      <span className="font-semibold text-foreground">
                        {t("suggestions.seatsValue", { count: suggestions.AFFINITY.assignments.length })}
                      </span>
                    </div>
                    {suggestions.AFFINITY.tablePlacements &&
                      suggestions.AFFINITY.tablePlacements.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("suggestions.tablesPlaced")}</span>
                          <span className="font-semibold text-emerald-600">
                            {t("suggestions.tablesValue", { count: suggestions.AFFINITY.tablePlacements.length })}
                          </span>
                        </div>
                      )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("suggestions.preserved")}</span>
                      <span className="font-semibold text-emerald-600">
                        {suggestions.AFFINITY.preservedCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("suggestions.warningCount")}</span>
                      <span className="font-semibold text-amber-600">
                        {suggestions.AFFINITY.warnings.length}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="font-semibold text-primary">
                  {selectedStrategy === "AFFINITY" ? t("suggestions.selected") : t("suggestions.choose")}
                </span>
                {selectedStrategy === "AFFINITY" && <Check className="size-4 text-primary" />}
              </div>
            </div>

            {/* Strategy 2: COMPACT */}
            <div
              onClick={() => setSelectedStrategy("COMPACT")}
              className={`suggestion-card relative flex flex-col justify-between rounded-2xl border p-5 transition-all cursor-pointer ${
                selectedStrategy === "COMPACT"
                  ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/20"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                    {t("suggestions.saving")}
                  </span>
                  <div className="font-serif text-lg font-bold text-foreground">
                    {t("suggestions.fewestTables")}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("suggestions.fewestTablesHint")}
                </p>

                {suggestions.COMPACT && (
                  <div className="space-y-1.5 pt-2 border-t border-border/50 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("suggestions.seatedCount")}</span>
                      <span className="font-semibold text-foreground">
                        {t("suggestions.seatsValue", { count: suggestions.COMPACT.assignments.length })}
                      </span>
                    </div>
                    {suggestions.COMPACT.tablePlacements &&
                      suggestions.COMPACT.tablePlacements.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("suggestions.tablesPlaced")}</span>
                          <span className="font-semibold text-emerald-600">
                            {t("suggestions.tablesValue", { count: suggestions.COMPACT.tablePlacements.length })}
                          </span>
                        </div>
                      )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("suggestions.preserved")}</span>
                      <span className="font-semibold text-emerald-600">
                        {suggestions.COMPACT.preservedCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("suggestions.warningCount")}</span>
                      <span className="font-semibold text-amber-600">
                        {suggestions.COMPACT.warnings.length}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="font-semibold text-primary">
                  {selectedStrategy === "COMPACT" ? t("suggestions.selected") : t("suggestions.choose")}
                </span>
                {selectedStrategy === "COMPACT" && <Check className="size-4 text-primary" />}
              </div>
            </div>

            {/* Strategy 3: PARTY */}
            <div
              onClick={() => setSelectedStrategy("PARTY")}
              className={`suggestion-card relative flex flex-col justify-between rounded-2xl border p-5 transition-all cursor-pointer ${
                selectedStrategy === "PARTY"
                  ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/20"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                    {t("suggestions.seamless")}
                  </span>
                  <div className="font-serif text-lg font-bold text-foreground">
                    {t("suggestions.simple")}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("suggestions.simpleHint")}
                </p>

                {suggestions.PARTY && (
                  <div className="space-y-1.5 pt-2 border-t border-border/50 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("suggestions.seatedCount")}</span>
                      <span className="font-semibold text-foreground">
                        {t("suggestions.seatsValue", { count: suggestions.PARTY.assignments.length })}
                      </span>
                    </div>
                    {suggestions.PARTY.tablePlacements &&
                      suggestions.PARTY.tablePlacements.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("suggestions.tablesPlaced")}</span>
                          <span className="font-semibold text-emerald-600">
                            {t("suggestions.tablesValue", { count: suggestions.PARTY.tablePlacements.length })}
                          </span>
                        </div>
                      )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("suggestions.preserved")}</span>
                      <span className="font-semibold text-emerald-600">
                        {suggestions.PARTY.preservedCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("suggestions.warningCount")}</span>
                      <span className="font-semibold text-amber-600">
                        {suggestions.PARTY.warnings.length}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                <span className="font-semibold text-primary">
                  {selectedStrategy === "PARTY" ? t("suggestions.selected") : t("suggestions.choose")}
                </span>
                {selectedStrategy === "PARTY" && <Check className="size-4 text-primary" />}
              </div>
            </div>
          </div>
        )}

        {/* Details & Warnings of chosen strategy */}
        {currentSuggestion && (
          <div className="space-y-3">
            {/* Additional table shortage advice from backend */}
            {currentSuggestion.suggestedAdditionalTables &&
              currentSuggestion.suggestedAdditionalTables.length > 0 && (
                <div className="rounded-2xl border border-blue-500/30 bg-blue-50/60 dark:bg-blue-950/20 p-4 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-serif font-semibold text-blue-950 dark:text-blue-200">
                    <Sparkles className="size-4 text-blue-600 dark:text-blue-400" />
                    <span>{t("suggestions.extraTables")}</span>
                  </div>
                  <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                    {currentSuggestion.suggestedAdditionalTables.map((s, idx) => (
                      <li key={idx} className="text-foreground">
                        {s.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Auto table placement notification */}
            {currentSuggestion.tablePlacements && currentSuggestion.tablePlacements.length > 0 && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 space-y-1 text-xs">
                <div className="flex items-center gap-2 font-serif font-semibold text-emerald-950 dark:text-emerald-200">
                  <Sparkles className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{t("suggestions.autoPlace")}</span>
                </div>
                <p className="text-muted-foreground">
                  {t("suggestions.autoPlaceHint", { count: currentSuggestion.tablePlacements.length })}
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3 text-xs">
              <div className="font-serif font-semibold text-foreground">
                {t("suggestions.breakdown")}{" "}
                {selectedStrategy === "AFFINITY" || selectedStrategy === "KEEP_GROUPS"
                  ? t("suggestions.keepGroups")
                  : selectedStrategy === "COMPACT" || selectedStrategy === "FEWEST_TABLES"
                    ? t("suggestions.fewestTables")
                    : t("suggestions.simple")}
                :
              </div>

              {currentSuggestion.scoreBreakdown && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-b border-border/40 pb-3 text-[11px]">
                  <div className="bg-card p-2 rounded-xl border border-border text-center shadow-xs">
                    <div className="text-muted-foreground text-[10px]">{t("suggestions.sameGroup")}</div>
                    <div className="font-semibold text-foreground">
                      {t("suggestions.pairs", { count: currentSuggestion.scoreBreakdown.sameGroupMatchesCount })}
                    </div>
                  </div>
                  <div className="bg-card p-2 rounded-xl border border-border text-center shadow-xs">
                    <div className="text-muted-foreground text-[10px]">{t("suggestions.eldersVip")}</div>
                    <div className="font-semibold text-emerald-600">
                      {t("suggestions.people", { count: currentSuggestion.scoreBreakdown.eldersInVipCount })}
                    </div>
                  </div>
                  <div className="bg-card p-2 rounded-xl border border-border text-center shadow-xs">
                    <div className="text-muted-foreground text-[10px]">{t("suggestions.usedTables")}</div>
                    <div className="font-semibold text-foreground">
                      {t("suggestions.tablesValue", { count: currentSuggestion.scoreBreakdown.usedTablesCount })}
                    </div>
                  </div>
                  <div className="bg-card p-2 rounded-xl border border-border text-center shadow-xs">
                    <div className="text-muted-foreground text-[10px]">{t("suggestions.splitParties")}</div>
                    <div className="font-semibold text-amber-600">
                      {t("suggestions.groups", { count: currentSuggestion.scoreBreakdown.splitPartiesCount })}
                    </div>
                  </div>
                  {/* Both families at one table is allowed; shown so the couple can review it. */}
                  {(currentSuggestion.scoreBreakdown.mixedSideTablesCount ?? 0) > 0 && (
                    <div className="col-span-2 sm:col-span-4 bg-card p-2 rounded-xl border border-border text-center shadow-xs">
                      <div className="text-muted-foreground text-[10px]">
                        {t("suggestions.mixedSides")}
                      </div>
                      <div className="font-semibold text-foreground">
                        {t("suggestions.tablesValue", { count: currentSuggestion.scoreBreakdown.mixedSideTablesCount })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {currentSuggestion.unassigned.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
                  <div className="font-semibold">
                    {t("suggestions.unassigned", { count: currentSuggestion.unassigned.length })}
                  </div>
                  <ul className="mt-1 list-disc list-inside space-y-0.5 text-[11px]">
                    {currentSuggestion.unassigned.slice(0, 5).map((u, i) => (
                      <li key={i}>{u.message}</li>
                    ))}
                    {currentSuggestion.unassigned.length > 5 && (
                      <li>{t("suggestions.moreGroups", { count: currentSuggestion.unassigned.length - 5 })}</li>
                    )}
                  </ul>
                </div>
              )}

              {currentSuggestion.warnings.length > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{t("suggestions.warnings")}</span>
                  {currentSuggestion.warnings.join(" · ")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border">
          <div>
            {currentSuggestion &&
              currentSuggestion.changedPlaceCount === 0 &&
              (!currentSuggestion.tablePlacements ||
                currentSuggestion.tablePlacements.length === 0) && (
                <span className="text-xs text-muted-foreground">
                  {t("suggestions.noChanges")}
                </span>
              )}
            {currentSuggestion?.tablePlacements && currentSuggestion.tablePlacements.length > 0 && (
              <span className="text-xs text-emerald-600 font-medium">
                {t("suggestions.willPlace", { count: currentSuggestion.tablePlacements.length })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={applying}>
              {t("suggestions.cancel")}
            </Button>
            <Button
              onClick={handleApply}
              disabled={
                loading ||
                applying ||
                !currentSuggestion ||
                (currentSuggestion.changedPlaceCount === 0 &&
                  (!currentSuggestion.tablePlacements ||
                    currentSuggestion.tablePlacements.length === 0) &&
                  mode !== "REPLACE_ALL")
              }
              className="rounded-full px-6 py-5 font-semibold gap-2 shadow-md"
            >
              {applying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              <span>{applying ? t("suggestions.applying") : t("suggestions.apply")}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
