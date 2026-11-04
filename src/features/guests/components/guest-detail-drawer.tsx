"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Archive, Copy, ExternalLink, Mail, Phone, RotateCcw, Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/core/api/api-error";
import { useLocale } from "@/i18n/language-context";
import { formatNumber } from "@/i18n/format";
import { Button } from "@/shared/ui/button";
import { trapDialogFocus } from "@/shared/lib/dialog-focus";
import type { PlanningDetail, PlanningGuestUpdate } from "../api/planning.api";
import { PlanningGuestEditForm } from "./planning-guest-edit-form";

type Confirmation = "archive" | "restore" | "discard-close" | "discard-edit" | null;

type GuestDetailDrawerProps = {
  open: boolean;
  guest: PlanningDetail | undefined;
  loading: boolean;
  error: unknown;
  editing: boolean;
  canEdit: boolean;
  canSendInvitation: boolean;
  groups: { id: string; name: string }[];
  groupsLoading: boolean;
  groupsError: boolean;
  busy: boolean;
  archiving: boolean;
  restoring: boolean;
  notice: string;
  onClose: () => void;
  onRetry: () => void;
  onRetryGroups: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (input: PlanningGuestUpdate) => void;
  onArchive: () => void;
  onRestore: () => void;
  onCopyInvitation: (path: string) => void;
};

function rsvpTone(status: string) {
  if (status === "ATTENDING") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "DECLINED") return "border-slate-200 bg-slate-100 text-slate-700";
  if (status === "WAITLISTED") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-sky-200 bg-sky-50 text-sky-900";
}

