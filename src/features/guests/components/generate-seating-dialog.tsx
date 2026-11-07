"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { ApiError } from "@/core/api/api-error";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import {
  generateSeatingPreview,
  type SeatingGenerationApply,
  type SeatingGenerationConfig,
  type SeatingGenerationPreview,
  type SeatingPlan,
} from "../api/planning-seating.api";
import { generationIssues } from "../utils/seating-layout";

export function GenerateSeatingDialog({
  plan,
  disabled,
  onApply,
  saveError,
}: {
  plan: SeatingPlan;
  disabled: boolean;
  onApply: (input: SeatingGenerationApply) => Promise<boolean>;
  saveError?: string;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "generation" });
  const { api } = useRuntime();
  const [open, setOpen] = useState(false);
  const [capacity, setCapacity] = useState<8 | 10 | 12>(10);
  const [bride, setBride] = useState(2),
    [groom, setGroom] = useState(2);
  const [busy, setBusy] = useState(false),
    [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    source: string;
    value: SeatingGenerationPreview;
    config: SeatingGenerationConfig;
  } | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const source = JSON.stringify(plan);
  const proposal = result?.source === source ? result : null;
  const issues = generationIssues(plan, capacity);
  const invalid =
    !plan.places.length ||
    issues.missingSide.length > 0 ||
    issues.oversized.length > 0 ||
    plan.tables.length > 0;
  const config: SeatingGenerationConfig = {
    expectedVersion: plan.version,
    tableCapacity: capacity,
    tablesPerRow: { bride, groom },
  };
  function reset() {
    request.current?.abort();
    setBusy(false);
    setResult(null);
    setError("");
  }
  function close() {
    if (applying) return;
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
      if (!controller.signal.aborted) setResult({ source, value, config });
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
          setOpen(true);
        }}
      >
        <Sparkles className="size-4" />
        {t("title")}
      </Button>
      <Modal open={open} onClose={close} title={t("title")} description={t("description")}>
        <div className="space-y-5" aria-busy={busy || applying}>
          {!plan.places.length && (
            <p role="status">
              {t("noPlaces")}{" "}
              <Link className="underline" href={`/weddings/${plan.weddingId}/guests`}>
                {t("importGuests")}
              </Link>
            </p>
          )}
          <fieldset disabled={applying || disabled} className="space-y-4">
            <legend className="mb-2 text-sm font-medium">{t("capacity")}</legend>
            <div className="flex flex-wrap gap-5">
              {([8, 10, 12] as const).map((n) => (
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
            <div className="grid gap-4 sm:grid-cols-2">
              {(["bride", "groom"] as const).map((side) => (
                <label key={side} className="text-sm">
                  {t(`${side}Columns`)}
                  <select
                    className="mt-1 block w-full rounded-lg border bg-background p-2"
                    value={side === "bride" ? bride : groom}
                    onChange={(e) => {
                      reset();
                      (side === "bride" ? setBride : setGroom)(Number(e.target.value));
                    }}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
          {issues.missingSide.length > 0 && (
            <div role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">
              <p>{t("missingSide", { count: issues.missingSide.length })}</p>
              <ul className="mt-2 list-inside list-disc">
                {issues.missingSide.map((g) => (
                  <li key={g.id}>{g.recipientName}</li>
                ))}
              </ul>
            </div>
          )}
          {issues.oversized.length > 0 && (
            <div role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">
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
          {!proposal && (
            <div className="rounded-xl bg-muted/40 p-4 text-sm">
              <p className="font-medium">{t("estimate")}</p>
              <div className="my-3 grid grid-cols-3 gap-2 text-center">
                {["bride", "groom", "total"].map((label, i) => (
                  <div key={label}>
                    <strong className="block text-xl">
                      {i < 2
                        ? issues.lowerBounds[i]
                        : issues.lowerBounds.reduce((a, b) => a + b, 0)}
                    </strong>
                    {t(label)}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("lowerBound")}</p>
            </div>
          )}
          {result && !proposal && (
            <p role="alert" className="text-sm text-amber-800">
              {t("stale")}
            </p>
          )}
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
            disabled={invalid || busy || applying || disabled}
            onClick={() => void preview()}
          >
            {busy ? t("calculating") : t("preview")}
          </Button>
          {proposal && (
            <div className="space-y-4">
              <div role="status" className="rounded-xl border p-4 text-sm">
                <p className="font-medium">{t("summary", proposal.value.summary)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    proposal.value.optimizationStatus === "PROVEN_OPTIMAL" ? "optimal" : "feasible",
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("plannedPlaces")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("mixedCount", {
                    count: proposal.value.tables.filter((table) => table.group === null).length,
                  })}
                </p>
              </div>
              <div className="grid max-h-80 gap-3 overflow-auto sm:grid-cols-2">
                {proposal.value.tables.map((table) => (
                  <article
                    key={table.code}
                    className={`rounded-xl border p-3 text-sm ${table.side === "BRIDE" ? "bg-rose-50" : "bg-sky-50"}`}
                  >
                    <h3 className="font-semibold">
                      {table.code} · {t(table.side === "BRIDE" ? "bride" : "groom")}
                    </h3>
                    <p className="my-1 text-xs">
                      {t("position", { row: table.row, column: table.column })} ·{" "}
                      {proposal.value.assignments.filter((a) => a.tableCode === table.code).length}/
                      {table.capacity}
                    </p>
                    {table.group === null && <p className="text-xs text-amber-800">{t("mixed")}</p>}
                    <ul className="mt-2 space-y-1">
                      {table.guestIds.map((id) => (
                        <li key={id}>
                          {plan.guests.find((g) => g.id === id)?.recipientName}{" "}
                          <span className="text-muted-foreground">
                            ({plan.places.filter((p) => p.guestId === id).length})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
              <Button
                type="button"
                disabled={disabled || applying || busy}
                onClick={async () => {
                  setApplying(true);
                  setError("");
                  try {
                    if (
                      await onApply({
                        ...proposal.config,
                        sourceFingerprint: proposal.value.sourceFingerprint,
                        algorithmVersion: proposal.value.algorithmVersion,
                      })
                    ) {
                      setOpen(false);
                      setResult(null);
                    } else {
                      setResult(null);
                      setError(t("applyFailed"));
                    }
                  } finally {
                    setApplying(false);
                  }
                }}
              >
                {applying ? t("applying") : t("apply")}
              </Button>
              <Button type="button" variant="ghost" disabled={applying} onClick={reset}>
                {t("back")}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
