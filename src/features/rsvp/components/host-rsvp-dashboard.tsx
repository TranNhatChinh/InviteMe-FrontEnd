"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/language-context";
import { formatDate, formatNumber } from "@/i18n/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { usePermission } from "@/shared/components/permission-guard";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import {
  exportRsvpGuests,
  getRsvpDashboard,
  getRsvpSettings,
  hostRsvpKeys,
  listRsvpGuests,
  saveRsvpSettings,
  type RsvpGuestRow,
  type RsvpListStatus,
  type RsvpSettings,
} from "../api/host-rsvp.api";
import { HostRsvpDetailDrawer } from "./host-rsvp-detail-drawer";

const statusOptions: (RsvpListStatus | "")[] = [
  "",
  "NOT_RESPONDED",
  "ATTENDING",
  "MAYBE",
  "DECLINED",
  "NEEDS_ACTION",
];
const fieldClass = "h-10 w-full rounded-lg border bg-background px-3 text-sm";

function message(error: unknown, t: (key: string) => string) {
  if (error instanceof ApiError) {
    if (error.backendCode === "CONCURRENCY_CONFLICT") return t("hostRsvp.errors.conflict");
    if (error.backendCode === "RSVP_NOT_ATTENDING") return t("hostRsvp.errors.notAttending");
    if (error.status === 403) return t("hostRsvp.errors.forbidden");
    return t("hostRsvp.errors.generic");
  }
  return t("hostRsvp.errors.generic");
}