export function GuestDetailDrawer({
  open,
  guest,
  loading,
  error,
  editing,
  canEdit,
  canSendInvitation,
  groups,
  groupsLoading,
  groupsError,
  busy,
  archiving,
  restoring,
  notice,
  onClose,
  onRetry,
  onRetryGroups,
  onStartEdit,
  onCancelEdit,
  onSave,
  onArchive,
  onRestore,
  onCopyInvitation,
}: GuestDetailDrawerProps) {
  const { t } = useTranslation("guestPlanning");
  const { language } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const confirmationTitleId = useId();
  const [dirty, setDirty] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const invitationPath = canSendInvitation ? guest?.invitationPath : undefined;

  function requestClose() {
    if (editing && dirty) {
      setConfirmation("discard-close");
      return;
    }
    setConfirmation(null);
    onClose();
  }

  function requestCancelEdit() {
    if (dirty) {
      setConfirmation("discard-edit");
      return;
    }
    onCancelEdit();
  }

  function confirmDiscard() {
    const action = confirmation;
    setConfirmation(null);
    setDirty(false);
    if (action === "discard-close") onClose();
    if (action === "discard-edit") onCancelEdit();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }

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
  }, [open]);

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
      className="fixed inset-y-0 right-0 left-auto m-0 h-[100dvh] max-h-[100dvh] w-full max-w-none overflow-hidden border-0 border-l border-foreground/10 bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/35 open:flex open:flex-col sm:w-[min(100vw,30rem)]"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-foreground/10 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("detail")}
          </p>
          <h2 id={titleId} className="mt-1 truncate font-display text-2xl">
            {guest?.recipientName ?? t("loading")}
          </h2>
          {guest && (
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${rsvpTone(guest.rsvpStatus ?? "PENDING")}`}
              >
                {t(`attendance.${guest.rsvpStatus ?? "PENDING"}`, {
                  defaultValue: guest.rsvpStatus ?? t("attendance.PENDING"),
                })}
              </span>
              {guest.archivedAt && (
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {t("archived")}
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          ref={closeButtonRef}
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={t("closeDetails")}
          onClick={requestClose}
        >
          <X className="size-5" aria-hidden="true" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {notice && (
          <p
            role="status"
            className="mb-4 rounded-xl border bg-muted/50 p-3 text-sm text-foreground"
          >
            {notice}
          </p>
        )}

        {confirmation && (
          <section
            role="alert"
            aria-labelledby={confirmationTitleId}
            className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
          >
            <h3 id={confirmationTitleId} className="font-semibold">
              {confirmation === "archive"
                ? t("archiveTitle")
                : confirmation === "restore"
                  ? t("restoreTitle")
                  : t("discardChangesTitle")}
            </h3>
            <p className="mt-2 text-sm">
              {confirmation === "archive"
                ? t("archiveDescription")
                : confirmation === "restore"
                  ? t("restoreDescription")
                  : t("discardChangesDescription")}
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmation(null)}>
                {confirmation.startsWith("discard-") ? t("continueEditing") : t("cancel")}
              </Button>
              {confirmation === "archive" ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={archiving}
                  onClick={() => {
                    setConfirmation(null);
                    onArchive();
                  }}
                >
                  <Archive className="size-4" aria-hidden="true" />
                  {archiving ? t("archiving") : t("archive")}
                </Button>
              ) : confirmation === "restore" ? (
                <Button
                  type="button"
                  disabled={restoring}
                  onClick={() => {
                    setConfirmation(null);
                    onRestore();
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {restoring ? t("restoring") : t("restore")}
                </Button>
              ) : (
                <Button type="button" variant="destructive" onClick={confirmDiscard}>
                  {t("discardChanges")}
                </Button>
              )}
            </div>
          </section>
        )}

        {loading && (
          <p role="status" className="py-8 text-center text-sm text-muted-foreground">
            {t("loading")}
          </p>
        )}
        {Boolean(error) && (
          <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">
            <p>
              {error instanceof ApiError && error.status === 404
                ? t("detailUnavailable")
                : t("detailLoadFailed")}
            </p>
            <Button type="button" className="mt-3" variant="outline" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        )}

        {guest &&
          !loading &&
          !error &&
          (editing && canEdit ? (
            groupsLoading ? (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                {t("loadingGroups")}
              </p>
            ) : groupsError ? (
              <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">
                <p>{t("groupsLoadFailed")}</p>
                <Button type="button" className="mt-3" variant="outline" onClick={onRetryGroups}>
                  {t("retry")}
                </Button>
              </div>
            ) : (
              <PlanningGuestEditForm
                key={`${guest.id}-${guest.version}`}
                guest={guest}
                groups={groups}
                busy={busy}
                onDirtyChange={setDirty}
                onCancel={requestCancelEdit}
                onSave={onSave}
              />
            )
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {canEdit && !guest.archivedAt && (
                  <Button type="button" onClick={onStartEdit}>
                    {t("edit")}
                  </Button>
                )}
                {invitationPath && (
                  <>
                    <Button type="button" variant="outline" asChild>
                      <a href={invitationPath} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-4" aria-hidden="true" />
                        {t("openInvitation")}
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("copyInvitationFor", { name: guest.recipientName })}
                      title={t("copyInvitation")}
                      onClick={() => onCopyInvitation(invitationPath)}
                    >
                      <Copy className="size-4" aria-hidden="true" />
                    </Button>
                  </>
                )}
                {canEdit && !guest.archivedAt && (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    disabled={archiving}
                    onClick={() => setConfirmation("archive")}
                  >
                    <Archive className="size-4" aria-hidden="true" />
                    {t("archive")}
                  </Button>
                )}
                {canEdit && guest.archivedAt && (
                  <Button
                    type="button"
                    disabled={restoring}
                    onClick={() => setConfirmation("restore")}
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    {t("restore")}
                  </Button>
                )}
              </div>

              <section
                aria-labelledby="guest-summary-title"
                className="rounded-2xl border bg-background p-4"
              >
                <h3 id="guest-summary-title" className="font-semibold">
                  {t("guestInformation")}
                </h3>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-muted/60 p-3">
                    <p className="text-xs text-muted-foreground">{t("expected")}</p>
                    <p className="mt-1 font-semibold">
                      {formatNumber(guest.expectedPeople, language)} {t("expectedPeople")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/60 p-3">
                    <p className="text-xs text-muted-foreground">{t("sideColumn")}</p>
                    <p className="mt-1 font-semibold">
                      {t(`sideValues.${guest.side}`, { defaultValue: guest.side })}
                    </p>
                  </div>
                </div>
                <dl className="mt-4 divide-y text-sm">
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt className="text-muted-foreground">{t("honorific")}</dt>
                    <dd className="text-right">{guest.honorific || t("notProvided")}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt className="text-muted-foreground">{t("group")}</dt>
                    <dd className="text-right">{guest.group?.name ?? t("notGrouped")}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-4" aria-hidden="true" /> {t("phone")}
                    </dt>
                    <dd className="text-right">{guest.phone || t("noPhone")}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-2 py-3">
                    <dt className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="size-4" aria-hidden="true" /> {t("email")}
                    </dt>
                    <dd className="break-all text-right">{guest.email || t("noEmail")}</dd>
                  </div>
                  <div className="py-3">
                    <dt className="text-muted-foreground">{t("note")}</dt>
                    <dd className="mt-1 whitespace-pre-wrap">{guest.note || t("noNote")}</dd>
                  </div>
                </dl>
              </section>

              <section
                aria-labelledby="guest-places-title"
                className="rounded-2xl border bg-background p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 id="guest-places-title" className="flex items-center gap-2 font-semibold">
                    <Users className="size-4" aria-hidden="true" /> {t("participants")}
                  </h3>
                  <span className="text-sm text-muted-foreground">
                    {formatNumber(guest.places.length, language)} /{" "}
                    {formatNumber(guest.expectedPeople, language)}
                  </span>
                </div>
                <ol className="mt-3 space-y-2">
                  {guest.places.map((place, index) => (
                    <li
                      key={place.id}
                      className="flex items-start justify-between gap-3 rounded-xl border p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{place.person?.fullName || t("unnamedPlace")}</p>
                        {place.person && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {place.person.role} ·{" "}
                            {t(`attendance.${place.person.attendanceStatus}`, {
                              defaultValue: place.person.attendanceStatus,
                            })}
                          </p>
                        )}
                        {!place.person && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("placeNumber", { number: formatNumber(index + 1, language) })}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          ))}
      </div>
    </dialog>
  );
}
