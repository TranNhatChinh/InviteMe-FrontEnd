"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check, LockKeyhole, RotateCcw, Users, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { useLocale } from "@/i18n/language-context";
import { formatDate, formatNumber } from "@/i18n/format";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { trapDialogFocus } from "@/shared/lib/dialog-focus";
import {
  acknowledgeRsvpOverLimit,
  getHostRsvp,
  hostRsvpKeys,
  lockRsvps,
  saveHostRsvp,
  type RsvpGuestRow,
} from "../api/host-rsvp.api";
import { RSVP_MAX_PARTY_SIZE, type Rsvp, type RsvpDecision } from "../api/rsvp.api";

type Confirmation = "close" | "reset-form" | "navigate-requests" | null;
const fieldClass = "h-10 w-full rounded-lg border bg-background px-3 text-sm";

type HostRsvpDetailDrawerProps = {
  weddingId: string;
  guest: RsvpGuestRow;
  editable: boolean;
  close: () => void;
};

function statusTone(status: string) {
  if (status === "ATTENDING") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "DECLINED") return "border-slate-200 bg-slate-100 text-slate-700";
  if (status === "MAYBE") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-sky-200 bg-sky-50 text-sky-900";
}

function message(error: unknown, t: (key: string) => string) {
  if (error instanceof ApiError) {
    if (error.backendCode === "CONCURRENCY_CONFLICT") return t("hostRsvp.errors.conflict");
    if (error.backendCode === "RSVP_NOT_ATTENDING") return t("hostRsvp.errors.notAttending");
    if (error.status === 403) return t("hostRsvp.errors.forbidden");
  }
  return t("hostRsvp.errors.generic");
}

