"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Heart, Mail, Users, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRuntime } from "@/core/config/runtime";
import { PageHeader } from "@/shared/components/page-header";
import { ErrorState } from "@/shared/feedback/error-state";
import { LoadingState } from "@/shared/feedback/loading-state";
import { formatDate, formatNumber } from "@/i18n/format";
import { useLocale } from "@/i18n/language-context";
import { adminApi } from "../api/admin.api";

const quickLinks = [
  ["accounts", "/admin/users", "reviewAccounts", "ADMIN_USERS_VIEW"],
  ["weddings", "/admin/weddings", "searchWeddings", "ADMIN_WEDDINGS_VIEW"],
  ["templates", "/admin/templates", "manageTemplates", "ADMIN_TEMPLATES_VIEW"],
  ["storyTemplates", "/admin/story-templates", "manageStoryTemplates", "ADMIN_TEMPLATES_VIEW"],
  ["plans", "/admin/plans", "managePlans", "ADMIN_PLANS_MANAGE"],
  ["rolesPermissions", "/admin/access-control", "reviewPermissions", "ADMIN_RBAC_VIEW"],
  ["auditLogs", "/admin/audit-logs", "reviewAudit", "ADMIN_AUDIT_VIEW"],
] as const;
type Metric = { label: string; value: number; detail: string; icon: LucideIcon };

export function AdminDashboard() {
  const { t } = useTranslation("admin");
  const { language } = useLocale();
  const { api } = useRuntime();
  const dashboard = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: ({ signal }) => adminApi.dashboard(api, signal),
  });
  const permissions = useQuery({
    queryKey: ["admin-my-permissions"],
    queryFn: ({ signal }) => adminApi.myPermissions(api, signal),
  });
  const recentActivity = useQuery({
    queryKey: ["admin-dashboard-recent-audit"],
    queryFn: ({ signal }) => adminApi.auditLogs(api, { page: 1, pageSize: 5 }, signal),
    enabled: permissions.data?.includes("ADMIN_AUDIT_VIEW") ?? false,
    staleTime: 30_000,
  });
  const visibleQuickLinks = quickLinks.filter(([, , , permission]) =>
    permissions.data?.includes(permission),
  );
  return (
    <div className="space-y-8">
      <PageHeader title={t("dashboardTitle")} description={t("dashboardDescription")} />
      {dashboard.isPending && <LoadingState label={t("loadingOverview")} />}
      {dashboard.isError && (
        <ErrorState error={dashboard.error} retry={() => void dashboard.refetch()} />
      )}
      {dashboard.data && (
        <>
          <section
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            aria-label={t("platformMetrics")}
          >
            {(
              [
                {
                  label: "accounts",
                  value: dashboard.data.totalAccounts,
                  detail: `${formatNumber(dashboard.data.activeAccounts, language)} ${t("active")} · ${formatNumber(dashboard.data.suspendedAccounts, language)} ${t("suspended")}`,
                  icon: Users,
                },
                {
                  label: "weddings",
                  value: dashboard.data.totalWeddings,
                  detail: `${formatNumber(dashboard.data.draftWeddings, language)} ${t("draftCount")} · ${formatNumber(dashboard.data.publishedWeddings, language)} ${t("published")} · ${formatNumber(dashboard.data.closedWeddings, language)} ${t("closed")}`,
                  icon: CalendarDays,
                },
                {
                  label: "weddingGuests",
                  value: dashboard.data.activeGuests,
                  detail: t("activeGuestRecords"),
                  icon: Heart,
                },
                {
                  label: "invitationsSent",
                  value: dashboard.data.invitationsSent,
                  detail: t("successfulMessages"),
                  icon: Mail,
                },
              ] satisfies Metric[]
            ).map(({ label, value, detail, icon: Icon }) => (
              <article key={label} className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm text-muted-foreground">{t(label)}</h2>
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                </div>
                <p className="mt-4 text-3xl font-semibold tabular-nums">
                  {formatNumber(value, language)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
              </article>
            ))}
          </section>
          <section
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
            aria-label={t("adminAreas")}
          >
            {visibleQuickLinks.map(([titleKey, href, descriptionKey]) => (
              <Link
                key={href}
                href={href}
                className="group rounded-2xl border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">{t(titleKey)}</h2>
                  <ArrowRight
                    className="size-4 text-primary transition group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(descriptionKey)}</p>
              </Link>
            ))}
          </section>
          {permissions.data?.includes("ADMIN_AUDIT_VIEW") && (
            <section className="space-y-3" aria-labelledby="admin-recent-activity">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 id="admin-recent-activity" className="text-lg font-semibold">
                    {t("recentActivity")}
                  </h2>
                  <p className="text-sm text-muted-foreground">{t("recentActivityDescription")}</p>
                </div>
                <Link
                  href="/admin/audit-logs"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {t("viewAuditLog")}
                </Link>
              </div>
              {recentActivity.isPending && <LoadingState label={t("loadingAuditSummary")} />}
              {recentActivity.isError && (
                <ErrorState
                  error={recentActivity.error}
                  retry={() => void recentActivity.refetch()}
                />
              )}
              {recentActivity.data &&
                (recentActivity.data.items.length ? (
                  <div className="divide-y rounded-2xl border bg-card">
                    {recentActivity.data.items.map((item) => (
                      <article
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-4"
                      >
                        <div>
                          <p className="font-medium">{item.action.replaceAll("_", " ")}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {item.actorName || item.actorEmail || item.actorType} ·{" "}
                            {item.entityType}
                            {item.weddingTitle ? ` · ${item.weddingTitle}` : ""}
                          </p>
                        </div>
                        <time className="text-sm text-muted-foreground" dateTime={item.createdAt}>
                          {formatDate(item.createdAt, language, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </time>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
                    {t("noRecentActivity")}
                  </p>
                ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
