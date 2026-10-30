import { Check, UserRound, UsersRound, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { sideLabels } from "../api/planning.api";
import type { SeatingPlan } from "../api/planning-seating.api";
import type { seatingDropFeedback } from "../utils/seating-drag-preview";
import { queuePlaceName } from "./seating-queue";

export function SeatingDragPreview({
  plan,
  ids,
  feedback,
}: {
  plan: SeatingPlan;
  ids: string[];
  feedback: ReturnType<typeof seatingDropFeedback>;
}) {
  const place = plan.places.find((p) => p.id === ids[0]);
  const guest = plan.guests.find((g) => g.id === place?.guestId);
  if (!place || !guest) return null;
  const group = ids.length > 1;
  const title = group
    ? `${guest.invitationKind === "FAMILY" ? "Gia đình" : "Nhóm"} ${guest.honorific ? guest.honorific.toLocaleLowerCase("vi") + " " : ""}${guest.recipientName}`
    : queuePlaceName(place, guest);
  const initial = title.trim().split(/\s+/).at(-1)?.slice(0, 1);
  const Icon = group ? UsersRound : UserRound;
  return (
    <div
      className="pointer-events-none relative w-[240px] max-w-[75vw] -rotate-2 select-none"
      aria-hidden="true"
    >
      {group && (
        <>
          <div className="absolute inset-0 translate-x-2 translate-y-2 rotate-3 rounded-xl border border-primary/25 bg-card shadow-sm" />
          <div className="absolute inset-0 translate-x-1 translate-y-1 rotate-1 rounded-xl border border-primary/30 bg-card" />
        </>
      )}
      <div
        className={cn(
          "relative rounded-xl border-2 bg-white px-3 py-2.5 shadow-xl",
          feedback ? (feedback.valid ? "border-primary" : "border-red-400") : "border-primary/30",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold">
            {group ? <Icon className="size-5 text-primary" /> : initial}
            {!group && (
              <UserRound className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white text-primary" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-xs font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{sideLabels[guest.side]}</p>
          </div>
          {group && (
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold">
              ×{ids.length}
            </span>
          )}
        </div>
        {feedback && (
          <p
            className={cn(
              "mt-2 flex items-center gap-1.5 border-t pt-2 text-[11px] font-medium",
              feedback.valid ? "text-foreground" : "text-red-700",
            )}
          >
            {feedback.valid ? (
              <Check className="size-3.5 shrink-0 text-primary" />
            ) : (
              <X className="size-3.5 shrink-0" />
            )}
            {feedback.message}
          </p>
        )}
      </div>
    </div>
  );
}
