"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRuntime } from "@/core/config/runtime";
import { DashboardShell, type NavigationGroup } from "@/shared/layout/dashboard-shell";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { adminApi } from "../api/admin.api";

const completeNavigation: (NavigationGroup & { permission: string })[] = [
  {
    label: "Overview",
    permission: "ADMIN_DASHBOARD_VIEW",
    items: [{ href: "/admin", label: "Dashboard", icon: "dashboard" }],
  },
  {
    label: "Management",
    permission: "ADMIN_USERS_VIEW",
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
    permission: "ADMIN_RBAC_VIEW",
    items: [
      { href: "/admin/access-control", label: "Roles & permissions", icon: "permissions" },
      { href: "/admin/audit-logs", label: "Audit logs", icon: "audit" },
    ],
  },
];

const itemPermissions: Record<string, string> = {
  "/admin": "ADMIN_DASHBOARD_VIEW",
  "/admin/users": "ADMIN_USERS_VIEW",
  "/admin/weddings": "ADMIN_WEDDINGS_VIEW",
  "/admin/templates": "ADMIN_TEMPLATES_VIEW",
  "/admin/story-templates": "ADMIN_TEMPLATES_VIEW",
  "/admin/plans": "ADMIN_PLANS_MANAGE",
  "/admin/access-control": "ADMIN_RBAC_VIEW",
  "/admin/audit-logs": "ADMIN_AUDIT_VIEW",
};

export function AdminPortalShell({
  children,
  account,
}: {
  children: ReactNode;
  account: ReactNode;
}) {
  const { api } = useRuntime();
  const { t } = useTranslation("admin");
  const pathname = usePathname();
  const router = useRouter();
  const permissions = useQuery({
    queryKey: ["admin-my-permissions"],
    queryFn: ({ signal }) => adminApi.myPermissions(api, signal),
    staleTime: 60_000,
    retry: false,
  });
  const navigation = useMemo(() => {
    if (!permissions.data) return [];
    return completeNavigation.flatMap(({ label, items }) => {
      const visibleItems = items.filter((item) => {
        const permission = itemPermissions[item.href] ?? "ADMIN_DASHBOARD_VIEW";
        return permissions.data?.includes(permission) ?? false;
      });
      return visibleItems.length ? [{ label, items: visibleItems }] : [];
    });
  }, [permissions.data]);
  const firstDestination = navigation.flatMap((group) => group.items)[0]?.href;
  const requiredPermission = itemPermissions[pathname];

  useEffect(() => {
    if (pathname === "/admin" && firstDestination && firstDestination !== "/admin") {
      router.replace(firstDestination);
    }
  }, [firstDestination, pathname, router]);

  if (permissions.isPending) return <LoadingState label={t("loadingAdminAccess")} />;
  if (permissions.isError)
    return <ErrorState error={permissions.error} retry={() => void permissions.refetch()} />;
  if (!navigation.length)
    return (
      <main className="mx-auto max-w-xl px-5 py-16 text-center">
        <h1 className="font-display text-2xl">{t("noAdminPermissionsTitle")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("noAdminPermissionsDescription")}
        </p>
      </main>
    );
  if (pathname === "/admin" && firstDestination !== "/admin")
    return <LoadingState label={t("openingAllowedAdminArea")} />;
  if (requiredPermission && !permissions.data.includes(requiredPermission))
    return (
      <DashboardShell
        title="Administration"
        homeHref={firstDestination ?? "/admin"}
        account={account}
        navigation={navigation}
      >
        <main className="mx-auto max-w-xl px-5 py-16 text-center">
          <h1 className="font-display text-2xl">{t("accessDeniedTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("accessDeniedDescription")}
          </p>
        </main>
      </DashboardShell>
    );

  return (
    <DashboardShell
      title="Administration"
      homeHref={firstDestination ?? "/admin"}
      account={account}
      navigation={navigation}
    >
      {children}
    </DashboardShell>
  );
}
