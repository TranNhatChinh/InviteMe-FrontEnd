"use client";

import { useQuery } from "@tanstack/react-query";
import { useRuntime } from "@/core/config/runtime";
import { getWeddingPlan, type WeddingPlanDto } from "../api/plans.api";

export type PlanEntitlement =
  | "coHosts"
  | "reminderRounds"
  | "aiThankYouRuns"
  | "checkin"
  | "giftQr"
  | "giftExport"
  | "customSlug"
  | "publicSeatLookup"
  | "guestPlaces"
  | "mediaImages"
  | "emailInvites"
  | "smsInvites"
  | "seatingTables";
export type PlanGateReason = "not-included" | "limit-reached";

export function useWeddingPlan(weddingId: string, enabled = true) {
  const { api } = useRuntime();
  return useQuery({
    queryKey: ["wedding-plan", weddingId],
    queryFn: ({ signal }) => getWeddingPlan(api, weddingId, signal),
    staleTime: 45_000,
    enabled,
  });
}

export function planEntitlementState(
  plan: WeddingPlanDto,
  entitlement: PlanEntitlement,
): { locked: boolean; reason?: PlanGateReason } {
  if (plan.legacy) return { locked: false };

  if (
    entitlement === "checkin" ||
    entitlement === "giftQr" ||
    entitlement === "giftExport" ||
    entitlement === "customSlug" ||
    entitlement === "publicSeatLookup"
  ) {
    return plan.limits[entitlement]
      ? { locked: false }
      : { locked: true, reason: "not-included" };
  }

  const limit = plan.limits[entitlement];
  if (limit === null) return { locked: false };
  if (limit <= 0) return { locked: true, reason: "not-included" };

  // Automatic RSVP reminders are included by the plan when at least one round is available.
  // Manual reminders consume rounds separately and are checked at their send action.
  if (entitlement === "reminderRounds") return { locked: false };

  const used = plan.usage[entitlement];
  return used >= limit ? { locked: true, reason: "limit-reached" } : { locked: false };
}

export function canSendManualReminder(plan: WeddingPlanDto) {
  if (plan.legacy) return true;
  const limit = plan.limits.reminderRounds;
  return limit === null || (limit > 0 && plan.usage.reminderRounds < limit);
}
