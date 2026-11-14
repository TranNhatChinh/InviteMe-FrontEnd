import { UserRoundPlus } from "lucide-react";

const colors = {
  ATTENDING: "border-green-600 bg-green-100 text-green-950",
  DECLINED: "border-red-500 bg-red-100 text-red-950",
  WAITLISTED: "border-amber-500 bg-amber-100 text-amber-950",
  PENDING: "border-stone-400 bg-stone-200 text-stone-900",
  EMPTY: "border-dashed border-stone-300 bg-white text-stone-900",
};
export type SeatBadgeStatus = keyof typeof colors;

export function SeatingSeatBadge({
  name,
  status,
  decorative = false,
}: {
  name?: string;
  status?: string;
  decorative?: boolean;
}) {
  const state =
    !name && !decorative
      ? "EMPTY"
      : status === "ATTENDING" ||
          status === "DECLINED" ||
          status === "WAITLISTED" ||
          status === "EMPTY"
        ? status
        : "PENDING";
  return (
    <span
      className={`pointer-events-none grid size-full place-items-center rounded-full border text-center ${colors[state]}`}
      title={name}
      aria-hidden={decorative || undefined}
    >
      {name ? (
        <span className="line-clamp-2 max-w-full break-words px-0.5 text-[8px] leading-tight">
          {name}
        </span>
      ) : state === "EMPTY" ? (
        <UserRoundPlus aria-hidden="true" className="size-4" />
      ) : null}
    </span>
  );
}
