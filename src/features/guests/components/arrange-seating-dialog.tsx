"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { useRuntime } from "@/core/config/runtime";
import { ApiError } from "@/core/api/api-error";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import {
  previewSeatingArrangement,
  type ArrangeSeatingInput,
  type SeatingArrangementPreview,
  type SeatingPlan,
} from "../api/planning-seating.api";

export function ArrangeSeatingDialog({
  plan,
  disabled,
  onApply,
  saveError,
}: {
  plan: SeatingPlan;
  disabled: boolean;
  onApply: (input: ArrangeSeatingInput) => Promise<boolean>;
  saveError?: string;
}) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "arrangement" });
  const { api } = useRuntime();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    source: string;
    proposal: SeatingArrangementPreview;
  } | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const source = JSON.stringify(plan);
  const proposal = result?.source === source ? result.proposal : null;
  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const proposal = await previewSeatingArrangement(
        api,
        plan.weddingId,
        { expectedVersion: plan.version },
        controller.signal,
      );
      if (!controller.signal.aborted) setResult({ source, proposal });
    } catch (e) {
      if (!controller.signal.aborted)
        setError(t(e instanceof ApiError && e.status === 409 ? "stale" : "failed"));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function close() {
    if (applying) return;
    request.current?.abort();
    setBusy(false);
    setOpen(false);
    setResult(null);
    setError("");
  }
  return (
    <>
      <Button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        <Sparkles className="size-4" />
        {t("title")}
      </Button>
      <Modal open={open} onClose={close} title={t("title")} description={t("policy")}>
        <div className="space-y-4" aria-busy={busy || applying}>
          {busy && <p role="status">{t("loading")}</p>}
          {(error || saveError) && (
            <p role="alert" className="text-sm text-destructive">
              {error || saveError}
            </p>
          )}
          {result && !proposal && (
            <p role="alert" className="text-sm text-amber-800">
              {t("stale")}
            </p>
          )}
          {proposal && (
            <>
              <div role="status" className="rounded-lg border p-3 text-sm">
                <p>
                  {t("summary", {
                    added: proposal.newlyAssignedCount,
                    preserved: proposal.preservedCount,
                    remaining: proposal.unassigned.reduce((n, p) => n + p.placeIds.length, 0),
                  })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("notSaved")}</p>
              </div>
              {proposal.warnings.map((warning) => (
                <p key={warning} className="text-xs text-amber-800">
                  {t(`warnings.${warning}`)}
                </p>
              ))}
              <div className="grid max-h-80 gap-3 overflow-auto sm:grid-cols-2">
                {plan.tables.map((table) => {
                  const assigned = proposal.assignments.filter((a) => a.tableId === table.id);
                  const members = new Map<string, number>();
                  for (const a of assigned) {
                    const place = plan.places.find((p) => p.id === a.placeId);
                    if (place) members.set(place.guestId, (members.get(place.guestId) ?? 0) + 1);
                  }
                  return (
                    <article key={table.id} className="rounded-xl border p-3 text-sm">
                      <h3 className="font-semibold">
                        {table.name} · {assigned.length}/{table.capacity}
                      </h3>
                      <ul className="mt-2 space-y-1">
                        {[...members].map(([id, count]) => (
                          <li key={id}>
                            {plan.guests.find((g) => g.id === id)?.recipientName} ({count})
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
              {proposal.unassigned.length > 0 && (
                <div className="rounded-lg border border-amber-200 p-3 text-sm">
                  <h3 className="font-medium">{t("unassigned")}</h3>
                  <ul className="mt-2 space-y-2">
                    {proposal.unassigned.map((party) => (
                      <li key={party.guestId}>
                        {plan.guests.find((g) => g.id === party.guestId)?.recipientName} (
                        {party.placeIds.length}) · {t(`issues.${party.code}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!proposal.newlyAssignedCount && (
                <p className="text-sm text-muted-foreground">
                  {t(proposal.unassigned.length ? "noChanges" : "allSeated")}
                </p>
              )}
              <Button
                type="button"
                disabled={disabled || busy || applying || !proposal.newlyAssignedCount}
                onClick={async () => {
                  setApplying(true);
                  setError("");
                  try {
                    if (
                      await onApply({
                        expectedVersion: proposal.sourceVersion,
                        sourceFingerprint: proposal.sourceFingerprint,
                        algorithmVersion: proposal.algorithmVersion,
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
            </>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={disabled || busy || applying}
            onClick={() => void load()}
          >
            {t("recalculate")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
