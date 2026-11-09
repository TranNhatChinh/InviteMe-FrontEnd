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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const issues = generationIssues(plan, capacity);
  const invalid =
    !plan.places.length ||
    issues.missingSide.length > 0 ||
    issues.oversized.length > 0 ||
    plan.tables.length > 0;
  const config: SeatingGenerationConfig = {
    expectedVersion: plan.version,
    tableCapacity: capacity,
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
          {
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
