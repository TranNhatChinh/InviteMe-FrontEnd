"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { ArrowDown, ArrowUp, GripVertical, Sparkles } from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";
import { groupLabels } from "@/shared/lib/planning-groups";
import { useRuntime } from "@/core/config/runtime";
import { ApiError } from "@/core/api/api-error";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import {
  defaultPositionPriority,
  generateSeatingPreview,
  type PositionPriority,
  seatingCapacities,
  type SeatingCapacity,
  type SeatingGenerationConfig,
  type SeatingGenerationPreview,
  type SeatingPlan,
} from "../api/planning-seating.api";
import { generationIssues } from "../utils/seating-layout";

export function GenerateSeatingDialog({
  plan,
  disabled,
  onPreview,
  saveError,
}: {
  plan: SeatingPlan;
  disabled: boolean;
  onPreview: (value: SeatingGenerationPreview, config: SeatingGenerationConfig) => void;
  saveError?: string;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "generation" });
  const { api } = useRuntime();
  const [open, setOpen] = useState(false);
  const [capacity, setCapacity] = useState<SeatingCapacity>(10);
  const [columns, setColumns] = useState(plan.brideTablesPerRow ?? 2);
  const [priority, setPriority] = useState<PositionPriority>([
    ...(plan.positionPriority ?? defaultPositionPriority),
  ]);
  const draggedGroup = useRef<PositionPriority[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const issues = generationIssues(plan, capacity);
  const invalid = !plan.places.length || plan.tables.length > 0 || issues.oversized.length > 0;
  const config: SeatingGenerationConfig = {
    expectedVersion: plan.version,
    tableCapacity: capacity,
    positionPriority: priority,
    tablesPerRow: { bride: columns, groom: columns },
  };
  function reset() {
    request.current?.abort();
    setBusy(false);
    setError("");
  }
  function close() {
    if (busy) return;
    reset();
    setOpen(false);
  }
  async function preview() {
    reset();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const value = await generateSeatingPreview(api, plan.weddingId, config, controller.signal);
      if (!controller.signal.aborted) {
        onPreview(value, config);
        setOpen(false);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          t(
            e instanceof ApiError && e.status === 409
              ? "stale"
              : e instanceof ApiError && e.backendCode === "PLAN_LIMIT_REACHED"
                ? "quota"
                : "failed",
          ),
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <Button
        type="button"
        disabled={disabled}
        onClick={() => {
          reset();
          setPriority([...(plan.positionPriority ?? defaultPositionPriority)]);
          setOpen(true);
        }}
      >
        <Sparkles className="size-4" />
        {t("suggest")}
      </Button>
      <Modal open={open} onClose={close} title={t("title")} description={t("description")}>
        <div className="space-y-5" aria-busy={busy}>
          {!plan.places.length && (
            <p role="status">
              {t("noPlaces")}{" "}
              <Link className="underline" href={`/weddings/${plan.weddingId}/guests`}>
                {t("importGuests")}
              </Link>
            </p>
          )}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("groupingMode")}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="seating-grouping" checked readOnly />
              {t("strictGrouping")}
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="radio" name="seating-grouping" disabled />
              {t("sharedGroupingComingSoon")}
            </label>
          </fieldset>
          <fieldset disabled={busy || disabled} className="space-y-4">
            <legend className="mb-2 text-sm font-medium">{t("capacity")}</legend>
            <div className="flex flex-wrap gap-5">
              {seatingCapacities.map((n) => (
                <label key={n} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="generation-capacity"
                    value={n}
                    checked={capacity === n}
                    onChange={() => {
                      reset();
                      setCapacity(n);
                    }}
                  />
                  {t("seats", { count: n })}
                </label>
              ))}
            </div>
            <label className="block text-sm">
              {t("sharedColumns")}
              <select
                aria-label={t("sharedColumns")}
                className="mt-1 block w-full rounded-lg border bg-background p-2"
                value={columns}
                onChange={(e) => {
                  reset();
                  setColumns(Number(e.target.value));
                }}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("sharedColumnsHint")}
              </span>
            </label>
          </fieldset>
          <fieldset disabled={busy || disabled} className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("positionPriority")}</legend>
            <ol className="space-y-1">
              {priority.map((group, index) => (
                <li
                  key={group}
                  draggable={!busy && !disabled}
                  onDragStart={(event) => {
                    draggedGroup.current = group;
                    event.dataTransfer.setData("text/plain", group);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    draggedGroup.current = null;
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = priority.findIndex((item) => item === draggedGroup.current);
                    if (!busy && !disabled && from >= 0)
                      setPriority(arrayMove(priority, from, index));
                    draggedGroup.current = null;
                  }}
                  className="flex items-center gap-2 rounded-lg border px-3 py-1 text-sm"
                >
                  <GripVertical aria-hidden="true" className="size-4 cursor-grab" />
                  <span className="flex-1">{groupLabels[group]}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    aria-label={t("movePriorityUp", { group: groupLabels[group] })}
                    onClick={() => setPriority(arrayMove(priority, index, index - 1))}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={index === priority.length - 1}
                    aria-label={t("movePriorityDown", { group: groupLabels[group] })}
                    onClick={() => setPriority(arrayMove(priority, index, index + 1))}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </li>
              ))}
            </ol>
          </fieldset>
          {issues.oversized.length > 0 && (
            <div role="status" className="rounded-lg border border-amber-300 p-3 text-sm">
              <p>{t("oversized", { capacity })}</p>
              <ul className="mt-2 list-inside list-disc">
                {issues.oversized.map((g) => (
                  <li key={g.id}>
                    {g.recipientName} · {plan.places.filter((p) => p.guestId === g.id).length}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {
            <div className="rounded-xl bg-muted/40 p-4 text-sm">
              <p className="font-medium">{t("estimate")}</p>
              <p className="my-3 text-sm">
                {t("total")} <strong>{issues.lowerBound}</strong>
              </p>
              <p className="text-xs text-muted-foreground">{t("lowerBound")}</p>
            </div>
          }
          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={invalid || busy || disabled}
            onClick={() => void preview()}
          >
            {busy ? t("calculating") : t("preview")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
