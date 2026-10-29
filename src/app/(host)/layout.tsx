import type { ReactNode } from "react";
import { AuthGuard, UserMenu } from "@/features/auth";
import { DashboardShell } from "@/shared/layout/dashboard-shell";
import { NotificationBell } from "@/features/notifications";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <DashboardShell
        title="Không gian làm việc"
        navigation={[
          {
            label: "Không gian làm việc",
            items: [{ href: "/dashboard", label: "Tổng quan", icon: "dashboard" }],
          },
          {
            label: "Lễ cưới",
            items: [{ href: "/weddings", label: "Tất cả lễ cưới", icon: "calendar" }],
          },
        ]}
        account={
          <>
            <NotificationBell />
            <UserMenu />
          </>
        }
      >
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}
