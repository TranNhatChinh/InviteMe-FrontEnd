"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getRsvpSettings, hostRsvpKeys } from "@/features/rsvp";
import { CheckInOverview, CheckInPermissionFallback, SeatLookupCounter } from "@/features/guests";
import { PlanEntitlementGate } from "@/features/plans";
import { usePermission } from "@/shared/components/permission-guard";
import { useRuntime } from "@/core/config/runtime";

type CheckInView = "desk" | "overview";

function CheckInDeskWorkspace({ weddingId }: { weddingId: string }) {
  const { api } = useRuntime();
  const settings = useQuery({
    queryKey: hostRsvpKeys.settings(weddingId),
    queryFn: ({ signal }) => getRsvpSettings(api, weddingId, signal),
  });

  return (
    <SeatLookupCounter
      weddingId={weddingId}
      walkInSettings={
        settings.data
          ? {
              rsvpCheckInPolicy: settings.data.rsvpCheckInPolicy,
              allowWalkIns: settings.data.allowWalkIns,
            }
          : null
      }
      walkInSettingsLoading={settings.isPending}
      walkInSettingsFailed={settings.isError}
    />
  );
}

export function CheckInWorkspaceClient({
  weddingId,
  initialView,
}: {
  weddingId: string;
  initialView: CheckInView;
}) {
  const { t } = useTranslation("guests");
  const router = useRouter();
  const { can } = usePermission();
  const canManageCheckIn = can("CHECKIN_MANAGE");
  const canViewOverview = can("RSVP_VIEW");
  const [activeView, setActiveView] = useState<CheckInView>(initialView);

  if (!canManageCheckIn && !canViewOverview) return <CheckInPermissionFallback />;

  const currentView: CheckInView = canManageCheckIn
    ? activeView
    : canViewOverview
      ? "overview"
      : "desk";

  function selectView(view: CheckInView) {
    setActiveView(view);
    const path = `/weddings/${encodeURIComponent(weddingId)}/check-in`;
    router.replace(view === "overview" ? `${path}?view=overview` : path, { scroll: false });
  }

  return (
    <div className="space-y-5">
      {canManageCheckIn && canViewOverview && (
        <div
          role="tablist"
          aria-label={t("checkIn.viewsLabel")}
          className="inline-flex max-w-full gap-1 rounded-xl border bg-muted/40 p-1"
        >
          {(
            [
              ["desk", t("checkIn.deskTab")],
              ["overview", t("checkIn.overviewTab")],
            ] as const
          ).map(([view, label]) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={currentView === view}
              className={`min-h-10 rounded-lg px-4 text-sm font-medium transition-colors ${
                currentView === view
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => selectView(view)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div role="tabpanel">
        {currentView === "overview" && canViewOverview ? (
          <PlanEntitlementGate weddingId={weddingId} entitlement="checkin">
            <CheckInOverview weddingId={weddingId} />
          </PlanEntitlementGate>
        ) : canManageCheckIn ? (
          <PlanEntitlementGate weddingId={weddingId} entitlement="checkin">
            <CheckInDeskWorkspace weddingId={weddingId} />
          </PlanEntitlementGate>
        ) : (
          <CheckInPermissionFallback />
        )}
      </div>
    </div>
  );
}
