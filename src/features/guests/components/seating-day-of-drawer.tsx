"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarCheck,
  Clock,
  History,
  Lock,
  Unlock,
  UserX,
  X,
} from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { Button } from "@/shared/ui/button";
import { formatDate } from "@/i18n/format";
import {
  getSeatingAuditLogs,
  getUnattendedGuests,
  type PlanningTable,
  type SeatingChange,
} from "../api/planning-seating.api";

interface SeatingDayOfDrawerProps {
  weddingId: string;
  isLocked: boolean;
  isEventStarted: boolean;
  isOpen: boolean;
  onClose: () => void;
  onChange: (change: SeatingChange) => Promise<void>;
  saving?: boolean;
  tables: PlanningTable[];
}


export function SeatingDayOfDrawer({
  weddingId,
  isLocked,
  isEventStarted,
  isOpen,
  onClose,
  onChange,
  saving = false,
  tables,
}: SeatingDayOfDrawerProps) {
  const { t: tr } = useTranslation("seating");
  const { api } = useRuntime();
  const [activeTab, setActiveTab] = useState<"operations" | "logs">("operations");
  const [selectedTableForUnattended, setSelectedTableForUnattended] = useState<string>(
    tables[0]?.id ?? "",
  );

  // Queries
  const logsQuery = useQuery({
    queryKey: ["seating-audit-logs", weddingId],
    queryFn: ({ signal }) => getSeatingAuditLogs(api, weddingId, signal),
    enabled: isOpen && activeTab === "logs",
  });

  const unattendedQuery = useQuery({
    queryKey: ["seating-unattended", weddingId, selectedTableForUnattended],
    queryFn: ({ signal }) =>
      getUnattendedGuests(api, weddingId, selectedTableForUnattended, signal),
    enabled: isOpen && activeTab === "operations" && !!selectedTableForUnattended,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-card border-l border-border h-full flex flex-col p-6 shadow-2xl space-y-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <Activity className="size-5 text-primary" />
            <div>
              <h2 className="font-serif text-lg font-semibold text-foreground">
                {tr("dayOf.title")}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tr("dayOf.subtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Status Pills */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              {tr("dayOf.planStatus")}
            </span>
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              {isLocked ? (
                <>
                  <Lock className="size-3.5 text-amber-500" />
                  <span>{tr("dayOf.lockedEditing")}</span>
                </>
              ) : (
                <>
                  <Unlock className="size-3.5 text-emerald-500" />
                  <span>{tr("dayOf.openEditing")}</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              {tr("dayOf.eventProgress")}
            </span>
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              {isEventStarted ? (
                <>
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{tr("dayOf.eventRunning")}</span>
                </>
              ) : (
                <>
                  <Clock className="size-3.5 text-muted-foreground" />
                  <span>{tr("dayOf.eventNotStarted")}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-muted/60 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("operations")}
            className={`flex-1 rounded-lg py-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "operations"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <CalendarCheck className="size-3.5" />
            <span>{tr("dayOf.tabOperations")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("logs")}
            className={`flex-1 rounded-lg py-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "logs"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <History className="size-3.5" />
            <span>{tr("dayOf.tabLogs", { count: logsQuery.data?.length ?? 0 })}</span>
          </button>
        </div>

        {/* TAB 1: OPERATIONS */}
        {activeTab === "operations" && (
          <div className="space-y-5 text-xs">
            {/* Start Event Action */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <span className="font-serif text-sm font-semibold text-foreground">
                {tr("dayOf.startTitle")}
              </span>
              <p className="text-muted-foreground leading-relaxed">
                {tr("dayOf.startHint")}
              </p>
              <Button
                disabled={saving || isEventStarted}
                onClick={() => onChange({ action: "START_EVENT" })}
                className="w-full rounded-full py-4 font-semibold shadow-sm"
              >
                {isEventStarted ? tr("dayOf.started") : tr("dayOf.start")}
              </Button>
            </div>

            {/* Lock / Unlock Plan */}
            <div className="rounded-2xl border border-border p-4 space-y-3">
              <span className="font-serif text-sm font-semibold text-foreground">
                {tr("dayOf.lockTitle")}
              </span>
              <p className="text-muted-foreground leading-relaxed">
                {tr("dayOf.lockHint")}
              </p>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => onChange({ action: isLocked ? "UNLOCK_PLAN" : "LOCK_PLAN" })}
                className="w-full rounded-full py-4 font-semibold"
              >
                {isLocked ? tr("dayOf.unlock") : tr("dayOf.lock")}
              </Button>
            </div>

            {/* Unattended Guests & Empty Seats */}
            <div className="rounded-2xl border border-border p-4 space-y-3">
              <span className="font-serif text-sm font-semibold text-foreground">
                {tr("dayOf.absentTitle")}
              </span>
              <p className="text-muted-foreground leading-relaxed">
                {tr("dayOf.absentHint")}
              </p>

              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground">
                  {tr("dayOf.chooseTable")}
                </label>
                <select
                  value={selectedTableForUnattended}
                  onChange={(e) => setSelectedTableForUnattended(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2 text-xs"
                >
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {tr("dayOf.tableOption", {
                        table: t.number
                          ? tr("common.tableLabel", { number: String(t.number).padStart(2, "0") })
                          : t.name,
                        capacity: t.capacity,
                      })}
                    </option>
                  ))}
                </select>
              </div>

              {unattendedQuery.isPending ? (
                <div className="py-4 text-center text-muted-foreground">{tr("dayOf.loadingAbsent")}</div>
              ) : unattendedQuery.data && unattendedQuery.data.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {unattendedQuery.data.map((u) => (
                    <div
                      key={u.placeId}
                      className="flex items-center justify-between rounded-lg bg-muted/40 p-2 text-[11px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <UserX className="size-3.5 text-amber-500" />
                        <span className="font-medium text-foreground">{u.guestName}</span>
                      </div>
                      <span className="font-mono text-muted-foreground">
                        {tr("dayOf.seatNumber", { seat: u.seatNumber })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-emerald-500/10 p-2.5 text-center text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  {tr("dayOf.noAbsent")}
                </div>
              )}
            </div>

            {/* Release seats of declined guests */}
            <div className="rounded-2xl border border-border p-4 space-y-3">
              <span className="font-serif text-sm font-semibold text-foreground">
                {tr("dayOf.releaseTitle")}
              </span>
              <p className="text-muted-foreground leading-relaxed">
                {tr("dayOf.releaseHint")}
              </p>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => onChange({ action: "RELEASE_DECLINED_SEATS" })}
                className="w-full rounded-full py-4 font-semibold text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
              >
                {tr("dayOf.release")}
              </Button>
            </div>
          </div>
        )}

        {/* TAB 2: AUDIT LOGS */}
        {activeTab === "logs" && (
          <div className="space-y-3 text-xs">
            {logsQuery.isPending ? (
              <div className="py-12 text-center text-muted-foreground">{tr("dayOf.loadingLogs")}</div>
            ) : !logsQuery.data || logsQuery.data.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                {tr("dayOf.noLogs")}
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {logsQuery.data.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-primary">
                        {tr(`dayOf.actions.${log.action}`, { defaultValue: log.action })}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(log.createdAt, "vi", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    {log.metadata && (
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {log.metadata}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
