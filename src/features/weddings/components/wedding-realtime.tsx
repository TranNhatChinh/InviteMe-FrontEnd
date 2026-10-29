"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useRuntime } from "@/core/config/runtime";
import { StatusBadge } from "@/shared/components/status-badge";
import { weddingKeys } from "../api/wedding.keys";
import { REALTIME_EVENTS } from "@/core/realtime/realtime-events";
import { staleForResync } from "@/core/realtime/resync";
export function WeddingRealtime({ weddingId }: { weddingId: string }) {
  const { realtime, queryClient } = useRuntime();
  const status = useSyncExternalStore(
    realtime.subscribe,
    realtime.getStatus,
    realtime.getServerStatus,
  );
  useEffect(() => {
    // since: see staleForResync; realtime events always refetch.
    const refresh = (queryKey: readonly unknown[], since: number | null) =>
      void queryClient.invalidateQueries({ queryKey, predicate: staleForResync(since) });
    const invalidate = (since: number | null = null) => {
      refresh(weddingKeys.detail(weddingId), since);
      refresh(weddingKeys.lists(), since);
    };
    const invalidateGuests = (since: number | null = null) => {
      refresh(["host-rsvp", weddingId], since);
      refresh(["guests", weddingId], since);
      refresh(["guest-planning", weddingId], since);
      refresh(["guest-planning-detail", weddingId], since);
      refresh(["guest-planning-groups", weddingId], since);
      refresh(["co-hosts", weddingId, "groups"], since);
      invalidate(since);
    };
    const invalidateRsvp = (since: number | null = null) => {
      refresh(["host-rsvp", weddingId], since);
      invalidateGuests(since);
      refresh(["check-in-summary", weddingId], since);
    };
    const invalidateSeating = (since: number | null = null) => {
      refresh(["planning-seating", weddingId], since);
    };
    const invalidatePublication = (since: number | null = null) => {
      refresh(["website", weddingId], since);
      refresh(["invitation-design", weddingId], since);
      refresh(["invitation-wording", weddingId], since);
    };
    const unsubscribers = [
      realtime.onResync((since) => {
        invalidateRsvp(since);
        invalidateSeating(since);
        invalidatePublication(since);
      }),
      realtime.on(REALTIME_EVENTS.capacity, () => invalidate()),
      realtime.on(REALTIME_EVENTS.rsvp, () => invalidateRsvp()),
      realtime.on(REALTIME_EVENTS.waitlist, () => invalidateRsvp()),
      realtime.onPlanningChange((change) => {
        if (change.type === "WeddingSetupChanged") invalidate();
        if (change.type.startsWith("WeddingWebsite") || change.type.startsWith("Invitation"))
          invalidatePublication();
        if (change.type.startsWith("Rsvp")) invalidateRsvp();
        // RSVP answers and gifts may have added a bell notification for this account (notifications feature key).
        if (change.type.startsWith("Rsvp") || change.type.startsWith("Gift"))
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        if (
          change.type === "PlanningGuestCreated" ||
          change.type === "PlanningGuestArchived" ||
          change.type === "PlanningGuestUpdated" ||
          change.type === "PlanningGuestRestored"
        ) {
          invalidateGuests();
          invalidateSeating();
        }
        if (change.type === "PlanningGuestsImported") invalidateRsvp();
        if (change.type === "PlanningWalkInAdded") invalidateRsvp();
        if (change.type === "GuestCheckedIn" || change.type === "GuestCheckInVoided")
          void queryClient.invalidateQueries({ queryKey: ["check-in-summary", weddingId] });
        if (
          change.type === "PlanningSeatingChanged" ||
          change.type === "PlanningGuestsImported" ||
          change.type === "PlanningSeatingNeedsAttention" ||
          change.type === "PlanningWalkInAdded"
        )
          invalidateSeating();
        if (change.type === "PlanningSeatingNeedsAttention") {
          invalidateRsvp();
        }
      }),
    ];
    void realtime.activate(weddingId);
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      void realtime.activate(null);
    };
  }, [weddingId, realtime, queryClient]);
  return (
    <StatusBadge
      tone={status === "connected" ? "success" : "neutral"}
      label={
        status === "connected"
          ? "Live updates connected"
          : status === "disabled"
            ? "Live updates unavailable"
            : "Live updates reconnecting"
      }
    />
  );
}
