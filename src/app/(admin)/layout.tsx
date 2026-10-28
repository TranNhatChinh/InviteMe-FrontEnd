import type { ReactNode } from "react";
import { AdminAuthGuard, UserMenu } from "@/features/auth";
import { DashboardShell } from "@/shared/layout/dashboard-shell";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdminAuthGuard>
      <DashboardShell
        title="Administration"
        homeHref="/admin"
        account={<UserMenu />}
        navigation={[
          {
            label: "Overview",
            items: [{ href: "/admin", label: "Dashboard", icon: "dashboard" }],
          },
          {
            label: "Management",
            items: [
              { href: "/admin/users", label: "Users", icon: "users" },
              { href: "/admin/weddings", label: "Weddings", icon: "weddings" },
              { href: "/admin/templates", label: "Templates", icon: "templates" },
              { href: "/admin/story-templates", label: "Story Templates", icon: "templates" },
              { href: "/admin/plans", label: "Plans", icon: "plans" },
            ],
          },
          {
            label: "Security",
            items: [
              { href: "/admin/access-control", label: "Roles & permissions", icon: "permissions" },
              { href: "/admin/audit-logs", label: "Audit logs", icon: "audit" },
            ],
          },
        ]}
      >
        {children}
      </DashboardShell>
    </AdminAuthGuard>
  );
}
