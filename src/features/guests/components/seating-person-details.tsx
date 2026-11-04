"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import type { SeatingParty } from "../utils/seating-demo";
import { formatGuestSide, formatRecipientLabel } from "../utils/seating-demo-i18n";
import { type AttendanceStatus, type SeatPerson } from "../utils/seating-attendance";
import type { Language } from "@/i18n/config";

export function RsvpBadge({ person }: { person?: SeatPerson }) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "seatingDemo" });
  const tone =
    person?.attendanceStatus === "ATTENDING"
      ? "bg-emerald-100 text-emerald-900"
      : person?.attendanceStatus === "DECLINED"
        ? "bg-rose-100 text-rose-900"
        : person?.attendanceStatus === "WAITLISTED"
          ? "bg-amber-100 text-amber-900"
          : "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] ${tone}`}>
      {person ? t(`status.${person.attendanceStatus}`) : t("noNameYet")}
    </span>
  );
}

export function SeatingPersonDetails({
  party,
  person,
  table,
  seat,
  onSave,
}: {
  party: SeatingParty;
  person?: SeatPerson;
  table: number | null | undefined;
  seat: number | undefined;
  onSave: (input: Omit<SeatPerson, "id">) => string | null;
}) {
  const { t, i18n } = useTranslation("guestPlanning", { keyPrefix: "seatingDemo" });
  const language = (i18n.resolvedLanguage === "en" ? "en" : "vi") as Language;
  const [name, setName] = useState(person?.fullName ?? "");
  const [type, setType] = useState<SeatPerson["type"]>(person?.type ?? "OTHER");
  const [attendance, setAttendance] = useState<AttendanceStatus>(
    person?.attendanceStatus ?? "PENDING",
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">
          {table === null || table === undefined
            ? t("notSeated")
            : `${t("tableName", { number: table + 1 })}${seat !== undefined ? ` · ${t("seatNumber", { number: seat })}` : ""}`}
        </p>
        <h2 className="mt-2 break-words font-serif text-xl">{person?.fullName || t("notNamed")}</h2>
        <div className="mt-2">
          <RsvpBadge person={person} />
        </div>
      </div>
      <dl className="space-y-3 text-xs">
        <div>
          <dt className="text-muted-foreground">{t("details.groupRecipient")}</dt>
          <dd className="mt-1">{formatRecipientLabel(party, language)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("details.guestGroup")}</dt>
          <dd className="mt-1">{party.group}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("details.guestSide")}</dt>
          <dd className="mt-1">{formatGuestSide(party.side, t)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("details.role")}</dt>
          <dd className="mt-1">{person ? t(`role.${person.type}`) : t("notDeclared")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("details.contact")}</dt>
          <dd className="mt-1">{party.phone || t("noPhone")}</dd>
        </div>
      </dl>
      {!person && (
        <p className="rounded-lg border border-dashed p-3 text-xs leading-5 text-muted-foreground">
          {t("details.unnamedHelp")}
        </p>
      )}
      {person?.attendanceStatus === "DECLINED" && (
        <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-900">
          {t("details.declinedHelp")}
        </p>
      )}
      <details className="border-t pt-4" open={!person}>
        <summary className="cursor-pointer text-sm font-medium">
          {person ? t("details.editRsvp") : t("details.addGuest")}
        </summary>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const message = onSave({ fullName: name, type, attendanceStatus: attendance });
            setError(message ?? "");
            setSaved(!message);
          }}
        >
          <p className="text-xs leading-5 text-muted-foreground">{t("details.previewOnlyHelp")}</p>
          <label className="block space-y-1 text-xs">
            <span>{t("details.fullName")}</span>
            <input
              required
              maxLength={150}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <label className="block space-y-1 text-xs">
            <span>{t("details.memberRole")}</span>
            <select
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={type}
              disabled={person?.type === "PRIMARY"}
              onChange={(e) => {
                setType(e.target.value as SeatPerson["type"]);
                setSaved(false);
              }}
            >
              {(["PRIMARY", "SPOUSE", "CHILD", "OTHER"] as const)
                .filter((key) => key !== "PRIMARY" || person?.type === "PRIMARY")
                .map((key) => (
                  <option key={key} value={key}>
                    {t(`role.${key}`)}
                  </option>
                ))}
            </select>
          </label>
          <label className="block space-y-1 text-xs">
            <span>{t("details.rsvpStatus")}</span>
            <select
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={attendance}
              onChange={(e) => {
                setAttendance(e.target.value as AttendanceStatus);
                setSaved(false);
              }}
            >
              {(["PENDING", "ATTENDING", "DECLINED", "WAITLISTED"] as const).map((key) => (
                <option key={key} value={key}>
                  {t(`status.${key}`)}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-xs text-emerald-800">
              {t("details.updated")}
            </p>
          )}
          <Button type="submit" className="w-full">
            {t("details.updatePreview")}
          </Button>
        </form>
      </details>
    </div>
  );
}
