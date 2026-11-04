import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import type { SeatingParty, SeatingPlan } from "../utils/seating-demo";
import { placeKey, tablePlaces, type SeatPeople } from "../utils/seating-attendance";
import { RsvpBadge } from "./seating-person-details";
import { formatNumber } from "@/i18n/format";
import type { Language } from "@/i18n/config";
import { formatRecipientLabel } from "../utils/seating-demo-i18n";

export function SeatingTableDetails({
  table,
  capacity,
  parties,
  plan,
  people,
  onSelect,
}: {
  table: number;
  capacity: number;
  parties: SeatingParty[];
  plan: SeatingPlan;
  people: SeatPeople;
  onSelect: (partyId: string, place: number) => void;
}) {
  const { t, i18n } = useTranslation("guestPlanning", { keyPrefix: "seatingDemo" });
  const language = (i18n.resolvedLanguage === "en" ? "en" : "vi") as Language;
  const places = tablePlaces(parties, plan, table);
  const confirmed = places.filter(
    ({ party, place }) => people[placeKey(party.id, place)]?.attendanceStatus === "ATTENDING",
  ).length;
  const unnamed = places.filter(({ party, place }) => !people[placeKey(party.id, place)]).length;
  return (
    <div className="mt-4 space-y-4">
      <h2 className="font-serif text-2xl">
        {t("guestsAt", { table: t("tableName", { number: table + 1 }) })}
      </h2>
      <p className="text-xs leading-5 text-muted-foreground">
        {t("seatsHeld", {
          occupied: formatNumber(places.length, language),
          capacity: formatNumber(capacity, language),
        })}{" "}
        · {formatNumber(confirmed, language)} {t("confirmed")} · {formatNumber(unnamed, language)}{" "}
        {t("unnamedCount").toLocaleLowerCase(language)}.
      </p>
      {!places.length && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {t("noGuestAtTable")}
        </p>
      )}
      <ol className="space-y-2">
        {places.map(({ party, place }, index) => {
          const person = people[placeKey(party.id, place)];
          return (
            <li key={placeKey(party.id, place)}>
              <Button
                variant="ghost"
                className="h-auto w-full justify-start whitespace-normal rounded-xl border px-3 py-3 text-left"
                onClick={() => onSelect(party.id, place)}
              >
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t("seatNumber", { number: formatNumber(index + 1, language) })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm">
                    {person?.fullName || t("notNamed")}
                  </span>
                  <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                    {formatRecipientLabel(party, language)}
                  </span>
                  <span className="mt-2 block">
                    <RsvpBadge person={person} />
                  </span>
                </span>
              </Button>
            </li>
          );
        })}
      </ol>
      <p className="text-xs leading-5 text-muted-foreground">{t("clickRowHelp")}</p>
    </div>
  );
}
