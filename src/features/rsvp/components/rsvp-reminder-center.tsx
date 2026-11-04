"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarClock, Mail, Send } from "lucide-react";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { usePermission } from "@/shared/components/permission-guard";
import { ConfirmDialog } from "@/shared/feedback/confirm-dialog";
import { EmptyState } from "@/shared/feedback/empty-state";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/ui/button";
import { useLocale } from "@/i18n/language-context";
// eslint-disable-next-line architecture/boundaries -- RSVP reminder limits use the shared wedding plan entitlement contract.
import {
  canSendManualReminder,
  FeatureLimitNotice,
  planEntitlementState,
  useWeddingPlan,
} from "@/features/plans";
import {
  getRsvpReminderSummary,
  listRsvpReminders,
  previewRsvpReminders,
  rsvpReminderKeys,
  saveRsvpReminderSettings,
  sendRsvpReminders,
  type RsvpReminderKind,
  type RsvpReminderPreview,
  type RsvpReminderStatus,
} from "../api/rsvp-reminders.api";

const fieldClass = "h-10 rounded-lg border bg-background px-3 text-sm";
function formatDate(value: string | null, timezone: string, language: "vi" | "en", notSet: string) {
  if (!value) return notSet;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return notSet;
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function errorMessage(error: unknown, t: (key: string) => string) {
  if (!(error instanceof ApiError)) return t("reminder.errors.generic");
  if (error.backendCode === "PLAN_LIMIT_REACHED") return t("reminder.errors.planLimit");
  if (error.backendCode === "EMAIL_NOT_CONFIGURED") return t("reminder.errors.emailUnavailable");
  if (error.backendCode === "WEDDING_SCOPE_REQUIRED")
    return t("reminder.errors.weddingWideRequired");
  if (error.status === 403) return t("reminder.errors.forbidden");
  if (error.status === 422) return t("reminder.errors.invalidRequest");
  return t("reminder.errors.generic");
}

export function RsvpReminderCenter({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("guests");
  const { language } = useLocale();
  const { api } = useRuntime();
  const cache = useQueryClient();
  const { can, isOwner, isWeddingWide } = usePermission();
  const { t: tPlans } = useTranslation("plans");
  const hasWeddingWideRsvp = can("RSVP_VIEW") && isWeddingWide("RSVP_VIEW");
  const canManage = can("INVITATION_SEND") && isWeddingWide("INVITATION_SEND");
  const plan = useWeddingPlan(weddingId, hasWeddingWideRsvp);
  const [status, setStatus] = useState<RsvpReminderStatus | "">("");
  const [kind, setKind] = useState<RsvpReminderKind | "">("");
  const [pageNumber, setPageNumber] = useState(1);
  const [preview, setPreview] = useState<RsvpReminderPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<"settings" | "preview" | "send" | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const filters = useMemo(
    () => ({
      status: status || undefined,
      kind: kind || undefined,
      page: pageNumber,
      pageSize: 25,
    }),
    [kind, pageNumber, status],
  );
  const summaryQuery = useQuery({
    queryKey: rsvpReminderKeys.summary(weddingId),
    queryFn: ({ signal }) => getRsvpReminderSummary(api, weddingId, signal),
    enabled: hasWeddingWideRsvp,
  });
  const historyQuery = useQuery({
    queryKey: rsvpReminderKeys.history(weddingId, filters),
    queryFn: ({ signal }) => listRsvpReminders(api, weddingId, filters, signal),
    enabled: hasWeddingWideRsvp,
  });
  const summary = summaryQuery.data;
  const history = historyQuery.data;
  const selectedCount = selectedIds.length;
  const planUnavailable = plan.isError || (!plan.isPending && !plan.data);
  const automaticGate =
    !planUnavailable && plan.data ? planEntitlementState(plan.data, "reminderRounds") : null;
  const manualAllowed =
    !planUnavailable && !plan.isPending && plan.data ? canSendManualReminder(plan.data) : false;
  const manualLimit = plan.data?.limits.reminderRounds;
  const manualUsage = plan.data?.usage.reminderRounds;
  const manualUsageText =
    !planUnavailable && plan.data && manualLimit === null
      ? t("reminder.unlimitedManualQuota")
      : !planUnavailable && plan.data && manualLimit !== undefined && manualLimit !== null
        ? t("reminder.manualQuota", { used: manualUsage, limit: manualLimit })
        : null;

  if (!hasWeddingWideRsvp)
    return (
      <EmptyState
        title={t("reminder.weddingWideTitle")}
        description={t("reminder.weddingWideDescription")}
      />
    );

  async function refreshAfterChange() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: rsvpReminderKeys.all(weddingId) }),
      cache.invalidateQueries({ queryKey: ["host-rsvp", weddingId] }),
    ]);
  }

  async function toggleAutomatic() {
    if (!summary || !canManage || busy) return;
    if (
      !summary.autoEnabled &&
      (plan.isPending || planUnavailable || !plan.data || automaticGate?.locked)
    )
      return;
    setBusy("settings");
    setActionError("");
    setNotice("");
    try {
      const updated = await saveRsvpReminderSettings(api, weddingId, !summary.autoEnabled);
      cache.setQueryData(rsvpReminderKeys.summary(weddingId), updated);
      setNotice(updated.autoEnabled ? t("reminder.enabledNotice") : t("reminder.disabledNotice"));
      await refreshAfterChange();
    } catch (error) {
      setActionError(errorMessage(error, t));
      if (error instanceof ApiError && error.backendCode === "PLAN_LIMIT_REACHED")
        await cache.invalidateQueries({ queryKey: ["wedding-plan", weddingId] });
    } finally {
      setBusy(null);
    }
  }

  async function loadPreview() {
    if (!canManage || busy) return;
    setBusy("preview");
    setActionError("");
    setNotice("");
    try {
      const result = await previewRsvpReminders(api, weddingId);
      setPreview(result);
      setSelectedIds(result.eligible.map((guest) => guest.guestId));
    } catch (error) {
      setActionError(errorMessage(error, t));
      if (error instanceof ApiError && error.backendCode === "PLAN_LIMIT_REACHED")
        await cache.invalidateQueries({ queryKey: ["wedding-plan", weddingId] });
    } finally {
      setBusy(null);
    }
  }

  async function sendSelected() {
    if (!canManage || !manualAllowed || !preview || selectedIds.length === 0 || busy) return;
    setBusy("send");
    setActionError("");
    setNotice("");
    try {
      const result = await sendRsvpReminders(api, weddingId, selectedIds);
      setNotice(
        result.queued
          ? t("reminder.queuedNotice", {
              count: result.queued,
              date: formatDate(
                result.sendAt,
                summary?.timezone ?? "Asia/Ho_Chi_Minh",
                language,
                t("reminder.notSet"),
              ),
            })
          : t("reminder.noneQueuedNotice"),
      );
      setPreview({ sendAt: result.sendAt, eligible: [], skipped: result.skipped });
      setSelectedIds([]);
      await refreshAfterChange();
    } catch (error) {
      setActionError(errorMessage(error, t));
      if (error instanceof ApiError && error.backendCode === "PLAN_LIMIT_REACHED")
        await cache.invalidateQueries({ queryKey: ["wedding-plan", weddingId] });
    } finally {
      setBusy(null);
    }
  }

  function toggleGuest(guestId: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, guestId])] : current.filter((id) => id !== guestId),
    );
  }

  function changeStatus(event: FormEvent<HTMLSelectElement>) {
    setStatus(event.currentTarget.value as RsvpReminderStatus | "");
    setPageNumber(1);
  }

  function changeKind(event: FormEvent<HTMLSelectElement>) {
    setKind(event.currentTarget.value as RsvpReminderKind | "");
    setPageNumber(1);
  }

  return (
    <div className="space-y-8">
      <PageHeader title={t("reminder.title")} description={t("reminder.description")} />

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {actionError}
        </p>
      )}
      {notice && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg bg-green-50 p-3 text-sm text-green-900"
        >
          {notice}
        </p>
      )}
      {planUnavailable && (
        <FeatureLimitNotice
          status="unavailable"
          title={t("reminder.planUnknownTitle")}
          description={t("reminder.planUnknownDescription")}
          retryLabel={tPlans("gate.retry")}
          onRetry={() => void plan.refetch()}
        />
      )}
      {plan.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("reminder.checkingPlan")}
        </p>
      )}
      {summaryQuery.isPending && <LoadingState label={t("reminder.loadingSettings")} />}
      {summaryQuery.isError && (
        <ErrorState error={summaryQuery.error} retry={() => void summaryQuery.refetch()} />
      )}

      {summary && (
        <>
          {automaticGate?.locked && (
            <FeatureLimitNotice
              title={t("reminder.autoPlanTitle")}
              description={
                isOwner
                  ? t("reminder.autoPlanOwnerDescription")
                  : t("reminder.autoPlanContactOwner")
              }
              variant="compact"
              upgradeHref={isOwner ? `/weddings/${encodeURIComponent(weddingId)}/plan` : undefined}
              upgradeLabel={isOwner ? tPlans("gate.viewPlans") : undefined}
            />
          )}
          {!summary.emailConfigured && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
              <Mail className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p>{t("reminder.emailNotConfigured")}</p>
            </div>
          )}

          <section
            className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6"
            aria-labelledby="reminder-settings-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="reminder-settings-heading" className="text-lg font-semibold">
                  {t("reminder.automaticTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("reminder.automaticDescription")}
                </p>
              </div>
              {canManage ? (
                <Button
                  variant={summary.autoEnabled ? "outline" : "default"}
                  onClick={() => void toggleAutomatic()}
                  disabled={
                    busy !== null ||
                    (!summary.autoEnabled &&
                      (plan.isPending ||
                        planUnavailable ||
                        !plan.data ||
                        Boolean(automaticGate?.locked)))
                  }
                >
                  <BellRing aria-hidden="true" />
                  {busy === "settings"
                    ? t("reminder.saving")
                    : summary.autoEnabled
                      ? t("reminder.disable")
                      : t("reminder.enable")}
                </Button>
              ) : (
                <span className="rounded-full bg-muted px-3 py-1 text-sm">
                  {t("reminder.readOnly")}
                </span>
              )}
            </div>

            <dl className="grid grid-cols-2 divide-x divide-y rounded-xl border bg-muted/20 sm:grid-cols-3 sm:divide-y-0">
              <Metric label={t("reminder.notResponded")} value={summary.notResponded} />
              <Metric label={t("reminder.canRemindNow")} value={summary.canRemindNow} />
              <Metric label={t("reminder.pendingSending")} value={summary.counts.pending} />
              <Metric label={t("reminder.sentSuccessfully")} value={summary.counts.sent} />
              <Metric label={t("reminder.sendFailed")} value={summary.counts.failed} />
              <Metric label={t("reminder.cancelled")} value={summary.counts.cancelled} />
            </dl>

            <div className="grid gap-4 border-t pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-2">
                <h3 className="font-medium">{t("reminder.rounds")}</h3>
                {summary.autoRounds.map((round) => (
                  <div
                    key={round.kind}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    <span>{t(`reminder.kind.${round.kind}`)}</span>
                    <span className="text-muted-foreground">
                      {round.state === "OFF"
                        ? t("reminder.noSchedule")
                        : t(
                            round.state === "STARTED"
                              ? "reminder.startedAt"
                              : "reminder.scheduledAt",
                            {
                              date: formatDate(
                                round.at,
                                summary.timezone,
                                language,
                                t("reminder.notSet"),
                              ),
                            },
                          )}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <h3 className="font-medium">{t("reminder.sendingRules")}</h3>
                <p>
                  {t("reminder.rsvpDeadline")}:{" "}
                  <strong>
                    {formatDate(
                      summary.rsvpDeadline,
                      summary.timezone,
                      language,
                      t("reminder.notSet"),
                    )}
                  </strong>
                </p>
                <p>
                  {t("reminder.sendingHours")}: <strong>{summary.sendingHours}</strong>
                </p>
                <p>{t("reminder.maxReminders", { count: summary.maxRemindersPerGuest })}</p>
              </div>
            </div>
          </section>

          {canManage && (
            <section
              className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6"
              aria-labelledby="manual-reminder-heading"
            >
              <div>
                <h2 id="manual-reminder-heading" className="text-lg font-semibold">
                  {t("reminder.manualTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("reminder.manualDescription")}
                </p>
                {manualUsageText && (
                  <p className="mt-2 text-sm font-medium text-muted-foreground" role="status">
                    {manualUsageText}
                  </p>
                )}
              </div>
              {!manualAllowed &&
                !planUnavailable &&
                !plan.isPending &&
                plan.data &&
                automaticGate?.locked && (
                  <p role="status" className="-mt-1 text-sm text-muted-foreground">
                    {t("reminder.manualQuotaNotIncludedDescription")}
                  </p>
                )}
              {!manualAllowed &&
                !planUnavailable &&
                !plan.isPending &&
                plan.data &&
                !automaticGate?.locked && (
                  <FeatureLimitNotice
                    title={t("reminder.manualQuotaReachedTitle")}
                    description={
                      isOwner
                        ? t("reminder.manualQuotaOwnerDescription")
                        : t("reminder.manualQuotaContactOwner")
                    }
                    usage={manualUsageText ?? undefined}
                    variant="compact"
                    upgradeHref={
                      isOwner ? `/weddings/${encodeURIComponent(weddingId)}/plan` : undefined
                    }
                    upgradeLabel={isOwner ? tPlans("gate.viewPlans") : undefined}
                  />
                )}
              {!preview ? (
                <Button
                  variant="outline"
                  onClick={() => void loadPreview()}
                  disabled={busy !== null}
                >
                  <CalendarClock aria-hidden="true" />
                  {busy === "preview" ? t("reminder.checking") : t("reminder.checkEligible")}
                </Button>
              ) : (
                <>
                  <p className="rounded-lg bg-muted p-3 text-sm">
                    {t("reminder.previewSendTime", {
                      date: formatDate(
                        preview.sendAt,
                        summary.timezone,
                        language,
                        t("reminder.notSet"),
                      ),
                    })}
                  </p>
                  {preview.eligible.length > 0 ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm">
                          {t("reminder.eligibleSummary", {
                            eligible: preview.eligible.length,
                            selected: selectedCount,
                          })}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setSelectedIds(preview.eligible.map((guest) => guest.guestId))
                            }
                          >
                            {t("reminder.selectAll")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedIds([])}
                          >
                            {t("reminder.clearSelection")}
                          </Button>
                        </div>
                      </div>
                      <ul className="max-h-80 divide-y overflow-y-auto rounded-xl border">
                        {preview.eligible.map((guest) => (
                          <li key={guest.guestId} className="flex items-center gap-3 p-3">
                            <input
                              type="checkbox"
                              className="size-5 accent-primary"
                              checked={selectedIds.includes(guest.guestId)}
                              onChange={(event) => toggleGuest(guest.guestId, event.target.checked)}
                              aria-label={t("reminder.selectReminder", {
                                name: guest.recipientName,
                              })}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">
                                {guest.recipientName}
                              </span>
                              <span className="block truncate text-sm text-muted-foreground">
                                {guest.email}
                              </span>
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {t("reminder.remindersSent", {
                                sent: guest.remindersSent,
                                max: summary.maxRemindersPerGuest,
                              })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      {t("reminder.noEligibleGuests")}
                    </p>
                  )}

                  {preview.skipped.length > 0 && (
                    <details className="rounded-lg border p-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        {t("reminder.skippedCount", { count: preview.skipped.length })}
                      </summary>
                      <ul className="mt-3 space-y-2 text-sm">
                        {preview.skipped.map((guest, index) => (
                          <li
                            key={`${guest.guestId}-${guest.reason}-${index}`}
                            className="flex flex-wrap justify-between gap-2 border-t pt-2"
                          >
                            <span>{guest.recipientName || t("reminder.guestNotFound")}</span>
                            <span className="text-muted-foreground">
                              {t(`reminder.skipReasons.${guest.reason}`, {
                                defaultValue: guest.reason,
                              })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void loadPreview()}
                      disabled={busy !== null}
                    >
                      {t("reminder.refreshPreview")}
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          disabled={
                            !summary.emailConfigured ||
                            !manualAllowed ||
                            selectedCount === 0 ||
                            busy !== null
                          }
                        >
                          <Send aria-hidden="true" />
                          {busy === "send"
                            ? t("reminder.queueing")
                            : t("reminder.sendSelected", { count: selectedCount })}
                        </Button>
                      }
                      title={t("reminder.confirmTitle")}
                      description={t("reminder.confirmDescription", { count: selectedCount })}
                      cancelLabel={t("reminder.goBack")}
                      confirmLabel={t("reminder.addToQueue")}
                      onConfirm={() => void sendSelected()}
                    />
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}

      <section
        className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6"
        aria-labelledby="reminder-history-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="reminder-history-heading" className="text-lg font-semibold">
              {t("reminder.historyTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("reminder.historyDescription")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="reminder-status-filter">
              {t("reminder.filterStatus")}
            </label>
            <select
              id="reminder-status-filter"
              className={fieldClass}
              value={status}
              onChange={changeStatus}
            >
              <option value="">{t("reminder.allStatuses")}</option>
              {(["PENDING", "SENDING", "SENT", "FAILED", "CANCELLED"] as RsvpReminderStatus[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {t(`reminder.status.${value}`)}
                  </option>
                ),
              )}
            </select>
            <label className="sr-only" htmlFor="reminder-kind-filter">
              {t("reminder.filterKind")}
            </label>
            <select
              id="reminder-kind-filter"
              className={fieldClass}
              value={kind}
              onChange={changeKind}
            >
              <option value="">{t("reminder.allKinds")}</option>
              {(["AUTO_3D", "AUTO_1D", "MANUAL"] as RsvpReminderKind[]).map((value) => (
                <option key={value} value={value}>
                  {t(`reminder.kind.${value}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {historyQuery.isPending && <LoadingState label={t("reminder.loadingHistory")} />}
        {historyQuery.isError && (
          <ErrorState error={historyQuery.error} retry={() => void historyQuery.refetch()} />
        )}
        {history && history.items.length === 0 && (
          <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            {t("reminder.emptyHistory")}
          </p>
        )}
        {history && history.items.length > 0 && (
          <>
            <div className="hidden overflow-x-auto rounded-xl border xl:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">{t("reminder.guest")}</th>
                    <th className="p-3 font-medium">{t("reminder.kindLabel")}</th>
                    <th className="p-3 font-medium">{t("reminder.statusLabel")}</th>
                    <th className="p-3 font-medium">{t("reminder.time")}</th>
                    <th className="p-3 font-medium">{t("reminder.result")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">
                        <span className="block font-medium">{item.recipientName}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.recipient ?? t("reminder.emailHidden")}
                        </span>
                      </td>
                      <td className="p-3">{t(`reminder.kind.${item.kind}`)}</td>
                      <td className="p-3">
                        <StatusPill
                          status={item.status}
                          label={t(`reminder.status.${item.status}`)}
                        />
                      </td>
                      <td className="p-3">
                        {formatDate(
                          item.sentAt ?? item.nextAttemptAt,
                          summary?.timezone ?? "Asia/Ho_Chi_Minh",
                          language,
                          t("reminder.notSet"),
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {item.lastErrorCode ??
                          (item.sentAt
                            ? t("reminder.sentAttempts", { count: item.attemptCount })
                            : t("reminder.waitingWorker"))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-3 xl:hidden">
              {history.items.map((item) => (
                <li key={item.id} className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.recipientName}</p>
                      <p className="break-all text-xs text-muted-foreground">
                        {item.recipient ?? t("reminder.emailHidden")}
                      </p>
                    </div>
                    <StatusPill status={item.status} label={t(`reminder.status.${item.status}`)} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("reminder.kindLabel")}</dt>
                      <dd className="mt-0.5">{t(`reminder.kind.${item.kind}`)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("reminder.time")}</dt>
                      <dd className="mt-0.5">
                        {formatDate(
                          item.sentAt ?? item.nextAttemptAt,
                          summary?.timezone ?? "Asia/Ho_Chi_Minh",
                          language,
                          t("reminder.notSet"),
                        )}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">{t("reminder.result")}</dt>
                      <dd className="mt-0.5 break-words text-muted-foreground">
                        {item.lastErrorCode ??
                          (item.sentAt
                            ? t("reminder.sentAttempts", { count: item.attemptCount })
                            : t("reminder.waitingWorker"))}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>
                {t("reminder.pageSummary", { page: history.page, count: history.totalCount })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
                  disabled={history.page <= 1}
                >
                  {t("reminder.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageNumber((current) => current + 1)}
                  disabled={history.page * history.pageSize >= history.totalCount}
                >
                  {t("reminder.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="text-xs leading-5 text-muted-foreground sm:text-sm">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</dd>
    </div>
  );
}

function StatusPill({ status, label }: { status: RsvpReminderStatus; label: string }) {
  const color =
    status === "SENT"
      ? "bg-green-100 text-green-900"
      : status === "FAILED"
        ? "bg-red-100 text-red-900"
        : status === "CANCELLED"
          ? "bg-muted text-muted-foreground"
          : "bg-amber-100 text-amber-950";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
