"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/core/api/api-error";
import { useRuntime } from "@/core/config/runtime";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import {
  createMyRsvp,
  getMyRsvp,
  replaceMyRsvp,
  RSVP_DIETARY_NOTE_MAX,
  RSVP_MAX_PARTY_SIZE,
  RSVP_NOTE_MAX,
  type Rsvp,
  type RsvpDecision,
} from "../api/rsvp.api";
import { getGuestSeats } from "../api/guest-seats.api";
import { useLocale } from "@/i18n/language-context";
import { formatDate } from "@/i18n/format";

const DECISIONS: RsvpDecision[] = ["ATTENDING", "MAYBE", "DECLINED"];

function guestError(error: unknown, t: (key: string) => string) {
  if (!(error instanceof ApiError)) return t("rsvp.errors.generic");
  if (error.backendCode === "INVITATION_UNAVAILABLE") return t("rsvp.errors.invitationUnavailable");
  if (error.status === 409) return t("rsvp.errors.conflict");
  if (error.status === 429) return t("rsvp.errors.tooManyRequests");
  if (error.status === 400) return t("rsvp.errors.invalidAnswer");
  return t("rsvp.errors.generic");
}

export function GuestRsvp({ token }: { token: string }) {
  const { t } = useTranslation("guests");
  const { api } = useRuntime();
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["guest-rsvp", token],
    queryFn: ({ signal }) => getMyRsvp(api, token, signal),
    retry: false,
    staleTime: 0,
  });
  const seats = useQuery({
    queryKey: ["guest-seats", token],
    queryFn: ({ signal }) => getGuestSeats(api, token, signal),
  });
  if (query.isPending) return <LoadingState label={t("rsvp.loading")} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.backendCode === "INVITATION_UNAVAILABLE")
      return <p className="rounded-xl bg-card p-6 text-center">{t("rsvp.unavailable")}</p>;
    return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  }
  const rsvp = query.data;
  return (
    <div className="space-y-5">
      <RsvpForm
        key={`${rsvp.version}:${rsvp.pendingRequest?.id ?? "none"}`}
        token={token}
        rsvp={rsvp}
        refresh={() => void query.refetch()}
        notice={notice}
        setNotice={setNotice}
        t={t}
      />
      {seats.data?.published && (
        <section className="rounded-2xl bg-card p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold">{t("yourTable")}</h2>
          <div className="mt-3 space-y-2">
            {seats.data.seats
              .filter((seat) => seat.status !== "UNUSED")
              .map((seat) => (
                <p key={seat.position} className="rounded-lg border p-3 text-sm">
                  {seat.personName ?? t("guestNumber", { number: seat.position })} ·{" "}
                  {seat.table
                    ? `${seat.table}${seat.seatNumber ? `, ${t("seatNumber", { number: seat.seatNumber })}` : ""}`
                    : t("notAssigned")}
                </p>
              ))}
            {seats.data.seats.every((seat) => seat.status === "UNUSED") && (
              <p className="text-sm text-muted-foreground">{t("noSeatYet")}</p>
            )}
          </div>
        </section>
      )}
      {seats.data && !seats.data.published && (
        <p className="text-center text-sm text-muted-foreground">{t("rsvp.seatingNotPublished")}</p>
      )}
    </div>
  );
}

