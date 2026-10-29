"use client";

import { useState, type FormEvent } from "react";
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
  acknowledgeRsvpOverLimit,
  exportRsvpGuests,
  getHostRsvp,
  getRsvpDashboard,
  getRsvpSettings,
  hostRsvpKeys,
  listRsvpGuests,
  lockRsvps,
  saveHostRsvp,
  saveRsvpSettings,
  type RsvpGuestRow,
  type RsvpListStatus,
  type RsvpSettings,
} from "../api/host-rsvp.api";
import { RSVP_MAX_PARTY_SIZE, type RsvpDecision } from "../api/rsvp.api";

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
                    <tr key={guest.guestId} className="border-t">
                      <td className="p-3 font-medium">
                        {guest.recipientName}
                        {guest.groupName && (
                          <small className="block text-muted-foreground">{guest.groupName}</small>
                        )}
                      </td>
                      <td className="p-3">
                        {t(`hostRsvp.status.${guest.rsvpStatus}`, {
                          defaultValue: guest.rsvpStatus,
                        })}
                        {guest.overLimit && (
                          <small className="block text-amber-800">
                            {t("hostRsvp.overLimitBadge")}
                          </small>
                        )}
                        {guest.pendingRequest && (
                          <small className="block text-amber-800">
                            {t("hostRsvp.pendingChange")}
                          </small>
                        )}
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
        <HostRsvpDetail
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

function HostRsvpDetail({
  weddingId,
  guest,
  editable,
  close,
}: {
  weddingId: string;
  guest: RsvpGuestRow;
  editable: boolean;
  close: () => void;
}) {
  const { t } = useTranslation("guests");
  const { api } = useRuntime();
  const cache = useQueryClient();
  const detail = useQuery({
    queryKey: hostRsvpKeys.detail(weddingId, guest.guestId),
    queryFn: ({ signal }) => getHostRsvp(api, weddingId, guest.guestId, signal),
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  async function setLock(locked: boolean, group = false) {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const result = await lockRsvps(
        api,
        weddingId,
        locked,
        group ? undefined : [guest.guestId],
        group ? (guest.groupId ?? undefined) : undefined,
      );
      setNotice(
        t(locked ? "hostRsvp.lockedCount" : "hostRsvp.unlockedCount", { count: result.affected }),
      );
      await cache.invalidateQueries({ queryKey: hostRsvpKeys.all(weddingId) });
    } catch (cause) {
      setError(message(cause, t));
    } finally {
      setSaving(false);
    }
  }
  async function acknowledge() {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      await acknowledgeRsvpOverLimit(api, weddingId, guest.guestId);
      setNotice(t("hostRsvp.acknowledged"));
      await cache.invalidateQueries({ queryKey: hostRsvpKeys.all(weddingId) });
    } catch (cause) {
      setError(message(cause, t));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-5"
      aria-label={t("hostRsvp.guestRsvp", { name: guest.recipientName })}
    >
      <div className="flex justify-between gap-3">
        <h2 className="font-display text-2xl">{guest.recipientName}</h2>
        <Button variant="ghost" onClick={close}>
          {t("hostRsvp.close")}
        </Button>
      </div>
      {detail.isPending && <LoadingState label={t("hostRsvp.loadingRsvp")} />}
      {detail.isError && <ErrorState error={detail.error} retry={() => void detail.refetch()} />}
      {detail.data && (
        <>
          <p className="text-sm">
            {t("hostRsvp.detailSummary", {
              status: t(`rsvp.status.${detail.data.status}`),
              people: detail.data.partySize,
              places: detail.data.places.length,
              max: detail.data.maxPeople,
            })}
            {detail.data.locked ? ` · ${t("hostRsvp.locked")}` : ""}
          </p>
          <ul className="space-y-1 text-sm">
            {detail.data.participants.map((person) => (
              <li key={person.id}>
                {person.fullName} —{" "}
                {t(`hostRsvp.status.${person.attendanceStatus}`, {
                  defaultValue: person.attendanceStatus,
                })}
              </li>
            ))}
          </ul>
          {detail.data.pendingRequest && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm">{t("hostRsvp.guestPendingChange")}</p>
          )}
          {detail.data.overLimit && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <span className="flex-1">
                {t("hostRsvp.overLimitDetail", {
                  people: detail.data.partySize,
                  max: detail.data.maxPeople,
                })}
              </span>
              {editable && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void acknowledge()}
                >
                  {t("hostRsvp.acknowledge")}
                </Button>
              )}
            </div>
          )}
          {editable && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void setLock(!detail.data.locked)}
                >
                  {detail.data.locked
                    ? t("hostRsvp.unlockInvitation")
                    : t("hostRsvp.lockInvitation")}
                </Button>
                {guest.groupId && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void setLock(true, true)}
                    >
                      {t("hostRsvp.lockGroup")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void setLock(false, true)}
                    >
                      {t("hostRsvp.unlockGroup")}
                    </Button>
                  </>
                )}
              </div>
              <HostAnswerForm
                key={detail.data.version}
                weddingId={weddingId}
                guestId={guest.guestId}
                rsvp={detail.data}
                saved={() => {
                  setNotice(t("hostRsvp.responseSavedForGuest"));
                  void cache.invalidateQueries({ queryKey: hostRsvpKeys.all(weddingId) });
                }}
                failed={setError}
              />
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-green-800">
          {notice}
        </p>
      )}
    </section>
  );
}

