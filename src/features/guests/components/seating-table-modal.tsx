"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users, Crown, X, Layers, Calculator } from "lucide-react";
import { gsap } from "gsap";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useRuntime } from "@/core/config/runtime";
import {
  getTableEstimate,
  tableEstimateKey,
  type SeatingChange,
} from "../api/planning-seating.api";

interface SeatingTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (change: SeatingChange) => Promise<void>;
  saving?: boolean;
  targetCell?: {
    side: "GROOM" | "BRIDE" | "MUTUAL";
    row: number;
    column: number;
  } | null;
  groups?: { id: string; name: string }[];
  /** Enables the "how many tables" estimate in the batch tab. */
  weddingId?: string;
}

export function SeatingTableModal({
  isOpen,
  onClose,
  onCreate,
  saving = false,
  targetCell = null,
  groups = [],
  weddingId,
}: SeatingTableModalProps) {
  const { api } = useRuntime();
  const { t } = useTranslation("seating");
  const [tab, setTab] = useState<"single" | "batch">(targetCell ? "single" : "single");

  // Single table state
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState<number>(10);
  const [side, setSide] = useState<"GROOM" | "BRIDE" | "MUTUAL" | "">(
    targetCell?.side ?? "",
  );
  const [isVip, setIsVip] = useState(false);
  const [groupId, setGroupId] = useState<string>("");

  // Batch create state
  const [batchCount, setBatchCount] = useState<number>(5);
  const [batchCapacity, setBatchCapacity] = useState<number>(10);
  const [batchGroupId, setBatchGroupId] = useState<string>("");
  const [batchSide, setBatchSide] = useState<"GROOM" | "BRIDE" | "MUTUAL" | "">("");
  const [reservePercent, setReservePercent] = useState(0);

  const modalRef = useRef<HTMLDivElement>(null);

  // 60 guests -> 6 tables of 10 or 5 of 12; the total is what to book, sides are only a reference.
  const estimate = useQuery({
    queryKey: tableEstimateKey(weddingId ?? "", batchCapacity, reservePercent),
    queryFn: ({ signal }) =>
      getTableEstimate(api, weddingId ?? "", batchCapacity === 12 ? 12 : 10, reservePercent, signal),
    enabled: isOpen && tab === "batch" && !!weddingId,
  });

  const [prevTargetCell, setPrevTargetCell] = useState(targetCell);
  if (targetCell !== prevTargetCell) {
    setPrevTargetCell(targetCell);
    if (targetCell) {
      setSide(targetCell.side);
      setTab("single");
    }
  }

  // GSAP entrance
  useEffect(() => {
    if (!isOpen) return;
    const ctx = gsap.context(() => {
      gsap.from(".table-modal-card", {
        scale: 0.95,
        opacity: 0,
        duration: 0.25,
        ease: "power2.out",
      });
    }, modalRef);
    return () => ctx.revert();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate({
      action: "CREATE_TABLE",
      name: name.trim() || undefined,
      capacity,
      side: side ? (side as "GROOM" | "BRIDE" | "MUTUAL") : null,
      half:
        targetCell?.side === "BRIDE"
          ? "BRIDE"
          : targetCell?.side === "GROOM"
            ? "GROOM"
            : side === "GROOM" || side === "BRIDE"
              ? side
              : null,
      row: targetCell?.row ?? null,
      column: targetCell?.column ?? null,
      isVip,
      groupId: groupId || null,
    });
    setName("");
    onClose();
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate({
      action: "CREATE_TABLES",
      tableCount: batchCount,
      capacity: batchCapacity,
      groupId: batchGroupId || null,
      side: batchSide || null,
    });
    onClose();
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="table-modal-card w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-6 sm:p-8">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground">
                {targetCell
                  ? t("tableModal.titleAtCell", {
                      side: t(`common.side.${targetCell.side === "GROOM" ? "GROOM" : "BRIDE"}`),
                      row: targetCell.row,
                      column: targetCell.column,
                    })
                  : t("tableModal.title")}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("tableModal.autoNumber")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tabs switcher (only if not directly clicking a grid slot) */}
        {!targetCell && (
          <div className="flex rounded-xl bg-muted/60 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTab("single")}
              className={`flex-1 rounded-lg py-2 transition-all flex items-center justify-center gap-1.5 ${
                tab === "single"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Plus className="size-3.5" />
              <span>{t("tableModal.single")}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("batch")}
              className={`flex-1 rounded-lg py-2 transition-all flex items-center justify-center gap-1.5 ${
                tab === "batch"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="size-3.5" />
              <span>{t("tableModal.batch")}</span>
            </button>
          </div>
        )}

        {/* FORM 1: SINGLE TABLE */}
        {tab === "single" ? (
          <form onSubmit={handleSingleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                {t("tableModal.nameOptional")}
              </label>
              <Input
                placeholder={t("tableModal.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                  {t("tableModal.capacity")}
                </label>
                <select
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm font-semibold"
                >
                  <option value={10}>{t("tableModal.capacity10")}</option>
                  <option value={12}>{t("tableModal.capacity12")}</option>
                </select>
              </div>

              <div>
                <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                  {t("tableModal.hallSide")}
                </label>
                <select
                  value={side}
                  onChange={(e) =>
                    setSide(e.target.value as "GROOM" | "BRIDE" | "MUTUAL" | "")
                  }
                  className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm"
                >
                  <option value="">{t("tableModal.sideTray")}</option>
                  <option value="GROOM">{t("tableModal.sideGroom")}</option>
                  <option value="BRIDE">{t("tableModal.sideBride")}</option>
                  <option value="MUTUAL">{t("tableModal.sideMutual")}</option>
                </select>
              </div>
            </div>

            {groups.length > 0 && (
              <div>
                <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                  {t("tableModal.presetGroup")}
                </label>
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm"
                >
                  <option value="">{t("tableModal.noPresetGroup")}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex items-center gap-2 pt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isVip}
                onChange={(e) => setIsVip(e.target.checked)}
                className="rounded accent-amber-500 size-4"
              />
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <Crown className="size-4 text-amber-500" />
                <span>{t("tableModal.vip")}</span>
              </span>
            </label>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                {t("tableModal.cancel")}
              </Button>
              <Button type="submit" disabled={saving} className="rounded-full px-6 py-5">
                {saving ? t("tableModal.creating") : t("tableModal.create")}
              </Button>
            </div>
          </form>
        ) : (
          /* FORM 2: BATCH CREATE */
          <form onSubmit={handleBatchSubmit} className="space-y-4 text-xs">
            <div className="rounded-2xl bg-muted/40 p-4 space-y-2">
              <span className="font-medium text-foreground text-sm">
                {t("tableModal.batchTitle")}
              </span>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {t("tableModal.batchHint")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                  {t("tableModal.batchCount")}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={batchCount}
                  onChange={(e) => setBatchCount(Number(e.target.value))}
                  required
                  className="mt-1 text-sm font-semibold"
                />
              </div>

              <div>
                <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                  {t("tableModal.batchCapacity")}
                </label>
                <select
                  value={batchCapacity}
                  onChange={(e) => setBatchCapacity(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm font-semibold"
                >
                  <option value={10}>{t("tableModal.capacity10Common")}</option>
                  <option value={12}>{t("tableModal.capacity12Plain")}</option>
                </select>
              </div>
            </div>

            {weddingId && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Calculator className="size-4 text-primary" aria-hidden="true" />
                    {t("tableModal.estimateTitle")}
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {t("tableModal.reserve")}
                    <select
                      value={reservePercent}
                      onChange={(e) => setReservePercent(Number(e.target.value))}
                      className="rounded-md border border-input bg-background px-1.5 py-1 text-[11px] text-foreground"
                    >
                      {[0, 5, 10, 15, 20].map((p) => (
                        <option key={p} value={p}>
                          {p}%
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {estimate.isPending ? (
                  <p className="text-muted-foreground">{t("tableModal.estimating")}</p>
                ) : estimate.isError || !estimate.data ? (
                  <p className="text-destructive">{t("tableModal.estimateFailed")}</p>
                ) : (
                  <>
                    <p className="text-foreground leading-relaxed">
                      <strong>{estimate.data.seatsNeeded}</strong>{" "}
                      {t("tableModal.estimateGuests", {
                        confirmed: estimate.data.confirmedSeats,
                        pending: estimate.data.pendingSeats,
                      })}{" "}
                      <strong>
                        {t("tableModal.estimateTables", {
                          tables: estimate.data.recommendedTables,
                          capacity: estimate.data.capacity,
                        })}
                      </strong>
                      {estimate.data.reserveTables > 0 &&
                        t("tableModal.estimateReserve", { count: estimate.data.reserveTables })}
                      .
                    </p>
                    <p className="text-muted-foreground">
                      {t("tableModal.currentTables", {
                        tables: estimate.data.currentTables,
                        seats: estimate.data.currentSeats,
                      })}
                      {estimate.data.missingTables > 0
                        ? t("tableModal.missingTables", {
                            count: estimate.data.missingTables,
                            capacity: estimate.data.capacity,
                          })
                        : t("tableModal.enoughTables")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("tableModal.bySide")}{" "}
                      {estimate.data.bySide
                        .filter((s) => s.seats > 0)
                        .map(
                          (s) =>
                            t("tableModal.bySideItem", {
                              side: t(
                                `common.side.${s.side === "GROOM" || s.side === "BRIDE" ? s.side : "MUTUAL"}`,
                              ),
                              seats: s.seats,
                              tables: s.tables,
                            }),
                        )
                        .join(" · ")}
                      {t("tableModal.bothFamilies")}
                    </p>
                    {estimate.data.missingTables > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full h-8 text-xs"
                        onClick={() => setBatchCount(Math.min(50, estimate.data.missingTables))}
                      >
                        {t("tableModal.useSuggestion", { count: Math.min(50, estimate.data.missingTables) })}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}

            <div>
              <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                {t("tableModal.batchSide")}
              </label>
              <select
                value={batchSide}
                onChange={(e) => setBatchSide(e.target.value as "GROOM" | "BRIDE" | "MUTUAL" | "")}
                className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm"
              >
                <option value="">{t("tableModal.noSide")}</option>
                <option value="GROOM">{t("common.side.GROOM")}</option>
                <option value="BRIDE">{t("common.side.BRIDE")}</option>
                <option value="MUTUAL">{t("common.sharedTable")}</option>
              </select>
            </div>

            {groups.length > 0 && (
              <div>
                <label className="font-medium text-muted-foreground uppercase tracking-wider text-[11px]">
                  {t("tableModal.batchGroup")}
                </label>
                <select
                  value={batchGroupId}
                  onChange={(e) => setBatchGroupId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm"
                >
                  <option value="">{t("tableModal.noGroup")}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                {t("tableModal.cancel")}
              </Button>
              <Button type="submit" disabled={saving} className="rounded-full px-6 py-5">
                {saving ? t("tableModal.creating") : t("tableModal.createNow", { count: batchCount })}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