export function HostRsvpDashboard({ weddingId }: { weddingId: string }) {
  const { t } = useTranslation("guests");
  const { language } = useLocale();
  const { api } = useRuntime();
  const cache = useQueryClient();
  const { can } = usePermission();
  const [status, setStatus] = useState<RsvpListStatus | "">("");
  const [search, setSearch] = useState("");
  const [side, setSide] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RsvpGuestRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState("");
  const filters = {
    status: status || undefined,
    search,
    side: side || undefined,
    page,
    pageSize: 25,
  };
  const summary = useQuery({
    queryKey: hostRsvpKeys.dashboard(weddingId, side || undefined),
    queryFn: ({ signal }) => getRsvpDashboard(api, weddingId, side || undefined, undefined, signal),
  });
  const guests = useQuery({
    queryKey: hostRsvpKeys.guests(weddingId, filters),
    queryFn: ({ signal }) => listRsvpGuests(api, weddingId, filters, signal),
  });
  const settings = useQuery({
    queryKey: hostRsvpKeys.settings(weddingId),
    queryFn: ({ signal }) => getRsvpSettings(api, weddingId, signal),
  });

  async function download() {
    setActionError("");
    setExporting(true);
    try {
      const blob = await exportRsvpGuests(api, weddingId, {
        status: status || undefined,
        search,
        side: side || undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "rsvp.csv";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setActionError(message(error, t));
    } finally {
      setExporting(false);
    }
  }

  const stats = summary.data;
  return (
    <div className="space-y-8">
      <PageHeader
        title={t("hostRsvp.title")}
        description={t("hostRsvp.description")}
        action={
          <Button variant="outline" disabled={exporting} onClick={() => void download()}>
            {exporting ? t("hostRsvp.exporting") : t("hostRsvp.exportCsv")}
          </Button>
        }
      />
      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {actionError}
        </p>
      )}
      {summary.isPending && <LoadingState label={t("hostRsvp.loadingSummary")} />}
      {summary.isError && <ErrorState error={summary.error} retry={() => void summary.refetch()} />}
      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              t("hostRsvp.respondedInvitations"),
              `${formatNumber(stats.invitations.invited - stats.invitations.notResponded, language)}/${formatNumber(stats.invitations.invited, language)}`,
            ],
            [t("hostRsvp.expectedGuests"), formatNumber(stats.people.expected, language)],
            [
              t("hostRsvp.capacityRemaining"),
              stats.capacity.remaining === null
                ? t("hostRsvp.unlimited")
                : formatNumber(stats.capacity.remaining, language),
            ],
            [t("hostRsvp.needsAction"), formatNumber(stats.needsAction.invitations, language)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <strong className="mt-2 block text-3xl">{value}</strong>
            </div>
          ))}
          <p className="col-span-full text-sm text-muted-foreground">
            {t("hostRsvp.summaryFootnote", {
              notResponded: formatNumber(stats.invitations.notResponded, language),
              maybe: formatNumber(stats.invitations.maybe, language),
              maybePeople: formatNumber(stats.people.maybe, language),
              declined: formatNumber(stats.invitations.declined, language),
              locked: formatNumber(stats.lockedGuests, language),
            })}
          </p>
          {(stats.capacity.overCapacity || stats.capacity.maybeMayExceed) && (
            <p className="col-span-full rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {stats.capacity.overCapacity
                ? t("hostRsvp.overCapacity", {
                    count: formatNumber(stats.capacity.overBy, language),
                  })
                : t("hostRsvp.maybeMayExceed")}
            </p>
          )}
        </div>
      )}
      {settings.data && (
        <SettingsEditor
          key={settings.data.version}
          weddingId={weddingId}
          settings={settings.data}
          editable={can("GUEST_EDIT")}
        />
      )}
      {settings.isError && (
        <ErrorState error={settings.error} retry={() => void settings.refetch()} />
      )}
      <section className="space-y-4">
        <h2 className="font-display text-2xl">{t("hostRsvp.invitationList")}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            className={fieldClass}
            aria-label={t("hostRsvp.searchGuest")}
            placeholder={t("hostRsvp.searchPlaceholder")}
            value={search}
            maxLength={100}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            className={fieldClass}
            aria-label={t("hostRsvp.filterStatus")}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as RsvpListStatus | "");
              setPage(1);
            }}
          >
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {t(`hostRsvp.status.${value || "ALL"}`)}
              </option>
            ))}
          </select>
          <select
            className={fieldClass}
            aria-label={t("hostRsvp.filterSide")}
            value={side}
            onChange={(event) => {
              setSide(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("hostRsvp.sides.ALL")}</option>
            <option value="BRIDE">{t("planning.sideValues.BRIDE")}</option>
            <option value="GROOM">{t("planning.sideValues.GROOM")}</option>
            <option value="MUTUAL">{t("planning.sideValues.MUTUAL")}</option>
            <option value="UNSPECIFIED">{t("planning.sideValues.UNSPECIFIED")}</option>
          </select>
        </div>
        {guests.isPending && <LoadingState label={t("hostRsvp.loadingGuests")} />}
        {guests.isError && <ErrorState error={guests.error} retry={() => void guests.refetch()} />}
        {guests.data && (
          <>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3">{t("hostRsvp.columns.recipient")}</th>
                    <th className="p-3">{t("hostRsvp.columns.status")}</th>
                    <th className="p-3">{t("hostRsvp.columns.attending")}</th>
                    <th className="p-3">{t("hostRsvp.columns.maybe")}</th>
                    <th className="p-3">{t("hostRsvp.columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {guests.data.items.map((guest) => (
                    <tr
                      key={guest.guestId}
                      data-selected={selected?.guestId === guest.guestId ? "true" : undefined}
                      className={`border-t transition-colors ${selected?.guestId === guest.guestId ? "bg-primary/5" : "hover:bg-muted/40"}`}
                    >
                      <td className="p-3 font-medium">
                        {guest.recipientName}
                        <small className="block font-normal text-muted-foreground">
                          {t(`planning.sideValues.${guest.side}`, { defaultValue: guest.side })}
                          {guest.groupName ? ` · ${guest.groupName}` : ""}
                        </small>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${guest.rsvpStatus === "ATTENDING" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : guest.rsvpStatus === "DECLINED" ? "border-slate-200 bg-slate-100 text-slate-700" : guest.rsvpStatus === "MAYBE" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}
                        >
                          {t(`hostRsvp.status.${guest.rsvpStatus}`, {
                            defaultValue: guest.rsvpStatus,
                          })}
                        </span>
                        <div className="mt-1 flex flex-wrap gap-1 text-xs">
                          {guest.overLimit && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
                              {t("hostRsvp.overLimitBadge")}
                            </span>
                          )}
                          {guest.pendingRequest && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
                              {t("hostRsvp.pendingChange")}
                            </span>
                          )}
                          {guest.locked && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                              {t("hostRsvp.locked")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {guest.people} / {guest.maxPeople}
                      </td>
                      <td className="p-3">{guest.maybePeople || "—"}</td>
                      <td className="p-3">
                        <Button size="sm" variant="outline" onClick={() => setSelected(guest)}>
                          {t("hostRsvp.viewRsvp")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {guests.data.items.length === 0 && (
                <p className="p-6 text-center text-muted-foreground">
                  {t("hostRsvp.noInvitations")}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>
                {t("hostRsvp.invitationCount", {
                  count: formatNumber(guests.data.totalCount, language),
                })}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t("hostRsvp.previous")}
                </Button>
                <span className="self-center">{t("hostRsvp.page", { page })}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page * 25 >= guests.data.totalCount}
                  onClick={() => setPage(page + 1)}
                >
                  {t("hostRsvp.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
      {selected && (
        <HostRsvpDetailDrawer
          key={selected.guestId}
          weddingId={weddingId}
          guest={selected}
          editable={can("GUEST_EDIT")}
          close={() => {
            setSelected(null);
            void cache.invalidateQueries({ queryKey: hostRsvpKeys.all(weddingId) });
          }}
        />
      )}
    </div>
  );
}

function SettingsEditor({
  weddingId,
  settings,
  editable,
}: {
  weddingId: string;
  settings: RsvpSettings;
  editable: boolean;
}) {
  const { t } = useTranslation("guests");
  const { language } = useLocale();
  const { api } = useRuntime();
  const cache = useQueryClient();
  const [limit, setLimit] = useState(settings.plusOneLimit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="font-display text-xl">{t("hostRsvp.rulesTitle")}</h2>
      <p className="text-sm">
        {t("hostRsvp.deadlineLabel")}:{" "}
        {settings.rsvpDeadline
          ? formatDate(settings.rsvpDeadline, language, { dateStyle: "medium", timeStyle: "short" })
          : t("hostRsvp.notSet")}
        . {t("hostRsvp.deadlineHelp")}
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSaving(true);
          setError("");
          void saveRsvpSettings(api, weddingId, settings.version, limit)
            .then(() => cache.invalidateQueries({ queryKey: hostRsvpKeys.all(weddingId) }))
            .catch((cause) => setError(message(cause, t)))
            .finally(() => setSaving(false));
        }}
      >
        <label className="text-sm">
          {t("hostRsvp.plusOneLimit")}
          <input
            className={`${fieldClass} mt-1 w-44`}
            type="number"
            min={0}
            max={20}
            value={limit}
            disabled={!editable}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
        </label>
        {editable && (
          <Button disabled={saving || limit === settings.plusOneLimit} type="submit">
            {t("hostRsvp.saveLimit")}
          </Button>
        )}
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