function RsvpForm({
  token,
  rsvp,
  refresh,
  notice,
  setNotice,
  t,
}: {
  token: string;
  rsvp: Rsvp;
  refresh: () => void;
  notice: string;
  setNotice: (message: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const { api } = useRuntime();
  const { language } = useLocale();
  const cache = useQueryClient();
  const [decision, setDecision] = useState<RsvpDecision | "">(
    rsvp.rsvpId && rsvp.status !== "PENDING" ? rsvp.status : "",
  );
  const [people, setPeople] = useState(String(rsvp.partySize || Math.max(1, rsvp.places.length)));
  const [note, setNote] = useState(rsvp.note ?? "");
  const [dietary, setDietary] = useState(rsvp.dietaryNote ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const comes = decision === "ATTENDING" || decision === "MAYBE";
  const count = Number(people);
  const validCount = Number.isInteger(count) && count >= 1 && count <= RSVP_MAX_PARTY_SIZE;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!decision) {
      setError(t("rsvp.errors.chooseDecision"));
      return;
    }
    if (comes && !validCount) {
      setError(t("rsvp.errors.partySize", { max: RSVP_MAX_PARTY_SIZE }));
      return;
    }
    setSaving(true);
    try {
      const input = {
        expectedVersion: rsvp.version,
        decision,
        partySize: comes ? count : null,
        note: note.trim(),
        dietaryNote: dietary.trim(),
      };
      const result = rsvp.rsvpId
        ? await replaceMyRsvp(api, token, input)
        : await createMyRsvp(api, token, input);
      cache.setQueryData(["guest-rsvp", token], result.rsvp);
      void cache.invalidateQueries({ queryKey: ["guest-seats", token] });
      setNotice(
        result.queued
          ? t("rsvp.changeRequestSent")
          : (result.rsvp.thankYouMessage ?? t("rsvp.answerSaved")),
      );
      refresh();
    } catch (cause) {
      setError(guestError(cause, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/invite/${encodeURIComponent(token)}`}
        className="text-sm underline underline-offset-4"
      >
        {t("rsvp.backToInvitation")}
      </Link>
      <header className="text-center">
        <h1 className="text-3xl">{t("rsvp.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("rsvp.invitationFor", { name: rsvp.recipientName })}
        </p>
      </header>
      <form
        onSubmit={(event) => void submit(event)}
        className="space-y-5 rounded-2xl bg-card p-5 shadow-sm sm:p-7"
      >
        {rsvp.rsvpDeadline && (
          <p className="text-sm text-muted-foreground">
            {t("rsvp.deadline", {
              date: formatDate(rsvp.rsvpDeadline, language, {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </p>
        )}
        {rsvp.locked && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {t("rsvp.lockedHint")}
          </p>
        )}
        {rsvp.pendingRequest && (
          <p className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
            {t("rsvp.pendingChangeHint")}
          </p>
        )}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("rsvp.decisionLabel")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {DECISIONS.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-xl border bg-background p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="decision"
                  value={value}
                  checked={decision === value}
                  onChange={() => setDecision(value)}
                />
                {t(`rsvp.decision.${value}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {comes && (
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="rsvp-people">
              {t(decision === "MAYBE" ? "rsvp.maybePeopleLabel" : "rsvp.peopleLabel")}
            </label>
            <input
              id="rsvp-people"
              type="number"
              inputMode="numeric"
              min={1}
              max={RSVP_MAX_PARTY_SIZE}
              value={people}
              onChange={(event) => setPeople(event.target.value)}
              className="h-10 w-32 rounded-md border bg-background px-3 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t("rsvp.peopleHint", { max: rsvp.maxPeople })}
            </p>
            {validCount && rsvp.maxPeople > 0 && count > rsvp.maxPeople && (
              <p className="text-xs text-amber-900">
                {t("rsvp.overLimitHint", { max: rsvp.maxPeople })}
              </p>
            )}
          </div>
        )}
        {rsvp.rsvpId && (
          <p className="text-sm">
            {t("rsvp.currentStatus")}: <strong>{t(`rsvp.status.${rsvp.status}`)}</strong>
            {rsvp.partySize > 0 ? ` · ${t("rsvp.peopleCount", { count: rsvp.partySize })}` : ""}
          </p>
        )}
        {rsvp.message && <p className="text-sm text-muted-foreground">{rsvp.message}</p>}
        {decision !== "DECLINED" && (
          <div className="space-y-1">
            <label className="block text-sm font-medium" htmlFor="rsvp-dietary">
              {t("rsvp.dietaryLabel")}
            </label>
            <input
              id="rsvp-dietary"
              value={dietary}
              onChange={(event) => setDietary(event.target.value)}
              maxLength={RSVP_DIETARY_NOTE_MAX}
              placeholder={t("rsvp.dietaryPlaceholder")}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
          </div>
        )}
        <label className="block text-sm font-medium" htmlFor="rsvp-note">
          {t("rsvp.noteLabel")}
        </label>
        <textarea
          id="rsvp-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={RSVP_NOTE_MAX}
          rows={4}
          className="w-full rounded-md border bg-background p-3 text-sm"
          placeholder={t("rsvp.notePlaceholder")}
        />
        {error && (
          <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
            <p>{error}</p>
            <button type="button" onClick={refresh} className="underline">
              {t("rsvp.reloadLatest")}
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
            {notice}
          </p>
        )}
        <Button type="submit" disabled={saving} className="w-full">
          {saving
            ? t("rsvp.sending")
            : rsvp.locked
              ? t("rsvp.requestChange")
              : rsvp.rsvpId
                ? t("rsvp.updateAnswer")
                : t("rsvp.submitAnswer")}
        </Button>
      </form>
    </div>
  );
}
