import type { Language } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import type { SeatingParty, SeatingStrategy } from "./seating-demo";

type Translate = (key: string) => string;

export function formatSeatingNumber(value: number, language: Language) {
  return formatNumber(value, language);
}

export function formatRecipientLabel(
  party: Pick<SeatingParty, "name" | "address">,
  language: Language,
) {
  const address = party.address ? `${party.address.toLocaleLowerCase(language)} ` : "";
  const label = `${address}${party.name}`;
  return label.charAt(0).toLocaleUpperCase(language) + label.slice(1);
}

export function formatGuestSide(side: string | undefined, t: Translate) {
  if (!side) return t("noSide");
  const translated: Record<string, string> = {
    "Nhà gái": "sideValues.BRIDE",
    "Nhà trai": "sideValues.GROOM",
    "Cả hai": "sideValues.MUTUAL",
    Chung: "sideValues.MUTUAL",
    "Chưa xác định": "sideValues.UNSPECIFIED",
    BRIDE: "sideValues.BRIDE",
    GROOM: "sideValues.GROOM",
    MUTUAL: "sideValues.MUTUAL",
    UNSPECIFIED: "sideValues.UNSPECIFIED",
  };
  const key = translated[side];
  return key ? t(key) : side;
}

export function seatingStrategyLabel(strategy: SeatingStrategy, t: Translate) {
  return t(`${strategy}.label`);
}