export function HostRsvpDetailDrawer({
  weddingId,
  guest,
  editable,
  close,
}: HostRsvpDetailDrawerProps) {
  const { t } = useTranslation("guests");
  const { language } = useLocale();
  const { api } = useRuntime();
  const router = useRouter();
  const cache = useQueryClient();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const confirmationTitleId = useId();
  const detailKey = hostRsvpKeys.detail(weddingId, guest.guestId);
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: ({ signal }) => getHostRsvp(api, weddingId, guest.guestId, signal),
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  function requestClose() {
    if (saving) return;
    if (formDirty) {
      setConfirmation("close");
      return;
    }
    setConfirmation(null);
    close();
  }

  function requestResetForm() {
    if (formDirty && !conflict) setConfirmation("reset-form");
  }

  function confirmDiscard() {
    if (saving) return;
    const action = confirmation;
    setConfirmation(null);
    setFormDirty(false);
    setError("");
    if (action === "close") close();
    if (action === "reset-form") setFormRevision((revision) => revision + 1);
    if (action === "navigate-requests") {
      router.push(`/weddings/${encodeURIComponent(weddingId)}/waitlist`);
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      previousFocus?.focus();
    };
  }, []);

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
        t(locked ? "hostRsvp.lockedCount" : "hostRsvp.unlockedCount", {
          count: result.affected,
        }),
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

  async function reloadLatest() {
    setError("");
    const result = await detail.refetch();
    if (result.isSuccess && result.data) {
      setConflict(false);
      setNotice(t("hostRsvp.latestLoaded"));
      setFormDirty(false);
      setFormRevision((revision) => revision + 1);
      await cache.invalidateQueries({ queryKey: hostRsvpKeys.all(weddingId) });
    } else if (result.error) {
      setError(message(result.error, t));
    }
  }

  async function saveAnswer(answer: Rsvp) {
    cache.setQueryData(detailKey, answer);
    setFormDirty(false);
    setConflict(false);
    setNotice(t("hostRsvp.responseSavedForGuest"));
    setError("");
    await cache.invalidateQueries({ queryKey: hostRsvpKeys.all(weddingId) });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onKeyDown={trapDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        if (confirmation) setConfirmation(null);
        else requestClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          requestClose();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-[100dvh] max-h-[100dvh] w-full max-w-none overflow-hidden border-0 border-l border-foreground/10 bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/25 open:flex open:flex-col sm:w-[min(100vw,30rem)]"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-foreground/10 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("hostRsvp.detailEyebrow")}
          </p>
          <h2 id={titleId} className="mt-1 truncate font-display text-2xl">
            {guest.recipientName}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(guest.rsvpStatus)}`}
            >
              {t(`hostRsvp.status.${guest.rsvpStatus}`, { defaultValue: guest.rsvpStatus })}
            </span>
            {guest.pendingRequest && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                {t("hostRsvp.pendingChange")}
              </span>
            )}
            {guest.overLimit && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                {t("hostRsvp.overLimitBadge")}
              </span>
            )}
            {guest.locked && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {t("hostRsvp.locked")}
              </span>
            )}
          </div>
        </div>
        <Button
          ref={closeButtonRef}
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={t("hostRsvp.close")}
          disabled={saving}
          onClick={requestClose}
        >
          <X className="size-5" aria-hidden="true" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {notice && (
          <p role="status" className="mb-4 rounded-xl border bg-muted/50 p-3 text-sm">
            {notice}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            {error}
          </p>
        )}
        {conflict && (
          <section className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p>{t("hostRsvp.conflictReloadHint")}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={detail.isFetching}
              onClick={() => void reloadLatest()}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {t("hostRsvp.reloadLatest")}
            </Button>
          </section>
        )}

        {confirmation && (
          <section
            role="alert"
            aria-labelledby={confirmationTitleId}
            className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
          >
            <h3 id={confirmationTitleId} className="font-semibold">
              {t("hostRsvp.discardChangesTitle")}
            </h3>
            <p className="mt-2 text-sm">{t("hostRsvp.discardChangesDescription")}</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setConfirmation(null)}
              >
                {t("hostRsvp.continueEditing")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={confirmDiscard}
              >
                {t("hostRsvp.discardChanges")}
              </Button>
            </div>
          </section>
        )}

        {detail.isPending && <LoadingState label={t("hostRsvp.loadingRsvp")} />}
        {detail.isError && <ErrorState error={detail.error} retry={() => void detail.refetch()} />}
        {detail.data && (
          <div className="space-y-5">
            <section className="rounded-2xl border bg-background p-4">
              <h3 className="font-semibold">{t("hostRsvp.responseOverview")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("hostRsvp.detailSummary", {
                  status: t(`rsvp.status.${detail.data.status}`),
                  people: formatNumber(detail.data.partySize, language),
                  places: formatNumber(detail.data.places.length, language),
                  max: formatNumber(detail.data.maxPeople, language),
                })}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/60 p-3">
                  <p className="text-xs text-muted-foreground">{t("hostRsvp.attendingCount")}</p>
                  <p className="mt-1 font-semibold">
                    {formatNumber(detail.data.partySize, language)} /{" "}
                    {formatNumber(detail.data.maxPeople, language)}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/60 p-3">
                  <p className="text-xs text-muted-foreground">{t("hostRsvp.deadlineLabel")}</p>
                  <p className="mt-1 font-semibold">
                    {detail.data.rsvpDeadline
                      ? formatDate(detail.data.rsvpDeadline, language, { dateStyle: "medium" })
                      : t("hostRsvp.notSet")}
                  </p>
                </div>
              </div>
              {detail.data.updatedAt && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("hostRsvp.updatedAt", {
                    date: formatDate(detail.data.updatedAt, language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
                </p>
              )}
            </section>

            <section className="rounded-2xl border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Users className="size-4" aria-hidden="true" /> {t("hostRsvp.participants")}
                </h3>
                <span className="text-sm text-muted-foreground">
                  {formatNumber(detail.data.participants.length, language)}
                </span>
              </div>
              {detail.data.participants.length ? (
                <ul className="mt-3 space-y-2">
                  {detail.data.participants.map((person) => (
                    <li
                      key={person.id}
                      className="flex items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{person.fullName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{person.role}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${statusTone(person.attendanceStatus)}`}
                      >
                        {t(`rsvp.status.${person.attendanceStatus}`, {
                          defaultValue: person.attendanceStatus,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">{t("hostRsvp.noParticipants")}</p>
              )}
            </section>

            {(detail.data.note || detail.data.dietaryNote) && (
              <section className="space-y-3 rounded-2xl border bg-background p-4">
                <h3 className="font-semibold">{t("hostRsvp.guestNotes")}</h3>
                {detail.data.note && (
                  <p className="whitespace-pre-wrap text-sm">
                    <span className="font-medium">{t("hostRsvp.note")}:</span> {detail.data.note}
                  </p>
                )}
                {detail.data.dietaryNote && (
                  <p className="whitespace-pre-wrap text-sm">
                    <span className="font-medium">{t("hostRsvp.dietaryNote")}:</span>{" "}
                    {detail.data.dietaryNote}
                  </p>
                )}
              </section>
            )}

            {detail.data.pendingRequest && (
              <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                <p>{t("hostRsvp.guestPendingChange")}</p>
                <Link
                  href={`/weddings/${encodeURIComponent(weddingId)}/waitlist`}
                  className="mt-2 inline-block font-medium underline underline-offset-4"
                  onClick={(event) => {
                    if (saving) {
                      event.preventDefault();
                    } else if (formDirty) {
                      event.preventDefault();
                      setConfirmation("navigate-requests");
                    }
                  }}
                >
                  {t("hostRsvp.openChangeRequests")}
                </Link>
              </section>
            )}

            {detail.data.overLimit && (
              <section className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                <p className="min-w-0 flex-1">
                  {t("hostRsvp.overLimitDetail", {
                    people: detail.data.partySize,
                    max: detail.data.maxPeople,
                  })}
                </p>
                {editable && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving || formDirty}
                    onClick={() => void acknowledge()}
                  >
                    <Check className="size-4" aria-hidden="true" />
                    {t("hostRsvp.acknowledge")}
                  </Button>
                )}
              </section>
            )}

            {editable && (
              <section className="space-y-3 rounded-2xl border bg-background p-4">
                <div>
                  <h3 className="font-semibold">{t("hostRsvp.accessControls")}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("hostRsvp.accessControlsHelp")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={saving || formDirty}
                    onClick={() => void setLock(!detail.data.locked)}
                  >
                    <LockKeyhole className="size-4" aria-hidden="true" />
                    {detail.data.locked
                      ? t("hostRsvp.unlockInvitation")
                      : t("hostRsvp.lockInvitation")}
                  </Button>
                  {guest.groupId && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving || formDirty}
                        onClick={() => void setLock(true, true)}
                      >
                        {t("hostRsvp.lockGroup")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving || formDirty}
                        onClick={() => void setLock(false, true)}
                      >
                        {t("hostRsvp.unlockGroup")}
                      </Button>
                    </>
                  )}
                </div>
              </section>
            )}

            {editable && (
              <HostAnswerForm
                key={`${detail.data.version}-${formRevision}`}
                weddingId={weddingId}
                guestId={guest.guestId}
                rsvp={detail.data}
                dirtyChanged={setFormDirty}
                requestReset={requestResetForm}
                saved={(answer) => void saveAnswer(answer)}
                failed={(cause) =>
                  setError(typeof cause === "string" && cause.length === 0 ? "" : message(cause, t))
                }
                conflicted={() => setConflict(true)}
                conflictedState={conflict}
              />
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}

function HostAnswerForm({
  weddingId,
  guestId,
  rsvp,
  dirtyChanged,
  requestReset,
  saved,
  failed,
  conflicted,
  conflictedState,
}: {
  weddingId: string;
  guestId: string;
  rsvp: Rsvp;
  dirtyChanged: (dirty: boolean) => void;
  requestReset: () => void;
  saved: (answer: Rsvp) => void;
  failed: (error: unknown) => void;
  conflicted: () => void;
  conflictedState: boolean;
}) {
  const { t } = useTranslation("guests");
  const { api } = useRuntime();
  const initialDecision: RsvpDecision = rsvp.status === "PENDING" ? "ATTENDING" : rsvp.status;
  const initialPeople = String(rsvp.partySize || Math.max(1, rsvp.places.length));
  const [decision, setDecision] = useState<RsvpDecision>(initialDecision);
  const [people, setPeople] = useState(initialPeople);
  const [note, setNote] = useState(rsvp.note ?? "");
  const [source, setSource] = useState<"PHONE" | "CHAT" | "IN_PERSON" | "OTHER">("PHONE");
  const [saving, setSaving] = useState(false);
  const comes = decision !== "DECLINED";
  const dirty =
    decision !== initialDecision ||
    people !== initialPeople ||
    note !== (rsvp.note ?? "") ||
    source !== "PHONE";

  useEffect(() => {
    dirtyChanged(dirty);
    return () => dirtyChanged(false);
  }, [dirty, dirtyChanged]);

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
      const answer = await saveHostRsvp(api, weddingId, guestId, {
        expectedVersion: rsvp.version,
        decision,
        partySize: comes ? count : null,
        note: note.trim(),
        source,
      });
      saved(answer);
    } catch (cause) {
      failed(cause);
      if (cause instanceof ApiError && cause.backendCode === "CONCURRENCY_CONFLICT") {
        conflicted();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-4 rounded-2xl border border-primary/20 bg-background p-4"
      onSubmit={(event) => void submit(event)}
      aria-busy={saving}
    >
      <div>
        <h3 className="font-semibold">{t("hostRsvp.enterForGuest")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("hostRsvp.editResponseHelp")}</p>
      </div>
      <fieldset disabled={saving || conflictedState} className="space-y-4">
        <legend className="text-sm font-medium">{t("rsvp.decisionLabel")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["ATTENDING", "MAYBE", "DECLINED"] as const).map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name={`host-decision-${guestId}`}
                checked={decision === value}
                onChange={() => setDecision(value)}
              />
              {t(`rsvp.status.${value}`)}
            </label>
          ))}
        </div>
        {comes && (
          <label className="block text-sm">
            {t(decision === "MAYBE" ? "rsvp.maybePeopleLabel" : "rsvp.peopleLabel")}
            <input
              type="number"
              min={1}
              max={RSVP_MAX_PARTY_SIZE}
              className={`${fieldClass} mt-1 max-w-40`}
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
            rows={3}
          />
        </label>
        <label className="block text-sm">
          {t("hostRsvp.responseSource")}
          <select
            className={`${fieldClass} mt-1`}
            value={source}
            onChange={(event) => setSource(event.target.value as typeof source)}
          >
            <option value="PHONE">{t("hostRsvp.sources.PHONE")}</option>
            <option value="CHAT">{t("hostRsvp.sources.CHAT")}</option>
            <option value="IN_PERSON">{t("hostRsvp.sources.IN_PERSON")}</option>
            <option value="OTHER">{t("hostRsvp.sources.OTHER")}</option>
          </select>
        </label>
      </fieldset>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur">
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || saving || conflictedState}
          onClick={requestReset}
        >
          {t("hostRsvp.discardChanges")}
        </Button>
        <Button type="submit" disabled={!dirty || saving || conflictedState}>
          {saving ? t("hostRsvp.saving") : t("hostRsvp.saveForGuest")}
        </Button>
      </div>
    </form>
  );
}
