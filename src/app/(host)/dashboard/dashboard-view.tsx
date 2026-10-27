"use client";

import { useCurrentUser } from "@/features/auth";
import { HostDashboard } from "@/features/weddings";

export function DashboardView() {
  const { user } = useCurrentUser();
  return <HostDashboard user={user} />;
}
