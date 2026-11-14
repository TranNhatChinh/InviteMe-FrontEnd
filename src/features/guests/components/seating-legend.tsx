import { SeatingSeatBadge, type SeatBadgeStatus } from "./seating-seat-badge";
import Image from "next/image";
import { useTranslation } from "react-i18next";

const seats = [
  { image: "chair-confirmed.svg", label: "confirmed" },
  { image: "chair-pending.svg", label: "pending" },
  { image: "chair-empty.svg", label: "empty" },
];

const canvasSeats: { status: SeatBadgeStatus; label: string }[] = [
  { status: "ATTENDING", label: "confirmed" },
  { status: "PENDING", label: "pending" },
  { status: "DECLINED", label: "declined" },
  { status: "WAITLISTED", label: "waitlisted" },
  { status: "EMPTY", label: "empty" },
];

export function SeatingLegend({ canvas = false }: { canvas?: boolean }) {
  const { t } = useTranslation("guestPlanning", { keyPrefix: "seating.legend" });
  return (
    <ul
      aria-label={t("aria")}
      className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"
    >
      {canvas
        ? canvasSeats.map(({ status, label }) => (
            <li key={status} className="flex items-center gap-1.5">
              <span className="size-5 shrink-0">
                <SeatingSeatBadge status={status} decorative />
              </span>
              <span>{t(label)}</span>
            </li>
          ))
        : seats.map((seat) => (
            <li key={seat.image} className="flex items-center gap-2">
              <Image
                src={`/images/seating/${seat.image}`}
                alt=""
                width={24}
                height={28}
                className="h-7 w-6 shrink-0"
              />
              <span>{t(seat.label)}</span>
            </li>
          ))}
    </ul>
  );
}
