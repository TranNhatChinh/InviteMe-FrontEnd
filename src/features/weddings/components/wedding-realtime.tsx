"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useRuntime } from "@/core/config/runtime";
import { StatusBadge } from "@/shared/components/status-badge";
import { weddingKeys } from "../api/wedding.keys";
import { REALTIME_EVENTS } from "@/core/realtime/realtime-events";
export function WeddingRealtime({ weddingId }: { weddingId: string }) {
  const { realtime, queryClient } = useRuntime();
  const status = useSyncExternalStore(
    realtime.subscribe,
    realtime.getStatus,
    realtime.getServerStatus,
  );
  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: weddingKeys.detail(weddingId) });
      void queryClient.invalidateQueries({ queryKey: weddingKeys.lists() });
    };
    const invalidateGuests = () => {
      void queryClient.invalidateQueries({ queryKey: ["host-rsvp", weddingId] });
      void queryClient.invalidateQueries({ queryKey: ["guests", weddingId] });
      void queryClient.invalidateQueries({ queryKey: ["guest-planning", weddingId] });
      void queryClient.invalidateQueries({ queryKey: ["guest-planning-detail", weddingId] });
      void queryClient.invalidateQueries({ queryKey: ["guest-planning-groups", weddingId] });
      void queryClient.invalidateQueries({ queryKey: ["co-hosts", weddingId, "groups"] });
      invalidate();
    };
    const invalidateRsvp = () => {
      void queryClient.invalidateQueries({ queryKey: ["host-rsvp", weddingId] });
      invalidateGuests();
      void queryClient.invalidateQueries({ queryKey: ["check-in-summary", weddingId] });
    };
    const invalidateSeating = () => {
      void queryClient.invalidateQueries({ queryKey: ["planning-seating", weddingId] });
    };
    const invalidatePublication = () => {
      void queryClient.invalidateQueries({ queryKey: ["website", weddingId] });
      void queryClient.invalidateQueries({ queryKey: ["invitation-design", weddingId] });
      void queryClient.invalidateQueries({ queryKey: ["invitation-wording", weddingId] });
    };
    const unsubscribers = [
      realtime.onResync(() => {
        invalidateRsvp();
        invalidateSeating();
        invalidatePublication();
      }),
      realtime.on(REALTIME_EVENTS.capacity, invalidate),
      realtime.on(REALTIME_EVENTS.rsvp, invalidateRsvp),
      realtime.on(REALTIME_EVENTS.waitlist, invalidateRsvp),
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