function HostAnswerForm({
  weddingId,
  guestId,
  rsvp,
  saved,
  failed,
}: {
  weddingId: string;
  guestId: string;
  rsvp: Awaited<ReturnType<typeof getHostRsvp>>;
  saved: () => void;
  failed: (error: string) => void;
}) {
  const { t } = useTranslation("guests");
  const { api } = useRuntime();
  const [decision, setDecision] = useState<RsvpDecision>(
    rsvp.status === "PENDING" ? "ATTENDING" : rsvp.status,
  );
  const [people, setPeople] = useState(String(rsvp.partySize || Math.max(1, rsvp.places.length)));
  const [note, setNote] = useState(rsvp.note ?? "");
  const [source, setSource] = useState<"PHONE" | "CHAT" | "IN_PERSON" | "OTHER">("PHONE");
  const [saving, setSaving] = useState(false);
  const comes = decision !== "DECLINED";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    failed("");
    const count = Number(people);
    if (comes && !(Number.isInteger(count) && count >= 1 && count <= RSVP_MAX_PARTY_SIZE)) {
      failed(t("rsvp.errors.partySize", { max: RSVP_MAX_PARTY_SIZE }));
      return;
    }
    setSaving(true);
    try {
      await saveHostRsvp(api, weddingId, guestId, {
        expectedVersion: rsvp.version,
        decision,
        partySize: comes ? count : null,
        note: note.trim(),
        source,
      });
      saved();
    } catch (error) {
      failed(
        error instanceof ApiError && error.backendCode === "CONCURRENCY_CONFLICT"
          ? t("hostRsvp.errors.conflict")
          : t("hostRsvp.errors.generic"),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="space-y-3 border-t pt-4" onSubmit={(event) => void submit(event)}>
      <h3 className="font-medium">{t("hostRsvp.enterForGuest")}</h3>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="sr-only">{t("rsvp.decisionLabel")}</legend>
        {(["ATTENDING", "MAYBE", "DECLINED"] as const).map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="host-decision"
              checked={decision === value}
              onChange={() => setDecision(value)}
            />
            {t(`rsvp.status.${value}`)}
          </label>
        ))}
      </fieldset>
      {comes && (
        <label className="block text-sm">
          {t(decision === "MAYBE" ? "rsvp.maybePeopleLabel" : "rsvp.peopleLabel")}
          <input
            type="number"
            min={1}
            max={RSVP_MAX_PARTY_SIZE}
            className={`${fieldClass} mt-1 max-w-32`}
            value={people}
            onChange={(event) => setPeople(event.target.value)}
          />
        </label>
      )}
      <label className="block text-sm">
        {t("hostRsvp.note")}
        <textarea
          className="mt-1 w-full rounded-lg border bg-background p-3"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          rows={2}
        />
      </label>
      <label className="block text-sm">
        {t("hostRsvp.responseSource")}
        <select
          className={`${fieldClass} mt-1 max-w-xs`}
          value={source}
          onChange={(event) => setSource(event.target.value as typeof source)}
        >
          <option value="PHONE">{t("hostRsvp.sources.PHONE")}</option>
          <option value="CHAT">{t("hostRsvp.sources.CHAT")}</option>
          <option value="IN_PERSON">{t("hostRsvp.sources.IN_PERSON")}</option>
          <option value="OTHER">{t("hostRsvp.sources.OTHER")}</option>
        </select>
      </label>
      <Button type="submit" disabled={saving}>
        {saving ? t("hostRsvp.saving") : t("hostRsvp.saveForGuest")}
      </Button>
    </form>
  );
}
