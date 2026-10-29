import { formatCurrency } from "@/i18n/format";
import type { Language } from "@/i18n/config";
import type { AppNotification } from "../api/notifications.api";

type Translate = (key: string, options?: Record<string, unknown>) => string;

const text = (value: unknown) => (typeof value === "string" ? value : "");
const count = (value: unknown) => (typeof value === "number" ? value : 0);

/** One line of the bell, in the viewer's language. Data comes from the backend payload of each kind. */
export function notificationText(item: AppNotification, t: Translate, language: Language): string {
  const d = item.data;
  const decision = ["ATTENDING", "MAYBE", "DECLINED"].includes(text(d.decision))
    ? text(d.decision)
    : "ATTENDING";
  const amount = typeof d.amount === "number" ? formatCurrency(d.amount, language) : t("noAmount");
  const values = {
    name: text(d.guestName) || t("aGuest"),
    giver: text(d.giverName) || t("aGuest"),
    people: count(d.people),
    max: count(d.maxPeople),
    amount,
  };
  switch (item.type) {
    case "RSVP_SUBMITTED":
      return t(`rsvpSubmitted.${decision}`, values);
    case "RSVP_UPDATED":
      return t(`rsvpUpdated.${decision}`, values);
    case "RSVP_OVER_LIMIT":
      return t("rsvpOverLimit", values);
    case "RSVP_CHANGE_REQUESTED":
      return t(`rsvpChangeRequested.${decision}`, values);
    case "GIFT_CLAIMED":
      return t("giftClaimed", values);
    case "GIFT_DESK_PENDING":
      return t(text(d.method) === "CASH" ? "giftDeskEnvelope" : "giftDeskTransfer", values);
    default:
      return t("generic");
  }
}

/** Where a click goes: the RSVP list, the change requests page or the gift book of that wedding. */
export function notificationHref(item: AppNotification): string {
  const wedding = `/weddings/${encodeURIComponent(item.weddingId)}`;
  if (item.type === "RSVP_CHANGE_REQUESTED") return `${wedding}/waitlist`;
  if (item.type.startsWith("RSVP_")) return `${wedding}/rsvp`;
  if (item.type.startsWith("GIFT_")) return `${wedding}/gifts`;
  return wedding;
}
