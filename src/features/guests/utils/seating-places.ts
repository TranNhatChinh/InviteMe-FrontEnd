import type { PlanningSeatingPlace } from "../api/planning-seating.api";
import type { PlanningGuest } from "../api/planning.api";

/**
 * Same rule as the backend (PlanningSeatingRules.NeedsSeat): a declined person needs no seat, and neither does a place with
 * nobody on it once the invitation answered Có / Không (RSVP marked it UNUSED). Unanswered and MAYBE invitations keep every place.
 */
export function placeNeedsSeat(place: PlanningSeatingPlace, guest?: Pick<PlanningGuest, "rsvpStatus">) {
  if (place.person) return place.person.attendanceStatus !== "DECLINED";
  return guest?.rsvpStatus !== "ATTENDING" && guest?.rsvpStatus !== "DECLINED";
}
